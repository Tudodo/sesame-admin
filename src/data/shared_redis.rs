use redis::aio::ConnectionManager;
use redis::AsyncCommands;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::LazyLock;
use tokio::sync::OnceCell;

/// Shared Redis for cross-instance runtime state.
///
/// The application already requires Redis for its queue, so this module uses
/// the same `REDIS_URL` without introducing a second service. Keys are
/// namespaced with `loco-shared` so they never collide with queue or cache
/// keys stored in the same Redis instance.
const KEY_PREFIX: &str = "loco-shared";

/// Each Loco test boots in its own tokio runtime. A long-lived ConnectionManager
/// created in one test runtime cannot be reused after that runtime shuts down,
/// so test boots use a fresh manager per operation instead.
static TEST_MODE: AtomicBool = AtomicBool::new(false);

static MANAGER: OnceCell<ConnectionManager> = OnceCell::const_new();

static INCR_WITH_EXPIRY: LazyLock<redis::Script> = LazyLock::new(|| {
    redis::Script::new(
        r#"
local current = redis.call('INCR', KEYS[1])
if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
"#,
    )
});

static GET_AND_DELETE: LazyLock<redis::Script> = LazyLock::new(|| {
    redis::Script::new(
        r#"
local value = redis.call('GET', KEYS[1])
if value then
    redis.call('DEL', KEYS[1])
end
return value
"#,
    )
});

fn redis_url() -> String {
    std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1".to_string())
}

fn key(scope: &str, name: &str) -> String {
    format!("{KEY_PREFIX}:{scope}:{name}")
}

fn redis_error(e: redis::RedisError) -> loco_rs::Error {
    loco_rs::Error::msg(e)
}

async fn manager() -> Result<ConnectionManager, loco_rs::Error> {
    if TEST_MODE.load(Ordering::Relaxed) {
        let client = redis::Client::open(redis_url().as_str()).map_err(loco_rs::Error::msg)?;
        return client
            .get_connection_manager()
            .await
            .map_err(loco_rs::Error::msg);
    }
    Ok(MANAGER
        .get_or_try_init(|| async {
            let client = redis::Client::open(redis_url().as_str()).map_err(loco_rs::Error::msg)?;
            client
                .get_connection_manager()
                .await
                .map_err(loco_rs::Error::msg)
        })
        .await?
        .clone())
}

/// Switch to per-operation managers for isolated test runtimes.
pub fn set_test_mode(enabled: bool) {
    TEST_MODE.store(enabled, Ordering::Relaxed);
}

/// Set a namespaced key with an expiry.
pub async fn set(
    scope: &str,
    name: &str,
    value: &str,
    ttl_secs: u64,
) -> Result<(), loco_rs::Error> {
    let mut conn = manager().await?;
    conn.set_ex(key(scope, name), value, ttl_secs)
        .await
        .map_err(redis_error)
}

/// Read a namespaced key.
pub async fn get(scope: &str, name: &str) -> Result<Option<String>, loco_rs::Error> {
    let mut conn = manager().await?;
    conn.get(key(scope, name)).await.map_err(redis_error)
}

/// Delete a namespaced key.
pub async fn delete(scope: &str, name: &str) -> Result<(), loco_rs::Error> {
    let mut conn = manager().await?;
    conn.del(key(scope, name)).await.map_err(redis_error)
}

/// Atomically increment a key and set its expiry only on the first increment.
pub async fn incr_with_expiry(
    scope: &str,
    name: &str,
    ttl_secs: u64,
) -> Result<i64, loco_rs::Error> {
    let mut conn = manager().await?;
    let mut invocation = INCR_WITH_EXPIRY.key(key(scope, name));
    invocation.arg(ttl_secs);
    invocation
        .invoke_async(&mut conn)
        .await
        .map_err(redis_error)
}

/// Atomically read and delete a namespaced key.
pub async fn get_and_delete(scope: &str, name: &str) -> Result<Option<String>, loco_rs::Error> {
    let mut conn = manager().await?;
    GET_AND_DELETE
        .key(key(scope, name))
        .invoke_async(&mut conn)
        .await
        .map_err(redis_error)
}

/// Delete all keys under a scope. Used by dictionary writes where the invalidation
/// has to cover every tenant/dict_code key rather than one exact key.
pub async fn delete_by_prefix(scope: &str) -> Result<(), loco_rs::Error> {
    let mut conn = manager().await?;
    let pattern = format!("{KEY_PREFIX}:{scope}:*");
    let mut keys = Vec::new();
    {
        let mut iter = conn
            .scan_match::<_, String>(pattern)
            .await
            .map_err(redis_error)?;
        while let Some(key) = iter.next_item().await {
            keys.push(key);
        }
    }
    if !keys.is_empty() {
        conn.del::<_, ()>(keys).await.map_err(redis_error)?;
    }
    Ok(())
}
