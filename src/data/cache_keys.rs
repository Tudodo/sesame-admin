/// Cache namespaces that are safe to enumerate and delete from the shared
/// Redis instance.
///
/// The Redis instance also stores queue jobs, session revocations, rate-limit
/// counters, captchas and monitor samples. Cache administration must never
/// touch those runtime keys, so only explicit cache namespaces are managed.
pub const MANAGED_CACHE_PREFIXES: [&str; 2] = ["cache:", "loco-shared:dict_cache:"];

/// Return true when a Redis key belongs to a managed cache namespace.
pub fn is_managed_cache_key(key: &str) -> bool {
    MANAGED_CACHE_PREFIXES
        .iter()
        .any(|prefix| key.starts_with(prefix))
}

#[cfg(test)]
mod tests {
    use super::{is_managed_cache_key, MANAGED_CACHE_PREFIXES};

    #[test]
    fn recognizes_managed_cache_prefixes() {
        assert_eq!(MANAGED_CACHE_PREFIXES.len(), 2);
        assert!(is_managed_cache_key("cache:tenant:dict"));
        assert!(is_managed_cache_key(
            "loco-shared:dict_cache:default:gender"
        ));
    }

    #[test]
    fn excludes_runtime_redis_keys() {
        assert!(!is_managed_cache_key("loco-shared:session:revoked:user-1"));
        assert!(!is_managed_cache_key("loco-shared:mail_rate:user-1"));
        assert!(!is_managed_cache_key("loco-shared:captcha:abc"));
        assert!(!is_managed_cache_key("loco-shared:monitor:cpu"));
        assert!(!is_managed_cache_key("job:abc"));
        assert!(!is_managed_cache_key("queue:default"));
        assert!(!is_managed_cache_key("processing:abc"));
    }
}
