use crate::data::permissions::require_authenticated;
use crate::middleware::tenant::TenantScope;
use crate::models::page_configs;
use axum::Extension;
use loco_rs::prelude::*;

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/page-configs")
        .add("/", get(list_configs))
        .add("/{code}", get(get_config))
}

#[debug_handler]
async fn list_configs(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    // Page-layout config is read by every authenticated user to render the
    // shell; it owns no resource to escalate across.
    require_authenticated(&auth)?;
    let configs = page_configs::Model::list_enabled(&ctx.db, &tenant.code)
        .await
        .map_err(Error::wrap)?;
    format::json(configs)
}

#[debug_handler]
async fn get_config(
    _auth: auth::JWT,
    Path(code): Path<String>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_authenticated(&_auth)?;
    let config = page_configs::Model::find_by_code(&ctx.db, &code, &tenant.code)
        .await
        .map_err(Error::wrap)?;
    format::json(config)
}
