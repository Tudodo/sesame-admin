use crate::models::_entities::users;
use serde::{Deserialize, Serialize};

/// Safe user response — excludes password, API key, tokens
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserResponse {
    pub id: i32,
    pub pid: String,
    pub email: String,
    pub name: String,
    pub department_id: Option<i32>,
    pub tenant_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub manager_pid: Option<String>,
}

impl From<&users::Model> for UserResponse {
    fn from(u: &users::Model) -> Self {
        Self {
            id: u.id,
            pid: u.pid.to_string(),
            email: u.email.clone(),
            name: u.name.clone(),
            department_id: u.department_id,
            tenant_id: u.tenant_id.clone(),
            created_at: u.created_at.to_rfc3339(),
            updated_at: u.updated_at.to_rfc3339(),
            manager_pid: u.manager_pid.map(|p| p.to_string()),
        }
    }
}
