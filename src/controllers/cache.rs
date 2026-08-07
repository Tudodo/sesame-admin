use crate::data::cache_keys::{is_managed_cache_key, MANAGED_CACHE_PREFIXES};
use crate::data::permissions::require_platform_admin;
use crate::middleware::tenant::TenantScope;
use axum::Extension;
use loco_rs::prelude::*;
use serde::Serialize;

#[derive(Serialize, Clone)]
struct CacheInfo {
    keys: Vec<CacheKeyInfo>,
    stats: CacheStats,
}

#[derive(Serialize, Clone)]
struct CacheKeyInfo {
    key: String,
    ttl: i64,
    size: usize,
    r#type: String,
}

#[derive(Serialize, Clone)]
struct CacheStats {
    total_keys: usize,
    hits: u64,
    misses: u64,
    memory_used: String,
}

const MAX_KEYS: usize = 1000;
const MAX_CLEAR_KEYS: usize = 10_000;

async fn collect_managed_keys(
    conn: &mut redis::aio::MultiplexedConnection,
    limit: usize,
) -> Result<Vec<String>, redis::RedisError> {
    let mut keys = Vec::new();
    for prefix in MANAGED_CACHE_PREFIXES {
        let mut cursor: u64 = 0;
        loop {
            let (next_cursor, batch): (u64, Vec<String>) = redis::cmd("SCAN")
                .arg(cursor)
                .arg("MATCH")
                .arg(format!("{prefix}*"))
                .arg("COUNT")
                .arg(100)
                .query_async(&mut *conn)
                .await?;
            for key in batch {
                if keys.len() >= limit {
                    break;
                }
                keys.push(key);
            }
            cursor = next_cursor;
            if cursor == 0 || keys.len() >= limit {
                break;
            }
        }
    }
    keys.sort();
    keys.dedup();
    Ok(keys)
}

/// Fetch all keys using Redis SCAN — this is inherently Redis-specific
/// introspection and cannot be done through Loco's generic cache abstraction.
async fn fetch_redis_info(
    conn: &mut redis::aio::MultiplexedConnection,
) -> (Vec<CacheKeyInfo>, CacheStats) {
    let redis_keys = collect_managed_keys(conn, MAX_KEYS)
        .await
        .unwrap_or_default();

    let mut keys = Vec::new();
    for key in redis_keys {
        let key_type: String = redis::cmd("TYPE")
            .arg(&key)
            .query_async(&mut *conn)
            .await
            .unwrap_or_else(|_| "unknown".into());
        let ttl: i64 = redis::cmd("TTL")
            .arg(&key)
            .query_async(&mut *conn)
            .await
            .unwrap_or(-1);
        let size: usize = match key_type.as_str() {
            "string" => redis::cmd("STRLEN")
                .arg(&key)
                .query_async(&mut *conn)
                .await
                .unwrap_or(0),
            "list" => redis::cmd("LLEN")
                .arg(&key)
                .query_async(&mut *conn)
                .await
                .unwrap_or(0),
            "set" => redis::cmd("SCARD")
                .arg(&key)
                .query_async(&mut *conn)
                .await
                .unwrap_or(0),
            "zset" => redis::cmd("ZCARD")
                .arg(&key)
                .query_async(&mut *conn)
                .await
                .unwrap_or(0),
            "hash" => redis::cmd("HLEN")
                .arg(&key)
                .query_async(&mut *conn)
                .await
                .unwrap_or(0),
            _ => 0,
        };
        keys.push(CacheKeyInfo {
            key,
            ttl,
            size,
            r#type: key_type,
        });
    }

    let total = keys.len();
    let stats = CacheStats {
        total_keys: total,
        hits: 0,
        misses: 0,
        memory_used: format!("{} 键", total),
    };
    (keys, stats)
}

#[debug_handler]
async fn list_keys(
    _auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_platform_admin(
        &_auth,
        &tenant.code,
        "system:cache:read",
        "缓存管理仅对平台租户管理员开放",
    )?;
    // Try Loco cache ping first
    match ctx.cache.ping().await {
        Ok(()) => {
            // Try Redis introspection (falls back to basic info if not Redis)
            let redis_conn = redis_connect().await;
            match redis_conn {
                Ok(mut conn) => {
                    let (keys, stats) = fetch_redis_info(&mut conn).await;
                    format::json(CacheInfo { keys, stats })
                }
                Err(e) => {
                    let stats = CacheStats {
                        total_keys: 0,
                        hits: 0,
                        misses: 0,
                        memory_used: format!("Cache OK, Redis unreachable: {e}"),
                    };
                    format::json(CacheInfo {
                        keys: vec![],
                        stats,
                    })
                }
            }
        }
        Err(e) => {
            let stats = CacheStats {
                total_keys: 0,
                hits: 0,
                misses: 0,
                memory_used: format!("Cache unavailable: {e}"),
            };
            format::json(CacheInfo {
                keys: vec![],
                stats,
            })
        }
    }
}

#[debug_handler]
async fn delete_key(
    _auth: auth::JWT,
    Path(key): Path<String>,
    State(_ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_platform_admin(
        &_auth,
        &tenant.code,
        "system:cache:read",
        "缓存管理仅对平台租户管理员开放",
    )?;
    // Restrict deletion to managed cache keys only. The Redis instance is
    // shared with session tokens, job queues, rate-limit counters and other
    // runtime state; deleting an arbitrary key would invalidate sessions or
    // drop queued jobs across all tenants.
    if !is_managed_cache_key(&key) {
        return Err(Error::BadRequest("仅允许删除受管理的缓存键".to_string()));
    }
    // Bypass ctx.cache.remove (which would also hit non-cache keys) and DEL
    // directly so the prefix guard is enforced at the Redis level.
    let mut conn = redis_connect().await.map_err(|e| Error::string(&e))?;
    let deleted: i64 = redis::cmd("DEL")
        .arg(&key)
        .query_async(&mut conn)
        .await
        .map_err(|e| Error::string(&e.to_string()))?;
    format::json(serde_json::json!({"ok": true, "deleted": deleted}))
}

#[debug_handler]
async fn clear_all(
    _auth: auth::JWT,
    State(_ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_platform_admin(
        &_auth,
        &tenant.code,
        "system:cache:read",
        "缓存管理仅对平台租户管理员开放",
    )?;
    // Do NOT call ctx.cache.clear(): the Redis driver implements it as
    // FLUSHDB, which wipes the entire database including session tokens, job
    // queues, and rate-limit counters for every tenant. Instead, delete only
    // managed cache prefixes (same scoping used by the syncer worker).
    let mut conn = redis_connect().await.map_err(|e| Error::string(&e))?;
    let keys = collect_managed_keys(&mut conn, MAX_CLEAR_KEYS)
        .await
        .map_err(|e| Error::string(&e.to_string()))?;
    let mut deleted: u64 = 0;
    if !keys.is_empty() {
        let n: u64 = redis::cmd("DEL")
            .arg(keys)
            .query_async(&mut conn)
            .await
            .map_err(|e| Error::string(&e.to_string()))?;
        deleted += n;
    }
    format::json(serde_json::json!({"ok": true, "deleted": deleted}))
}

fn redis_url() -> String {
    std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1".to_string())
}

async fn redis_connect() -> Result<redis::aio::MultiplexedConnection, String> {
    let client =
        redis::Client::open(redis_url().as_str()).map_err(|e| format!("Redis连接失败: {e}"))?;
    client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| format!("Redis连接超时: {e}"))
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/cache")
        .add("/", get(list_keys))
        .add("/{key}", delete(delete_key))
        .add("/clear", post(clear_all))
}
