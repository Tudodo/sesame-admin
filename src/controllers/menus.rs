use crate::data::permissions::require_perm_code;
use crate::middleware::tenant::TenantScope;
use crate::models::_entities::menus;
use crate::models::menus as menus_model;
use axum::Extension;
use loco_rs::prelude::*;
use sea_orm::PaginatorTrait;

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
pub struct UpsertParams {
    pub name: String,
    pub path: Option<String>,
    pub icon: Option<String>,
    pub parent_id: Option<i32>,
    pub sort_order: Option<i32>,
    pub permission: Option<String>,
    pub visible: Option<bool>,
    pub menu_type: Option<String>,
    pub actions: Option<Vec<String>>,
}

#[derive(Deserialize)]
struct QueryParams {
    #[serde(rename = "_start")]
    start: Option<usize>,
    #[serde(rename = "_end")]
    end: Option<usize>,
    #[serde(rename = "_sort")]
    #[allow(dead_code)]
    sort: Option<String>,
    #[serde(rename = "_order")]
    order: Option<String>,
}

#[debug_handler]
async fn list(
    _auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Query(q): Query<QueryParams>,
) -> Result<Response> {
    require_perm_code(&_auth, "system:menu:read")?;
    let (start, limit) = crate::data::page_range(q.start, q.end);
    let is_asc = q
        .order
        .as_deref()
        .map(|o| o.eq_ignore_ascii_case("asc"))
        .unwrap_or(true);
    let (items, total) = menus_model::Model::list_paginated(
        &ctx.db,
        &tenant.code,
        is_asc,
        start as u64,
        limit as u64,
    )
    .await
    .map_err(Error::wrap)?;
    crate::data::paginated_response(&items, total)
}

async fn load(ctx: &AppContext, id: i32, tenant_code: &str) -> Result<menus::Model> {
    menus::Model::find_by_id_in_tenant(&ctx.db, id, tenant_code)
        .await
        .map_err(Error::wrap)
}

#[debug_handler]
async fn get_one(
    auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_perm_code(&auth, "system:menu:read")?;
    format::json(load(&ctx, id, &tenant.code).await?)
}

#[debug_handler]
async fn create(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(params): Json<UpsertParams>,
) -> Result<Response> {
    require_perm_code(&auth, "system:menu:create")?;
    // Validate parent_id belongs to the same tenant to prevent cross-tenant menu hierarchy.
    if let Some(pid) = params.parent_id {
        menus_model::Model::find_by_id_in_tenant(&ctx.db, pid, &tenant.code)
            .await
            .map_err(Error::wrap)?;
    }
    let actions_json = params
        .actions
        .as_ref()
        .and_then(|a| serde_json::to_value(a).ok());
    let m = menus::ActiveModel {
        name: Set(params.name),
        path: Set(params.path),
        icon: Set(params.icon),
        parent_id: Set(params.parent_id),
        sort_order: Set(params.sort_order.unwrap_or(0)),
        permission: Set(params.permission),
        visible: Set(params.visible.unwrap_or(true)),
        menu_type: Set(params.menu_type.unwrap_or_else(|| "C".to_string())),
        actions: Set(actions_json),
        tenant_id: Set(Some(tenant.code)),
        ..Default::default()
    }
    .insert(&ctx.db)
    .await?;
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
    require_perm_code(&auth, "system:menu:update")?;
    let item = load(&ctx, id, &tenant.code).await?;
    // 校验 parent_id 归属当前租户且不会形成循环（自引用或祖先链回环）。
    if let Some(pid) = params.parent_id {
        if menus_model::Model::would_create_cycle(&ctx.db, id, pid, &tenant.code)
            .await
            .map_err(Error::wrap)?
        {
            return Err(Error::BadRequest(
                "不能将自身或下级菜单设为上级".to_string(),
            ));
        }
    }
    let cur_sort = item.sort_order;
    let cur_vis = item.visible;
    let should_revoke = menu_permission_fields_changed(&item, &params);
    let menu_id = item.id;
    let mut a = item.into_active_model();
    a.name = Set(params.name);
    a.path = Set(params.path);
    a.icon = Set(params.icon);
    a.parent_id = Set(params.parent_id);
    a.sort_order = Set(params.sort_order.unwrap_or(cur_sort));
    a.permission = Set(params.permission);
    a.visible = Set(params.visible.unwrap_or(cur_vis));
    if let Some(mt) = params.menu_type {
        a.menu_type = Set(mt);
    }
    if let Some(acts) = params.actions {
        a.actions = Set(serde_json::to_value(acts).ok());
    }
    let updated = a.update(&ctx.db).await?;
    if should_revoke {
        // 菜单权限、类型、可见性或动作会进入登录响应/前端权限缓存。若旧 JWT 继续生效，
        // 已签发会话会持有过期权限码，必须让引用该菜单的所有用户重新登录。
        revoke_sessions_for_menu(&ctx.db, menu_id, &tenant.code).await?;
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
    require_perm_code(&auth, "system:menu:delete")?;
    // 检查是否有子菜单，避免外键约束报错或产生孤儿层级
    let child_count = menus::Entity::find()
        .filter(menus::Column::ParentId.eq(id))
        .filter(menus::Column::TenantId.eq(tenant.code.clone()))
        .count(&ctx.db)
        .await
        .map_err(Error::wrap)?;
    if child_count > 0 {
        return Err(Error::BadRequest(
            "该菜单下存在子菜单，请先删除子菜单".to_string(),
        ));
    }
    let item = load(&ctx, id, &tenant.code).await?;
    // 删除菜单会级联移除角色关联；先撤销引用该菜单的会话，避免旧 token 继续
    // 携带已删除菜单对应的权限码直到 JWT 过期。
    revoke_sessions_for_menu(&ctx.db, item.id, &tenant.code).await?;
    item.delete(&ctx.db).await?;
    format::empty()
}

/// Return true when a menu update changes fields that are embedded in login
/// responses or the frontend permission cache.
fn menu_permission_fields_changed(item: &menus::Model, params: &UpsertParams) -> bool {
    if params.name != item.name {
        return true;
    }
    if params.path != item.path && (params.path.is_some() || item.path.is_some()) {
        return true;
    }
    if params.permission != item.permission
        && (params.permission.is_some() || item.permission.is_some())
    {
        return true;
    }
    if params.visible.is_some() && params.visible != Some(item.visible) {
        return true;
    }
    if params.menu_type.is_some() && params.menu_type != Some(item.menu_type.clone()) {
        return true;
    }
    if let Some(actions) = params.actions.as_ref() {
        if actions != &item.action_list() {
            return true;
        }
    }
    false
}

/// Revoke all active sessions for users whose roles reference a menu.
async fn revoke_sessions_for_menu(
    db: &sea_orm::DatabaseConnection,
    menu_id: i32,
    tenant_code: &str,
) -> Result<()> {
    use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
    let links = crate::models::_entities::roles_menus::Entity::find()
        .filter(crate::models::_entities::roles_menus::Column::MenuId.eq(menu_id))
        .filter(crate::models::_entities::roles_menus::Column::TenantId.eq(tenant_code))
        .all(db)
        .await
        .map_err(Error::wrap)?;
    if links.is_empty() {
        return Ok(());
    }
    let role_ids: Vec<i32> = links.iter().map(|l| l.role_id).collect();
    let user_links = crate::models::_entities::users_roles::Entity::find()
        .filter(crate::models::_entities::users_roles::Column::RoleId.is_in(role_ids))
        .filter(crate::models::_entities::users_roles::Column::TenantId.eq(tenant_code))
        .all(db)
        .await
        .map_err(Error::wrap)?;
    let user_ids: Vec<i32> = user_links.iter().map(|l| l.user_id).collect();
    let users = crate::models::_entities::users::Entity::find()
        .filter(crate::models::_entities::users::Column::Id.is_in(user_ids))
        .filter(crate::models::_entities::users::Column::TenantId.eq(tenant_code))
        .all(db)
        .await
        .map_err(Error::wrap)?;
    for u in users {
        crate::middleware::session_guard::revoke_user(&u.pid.to_string()).await?;
    }
    Ok(())
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/menus")
        .add("/", get(list))
        .add("/", post(create))
        .add("/{id}", get(get_one))
        .add("/{id}", put(update))
        .add("/{id}", delete(remove))
}
