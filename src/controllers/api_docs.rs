use loco_rs::prelude::*;

/// Serve a basic OpenAPI JSON spec at GET /api/openapi.json
#[debug_handler]
async fn openapi_json() -> Result<Response> {
    let spec = serde_json::json!({
        "openapi": "3.0.3",
        "info": {
            "title": "Loco Scaffold API",
            "version": "0.1.0",
            "description": "Enterprise Scaffold — REST API. Add #[utoipa::path] annotations to handlers to populate paths."
        },
        "servers": [{ "url": "/api" }],
        "paths": {},
        "components": {
            "securitySchemes": {
                "bearerAuth": {
                    "type": "http",
                    "scheme": "bearer",
                    "bearerFormat": "JWT"
                }
            }
        },
        "security": [{ "bearerAuth": [] }]
    });
    format::json(spec)
}

/// Minimal Swagger UI HTML page that fetches /api/openapi.json
#[debug_handler]
async fn swagger_ui() -> Result<Response> {
    let html = r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>API Docs – Loco Scaffold</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
  <script>
    SwaggerUIBundle({ url: '/api/openapi.json', dom_id: '#swagger-ui', presets: [SwaggerUIBundle.presets.apis], layout: 'BaseLayout' });
  </script>
</body>
</html>"#;
    let resp = axum::http::Response::builder()
        .header("Content-Type", "text/html; charset=utf-8")
        .body(axum::body::Body::from(html))
        .map_err(|e| Error::string(&e.to_string()))?;
    Ok(resp)
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api")
        .add("/openapi.json", get(openapi_json))
        .add("/docs", get(swagger_ui))
}
