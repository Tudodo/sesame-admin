use crate::data::permissions::require_perm_code;
use crate::middleware::tenant::TenantScope;
use crate::models::_entities::{roles as roles_entity, users};
use crate::models::users::{self as users_model, RegisterParams};
use crate::views::users::UserResponse;
use axum::Extension;
use loco_rs::prelude::*;
use sea_orm::PaginatorTrait;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
pub struct UpdateUserParams {
    pub name: Option<String>,
    pub email: Option<String>,
    pub password: Option<String>,
    pub role_ids: Option<Vec<i32>>,
    pub department_id: Option<i32>,
    pub department_ids: Option<Vec<i32>>,
    pub position_ids: Option<Vec<i32>>,
    pub manager_pid: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct UserPositionResponse {
    pub position_id: i32,
    pub name: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct UserRoleResponse {
    pub role_id: i32,
    pub name: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CreateUserParams {
    pub name: String,
    pub email: String,
    pub password: String,
    pub role_ids: Option<Vec<i32>>,
    pub department_id: Option<i32>,
    pub department_ids: Option<Vec<i32>>,
    pub position_ids: Option<Vec<i32>>,
    pub manager_pid: Option<String>,
}

/// Parse an optional manager PID from the admin UI. Empty string clears the
/// relation on update; absent/null leaves the existing value unchanged.
fn parse_optional_manager_pid(value: Option<String>) -> Result<Option<Option<uuid::Uuid>>, Error> {
    match value {
        None => Ok(None),
        Some(s) if s.trim().is_empty() => Ok(Some(None)),
        Some(s) => uuid::Uuid::parse_str(s.trim())
            .map(|id| Some(Some(id)))
            .map_err(|_| Error::BadRequest("直属上级格式不正确".into())),
    }
}

#[derive(Deserialize)]
struct UserQuery {
    #[serde(rename = "_start")]
    start: Option<usize>,

    #[serde(rename = "_end")]
    end: Option<usize>,
    #[serde(rename = "_sort")]
    sort: Option<String>,
    #[serde(rename = "_order")]
    order: Option<String>,
}

#[debug_handler]
async fn list(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Query(query): Query<UserQuery>,
) -> Result<Response> {
    require_perm_code(&auth, "system:user:read")?;
    let current_user = load_current_user(&ctx, &auth, &tenant.code).await?;
    let visible_dept_ids = current_user
        .get_visible_department_ids(&ctx.db, &tenant.code)
        .await
        .map_err(Error::wrap)?;
    // 仅本人数据范围：直接以当前用户 id 过滤，避免落到 list_paginated
    // 的"无部门"分支被误判为空集。
    let self_user_id = current_user.id;

    let (start, limit) = crate::data::page_range(query.start, query.end);
    let is_asc = query
        .order
        .as_deref()
        .map(|o| o.eq_ignore_ascii_case("asc"))
        .unwrap_or(true);
    let sort_column = query.sort.as_deref().unwrap_or("id");

    let (models, total) = if visible_dept_ids == vec![-2] {
        users_model::Model::list_paginated_self(
            &ctx.db,
            &tenant.code,
            self_user_id,
            sort_column,
            is_asc,
            start as u64,
            limit as u64,
        )
        .await
        .map_err(Error::wrap)?
    } else {
        users_model::Model::list_paginated(
            &ctx.db,
            &tenant.code,
            &visible_dept_ids,
            sort_column,
            is_asc,
            start as u64,
            limit as u64,
        )
        .await
        .map_err(Error::wrap)?
    };
    let items: Vec<UserResponse> = models.iter().map(UserResponse::from).collect();

    crate::data::paginated_response(&items, total)
}

async fn load_item(ctx: &AppContext, id: i32, tenant_code: &str) -> Result<users::Model> {
    users::Model::find_by_id_in_tenant(&ctx.db, id, tenant_code)
        .await
        .map_err(Error::wrap)
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
        .map_err(|_| Error::string("Invalid user PID in token"))?;
    users::Model::find_by_pid_in_tenant(&ctx.db, pid, tenant_code)
        .await
        .map_err(|_| Error::Unauthorized("user not found".into()))
}

/// Enforce the caller's department data scope on a target user.
///
/// A caller may always access itself, even when it has no department rows;
/// otherwise the target must belong to at least one visible department.
async fn ensure_user_visible(
    db: &sea_orm::DatabaseConnection,
    current_user: &users::Model,
    target: &users::Model,
    tenant_code: &str,
) -> Result<()> {
    if current_user.id == target.id {
        return Ok(());
    }
    let visible = current_user
        .get_visible_department_ids(db, tenant_code)
        .await
        .map_err(Error::wrap)?;
    if visible == vec![-1] {
        return Ok(());
    }
    if visible == vec![-2] || visible.is_empty() {
        return Err(crate::data::permissions::forbidden("没有权限访问该用户"));
    }
    let target_depts = target
        .get_department_ids(db, tenant_code)
        .await
        .map_err(Error::wrap)?;
    if target_depts.iter().any(|d| visible.contains(d)) {
        Ok(())
    } else {
        Err(crate::data::permissions::forbidden("没有权限访问该用户"))
    }
}

/// Prevent a non-system admin from assigning a system role to any user.
async fn ensure_roles_assignable(
    db: &sea_orm::DatabaseConnection,
    current_user: &users::Model,
    tenant_code: &str,
    role_ids: &[i32],
) -> Result<()> {
    if role_ids.is_empty() {
        return Ok(());
    }
    let system_role_count = roles_entity::Entity::find()
        .filter(roles_entity::Column::Id.is_in(role_ids.to_vec()))
        .filter(roles_entity::Column::TenantId.eq(tenant_code))
        .filter(roles_entity::Column::IsSystem.eq(true))
        .count(db)
        .await
        .map_err(Error::wrap)?;
    if system_role_count == 0 {
        return Ok(());
    }
    let current_roles = current_user
        .get_roles(db, tenant_code)
        .await
        .map_err(Error::wrap)?;
    if current_roles.iter().any(|r| r.is_system) {
        return Ok(());
    }
    Err(crate::data::permissions::forbidden(
        "只有系统管理员可以分配系统角色",
    ))
}

/// Prevent a non-system admin from modifying or deleting a system-role user.
async fn ensure_system_user_manageable(
    db: &sea_orm::DatabaseConnection,
    current_user: &users::Model,
    target: &users::Model,
    tenant_code: &str,
) -> Result<()> {
    let target_roles = target
        .get_roles(db, tenant_code)
        .await
        .map_err(Error::wrap)?;
    if !target_roles.iter().any(|r| r.is_system) {
        return Ok(());
    }
    let current_roles = current_user
        .get_roles(db, tenant_code)
        .await
        .map_err(Error::wrap)?;
    if current_roles.iter().any(|r| r.is_system) {
        return Ok(());
    }
    Err(crate::data::permissions::forbidden(
        "只有系统管理员可以管理系统用户",
    ))
}

/// Keep department assignments inside the caller's visible department scope.
async fn ensure_departments_assignable(
    db: &sea_orm::DatabaseConnection,
    current_user: &users::Model,
    tenant_code: &str,
    dept_ids: &[i32],
) -> Result<()> {
    if dept_ids.is_empty() {
        return Ok(());
    }
    let visible = current_user
        .get_visible_department_ids(db, tenant_code)
        .await
        .map_err(Error::wrap)?;
    if visible == vec![-1] {
        return Ok(());
    }
    if visible == vec![-2] || visible.is_empty() {
        return Err(crate::data::permissions::forbidden(
            "不能将用户分配到不可见部门",
        ));
    }
    if dept_ids.iter().any(|d| !visible.contains(d)) {
        return Err(crate::data::permissions::forbidden(
            "不能将用户分配到不可见部门",
        ));
    }
    Ok(())
}

#[debug_handler]
async fn get_one(
    auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_perm_code(&auth, "system:user:read")?;
    let current_user = load_current_user(&ctx, &auth, &tenant.code).await?;
    let user = load_item(&ctx, id, &tenant.code).await?;
    ensure_user_visible(&ctx.db, &current_user, &user, &tenant.code).await?;
    format::json(UserResponse::from(&user))
}

#[debug_handler]
async fn create(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(params): Json<CreateUserParams>,
) -> Result<Response> {
    require_perm_code(&auth, "system:user:create")?;
    crate::controllers::auth::validate_password_strength(&params.password)?;
    users::Model::validate_tenant_ids(
        &ctx.db,
        &tenant.code,
        params.role_ids.as_deref(),
        params.department_ids.as_deref(),
        params.position_ids.as_deref(),
    )
    .await
    .map_err(Error::wrap)?;
    let current_user = load_current_user(&ctx, &auth, &tenant.code).await?;
    ensure_roles_assignable(
        &ctx.db,
        &current_user,
        &tenant.code,
        params.role_ids.as_deref().unwrap_or_default(),
    )
    .await?;
    let mut dept_ids_to_check = params.department_ids.clone().unwrap_or_default();
    if dept_ids_to_check.is_empty() {
        if let Some(did) = params.department_id {
            dept_ids_to_check.push(did);
        }
    }
    ensure_departments_assignable(&ctx.db, &current_user, &tenant.code, &dept_ids_to_check).await?;
    let manager_pid = parse_optional_manager_pid(params.manager_pid.clone())?.flatten();
    if let Some(pid) = manager_pid {
        users::Model::find_by_pid_in_tenant(&ctx.db, pid, &tenant.code).await?;
    }
    let register_params = RegisterParams {
        email: params.email,
        password: params.password,
        name: params.name,
        role_ids: params.role_ids,
        department_id: params.department_id,
        department_ids: params.department_ids,
        position_ids: params.position_ids,
        manager_pid,
    };
    let user =
        users::Model::create_with_password(&ctx.db, &register_params, Some(&tenant.code)).await?;
    // tenant_id already set by create_with_password
    format::json(UserResponse::from(&user))
}

#[debug_handler]
async fn update(
    auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(params): Json<UpdateUserParams>,
) -> Result<Response> {
    require_perm_code(&auth, "system:user:update")?;
    let item = load_item(&ctx, id, &tenant.code).await?;
    let current_user = load_current_user(&ctx, &auth, &tenant.code).await?;
    ensure_user_visible(&ctx.db, &current_user, &item, &tenant.code).await?;
    ensure_system_user_manageable(&ctx.db, &current_user, &item, &tenant.code).await?;

    // Pre-validate tenant IDs before entering transaction
    users::Model::validate_tenant_ids(
        &ctx.db,
        &tenant.code,
        params.role_ids.as_deref(),
        params.department_ids.as_deref(),
        params.position_ids.as_deref(),
    )
    .await
    .map_err(Error::wrap)?;
    ensure_roles_assignable(
        &ctx.db,
        &current_user,
        &tenant.code,
        params.role_ids.as_deref().unwrap_or_default(),
    )
    .await?;
    let mut dept_ids_to_check = params.department_ids.clone().unwrap_or_default();
    if dept_ids_to_check.is_empty() {
        if let Some(did) = params.department_id {
            dept_ids_to_check.push(did);
        }
    }
    ensure_departments_assignable(&ctx.db, &current_user, &tenant.code, &dept_ids_to_check).await?;
    let manager_pid = parse_optional_manager_pid(params.manager_pid.clone())?;
    if let Some(Some(pid)) = manager_pid {
        users::Model::find_by_pid_in_tenant(&ctx.db, pid, &tenant.code).await?;
    }

    // Revoke sessions when password OR role assignments change. Role changes
    // alter the permission codes embedded in the user's JWT; without
    // revocation a promoted user keeps stale (lower) permissions and a
    // demoted user keeps stale (higher) permissions until token expiry.
    let pid_to_revoke = if params.password.is_some() || params.role_ids.is_some() {
        Some(item.pid.to_string())
    } else {
        None
    };
    let password_hash = if let Some(ref password) = params.password {
        crate::controllers::auth::validate_password_strength(password)?;
        Some(loco_rs::hash::hash_password(password).map_err(Error::wrap)?)
    } else {
        None
    };

    let dept_id = params
        .department_ids
        .as_ref()
        .and_then(|v| v.first().copied())
        .or(params.department_id);

    let updated = item
        .update_with_relations(
            &ctx.db,
            params.name,
            params.email,
            password_hash,
            dept_id,
            params.role_ids,
            params.department_ids,
            params.position_ids,
            manager_pid,
        )
        .await
        .map_err(Error::wrap)?;

    // Revoke all sessions for this user (password or role change).
    if let Some(ref pid) = pid_to_revoke {
        crate::middleware::session_guard::revoke_user(pid).await?;
    }

    format::json(UserResponse::from(&updated))
}

#[debug_handler]
async fn remove(
    auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_perm_code(&auth, "system:user:delete")?;
    let user = load_item(&ctx, id, &tenant.code).await?;
    let current_user = load_current_user(&ctx, &auth, &tenant.code).await?;
    ensure_user_visible(&ctx.db, &current_user, &user, &tenant.code).await?;
    ensure_system_user_manageable(&ctx.db, &current_user, &user, &tenant.code).await?;
    // Capture pid before delete_with_relations consumes the model.
    let pid_to_revoke = user.pid.to_string();

    user.delete_with_relations(&ctx.db)
        .await
        .map_err(Error::wrap)?;
    // Revoke all sessions for the deleted user so existing JWTs become invalid immediately.
    crate::middleware::session_guard::revoke_user(&pid_to_revoke).await?;
    format::empty()
}

#[debug_handler]
async fn get_positions(
    auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_perm_code(&auth, "system:user:read")?;
    let current_user = load_current_user(&ctx, &auth, &tenant.code).await?;
    let user = load_item(&ctx, id, &tenant.code).await?;
    ensure_user_visible(&ctx.db, &current_user, &user, &tenant.code).await?;
    let positions = user.get_positions(&ctx.db, &tenant.code).await?;
    let resp: Vec<UserPositionResponse> = positions
        .iter()
        .map(|p| UserPositionResponse {
            position_id: p.id,
            name: p.name.clone(),
        })
        .collect();
    format::json(resp)
}

#[debug_handler]
async fn get_roles(
    auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_perm_code(&auth, "system:user:read")?;
    let current_user = load_current_user(&ctx, &auth, &tenant.code).await?;
    let user = load_item(&ctx, id, &tenant.code).await?;
    ensure_user_visible(&ctx.db, &current_user, &user, &tenant.code).await?;
    let roles = user.get_role_assignments(&ctx.db, &tenant.code).await?;
    let resp: Vec<UserRoleResponse> = roles
        .iter()
        .map(|r| UserRoleResponse {
            role_id: r.id,
            name: r.name.clone(),
        })
        .collect();
    format::json(resp)
}

// ── Tenant validation helper ──

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/users")
        .add("/", get(list))
        .add("/", post(create))
        .add("/{id}", get(get_one))
        .add("/{id}", put(update))
        .add("/{id}", delete(remove))
        .add("/{id}/positions", get(get_positions))
        .add("/{id}/roles", get(get_roles))
}
