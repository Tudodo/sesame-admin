use crate::data::permissions::require_perm_code;
use crate::middleware::tenant::TenantScope;
use crate::models::_entities::positions;
use crate::models::departments as departments_model;
use crate::models::positions as positions_model;
use axum::Extension;
use loco_rs::prelude::*;

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
pub struct UpsertParams {
    pub name: String,
    pub description: Option<String>,
    #[serde(default)]
    pub dept_id: Option<i32>,
    #[serde(default)]
    pub sort_order: Option<i32>,
}

#[derive(Deserialize)]
struct QueryParams {
    #[serde(rename = "_start")]
    start: Option<usize>,
    #[serde(rename = "_end")]
    end: Option<usize>,
    dept_id: Option<i32>,
    #[serde(rename = "_sort")]
    #[allow(dead_code)]
    sort: Option<String>,
    #[serde(rename = "_order")]
    order: Option<String>,
}

#[debug_handler]
async fn list(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Query(q): Query<QueryParams>,
) -> Result<Response> {
    require_perm_code(&auth, "system:post:read")?;
    let (start, limit) = crate::data::page_range(q.start, q.end);
    let is_asc = q
        .order
        .as_deref()
        .map(|o| o.eq_ignore_ascii_case("asc"))
        .unwrap_or(true);

    let (items, total) = positions_model::Model::list_paginated(
        &ctx.db,
        &tenant.code,
        q.dept_id,
        is_asc,
        start as u64,
        limit as u64,
    )
    .await
    .map_err(Error::wrap)?;

    crate::data::paginated_response(&items, total)
}

async fn load(ctx: &AppContext, id: i32, tenant_code: &str) -> Result<positions::Model> {
    positions::Model::find_by_id_in_tenant(&ctx.db, id, tenant_code)
        .await
        .map_err(Error::wrap)
}

#[debug_handler]
async fn get_one(
    _auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_perm_code(&_auth, "system:post:read")?;
    format::json(load(&ctx, id, &tenant.code).await?)
}

#[debug_handler]
async fn create(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(params): Json<UpsertParams>,
) -> Result<Response> {
    require_perm_code(&auth, "system:post:create")?;
    // 校验 dept_id 归属当前租户，避免创建跨租户的岗位-部门引用。
    if let Some(dept_id) = params.dept_id {
        departments_model::Model::find_by_id_in_tenant(&ctx.db, dept_id, &tenant.code)
            .await
            .map_err(Error::wrap)?;
    }
    let m = positions::ActiveModel {
        name: Set(params.name),
        description: Set(params.description),
        dept_id: Set(params.dept_id),
        sort_order: Set(params.sort_order.unwrap_or(0)),
        tenant_id: Set(Some(tenant.code)),
        ..Default::default()
    }
    .insert(&ctx.db)
    .await?;
    format::json(m)
}

#[debug_handler]
async fn update(
    auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(params): Json<UpsertParams>,
) -> Result<Response> {
    require_perm_code(&auth, "system:post:update")?;
    let item = load(&ctx, id, &tenant.code).await?;
    // 校验 dept_id 归属当前租户，避免跨租户引用部门。
    if let Some(dept_id) = params.dept_id {
        departments_model::Model::find_by_id_in_tenant(&ctx.db, dept_id, &tenant.code)
            .await
            .map_err(Error::wrap)?;
    }
    let current_sort = item.sort_order;
    let mut a = item.into_active_model();
    a.name = Set(params.name);
    a.description = Set(params.description);
    a.dept_id = Set(params.dept_id);
    a.sort_order = Set(params.sort_order.unwrap_or(current_sort));
    format::json(a.update(&ctx.db).await?)
}

#[debug_handler]
async fn remove(
    auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_perm_code(&auth, "system:post:delete")?;
    load(&ctx, id, &tenant.code).await?.delete(&ctx.db).await?;
    format::empty()
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/positions")
        .add("/", get(list))
        .add("/", post(create))
        .add("/{id}", get(get_one))
        .add("/{id}", put(update))
        .add("/{id}", delete(remove))
}
