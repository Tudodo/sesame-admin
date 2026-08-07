use axum::extract::Path;
use axum::Extension;
use loco_rs::prelude::*;

use serde::Deserialize;

use crate::data::permissions::require_perm_code;
use crate::middleware::tenant::TenantScope;
use crate::models::sys_config as sys_config_model;

#[derive(Deserialize)]
struct QueryParams {
    #[serde(rename = "_start")]
    start: Option<usize>,
    #[serde(rename = "_end")]
    end: Option<usize>,
    config_name: Option<String>,
    config_key: Option<String>,
}

#[debug_handler]
async fn list(
    _auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Query(q): Query<QueryParams>,
) -> Result<Response> {
    require_perm_code(&_auth, "system:config:read")?;
    let (start, limit) = crate::data::page_range(q.start, q.end);
    let (items, total) = sys_config_model::Model::list_paginated(
        &ctx.db,
        &tenant.code,
        q.config_name.as_deref(),
        q.config_key.as_deref(),
        start as u64,
        limit as u64,
    )
    .await
    .map_err(Error::wrap)?;
    crate::data::paginated_response(&items, total)
}

#[debug_handler]
async fn get_one(
    _auth: auth::JWT,
    Path(id): Path<i64>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_perm_code(&_auth, "system:config:read")?;
    let item = sys_config_model::Model::find_by_id_in_tenant(&ctx.db, id, &tenant.code)
        .await
        .map_err(Error::wrap)?;
    format::json(item)
}

#[derive(Deserialize)]
struct CreateParams {
    config_name: String,
    config_key: String,
    config_value: String,
    config_type: Option<String>,
    remark: Option<String>,
}

#[debug_handler]
async fn create(
    _auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(p): Json<CreateParams>,
) -> Result<Response> {
    use crate::data::permissions::require_perm_code;
    require_perm_code(&_auth, "system:config:create")?;
    sys_config_model::Model::create_config(
        &ctx.db,
        &p.config_name,
        &p.config_key,
        &p.config_value,
        &p.config_type.unwrap_or_else(|| "Y".into()),
        p.remark,
        &tenant.code,
    )
    .await
    .map_err(Error::wrap)?;
    format::json(serde_json::json!({"ok": true}))
}

#[derive(Deserialize)]
struct UpdateParams {
    config_name: Option<String>,
    config_key: Option<String>,
    config_value: Option<String>,
    config_type: Option<String>,
    remark: Option<String>,
}

#[debug_handler]
async fn update(
    _auth: auth::JWT,
    Path(id): Path<i64>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(p): Json<UpdateParams>,
) -> Result<Response> {
    use crate::data::permissions::require_perm_code;
    require_perm_code(&_auth, "system:config:update")?;
    // 先按租户校验归属，避免跨租户修改其它租户的配置。
    let item = sys_config_model::Model::find_by_id_in_tenant(&ctx.db, id, &tenant.code)
        .await
        .map_err(Error::wrap)?;
    let mut active = item.into_active_model();
    if let Some(v) = p.config_name {
        active.config_name = sea_orm::Set(v);
    }
    if let Some(v) = p.config_key {
        active.config_key = sea_orm::Set(v);
    }
    if let Some(v) = p.config_value {
        active.config_value = sea_orm::Set(v);
    }
    if let Some(v) = p.config_type {
        active.config_type = sea_orm::Set(v);
    }
    if let Some(v) = p.remark {
        active.remark = sea_orm::Set(Some(v));
    }
    active.update(&ctx.db).await?;
    format::json(serde_json::json!({"ok": true}))
}

#[debug_handler]
async fn remove(
    _auth: auth::JWT,
    Path(id): Path<i64>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    use crate::data::permissions::require_perm_code;
    require_perm_code(&_auth, "system:config:delete")?;
    // 先按租户校验归属，再删除，避免跨租户删除。
    let item = sys_config_model::Model::find_by_id_in_tenant(&ctx.db, id, &tenant.code)
        .await
        .map_err(Error::wrap)?;
    item.delete(&ctx.db).await?;
    format::json(serde_json::json!({"ok": true}))
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/sys-configs")
        .add("/", get(list))
        .add("/", post(create))
        .add("/{id}", get(get_one))
        .add("/{id}", put(update))
        .add("/{id}", delete(remove))
}
