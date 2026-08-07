use async_trait::async_trait;
use axum::{middleware as axum_middleware, Router as AxumRouter};
use loco_rs::app::{AppContext, Initializer};
use loco_rs::Result;

pub struct TenantInitializer;

#[async_trait]
impl Initializer for TenantInitializer {
    fn name(&self) -> String {
        "tenant".to_string()
    }

    async fn after_routes(&self, router: AxumRouter, _ctx: &AppContext) -> Result<AxumRouter> {
        // 1. Header-based default tenant scope (for unauthenticated endpoints).
        // 2. JWT-based override (for authenticated endpoints): the tenant bound
        //    into the token wins over the user-controlled header, closing the
        //    cross-tenant data-access hole.
        let router = router
            .layer(axum_middleware::from_fn_with_state(
                _ctx.clone(),
                crate::middleware::tenant::tenant_from_jwt_middleware,
            ))
            .layer(axum_middleware::from_fn(
                crate::middleware::tenant::tenant_middleware,
            ));
        tracing::info!("Tenant middleware registered");
        Ok(router)
    }
}
