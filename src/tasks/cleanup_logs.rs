use async_trait::async_trait;
use chrono::Utc;
use loco_rs::{
    app::AppContext,
    prelude::*,
    task::{TaskInfo, Vars},
    Result,
};
use sea_orm::{ConnectionTrait, DatabaseBackend, Statement};

/// Background task: purge stale scheduled-task logs.
///
/// Run periodically with: `cargo loco task cleanup_logs`
///
/// `scheduled_task_log` is an append-only table with no built-in retention.
/// Over time it grows unbounded, slowing paginated queries and wasting disk.
/// This task deletes rows older than `RETENTION_DAYS` (default 90) to bound
/// storage growth.
pub struct CleanupLogs;

/// Number of days of log history to retain. Anything older is deleted.
const RETENTION_DAYS: i64 = 90;

#[async_trait]
impl Task for CleanupLogs {
    fn task(&self) -> TaskInfo {
        TaskInfo {
            name: "cleanup_logs".to_string(),
            detail: "Delete scheduled-task logs older than 90 days".to_string(),
        }
    }

    async fn run(&self, ctx: &AppContext, _vars: &Vars) -> Result<()> {
        let cutoff = Utc::now() - chrono::Duration::days(RETENTION_DAYS);

        let sched_sql = "DELETE FROM scheduled_task_log WHERE start_time < $1";

        let sched_deleted = ctx
            .db
            .execute(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                sched_sql,
                [cutoff.into()],
            ))
            .await
            .map(|r| r.rows_affected())
            .map_err(|e| Error::string(&e.to_string()))?;

        if sched_deleted > 0 {
            tracing::info!(
                sched_deleted,
                retention_days = RETENTION_DAYS,
                "Cleaned up stale logs"
            );
        } else {
            tracing::info!(
                "No stale logs to clean up (retention: {} days)",
                RETENTION_DAYS
            );
        }

        Ok(())
    }
}
