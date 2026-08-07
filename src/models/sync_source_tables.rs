use loco_rs::prelude::*;
use sea_orm::{ColumnTrait, EntityTrait, Order, QueryFilter, QueryOrder, Set};
use serde::{Deserialize, Serialize};

pub use super::_entities::sync_source_table::{self, ActiveModel, Entity, Model};

impl Model {
    /// List tables belonging to a sync source, ordered by id ascending
    pub async fn list_by_source(
        db: &DatabaseConnection,
        source_id: i32,
        tenant_code: &str,
    ) -> ModelResult<Vec<Self>> {
        Entity::find()
            .filter(sync_source_table::Column::SourceId.eq(source_id))
            .filter(sync_source_table::Column::TenantId.eq(tenant_code))
            .order_by(sync_source_table::Column::Id, Order::Asc)
            .all(db)
            .await
            .map_err(ModelError::from)
    }

    /// Find a table config by id within a tenant
    pub async fn find_by_id_in_tenant(
        db: &DatabaseConnection,
        id: i32,
        tenant_code: &str,
    ) -> ModelResult<Self> {
        Entity::find_by_id(id)
            .filter(sync_source_table::Column::TenantId.eq(tenant_code))
            .one(db)
            .await?
            .ok_or_else(|| ModelError::EntityNotFound)
    }

    /// Create a new sync table config
    pub async fn create_table(
        db: &DatabaseConnection,
        source_id: i32,
        input: &SyncTableInput,
        tenant_code: &str,
    ) -> ModelResult<i32> {
        // Verify parent exists
        super::sync_sources::Model::find_by_id_in_tenant(db, source_id, tenant_code).await?;

        // Prevent duplicate (source_id, source_table) within a tenant. The DB
        // also enforces this via idx_sync_source_table_src_tbl_tenant, but a
        // pre-check returns a friendly error instead of a raw constraint
        // violation to the caller.
        let dup = Entity::find()
            .filter(sync_source_table::Column::SourceId.eq(source_id))
            .filter(sync_source_table::Column::SourceTable.eq(&input.source_table))
            .filter(sync_source_table::Column::TenantId.eq(tenant_code))
            .one(db)
            .await?;
        if dup.is_some() {
            return Err(ModelError::msg(&format!(
                "source table '{}' already configured for this source",
                input.source_table
            )));
        }
        // Validate table names before persisting: they are later interpolated
        // into SQL (TRUNCATE/INSERT) by the syncer worker. Rejecting here
        // returns a friendly error instead of failing at sync time.
        validate_table_name(&input.source_table)?;
        validate_local_target_table(input)?;
        validate_sync_field_mapping(input.field_mapping.as_ref())
            .map_err(|e| ModelError::msg(&e))?;

        let now = chrono::Utc::now().into();
        let model = ActiveModel {
            source_id: Set(source_id),
            source_table: Set(input.source_table.clone()),
            target_table: Set(input.target_table.clone()),
            target_connection_url: Set(input.target_connection_url.clone()),
            field_mapping: Set(input.field_mapping.clone()),
            sync_mode: Set(input.sync_mode.clone()),
            status: Set(input.status.clone().unwrap_or_else(|| "enabled".into())),
            tenant_id: Set(Some(tenant_code.to_string())),
            created_at: Set(now),
            updated_at: Set(now),
            ..Default::default()
        };
        let item = Entity::insert(model)
            .exec(db)
            .await
            .map_err(ModelError::from)?;
        Ok(item.last_insert_id)
    }

    /// Update a sync table config
    pub async fn update_table(
        db: &DatabaseConnection,
        id: i32,
        source_id: i32,
        input: &SyncTableInput,
        tenant_code: &str,
    ) -> ModelResult<()> {
        let existing = Entity::find()
            .filter(sync_source_table::Column::Id.eq(id))
            .filter(sync_source_table::Column::SourceId.eq(source_id))
            .filter(sync_source_table::Column::TenantId.eq(tenant_code))
            .one(db)
            .await?
            .ok_or_else(|| ModelError::EntityNotFound)?;
        // Validate table names before persisting (same rationale as create).
        validate_table_name(&input.source_table)?;
        validate_local_target_table(input)?;
        validate_sync_field_mapping(input.field_mapping.as_ref())
            .map_err(|e| ModelError::msg(&e))?;
        let mut model: ActiveModel = existing.into_active_model();
        model.source_table = Set(input.source_table.clone());
        model.target_table = Set(input.target_table.clone());
        model.target_connection_url = Set(input.target_connection_url.clone());
        model.field_mapping = Set(input.field_mapping.clone());
        model.sync_mode = Set(input.sync_mode.clone());
        if let Some(s) = &input.status {
            model.status = Set(s.clone());
        }
        model.updated_at = Set(chrono::Utc::now().into());
        model.update(db).await.map_err(ModelError::from)?;
        Ok(())
    }

    /// Delete a sync table config within a tenant
    pub async fn delete_in_tenant(
        db: &DatabaseConnection,
        id: i32,
        source_id: i32,
        tenant_code: &str,
    ) -> ModelResult<()> {
        let existing = Entity::find()
            .filter(sync_source_table::Column::Id.eq(id))
            .filter(sync_source_table::Column::SourceId.eq(source_id))
            .filter(sync_source_table::Column::TenantId.eq(tenant_code))
            .one(db)
            .await?
            .ok_or_else(|| ModelError::EntityNotFound)?;
        existing.delete(db).await.map_err(ModelError::from)?;
        Ok(())
    }

    /// Update last_sync_at timestamp
    pub async fn touch_last_sync(
        db: &DatabaseConnection,
        id: i32,
        tenant_code: &str,
    ) -> ModelResult<()> {
        let existing = Self::find_by_id_in_tenant(db, id, tenant_code).await?;
        let mut model: ActiveModel = existing.into_active_model();
        model.last_sync_at = Set(Some(chrono::Utc::now().into()));
        model.update(db).await.map_err(ModelError::from)?;
        Ok(())
    }
}

#[derive(Debug, Deserialize, Serialize)]
pub struct SyncTableInput {
    pub source_table: String,
    pub target_table: String,
    pub target_connection_url: Option<String>,
    pub field_mapping: Option<serde_json::Value>,
    pub sync_mode: String,
    pub status: Option<String>,
}

impl ActiveModelBehavior for ActiveModel {}

/// Local application tables that must never be the target of data sync.
/// These tables are authoritative runtime/identity data; allowing sync writes
/// to them would let a `system:sync:create` role replace users, roles, menus,
/// sessions, config, audit logs, or sync configuration itself.
const PROTECTED_LOCAL_TABLES: &[&str] = &[
    "tenant",
    "users",
    "roles",
    "menus",
    "roles_menus",
    "users_roles",
    "users_departments",
    "users_positions",
    "positions",
    "departments",
    "user_sessions",
    "notif",
    "login_log",
    "oper_log",
    "scheduled_task",
    "scheduled_task_log",
    "sys_config",
    "page_config",
    "storage_config",
    "dictionaries",
    "dictionary_entries",
    "sync_source",
    "sync_source_table",
    "seaql_migrations",
];

/// Validate a table name: only alphanumeric + underscore, 1-63 chars, and
/// no reserved PostgreSQL/system prefixes.
/// Matches the rule enforced by the syncer worker at execution time.
fn validate_table_name(name: &str) -> ModelResult<()> {
    if name.is_empty() || name.len() > 63 {
        return Err(ModelError::msg(&format!(
            "Invalid table name length: {name}"
        )));
    }
    if !name.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Err(ModelError::msg(&format!(
            "Table name contains invalid characters: {name}"
        )));
    }
    if name.starts_with("pg_") || name.starts_with("sql_") || name == "information_schema" {
        return Err(ModelError::msg(&format!("Reserved table name: {name}")));
    }
    Ok(())
}

/// Validate a local target table for sync writes. External target databases
/// keep their own table namespace, so protected-table enforcement only applies
/// when the config writes to the local application database.
pub fn validate_target_table_name(name: &str) -> ModelResult<()> {
    validate_table_name(name)?;
    if PROTECTED_LOCAL_TABLES.contains(&name) {
        return Err(ModelError::msg(&format!(
            "Protected local target table: {name}"
        )));
    }
    Ok(())
}

fn validate_local_target_table(input: &SyncTableInput) -> ModelResult<()> {
    validate_table_name(&input.target_table)?;
    if input
        .target_connection_url
        .as_deref()
        .is_none_or(|url| url.trim().is_empty())
    {
        validate_target_table_name(&input.target_table)?;
    }
    Ok(())
}

/// Validate sync field mappings before they are persisted or executed.
/// Sync mappings are `target_column -> source_column` pairs. Both sides are
/// interpolated into SQL identifiers, so they must stay within the safe
/// identifier charset. `tenant_id` is reserved for the sync worker so it can
/// always scope inserted rows to the current tenant.
pub fn validate_sync_field_mapping(mapping: Option<&serde_json::Value>) -> Result<(), String> {
    let Some(mapping) = mapping else {
        return Ok(());
    };
    if mapping.is_null() {
        return Ok(());
    }
    let obj = mapping
        .as_object()
        .ok_or("field_mapping must be a JSON object")?;
    for (target_col, source_field) in obj {
        validate_column_name(target_col)?;
        if target_col == "tenant_id" {
            return Err("field_mapping cannot write to tenant_id".into());
        }
        let source_col = source_field
            .as_str()
            .ok_or("field_mapping values must be string source column names")?;
        validate_column_name(source_col)?;
        if source_col == "tenant_id" {
            return Err("field_mapping cannot reference tenant_id".into());
        }
    }
    Ok(())
}

fn validate_column_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.len() > 63 {
        return Err(format!("Invalid column name length: {name}"));
    }
    if !name.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Err(format!("Column name contains invalid characters: {name}"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn sync_field_mapping_accepts_safe_rename() {
        let mapping = json!({ "external_id": "user_id" });
        assert!(validate_sync_field_mapping(Some(&mapping)).is_ok());
        assert!(validate_sync_field_mapping(Some(&serde_json::Value::Null)).is_ok());
        assert!(validate_sync_field_mapping(None).is_ok());
    }

    #[test]
    fn sync_field_mapping_rejects_non_object_and_non_string_values() {
        assert!(validate_sync_field_mapping(Some(&json!(["reason"]))).is_err());
        assert!(validate_sync_field_mapping(Some(&json!({ "reason": 123 }))).is_err());
        assert!(validate_sync_field_mapping(Some(&json!({ "reason": null }))).is_err());
    }

    #[test]
    fn table_name_rejects_reserved_prefixes() {
        for name in [
            "pg_catalog",
            "pg_toast",
            "sql_sequence",
            "information_schema",
        ] {
            assert!(
                validate_table_name(name).is_err(),
                "{name} should be rejected"
            );
        }
        assert!(validate_table_name("users").is_ok());
    }

    #[test]
    fn local_target_rejects_core_application_tables() {
        for name in [
            "users",
            "roles",
            "menus",
            "roles_menus",
            "user_sessions",
            "sys_config",
            "sync_source",
        ] {
            let input = SyncTableInput {
                source_table: "external_users".to_string(),
                target_table: name.to_string(),
                target_connection_url: None,
                field_mapping: None,
                sync_mode: "full".to_string(),
                status: None,
            };
            assert!(
                validate_local_target_table(&input).is_err(),
                "{name} should be rejected as a local sync target"
            );
        }
        let input = SyncTableInput {
            source_table: "external_users".to_string(),
            target_table: "external_users".to_string(),
            target_connection_url: None,
            field_mapping: None,
            sync_mode: "full".to_string(),
            status: None,
        };
        assert!(validate_local_target_table(&input).is_ok());
    }

    #[test]
    fn external_target_keeps_its_own_table_namespace() {
        let input = SyncTableInput {
            source_table: "external_users".to_string(),
            target_table: "users".to_string(),
            target_connection_url: Some("postgres://user:pass@example.invalid:5432/db".into()),
            field_mapping: None,
            sync_mode: "full".to_string(),
            status: None,
        };
        assert!(validate_local_target_table(&input).is_ok());
    }

    #[test]
    fn sync_field_mapping_rejects_tenant_id_and_bad_identifiers() {
        assert!(validate_sync_field_mapping(Some(&json!({ "reason": "tenant_id" }))).is_err());
        assert!(validate_sync_field_mapping(Some(&json!({ "tenant_id": "reason" }))).is_err());
        assert!(validate_sync_field_mapping(Some(&json!({ "reason; drop": "note" }))).is_err());
        assert!(validate_sync_field_mapping(Some(&json!({ "reason": "note; drop" }))).is_err());
    }
}
