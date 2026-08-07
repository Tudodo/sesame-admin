use axum::extract::Path;
use axum::Extension;
use loco_rs::prelude::*;

use serde::Deserialize;

use crate::data::permissions::require_perm_code;
use crate::middleware::tenant::TenantScope;
use crate::models::user_sessions as user_sessions_model;
use crate::views::sessions::SessionResponse;

#[derive(Deserialize)]
struct QueryParams {
    #[serde(rename = "_start")]
    start: Option<usize>,
    #[serde(rename = "_end")]
    end: Option<usize>,
}

#[debug_handler]
async fn list(
    _auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Query(q): Query<QueryParams>,
) -> Result<Response> {
    require_perm_code(&_auth, "system:online:read")?;
    let (start, limit) = crate::data::page_range(q.start, q.end);
    let (items, total) = user_sessions_model::Model::list_paginated(
        &ctx.db,
        &tenant.code,
        start as u64,
        limit as u64,
    )
    .await
    .map_err(Error::wrap)?;
    let items: Vec<SessionResponse> = items.iter().map(SessionResponse::from).collect();
    crate::data::paginated_response(&items, total)
}

#[debug_handler]
async fn force_logout(
    _auth: auth::JWT,
    Path(session_id): Path<String>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_perm_code(&_auth, "system:online:delete")?;
    // Limit the operation to the current tenant so a manager cannot
    // force-logout a session belonging to another tenant by guessing id.
    // Propagate not-found / wrong-tenant as an error so the manager is not
    // misled into believing the session was revoked when it was not.
    let user_id =
        user_sessions_model::Model::force_logout_in_tenant(&ctx.db, &session_id, &tenant.code)
            .await
            .map_err(Error::wrap)?;
    crate::middleware::session_guard::revoke_user(&user_id).await?;
    format::json(serde_json::json!({"ok": true}))
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/online-users")
        .add("/", get(list))
        .add("/{id}/logout", post(force_logout))
}

/// Create a session record on login. Called from auth controller.
pub async fn create_session(
    db: &sea_orm::DatabaseConnection,
    user_id: &str,
    user_name: &str,
    ip: &str,
    ua: &str,
    token: &str,
    tenant_id: &str,
) {
    let _ = user_sessions_model::Model::create_session(
        db, user_id, user_name, ip, ua, token, tenant_id,
    )
    .await;
}
