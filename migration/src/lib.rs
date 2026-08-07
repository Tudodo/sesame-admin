//! Database migrations for the Loco application.

#![allow(elided_lifetimes_in_paths)]
#![allow(clippy::wildcard_imports)]
pub use sea_orm_migration::prelude::*;

mod m20260807_000001_community_initial_schema;
mod m20260807_000002_community_default_seed;
mod sql_file;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20260807_000001_community_initial_schema::Migration),
            Box::new(m20260807_000002_community_default_seed::Migration),
        ]
    }
}
