use loco_rs::prelude::*;
use sea_orm::{
    ColumnTrait, EntityTrait, Order, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect,
};

pub use super::_entities::oper_log::{self, ActiveModel, Entity, Model};

impl Model {
    /// Record an operation log entry (fire-and-forget style for middleware).
    ///
    /// Uses raw SQL INSERT instead of ActiveModel so the `user_id` column
    /// (added by migration m20260727_000007) can be written without
    /// hand-editing the generated `_entities/oper_log.rs` entity.
    #[allow(clippy::too_many_arguments)]
    pub async fn record(
        db: &DatabaseConnection,
        title: &str,
        method: &str,
        url: &str,
        ip: &str,
        status: i32,
        elapsed_ms: i64,
        tenant_code: &str,
        body_snapshot: Option<&str>,
        oper_name: &str,
        user_id: Option<&str>,
    ) {
        use sea_orm::{ConnectionTrait, DatabaseBackend, Statement};
        let now = chrono::Utc::now();
        let sql = "INSERT INTO oper_log                    (title, business_type, method, request_method, oper_url, oper_ip,                     oper_param, status, oper_time, cost_time, oper_name, tenant_id, user_id)                    VALUES ($1, 0, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)";
        let _ = db
            .execute(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                sql,
                [
                    title.into(),
                    method.into(),
                    url.into(),
                    ip.into(),
                    body_snapshot.map(|s| s.to_string()).into(),
                    status.into(),
                    now.into(),
                    elapsed_ms.into(),
                    oper_name.into(),
                    Some(tenant_code.to_string()).into(),
                    user_id.map(|s| s.to_string()).into(),
                ],
            ))
            .await;
    }

    pub async fn find_by_id_in_tenant(
        db: &DatabaseConnection,
        id: i64,
        tenant_code: &str,
    ) -> ModelResult<Self> {
        Entity::find_by_id(id)
            .filter(oper_log::Column::TenantId.eq(tenant_code))
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
        let find = Entity::find().filter(oper_log::Column::TenantId.eq(tenant_code));
        let total = find.clone().count(db).await.map_err(ModelError::from)?;
        let items = find
            .order_by(oper_log::Column::OperTime, Order::Desc)
            .offset(offset)
            .limit(limit)
            .all(db)
            .await
            .map_err(ModelError::from)?;
        Ok((items, total))
    }

    pub async fn clear_by_tenant(db: &DatabaseConnection, tenant_code: &str) -> ModelResult<()> {
        Entity::delete_many()
            .filter(oper_log::Column::TenantId.eq(tenant_code))
            .exec(db)
            .await
            .map_err(ModelError::from)?;
        Ok(())
    }
}

impl ActiveModelBehavior for ActiveModel {}
