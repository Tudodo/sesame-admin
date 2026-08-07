pub mod cache_keys;
pub mod permissions;
pub mod security;
pub mod shared_redis;
pub mod storage_secret;

use axum::http::header::InvalidHeaderValue;
use loco_rs::prelude::*;
use serde::Serialize;

/// Maximum number of items a single list request may return.
/// Prevents clients from requesting unbounded page sizes (DoS mitigation).
pub const MAX_PAGE_SIZE: usize = 500;

/// Default number of rows a single export may return.
pub const DEFAULT_EXPORT_ROW_LIMIT: usize = 50_000;

/// Upper bound for `EXPORT_ROW_LIMIT` so an operator cannot accidentally
/// disable the export memory/response limit entirely.
pub const MAX_EXPORT_ROW_LIMIT: usize = 1_000_000;

/// Read the configured export row limit, clamped to a safe range.
pub fn export_row_limit() -> usize {
    std::env::var("EXPORT_ROW_LIMIT")
        .ok()
        .and_then(|value| parse_export_row_limit(&value))
        .unwrap_or(DEFAULT_EXPORT_ROW_LIMIT)
}

fn parse_export_row_limit(value: &str) -> Option<usize> {
    let limit = value.trim().parse::<usize>().ok()?;
    (1..=MAX_EXPORT_ROW_LIMIT).contains(&limit).then_some(limit)
}

/// Compute (offset, limit) from `_start` / `_end` query parameters,
/// clamping the result to a safe maximum to prevent unbounded queries.
pub fn page_range(start: Option<usize>, end: Option<usize>) -> (usize, usize) {
    let start = start.unwrap_or(0);
    let end = end.unwrap_or(50);
    let limit = end.saturating_sub(start).clamp(1, MAX_PAGE_SIZE);
    (start, limit)
}

/// Build a JSON response with an `X-Total-Count` header for paginated lists.
pub fn paginated_response<T: Serialize>(data: &T, total: u64) -> Result<Response> {
    let response = format::json(data)?;
    let mut resp = response.into_response();
    let header_value: axum::http::HeaderValue = total
        .to_string()
        .parse()
        .map_err(|e: InvalidHeaderValue| Error::string(&e.to_string()))?;
    resp.headers_mut().insert("X-Total-Count", header_value);
    Ok(resp)
}

#[cfg(test)]
mod tests {
    use super::{parse_export_row_limit, DEFAULT_EXPORT_ROW_LIMIT, MAX_EXPORT_ROW_LIMIT};

    #[test]
    fn export_limit_defaults_to_safe_value() {
        assert_eq!(parse_export_row_limit(""), None);
        assert_eq!(parse_export_row_limit("0"), None);
        assert_eq!(parse_export_row_limit("not-a-number"), None);
        assert_eq!(
            parse_export_row_limit(&DEFAULT_EXPORT_ROW_LIMIT.to_string()),
            Some(DEFAULT_EXPORT_ROW_LIMIT)
        );
        assert_eq!(
            parse_export_row_limit(&MAX_EXPORT_ROW_LIMIT.to_string()),
            Some(MAX_EXPORT_ROW_LIMIT)
        );
        assert_eq!(parse_export_row_limit("1000001"), None);
    }
}
