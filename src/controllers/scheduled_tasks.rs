use crate::data::permissions::require_perm_code;
use crate::middleware::tenant::TenantScope;
use crate::models::_entities::{scheduled_task, scheduled_task_log};
use crate::models::scheduled_task_logs as sched_logs_model;
use crate::models::scheduled_tasks as tasks_model;
use crate::sched_handlers;
use axum::Extension;
use chrono::Utc;
use loco_rs::prelude::*;
use sea_orm::ActiveValue::Set;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct QueryParams {
    #[serde(rename = "_start")]
    start: Option<usize>,
    #[serde(rename = "_end")]
    end: Option<usize>,
}

#[debug_handler]
async fn list_tasks(
    _auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Query(q): Query<QueryParams>,
) -> Result<Response> {
    require_perm_code(&_auth, "system:sched:read")?;
    let (start, limit) = crate::data::page_range(q.start, q.end);
    let (items, total) =
        tasks_model::Model::list_paginated(&ctx.db, &tenant.code, start as u64, limit as u64)
            .await
            .map_err(Error::wrap)?;
    crate::data::paginated_response(&items, total)
}

#[debug_handler]
async fn get_task(
    _auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_perm_code(&_auth, "system:sched:read")?;
    let task = tasks_model::Model::find_by_id_in_tenant(&ctx.db, id, &tenant.code)
        .await
        .map_err(Error::wrap)?;
    format::json(task)
}

#[debug_handler]
async fn create_task(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(p): Json<tasks_model::TaskUpsertParams>,
) -> Result<Response> {
    require_perm_code(&auth, "system:sched:create")?;
    if sched_handlers::find(&p.handler).is_none() {
        return Err(Error::BadRequest(format!(
            "未注册的 handler: {}，请从下拉列表选择",
            p.handler
        )));
    }
    let m = tasks_model::Model::create_from(&ctx.db, &p, &tenant.code)
        .await
        .map_err(Error::wrap)?;
    format::json(m)
}

#[debug_handler]
async fn update_task(
    auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(p): Json<tasks_model::TaskUpsertParams>,
) -> Result<Response> {
    require_perm_code(&auth, "system:sched:update")?;
    if sched_handlers::find(&p.handler).is_none() {
        return Err(Error::BadRequest(format!(
            "未注册的 handler: {}，请从下拉列表选择",
            p.handler
        )));
    }
    let m = tasks_model::Model::update_from(&ctx.db, id, &tenant.code, &p)
        .await
        .map_err(Error::wrap)?;
    format::json(m)
}

#[debug_handler]
async fn delete_task(
    auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_perm_code(&auth, "system:sched:delete")?;
    tasks_model::Model::delete_in_tenant(&ctx.db, id, &tenant.code)
        .await
        .map_err(Error::wrap)?;
    format::empty()
}

#[debug_handler]
async fn trigger_task(
    _auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_perm_code(&_auth, "system:sched:update")?;
    let task = tasks_model::Model::find_by_id_in_tenant(&ctx.db, id, &tenant.code)
        .await
        .map_err(Error::wrap)?;

    // 从注册表查找 handler，找不到则拒绝执行（避免假成功）。
    let handler = sched_handlers::find(&task.handler).ok_or_else(|| {
        Error::BadRequest(format!(
            "handler '{}' 未注册，无法执行。请编辑任务改为已注册的 handler。",
            task.handler
        ))
    })?;

    let params = task
        .params
        .clone()
        .unwrap_or(serde_json::Value::Object(Default::default()));
    let start: DateTimeWithTimeZone = Utc::now().into();

    // 真实执行 handler，捕获成败分别写日志。
    let (status, output, error_message) = match handler.run(&ctx, &params, &tenant.code).await {
        Ok(out) => {
            let msg = serde_json::to_string(&out).unwrap_or_else(|_| out.message.clone());
            ("success".to_string(), Some(msg), None)
        }
        Err(e) => {
            let msg = format!("{e:?}");
            tracing::error!(task_id = task.id, handler = %task.handler, error = %msg, "scheduled handler failed");
            ("failed".to_string(), None, Some(msg))
        }
    };
    let now: DateTimeWithTimeZone = Utc::now().into();
    let log = scheduled_task_log::ActiveModel {
        task_id: Set(task.id),
        start_time: Set(start),
        end_time: Set(Some(now)),
        status: Set(status),
        output: Set(output),
        error_message: Set(error_message),
        tenant_id: Set(Some(tenant.code)),
        ..Default::default()
    }
    .insert(&ctx.db)
    .await?;

    let mut a: scheduled_task::ActiveModel = task.into();
    a.last_run_at = Set(Some(now));
    a.updated_at = Set(Utc::now().into());
    a.update(&ctx.db).await?;
    format::json(log)
}

/// 列出已注册的 handler，供前端新建/编辑任务时做下拉选择。
#[debug_handler]
async fn list_handlers(_auth: auth::JWT, State(_ctx): State<AppContext>) -> Result<Response> {
    require_perm_code(&_auth, "system:sched:read")?;
    format::json(sched_handlers::list_handlers())
}

#[derive(Deserialize)]
struct LogQuery {
    #[serde(rename = "_start")]
    start: Option<usize>,
    #[serde(rename = "_end")]
    end: Option<usize>,
    task_id: Option<i32>,
}

#[debug_handler]
async fn list_logs(
    _auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Query(q): Query<LogQuery>,
) -> Result<Response> {
    require_perm_code(&_auth, "system:sched:read")?;
    let (start, limit) = crate::data::page_range(q.start, q.end);
    let (items, total) = sched_logs_model::Model::list_paginated(
        &ctx.db,
        &tenant.code,
        q.task_id,
        start as u64,
        limit as u64,
    )
    .await
    .map_err(Error::wrap)?;
    crate::data::paginated_response(&items, total)
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/scheduled-tasks")
        .add("/", get(list_tasks))
        .add("/", post(create_task))
        .add("/{id}", get(get_task))
        .add("/{id}", put(update_task))
        .add("/{id}", delete(delete_task))
        .add("/{id}/trigger", post(trigger_task))
        .add("/handlers", get(list_handlers))
        .add("/logs", get(list_logs))
}
