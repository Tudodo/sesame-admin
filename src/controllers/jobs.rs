use axum::{Extension, Json};
use loco_rs::prelude::*;
use serde::Deserialize;

use crate::data::permissions::require_platform_admin;
use crate::middleware::tenant::TenantScope;

/// Maximum emails per user within the rate-limit window.
const MAIL_MAX_PER_WINDOW: u32 = 10;
/// Rate-limit window for mail sending (1 hour).
const MAIL_WINDOW_SECS: u64 = 3600;
/// Maximum length for email subject and body to prevent resource abuse.
const MAIL_MAX_SUBJECT_LEN: usize = 200;
const MAIL_MAX_BODY_LEN: usize = 10_000;

/// Check whether a user has exceeded the mail-sending rate limit.
async fn mail_rate_limited(user_id: &str) -> Result<bool, loco_rs::Error> {
    let count =
        crate::data::shared_redis::incr_with_expiry("mail_rate", user_id, MAIL_WINDOW_SECS).await?;
    Ok(count > MAIL_MAX_PER_WINDOW as i64)
}

#[derive(Deserialize)]
struct SendMailRequest {
    to: String,
    subject: String,
    body_text: String,
    body_html: Option<String>,
}

#[derive(Deserialize)]
struct TriggerSyncRequest {
    sync_type: String,
    entity: String,
    extra: Option<String>,
}

#[debug_handler]
async fn send_mail(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(req): Json<SendMailRequest>,
) -> Result<Response> {
    require_platform_admin(
        &auth,
        &tenant.code,
        "system:job:create",
        "任务管理仅对平台租户管理员开放",
    )?;
    // Rate-limit by user to prevent abuse (spam / phishing).
    let user_id = auth.claims.pid.to_string();
    if mail_rate_limited(&user_id).await? {
        return Err(Error::BadRequest("发送频率过高，请稍后再试".to_string()));
    }
    // Validate input lengths to prevent resource abuse.
    if req.subject.len() > MAIL_MAX_SUBJECT_LEN {
        return Err(Error::BadRequest("邮件主题过长".to_string()));
    }
    if req.body_text.len() > MAIL_MAX_BODY_LEN {
        return Err(Error::BadRequest("邮件内容过长".to_string()));
    }
    // Validate recipient email format to avoid enqueuing undeliverable jobs.
    if !req.to.contains('@') || req.to.len() > 254 {
        return Err(Error::BadRequest("收件人邮箱格式无效".to_string()));
    }
    let queue = ctx
        .queue_provider
        .as_ref()
        .ok_or_else(|| Error::string("Queue not available"))?;
    queue
        .enqueue(
            crate::workers::mailer::MailerWorker::class_name(),
            None,
            crate::workers::mailer::MailerWorkerArgs {
                to: req.to,
                subject: req.subject,
                body_text: req.body_text,
                body_html: req.body_html,
            },
            None,
        )
        .await?;
    format::json(serde_json::json!({"ok": true, "msg": "邮件发送任务已提交"}))
}

#[debug_handler]
async fn trigger_sync(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(req): Json<TriggerSyncRequest>,
) -> Result<Response> {
    require_platform_admin(
        &auth,
        &tenant.code,
        "system:job:create",
        "任务管理仅对平台租户管理员开放",
    )?;
    // 配置化同步（sync_source:/sync_table: 前缀）只能由 sync_sources 控制器的
    // run_table_sync 入队，该接口会校验表格归属同步源并从数据库读取连接配置。
    // 此处若放行，任意 system:job:create 用户可构造任意连接 URL 与目标表，
    // 越权对本地库任意表执行 DELETE/INSERT，等价于数据篡改。
    if req.entity.starts_with("sync_source:") || req.entity.starts_with("sync_table:") {
        return Err(Error::BadRequest(
            "配置化同步请通过同步源管理接口触发".to_string(),
        ));
    }
    let queue = ctx
        .queue_provider
        .as_ref()
        .ok_or_else(|| Error::string("Queue not available"))?;
    queue
        .enqueue(
            crate::workers::syncer::SyncWorker::class_name(),
            None,
            crate::workers::syncer::SyncWorkerArgs {
                sync_type: req.sync_type,
                entity: req.entity,
                tenant_id: tenant.code.clone(),
                user_id: auth.claims.pid.to_string(),
                extra: req.extra,
            },
            None,
        )
        .await?;
    format::json(serde_json::json!({"ok": true, "msg": "同步任务已提交"}))
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/jobs")
        .add("/send-mail", post(send_mail))
        .add("/trigger-sync", post(trigger_sync))
}
