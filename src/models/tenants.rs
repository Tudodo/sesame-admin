use loco_rs::prelude::*;
use sea_orm::{
    ColumnTrait, EntityTrait, Order, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect, Set,
    Statement,
};

pub use super::_entities::tenant::{self, ActiveModel, Entity, Model};

use crate::models::_entities::{menus, roles, roles_menus, users, users_roles};
use loco_rs::hash;

impl Model {
    /// Validate a tenant code: lowercase letters, digits, hyphen only,
    /// length 2-64. The code is used as tenant_id column value.
    /// engine tenant_id, file-storage path prefix, and SQL query parameter,
    /// so it must be filesystem- and query-safe.
    pub fn validate_code(code: &str) -> Result<(), String> {
        if code.len() < 2 || code.len() > 64 {
            return Err("tenant code must be 2-64 characters".into());
        }
        if !code
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        {
            return Err(
                "tenant code may only contain lowercase letters, digits, and hyphens".into(),
            );
        }
        if code.starts_with('-') {
            return Err("tenant code may not start with a hyphen".into());
        }
        Ok(())
    }
    pub async fn find_by_code(db: &DatabaseConnection, code: &str) -> ModelResult<Self> {
        Entity::find()
            .filter(tenant::Column::Code.eq(code))
            .one(db)
            .await?
            .ok_or_else(|| ModelError::EntityNotFound)
    }

    /// Whether the tenant is enabled and accepts new logins. A disabled tenant
    /// blocks new sessions, and tenant disable/delete revokes all tenant users so
    /// already-issued JWTs are rejected on their next request.
    pub fn is_enabled(&self) -> bool {
        self.status == "enabled"
    }

    pub async fn find_by_id(db: &DatabaseConnection, id: i32) -> ModelResult<Self> {
        Entity::find_by_id(id)
            .one(db)
            .await?
            .ok_or_else(|| ModelError::EntityNotFound)
    }

    pub async fn list_all(db: &DatabaseConnection) -> ModelResult<Vec<Self>> {
        Entity::find().all(db).await.map_err(ModelError::from)
    }

    pub async fn list_paginated(
        db: &DatabaseConnection,
        offset: u64,
        limit: u64,
    ) -> ModelResult<(Vec<Self>, u64)> {
        let find = Entity::find();
        let total = find.clone().count(db).await.map_err(ModelError::from)?;
        let items = find
            .order_by(tenant::Column::Id, Order::Asc)
            .offset(offset)
            .limit(limit)
            .all(db)
            .await
            .map_err(ModelError::from)?;
        Ok((items, total))
    }

    pub async fn create_tenant(
        db: &DatabaseConnection,
        name: &str,
        code: &str,
        description: Option<&str>,
    ) -> ModelResult<Self> {
        let now = chrono::Utc::now().into();
        let active = ActiveModel {
            name: Set(name.to_string()),
            code: Set(code.to_string()),
            description: Set(description.map(String::from)),
            status: Set("enabled".to_string()),
            created_at: Set(now),
            updated_at: Set(now),
            ..Default::default()
        };
        active.insert(db).await.map_err(ModelError::from)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn update_tenant(
        db: &DatabaseConnection,
        id: i32,
        name: &str,
        code: &str,
        domain: Option<String>,
        status: Option<String>,
        contact_name: Option<String>,
        contact_email: Option<String>,
        description: Option<String>,
    ) -> ModelResult<Self> {
        let existing = Self::find_by_id(db, id).await?;
        let mut a = existing.into_active_model();
        a.name = Set(name.to_string());
        a.code = Set(code.to_string());
        a.domain = Set(domain);
        if let Some(s) = status {
            a.status = Set(s);
        }
        a.contact_name = Set(contact_name);
        a.contact_email = Set(contact_email);
        a.description = Set(description);
        a.updated_at = Set(chrono::Utc::now().into());
        a.update(db).await.map_err(ModelError::from)
    }

    pub async fn delete_tenant(db: &DatabaseConnection, id: i32) -> ModelResult<()> {
        use sea_orm::ConnectionTrait;
        let existing = Self::find_by_id(db, id).await?;
        let tenant_code = existing.code.clone();

        // Cascade-delete all data scoped to this tenant so that:
        // 1. No orphan rows linger with a tenant_id pointing at a gone tenant.
        // 2. A tenant re-created later with the same code cannot inherit the
        //    previous tenant's users (with possibly-known passwords), roles,
        //    menus, or other tenant-scoped data.
        let txn = db.begin().await.map_err(ModelError::from)?;

        // Discover every table that has a tenant_id column and purge rows
        // for this tenant in one transaction. Using information_schema keeps
        // this future-proof as new tenant-scoped tables are added.
        let rows = txn
            .query_all(Statement::from_string(
                sea_orm::DatabaseBackend::Postgres,
                "SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='tenant_id'",
            ))
            .await
            .map_err(ModelError::from)?;
        for row in rows {
            let table: String = row.try_get("", "table_name").map_err(ModelError::from)?;
            if !is_safe_cascade_table_name(&table) {
                return Err(ModelError::msg("information_schema 返回了非法表名"));
            }
            // Skip the tenant table itself; it is deleted by id below.
            if table == "tenant" {
                continue;
            }
            let sql = format!("DELETE FROM \"{}\" WHERE tenant_id = $1", table);
            txn.execute(Statement::from_sql_and_values(
                sea_orm::DatabaseBackend::Postgres,
                sql,
                [tenant_code.clone().into()],
            ))
            .await
            .map_err(ModelError::from)?;
        }

        // Finally remove the tenant record itself.
        existing
            .clone()
            .into_active_model()
            .delete(&txn)
            .await
            .map_err(ModelError::from)?;
        txn.commit().await.map_err(ModelError::from)?;
        Ok(())
    }
}

/// 仅允许普通业务表名参与租户级联删除，防止 information_schema 返回
/// 的任意字符串被拼入 DELETE SQL。
fn is_safe_cascade_table_name(table: &str) -> bool {
    if table.is_empty() || table.len() > 63 {
        return false;
    }
    if !table.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return false;
    }
    !table.starts_with("pg_") && !table.starts_with("sql_") && table != "information_schema"
}

/// Bootstraps a freshly-created tenant so its admin can actually log in:
/// clones the `default` tenant's menu tree (re-parenting ids), creates an
/// `admin` role with full permissions on every cloned menu, creates the
/// admin user, and links them via `users_roles` scoped to the new tenant.
/// Everything runs in one transaction so a partial init never leaks.
///
/// `source_tenant` is the template to copy menus from (defaults to "default").
#[allow(clippy::too_many_arguments)]
pub async fn init_tenant_admin(
    db: &DatabaseConnection,
    tenant_name: &str,
    tenant_code: &str,
    description: Option<&str>,
    source_tenant: &str,
    admin_name: &str,
    admin_email: &str,
    admin_password: &str,
) -> ModelResult<users::Model> {
    let txn = db.begin().await.map_err(ModelError::from)?;

    // 0. Insert the tenant record inside this transaction so that if any
    //    subsequent step fails, the tenant is rolled back too — no orphan
    //    tenant rows without menus/roles/admin.
    let now: chrono::DateTime<chrono::FixedOffset> = chrono::Utc::now().into();
    let tenant_active = ActiveModel {
        name: Set(tenant_name.to_string()),
        code: Set(tenant_code.to_string()),
        description: Set(description.map(String::from)),
        status: Set("enabled".to_string()),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    };
    let _tenant = tenant_active.insert(&txn).await?;

    // 1. Clone the template tenant's menu tree, tracking old→new id so we
    //    can re-parent children after insertion.
    let template_menus = menus::Entity::find()
        .filter(menus::Column::TenantId.eq(source_tenant))
        .order_by(menus::Column::Id, Order::Asc)
        .all(&txn)
        .await?;
    let mut id_map: std::collections::HashMap<i32, i32> = std::collections::HashMap::new();
    let now: chrono::DateTime<chrono::FixedOffset> = chrono::Utc::now().into();
    for m in &template_menus {
        let active = menus::ActiveModel {
            name: Set(m.name.clone()),
            path: Set(m.path.clone()),
            icon: Set(m.icon.clone()),
            // Parent is patched in a second pass once all ids are known.
            parent_id: Set(None),
            sort_order: Set(m.sort_order),
            permission: Set(m.permission.clone()),
            visible: Set(m.visible),
            created_at: Set(now),
            updated_at: Set(now),
            actions: Set(m.actions.clone()),
            menu_type: Set(m.menu_type.clone()),
            tenant_id: Set(Some(tenant_code.to_string())),
            ..Default::default()
        };
        let inserted = active.insert(&txn).await?;
        id_map.insert(m.id, inserted.id);
    }
    // Patch parents now that all new ids exist.
    for m in &template_menus {
        if let Some(old_parent) = m.parent_id {
            if let Some(&new_parent) = id_map.get(&old_parent) {
                let new_id = id_map[&m.id];
                let a = menus::ActiveModel {
                    id: Set(new_id),
                    parent_id: Set(Some(new_parent)),
                    ..Default::default()
                };
                let _ = a.update(&txn).await;
            }
        }
    }

    // 2. Create the admin role scoped to the new tenant, with the same
    //    full-permission set the template admin role uses.
    let full_perms = serde_json::json!(["create", "read", "update", "delete", "export"]);
    let role_active = roles::ActiveModel {
        name: Set("admin".to_string()),
        description: Set(Some("Tenant administrator".to_string())),
        role_key: Set("admin".to_string()),
        role_sort: Set(0),
        status: Set(1),
        data_scope: Set(1),
        is_system: Set(true),
        dept_ids: Set(None),
        tenant_id: Set(Some(tenant_code.to_string())),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    };
    let role = role_active.insert(&txn).await?;
    for &new_menu_id in id_map.values() {
        roles_menus::ActiveModel {
            role_id: Set(role.id),
            menu_id: Set(new_menu_id),
            permissions: Set(Some(full_perms.clone())),
            tenant_id: Set(Some(tenant_code.to_string())),
            ..Default::default()
        }
        .insert(&txn)
        .await?;
    }

    // 3. Create the admin user bound to this tenant.
    let hashed =
        hash::hash_password(admin_password).map_err(|e| ModelError::msg(&e.to_string()))?;
    let user_active = users::ActiveModel {
        name: Set(admin_name.to_string()),
        email: Set(admin_email.to_string()),
        password: Set(hashed),
        tenant_id: Set(Some(tenant_code.to_string())),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    };
    let user = user_active.insert(&txn).await?;

    // 4. Link user ↔ admin role, scoped to this tenant.
    users_roles::ActiveModel {
        user_id: Set(user.id),
        role_id: Set(role.id),
        tenant_id: Set(Some(tenant_code.to_string())),
        ..Default::default()
    }
    .insert(&txn)
    .await?;

    txn.commit().await.map_err(ModelError::from)?;
    Ok(user)
}

impl ActiveModelBehavior for ActiveModel {}
