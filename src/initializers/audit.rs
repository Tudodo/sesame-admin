use async_trait::async_trait;
use axum::{middleware as axum_middleware, Router as AxumRouter};
use loco_rs::app::{AppContext, Initializer};
use loco_rs::Result;

pub struct AuditInitializer;

#[async_trait]
impl Initializer for AuditInitializer {
    fn name(&self) -> String {
        "audit".to_string()
    }

    async fn after_routes(&self, router: AxumRouter, ctx: &AppContext) -> Result<AxumRouter> {
        let state = ctx.clone();
        let router = router.layer(axum_middleware::from_fn_with_state(
            state,
            crate::middleware::audit_middleware,
        ));
        tracing::info!("Audit middleware registered");
        Ok(router)
    }
}
