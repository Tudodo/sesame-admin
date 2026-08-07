use loco_rs::prelude::*;
use sea_orm::{
    ColumnTrait, EntityTrait, Order, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect,
};
use std::collections::HashMap;

pub use super::_entities::menus;
pub use super::_entities::roles::{self, ActiveModel, Entity, Model};
pub use super::_entities::roles_menus;

/// Normalize legacy action aliases to the canonical RBAC verb set.
fn normalize_action(action: &str) -> String {
    match action {
        "list" | "view" => "read",
        "edit" => "update",
        "add" => "create",
        other => other,
    }
    .to_string()
}

impl Model {
    pub async fn find_by_id_in_tenant(
        db: &DatabaseConnection,
        id: i32,
        tenant_code: &str,
    ) -> ModelResult<Self> {
        Entity::find_by_id(id)
            .filter(roles::Column::TenantId.eq(tenant_code))
            .one(db)
            .await?
            .ok_or_else(|| ModelError::EntityNotFound)
    }

    pub async fn list_paginated(
        db: &DatabaseConnection,
        tenant_code: &str,
        offset: u64,
        limit: u64,
    ) -> ModelResult<(Vec<Self>, u64)> {
        let find = Entity::find().filter(roles::Column::TenantId.eq(tenant_code));
        let total = find.clone().count(db).await.map_err(ModelError::from)?;
        let items = find
            .order_by(roles::Column::RoleSort, Order::Asc)
            .order_by(roles::Column::Id, Order::Asc)
            .offset(offset)
            .limit(limit)
            .all(db)
            .await
            .map_err(ModelError::from)?;
        Ok((items, total))
    }

    /// Get all menu + permissions for this role
    pub async fn get_menu_perms(
        &self,
        db: &DatabaseConnection,
    ) -> ModelResult<Vec<(i32, Vec<String>)>> {
        let items = roles_menus::Entity::find()
            .filter(roles_menus::Column::RoleId.eq(self.id))
            .filter(roles_menus::Column::TenantId.eq(self.tenant_id.clone()))
            .all(db)
            .await?;
        Ok(items
            .iter()
            .map(|r| {
                let perms: Vec<String> = r
                    .permissions
                    .as_ref()
                    .and_then(|j| serde_json::from_value::<Vec<String>>(j.clone()).ok())
                    .unwrap_or_else(|| vec!["read".to_string()]);
                (r.menu_id, perms)
            })
            .collect())
    }

    /// Get menu IDs only
    pub async fn get_menu_ids(&self, db: &DatabaseConnection) -> ModelResult<Vec<i32>> {
        let ids = roles_menus::Entity::find()
            .filter(roles_menus::Column::RoleId.eq(self.id))
            .filter(roles_menus::Column::TenantId.eq(self.tenant_id.clone()))
            .all(db)
            .await?
            .iter()
            .map(|r| r.menu_id)
            .collect();
        Ok(ids)
    }

    /// Replace menu assignments with permissions.
    ///
    /// Input is validated against the tenant menu action lists before any row
    /// is deleted, so an invalid assignment cannot partially clear a role.
    pub async fn set_menus(
        &self,
        db: &DatabaseConnection,
        menus: &[(i32, Vec<String>)],
    ) -> ModelResult<()> {
        let normalized =
            Self::validate_menu_tenant(db, menus, self.tenant_id.as_deref().unwrap_or_default())
                .await?;
        let txn = db.begin().await?;
        roles_menus::Entity::delete_many()
            .filter(roles_menus::Column::RoleId.eq(self.id))
            .filter(roles_menus::Column::TenantId.eq(self.tenant_id.clone()))
            .exec(&txn)
            .await?;
        for (menu_id, perms) in normalized {
            let json_val = serde_json::to_value(perms).unwrap_or(serde_json::Value::Array(vec![]));
            roles_menus::ActiveModel {
                role_id: ActiveValue::set(self.id),
                menu_id: ActiveValue::set(menu_id),
                permissions: ActiveValue::set(Some(json_val)),
                tenant_id: ActiveValue::set(self.tenant_id.clone()),
                ..Default::default()
            }
            .insert(&txn)
            .await?;
        }
        txn.commit().await?;
        Ok(())
    }

    /// Validate menu ownership and granted action whitelist for a role.
    ///
    /// Returns normalized, de-duplicated action lists so callers and
    /// [`Self::set_menus`] never persist aliases or actions the menu does not
    /// expose.
    pub async fn validate_menu_tenant(
        db: &DatabaseConnection,
        menu_ids: &[(i32, Vec<String>)],
        tenant_code: &str,
    ) -> ModelResult<Vec<(i32, Vec<String>)>> {
        if menu_ids.is_empty() {
            return Ok(vec![]);
        }
        let ids: Vec<i32> = menu_ids.iter().map(|(id, _)| *id).collect();
        let menu_rows = menus::Entity::find()
            .filter(menus::Column::Id.is_in(ids))
            .filter(menus::Column::TenantId.eq(tenant_code))
            .all(db)
            .await
            .map_err(ModelError::from)?;
        if menu_rows.len() != menu_ids.len() {
            return Err(ModelError::Message(
                "Some menu IDs do not belong to this tenant".into(),
            ));
        }
        let by_id: HashMap<i32, &menus::Model> = menu_rows.iter().map(|m| (m.id, m)).collect();
        let mut normalized = Vec::with_capacity(menu_ids.len());
        for (menu_id, actions) in menu_ids {
            let menu = by_id
                .get(menu_id)
                .ok_or_else(|| ModelError::Message("菜单不存在或不属于当前租户".into()))?;
            let allowed = menu.action_list();
            let mut cleaned = Vec::with_capacity(actions.len());
            for action in actions {
                let normalized_action = normalize_action(action);
                if normalized_action.is_empty() {
                    return Err(ModelError::Message(format!(
                        "菜单 {} 包含空动作",
                        menu.name
                    )));
                }
                if !allowed.contains(&normalized_action) {
                    return Err(ModelError::Message(format!(
                        "菜单 {} 不支持动作 {normalized_action}",
                        menu.name
                    )));
                }
                if !cleaned.contains(&normalized_action) {
                    cleaned.push(normalized_action);
                }
            }
            normalized.push((*menu_id, cleaned));
        }
        Ok(normalized)
    }
}

impl ActiveModelBehavior for ActiveModel {}
