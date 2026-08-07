use loco_rs::prelude::*;
use sea_orm::{
    ColumnTrait, EntityTrait, Order, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect,
};

pub use super::_entities::dictionaries::{self, ActiveModel, Entity, Model};

impl Model {
    pub async fn find_by_id_in_tenant(
        db: &DatabaseConnection,
        id: i32,
        tenant_code: &str,
    ) -> ModelResult<Self> {
        Entity::find_by_id(id)
            .filter(dictionaries::Column::TenantId.eq(tenant_code))
            .one(db)
            .await?
            .ok_or_else(|| ModelError::EntityNotFound)
    }

    pub async fn find_by_code(
        db: &DatabaseConnection,
        code: &str,
        tenant_code: &str,
    ) -> ModelResult<Self> {
        Entity::find()
            .filter(dictionaries::Column::Code.eq(code))
            .filter(dictionaries::Column::TenantId.eq(tenant_code))
            .one(db)
            .await?
            .ok_or_else(|| ModelError::EntityNotFound)
    }

    pub async fn list_paginated(
        db: &DatabaseConnection,
        tenant_code: &str,
        code_filter: Option<&str>,
        order_asc: bool,
        offset: u64,
        limit: u64,
    ) -> ModelResult<(Vec<Self>, u64)> {
        let order = if order_asc { Order::Asc } else { Order::Desc };
        let mut select = Entity::find().filter(dictionaries::Column::TenantId.eq(tenant_code));
        if let Some(code) = code_filter {
            select = select.filter(dictionaries::Column::Code.eq(code));
        }
        let total = select.clone().count(db).await.map_err(ModelError::from)?;
        let items = select
            .order_by(dictionaries::Column::Id, order)
            .offset(offset)
            .limit(limit)
            .all(db)
            .await
            .map_err(ModelError::from)?;
        Ok((items, total))
    }
}

impl ActiveModelBehavior for ActiveModel {}
