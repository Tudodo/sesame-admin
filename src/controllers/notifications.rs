use axum::extract::{Path, Query};
use axum::Extension;
use loco_rs::prelude::*;

use crate::data::permissions::require_authenticated;
use crate::middleware::tenant::TenantScope;
use crate::models::notifications;
use serde::Deserialize;

/// Create an in-app notification for a user — delegates to the model.
pub async fn notify_user(
    db: &sea_orm::DatabaseConnection,
    user_id: &str,
    title: &str,
    content: &str,
    notification_type: &str,
    link: Option<&str>,
    tenant_id: &str,
) {
    let _ = notifications::Model::notify_user(
        db,
        user_id,
        title,
        content,
        notification_type,
        link,
        tenant_id,
    )
    .await;
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/notifications")
        .add("/", get(list))
        .add("/unread-count", get(unread_count))
        .add("/{id}/read", post(mark_read))
        .add("/read-all", post(mark_all_read))
}

#[derive(Deserialize)]
struct NotificationQuery {
    #[serde(rename = "_start")]
    start: Option<usize>,
    #[serde(rename = "_end")]
    end: Option<usize>,
}

#[debug_handler]
async fn list(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Query(q): Query<NotificationQuery>,
) -> Result<Response> {
    // 通知为用户个人数据（按 pid 过滤），任何已认证用户都应能查看自己的通知，
    // 不应受 system:notif:read（管理员菜单权限）限制。
    require_authenticated(&auth)?;
    let pid = auth.claims.pid.to_string();
    let (start, limit) = crate::data::page_range(q.start, q.end);
    let (items, total) =
        notifications::Model::list_by_user(&ctx.db, &pid, &tenant.code, start as u64, limit as u64)
            .await
            .map_err(Error::wrap)?;
    let page = start.checked_div(limit).map(|p| p + 1).unwrap_or(0);
    format::json(serde_json::json!({
        "data": items,
        "total": total,
        "page": page,
        "page_size": limit,
    }))
}

#[debug_handler]
async fn unread_count(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_authenticated(&auth)?;
    let pid = auth.claims.pid.to_string();
    let count = notifications::Model::unread_count(&ctx.db, &pid, &tenant.code)
        .await
        .map_err(Error::wrap)?;
    format::json(serde_json::json!({"count": count}))
}

#[debug_handler]
async fn mark_read(
    auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_authenticated(&auth)?;
    let pid = auth.claims.pid.to_string();
    notifications::Model::mark_read(&ctx.db, id, &pid, &tenant.code)
        .await
        .map_err(Error::wrap)?;
    format::empty()
}

#[debug_handler]
async fn mark_all_read(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_authenticated(&auth)?;
    let pid = auth.claims.pid.to_string();
    notifications::Model::mark_all_read(&ctx.db, &pid, &tenant.code)
        .await
        .map_err(Error::wrap)?;
    format::empty()
}
