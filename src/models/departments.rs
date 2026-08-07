use loco_rs::prelude::*;
use sea_orm::{
    ColumnTrait, EntityTrait, Order, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect,
};

pub use super::_entities::departments::{self, ActiveModel, Entity, Model};

impl Model {
    pub async fn find_by_id_in_tenant(
        db: &DatabaseConnection,
        id: i32,
        tenant_code: &str,
    ) -> ModelResult<Self> {
        Entity::find_by_id(id)
            .filter(departments::Column::TenantId.eq(tenant_code))
            .one(db)
            .await?
            .ok_or_else(|| ModelError::EntityNotFound)
    }

    /// Find multiple departments by their IDs within a tenant.
    pub async fn find_by_ids(
        db: &DatabaseConnection,
        ids: &[i32],
        tenant_code: &str,
    ) -> ModelResult<Vec<Self>> {
        if ids.is_empty() {
            return Ok(vec![]);
        }
        Entity::find()
            .filter(departments::Column::Id.is_in(ids.to_vec()))
            .filter(departments::Column::TenantId.eq(tenant_code))
            .order_by(departments::Column::SortOrder, Order::Asc)
            .all(db)
            .await
            .map_err(ModelError::from)
    }

    /// Find multiple departments and include their ancestor chain for tree building.
    /// This lets a leaf-scoped caller see enough context without leaking sibling
    /// department users.
    pub async fn find_by_ids_with_ancestors(
        db: &DatabaseConnection,
        ids: &[i32],
        tenant_code: &str,
    ) -> ModelResult<Vec<Self>> {
        if ids.is_empty() {
            return Ok(vec![]);
        }
        let mut needed = ids.to_vec();
        let mut index = 0usize;
        while index < needed.len() {
            let node = Self::find_by_id_in_tenant(db, needed[index], tenant_code).await?;
            if let Some(parent_id) = node.parent_id {
                if !needed.contains(&parent_id) {
                    needed.push(parent_id);
                }
            }
            index += 1;
        }
        Self::find_by_ids(db, &needed, tenant_code).await
    }

    /// List all departments in a tenant (no pagination), for tree building.
    pub async fn list_all_by_tenant(
        db: &DatabaseConnection,
        tenant_code: &str,
    ) -> ModelResult<Vec<Self>> {
        Entity::find()
            .filter(departments::Column::TenantId.eq(tenant_code))
            .order_by(departments::Column::SortOrder, Order::Asc)
            .all(db)
            .await
            .map_err(ModelError::from)
    }

    pub async fn list_paginated(
        db: &DatabaseConnection,
        tenant_code: &str,
        order_asc: bool,
        offset: u64,
        limit: u64,
    ) -> ModelResult<(Vec<Self>, u64)> {
        let order = if order_asc { Order::Asc } else { Order::Desc };
        let find = Entity::find().filter(departments::Column::TenantId.eq(tenant_code));
        let total = find.clone().count(db).await.map_err(ModelError::from)?;
        let items = find
            .order_by(departments::Column::SortOrder, order)
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
}

impl ActiveModelBehavior for ActiveModel {}
