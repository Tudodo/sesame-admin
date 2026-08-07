use loco_rs::prelude::*;
use sea_orm::{
    ColumnTrait, EntityTrait, Order, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect, Set,
};
use serde::{Deserialize, Serialize};

pub use super::_entities::scheduled_task::{self, ActiveModel, Entity, Model};

impl Model {
    pub async fn find_by_id_in_tenant(
        db: &DatabaseConnection,
        id: i32,
        tenant_code: &str,
    ) -> ModelResult<Self> {
        Entity::find_by_id(id)
            .filter(scheduled_task::Column::TenantId.eq(tenant_code))
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
        let find = Entity::find().filter(scheduled_task::Column::TenantId.eq(tenant_code));
        let total = find.clone().count(db).await.map_err(ModelError::from)?;
        let items = find
            .order_by(scheduled_task::Column::Id, Order::Asc)
            .offset(offset)
            .limit(limit)
            .all(db)
            .await
            .map_err(ModelError::from)?;
        Ok((items, total))
    }

    pub async fn create_from(
        db: &DatabaseConnection,
        params: &TaskUpsertParams,
        tenant_code: &str,
    ) -> ModelResult<Self> {
        let active = ActiveModel {
            name: Set(params.name.clone()),
            cron_expr: Set(params.cron_expr.clone()),
            handler: Set(params.handler.clone()),
            params: Set(params.params.clone()),
            status: Set(params.status.clone().unwrap_or_else(|| "enabled".into())),
            description: Set(params.description.clone()),
            tenant_id: Set(Some(tenant_code.to_string())),
            ..Default::default()
        };
        active.insert(db).await.map_err(ModelError::from)
    }

    pub async fn update_from(
        db: &DatabaseConnection,
        id: i32,
        tenant_code: &str,
        params: &TaskUpsertParams,
    ) -> ModelResult<Self> {
        let existing = Self::find_by_id_in_tenant(db, id, tenant_code).await?;
        let mut active = existing.into_active_model();
        active.name = Set(params.name.clone());
        active.cron_expr = Set(params.cron_expr.clone());
        active.handler = Set(params.handler.clone());
        active.params = Set(params.params.clone());
        active.status = Set(params.status.clone().unwrap_or_else(|| "enabled".into()));
        active.description = Set(params.description.clone());
        active.update(db).await.map_err(ModelError::from)
    }

    pub async fn delete_in_tenant(
        db: &DatabaseConnection,
        id: i32,
        tenant_code: &str,
    ) -> ModelResult<()> {
        let existing = Self::find_by_id_in_tenant(db, id, tenant_code).await?;
        existing.delete(db).await.map_err(ModelError::from)?;
        Ok(())
    }
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TaskUpsertParams {
    pub name: String,
    pub cron_expr: String,
    pub handler: String,
    pub params: Option<serde_json::Value>,
    pub status: Option<String>,
    pub description: Option<String>,
}

impl ActiveModelBehavior for ActiveModel {}
