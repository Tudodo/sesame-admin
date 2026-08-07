use axum::{extract::Path, Extension, Json};
use loco_rs::prelude::*;
use sea_orm::{ConnectionTrait, Statement};
use serde::Deserialize;

use crate::data::permissions::require_perm_code;
use crate::middleware::tenant::TenantScope;

use crate::models::sync_source_tables as sync_table_model;
use crate::models::sync_sources as sync_model;

#[derive(Deserialize)]
struct QueryParams {
    #[serde(rename = "_start")]
    start: Option<usize>,
    #[serde(rename = "_end")]
    end: Option<usize>,
}

// ── Sync Source CRUD (via model) ──

#[debug_handler]
async fn list(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Query(q): Query<QueryParams>,
) -> Result<Response> {
    require_perm_code(&auth, "system:sync:read")?;
    let (start, limit) = crate::data::page_range(q.start, q.end);
    let (items, total) =
        sync_model::Model::list_paginated(&ctx.db, &tenant.code, start as u64, limit as u64)
            .await
            .map_err(Error::wrap)?;
    crate::data::paginated_response(&items, total)
}

#[debug_handler]
async fn get_one(
    auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_perm_code(&auth, "system:sync:read")?;
    let item = sync_model::Model::find_by_id_in_tenant(&ctx.db, id, &tenant.code)
        .await
        .map_err(Error::wrap)?;
    format::json(item)
}

#[debug_handler]
async fn create(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(input): Json<SyncSourceInput>,
) -> Result<Response> {
    require_perm_code(&auth, "system:sync:create")?;
    // Validate the connection URL at write time too (defense-in-depth), not
    // just when the syncer worker runs. Without this a user could persist a
    // URL that only fails at execution time, and any future divergence between
    // the write-time and run-time checks would be a security gap.
    if let Some(ref url) = input.connection_url {
        if let Err(msg) = crate::data::security::validate_db_connection_url(url) {
            return Err(Error::BadRequest(msg));
        }
    }
    let params = sync_model::SyncSourceParams {
        name: input.name,
        source_type: input.source_type,
        connection_config: input
            .connection_url
            .map(|url| serde_json::json!({"url": url})),
        target_table: input.target_table,
        field_mapping: input.field_mapping,
        sync_mode: input.sync_mode,
        status: input.status,
    };
    let item = sync_model::Model::create_from(&ctx.db, &params, &tenant.code)
        .await
        .map_err(Error::wrap)?;
    format::json(item)
}

#[debug_handler]
async fn update(
    auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(input): Json<SyncSourceInput>,
) -> Result<Response> {
    require_perm_code(&auth, "system:sync:update")?;
    if let Some(ref url) = input.connection_url {
        if let Err(msg) = crate::data::security::validate_db_connection_url(url) {
            return Err(Error::BadRequest(msg));
        }
    }
    let params = sync_model::SyncSourceParams {
        name: input.name,
        source_type: input.source_type,
        connection_config: input
            .connection_url
            .map(|url| serde_json::json!({"url": url})),
        target_table: input.target_table,
        field_mapping: input.field_mapping,
        sync_mode: input.sync_mode,
        status: input.status,
    };
    sync_model::Model::update_from(&ctx.db, id, &tenant.code, &params)
        .await
        .map_err(Error::wrap)?;
    format::empty()
}

#[debug_handler]
async fn remove(
    auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_perm_code(&auth, "system:sync:delete")?;
    sync_model::Model::delete_in_tenant(&ctx.db, id, &tenant.code)
        .await
        .map_err(Error::wrap)?;
    format::empty()
}

#[derive(Deserialize)]
struct SyncSourceInput {
    name: String,
    source_type: String,
    connection_url: Option<String>,
    target_table: Option<String>,
    field_mapping: Option<serde_json::Value>,
    sync_mode: Option<String>,
    status: Option<String>,
}

// ── Discover tables from source database ──

#[derive(Deserialize)]
struct DiscoverTablesRequest {
    connection_url: String,
}

#[debug_handler]
async fn discover_tables(
    auth: auth::JWT,
    State(_ctx): State<AppContext>,
    Json(req): Json<DiscoverTablesRequest>,
) -> Result<Response> {
    require_perm_code(&auth, "system:sync:read")?;
    // Prevent SSRF and DNS rebinding: resolve once, reject internal IPs, then
    // connect to the literal validated IP instead of re-resolving the original
    // hostname between validation and connection.
    let safe_url = crate::data::security::resolve_safe_db_url(&req.connection_url)
        .map_err(Error::BadRequest)?;
    let db = sea_orm::Database::connect(&safe_url)
        .await
        .map_err(|_| Error::BadRequest("连接失败，请检查地址和凭据".to_string()))?;
    let rows = db.query_all(Statement::from_sql_and_values(
        sea_orm::DatabaseBackend::Postgres,
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
        [],
)).await.map_err(|e| {
        tracing::error!(error = %e, "sync_sources list tables query failed");
        Error::InternalServerError
    })?;
    let tables: Vec<String> = rows
        .iter()
        .filter_map(|r| r.try_get::<String>("", "table_name").ok())
        .collect();
    format::json(serde_json::json!({"tables": tables}))
}

// ── Table-level sync config CRUD (nested under sync source) ──

#[derive(Deserialize)]
struct SyncTableInput {
    source_table: String,
    target_table: String,
    target_connection_url: Option<String>,
    field_mapping: Option<serde_json::Value>,
    sync_mode: String,
    status: Option<String>,
}

#[debug_handler]
async fn list_tables(
    auth: auth::JWT,
    Path(source_id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_perm_code(&auth, "system:sync:read")?;
    let items = sync_table_model::Model::list_by_source(&ctx.db, source_id, &tenant.code)
        .await
        .map_err(Error::wrap)?;
    format::json(items)
}

#[debug_handler]
async fn create_table(
    auth: auth::JWT,
    Path(source_id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(input): Json<SyncTableInput>,
) -> Result<Response> {
    require_perm_code(&auth, "system:sync:create")?;
    if let Some(ref url) = input.target_connection_url {
        if let Err(msg) = crate::data::security::validate_db_connection_url(url) {
            return Err(Error::BadRequest(msg));
        }
    }
    let params = sync_table_model::SyncTableInput {
        source_table: input.source_table,
        target_table: input.target_table,
        target_connection_url: input.target_connection_url,
        field_mapping: input.field_mapping,
        sync_mode: input.sync_mode,
        status: input.status,
    };
    let id = sync_table_model::Model::create_table(&ctx.db, source_id, &params, &tenant.code)
        .await
        .map_err(Error::wrap)?;
    format::json(id)
}

#[debug_handler]
async fn update_table(
    auth: auth::JWT,
    Path((source_id, table_id)): Path<(i32, i32)>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(input): Json<SyncTableInput>,
) -> Result<Response> {
    require_perm_code(&auth, "system:sync:update")?;
    if let Some(ref url) = input.target_connection_url {
        if let Err(msg) = crate::data::security::validate_db_connection_url(url) {
            return Err(Error::BadRequest(msg));
        }
    }
    sync_table_model::Model::update_table(
        &ctx.db,
        table_id,
        source_id,
        &sync_table_model::SyncTableInput {
            source_table: input.source_table,
            target_table: input.target_table,
            target_connection_url: input.target_connection_url,
            field_mapping: input.field_mapping,
            sync_mode: input.sync_mode,
            status: input.status,
        },
        &tenant.code,
    )
    .await
    .map_err(Error::wrap)?;
    format::empty()
}

#[debug_handler]
async fn remove_table(
    auth: auth::JWT,
    Path((source_id, table_id)): Path<(i32, i32)>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_perm_code(&auth, "system:sync:delete")?;
    sync_table_model::Model::delete_in_tenant(&ctx.db, table_id, source_id, &tenant.code)
        .await
        .map_err(Error::wrap)?;
    format::empty()
}

// ── Run sync for a table config ──

#[debug_handler]
async fn run_table_sync(
    auth: auth::JWT,
    Path((source_id, table_id)): Path<(i32, i32)>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_perm_code(&auth, "system:sync:create")?;
    let source = sync_model::Model::find_by_id_in_tenant(&ctx.db, source_id, &tenant.code)
        .await
        .map_err(Error::wrap)?;
    let table = sync_table_model::Model::find_by_id_in_tenant(&ctx.db, table_id, &tenant.code)
        .await
        .map_err(Error::wrap)?;
    // 校验表格配置归属于路径中的同步源，防止跨源拼接配置导致数据错乱。
    if table.source_id != source_id {
        return Err(Error::BadRequest("表格配置不属于该同步源".to_string()));
    }

    let queue = ctx
        .queue_provider
        .as_ref()
        .ok_or_else(|| Error::string("Queue not available"))?;

    queue
        .enqueue(
            crate::workers::syncer::SyncWorker::class_name(),
            None,
            crate::workers::syncer::SyncWorkerArgs {
                sync_type: table.sync_mode.clone(),
                entity: format!("sync_table:{}", table.id),
                tenant_id: tenant.code.clone(),
                user_id: auth.claims.pid.to_string(),
                extra: Some(
                    serde_json::json!({
                        "source_id": source.id,
                        "table_id": table.id,
                        "source_type": source.source_type,
                        "connection_config": source.connection_config,
                        "source_table": table.source_table,
                        "target_table": table.target_table,
                        "target_connection_url": table.target_connection_url,
                        "field_mapping": table.field_mapping,
                    })
                    .to_string(),
                ),
            },
            None,
        )
        .await?;

    // last_sync_at 改由 syncer worker 在同步成功后更新，
    // 此处入队即更新会导致失败也显示"已同步"，语义错误。
    format::json(serde_json::json!({"ok": true, "msg": "同步任务已提交"}))
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/sync-sources")
        .add("/", get(list))
        .add("/", post(create))
        .add("/{id}", get(get_one))
        .add("/{id}", put(update))
        .add("/{id}", delete(remove))
        .add("/{id}/tables", get(list_tables))
        .add("/{id}/tables", post(create_table))
        .add("/{id}/tables/{tid}", put(update_table))
        .add("/{id}/tables/{tid}", delete(remove_table))
        .add("/{id}/tables/{tid}/run", post(run_table_sync))
        .add("/discover-tables", post(discover_tables))
}
