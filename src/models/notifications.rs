use loco_rs::prelude::*;
use sea_orm::{
    ActiveValue, ColumnTrait, EntityTrait, Order, PaginatorTrait, QueryFilter, QueryOrder,
    QuerySelect,
};

pub use super::_entities::notif::{self, ActiveModel, Entity, Model};

impl Model {
    /// Create an in-app notification for a user.
    pub async fn notify_user(
        db: &DatabaseConnection,
        user_id: &str,
        title: &str,
        content: &str,
        notification_type: &str,
        link: Option<&str>,
        tenant_id: &str,
    ) -> ModelResult<Self> {
        let now = chrono::Utc::now();
        let active = ActiveModel {
            user_id: ActiveValue::Set(user_id.to_string()),
            title: ActiveValue::Set(title.to_string()),
            content: ActiveValue::Set(content.to_string()),
            notification_type: ActiveValue::Set(notification_type.to_string()),
            is_read: ActiveValue::Set(false),
            link: ActiveValue::Set(link.map(String::from)),
            tenant_id: ActiveValue::Set(Some(tenant_id.to_string())),
            created_at: ActiveValue::Set(now.into()),
            ..Default::default()
        };
        active.insert(db).await.map_err(ModelError::from)
    }

    /// List notifications for a user, newest first, with total count.
    pub async fn list_by_user(
        db: &DatabaseConnection,
        user_pid: &str,
        tenant_code: &str,
        offset: u64,
        limit: u64,
    ) -> ModelResult<(Vec<Self>, u64)> {
        let select = Entity::find()
            .filter(notif::Column::UserId.eq(user_pid))
            .filter(notif::Column::TenantId.eq(tenant_code))
            .order_by(notif::Column::CreatedAt, Order::Desc);
        let total = select.clone().count(db).await.map_err(ModelError::from)?;
        let items = select
            .offset(offset)
            .limit(limit)
            .all(db)
            .await
            .map_err(ModelError::from)?;
        Ok((items, total))
    }

    /// Count unread notifications for a user.
    pub async fn unread_count(
        db: &DatabaseConnection,
        user_pid: &str,
        tenant_code: &str,
    ) -> ModelResult<u64> {
        Entity::find()
            .filter(notif::Column::UserId.eq(user_pid))
            .filter(notif::Column::IsRead.eq(false))
            .filter(notif::Column::TenantId.eq(tenant_code))
            .count(db)
            .await
            .map_err(ModelError::from)
    }

    /// Mark a single notification as read.
    pub async fn mark_read(
        db: &DatabaseConnection,
        id: i32,
        user_pid: &str,
        tenant_code: &str,
    ) -> ModelResult<()> {
        let item = Entity::find_by_id(id)
            .filter(notif::Column::UserId.eq(user_pid))
            .filter(notif::Column::TenantId.eq(tenant_code))
            .one(db)
            .await?
            .ok_or(ModelError::EntityNotFound)?;
        let mut active: ActiveModel = item.into();
        active.is_read = ActiveValue::Set(true);
        active.update(db).await.map_err(ModelError::from)?;
        Ok(())
    }

    /// Mark all notifications as read for a user.
    pub async fn mark_all_read(
        db: &DatabaseConnection,
        user_pid: &str,
        tenant_code: &str,
    ) -> ModelResult<()> {
        Entity::update_many()
            .filter(notif::Column::UserId.eq(user_pid))
            .filter(notif::Column::IsRead.eq(false))
            .filter(notif::Column::TenantId.eq(tenant_code))
            .set(ActiveModel {
                is_read: ActiveValue::Set(true),
                ..Default::default()
            })
            .exec(db)
            .await
            .map_err(ModelError::from)?;
        Ok(())
    }
}

impl ActiveModelBehavior for ActiveModel {}
