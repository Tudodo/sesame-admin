use axum::extract::Path;
use axum::Extension;
use loco_rs::prelude::*;

use serde::Deserialize;

use crate::data::permissions::require_perm_code;
use crate::middleware::tenant::TenantScope;
use crate::models::login_log as login_log_model;

#[derive(Deserialize)]
struct QueryParams {
    #[serde(rename = "_start")]
    start: Option<usize>,
    #[serde(rename = "_end")]
    end: Option<usize>,
    user_name: Option<String>,
}

#[debug_handler]
async fn list(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Query(q): Query<QueryParams>,
) -> Result<Response> {
    require_perm_code(&auth, "system:loginlog:read")?;
    let (start, limit) = crate::data::page_range(q.start, q.end);
    let (items, total) = login_log_model::Model::list_paginated(
        &ctx.db,
        &tenant.code,
        q.user_name.as_deref(),
        start as u64,
        limit as u64,
    )
    .await
    .map_err(Error::wrap)?;
    crate::data::paginated_response(&items, total)
}

#[debug_handler]
async fn get_one(
    auth: auth::JWT,
    Path(id): Path<i64>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_perm_code(&auth, "system:loginlog:read")?;
    let item = login_log_model::Model::find_by_id_in_tenant(&ctx.db, id, &tenant.code)
        .await
        .map_err(Error::wrap)?;
    format::json(item)
}

#[debug_handler]
async fn clear(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_perm_code(&auth, "system:loginlog:delete")?;
    login_log_model::Model::clear_by_tenant(&ctx.db, &tenant.code)
        .await
        .map_err(Error::wrap)?;
    format::json(serde_json::json!({"ok": true}))
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/login-logs")
        .add("/", get(list))
        .add("/{id}", get(get_one))
        .add("/clear", post(clear))
}

/// Record a login event. Called from auth controller after login attempt.
#[allow(clippy::too_many_arguments)]
pub async fn record_login(
    db: &sea_orm::DatabaseConnection,
    user_name: &str,
    user_id: Option<String>,
    ip: &str,
    user_agent: &str,
    status: i32,
    msg: Option<&str>,
    tenant_id: &str,
) {
    let _ = login_log_model::Model::record(
        db,
        user_name,
        user_id.as_deref(),
        ip,
        user_agent,
        status,
        msg,
        tenant_id,
    )
    .await;
}
/// Record a login event, returning errors so the caller can log them.
#[allow(clippy::too_many_arguments)]
pub async fn record_login_result(
    db: &sea_orm::DatabaseConnection,
    user_name: &str,
    user_id: Option<&str>,
    ip: &str,
    user_agent: &str,
    status: i32,
    msg: Option<&str>,
    tenant_id: &str,
) -> ModelResult<()> {
    login_log_model::Model::record(
        db, user_name, user_id, ip, user_agent, status, msg, tenant_id,
    )
    .await
    .map(|_| ())
}
