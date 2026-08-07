use loco_rs::prelude::*;
use sea_orm::{
    ColumnTrait, EntityTrait, Order, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect, Set,
};
use serde::{Deserialize, Serialize};

pub use super::_entities::sync_source::{self, ActiveModel, Entity, Model};

impl Model {
    pub async fn find_by_id_in_tenant(
        db: &DatabaseConnection,
        id: i32,
        tenant_code: &str,
    ) -> ModelResult<Self> {
        Entity::find_by_id(id)
            .filter(sync_source::Column::TenantId.eq(tenant_code))
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
        let find = Entity::find().filter(sync_source::Column::TenantId.eq(tenant_code));
        let total = find.clone().count(db).await.map_err(ModelError::from)?;
        let items = find
            .order_by(sync_source::Column::Id, Order::Desc)
            .offset(offset)
            .limit(limit)
            .all(db)
            .await
            .map_err(ModelError::from)?;
        Ok((items, total))
    }

    pub async fn create_from(
        db: &DatabaseConnection,
        params: &SyncSourceParams,
        tenant_code: &str,
    ) -> ModelResult<Self> {
        let now = chrono::Utc::now().into();
        super::sync_source_tables::validate_sync_field_mapping(params.field_mapping.as_ref())
            .map_err(|e| ModelError::msg(&e))?;
        let active = ActiveModel {
            name: Set(params.name.clone()),
            source_type: Set(params.source_type.clone()),
            connection_config: Set(params
                .connection_config
                .clone()
                .unwrap_or(serde_json::json!({"url": ""}))),
            target_table: Set(params.target_table.clone().unwrap_or_default()),
            field_mapping: Set(params.field_mapping.clone()),
            sync_mode: Set(params.sync_mode.clone().unwrap_or_else(|| "full".into())),
            status: Set(params.status.clone().unwrap_or_else(|| "enabled".into())),
            tenant_id: Set(Some(tenant_code.to_string())),
            created_at: Set(now),
            updated_at: Set(now),
            ..Default::default()
        };
        active.insert(db).await.map_err(ModelError::from)
    }

    pub async fn update_from(
        db: &DatabaseConnection,
        id: i32,
        tenant_code: &str,
        params: &SyncSourceParams,
    ) -> ModelResult<Self> {
        let existing = Self::find_by_id_in_tenant(db, id, tenant_code).await?;
        super::sync_source_tables::validate_sync_field_mapping(params.field_mapping.as_ref())
            .map_err(|e| ModelError::msg(&e))?;
        let mut active = existing.into_active_model();
        active.name = Set(params.name.clone());
        active.source_type = Set(params.source_type.clone());
        if let Some(cfg) = &params.connection_config {
            active.connection_config = Set(cfg.clone());
        }
        active.target_table = Set(params.target_table.clone().unwrap_or_default());
        active.field_mapping = Set(params.field_mapping.clone());
        active.sync_mode = Set(params.sync_mode.clone().unwrap_or_else(|| "full".into()));
        if let Some(s) = &params.status {
            active.status = Set(s.clone());
        }
        active.updated_at = Set(chrono::Utc::now().into());
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
pub struct SyncSourceParams {
    pub name: String,
    pub source_type: String,
    pub connection_config: Option<serde_json::Value>,
    pub target_table: Option<String>,
    pub field_mapping: Option<serde_json::Value>,
    pub sync_mode: Option<String>,
    pub status: Option<String>,
}

impl ActiveModelBehavior for ActiveModel {}
