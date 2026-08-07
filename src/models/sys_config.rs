use loco_rs::prelude::*;
use sea_orm::{
    ColumnTrait, EntityTrait, Order, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect, Set,
};

pub use super::_entities::sys_config::{self, ActiveModel, Entity, Model};

impl Model {
    /// 按 ID 查询并限定租户，防止跨租户越权读取/修改/删除。
    pub async fn find_by_id_in_tenant(
        db: &DatabaseConnection,
        id: i64,
        tenant_code: &str,
    ) -> ModelResult<Self> {
        Entity::find()
            .filter(sys_config::Column::Id.eq(id))
            .filter(sys_config::Column::TenantId.eq(tenant_code))
            .one(db)
            .await?
            .ok_or_else(|| ModelError::EntityNotFound)
    }

    pub async fn list_paginated(
        db: &DatabaseConnection,
        tenant_code: &str,
        config_name: Option<&str>,
        config_key: Option<&str>,
        offset: u64,
        limit: u64,
    ) -> ModelResult<(Vec<Self>, u64)> {
        let mut find = Entity::find().filter(sys_config::Column::TenantId.eq(tenant_code));
        if let Some(name) = config_name {
            if !name.is_empty() {
                find = find.filter(sys_config::Column::ConfigName.contains(name));
            }
        }
        if let Some(key) = config_key {
            if !key.is_empty() {
                find = find.filter(sys_config::Column::ConfigKey.contains(key));
            }
        }
        let total = find.clone().count(db).await.map_err(ModelError::from)?;
        let items = find
            .order_by(sys_config::Column::Id, Order::Asc)
            .offset(offset)
            .limit(limit)
            .all(db)
            .await
            .map_err(ModelError::from)?;
        Ok((items, total))
    }

    pub async fn create_config(
        db: &DatabaseConnection,
        config_name: &str,
        config_key: &str,
        config_value: &str,
        config_type: &str,
        remark: Option<String>,
        tenant_code: &str,
    ) -> ModelResult<()> {
        let model = ActiveModel {
            config_name: Set(config_name.to_string()),
            config_key: Set(config_key.to_string()),
            config_value: Set(config_value.to_string()),
            config_type: Set(config_type.to_string()),
            remark: Set(remark),
            tenant_id: Set(Some(tenant_code.to_string())),
            ..Default::default()
        };
        Entity::insert(model)
            .exec(db)
            .await
            .map_err(ModelError::from)?;
        Ok(())
    }
}

impl ActiveModelBehavior for ActiveModel {}
