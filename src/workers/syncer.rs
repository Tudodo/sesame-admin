use crate::data::cache_keys::MANAGED_CACHE_PREFIXES;
use loco_rs::prelude::*;
use sea_orm::{ConnectionTrait, Statement, TransactionTrait};
use serde::{Deserialize, Serialize};

/// Validate a table name: only alphanumeric + underscore, 1-63 chars, no reserved prefixes.
fn validate_table_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.len() > 63 {
        return Err(format!("Invalid table name length: {name}"));
    }
    if !name.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Err(format!("Table name contains invalid characters: {name}"));
    }
    if name.starts_with("pg_") || name.starts_with("sql_") || name == "information_schema" {
        return Err(format!("Reserved table name: {name}"));
    }
    Ok(())
}

/// Validate a column name: only alphanumeric + underscore, 1-63 chars.
fn validate_column_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.len() > 63 {
        return Err(format!("Invalid column name length: {name}"));
    }
    if !name.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Err(format!("Column name contains invalid characters: {name}"));
    }
    Ok(())
}

pub struct SyncWorker {
    pub ctx: AppContext,
}

#[derive(Deserialize, Debug, Serialize)]
pub struct SyncWorkerArgs {
    pub sync_type: String,
    pub entity: String,
    pub tenant_id: String,
    pub user_id: String,
    pub extra: Option<String>,
}

#[async_trait]
impl BackgroundWorker<SyncWorkerArgs> for SyncWorker {
    fn build(ctx: &AppContext) -> Self {
        Self { ctx: ctx.clone() }
    }

    fn tags() -> Vec<String> {
        vec!["syncer".to_string()]
    }

    async fn perform(&self, args: SyncWorkerArgs) -> Result<()> {
        tracing::info!(sync_type = %args.sync_type, entity = %args.entity, "sync started");

        // 配置化同步（entity 形如 "sync_source:1" 或 "sync_table:2"）只能由
        // sync_sources 控制器的 run_table_sync 入队，该接口已校验表格归属同步源。
        // trigger_sync 接口会拒绝这两个前缀，防止越权触发配置同步。
        let result =
            if args.entity.starts_with("sync_source:") || args.entity.starts_with("sync_table:") {
                execute_configured_sync(&self.ctx, &args).await
            } else {
                match args.entity.as_str() {
                    "cache" => sync_cache().await,
                    _ => {
                        tracing::info!(entity = %args.entity, "sync placeholder");
                        Err(Error::string(&format!(
                            "unknown sync entity: {}",
                            args.entity
                        )))
                    }
                }
            };

        // 仅在同步成功后才更新 last_sync_at，避免失败时误报"已同步"。
        // 仅对单表配置同步（sync_table:）更新；整源同步（sync_source:）无单一 table_id。
        if result.is_ok() && args.entity.starts_with("sync_table:") {
            if let Some(extra_str) = &args.extra {
                if let Ok(extra) = serde_json::from_str::<serde_json::Value>(extra_str) {
                    if let Some(table_id) = extra.get("table_id").and_then(|v| v.as_i64()) {
                        if let Err(e) = crate::models::sync_source_tables::Model::touch_last_sync(
                            &self.ctx.db,
                            table_id as i32,
                            &args.tenant_id,
                        )
                        .await
                        {
                            tracing::warn!(table_id, error = %e, "touch_last_sync failed");
                        }
                    }
                }
            }
        }

        let (title, msg) = match &result {
            Ok(()) => (
                "数据同步完成",
                format!("{} ({}) 已完成", args.entity, args.sync_type),
            ),
            Err(e) => (
                "数据同步失败",
                format!("{} ({}) 失败: {}", args.entity, args.sync_type, e),
            ),
        };
        let level = if result.is_ok() { "success" } else { "error" };

        crate::controllers::notifications::notify_user(
            &self.ctx.db,
            &args.user_id,
            title,
            &msg,
            level,
            None,
            &args.tenant_id,
        )
        .await;

        result
    }
}

async fn execute_configured_sync(ctx: &AppContext, args: &SyncWorkerArgs) -> Result<()> {
    let extra: serde_json::Value = args
        .extra
        .as_ref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();

    let source_type = extra
        .get("source_type")
        .and_then(|v| v.as_str())
        .unwrap_or("database");
    let target_table = extra
        .get("target_table")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if target_table.is_empty() {
        return Err(Error::string("target_table not configured"));
    }

    match source_type {
        "database" => sync_from_database(ctx, args, &extra).await,
        "api" => sync_from_api(args, &extra).await,
        _ => Err(Error::string(&format!(
            "unsupported source_type: {source_type}"
        ))),
    }
}

async fn sync_from_database(
    ctx: &AppContext,
    args: &SyncWorkerArgs,
    extra: &serde_json::Value,
) -> Result<()> {
    let config = extra
        .get("connection_config")
        .ok_or_else(|| Error::string("connection_config missing"))?;
    let db_url = config
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| Error::string("connection_config.url missing"))?;
    let source_table = extra
        .get("source_table")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let target_table = extra
        .get("target_table")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let mapping = extra.get("field_mapping");
    crate::models::sync_source_tables::validate_sync_field_mapping(mapping)
        .map_err(|e| Error::string(&e))?;

    if source_table.is_empty() || target_table.is_empty() {
        return Err(Error::string("source_table and target_table required"));
    }

    // Prevent SSRF + DNS rebinding: resolve the hostname to a validated IP now
    // and connect by IP so the driver does not re-resolve the hostname (which
    // could flip to an internal address between validate and connect).
    let safe_ext_url =
        crate::data::security::resolve_safe_db_url(db_url).map_err(|e| Error::string(&e))?;
    let ext_db = sea_orm::Database::connect(&safe_ext_url)
        .await
        .map_err(|e| Error::string(&format!("External DB connect: {e}")))?;

    // Read from source
    validate_table_name(source_table).map_err(|e| Error::string(&e))?;
    let sql = format!("SELECT * FROM \"{source_table}\" LIMIT 10000");
    let rows = ext_db
        .query_all(Statement::from_sql_and_values(
            sea_orm::DatabaseBackend::Postgres,
            &sql,
            [],
        ))
        .await
        .map_err(|e| Error::string(&e.to_string()))?;

    let count = rows.len();
    tracing::info!(source_table = %source_table, rows = count, "read from source");

    // Determine columns and mapping
    let columns: Vec<String> =
        if let Some(columns_array) = config.get("columns").and_then(|v| v.as_array()) {
            columns_array
                .iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        } else if !rows.is_empty() {
            // Infer from first row (try_get all known columns)
            // For now, read the column names from the mapping or config
            vec![]
        } else {
            return Ok(()); // Nothing to sync
        };

    // 既未配置 field_mapping，又未在 connection_config.columns 显式声明列时，每行的
    // value_map 都会是空的，循环里会被静默跳过，最终 "sync complete" 报告成功但
    // 一行都没写入。这是误导性成功：运维以为同步完成，实际目标表为空。这里直接
    // 报错，强制用户配置 mapping 或 columns 后再触发同步。
    let mapping_configured = mapping
        .and_then(|m| m.as_object())
        .is_some_and(|obj| !obj.is_empty());
    if !mapping_configured && columns.is_empty() && !rows.is_empty() {
        return Err(Error::string(
            "field_mapping or connection_config.columns must be configured before syncing",
        ));
    }

    // Determine target DB: use target_connection_url if set, else local
    let target_db_url = extra.get("target_connection_url").and_then(|v| v.as_str());
    let target_is_local = target_db_url.is_none_or(|url| url.trim().is_empty());
    let target_db: sea_orm::DatabaseConnection;
    if target_is_local {
        // Local sync writes are tenant-scoped application data. Core runtime
        // tables are protected by name, and every local target must be
        // tenant-scoped so a full sync cannot delete global rows.
        crate::models::sync_source_tables::validate_target_table_name(target_table)
            .map_err(|e| Error::string(&e.to_string()))?;
        if !target_table_has_column(&ctx.db, target_table, "tenant_id").await {
            return Err(Error::string("本地同步目标表必须包含 tenant_id 列"));
        }
        target_db = ctx.db.clone();
    } else {
        let safe_target_url = crate::data::security::resolve_safe_db_url(
            target_db_url.ok_or_else(|| Error::string("target_connection_url missing"))?,
        )
        .map_err(|e| Error::string(&e))?;
        target_db = sea_orm::Database::connect(&safe_target_url)
            .await
            .map_err(|e| Error::string(&format!("Target DB connect: {e}")))?;
    }

    // Perform the truncate + insert inside a single transaction so that a
    // failure midway leaves the target table untouched. Without this, a full
    // sync that crashes after the DELETE would leave the target empty / partial
    // — a silent data-loss bug.
    let txn = target_db
        .begin()
        .await
        .map_err(|e| Error::string(&format!("Begin txn: {e}")))?;

    // If full sync, truncate target first (scoped to this tenant).
    if args.sync_type == "full" {
        validate_table_name(target_table).map_err(|e| Error::string(&e))?;
        let truncate_sql = format!("DELETE FROM \"{target_table}\" WHERE tenant_id = $1");
        txn.execute(Statement::from_sql_and_values(
            sea_orm::DatabaseBackend::Postgres,
            &truncate_sql,
            [args.tenant_id.clone().into()],
        ))
        .await
        .map_err(|e| Error::string(&e.to_string()))?;
    }

    // Detect once whether the target table has a tenant_id column. If it does
    // and a row's value_map does not already include tenant_id (via explicit
    // field mapping), auto-append it so synced rows are scoped to this tenant.
    // Without this, tenant-scoped target tables receive rows with NULL
    // tenant_id that are invisible to tenant-filtered queries and survive the
    // full-sync DELETE (NULL != tenant code), leaving orphaned cross-tenant
    // data behind.
    let target_has_tenant_id = target_table_has_column(&target_db, target_table, "tenant_id").await;

    // Build value maps for all rows first (field mapping or explicit columns,
    // then auto-append tenant_id for tenant-scoped target tables). Empty maps
    // are skipped. See the comment above `target_has_tenant_id` for the
    // data-isolation rationale behind the tenant_id auto-append.
    let mut all_rows: Vec<serde_json::Map<String, serde_json::Value>> =
        Vec::with_capacity(rows.len());
    for row in &rows {
        let mut value_map = serde_json::Map::new();
        if let Some(map_obj) = mapping
            .and_then(|m| m.as_object())
            .filter(|m| !m.is_empty())
        {
            for (target_col, source_field) in map_obj {
                if let Some(source_col) = source_field.as_str() {
                    let val: String = row.try_get::<String>("", source_col).unwrap_or_default();
                    value_map.insert(target_col.clone(), serde_json::Value::String(val));
                }
            }
        } else if !columns.is_empty() {
            for col in &columns {
                let val: String = row.try_get::<String>("", col).unwrap_or_default();
                value_map.insert(col.clone(), serde_json::Value::String(val));
            }
        }
        if value_map.is_empty() {
            continue;
        }
        if target_has_tenant_id && !value_map.contains_key("tenant_id") {
            value_map.insert(
                "tenant_id".to_string(),
                serde_json::Value::String(args.tenant_id.clone()),
            );
        }
        all_rows.push(value_map);
    }

    let inserted = all_rows.len() as u64;
    if inserted == 0 {
        txn.commit()
            .await
            .map_err(|e| Error::string(&format!("Commit: {e}")))?;
        tracing::info!(target = %target_table, inserted, "sync complete");
        return Ok(());
    }

    // Validate table + all column names once (the union of every row's keys).
    // Postgres multi-row INSERT requires a single column list, so we take the
    // union of all rows' keys and backfill missing columns with NULL for rows
    // that lack them (keeps each tuple the same length).
    validate_table_name(target_table).map_err(|e| Error::string(&e))?;
    let mut col_set: Vec<String> = Vec::new();
    for vm in &all_rows {
        for k in vm.keys() {
            if !col_set.contains(k) {
                validate_column_name(k).map_err(|e| Error::string(&e))?;
                col_set.push(k.clone());
            }
        }
    }
    let ncols = col_set.len();
    let cols_str: Vec<String> = col_set.iter().map(|k| format!("\"{k}\"")).collect();

    // Batch the inserts to stay under Postgres' 65535 bind-parameter limit
    // (one statement can hold at most 65535 params). Compute the batch size
    // dynamically from the column count so wide tables don't exceed the
    // limit at runtime (a fixed 500-row batch with 132+ columns would fail).
    const MAX_BIND_PARAMS: usize = 65_000; // leave headroom under 65535
    let batch_size = MAX_BIND_PARAMS
        .checked_div(ncols)
        .map(|n| 500.min(n).max(1))
        .unwrap_or(500);
    for chunk in all_rows.chunks(batch_size) {
        let mut placeholders: Vec<String> = Vec::with_capacity(chunk.len());
        let mut val_refs: Vec<sea_orm::Value> = Vec::with_capacity(chunk.len() * ncols);
        let mut param_idx = 1usize;
        for vm in chunk {
            let mut row_ph: Vec<String> = Vec::with_capacity(ncols);
            for col in &col_set {
                let v = vm.get(col).cloned().unwrap_or(serde_json::Value::Null);
                if matches!(v, serde_json::Value::Null) {
                    // SQL NULL for a text column; sea_orm has no single Null variant,
                    // so use the typed None form (String(None) -> NULL).
                    val_refs.push(sea_orm::Value::String(None));
                } else {
                    let s = match v {
                        serde_json::Value::String(s) => s,
                        other => other.to_string(),
                    };
                    val_refs.push(s.into());
                }
                row_ph.push(format!("${param_idx}"));
                param_idx += 1;
            }
            placeholders.push(format!("({})", row_ph.join(", ")));
        }
        let insert_sql = format!(
            "INSERT INTO \"{target_table}\" ({}) VALUES {}",
            cols_str.join(", "),
            placeholders.join(", ")
        );
        // A failed insert now aborts the whole transaction (previously it
        // was silently swallowed and the row skipped, masking errors).
        txn.execute(Statement::from_sql_and_values(
            sea_orm::DatabaseBackend::Postgres,
            &insert_sql,
            val_refs,
        ))
        .await
        .map_err(|e| Error::string(&e.to_string()))?;
    }

    txn.commit()
        .await
        .map_err(|e| Error::string(&format!("Commit: {e}")))?;

    tracing::info!(target = %target_table, inserted, "sync complete");
    Ok(())
}

/// Check whether the target table has a given column. Used to decide whether
/// to auto-append tenant_id on sync inserts: without this guard, inserting
/// into a tenant-scoped table without tenant_id leaves rows stranded (NULL
/// tenant_id) — invisible to tenant-filtered queries and immune to the
/// full-sync DELETE, causing silent cross-tenant data residue.
async fn target_table_has_column(
    db: &sea_orm::DatabaseConnection,
    table: &str,
    column: &str,
) -> bool {
    let sql = "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2 LIMIT 1";
    let res = db
        .query_one(Statement::from_sql_and_values(
            sea_orm::DatabaseBackend::Postgres,
            sql,
            [table.into(), column.into()],
        ))
        .await;
    matches!(res, Ok(Some(_)))
}

async fn sync_from_api(_args: &SyncWorkerArgs, _extra: &serde_json::Value) -> Result<()> {
    // Placeholder for HTTP API-based sync
    tracing::info!("API sync not yet implemented");
    Err(Error::string("API sync not implemented"))
}

async fn sync_cache() -> Result<()> {
    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1".into());
    let client = redis::Client::open(redis_url.as_str())
        .map_err(|e| Error::string(&format!("Redis: {e}")))?;
    let mut conn = client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| Error::string(&format!("Redis: {e}")))?;

    // Only delete managed cache prefixes. Using FLUSHDB would destroy ALL
    // Redis data including session tokens, job queues, and other runtime
    // state — a critical data-loss risk.
    let mut deleted: u64 = 0;
    const MAX_SCAN: usize = 10_000;
    for prefix in MANAGED_CACHE_PREFIXES {
        let mut cursor: u64 = 0;
        loop {
            let (next_cursor, batch): (u64, Vec<String>) = redis::cmd("SCAN")
                .arg(cursor)
                .arg("MATCH")
                .arg(format!("{prefix}*"))
                .arg("COUNT")
                .arg(100)
                .query_async(&mut conn)
                .await
                .map_err(|e| Error::string(&format!("SCAN: {e}")))?;
            if !batch.is_empty() {
                let _: u64 = redis::cmd("DEL")
                    .arg(&batch)
                    .query_async(&mut conn)
                    .await
                    .map_err(|e| Error::string(&format!("DEL: {e}")))?;
                deleted += batch.len() as u64;
            }
            cursor = next_cursor;
            if cursor == 0 || deleted as usize >= MAX_SCAN {
                break;
            }
        }
    }
    tracing::info!(deleted, "managed cache prefixes cleared");
    Ok(())
}
