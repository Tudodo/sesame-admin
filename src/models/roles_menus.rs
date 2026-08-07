pub use super::_entities::roles_menus::{self, ActiveModel, Entity, Model};
use loco_rs::prelude::*;

impl ActiveModelBehavior for ActiveModel {}

impl Model {
    /// Get permissions as string array
    pub fn perm_list(&self) -> Vec<String> {
        self.permissions
            .as_ref()
            .and_then(|j| serde_json::from_value::<Vec<String>>(j.clone()).ok())
            .unwrap_or_else(|| vec!["read".to_string()])
    }
}
