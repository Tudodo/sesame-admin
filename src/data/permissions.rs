//! Request-time permission checks from JWT claims.
//!
//! This module handles fast, in-memory permission checks without database queries.
//! It parses JWT claims (injected at login) to determine if the current user has
//! a specific action permission.
//!
//! For database-backed permission configuration (role -> menu -> actions), see
//! [`crate::models::roles::Model::get_menu_perms`] and
//! [`crate::models::users::Model::get_menu_permissions`].
//!
//! ## Architecture
//! - **JWT claims** (`data::permissions`) -> request-time check, no DB query
//! - **Database records** (`models::roles`, `models::roles_menus`) -> admin configuration
//!
//! Users holding a system role always pass all permission checks.
//!
//! ## Resource-scoped checks (preferred)
//!
//! Use [`require_perm_code`] / [`has_perm_code`] with a full permission code
//! like `"system:user:update"`. These consult the `perm_codes` claim populated
//! at login by [`crate::views::auth::build_menu_data`], which is immune to the
//! horizontal-privilege-escalation bug that the legacy [`require_perm`] suffers
//! from (it only matched an action verb, ignoring the resource).

use loco_rs::prelude::*;
use serde_json::Value;

/// Extract the permissions from JWT claims as a map of menu_id -> Vec<action>
pub fn get_perms(claims: &serde_json::Map<String, Value>) -> Vec<(i32, Vec<String>)> {
    claims
        .get("perms")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|entry| {
                    let pair = entry.as_array()?;
                    let id = pair.first()?.as_i64()? as i32;
                    let actions: Vec<String> = pair
                        .get(1)?
                        .as_array()?
                        .iter()
                        .filter_map(|a| a.as_str().map(String::from))
                        .collect();
                    Some((id, actions))
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Encode permission codes into a compact prefix-grouped string.
///
/// The full JSON array of `system:user:create`, `system:user:update`, etc.
/// can exceed browser cookie limits when embedded in a JWT. Grouping by the
/// prefix before the final `:` keeps the token small while preserving the
/// exact permission strings for authorization checks.
pub fn encode_perm_codes(codes: &[String]) -> String {
    let mut groups: Vec<(String, Vec<String>)> = Vec::new();
    for code in codes {
        let (prefix, action) = match code.rsplit_once(':') {
            Some((prefix, action)) => (prefix.to_string(), action.to_string()),
            None => (String::new(), code.to_string()),
        };
        if let Some((_, actions)) = groups.iter_mut().find(|(existing, _)| existing == &prefix) {
            actions.push(action);
        } else {
            groups.push((prefix, vec![action]));
        }
    }
    groups
        .into_iter()
        .map(|(prefix, actions)| format!("{prefix}:{}", actions.join(",")))
        .collect::<Vec<_>>()
        .join(";")
}

fn decode_perm_code_groups(compressed: &str) -> Vec<String> {
    let mut codes = Vec::new();
    for group in compressed.split(';').filter(|group| !group.is_empty()) {
        let Some((prefix, actions)) = group.rsplit_once(':') else {
            continue;
        };
        for action in actions.split(',').filter(|action| !action.is_empty()) {
            if prefix.is_empty() {
                codes.push(action.to_string());
            } else {
                codes.push(format!("{prefix}:{action}"));
            }
        }
    }
    codes
}

/// Extract the flat permission-code list (`perm_codes` claim) from JWT.
///
/// Newer tokens store `perm_codes` as the compact prefix-grouped string;
/// older tokens may still contain the original JSON array. Tokens without
/// this field deny all resource-scoped checks (callers should treat that as
/// deny, not allow).
pub fn get_perm_codes(claims: &serde_json::Map<String, Value>) -> Vec<String> {
    match claims.get("perm_codes") {
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect(),
        Some(Value::String(compressed)) => decode_perm_code_groups(compressed),
        _ => Vec::new(),
    }
}

/// Extract role names from JWT claims.
///
/// The same claim is also used for permission checks; exposing a single
/// helper keeps role-based queries aligned
/// with the RBAC role names encoded at login.
pub fn get_roles(claims: &serde_json::Map<String, Value>) -> Vec<String> {
    claims
        .get("roles")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

/// Whether the JWT belongs to a user with a system role.
///
/// This claim is set only from `roles.is_system` at login, never from the
/// role name. Keeping the check separate from role names prevents a
/// role-named `admin` from being treated as a privileged system role.
pub fn is_admin_claim(claims: &serde_json::Map<String, Value>) -> bool {
    matches!(claims.get("is_admin"), Some(Value::Bool(true)))
}

/// Check if the JWT claims grant a specific permission *code*.
///
/// `code` is the full `module:resource:action` string (e.g.
/// `"system:user:update"`). A user with a system role always passes.
/// Tokens without a `perm_codes` claim return `false` for non-system
/// users, which is the safe default — callers should re-issue the token
/// if needed rather than allow.
pub fn has_perm_code(claims: &serde_json::Map<String, Value>, code: &str) -> bool {
    if is_admin_claim(claims) {
        return true;
    }
    get_perm_codes(claims).iter().any(|c| c == code)
}

/// Require a specific permission code for an API endpoint.
///
/// Returns `Ok(())` if the user has the permission, otherwise a 403
/// Forbidden response.
pub fn require_perm_code(auth: &auth::JWT, code: &str) -> Result<()> {
    if has_perm_code(&auth.claims.claims, code) {
        Ok(())
    } else {
        Err(forbidden("没有权限执行该操作"))
    }
}

/// Require at least one of the given permission codes.
///
/// Use this only for endpoints that are shared by several read surfaces and
/// do not own a single resource-scoped permission.
pub fn require_any_perm_code(auth: &auth::JWT, codes: &[&str]) -> Result<()> {
    if codes
        .iter()
        .any(|code| has_perm_code(&auth.claims.claims, code))
    {
        Ok(())
    } else {
        Err(forbidden("没有权限执行该操作"))
    }
}

/// Require only that the request carries a valid session.
///
/// Use this for cross-cutting endpoints that are not bound to a specific
/// menu resource (e.g. generic file upload, page-layout config reads).
/// Such endpoints cannot horizontally escalate across resources because
/// they own no resource themselves; authenticating the caller is the
/// correct authorization bar.
pub fn require_authenticated(_auth: &auth::JWT) -> Result<()> {
    Ok(())
}

/// Build a 403 Forbidden error for an authenticated request that failed an
/// authorization check. This keeps 401 exclusively for missing/invalid tokens
/// so clients can safely treat 401 as session expiry.
pub fn forbidden(message: &str) -> Error {
    use axum::http::StatusCode;
    use loco_rs::controller::ErrorDetail;
    Error::CustomError(
        StatusCode::FORBIDDEN,
        ErrorDetail::new("forbidden", message),
    )
}

/// Check if the JWT claims contain a specific permission action.
///
/// `action` is one of "read", "create", "update", "delete".
///
/// # Deprecated
///
/// This checks *only* the action verb across all of the user's menus, ignoring
/// the resource. That means a user with `system:user:read` would also pass a
/// `system:role:read` check — a horizontal privilege escalation. New code
/// should use [`has_perm_code`] with a full code instead. This is retained
/// only until all controllers migrate to [`require_perm_code`].
#[deprecated(note = "use `has_perm_code` with a full `module:resource:action` code")]
pub fn has_perm(claims: &serde_json::Map<String, Value>, action: &str) -> bool {
    let roles = claims
        .get("roles")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    tracing::debug!(?roles, ?action, "has_perm check - roles in JWT");

    if is_admin_claim(claims) {
        return true;
    }

    let perms = get_perms(claims);
    perms
        .iter()
        .any(|(_, actions)| actions.iter().any(|a| a == action))
}

/// Require a specific action for an API endpoint.
///
/// # Deprecated
///
/// See [`has_perm`] for why this is unsafe for resource scoping. Use
/// [`require_perm_code`] instead.
#[deprecated(note = "use `require_perm_code` with a full `module:resource:action` code")]
pub fn require_perm(auth: &auth::JWT, action: &str) -> Result<()> {
    #[allow(deprecated)]
    if has_perm(&auth.claims.claims, action) {
        Ok(())
    } else {
        Err(forbidden("没有权限执行该操作"))
    }
}

/// Require a permission AND a platform-tenant scope.
///
/// Platform administration endpoints manage cross-tenant infrastructure such
/// as tenants, cache, queues, code generation and server monitoring. An
/// system admin inside a non-default tenant must not be able to reach them; the
/// tenant scope is already resolved from the verified JWT by middleware, so
/// this cannot be bypassed by a client-supplied `X-Tenant-Code` header.
pub fn require_platform_admin(
    auth: &auth::JWT,
    tenant_code: &str,
    perm_code: &str,
    message: &str,
) -> Result<()> {
    require_perm_code(auth, perm_code)?;
    if tenant_code != crate::middleware::tenant::DEFAULT_TENANT_CODE {
        return Err(forbidden(message));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_admin_always_has_perm() {
        let claims = json!({"roles": ["admin"], "is_admin": true, "perms": [], "perm_codes": []})
            .as_object()
            .unwrap()
            .clone();
        #[allow(deprecated)]
        {
            assert!(has_perm(&claims, "create"));
            assert!(has_perm(&claims, "delete"));
        }
        assert!(has_perm_code(&claims, "system:user:create"));
        assert!(has_perm_code(&claims, "system:role:delete"));
    }

    #[test]
    fn test_role_name_admin_is_not_a_system_role() {
        // A non-system role must not gain privileged access just because its
        // display name happens to be "admin".
        let claims = json!({"roles": ["admin"], "is_admin": false, "perms": [], "perm_codes": []})
            .as_object()
            .unwrap()
            .clone();
        #[allow(deprecated)]
        {
            assert!(!has_perm(&claims, "create"));
            assert!(!has_perm(&claims, "delete"));
        }
        assert!(!has_perm_code(&claims, "system:user:create"));
        assert!(!has_perm_code(&claims, "system:role:delete"));
    }

    #[test]
    fn test_normal_user_has_perm() {
        let claims = json!({
            "roles": ["user"],
            "perms": [[1, ["read", "create"]]],
            "perm_codes": ["system:user:read", "system:user:create"]
        })
        .as_object()
        .unwrap()
        .clone();
        #[allow(deprecated)]
        {
            assert!(has_perm(&claims, "read"));
            assert!(has_perm(&claims, "create"));
            assert!(!has_perm(&claims, "delete"));
        }
        assert!(has_perm_code(&claims, "system:user:read"));
        assert!(has_perm_code(&claims, "system:user:create"));
        assert!(!has_perm_code(&claims, "system:user:delete"));
    }

    #[test]
    fn test_perm_code_is_resource_scoped() {
        // The whole point of perm_codes: a user with user:read must NOT pass
        // role:read, even though the legacy verb-only check would.
        let claims = json!({
            "roles": ["user"],
            "perms": [[11, ["read"]]],
            "perm_codes": ["system:user:read"]
        })
        .as_object()
        .unwrap()
        .clone();
        assert!(has_perm_code(&claims, "system:user:read"));
        assert!(!has_perm_code(&claims, "system:role:read"));
        assert!(!has_perm_code(&claims, "system:dept:read"));
    }

    #[test]
    fn test_missing_perm_codes_denies() {
        // Tokens issued before perm_codes existed must deny, not allow.
        let claims = json!({"roles": ["user"], "perms": [[11, ["read"]]]})
            .as_object()
            .unwrap()
            .clone();
        assert!(!has_perm_code(&claims, "system:user:read"));
    }

    #[test]
    fn test_perm_code_group_round_trip() {
        let codes = vec![
            "system:user:create".to_string(),
            "system:user:update".to_string(),
            "system:role:read".to_string(),
            "dashboard:read".to_string(),
        ];
        let encoded = encode_perm_codes(&codes);
        assert_eq!(
            "system:user:create,update;system:role:read;dashboard:read",
            encoded
        );
        let claims = json!({ "perm_codes": encoded })
            .as_object()
            .unwrap()
            .clone();
        assert_eq!(codes, get_perm_codes(&claims));
    }

    #[test]
    fn test_forbidden_uses_403() {
        let err = forbidden("没有权限执行该操作");
        let loco_rs::Error::CustomError(status, detail) = err else {
            panic!("expected custom error");
        };
        assert_eq!(status, axum::http::StatusCode::FORBIDDEN);
        assert_eq!(detail.error.as_deref(), Some("forbidden"));
        assert_eq!(detail.description.as_deref(), Some("没有权限执行该操作"));
    }
}
