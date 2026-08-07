use crate::middleware::tenant::TenantScope;
use axum::extract::Path;
use axum::Extension;
use loco_rs::prelude::*;

use serde::Deserialize;

use crate::data::permissions::require_perm_code;
use crate::models::oper_log as oper_log_model;

#[derive(Deserialize)]
struct QueryParams {
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
    Query(q): Query<QueryParams>,
) -> Result<Response> {
    require_perm_code(&auth, "system:operlog:read")?;
    let (start, limit) = crate::data::page_range(q.start, q.end);
    let (items, total) =
        oper_log_model::Model::list_paginated(&ctx.db, &tenant.code, start as u64, limit as u64)
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
    require_perm_code(&auth, "system:operlog:read")?;
    let item = oper_log_model::Model::find_by_id_in_tenant(&ctx.db, id, &tenant.code)
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
    require_perm_code(&auth, "system:operlog:delete")?;
    oper_log_model::Model::clear_by_tenant(&ctx.db, &tenant.code)
        .await
        .map_err(Error::wrap)?;
    format::json(serde_json::json!({"ok": true}))
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/oper-logs")
        .add("/", get(list))
        .add("/{id}", get(get_one))
        .add("/clear", post(clear))
}
