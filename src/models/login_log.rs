use loco_rs::prelude::*;
use sea_orm::{
    ColumnTrait, EntityTrait, Order, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect, Set,
};

pub use super::_entities::login_log::{self, ActiveModel, Entity, Model};

impl Model {
    pub async fn find_by_id_in_tenant(
        db: &DatabaseConnection,
        id: i64,
        tenant_code: &str,
    ) -> ModelResult<Self> {
        Entity::find_by_id(id)
            .filter(login_log::Column::TenantId.eq(tenant_code))
            .one(db)
            .await?
            .ok_or_else(|| ModelError::EntityNotFound)
    }

    pub async fn list_paginated(
        db: &DatabaseConnection,
        tenant_code: &str,
        user_name: Option<&str>,
        offset: u64,
        limit: u64,
    ) -> ModelResult<(Vec<Self>, u64)> {
        let mut find = Entity::find().filter(login_log::Column::TenantId.eq(tenant_code));
        if let Some(name) = user_name {
            if !name.is_empty() {
                find = find.filter(login_log::Column::UserName.contains(name));
            }
        }
        let total = find.clone().count(db).await.map_err(ModelError::from)?;
        let items = find
            .order_by(login_log::Column::LoginTime, Order::Desc)
            .offset(offset)
            .limit(limit)
            .all(db)
            .await
            .map_err(ModelError::from)?;
        Ok((items, total))
    }

    pub async fn clear_by_tenant(db: &DatabaseConnection, tenant_code: &str) -> ModelResult<()> {
        Entity::delete_many()
            .filter(login_log::Column::TenantId.eq(tenant_code))
            .exec(db)
            .await
            .map_err(ModelError::from)?;
        Ok(())
    }

    /// Record a login event. Called from auth controller.
    #[allow(clippy::too_many_arguments)]
    pub async fn record(
        db: &DatabaseConnection,
        user_name: &str,
        user_id: Option<&str>,
        ip: &str,
        user_agent: &str,
        status: i32,
        msg: Option<&str>,
        tenant_id: &str,
    ) -> ModelResult<()> {
        let now = chrono::Utc::now();
        let browser = Self::parse_browser(user_agent);
        let os = Self::parse_os(user_agent);
        let model = ActiveModel {
            user_name: Set(user_name.to_string()),
            login_ip: Set(ip.to_string()),
            login_location: Set(None),
            browser: Set(browser),
            os: Set(os),
            status: Set(status),
            msg: Set(msg.map(|s| s.to_string())),
            login_time: Set(Some(now.into())),
            user_id: Set(user_id.map(|s| s.to_string())),
            tenant_id: Set(Some(tenant_id.to_string())),
            ..Default::default()
        };
        Entity::insert(model)
            .exec(db)
            .await
            .map_err(ModelError::from)?;
        Ok(())
    }

    fn parse_browser(ua: &str) -> Option<String> {
        if ua.is_empty() {
            return None;
        }
        let ua_lower = ua.to_lowercase();
        if ua_lower.contains("edg") {
            Some("Edge".into())
        } else if ua_lower.contains("chrome") {
            Some("Chrome".into())
        } else if ua_lower.contains("firefox") {
            Some("Firefox".into())
        } else if ua_lower.contains("safari") && !ua_lower.contains("chrome") {
            Some("Safari".into())
        } else {
            Some("Unknown".into())
        }
    }

    fn parse_os(ua: &str) -> Option<String> {
        if ua.is_empty() {
            return None;
        }
        let ua_lower = ua.to_lowercase();
        if ua_lower.contains("windows") {
            Some("Windows".into())
        } else if ua_lower.contains("mac os") || ua_lower.contains("macintosh") {
            Some("macOS".into())
        } else if ua_lower.contains("linux") {
            Some("Linux".into())
        } else if ua_lower.contains("android") {
            Some("Android".into())
        } else if ua_lower.contains("iphone") || ua_lower.contains("ipad") {
            Some("iOS".into())
        } else {
            Some("Unknown".into())
        }
    }
}

impl ActiveModelBehavior for ActiveModel {}
