use loco_rs::prelude::*;
use sea_orm::{
    ColumnTrait, EntityTrait, Order, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect,
};

pub use super::_entities::dictionary_entries::{self, ActiveModel, Entity, Model};

impl Model {
    pub async fn find_by_id_in_tenant(
        db: &DatabaseConnection,
        id: i32,
        tenant_code: &str,
    ) -> ModelResult<Self> {
        Entity::find_by_id(id)
            .filter(dictionary_entries::Column::TenantId.eq(tenant_code))
            .one(db)
            .await?
            .ok_or_else(|| ModelError::EntityNotFound)
    }

    pub async fn list_paginated(
        db: &DatabaseConnection,
        tenant_code: &str,
        dictionary_id: Option<i32>,
        order_asc: bool,
        offset: u64,
        limit: u64,
    ) -> ModelResult<(Vec<Self>, u64)> {
        let order = if order_asc { Order::Asc } else { Order::Desc };
        let mut select =
            Entity::find().filter(dictionary_entries::Column::TenantId.eq(tenant_code));
        if let Some(did) = dictionary_id {
            select = select.filter(dictionary_entries::Column::DictionaryId.eq(did));
        }
        let total = select.clone().count(db).await.map_err(ModelError::from)?;
        let items = select
            .order_by(dictionary_entries::Column::SortOrder, order)
            .offset(offset)
            .limit(limit)
            .all(db)
            .await
            .map_err(ModelError::from)?;
        Ok((items, total))
    }

    /// Get cached dictionary entries by dict code (for form dropdowns)
    pub async fn get_by_dict_code(
        db: &DatabaseConnection,
        dict_code: &str,
        tenant_code: &str,
    ) -> ModelResult<Vec<Self>> {
        if let Some(dict) = super::_entities::dictionaries::Entity::find()
            .filter(super::_entities::dictionaries::Column::Code.eq(dict_code))
            .filter(super::_entities::dictionaries::Column::TenantId.eq(tenant_code))
            .one(db)
            .await?
        {
            Entity::find()
                .filter(dictionary_entries::Column::DictionaryId.eq(dict.id))
                .filter(dictionary_entries::Column::TenantId.eq(tenant_code))
                .order_by(dictionary_entries::Column::SortOrder, Order::Asc)
                .all(db)
                .await
                .map_err(ModelError::from)
        } else {
            Ok(vec![])
        }
    }
}

impl ActiveModelBehavior for ActiveModel {}
