use loco_rs::prelude::*;
use sea_orm::{
    ColumnTrait, EntityTrait, Order, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect,
};

pub use super::_entities::menus::{self, ActiveModel, Entity, Model};

impl Model {
    pub async fn find_by_id_in_tenant(
        db: &DatabaseConnection,
        id: i32,
        tenant_code: &str,
    ) -> ModelResult<Self> {
        Entity::find_by_id(id)
            .filter(menus::Column::TenantId.eq(tenant_code))
            .one(db)
            .await?
            .ok_or_else(|| ModelError::EntityNotFound)
    }

    pub async fn list_paginated(
        db: &DatabaseConnection,
        tenant_code: &str,
        order_asc: bool,
        offset: u64,
        limit: u64,
    ) -> ModelResult<(Vec<Self>, u64)> {
        let order = if order_asc { Order::Asc } else { Order::Desc };
        let find = Entity::find().filter(menus::Column::TenantId.eq(tenant_code));
        let total = find.clone().count(db).await.map_err(ModelError::from)?;
        let items = find
            .order_by(menus::Column::SortOrder, order)
            .offset(offset)
            .limit(limit)
            .all(db)
            .await
            .map_err(ModelError::from)?;
        Ok((items, total))
    }

    /// 检查将 new_parent_id 设为 id 的上级是否会形成循环（自引用或祖先链回环）。
    /// 同时校验 new_parent_id 在当前租户内存在。
    pub async fn would_create_cycle(
        db: &DatabaseConnection,
        id: i32,
        new_parent_id: i32,
        tenant_code: &str,
    ) -> ModelResult<bool> {
        if new_parent_id == id {
            return Ok(true);
        }
        let mut current = new_parent_id;
        for _ in 0..100 {
            let node = Self::find_by_id_in_tenant(db, current, tenant_code).await?;
            match node.parent_id {
                Some(gp) => {
                    if gp == id {
                        return Ok(true);
                    }
                    current = gp;
                }
                None => return Ok(false),
            }
        }
        Ok(false)
    }

    /// Parse the `actions` JSON column into a list of supported action identifiers.
    #[must_use]
    pub fn action_list(&self) -> Vec<String> {
        self.actions
            .as_ref()
            .and_then(|j| serde_json::from_value::<Vec<String>>(j.clone()).ok())
            .unwrap_or_else(|| vec!["read".to_string()])
    }
}

impl ActiveModelBehavior for ActiveModel {}
