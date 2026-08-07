use axum::http::{HeaderName, HeaderValue, Method};
use tower_http::cors::CorsLayer;

/// Build a CORS layer for the application.
/// In development, allows all origins. In production, restrict to specific domains.
pub fn cors_layer(is_production: bool) -> CorsLayer {
    let allowed_origins: Vec<HeaderValue> = std::env::var("CORS_ALLOWED_ORIGINS")
        .unwrap_or_default()
        .split(',')
        .filter(|s| !s.is_empty())
        .map(|s| {
            s.trim()
                .parse()
                .unwrap_or_else(|_| HeaderValue::from_static("http://localhost:3001"))
        })
        .collect();

    if allowed_origins.is_empty() {
        if is_production {
            // 生产环境必须显式配置 CORS_ALLOWED_ORIGINS，拒绝以宽松 CORS 启动。
            panic!(
                "CORS_ALLOWED_ORIGINS 未设置。生产环境必须显式配置允许的来源，\n                 请设置环境变量 CORS_ALLOWED_ORIGINS=https://your-domain.com"
            );
        }
        // Development: allow all origins.
        CorsLayer::permissive()
    } else {
        CorsLayer::new()
            .allow_origin(allowed_origins)
            .allow_methods(vec![
                Method::GET,
                Method::POST,
                Method::PUT,
                Method::DELETE,
                Method::OPTIONS,
            ])
            .allow_headers(vec![
                HeaderName::from_static("content-type"),
                HeaderName::from_static("authorization"),
                HeaderName::from_static("x-tenant-code"),
                HeaderName::from_static("x-requested-with"),
                HeaderName::from_static("x-csrf-token"),
            ])
            .allow_credentials(true)
    }
}
