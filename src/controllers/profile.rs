use crate::middleware::tenant::TenantScope;
use crate::models::_entities::{departments, users};
use axum::Extension;
use loco_rs::prelude::*;
use serde::Deserialize;

#[derive(Deserialize)]
struct ProfileUpdateParams {
    name: Option<String>,
    email: Option<String>,
}

#[derive(Deserialize)]
struct ChangePasswordParams {
    old_password: String,
    new_password: String,
}

async fn load_current_user(
    ctx: &AppContext,
    auth: &auth::JWT,
    tenant_code: &str,
) -> Result<users::Model> {
    let pid = auth
        .claims
        .pid
        .parse::<uuid::Uuid>()
        .map_err(|_| Error::Unauthorized("invalid user".into()))?;
    match users::Model::find_by_pid_in_tenant(&ctx.db, pid, tenant_code).await {
        Ok(user) => Ok(user),
        Err(ModelError::EntityNotFound) => unauthorized("user not found"),
        Err(err) => {
            tracing::error!(error = %err, "Failed to load authenticated user");
            Err(Error::InternalServerError)
        }
    }
}

#[debug_handler]
async fn get_profile(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    let user = load_current_user(&ctx, &auth, &tenant.code).await?;
    let roles = user
        .get_roles(&ctx.db, &tenant.code)
        .await
        .unwrap_or_default();
    let dept_ids = user
        .get_department_ids(&ctx.db, &tenant.code)
        .await
        .unwrap_or_default();
    let dept_models = departments::Model::find_by_ids(&ctx.db, &dept_ids, &tenant.code)
        .await
        .unwrap_or_default();
    let positions = user
        .get_positions(&ctx.db, &tenant.code)
        .await
        .unwrap_or_default();
    format::json(serde_json::json!({
        "pid": user.pid,
        "name": user.name,
        "email": user.email,
        "roles": roles.iter().map(|r| serde_json::json!({"id": r.id, "name": r.name})).collect::<Vec<_>>(),
        "departments": dept_models.iter().map(|d| serde_json::json!({"id": d.id, "name": d.name})).collect::<Vec<_>>(),
        "positions": positions.iter().map(|p| serde_json::json!({"id": p.id, "name": p.name})).collect::<Vec<_>>(),
    }))
}

#[debug_handler]
async fn update_profile(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(p): Json<ProfileUpdateParams>,
) -> Result<Response> {
    let user = load_current_user(&ctx, &auth, &tenant.code).await?;
    let user_id = user.id;
    let mut active = user.into_active_model();
    if let Some(name) = p.name {
        active.name = sea_orm::Set(name);
    }
    if let Some(email) = p.email {
        // 邮箱在租户内需唯一，但应排除用户自身记录，否则提交未变更的
        // 当前邮箱会被误判为冲突。数据库已有 (email, tenant_id) 唯一约束兜底。
        if let Ok(existing) =
            users::Model::find_by_email_in_tenant(&ctx.db, &email, &tenant.code).await
        {
            if existing.id != user_id {
                return Err(Error::BadRequest("该邮箱已被使用".into()));
            }
        }
        active.email = sea_orm::Set(email);
    }
    let updated = active.update(&ctx.db).await?;
    format::json(
        serde_json::json!({"pid": updated.pid, "name": updated.name, "email": updated.email}),
    )
}

#[debug_handler]
async fn change_password(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(p): Json<ChangePasswordParams>,
) -> Result<Response> {
    let user = load_current_user(&ctx, &auth, &tenant.code).await?;
    if !user.verify_password(&p.old_password) {
        return unauthorized("原密码错误");
    }
    crate::controllers::auth::validate_password_strength(&p.new_password)?;
    user.into_active_model()
        .reset_password(&ctx.db, &p.new_password)
        .await?;
    // Invalidate all existing sessions so stolen tokens are immediately useless.
    // Consistent with the forgot-password reset flow.
    crate::middleware::session_guard::revoke_user(&auth.claims.pid.to_string()).await?;
    format::json(serde_json::json!({"ok": true}))
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/profile")
        .add("/", get(get_profile))
        .add("/", put(update_profile))
        .add("/password", put(change_password))
}
