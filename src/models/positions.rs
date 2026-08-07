use loco_rs::prelude::*;
use sea_orm::{
    ColumnTrait, EntityTrait, Order, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect,
};

pub use super::_entities::positions::{self, ActiveModel, Entity, Model};

impl Model {
    pub async fn find_by_id_in_tenant(
        db: &DatabaseConnection,
        id: i32,
        tenant_code: &str,
    ) -> ModelResult<Self> {
        Entity::find_by_id(id)
            .filter(positions::Column::TenantId.eq(tenant_code))
            .one(db)
            .await?
            .ok_or_else(|| ModelError::EntityNotFound)
    }

    pub async fn list_paginated(
        db: &DatabaseConnection,
        tenant_code: &str,
        dept_id: Option<i32>,
        order_asc: bool,
        offset: u64,
        limit: u64,
    ) -> ModelResult<(Vec<Self>, u64)> {
        let order = if order_asc { Order::Asc } else { Order::Desc };
        let mut query = Entity::find().filter(positions::Column::TenantId.eq(tenant_code));
        if let Some(did) = dept_id {
            query = query.filter(positions::Column::DeptId.eq(did));
        }
        let total = query.clone().count(db).await.map_err(ModelError::from)?;
        let items = query
            .order_by(positions::Column::SortOrder, order)
            .offset(offset)
            .limit(limit)
            .all(db)
            .await
            .map_err(ModelError::from)?;
        Ok((items, total))
    }
}

impl ActiveModelBehavior for ActiveModel {}
