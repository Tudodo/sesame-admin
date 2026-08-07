use crate::data::permissions::require_perm_code;
use crate::middleware::tenant::TenantScope;
use crate::models::_entities::dictionaries;
use crate::models::dictionaries as dictionaries_model;
use axum::Extension;
use loco_rs::prelude::*;

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
pub struct UpsertParams {
    pub name: String,
    pub code: String,
    pub description: Option<String>,
}

#[derive(Deserialize)]
struct QueryParams {
    #[serde(rename = "_start")]
    start: Option<usize>,
    #[serde(rename = "_end")]
    end: Option<usize>,
    #[serde(rename = "_sort")]
    #[allow(dead_code)]
    sort: Option<String>,
    #[serde(rename = "_order")]
    order: Option<String>,
    code: Option<String>,
}

#[debug_handler]
async fn list(
    _auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Query(q): Query<QueryParams>,
) -> Result<Response> {
    require_perm_code(&_auth, "system:dict:read")?;
    let (start, limit) = crate::data::page_range(q.start, q.end);
    let is_asc = q
        .order
        .as_deref()
        .map(|o| o.eq_ignore_ascii_case("asc"))
        .unwrap_or(true);
    let (items, total) = dictionaries_model::Model::list_paginated(
        &ctx.db,
        &tenant.code,
        q.code.as_deref(),
        is_asc,
        start as u64,
        limit as u64,
    )
    .await
    .map_err(Error::wrap)?;
    crate::data::paginated_response(&items, total)
}

async fn load(ctx: &AppContext, id: i32, tenant_code: &str) -> Result<dictionaries::Model> {
    dictionaries::Model::find_by_id_in_tenant(&ctx.db, id, tenant_code)
        .await
        .map_err(Error::wrap)
}

#[debug_handler]
async fn get_one(
    auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_perm_code(&auth, "system:dict:read")?;
    format::json(load(&ctx, id, &tenant.code).await?)
}

#[debug_handler]
async fn create(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(params): Json<UpsertParams>,
) -> Result<Response> {
    require_perm_code(&auth, "system:dict:create")?;
    let m = dictionaries::ActiveModel {
        name: Set(params.name),
        code: Set(params.code),
        description: Set(params.description),
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
    require_perm_code(&auth, "system:dict:update")?;
    let item = load(&ctx, id, &tenant.code).await?;
    let mut a = item.into_active_model();
    a.name = Set(params.name);
    a.code = Set(params.code);
    a.description = Set(params.description);
    let updated = a.update(&ctx.db).await?;
    // 字典 code 变更会使按 dict_code 缓存的 entries 失效，需清空缓存避免
    // 返回旧 code 对应的陈旧数据（缓存最长 60s，但不主动清除会延迟可见）。
    let _ = crate::controllers::dictionary_entries::invalidate_cache("").await;
    format::json(updated)
}

#[debug_handler]
async fn remove(
    auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_perm_code(&auth, "system:dict:delete")?;
    load(&ctx, id, &tenant.code).await?.delete(&ctx.db).await?;
    // 删除字典会级联删除其 entries，清空缓存避免返回已删除的字典选项。
    let _ = crate::controllers::dictionary_entries::invalidate_cache("").await;
    format::empty()
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/dictionaries")
        .add("/", get(list))
        .add("/", post(create))
        .add("/{id}", get(get_one))
        .add("/{id}", put(update))
        .add("/{id}", delete(remove))
}
