use crate::data::permissions::require_platform_admin;
use crate::middleware::tenant::{TenantScope, DEFAULT_TENANT_CODE};
use crate::models::tenants as tenants_model;
use axum::Extension;
use loco_rs::prelude::*;

use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct TenantUpsert {
    pub name: String,
    pub code: String,
    pub domain: Option<String>,
    pub status: Option<String>,
    pub contact_name: Option<String>,
    pub contact_email: Option<String>,
    pub description: Option<String>,
    // Initial admin account to bootstrap the new tenant. Required on create,
    // ignored on update.
    pub admin_name: Option<String>,
    pub admin_email: Option<String>,
    pub admin_password: Option<String>,
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
    require_platform_admin(
        &_auth,
        &tenant.code,
        "system:tenant:read",
        "租户管理仅对平台租户管理员开放",
    )?;
    let (start, limit) = crate::data::page_range(q.start, q.end);
    let (items, total) = tenants_model::Model::list_paginated(&ctx.db, start as u64, limit as u64)
        .await
        .map_err(Error::wrap)?;
    crate::data::paginated_response(&items, total)
}

#[debug_handler]
async fn get_one(
    _auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_platform_admin(
        &_auth,
        &tenant.code,
        "system:tenant:read",
        "租户管理仅对平台租户管理员开放",
    )?;
    let item = tenants_model::Model::find_by_id(&ctx.db, id)
        .await
        .map_err(|e| match e {
            ModelError::EntityNotFound => Error::NotFound,
            other => Error::wrap(other),
        })?;
    format::json(item)
}

#[debug_handler]
async fn create(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(p): Json<TenantUpsert>,
) -> Result<Response> {
    require_platform_admin(
        &auth,
        &tenant.code,
        "system:tenant:create",
        "租户管理仅对平台租户管理员开放",
    )?;
    tenants_model::Model::validate_code(&p.code).map_err(Error::BadRequest)?;

    // Bootstrap the new tenant's admin account + menu tree so the tenant
    // can actually log in. Without this a freshly created tenant has no
    // users, roles, or menus and is unreachable.
    let admin_name = p.admin_name.as_deref().unwrap_or("admin");
    let admin_email = p.admin_email.as_deref().ok_or_else(|| {
        Error::BadRequest("admin_email is required when creating a tenant".to_string())
    })?;
    let admin_password = p.admin_password.as_deref().ok_or_else(|| {
        Error::BadRequest("admin_password is required when creating a tenant".to_string())
    })?;

    // Validate password strength consistent with user creation / registration.
    crate::controllers::auth::validate_password_strength(admin_password)?;

    tenants_model::init_tenant_admin(
        &ctx.db,
        &p.name,
        &p.code,
        p.description.as_deref(),
        "default",
        admin_name,
        admin_email,
        admin_password,
    )
    .await
    .map_err(Error::wrap)?;

    // init_tenant_admin ran in its own transaction and committed; re-fetch
    // the tenant row to return to the client.
    let model = tenants_model::Model::find_by_code(&ctx.db, &p.code)
        .await
        .map_err(Error::wrap)?;

    format::json(model)
}

#[debug_handler]
async fn update(
    auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(p): Json<TenantUpsert>,
) -> Result<Response> {
    require_platform_admin(
        &auth,
        &tenant.code,
        "system:tenant:update",
        "租户管理仅对平台租户管理员开放",
    )?;
    tenants_model::Model::validate_code(&p.code).map_err(Error::BadRequest)?;
    let item = tenants_model::Model::find_by_id(&ctx.db, id)
        .await
        .map_err(|e| match e {
            ModelError::EntityNotFound => Error::NotFound,
            other => Error::wrap(other),
        })?;
    // Prevent changing the tenant code on update: it is used as the
    // tenant_id foreign key value in every other table (users, roles,
    // departments, …). There is no FK constraint, so changing it would
    // orphan all related data. The code must remain immutable post-creation.
    if p.code != item.code {
        return Err(Error::BadRequest("租户代码创建后不可修改".to_string()));
    }
    if let Some(status) = p.status.as_deref() {
        if status != "enabled" && status != "disabled" {
            return Err(Error::BadRequest(
                "租户状态仅支持 enabled/disabled".to_string(),
            ));
        }
        // Default tenant hosts the platform admin; disabling it would lock
        // out every tenant-management console and require manual DB recovery.
        if status == "disabled" && item.code == DEFAULT_TENANT_CODE {
            return Err(Error::BadRequest("默认租户不可停用".to_string()));
        }
    }

    // Disabled tenants block new logins, but already-issued JWTs carry the
    // tenant claim and remain accepted by per-resource checks. Revoke every
    // user in the tenant before persisting the status so old sessions fail
    // immediately instead of lingering until JWT expiry.
    if item.is_enabled() && p.status.as_deref() == Some("disabled") {
        crate::middleware::session_guard::revoke_users_in_tenant(&ctx.db, &item.code).await?;
    }

    let mut a = item.into_active_model();
    a.name = Set(p.name);
    a.domain = Set(p.domain);
    if let Some(s) = p.status {
        a.status = Set(s);
    }
    a.contact_name = Set(p.contact_name);
    a.contact_email = Set(p.contact_email);
    a.description = Set(p.description);
    a.updated_at = Set(chrono::Utc::now().into());
    format::json(a.update(&ctx.db).await?)
}

#[debug_handler]
async fn remove(
    auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_platform_admin(
        &auth,
        &tenant.code,
        "system:tenant:delete",
        "租户管理仅对平台租户管理员开放",
    )?;

    // Capture the target tenant before deletion.
    let target = tenants_model::Model::find_by_id(&ctx.db, id)
        .await
        .map_err(|e| match e {
            ModelError::EntityNotFound => Error::NotFound,
            other => Error::wrap(other),
        })?;
    if target.code == DEFAULT_TENANT_CODE {
        // The default tenant hosts platform roles, menus, and all fallback
        // data; deleting it would also remove the bootstrap template used by
        // every future tenant.
        return Err(Error::BadRequest("默认租户不可删除".to_string()));
    }
    // Revoke all target-tenant sessions before cascade-deleting users; the
    // user rows are needed to discover session owners and are gone after
    // delete_tenant commits.
    crate::middleware::session_guard::revoke_users_in_tenant(&ctx.db, &target.code).await?;
    tenants_model::Model::delete_tenant(&ctx.db, id)
        .await
        .map_err(|e| match e {
            ModelError::EntityNotFound => Error::NotFound,
            other => Error::wrap(other),
        })?;
    format::empty()
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/tenants")
        .add("/", get(list))
        .add("/", post(create))
        .add("/{id}", get(get_one))
        .add("/{id}", put(update))
        .add("/{id}", delete(remove))
}
