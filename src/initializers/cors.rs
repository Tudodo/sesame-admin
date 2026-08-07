use crate::middleware::cors::cors_layer;
use async_trait::async_trait;
use axum::Router as AxumRouter;
use loco_rs::{
    app::{AppContext, Initializer},
    Result,
};

pub struct CorsInitializer;

#[async_trait]
impl Initializer for CorsInitializer {
    fn name(&self) -> String {
        "cors".to_string()
    }

    async fn after_routes(&self, router: AxumRouter, ctx: &AppContext) -> Result<AxumRouter> {
        let is_production = matches!(
            ctx.environment,
            loco_rs::environment::Environment::Production
        );
        Ok(router.layer(cors_layer(is_production)))
    }
}
