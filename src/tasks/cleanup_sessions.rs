use async_trait::async_trait;
use loco_rs::{
    app::AppContext,
    prelude::*,
    task::{TaskInfo, Vars},
    Result,
};

/// Background task: remove expired user sessions.
/// Run periodically with: `cargo loco task cleanup_sessions`
pub struct CleanupSessions;

#[async_trait]
impl Task for CleanupSessions {
    fn task(&self) -> TaskInfo {
        TaskInfo {
            name: "cleanup_sessions".to_string(),
            detail: "Remove expired user sessions older than 24 hours".to_string(),
        }
    }

    async fn run(&self, ctx: &AppContext, _vars: &Vars) -> Result<()> {
        let deleted = crate::models::user_sessions::Model::cleanup_expired(&ctx.db)
            .await
            .map_err(|e| Error::string(&e.to_string()))?;
        if deleted > 0 {
            tracing::info!(rows = deleted, "Cleaned up expired sessions");
        }
        Ok(())
    }
}
