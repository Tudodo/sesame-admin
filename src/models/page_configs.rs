use loco_rs::prelude::*;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};

pub use super::_entities::page_config::{self, ActiveModel, Entity, Model};

impl Model {
    pub async fn find_by_code(
        db: &DatabaseConnection,
        code: &str,
        tenant_code: &str,
    ) -> ModelResult<Self> {
        Entity::find()
            .filter(page_config::Column::Code.eq(code))
            .filter(page_config::Column::Status.eq("enabled"))
            .filter(page_config::Column::TenantId.eq(tenant_code))
            .one(db)
            .await?
            .ok_or_else(|| ModelError::EntityNotFound)
    }

    pub async fn list_enabled(
        db: &DatabaseConnection,
        tenant_code: &str,
    ) -> ModelResult<Vec<Self>> {
        Entity::find()
            .filter(page_config::Column::Status.eq("enabled"))
            .filter(page_config::Column::TenantId.eq(tenant_code))
            .all(db)
            .await
            .map_err(ModelError::from)
    }
}

impl ActiveModelBehavior for ActiveModel {}
