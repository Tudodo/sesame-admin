use loco_rs::prelude::*;
use sea_orm::{
    ColumnTrait, EntityTrait, Order, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect, Set,
};
use sha2::{Digest, Sha256};

pub use super::_entities::user_sessions::{self, ActiveModel, Entity, Model};

impl Model {
    /// Delete sessions older than 24 hours. Returns number of deleted rows.
    pub async fn cleanup_expired(db: &DatabaseConnection) -> ModelResult<u64> {
        let cutoff: chrono::DateTime<chrono::Utc> =
            chrono::Utc::now() - chrono::Duration::hours(24);
        let result = Entity::delete_many()
            .filter(
                user_sessions::Column::ExpiresAt
                    .lt(Some(sea_orm::prelude::DateTimeWithTimeZone::from(cutoff))),
            )
            .exec(db)
            .await
            .map_err(ModelError::from)?;
        Ok(result.rows_affected)
    }

    pub async fn list_paginated(
        db: &DatabaseConnection,
        tenant_code: &str,
        offset: u64,
        limit: u64,
    ) -> ModelResult<(Vec<Self>, u64)> {
        let find = Entity::find().filter(user_sessions::Column::TenantId.eq(tenant_code));
        let total = find.clone().count(db).await.map_err(ModelError::from)?;
        let items = find
            .order_by(user_sessions::Column::LoginTime, Order::Desc)
            .offset(offset)
            .limit(limit)
            .all(db)
            .await
            .map_err(ModelError::from)?;
        Ok((items, total))
    }

    /// Delete a session limited to the given tenant and return the user_id.
    /// Prevents a manager in one tenant from force-logging-out a session
    /// belonging to another tenant by guessing the session id.
    pub async fn force_logout_in_tenant(
        db: &DatabaseConnection,
        session_id: &str,
        tenant_code: &str,
    ) -> ModelResult<String> {
        let session = Entity::find()
            .filter(user_sessions::Column::Id.eq(session_id))
            .filter(user_sessions::Column::TenantId.eq(tenant_code))
            .one(db)
            .await?
            .ok_or_else(|| ModelError::EntityNotFound)?;
        let user_id = session.user_id.clone();
        session.delete(db).await.map_err(ModelError::from)?;
        Ok(user_id)
    }

    /// Delete all sessions for a user in a tenant (logout).
    pub async fn delete_user_sessions(
        db: &DatabaseConnection,
        user_id: &str,
        tenant_code: &str,
    ) -> ModelResult<u64> {
        let result = Entity::delete_many()
            .filter(user_sessions::Column::UserId.eq(user_id))
            .filter(user_sessions::Column::TenantId.eq(tenant_code))
            .exec(db)
            .await
            .map_err(ModelError::from)?;
        Ok(result.rows_affected)
    }

    /// Create a session record on login.
    pub async fn create_session(
        db: &DatabaseConnection,
        user_id: &str,
        user_name: &str,
        ip: &str,
        ua: &str,
        token: &str,
        tenant_id: &str,
    ) -> ModelResult<()> {
        let now = chrono::Utc::now();
        let expires = now + chrono::Duration::hours(24);
        let browser = if ua.is_empty() {
            None
        } else {
            let u = ua.to_lowercase();
            if u.contains("edg") {
                Some("Edge".into())
            } else if u.contains("chrome") {
                Some("Chrome".into())
            } else if u.contains("firefox") {
                Some("Firefox".into())
            } else {
                Some("Unknown".into())
            }
        };
        let os = if ua.is_empty() {
            None
        } else {
            let u = ua.to_lowercase();
            if u.contains("windows") {
                Some("Windows".into())
            } else if u.contains("mac os") || u.contains("macintosh") {
                Some("macOS".into())
            } else if u.contains("linux") {
                Some("Linux".into())
            } else {
                Some("Unknown".into())
            }
        };
        let session_id = uuid::Uuid::new_v4().to_string();
        let model = ActiveModel {
            id: Set(session_id),
            user_id: Set(user_id.to_string()),
            user_name: Set(user_name.to_string()),
            login_ip: Set(ip.to_string()),
            login_location: Set(None),
            browser: Set(browser),
            os: Set(os),
            // 存储 JWT 的 SHA-256 哈希而非明文：该字段仅用于在线会话展示与排查，
            // 不参与鉴权（鉴权由 session_guard 按用户维度撤销）。明文落库会在
            // 数据库泄露时暴露可重放的活跃 token，哈希后泄露也只能得到不可逆摘要。
            token: Set(hash_token(token)),
            login_time: Set(Some(now.into())),
            expires_at: Set(Some(expires.into())),
            tenant_id: Set(Some(tenant_id.to_string())),
        };
        Entity::insert(model)
            .exec(db)
            .await
            .map_err(ModelError::from)?;
        Ok(())
    }
}

/// SHA-256 hex digest of a token, for safe at-rest storage.
fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    format!("{:x}", hasher.finalize())
}

impl ActiveModelBehavior for ActiveModel {}
