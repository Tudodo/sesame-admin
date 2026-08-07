use axum::{
    extract::Request,
    http::{Method, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};

const CSRF_HEADER: &str = "x-csrf-token";

/// Double-submit CSRF protection for requests authenticated through the
/// HttpOnly session cookie. API clients that still authenticate with
/// `Authorization: Bearer ...` do not need this check.
pub async fn csrf_middleware(req: Request, next: Next) -> Result<Response, Response> {
    if !crate::middleware::is_public_auth_request(&req)
        && is_state_changing(req.method())
        && has_auth_cookie(&req)
        && !has_bearer(&req)
    {
        let cookie_token =
            crate::middleware::cookie_value(req.headers(), crate::middleware::CSRF_COOKIE_NAME);
        let header_token = req
            .headers()
            .get(CSRF_HEADER)
            .and_then(|v| v.to_str().ok())
            .map(|v| v.trim().to_string());

        if cookie_token.is_none() || header_token != cookie_token {
            return Err((
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({
                    "error": "csrf_missing",
                    "message": "CSRF token missing or invalid"
                })),
            )
                .into_response());
        }
    }
    Ok(next.run(req).await)
}

fn is_state_changing(method: &Method) -> bool {
    matches!(
        method,
        &Method::POST | &Method::PUT | &Method::PATCH | &Method::DELETE
    )
}

fn has_auth_cookie(req: &Request) -> bool {
    crate::middleware::cookie_value(req.headers(), crate::middleware::AUTH_COOKIE_NAME).is_some()
}

fn has_bearer(req: &Request) -> bool {
    req.headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.trim().starts_with("Bearer ") || v.trim().starts_with("bearer "))
        .unwrap_or(false)
}

/// Generate a fresh double-submit CSRF token that is only kept in the
/// JS-readable cookie and the in-memory document cookie store.
pub fn generate_csrf_token() -> String {
    use rand::{rngs::OsRng, RngCore};
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
