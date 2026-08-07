use loco_rs::prelude::*;
use sea_orm::{
    ColumnTrait, EntityTrait, Order, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect,
};

pub use super::_entities::scheduled_task_log::{self, ActiveModel, Entity, Model};

impl Model {
    pub async fn list_paginated(
        db: &DatabaseConnection,
        tenant_code: &str,
        task_id: Option<i32>,
        offset: u64,
        limit: u64,
    ) -> ModelResult<(Vec<Self>, u64)> {
        let mut select =
            Entity::find().filter(scheduled_task_log::Column::TenantId.eq(tenant_code));
        if let Some(tid) = task_id {
            select = select.filter(scheduled_task_log::Column::TaskId.eq(tid));
        }
        let total = select.clone().count(db).await.map_err(ModelError::from)?;
        let items = select
            .order_by(scheduled_task_log::Column::Id, Order::Desc)
            .offset(offset)
            .limit(limit)
            .all(db)
            .await
            .map_err(ModelError::from)?;
        Ok((items, total))
    }
}

impl ActiveModelBehavior for ActiveModel {}
