use crate::models::_entities::{menus, users};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Deserialize, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub pid: String,
    pub name: String,
    pub email: String,
    pub roles: Vec<String>,
    pub permissions: Vec<String>,
    pub menus: Vec<MenuInfo>,
    pub is_verified: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct MenuInfo {
    pub id: i32,
    pub name: String,
    pub path: Option<String>,
    pub icon: Option<String>,
    pub parent_id: Option<i32>,
    pub sort_order: i32,
    pub permission: Option<String>,
    pub visible: bool,
    pub menu_type: String,
    pub available_actions: Vec<String>,
    pub granted_actions: Vec<String>,
}

/// Normalize a raw action name to the canonical verb set used across the
/// RBAC system: `read` / `create` / `update` / `delete` / `export`.
///
/// Historical menus mixed `list`/`read` and `edit`/`update`; normalizing
/// here lets the rest of the system speak one vocabulary while keeping
/// existing migration data untouched.
fn normalize_action(action: &str) -> String {
    match action {
        "list" | "view" => "read",
        "edit" => "update",
        "add" => "create",
        other => other,
    }
    .to_string()
}

/// Derive the resource prefix (`module:resource`) from a menu's permission
/// field. Menu `permission` values come in two shapes:
///   - `system:user:list` (C-type page) — strip the trailing action segment
///     to get the resource prefix `system:user`.
///   - `system:user:create` (F-type button) — caller uses [`button_perm_code`]
///     for the full code; this helper returns `system:user` when needed.
fn resource_prefix(m: &menus::Model) -> String {
    if let Some(ref perm) = m.permission {
        if !perm.is_empty() {
            let parts: Vec<&str> = perm.splitn(3, ':').collect();
            if parts.len() == 3 {
                return format!("{}:{}", parts[0], parts[1]);
            }
            return perm.clone();
        }
    }
    if let Some(ref path) = m.path {
        return path.trim_start_matches('/').replace('/', ":");
    }
    m.name.to_lowercase().replace(' ', "_")
}

/// Build the full permission code for an F-type (button) menu.
/// The menu's `permission` field is already a full code; we only normalize
/// the trailing action verb (`edit` -> `update`, `list` -> `read`).
fn button_perm_code(m: &menus::Model) -> Option<String> {
    let perm = m.permission.as_ref()?;
    if perm.is_empty() {
        return None;
    }
    let parts: Vec<&str> = perm.splitn(3, ':').collect();
    if parts.len() == 3 {
        Some(format!(
            "{}:{}:{}",
            parts[0],
            parts[1],
            normalize_action(parts[2])
        ))
    } else {
        Some(perm.clone())
    }
}

/// Build permissions list and menu info vector from menu data.
///
/// Shared by `LoginResponse` and `CurrentResponse` to eliminate ~40 lines of
/// duplicated menu-building logic.
///
/// Permission code shape: `module:resource:action`, where `action` is one of
/// the canonical verbs (`read`/`create`/`update`/`delete`/`export`). Both
/// C-type pages and F-type buttons produce codes in this same shape so a
/// single `require_perm_code("system:user:update")` check works regardless of
/// where the grant was recorded.
pub fn build_menu_data(
    menu_list: Vec<menus::Model>,
    menu_perms: &[(i32, Vec<String>)],
) -> (Vec<String>, Vec<MenuInfo>) {
    let perm_map: HashMap<i32, Vec<String>> = menu_perms.iter().cloned().collect();

    let mut all_permissions: Vec<String> = vec![];
    for m in &menu_list {
        let granted = perm_map.get(&m.id).cloned().unwrap_or_default();
        if m.menu_type == "F" {
            // F-type button: permission field is the full code; normalize the verb.
            if let Some(code) = button_perm_code(m) {
                if !all_permissions.contains(&code) {
                    all_permissions.push(code);
                }
            }
        } else if m.menu_type == "C" {
            // C-type page: resource prefix + each granted (normalized) action.
            let prefix = resource_prefix(m);
            for action in &granted {
                let code = format!("{}:{}", prefix, normalize_action(action));
                if !all_permissions.contains(&code) {
                    all_permissions.push(code);
                }
            }
        }
    }

    let menus: Vec<MenuInfo> = menu_list
        .into_iter()
        .map(|m| {
            let available = m.action_list();
            let granted = perm_map
                .get(&m.id)
                .cloned()
                .unwrap_or_else(|| vec!["read".to_string()]);
            MenuInfo {
                id: m.id,
                name: m.name,
                path: m.path,
                icon: m.icon,
                parent_id: m.parent_id,
                sort_order: m.sort_order,
                permission: m.permission,
                visible: m.visible,
                menu_type: m.menu_type.clone(),
                available_actions: available,
                granted_actions: granted,
            }
        })
        .collect();

    (all_permissions, menus)
}

impl LoginResponse {
    pub fn new(
        user: &users::Model,
        token: &String,
        role_names: Vec<String>,
        menu_list: Vec<menus::Model>,
        menu_perms: &[(i32, Vec<String>)],
    ) -> Self {
        let (permissions, menus) = build_menu_data(menu_list, menu_perms);
        Self {
            token: token.to_string(),
            pid: user.pid.to_string(),
            name: user.name.clone(),
            roles: role_names,
            email: user.email.clone(),
            permissions,
            menus,
            is_verified: user.email_verified_at.is_some(),
        }
    }
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CurrentResponse {
    pub pid: String,
    pub name: String,
    pub email: String,
    pub roles: Vec<String>,
    pub permissions: Vec<String>,
    pub menus: Vec<MenuInfo>,
}

impl CurrentResponse {
    pub fn new(
        user: &users::Model,
        role_names: Vec<String>,
        menu_list: Vec<menus::Model>,
        menu_perms: &[(i32, Vec<String>)],
    ) -> Self {
        let (permissions, menus) = build_menu_data(menu_list, menu_perms);
        Self {
            pid: user.pid.to_string(),
            name: user.name.clone(),
            email: user.email.clone(),
            roles: role_names,
            permissions,
            menus,
        }
    }
}
