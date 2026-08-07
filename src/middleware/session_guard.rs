use axum::{
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
};
use loco_rs::app::AppContext;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};

/// Revoke all sessions for every user in a tenant, forcing their JWTs to be
/// revalidated on the next request. Used when a tenant is disabled or deleted.
pub async fn revoke_users_in_tenant(
    db: &sea_orm::DatabaseConnection,
    tenant_code: &str,
) -> Result<(), loco_rs::Error> {
    let users = crate::models::_entities::users::Entity::find()
        .filter(crate::models::_entities::users::Column::TenantId.eq(tenant_code))
        .all(db)
        .await
        .map_err(loco_rs::Error::wrap)?;
    for user in users {
        revoke_user(&user.pid.to_string()).await?;
    }
    Ok(())
}

/// Redis-backed token revocation store: maps user_id → Unix timestamp when revoked.
/// When a user is kicked or logs out, their entry is added here.
/// Any JWT issued before the revocation time is rejected.
///
/// The key expires after `REVOCATION_TTL_SECS`, which is intentionally longer
/// than the default JWT lifetime (7 days) so a revoked token cannot become
/// valid again just because the revocation marker expired first.
const REVOCATION_TTL_SECS: u64 = 30 * 24 * 60 * 60;

/// Revoke all sessions for a user. Next request with a JWT issued before now will be rejected.
pub async fn revoke_user(user_id: &str) -> Result<(), loco_rs::Error> {
    let now = chrono::Utc::now().timestamp();
    crate::data::shared_redis::set(
        "session",
        &format!("revoked:{user_id}"),
        &now.to_string(),
        REVOCATION_TTL_SECS,
    )
    .await
}

/// Check if a user's token is still valid (not revoked).
/// `token_issued_at` is the Unix timestamp (seconds) when the JWT was issued.
pub async fn is_session_valid(user_id: &str, token_issued_at: i64) -> Result<bool, loco_rs::Error> {
    let Some(revoked_at) =
        crate::data::shared_redis::get("session", &format!("revoked:{user_id}")).await?
    else {
        return Ok(true);
    };
    Ok(revoked_at
        .parse::<i64>()
        .map(|revoked_at| token_issued_at > revoked_at)
        .unwrap_or(false))
}

/// Global middleware that rejects revoked JWTs before handlers run.
///
/// This keeps the revocation check shared across all API endpoints without
/// changing every permission helper to carry an `AppContext`. The JWT
/// extractor still validates signature/expiry; this middleware only adds the
/// Redis-backed "was this token issued before a user-level revoke?" check.
pub async fn session_middleware(
    State(ctx): State<AppContext>,
    req: Request,
    next: Next,
) -> Result<Response, Response> {
    // Public auth flows must ignore an old revoked cookie. Otherwise a user who
    // was signed out cannot log in again until the HttpOnly cookie is replaced.
    if crate::middleware::is_public_auth_request(&req) {
        return Ok(next.run(req).await);
    }
    let Some((pid, token_issued_at)) = decode_session_claims(&ctx, &req) else {
        return Ok(next.run(req).await);
    };
    match is_session_valid(&pid, token_issued_at).await {
        Ok(true) => Ok(next.run(req).await),
        Ok(false) => Err(session_revoked_error().into_response()),
        Err(e) => {
            tracing::error!(error = %e, "session revocation check failed");
            Err((
                StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(serde_json::json!({
                    "error": "session_store_unavailable",
                    "message": "会话状态服务暂不可用，请稍后重试"
                })),
            )
                .into_response())
        }
    }
}

fn decode_session_claims(ctx: &AppContext, req: &Request) -> Option<(String, i64)> {
    let token = crate::middleware::extract_auth_token(req)?;
    let jwt_config = ctx.config.get_jwt_config().ok()?;
    let token_data = jsonwebtoken::decode::<serde_json::Value>(
        token.trim(),
        &jsonwebtoken::DecodingKey::from_base64_secret(&jwt_config.secret).ok()?,
        &jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::HS512),
    )
    .ok()?;
    let pid = token_data
        .claims
        .get("pid")
        .or_else(|| token_data.claims.get("sub"))?
        .as_str()?
        .to_string();
    let token_issued_at = token_data
        .claims
        .get("iat")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    Some((pid, token_issued_at))
}

/// Build the 403 response used when the request token is valid but the
/// session has been revoked. 401 remains reserved for invalid/expired tokens,
/// so the frontend can treat it as session expiry and redirect to login.
pub fn session_revoked_error() -> loco_rs::Error {
    use axum::http::StatusCode;
    use loco_rs::controller::ErrorDetail;
    loco_rs::Error::CustomError(
        StatusCode::FORBIDDEN,
        ErrorDetail::new("forbidden", "会话已被注销，请重新登录"),
    )
}
