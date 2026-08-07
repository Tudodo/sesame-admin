use axum::Extension;
use loco_rs::prelude::*;
use redis::AsyncCommands;
use serde::Serialize;
use std::collections::{HashMap, HashSet};

use crate::data::permissions::require_platform_admin;
use crate::middleware::tenant::TenantScope;

const JOB_KEY_PREFIX: &str = "job:";
const QUEUE_KEY_PREFIX: &str = "queue:";
const PROCESSING_KEY_PREFIX: &str = "processing:";
const FAILED_KEY_PREFIX: &str = "failed:";
const CANCELLED_KEY_PREFIX: &str = "cancelled:";
const MAX_JOBS: usize = 1000;
const MAX_ADMIN_KEYS: usize = 10_000;

#[derive(Serialize, Clone)]
struct QueueJobInfo {
    id: String,
    name: String,
    queue: Option<String>,
    status: String,
    tags: Vec<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
    run_at: Option<String>,
}

#[derive(Serialize, Clone)]
struct QueueStats {
    connected: bool,
    provider: String,
    total: usize,
    queued: usize,
    processing: usize,
    completed: usize,
    failed: usize,
    cancelled: usize,
}

#[derive(Serialize, Clone)]
struct QueueInfo {
    jobs: Vec<QueueJobInfo>,
    stats: QueueStats,
}

fn redis_url() -> String {
    std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1".to_string())
}

async fn redis_connect() -> Result<redis::aio::MultiplexedConnection, Error> {
    let client = redis::Client::open(redis_url().as_str())
        .map_err(|e| Error::string(&format!("Redis连接失败: {e}")))?;
    client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| Error::string(&format!("Redis连接超时: {e}")))
}

fn redis_err(e: impl std::fmt::Display) -> Error {
    Error::string(&format!("Redis: {e}"))
}

fn status_label(status: &loco_rs::bgworker::JobStatus) -> &'static str {
    match status {
        loco_rs::bgworker::JobStatus::Queued => "queued",
        loco_rs::bgworker::JobStatus::Processing => "processing",
        loco_rs::bgworker::JobStatus::Completed => "completed",
        loco_rs::bgworker::JobStatus::Failed => "failed",
        loco_rs::bgworker::JobStatus::Cancelled => "cancelled",
    }
}

fn resolve_status(stored: &str, processing: bool, failed: bool, cancelled: bool) -> &'static str {
    if processing {
        "processing"
    } else if cancelled || stored == "cancelled" {
        "cancelled"
    } else if failed || stored == "failed" {
        "failed"
    } else if stored == "completed" {
        "completed"
    } else {
        "queued"
    }
}

fn validate_job_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric())
}

async fn scan_keys(
    conn: &mut redis::aio::MultiplexedConnection,
    pattern: &str,
    limit: usize,
) -> Result<Vec<String>, Error> {
    let mut keys = Vec::new();
    let mut cursor: u64 = 0;
    loop {
        let (next_cursor, batch): (u64, Vec<String>) = redis::cmd("SCAN")
            .arg(cursor)
            .arg("MATCH")
            .arg(pattern)
            .arg("COUNT")
            .arg(100)
            .query_async(&mut *conn)
            .await
            .map_err(redis_err)?;
        for key in batch {
            if keys.len() >= limit {
                break;
            }
            keys.push(key);
        }
        cursor = next_cursor;
        if cursor == 0 || keys.len() >= limit {
            break;
        }
    }
    Ok(keys)
}

fn to_job_info(job: loco_rs::bgworker::redis::Job) -> QueueJobInfo {
    let created_at = job.created_at.map(|v| v.to_rfc3339());
    let updated_at = job.updated_at.map(|v| v.to_rfc3339());
    let run_at = Some(job.run_at.to_rfc3339());
    let status = status_label(&job.status).to_string();
    QueueJobInfo {
        id: job.id,
        name: job.name,
        queue: None,
        status,
        tags: job.tags.unwrap_or_default(),
        created_at,
        updated_at,
        run_at,
    }
}

async fn fetch_queue_info(
    conn: &mut redis::aio::MultiplexedConnection,
) -> Result<QueueInfo, Error> {
    let mut jobs_by_id: HashMap<String, QueueJobInfo> = HashMap::new();
    for key in scan_keys(conn, "job:*", MAX_JOBS).await? {
        let id = key.strip_prefix(JOB_KEY_PREFIX).unwrap_or(&key).to_string();
        if id.is_empty() || jobs_by_id.contains_key(&id) {
            continue;
        }
        let raw: Option<String> = conn.get(&key).await.map_err(redis_err)?;
        if let Some(raw) = raw {
            if let Ok(job) = serde_json::from_str::<loco_rs::bgworker::redis::Job>(&raw) {
                jobs_by_id.insert(id, to_job_info(job));
            }
        }
    }

    let mut queue_of: HashMap<String, String> = HashMap::new();
    for key in scan_keys(conn, "queue:*", MAX_ADMIN_KEYS).await? {
        let queue_name = key
            .strip_prefix(QUEUE_KEY_PREFIX)
            .unwrap_or("default")
            .to_string();
        let ids: Vec<String> = conn.lrange(&key, 0, -1).await.map_err(redis_err)?;
        for id in ids {
            queue_of.entry(id).or_insert_with(|| queue_name.clone());
        }
    }

    let mut processing = HashSet::new();
    let mut failed = HashSet::new();
    let mut cancelled = HashSet::new();
    for (prefix, target) in [
        (PROCESSING_KEY_PREFIX, &mut processing),
        (FAILED_KEY_PREFIX, &mut failed),
        (CANCELLED_KEY_PREFIX, &mut cancelled),
    ] {
        for key in scan_keys(conn, &format!("{prefix}*"), MAX_ADMIN_KEYS).await? {
            let ids: Vec<String> = conn.smembers(&key).await.map_err(redis_err)?;
            target.extend(ids);
        }
    }

    let mut jobs: Vec<QueueJobInfo> = jobs_by_id.into_values().collect();
    for job in &mut jobs {
        if job.queue.is_none() {
            job.queue = queue_of.get(&job.id).cloned();
        }
        let stored = job.status.clone();
        job.status = resolve_status(
            &stored,
            processing.contains(&job.id),
            failed.contains(&job.id),
            cancelled.contains(&job.id),
        )
        .to_string();
    }
    jobs.sort_by(|a, b| {
        b.created_at
            .cmp(&a.created_at)
            .then_with(|| a.id.cmp(&b.id))
    });

    let mut stats = QueueStats {
        connected: true,
        provider: String::new(),
        total: jobs.len(),
        queued: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
    };
    for job in &jobs {
        match job.status.as_str() {
            "queued" => stats.queued += 1,
            "processing" => stats.processing += 1,
            "completed" => stats.completed += 1,
            "failed" => stats.failed += 1,
            "cancelled" => stats.cancelled += 1,
            _ => {}
        }
    }

    Ok(QueueInfo { jobs, stats })
}

async fn remove_job_membership(
    conn: &mut redis::aio::MultiplexedConnection,
    ids: &[String],
) -> Result<usize, Error> {
    if ids.is_empty() {
        return Ok(0);
    }
    let mut removed = 0usize;
    for prefix in [
        QUEUE_KEY_PREFIX,
        PROCESSING_KEY_PREFIX,
        FAILED_KEY_PREFIX,
        CANCELLED_KEY_PREFIX,
    ] {
        for key in scan_keys(conn, &format!("{prefix}*"), MAX_ADMIN_KEYS).await? {
            for id in ids {
                let n: i64 = if prefix == QUEUE_KEY_PREFIX {
                    redis::cmd("LREM")
                        .arg(&key)
                        .arg(1)
                        .arg(id)
                        .query_async(&mut *conn)
                        .await
                        .map_err(redis_err)?
                } else {
                    redis::cmd("SREM")
                        .arg(&key)
                        .arg(id)
                        .query_async(&mut *conn)
                        .await
                        .map_err(redis_err)?
                };
                removed += usize::try_from(n.max(0)).unwrap_or(0);
            }
        }
    }
    Ok(removed)
}

async fn is_processing(
    conn: &mut redis::aio::MultiplexedConnection,
    id: &str,
) -> Result<bool, Error> {
    for key in scan_keys(conn, "processing:*", MAX_ADMIN_KEYS).await? {
        let ids: Vec<String> = conn.smembers(&key).await.map_err(redis_err)?;
        if ids.iter().any(|existing| existing == id) {
            return Ok(true);
        }
    }
    Ok(false)
}

#[debug_handler]
async fn list_jobs(
    _auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_platform_admin(
        &_auth,
        &tenant.code,
        "system:job:read",
        "任务队列管理仅对平台租户管理员开放",
    )?;
    let mut conn = redis_connect().await?;
    let mut info = fetch_queue_info(&mut conn).await?;
    info.stats.provider = ctx
        .queue_provider
        .as_ref()
        .map(|queue| queue.describe())
        .unwrap_or_else(|| "未配置".to_string());
    format::json(info)
}

#[debug_handler]
async fn delete_job(
    _auth: auth::JWT,
    State(_ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Path(id): Path<String>,
) -> Result<Response> {
    require_platform_admin(
        &_auth,
        &tenant.code,
        "system:job:delete",
        "任务队列管理仅对平台租户管理员开放",
    )?;
    if !validate_job_id(&id) {
        return Err(Error::BadRequest("无效的任务 ID".to_string()));
    }
    let mut conn = redis_connect().await?;
    if is_processing(&mut conn, &id).await? {
        return Err(Error::BadRequest(
            "处理中的任务不能删除，请等待执行完成或失败".to_string(),
        ));
    }
    let job_key = format!("{JOB_KEY_PREFIX}{id}");
    let raw: Option<String> = conn.get(&job_key).await.map_err(redis_err)?;
    if raw.is_none() {
        return Err(Error::NotFound);
    }
    let deleted: i64 = conn.del(&job_key).await.map_err(redis_err)?;
    let membership_removed = remove_job_membership(&mut conn, std::slice::from_ref(&id)).await?;
    format::json(serde_json::json!({
        "ok": true,
        "deleted": deleted.max(0),
        "membership_removed": membership_removed,
    }))
}

#[debug_handler]
async fn clear_terminal_jobs(
    _auth: auth::JWT,
    State(_ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_platform_admin(
        &_auth,
        &tenant.code,
        "system:job:delete",
        "任务队列管理仅对平台租户管理员开放",
    )?;
    let mut conn = redis_connect().await?;
    let job_keys = scan_keys(&mut conn, "job:*", MAX_ADMIN_KEYS).await?;
    let mut terminal_ids = Vec::new();
    for key in job_keys {
        let raw: Option<String> = conn.get(&key).await.map_err(redis_err)?;
        if let Some(raw) = raw {
            if let Ok(job) = serde_json::from_str::<loco_rs::bgworker::redis::Job>(&raw) {
                if matches!(
                    job.status,
                    loco_rs::bgworker::JobStatus::Completed
                        | loco_rs::bgworker::JobStatus::Failed
                        | loco_rs::bgworker::JobStatus::Cancelled
                ) {
                    terminal_ids.push(job.id);
                }
            }
        }
    }

    let mut deleted = 0usize;
    for id in &terminal_ids {
        let key = format!("{JOB_KEY_PREFIX}{id}");
        let n: i64 = conn.del(&key).await.map_err(redis_err)?;
        deleted += usize::try_from(n.max(0)).unwrap_or(0);
    }
    let membership_removed = remove_job_membership(&mut conn, &terminal_ids).await?;
    format::json(serde_json::json!({
        "ok": true,
        "deleted": deleted,
        "membership_removed": membership_removed,
    }))
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/queue")
        .add("/", get(list_jobs))
        .add("/{id}", delete(delete_job))
        .add("/clear", post(clear_terminal_jobs))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_job_id() {
        assert!(validate_job_id("01JZ9XQK2FYWGNBVD7Q0Y20M2A"));
        assert!(!validate_job_id(""));
        assert!(!validate_job_id("../cache:test"));
        assert!(!validate_job_id(&"a".repeat(65)));
    }

    #[test]
    fn resolves_status_priority() {
        assert_eq!(resolve_status("queued", true, false, false), "processing");
        assert_eq!(resolve_status("queued", false, true, false), "failed");
        assert_eq!(resolve_status("failed", false, false, true), "cancelled");
        assert_eq!(resolve_status("queued", false, false, false), "queued");
    }
}
