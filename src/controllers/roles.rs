use crate::data::permissions::forbidden;
use crate::data::permissions::require_perm_code;
use crate::middleware::tenant::TenantScope;
use crate::models::_entities::roles;
use crate::models::_entities::users;
use crate::models::departments as departments_model;
use crate::models::roles as roles_model;
use axum::Extension;
use loco_rs::prelude::*;
use sea_orm::PaginatorTrait;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
pub struct UpsertParams {
    pub name: String,
    pub role_key: Option<String>,
    pub role_sort: Option<i32>,
    pub status: Option<i16>,
    pub data_scope: Option<i16>,
    pub description: Option<String>,
    pub menu_perms: Option<Vec<MenuPermItem>>,
    pub dept_ids: Option<Vec<i32>>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct MenuPermItem {
    pub menu_id: i32,
    pub actions: Vec<String>,
}

#[derive(Deserialize)]
struct QueryParams {
    #[serde(rename = "_start")]
    start: Option<usize>,
    #[serde(rename = "_end")]
    end: Option<usize>,
}

#[debug_handler]
async fn list(
    _auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Query(q): Query<QueryParams>,
) -> Result<Response> {
    require_perm_code(&_auth, "system:role:read")?;
    let (start, limit) = crate::data::page_range(q.start, q.end);
    let (items, total) =
        roles::Model::list_paginated(&ctx.db, &tenant.code, start as u64, limit as u64)
            .await
            .map_err(Error::wrap)?;
    crate::data::paginated_response(&items, total)
}

async fn load(ctx: &AppContext, id: i32, tenant_code: &str) -> Result<roles::Model> {
    roles::Model::find_by_id_in_tenant(&ctx.db, id, tenant_code)
        .await
        .map_err(Error::wrap)
}

#[debug_handler]
async fn get_one(
    _auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_perm_code(&_auth, "system:role:read")?;
    format::json(load(&ctx, id, &tenant.code).await?)
}

#[debug_handler]
async fn create(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(params): Json<UpsertParams>,
) -> Result<Response> {
    require_perm_code(&auth, "system:role:create")?;
    // 校验数据范围部门归属当前租户，避免跨租户引用。
    if let Some(ref dept_ids) = params.dept_ids {
        validate_dept_tenant_ids(&ctx.db, &tenant.code, dept_ids).await?;
    }
    let normalized_menu_perms = if let Some(ref perms) = params.menu_perms {
        let menus: Vec<(i32, Vec<String>)> = perms
            .iter()
            .map(|p| (p.menu_id, p.actions.clone()))
            .collect();
        Some(validate_menu_tenant_ids(&ctx.db, &tenant.code, &menus).await?)
    } else {
        None
    };
    let role_key = params
        .role_key
        .clone()
        .unwrap_or_else(|| params.name.to_lowercase().replace(' ', "_"));
    let m = roles::ActiveModel {
        name: Set(params.name),
        role_key: Set(role_key),
        role_sort: Set(params.role_sort.unwrap_or(0)),
        status: Set(params.status.unwrap_or(1)),
        data_scope: Set(params.data_scope.unwrap_or(1)),
        is_system: Set(false),
        description: Set(params.description),
        dept_ids: Set(params
            .dept_ids
            .as_ref()
            .and_then(|ids| serde_json::to_value(ids).ok())),
        tenant_id: Set(Some(tenant.code.clone())),
        ..Default::default()
    }
    .insert(&ctx.db)
    .await?;
    if let Some(perms) = normalized_menu_perms {
        crate::models::roles::Model::set_menus(&m, &ctx.db, &perms).await?;
    }
    format::json(m)
}

#[debug_handler]
async fn update(
    auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(params): Json<UpsertParams>,
) -> Result<Response> {
    require_perm_code(&auth, "system:role:update")?;
    let item = load(&ctx, id, &tenant.code).await?;
    if item.is_system && !current_user_is_system_admin(&ctx, &auth, &tenant.code).await? {
        return Err(forbidden("只有系统管理员可以修改系统角色"));
    }
    if item.is_system && params.status == Some(0) {
        return Err(forbidden("系统角色不能禁用"));
    }
    // 校验数据范围部门归属当前租户，避免跨租户引用。
    if let Some(ref dept_ids) = params.dept_ids {
        validate_dept_tenant_ids(&ctx.db, &tenant.code, dept_ids).await?;
    }
    let cur_key = item.role_key.clone();
    let cur_sort = item.role_sort;
    let cur_status = item.status;
    let cur_scope = item.data_scope;
    let status_changed = params.status.is_some() && params.status != Some(item.status);
    let name_changed = params.name != item.name;
    let requires_session_revoke = params.menu_perms.is_some() || status_changed || name_changed;
    let normalized_menu_perms = if let Some(ref perms) = params.menu_perms {
        let menus: Vec<(i32, Vec<String>)> = perms
            .iter()
            .map(|p| (p.menu_id, p.actions.clone()))
            .collect();
        Some(validate_menu_tenant_ids(&ctx.db, &tenant.code, &menus).await?)
    } else {
        None
    };
    let mut a = item.into_active_model();
    a.name = Set(params.name);
    a.role_key = Set(params.role_key.unwrap_or(cur_key));
    a.role_sort = Set(params.role_sort.unwrap_or(cur_sort));
    a.status = Set(params.status.unwrap_or(cur_status));
    a.data_scope = Set(params.data_scope.unwrap_or(cur_scope));
    a.description = Set(params.description);
    if let Some(ref dept_ids) = params.dept_ids {
        a.dept_ids = Set(serde_json::to_value(dept_ids).ok());
    }
    let updated = a.update(&ctx.db).await?;
    if let Some(perms) = normalized_menu_perms {
        updated.set_menus(&ctx.db, &perms).await?;
    }
    if requires_session_revoke {
        // 角色名、启用状态和权限码都会进入 JWT。只要这些字段变化，旧 token 的
        // roles/perm_codes 就可能过期，必须强制该角色下所有用户重新登录。
        revoke_sessions_for_role(&ctx.db, updated.id, &tenant.code).await?;
    }
    format::json(updated)
}

#[debug_handler]
async fn remove(
    auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_perm_code(&auth, "system:role:delete")?;
    let role = load(&ctx, id, &tenant.code).await?;
    if role.is_system {
        return Err(forbidden("系统角色不能删除"));
    }
    // Prevent deleting a role that is still assigned to users — the FK
    // cascade would silently strip permissions from those users.
    let assigned_count = crate::models::users_roles::Entity::find()
        .filter(crate::models::_entities::users_roles::Column::RoleId.eq(role.id))
        .filter(crate::models::_entities::users_roles::Column::TenantId.eq(&tenant.code))
        .count(&ctx.db)
        .await
        .map_err(Error::wrap)?;
    if assigned_count > 0 {
        return Err(Error::BadRequest(format!(
            "无法删除：该角色已分配给 {assigned_count} 个用户，请先解除关联"
        )));
    }
    role.delete(&ctx.db).await?;
    format::empty()
}

#[debug_handler]
async fn get_menus(
    auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_perm_code(&auth, "system:role:read")?;
    let role = load(&ctx, id, &tenant.code).await?;
    let perms = role.get_menu_perms(&ctx.db).await?;
    let result: Vec<MenuPermItem> = perms
        .iter()
        .map(|(menu_id, actions)| MenuPermItem {
            menu_id: *menu_id,
            actions: actions.clone(),
        })
        .collect();
    format::json(result)
}

/// Check whether the JWT subject currently holds an active system role.
async fn current_user_is_system_admin(
    ctx: &AppContext,
    auth: &auth::JWT,
    tenant_code: &str,
) -> Result<bool> {
    let pid = auth
        .claims
        .pid
        .parse::<uuid::Uuid>()
        .map_err(|_| Error::string("Invalid user PID in token"))?;
    let Ok(user) = users::Model::find_by_pid_in_tenant(&ctx.db, pid, tenant_code).await else {
        return unauthorized("user not found");
    };
    let roles = user
        .get_roles(&ctx.db, tenant_code)
        .await
        .map_err(Error::wrap)?;
    Ok(roles.iter().any(|r| r.is_system))
}

/// Validate that all referenced department IDs belong to the same tenant.
async fn validate_dept_tenant_ids(
    db: &sea_orm::DatabaseConnection,
    tenant_code: &str,
    dept_ids: &[i32],
) -> Result<()> {
    if dept_ids.is_empty() {
        return Ok(());
    }
    let found = departments_model::Model::find_by_ids(db, dept_ids, tenant_code)
        .await
        .map_err(Error::wrap)?;
    if found.len() != dept_ids.len() {
        return Err(Error::BadRequest("部分部门不属于当前租户".to_string()));
    }
    Ok(())
}

/// Validate that all referenced menu IDs belong to the same tenant.
async fn validate_menu_tenant_ids(
    db: &sea_orm::DatabaseConnection,
    tenant_code: &str,
    menu_ids: &[(i32, Vec<String>)],
) -> Result<Vec<(i32, Vec<String>)>> {
    roles_model::Model::validate_menu_tenant(db, menu_ids, tenant_code)
        .await
        .map_err(|e| Error::BadRequest(e.to_string()))
}

/// Revoke all active sessions for users assigned to a given role, forcing them
/// to re-authenticate and obtain a fresh JWT reflecting current permissions.
async fn revoke_sessions_for_role(
    db: &sea_orm::DatabaseConnection,
    role_id: i32,
    tenant_code: &str,
) -> Result<()> {
    use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
    let links = crate::models::_entities::users_roles::Entity::find()
        .filter(crate::models::_entities::users_roles::Column::RoleId.eq(role_id))
        .filter(crate::models::_entities::users_roles::Column::TenantId.eq(tenant_code))
        .all(db)
        .await
        .unwrap_or_default();
    if links.is_empty() {
        return Ok(());
    }
    let user_ids: Vec<i32> = links.iter().map(|l| l.user_id).collect();
    let users = crate::models::_entities::users::Entity::find()
        .filter(crate::models::_entities::users::Column::Id.is_in(user_ids))
        .filter(crate::models::_entities::users::Column::TenantId.eq(tenant_code))
        .all(db)
        .await
        .unwrap_or_default();
    for u in users {
        crate::middleware::session_guard::revoke_user(&u.pid.to_string()).await?;
    }
    Ok(())
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/roles")
        .add("/", get(list))
        .add("/", post(create))
        .add("/{id}", get(get_one))
        .add("/{id}", put(update))
        .add("/{id}", delete(remove))
        .add("/{id}/menus", get(get_menus))
}
