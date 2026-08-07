use axum::{
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
};
use std::sync::atomic::{AtomicBool, Ordering};

/// Global login rate limit backed by shared Redis. Each attempt atomically
/// increments a key whose TTL starts on the first request, so the same budget
/// is enforced across every application instance.
const MAX_ATTEMPTS: u32 = 10;
const WINDOW_SECS: u64 = 300;

/// Test runs boot many app instances against the same shared Redis and must not
/// be blocked by production-style login budgets accumulated by the suite.
static DISABLED: AtomicBool = AtomicBool::new(false);

/// Extract client IP from request headers.
///
/// When `TRUSTED_PROXIES` is set (comma-separated IP list, exact match —
/// CIDR notation is not supported), the
/// `X-Forwarded-For` header is parsed right-to-left, skipping IPs that match
/// a trusted proxy, and the first untrusted IP is used as the client IP. This
/// prevents an attacker from injecting a fake `X-Forwarded-For` value to
/// bypass rate limiting.
///
/// When `TRUSTED_PROXIES` is unset (default), `X-Real-IP` is preferred over
/// `X-Forwarded-For` because the reverse proxy sets `X-Real-IP` to the actual
/// client and is harder to forge than `X-Forwarded-For` (which clients can
/// pre-populate). If neither header is present, `"unknown"` is used.
pub fn client_ip(headers: &axum::http::HeaderMap) -> String {
    let trusted_proxies = trusted_proxies();

    let xff = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok());
    let x_real_ip = headers.get("x-real-ip").and_then(|v| v.to_str().ok());

    if let Some(ref proxies) = trusted_proxies {
        // Trusted-proxy mode: walk XFF right-to-left, skip trusted proxies.
        if let Some(xff) = xff {
            let parts: Vec<&str> = xff.split(',').map(|s| s.trim()).collect();
            for ip in parts.iter().rev() {
                if !proxies.iter().any(|p| p == ip) {
                    return ip.to_string();
                }
            }
        }
        // All XFF entries were trusted proxies, or no XFF: fall back to X-Real-IP.
        return x_real_ip.unwrap_or("unknown").trim().to_string();
    }

    // Non-trusted-proxy mode: prefer X-Real-IP (set by the reverse proxy to the
    // actual client), fall back to the leftmost XFF entry.
    if let Some(real_ip) = x_real_ip {
        return real_ip.trim().to_string();
    }
    xff.and_then(|v| v.split(',').next())
        .unwrap_or("unknown")
        .trim()
        .to_string()
}

/// Parse `TRUSTED_PROXIES` env var into a list of IP strings.
/// Returns None if unset/empty (non-trusted-proxy mode).
fn trusted_proxies() -> Option<Vec<String>> {
    let raw = std::env::var("TRUSTED_PROXIES").unwrap_or_default();
    let list: Vec<String> = raw
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    if list.is_empty() {
        None
    } else {
        Some(list)
    }
}

/// Check if IP is rate-limited. Returns true if over limit.
pub async fn check_rate_limit(ip: &str) -> Result<bool, loco_rs::Error> {
    if is_disabled() {
        return Ok(false);
    }
    let count = crate::data::shared_redis::incr_with_expiry(
        "rate_limit",
        &format!("login:{ip}"),
        WINDOW_SECS,
    )
    .await?;
    Ok(count > MAX_ATTEMPTS as i64)
}

/// Enable or disable the login rate limit. Disabled only from the test hook;
/// production and development boots keep the default enabled state.
pub fn set_disabled(disabled: bool) {
    DISABLED.store(disabled, Ordering::Relaxed);
}

fn is_disabled() -> bool {
    DISABLED.load(Ordering::Relaxed)
}

/// Middleware: rate-limit login endpoint by client IP.
pub async fn login_rate_limit(req: Request, next: Next) -> Result<Response, Response> {
    let ip = client_ip(req.headers());
    match check_rate_limit(&ip).await {
        Ok(false) => Ok(next.run(req).await),
        Ok(true) => {
            let body = serde_json::json!({"error":"rate_limited","message":"Too many attempts. Try again in 5 minutes."});
            Err((StatusCode::TOO_MANY_REQUESTS, axum::Json(body)).into_response())
        }
        Err(e) => {
            tracing::error!(error = %e, ip = %ip, "login rate-limit check failed");
            Err((
                StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(serde_json::json!({
                    "error": "rate_limit_store_unavailable",
                    "message": "限流服务暂不可用，请稍后重试"
                })),
            )
                .into_response())
        }
    }
}
