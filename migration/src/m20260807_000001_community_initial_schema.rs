use crate::sql_file;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        sql_file::execute_sql_file(m, include_str!("../sql/community_initial_schema.sql")).await
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        let db = m.get_connection();
        for table in [
            "users_roles",
            "users_positions",
            "users_departments",
            "user_sessions",
            "users",
            "tenant",
            "sys_config",
            "sync_source_table",
            "sync_source",
            "storage_config",
            "scheduled_task_log",
            "scheduled_task",
            "roles_menus",
            "roles",
            "positions",
            "page_config",
            "oper_log",
            "notif",
            "menus",
            "login_log",
            "dictionary_entries",
            "dictionaries",
            "departments",
        ] {
            db.execute_unprepared(&format!("DROP TABLE IF EXISTS {table} CASCADE"))
                .await?;
        }
        Ok(())
    }
}
