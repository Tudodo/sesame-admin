use loco_rs::prelude::*;
use serde::{Deserialize, Serialize};

/// Background worker for asynchronous file download/generation tasks.
/// Enqueue via `DownloadWorker::perform_later(&ctx, args).await?`.
pub struct DownloadWorker {
    pub ctx: AppContext,
}

#[derive(Deserialize, Debug, Serialize)]
pub struct DownloadWorkerArgs {
    pub user_id: String,
    pub file_name: String,
    pub tenant_id: String,
}

#[async_trait]
impl BackgroundWorker<DownloadWorkerArgs> for DownloadWorker {
    fn build(ctx: &AppContext) -> Self {
        Self { ctx: ctx.clone() }
    }

    fn tags() -> Vec<String> {
        vec!["download".to_string()]
    }

    async fn perform(&self, args: DownloadWorkerArgs) -> Result<()> {
        tracing::info!(
            user_id = %args.user_id,
            file_name = %args.file_name,
            "Download worker triggered"
        );

        // Notify the user that their download is ready
        crate::controllers::notifications::notify_user(
            &self.ctx.db,
            &args.user_id,
            "文件下载完成",
            &format!("文件 {} 已准备就绪", args.file_name),
            "success",
            None,
            &args.tenant_id,
        )
        .await;

        Ok(())
    }
}
