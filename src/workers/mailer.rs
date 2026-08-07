use loco_rs::prelude::*;
use serde::{Deserialize, Serialize};

pub struct MailerWorker {
    pub ctx: AppContext,
}

#[derive(Deserialize, Debug, Serialize)]
pub struct MailerWorkerArgs {
    pub to: String,
    pub subject: String,
    pub body_text: String,
    pub body_html: Option<String>,
}

#[async_trait]
impl BackgroundWorker<MailerWorkerArgs> for MailerWorker {
    fn build(ctx: &AppContext) -> Self {
        Self { ctx: ctx.clone() }
    }

    fn tags() -> Vec<String> {
        vec!["mailer".to_string()]
    }

    async fn perform(&self, args: MailerWorkerArgs) -> Result<()> {
        let enabled = self
            .ctx
            .config
            .mailer
            .as_ref()
            .and_then(|m| m.smtp.as_ref())
            .map(|s| s.enable)
            .unwrap_or(false);

        if !enabled {
            tracing::info!(to = %args.to, subject = %args.subject, "mailer disabled, logged");
            let preview: String = args.body_text.chars().take(200).collect();
            tracing::info!(
                "Would send: to={} subject={} body={}",
                args.to,
                args.subject,
                preview
            );
            return Ok(());
        }

        let sender = self
            .ctx
            .mailer
            .as_ref()
            .ok_or_else(|| Error::string("Mailer not configured"))?;

        let html = args.body_html.unwrap_or_default();
        sender
            .mail(&mailer::Email {
                from: None,
                to: args.to.clone(),
                subject: args.subject.clone(),
                text: args.body_text.clone(),
                html,
                reply_to: None,
                bcc: None,
                cc: None,
            })
            .await?;

        tracing::info!(to = %args.to, "email sent");
        Ok(())
    }
}
