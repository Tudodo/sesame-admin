use axum::extract::Query;
use loco_rs::prelude::*;
use serde::Deserialize;
use uuid::Uuid;

/// Captcha entries live in shared Redis with a 5-minute TTL, so a captcha
/// issued by one instance is verifiable by any other instance.
const CAPTCHA_TTL_SECS: u64 = 300;

#[derive(Deserialize)]
struct CaptchaQuery {
    #[allow(dead_code)]
    t: Option<String>,
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/captcha")
        .add("/image", get(image))
        .add("/verify", post(verify))
}

#[debug_handler]
async fn image(Query(_q): Query<CaptchaQuery>) -> Result<Response> {
    let code = format!("{:04}", rand::random::<u16>() % 10000);
    let uuid = Uuid::new_v4().to_string();

    // Redis TTL handles expiry and bounds memory; the key is single-use and
    // deleted by verify on every attempt.
    crate::data::shared_redis::set("captcha", &uuid, &code, CAPTCHA_TTL_SECS).await?;

    // Build SVG captcha image using string concatenation to avoid format-string escaping issues
    let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"120\" height=\"48\" viewBox=\"0 0 120 48\">\n\
        <rect width=\"120\" height=\"48\" fill=\"#f5f5f5\" rx=\"4\"/>\n\
        <text x=\"60\" y=\"32\" text-anchor=\"middle\" font-family=\"monospace\" font-size=\"24\" fill=\"#333\" font-weight=\"bold\">"
        .to_string()
        + &code
        + "</text>\n\
        <line x1=\"10\" y1=\"15\" x2=\"50\" y2=\"40\" stroke=\"#ccc\" stroke-width=\"1\"/>\n\
        <line x1=\"70\" y1=\"10\" x2=\"110\" y2=\"38\" stroke=\"#ccc\" stroke-width=\"1\"/>\n\
        </svg>";

    let resp = axum::http::Response::builder()
        .header("Content-Type", "image/svg+xml")
        .header("X-Captcha-Id", &uuid)
        .body(axum::body::Body::from(svg))
        .map_err(|e| Error::string(&e.to_string()))?;
    Ok(resp)
}

#[derive(Deserialize)]
struct VerifyParams {
    captcha_id: String,
    code: String,
}

#[debug_handler]
async fn verify(Json(p): Json<VerifyParams>) -> Result<Response> {
    // Remove the captcha entry on ANY verification attempt (success or
    // failure). A captcha is single-use — leaving it in place after a failed
    // attempt allows unlimited brute-force against the same captcha_id.
    let entry = crate::data::shared_redis::get_and_delete("captcha", &p.captcha_id).await?;

    let valid = entry.map(|c| c == p.code).unwrap_or(false);

    format::json(serde_json::json!({"valid": valid}))
}
