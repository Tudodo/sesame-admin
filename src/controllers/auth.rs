use crate::middleware::tenant::TenantScope;
use crate::models::_entities::user_sessions;
use crate::{
    mailers::auth::AuthMailer,
    models::{
        _entities::users,
        users::{LoginParams, RegisterParams},
    },
    views::auth::{CurrentResponse, LoginResponse},
};
use axum::http::HeaderMap;
use axum::Extension;
use loco_rs::prelude::*;

fn get_ip(headers: &HeaderMap) -> String {
    // Delegate to the shared, forgery-resistant client-IP extractor so login
    // logs and online-session records use the same logic as rate limiting
    // (TRUSTED_PROXIES-aware, X-Real-IP preference). Previously this read the
    // raw leftmost X-Forwarded-For entry, which a client can pre-populate to
    // spoof the IP recorded in audit logs.
    crate::middleware::rate_limiter::client_ip(headers)
}

fn get_ua(headers: &HeaderMap) -> &str {
    headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
}

use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

pub static EMAIL_DOMAIN_RE: OnceLock<Option<Regex>> = OnceLock::new();

/// Build the allowed-email-domain regex from the `MAGIC_LINK_ALLOWED_DOMAINS`
/// environment variable (comma-separated, e.g. "example.com,gmail.com").
///
/// Returns `None` when the variable is unset or empty, meaning all domains
/// are allowed (open registration). When set, only emails ending with one of
/// the listed domains pass the magic-link gate.
fn build_allow_email_domain_re(raw: &str) -> Option<Regex> {
    if raw.trim().is_empty() {
        return None;
    }
    // Build alternation of escaped domains and require an exact domain match,
    // so example.com does not also accept evilexample.com.
    let patterns: Vec<String> = raw
        .split(',')
        .map(|d| d.trim())
        .filter(|d| !d.is_empty())
        .map(|d| format!("@(?:{})$", regex::escape(d)))
        .collect();
    if patterns.is_empty() {
        return None;
    }
    Some(Regex::new(&patterns.join("|")).expect("Failed to compile domain regex"))
}

fn get_allow_email_domain_re() -> &'static Option<Regex> {
    EMAIL_DOMAIN_RE.get_or_init(|| {
        build_allow_email_domain_re(
            &std::env::var("MAGIC_LINK_ALLOWED_DOMAINS").unwrap_or_default(),
        )
    })
}

const MIN_PASSWORD_LENGTH: usize = 8;
/// bcrypt truncates input at 72 bytes; reject longer passwords to avoid
/// silent truncation that could confuse users.
const MAX_PASSWORD_LENGTH: usize = 72;

pub(crate) fn validate_password_strength(password: &str) -> Result<()> {
    if password.len() < MIN_PASSWORD_LENGTH {
        return Err(Error::BadRequest(format!(
            "Password must be at least {} characters",
            MIN_PASSWORD_LENGTH
        )));
    }
    if password.len() > MAX_PASSWORD_LENGTH {
        return Err(Error::BadRequest(format!(
            "Password must not exceed {} characters",
            MAX_PASSWORD_LENGTH
        )));
    }
    let has_upper = password.chars().any(|c| c.is_uppercase());
    let has_lower = password.chars().any(|c| c.is_lowercase());
    let has_digit = password.chars().any(|c| c.is_ascii_digit());
    if !has_upper || !has_lower || !has_digit {
        return Err(Error::BadRequest(
            "Password must contain at least one uppercase letter, one lowercase letter, and one digit"
                .to_string(),
        ));
    }
    Ok(())
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ForgotParams {
    pub email: String,
}
#[derive(Debug, Deserialize, Serialize)]
pub struct ResetParams {
    pub token: String,
    pub password: String,
}
#[derive(Debug, Deserialize, Serialize)]
pub struct MagicLinkParams {
    pub email: String,
}
#[derive(Debug, Deserialize, Serialize)]
pub struct ResendVerificationParams {
    pub email: String,
}

#[debug_handler]
async fn register(
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(mut params): Json<RegisterParams>,
) -> Result<Response> {
    reject_disabled_tenant(&ctx, &tenant.code).await?;
    validate_password_strength(&params.password)?;
    // Public sign-up may never self-assign roles, departments or positions.
    // Those are tenant-scoped privileged assignments and are only accepted by
    // the authenticated admin user-creation/update endpoints, which validate
    // every id against the current tenant before writing relations.
    params.role_ids = None;
    params.department_id = None;
    params.department_ids = None;
    params.position_ids = None;
    params.manager_pid = None;
    let tenant_code = tenant.code.clone();
    let res = users::Model::create_with_password(&ctx.db, &params, Some(&tenant_code)).await;
    let user = match res {
        Ok(user) => user,
        Err(err) => {
            tracing::info!(
                message = err.to_string(),
                user_email = &params.email,
                "could not register user"
            );
            return format::json(());
        }
    };
    let user = user
        .into_active_model()
        .set_email_verification_sent(&ctx.db)
        .await?;
    AuthMailer::send_welcome(&ctx, &user).await?;
    format::json(())
}

#[debug_handler]
async fn verify(Path(token): Path<String>, State(ctx): State<AppContext>) -> Result<Response> {
    let Ok(user) = users::Model::find_by_verification_token(&ctx.db, &token).await else {
        return unauthorized("invalid token");
    };
    if user.email_verified_at.is_some() {
        tracing::info!(pid = user.pid.to_string(), "user already verified");
    } else {
        let user = user.into_active_model().verified(&ctx.db).await?;
        tracing::info!(pid = user.pid.to_string(), "user verified");
    }
    format::json(())
}

#[debug_handler]
async fn forgot(
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(params): Json<ForgotParams>,
) -> Result<Response> {
    // 停用租户不应发送密码重置邮件。
    reject_disabled_tenant(&ctx, &tenant.code).await?;
    let Ok(user) =
        users::Model::find_by_email_in_tenant(&ctx.db, &params.email, &tenant.code).await
    else {
        return format::json(());
    };
    let user = user
        .into_active_model()
        .set_forgot_password_sent(&ctx.db)
        .await?;
    AuthMailer::forgot_password(&ctx, &user).await?;
    format::json(())
}

#[debug_handler]
async fn reset(
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(params): Json<ResetParams>,
) -> Result<Response> {
    validate_password_strength(&params.password)?;
    reject_disabled_tenant(&ctx, &tenant.code).await?;
    let Ok(user) = users::Model::find_by_reset_token(&ctx.db, &params.token).await else {
        return format::json(());
    };
    // 校验 token 对应的用户归属当前请求租户，避免跨租户重置密码。
    if user.tenant_id.as_deref() != Some(tenant.code.as_str()) {
        return format::json(());
    }
    let pid = user.pid.to_string();
    user.into_active_model()
        .reset_password(&ctx.db, &params.password)
        .await?;
    // Invalidate all existing sessions so stolen tokens are immediately useless.
    crate::middleware::session_guard::revoke_user(&pid).await?;
    format::json(())
}

/// Reject requests targeting a disabled tenant. Used by register/forgot/reset
/// to mirror the login & magic-link tenant-enabled checks, so a disabled
/// tenant cannot issue new accounts or password-reset emails.
async fn reject_disabled_tenant(ctx: &AppContext, tenant_code: &str) -> Result<()> {
    if let Ok(t) = crate::models::tenants::Model::find_by_code(&ctx.db, tenant_code).await {
        if !t.is_enabled() {
            return Err(Error::BadRequest("该租户已停用".to_string()));
        }
    }
    Ok(())
}

/// Parse a UUID pid string from JWT claims, returning an error response on parse failure.
fn parse_pid(pid_str: &str) -> Result<uuid::Uuid> {
    pid_str
        .parse::<uuid::Uuid>()
        .map_err(|_| Error::string("Invalid user PID in token"))
}

#[debug_handler]
async fn login(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    Extension(tenant): Extension<TenantScope>,
    Json(params): Json<LoginParams>,
) -> Result<Response> {
    // Rate limiting is enforced by the login_rate_limit middleware applied
    // via route_layer in routes(). No duplicate check here — calling
    // check_rate_limit twice per request would double-count each attempt,
    // effectively halving the configured threshold.
    let tenant_code = tenant.code.clone();
    // 拒绝已停用租户的登录，避免被禁用的租户继续产生新会话。
    if let Ok(t) = crate::models::tenants::Model::find_by_code(&ctx.db, &tenant_code).await {
        if !t.is_enabled() {
            return unauthorized("Invalid credentials!");
        }
    }
    let Ok(user) =
        users::Model::find_by_email_in_tenant(&ctx.db, &params.email, &tenant_code).await
    else {
        crate::controllers::login_log::record_login(
            &ctx.db,
            &params.email,
            None,
            &get_ip(&headers),
            get_ua(&headers),
            1,
            Some("User not found"),
            &tenant_code,
        )
        .await;
        return unauthorized("Invalid credentials!");
    };

    if !user.verify_password(&params.password) {
        crate::controllers::login_log::record_login(
            &ctx.db,
            &user.name,
            Some(user.pid.to_string()),
            &get_ip(&headers),
            get_ua(&headers),
            1,
            Some("Wrong password"),
            &tenant_code,
        )
        .await;
        tracing::warn!(email = %params.email, "Password verification failed");
        return unauthorized("Invalid credentials!");
    }

    let jwt_secret = ctx.config.get_jwt_config()?;
    let login_token = user
        .build_login_token(
            &ctx.db,
            &jwt_secret.secret,
            jwt_secret.expiration,
            &tenant_code,
        )
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "JWT generation failed");
            Error::Unauthorized("JWT gen failed".to_string())
        })?;

    crate::controllers::online_users::create_session(
        &ctx.db,
        &user.pid.to_string(),
        &user.name,
        &get_ip(&headers),
        get_ua(&headers),
        &login_token.token,
        &tenant_code,
    )
    .await;

    let mut response = format::json(LoginResponse::new(
        &user,
        &login_token.token,
        login_token.role_names,
        login_token.menu_list,
        &login_token.menu_perm_map,
    ))?;
    let secure = matches!(
        ctx.environment,
        loco_rs::environment::Environment::Production
    );
    apply_auth_cookies(
        &mut response,
        &login_token.token,
        jwt_secret.expiration,
        secure,
    );

    let db2 = ctx.db.clone();
    let tc2 = tenant_code.clone();
    let name2 = user.name.clone();
    let pid2 = user.pid.to_string();
    let ip2 = get_ip(&headers);
    let ua2 = get_ua(&headers).to_string();
    tokio::spawn(async move {
        if let Err(e) = crate::controllers::login_log::record_login_result(
            &db2,
            &name2,
            Some(&pid2),
            &ip2,
            &ua2,
            0,
            Some("Login success"),
            &tc2,
        )
        .await
        {
            tracing::error!(error = %e, "Failed to record login success");
        }
    });
    Ok(response)
}

#[debug_handler]
async fn logout(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    crate::data::permissions::require_authenticated(&auth)?;
    let tenant_code = tenant.code.as_str();
    user_sessions::Model::delete_user_sessions(&ctx.db, &auth.claims.pid, tenant_code).await?;
    crate::middleware::session_guard::revoke_user(&auth.claims.pid).await?;
    let mut response = format::json(serde_json::json!({"ok": true}))?;
    let secure = matches!(
        ctx.environment,
        loco_rs::environment::Environment::Production
    );
    clear_auth_cookies(&mut response, secure);
    Ok(response)
}

/// Public list of enabled tenants (code + name only). Used by the login
/// page tenant selector so users can pick which tenant they're logging
/// into. No auth required — deliberately exposes only code/name of
/// tenants whose status is enabled.
#[debug_handler]
async fn public_tenants(State(ctx): State<AppContext>) -> Result<Response> {
    use crate::models::_entities::tenant;
    use sea_orm::{QueryOrder, QuerySelect};
    let tenants = tenant::Entity::find()
        .filter(tenant::Column::Status.eq("enabled"))
        .order_by(tenant::Column::Id, sea_orm::Order::Asc)
        .limit(100)
        .all(&ctx.db)
        .await?;
    let items: Vec<serde_json::Value> = tenants
        .into_iter()
        .map(|t| serde_json::json!({ "code": t.code, "name": t.name }))
        .collect();
    format::json(serde_json::Value::Array(items))
}

#[debug_handler]
async fn current(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    crate::data::permissions::require_authenticated(&auth)?;
    let pid = parse_pid(&auth.claims.pid)?;
    let Ok(user) = users::Model::find_by_pid_in_tenant(&ctx.db, pid, &tenant.code).await else {
        return unauthorized("user not found");
    };
    let user_roles = user
        .get_roles(&ctx.db, &tenant.code)
        .await
        .unwrap_or_default();
    let role_names: Vec<String> = user_roles.iter().map(|r| r.name.clone()).collect();
    let (menu_list, menu_perm_map) = user
        .get_menu_permissions(&ctx.db, &tenant.code)
        .await
        .unwrap_or_default();
    format::json(CurrentResponse::new(
        &user,
        role_names,
        menu_list,
        &menu_perm_map,
    ))
}

#[debug_handler]
async fn magic_link(
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(params): Json<MagicLinkParams>,
) -> Result<Response> {
    if let Some(ref email_regex) = get_allow_email_domain_re() {
        if !email_regex.is_match(&params.email) {
            return bad_request("invalid request");
        }
    }
    let Ok(user) =
        users::Model::find_by_email_in_tenant(&ctx.db, &params.email, &tenant.code).await
    else {
        return format::empty_json();
    };
    let user = user.into_active_model().create_magic_link(&ctx.db).await?;
    AuthMailer::send_magic_link(&ctx, &user).await?;
    format::empty_json()
}

#[debug_handler]
async fn magic_link_verify(
    Path(token): Path<String>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    headers: HeaderMap,
) -> Result<Response> {
    let Ok(user) = users::Model::find_by_magic_token(&ctx.db, &token).await else {
        return unauthorized("invalid magic link");
    };
    // 校验 token 对应的用户归属当前请求租户，避免跨租户验证 magic link token。
    if user.tenant_id.as_deref() != Some(tenant.code.as_str()) {
        return unauthorized("invalid magic link");
    }
    // 拒绝已停用租户的 magic link 登录。
    if let Ok(t) = crate::models::tenants::Model::find_by_code(&ctx.db, &tenant.code).await {
        if !t.is_enabled() {
            return unauthorized("invalid magic link");
        }
    }
    let user = user.into_active_model().clear_magic_link(&ctx.db).await?;

    let jwt_secret = ctx.config.get_jwt_config()?;
    let login_token = user
        .build_login_token(
            &ctx.db,
            &jwt_secret.secret,
            jwt_secret.expiration,
            &tenant.code,
        )
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "JWT generation failed");
            Error::Unauthorized("JWT gen failed".to_string())
        })?;

    // 与密码登录保持一致：记录在线会话与登录日志，便于在线用户管理与审计。
    let tenant_code = tenant.code.clone();
    crate::controllers::online_users::create_session(
        &ctx.db,
        &user.pid.to_string(),
        &user.name,
        &get_ip(&headers),
        get_ua(&headers),
        &login_token.token,
        &tenant_code,
    )
    .await;

    let db2 = ctx.db.clone();
    let tc2 = tenant_code.clone();
    let name2 = user.name.clone();
    let pid2 = user.pid.to_string();
    let ip2 = get_ip(&headers);
    let ua2 = get_ua(&headers).to_string();
    tokio::spawn(async move {
        if let Err(e) = crate::controllers::login_log::record_login_result(
            &db2,
            &name2,
            Some(&pid2),
            &ip2,
            &ua2,
            0,
            Some("Magic link login success"),
            &tc2,
        )
        .await
        {
            tracing::error!(error = %e, "Failed to record magic link login success");
        }
    });

    let mut response = format::json(LoginResponse::new(
        &user,
        &login_token.token,
        login_token.role_names,
        login_token.menu_list,
        &login_token.menu_perm_map,
    ))?;
    let secure = matches!(
        ctx.environment,
        loco_rs::environment::Environment::Production
    );
    apply_auth_cookies(
        &mut response,
        &login_token.token,
        jwt_secret.expiration,
        secure,
    );
    Ok(response)
}

#[debug_handler]
async fn resend_verification_email(
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(params): Json<ResendVerificationParams>,
) -> Result<Response> {
    let Ok(user) =
        users::Model::find_by_email_in_tenant(&ctx.db, &params.email, &tenant.code).await
    else {
        return format::json(());
    };
    if user.email_verified_at.is_some() {
        return format::json(());
    }
    let user = user
        .into_active_model()
        .set_email_verification_sent(&ctx.db)
        .await?;
    AuthMailer::send_welcome(&ctx, &user).await?;
    format::json(())
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("/api/auth")
        .add(
            "/register",
            post(register).route_layer(axum::middleware::from_fn(
                crate::middleware::rate_limiter::login_rate_limit,
            )),
        )
        .add("/verify/{token}", get(verify))
        .add(
            "/login",
            post(login).route_layer(axum::middleware::from_fn(
                crate::middleware::rate_limiter::login_rate_limit,
            )),
        )
        .add("/logout", post(logout))
        .add(
            "/forgot",
            post(forgot).route_layer(axum::middleware::from_fn(
                crate::middleware::rate_limiter::login_rate_limit,
            )),
        )
        .add(
            "/reset",
            post(reset).route_layer(axum::middleware::from_fn(
                crate::middleware::rate_limiter::login_rate_limit,
            )),
        )
        .add("/current", get(current))
        .add("/public-tenants", get(public_tenants))
        .add(
            "/magic-link",
            post(magic_link).route_layer(axum::middleware::from_fn(
                crate::middleware::rate_limiter::login_rate_limit,
            )),
        )
        .add("/magic-link/{token}", get(magic_link_verify))
        .add(
            "/resend-verification-mail",
            post(resend_verification_email).route_layer(axum::middleware::from_fn(
                crate::middleware::rate_limiter::login_rate_limit,
            )),
        )
}

fn apply_auth_cookies(response: &mut Response, token: &str, max_age: u64, secure: bool) {
    let auth_cookie = crate::middleware::auth_cookie_header_value(token, max_age, secure);
    let csrf_cookie = crate::middleware::csrf_cookie_header_value(
        &crate::middleware::csrf::generate_csrf_token(),
        max_age,
        secure,
    );
    response.headers_mut().append(
        axum::http::header::SET_COOKIE,
        axum::http::HeaderValue::from_str(&auth_cookie).expect("auth cookie header must be valid"),
    );
    response.headers_mut().append(
        axum::http::header::SET_COOKIE,
        axum::http::HeaderValue::from_str(&csrf_cookie).expect("csrf cookie header must be valid"),
    );
}

fn clear_auth_cookies(response: &mut Response, secure: bool) {
    let clear_auth = crate::middleware::clear_cookie_header_value(
        crate::middleware::AUTH_COOKIE_NAME,
        true,
        secure,
    );
    let clear_csrf = crate::middleware::clear_cookie_header_value(
        crate::middleware::CSRF_COOKIE_NAME,
        false,
        secure,
    );
    response.headers_mut().append(
        axum::http::header::SET_COOKIE,
        axum::http::HeaderValue::from_str(&clear_auth)
            .expect("clear auth cookie header must be valid"),
    );
    response.headers_mut().append(
        axum::http::header::SET_COOKIE,
        axum::http::HeaderValue::from_str(&clear_csrf)
            .expect("clear csrf cookie header must be valid"),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allowed_email_domain_matches_exact_domain_only() {
        let re = build_allow_email_domain_re("example.com,gmail.com")
            .expect("domain allowlist regex should compile");
        assert!(re.is_match("user@example.com"));
        assert!(re.is_match("user@gmail.com"));
        assert!(!re.is_match("user@evilexample.com"));
        assert!(!re.is_match("user@sub.example.com"));
        assert!(!re.is_match("user@example.com.evil.org"));
    }

    #[test]
    fn empty_domain_config_disables_gate() {
        assert!(build_allow_email_domain_re("").is_none());
        assert!(build_allow_email_domain_re("  ").is_none());
        assert!(build_allow_email_domain_re(",,").is_none());
    }
}
