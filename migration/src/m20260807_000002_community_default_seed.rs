use crate::sql_file;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        sql_file::execute_sql_file(m, include_str!("../sql/community_default_seed.sql")).await
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        let db = m.get_connection();
        db.execute_unprepared("DELETE FROM users_roles WHERE user_id = 1 AND role_id = 1")
            .await?;
        db.execute_unprepared("DELETE FROM users WHERE id = 1")
            .await?;
        db.execute_unprepared("DELETE FROM storage_config WHERE id = 1")
            .await?;
        db.execute_unprepared(
            "DELETE FROM dictionary_entries WHERE id IN (201, 202, 301, 302, 401, 402, 501, 502, 503, 605, 606)",
        )
        .await?;
        db.execute_unprepared("DELETE FROM dictionaries WHERE id IN (2, 3, 4, 5, 6)")
            .await?;
        db.execute_unprepared("DELETE FROM roles_menus WHERE role_id = 1")
            .await?;
        db.execute_unprepared(
            "DELETE FROM menus WHERE id IN (1, 2, 3, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 25, 26, 27, 31, 32)",
        )
        .await?;
        db.execute_unprepared("DELETE FROM roles WHERE id IN (1, 2, 3)")
            .await?;
        db.execute_unprepared("DELETE FROM departments WHERE id = 1")
            .await?;
        db.execute_unprepared("DELETE FROM tenant WHERE id = 1")
            .await?;
        Ok(())
    }
}
