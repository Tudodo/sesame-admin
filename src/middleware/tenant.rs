use axum::{extract::Request, extract::State, middleware::Next, response::Response};
use loco_rs::app::AppContext;

/// Default tenant code used when no `X-Tenant-Code` header is present.
pub const DEFAULT_TENANT_CODE: &str = "default";

/// Tenant scope stored in request extensions
#[derive(Clone, Debug)]
pub struct TenantScope {
    pub code: String,
}

/// Tenant isolation middleware: extracts `X-Tenant-Code` header
/// and injects it into request extensions for downstream use.
///
/// For unauthenticated requests (login, captcha) this header is the only
/// source of the tenant code. For authenticated requests, prefer
/// [`tenant_from_jwt_middleware`], which overrides this with the tenant bound
/// into the JWT — preventing header forgery.
pub async fn tenant_middleware(mut req: Request, next: Next) -> Result<Response, Response> {
    let tenant_code = req
        .headers()
        .get("x-tenant-code")
        .and_then(|v| v.to_str().ok())
        .unwrap_or(DEFAULT_TENANT_CODE)
        .to_string();

    req.extensions_mut()
        .insert(TenantScope { code: tenant_code });
    Ok(next.run(req).await)
}

/// Override `TenantScope` with the tenant bound into the JWT, if present.
///
/// Runs after [`tenant_middleware`] so the header-based default still works for
/// unauthenticated endpoints. For any request carrying a valid JWT (Bearer
/// header or `loco_token` cookie) whose claims include a `tenant` field, that
/// field wins — the user-controlled `X-Tenant-Code` header is ignored. This
/// closes the cross-tenant data-access hole where a user could forge the header
/// to read another tenant's rows.
///
/// Token signature is verified here so a tampered `tenant` claim cannot be
/// injected. The per-handler `auth::JWT` extractor also verifies independently.
pub async fn tenant_from_jwt_middleware(
    State(ctx): State<AppContext>,
    mut req: Request,
    next: Next,
) -> Result<Response, Response> {
    // Public auth flows use the explicit tenant selection (header/localStorage),
    // never a tenant bound into a stale session cookie.
    if !crate::middleware::is_public_auth_request(&req) {
        if let Some(token) = crate::middleware::extract_auth_token(&req) {
            if let Some(tenant) = decode_tenant_claim(&ctx, &token).await {
                req.extensions_mut().insert(TenantScope { code: tenant });
            }
        }
    }
    Ok(next.run(req).await)
}

/// Decode the JWT payload (with signature verification) and return the
/// `tenant` claim. This ensures the tenant scope cannot be forged via a
/// tampered token.
async fn decode_tenant_claim(ctx: &AppContext, token: &str) -> Option<String> {
    let claims = crate::middleware::decode_verified_claims(ctx, token)?;
    claims
        .get("tenant")
        .and_then(|v| v.as_str())
        .map(String::from)
}

/// Helper: extract tenant code from request extensions
pub fn get_tenant_code(ext: &axum::http::Extensions) -> String {
    ext.get::<TenantScope>()
        .map(|t| t.code.clone())
        .unwrap_or_else(|| DEFAULT_TENANT_CODE.into())
}
