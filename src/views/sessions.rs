use crate::models::_entities::user_sessions;
use serde::{Deserialize, Serialize};

/// Safe session response — excludes the full JWT token to prevent
/// session hijacking via the online-users list endpoint.
/// Only a truncated prefix is included for identification/debugging.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionResponse {
    pub id: String,
    pub user_id: String,
    pub user_name: String,
    pub login_ip: String,
    pub login_location: Option<String>,
    pub browser: Option<String>,
    pub os: Option<String>,
    pub token_preview: String,
    pub login_time: Option<String>,
    pub expires_at: Option<String>,
    pub tenant_id: Option<String>,
}

impl From<&user_sessions::Model> for SessionResponse {
    fn from(s: &user_sessions::Model) -> Self {
        // Show only first 16 chars of token for identification
        let token_preview = if s.token.len() > 16 {
            format!("{}...", &s.token[..16])
        } else {
            "****".to_string()
        };
        Self {
            id: s.id.clone(),
            user_id: s.user_id.clone(),
            user_name: s.user_name.clone(),
            login_ip: s.login_ip.clone(),
            login_location: s.login_location.clone(),
            browser: s.browser.clone(),
            os: s.os.clone(),
            token_preview,
            login_time: s.login_time.map(|t| t.to_rfc3339()),
            expires_at: s.expires_at.map(|t| t.to_rfc3339()),
            tenant_id: s.tenant_id.clone(),
        }
    }
}
