use crate::data::permissions::require_perm_code;
use crate::middleware::tenant::TenantScope;
use crate::models::_entities::departments;
use crate::models::_entities::users;
use crate::models::departments as departments_model;
use axum::Extension;
use loco_rs::prelude::*;
use sea_orm::PaginatorTrait;

use serde::{Deserialize, Serialize};

/// Check if a database error is a unique-constraint violation (PostgreSQL SQLSTATE 23505).
/// Returns a user-friendly error when the duplicate is on the `code` column.
fn check_dept_db_err(e: sea_orm::DbErr) -> Error {
    let msg = e.to_string().to_lowercase();
    if msg.contains("duplicate key") || msg.contains("unique constraint") || msg.contains("23505") {
        if msg.contains("code") {
            return Error::BadRequest("部门编码已存在，请使用其他编码".to_string());
        }
        return Error::BadRequest("数据重复，请检查唯一字段".to_string());
    }
    tracing::error!(error = %e, "department database error");
    Error::from(e)
}

/// Normalize a blank department code to `None` so it never occupies the
/// unique `(tenant_id, code)` index.
fn normalize_dept_code_param(code: Option<String>) -> Option<String> {
    code.and_then(|code| {
        let code = code.trim();
        (!code.is_empty()).then(|| code.to_string())
    })
}

/// Validates the department code format.
/// Codes must be alphanumeric with optional underscores, hyphens, or dots.
fn validate_dept_code(code: &str) -> Result<(), Error> {
    let code = code.trim();
    if code.is_empty() {
        return Ok(());
    }
    if code.len() > 64 {
        return Err(Error::BadRequest("部门编码长度不能超过64个字符".into()));
    }
    if !code
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
    {
        return Err(Error::BadRequest(
            "部门编码只能包含字母、数字、下划线、连字符和点".into(),
        ));
    }
    Ok(())
}

#[derive(Debug, Deserialize, Serialize)]
pub struct UpsertParams {
    pub name: String,
    pub description: Option<String>,
    pub parent_id: Option<i32>,
    pub sort_order: Option<i32>,
    pub code: Option<String>,
    pub leader_pid: Option<String>,
}

/// Parse an optional department leader PID. Empty string clears the relation;
/// absent/null leaves the existing value unchanged on update.
fn parse_optional_leader_pid(value: Option<String>) -> Result<Option<Option<uuid::Uuid>>, Error> {
    match value {
        None => Ok(None),
        Some(s) if s.trim().is_empty() => Ok(Some(None)),
        Some(s) => uuid::Uuid::parse_str(s.trim())
            .map(|id| Some(Some(id)))
            .map_err(|_| Error::BadRequest("部门负责人格式不正确".into())),
    }
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
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Query(q): Query<QueryParams>,
) -> Result<Response> {
    require_perm_code(&auth, "system:dept:read")?;
    let (start, limit) = crate::data::page_range(q.start, q.end);
    let is_asc = q
        .order
        .as_deref()
        .map(|o| o.eq_ignore_ascii_case("asc"))
        .unwrap_or(true);
    let (items, total) = departments_model::Model::list_paginated(
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

async fn load(ctx: &AppContext, id: i32, tenant_code: &str) -> Result<departments::Model> {
    departments_model::Model::find_by_id_in_tenant(&ctx.db, id, tenant_code)
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
    require_perm_code(&auth, "system:dept:read")?;
    format::json(load(&ctx, id, &tenant.code).await?)
}

#[debug_handler]
async fn create(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(params): Json<UpsertParams>,
) -> Result<Response> {
    require_perm_code(&auth, "system:dept:create")?;
    let code = normalize_dept_code_param(params.code);
    if let Some(ref code) = code {
        validate_dept_code(code)?;
    }
    // Validate parent_id belongs to the same tenant to prevent cross-tenant hierarchy.
    if let Some(pid) = params.parent_id {
        departments_model::Model::find_by_id_in_tenant(&ctx.db, pid, &tenant.code)
            .await
            .map_err(Error::wrap)?;
    }
    let leader_pid = parse_optional_leader_pid(params.leader_pid.clone())?.flatten();
    if let Some(pid) = leader_pid {
        users::Model::find_by_pid_in_tenant(&ctx.db, pid, &tenant.code).await?;
    }
    let m = departments::ActiveModel {
        name: Set(params.name),
        description: Set(params.description),
        parent_id: Set(params.parent_id),
        sort_order: Set(params.sort_order.unwrap_or(0)),
        code: Set(code),
        leader_pid: Set(leader_pid),
        tenant_id: Set(Some(tenant.code)),
        ..Default::default()
    }
    .insert(&ctx.db)
    .await
    .map_err(check_dept_db_err)?;
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
    require_perm_code(&auth, "system:dept:update")?;
    let code = normalize_dept_code_param(params.code);
    if let Some(ref code) = code {
        validate_dept_code(code)?;
    }
    let item = load(&ctx, id, &tenant.code).await?;
    let leader_pid = parse_optional_leader_pid(params.leader_pid.clone())?;
    if let Some(Some(pid)) = leader_pid {
        users::Model::find_by_pid_in_tenant(&ctx.db, pid, &tenant.code).await?;
    }
    // 校验 parent_id 归属当前租户且不会形成循环（自引用或祖先链回环）。
    if let Some(pid) = params.parent_id {
        if departments_model::Model::would_create_cycle(&ctx.db, id, pid, &tenant.code)
            .await
            .map_err(Error::wrap)?
        {
            return Err(Error::BadRequest(
                "不能将自身或下级部门设为上级".to_string(),
            ));
        }
    }
    let current_sort = item.sort_order;
    let mut a = item.into_active_model();
    a.name = Set(params.name);
    a.description = Set(params.description);
    a.parent_id = Set(params.parent_id);
    a.sort_order = Set(params.sort_order.unwrap_or(current_sort));
    a.code = Set(code);
    if let Some(lp) = leader_pid {
        a.leader_pid = Set(lp);
    }
    format::json(a.update(&ctx.db).await.map_err(check_dept_db_err)?)
}

#[debug_handler]
async fn remove(
    auth: auth::JWT,
    Path(id): Path<i32>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_perm_code(&auth, "system:dept:delete")?;
    // 检查是否有子部门，避免外键约束报错或产生孤儿层级
    let child_count = departments::Entity::find()
        .filter(departments::Column::ParentId.eq(id))
        .filter(departments::Column::TenantId.eq(tenant.code.clone()))
        .count(&ctx.db)
        .await
        .map_err(Error::wrap)?;
    if child_count > 0 {
        return Err(Error::BadRequest(
            "该部门下存在子部门，请先删除子部门".to_string(),
        ));
    }
    let item = load(&ctx, id, &tenant.code).await?;
    item.delete(&ctx.db).await?;
    format::empty()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dept_code_param_blank_is_normalized_to_none() {
        assert_eq!(normalize_dept_code_param(None), None);
        assert_eq!(normalize_dept_code_param(Some(String::new())), None);
        assert_eq!(normalize_dept_code_param(Some("  ".to_string())), None);
        assert_eq!(
            normalize_dept_code_param(Some(" sales ".to_string())),
            Some("sales".to_string())
        );
    }

    #[test]
    fn dept_code_validation_trims_and_rejects_unsafe_chars() {
        assert!(validate_dept_code("").is_ok());
        assert!(validate_dept_code("  ").is_ok());
        assert!(validate_dept_code(" sales ").is_ok());
        assert!(validate_dept_code("sales.east").is_ok());
        assert!(validate_dept_code("sales; DROP").is_err());
        assert!(validate_dept_code("x".repeat(65).as_str()).is_err());
    }
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/departments")
        .add("/", get(list))
        .add("/", post(create))
        .add("/{id}", get(get_one))
        .add("/{id}", put(update))
        .add("/{id}", delete(remove))
}
