use crate::data::permissions::require_authenticated;
use crate::data::permissions::require_perm_code;
use crate::middleware::tenant::TenantScope;
use crate::models::_entities::dictionary_entries;
use crate::models::dictionaries as dictionaries_model;
use crate::models::dictionary_entries as dict_entries_model;
use axum::Extension;
use loco_rs::prelude::*;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictEntryItem {
    pub id: i32,
    pub label: String,
    pub value: String,
    pub sort_order: i32,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct UpsertParams {
    pub dictionary_id: i32,
    pub label: String,
    pub value: String,
    pub sort_order: Option<i32>,
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
    dictionary_id: Option<i32>,
    dict_type: Option<String>,
}

pub async fn invalidate_cache(_dict_code: &str) -> Result<(), loco_rs::Error> {
    crate::data::shared_redis::delete_by_prefix("dict_cache").await
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

    // Resolve dict_type -> dictionary_id
    let dict_id = if let Some(ref code) = q.dict_type {
        crate::models::dictionaries::Model::find_by_code(&ctx.db, code, &tenant.code)
            .await
            .ok()
            .map(|d| d.id)
    } else {
        q.dictionary_id
    };
    // If dict_type was specified but not found, return empty
    if q.dict_type.is_some() && dict_id.is_none() {
        return format::json(Vec::<dict_entries_model::Model>::new());
    }

    let (items, total) = dict_entries_model::Model::list_paginated(
        &ctx.db,
        &tenant.code,
        dict_id,
        is_asc,
        start as u64,
        limit as u64,
    )
    .await
    .map_err(Error::wrap)?;
    crate::data::paginated_response(&items, total)
}

#[debug_handler]
async fn options(
    auth: auth::JWT,
    Path(dict_code): Path<String>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    // 字典选项用于前端下拉选择，需要认证但不需要特定权限
    require_authenticated(&auth)?;
    {
        let cache_key = format!("{}:{}", tenant.code, dict_code);
        if let Ok(Some(raw)) = crate::data::shared_redis::get("dict_cache", &cache_key).await {
            if let Ok(items) = serde_json::from_str::<Vec<DictEntryItem>>(&raw) {
                return format::json(items);
            }
        }
    }
    let entries: Vec<DictEntryItem> =
        dict_entries_model::Model::get_by_dict_code(&ctx.db, &dict_code, &tenant.code)
            .await
            .map_err(Error::wrap)?
            .into_iter()
            .map(|e| DictEntryItem {
                id: e.id,
                label: e.label,
                value: e.value,
                sort_order: e.sort_order,
            })
            .collect();
    // Redis TTL bounds the shared cache automatically; writes invalidate the
    // whole scope so tenant/dict_code key changes cannot serve stale values.
    let cache_key = format!("{}:{}", tenant.code, dict_code);
    let raw = serde_json::to_string(&entries).map_err(Error::wrap)?;
    // Redis TTL bounds cache size automatically. A transient cache write
    // failure is not fatal: the next request simply reads from the database.
    if let Err(e) = crate::data::shared_redis::set("dict_cache", &cache_key, &raw, 60).await {
        tracing::warn!(error = %e, cache_key = %cache_key, "dict cache write failed");
    }
    format::json(entries)
}

async fn load(ctx: &AppContext, id: i32, tenant_code: &str) -> Result<dictionary_entries::Model> {
    dictionary_entries::Model::find_by_id_in_tenant(&ctx.db, id, tenant_code)
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
    let _ = invalidate_cache("").await;
    // 校验 dictionary_id 归属当前租户，避免创建跨租户的字典项-字典引用。
    dictionaries_model::Model::find_by_id_in_tenant(&ctx.db, params.dictionary_id, &tenant.code)
        .await
        .map_err(Error::wrap)?;
    let m = dictionary_entries::ActiveModel {
        dictionary_id: Set(params.dictionary_id),
        label: Set(params.label),
        value: Set(params.value),
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
    require_perm_code(&auth, "system:dict:update")?;
    let _ = invalidate_cache("").await;
    let item = load(&ctx, id, &tenant.code).await?;
    // 校验 dictionary_id 归属当前租户，避免跨租户引用字典。
    dictionaries_model::Model::find_by_id_in_tenant(&ctx.db, params.dictionary_id, &tenant.code)
        .await
        .map_err(Error::wrap)?;
    let current_sort = item.sort_order;
    let mut a = item.into_active_model();
    a.label = Set(params.label);
    a.value = Set(params.value);
    a.dictionary_id = Set(params.dictionary_id);
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
    require_perm_code(&auth, "system:dict:delete")?;
    let _ = invalidate_cache("").await;
    load(&ctx, id, &tenant.code).await?.delete(&ctx.db).await?;
    format::empty()
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/dictionary-entries")
        .add("/", get(list))
        .add("/", post(create))
        .add("/{id}", get(get_one))
        .add("/{id}", put(update))
        .add("/{id}", delete(remove))
        .add("/options/{dict_code}", get(options))
}
