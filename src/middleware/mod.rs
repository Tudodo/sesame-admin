pub mod cors;
pub mod csrf;
pub mod rate_limiter;
pub mod session_guard;
pub mod tenant;

use axum::{extract::Request, middleware::Next, response::Response};
use loco_rs::app::AppContext;
use std::time::Instant;

/// Decode a project-issued JWT with the same HS512/base64 settings used by
/// Loco's token generator. Returns the verified claims map, or `None` when
/// the token is missing, malformed, or has an invalid signature.
pub fn decode_verified_claims(
    ctx: &AppContext,
    token: &str,
) -> Option<serde_json::Map<String, serde_json::Value>> {
    let jwt_config = ctx.config.get_jwt_config().ok()?;
    let token_data = jsonwebtoken::decode::<serde_json::Value>(
        token.trim(),
        &jsonwebtoken::DecodingKey::from_base64_secret(&jwt_config.secret).ok()?,
        &jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::HS512),
    )
    .ok()?;
    token_data.claims.as_object().cloned()
}

/// Public authentication/captcha requests that must ignore stale session cookies.
/// Browsers send the HttpOnly `loco_token` cookie on every request. If that old
/// session was revoked, login/register/forgot/reset must still reach the handler
/// so it can validate the submitted credentials and issue a fresh session.
pub fn is_public_auth_request(req: &Request) -> bool {
    let path = req.uri().path();
    path == "/api/auth/login"
        || path == "/api/auth/register"
        || path == "/api/auth/forgot"
        || path == "/api/auth/reset"
        || path == "/api/auth/public-tenants"
        || path == "/api/auth/magic-link"
        || path == "/api/auth/resend-verification-mail"
        || path.starts_with("/api/auth/verify/")
        || path.starts_with("/api/auth/magic-link/")
        || path == "/api/captcha"
        || path.starts_with("/api/captcha/")
}

/// Cookie name used by the HttpOnly JWT session cookie.
pub const AUTH_COOKIE_NAME: &str = "loco_token";
/// Cookie name used by the JS-readable CSRF token paired with the session cookie.
pub const CSRF_COOKIE_NAME: &str = "loco_csrf";

/// Extract a JWT from the Authorization header or the HttpOnly session cookie.
pub fn extract_auth_token(req: &Request) -> Option<String> {
    if let Some(value) = req.headers().get(axum::http::header::AUTHORIZATION) {
        if let Ok(value) = value.to_str() {
            if let Some(token) = value
                .strip_prefix("Bearer ")
                .or_else(|| value.strip_prefix("bearer "))
            {
                return Some(token.trim().to_string());
            }
        }
    }
    cookie_value(req.headers(), AUTH_COOKIE_NAME)
}

/// Read a single cookie value from request headers.
pub fn cookie_value(headers: &axum::http::HeaderMap, name: &str) -> Option<String> {
    let cookie_header = headers.get(axum::http::header::COOKIE)?.to_str().ok()?;
    cookie_header.split(';').find_map(|part| {
        let (key, value) = part.trim().split_once('=')?;
        (key == name).then(|| value.trim().to_string())
    })
}

pub fn auth_cookie_header_value(token: &str, max_age: u64, secure: bool) -> String {
    cookie_header_value(AUTH_COOKIE_NAME, token, max_age, true, secure)
}

pub fn csrf_cookie_header_value(token: &str, max_age: u64, secure: bool) -> String {
    cookie_header_value(CSRF_COOKIE_NAME, token, max_age, false, secure)
}

pub fn clear_cookie_header_value(name: &str, http_only: bool, secure: bool) -> String {
    let mut value = format!(
        "{name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict"
    );
    if http_only {
        value.push_str("; HttpOnly");
    }
    if secure {
        value.push_str("; Secure");
    }
    value
}

fn cookie_header_value(
    name: &str,
    value: &str,
    max_age: u64,
    http_only: bool,
    secure: bool,
) -> String {
    let mut cookie = format!("{name}={value}; Path=/; Max-Age={max_age}; SameSite=Strict");
    if http_only {
        cookie.push_str("; HttpOnly");
    }
    if secure {
        cookie.push_str("; Secure");
    }
    cookie
}

/// Auto-log every API request to sys_oper_log.
/// Attach via `router.layer(from_fn_with_state(ctx, audit_middleware))`.
pub async fn audit_middleware(
    ctx: axum::extract::State<AppContext>,
    req: Request,
    next: Next,
) -> Response {
    let start = Instant::now();
    let method_for_log = req.method().to_string();
    let uri_for_log = req.uri().to_string();
    // Use the shared, forgery-resistant client-IP extractor (same logic as
    // rate limiting) so oper_log records the real client IP, not a
    // client-supplied X-Forwarded-For value that could mislead auditors.
    let ip = crate::middleware::rate_limiter::client_ip(req.headers());

    // Tenant is already resolved by tenant middleware from the verified JWT
    // (or the header default for unauthenticated auth flows). Trusting the
    // `TenantScope` extension here means a client cannot forge the tenant
    // recorded in the audit log by sending a different X-Tenant-Code header.
    let tenant_code = req
        .extensions()
        .get::<crate::middleware::tenant::TenantScope>()
        .map(|scope| scope.code.clone())
        .unwrap_or_else(|| crate::middleware::tenant::DEFAULT_TENANT_CODE.to_string());

    // Extract user_id from JWT (best-effort): unauthenticated requests
    // (login, captcha) have no token, so user_id stays None. For authenticated
    // requests the `pid` claim holds the user's PID. This makes the audit
    // trail attributable — without it, oper_log only records method/uri/ip,
    // making it impossible to trace which user performed a sensitive action.
    let user_id = extract_user_id_from_jwt(&ctx, &req);

    let resp = next.run(req).await;
    let elapsed_ms = start.elapsed().as_millis() as i64;
    let status_code = resp.status().as_u16() as i32;

    let db = ctx.db.clone();
    let _handle = tokio::spawn(async move {
        let status = if status_code < 400 { 1 } else { 0 };
        let title = format!("{} {}", method_for_log, uri_for_log);
        crate::models::oper_log::Model::record(
            &db,
            &title,
            &method_for_log,
            &uri_for_log,
            &ip,
            status,
            elapsed_ms,
            &tenant_code,
            None,
            "system",
            user_id.as_deref(),
        )
        .await;
    });
    std::mem::drop(_handle);

    resp
}

/// Best-effort extraction of the user PID (`pid` claim) from the JWT in the
/// Authorization header. Returns None for unauthenticated requests or when
/// the token is missing/invalid. Signature is verified so a forged `pid`
/// claim cannot pollute the audit log.
fn extract_user_id_from_jwt(
    ctx: &loco_rs::app::AppContext,
    req: &axum::extract::Request,
) -> Option<String> {
    let token = extract_auth_token(req)?;
    decode_verified_claims(ctx, &token)?
        .get("pid")
        .and_then(|v| v.as_str())
        .map(String::from)
}
