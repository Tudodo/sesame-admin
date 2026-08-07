use loco::middleware::tenant::DEFAULT_TENANT_CODE;
use loco::models::_entities::{menus, roles, roles_menus};
use loco::models::roles as roles_model;
use loco_rs::testing::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use serial_test::serial;

#[tokio::test]
#[serial]
async fn role_menu_perms_stay_scoped_to_role_tenant() {
    let boot = boot_test::<loco::app::App>()
        .await
        .expect("Failed to boot test application");

    let menu = menus::Entity::find()
        .filter(menus::Column::TenantId.eq(DEFAULT_TENANT_CODE))
        .one(&boot.app_context.db)
        .await
        .expect("Failed to load default menu")
        .expect("Default menu missing");

    let role = roles::ActiveModel {
        name: Set("tenant-filter-test".to_string()),
        role_key: Set("tenant_filter_test".to_string()),
        role_sort: Set(99),
        status: Set(1),
        data_scope: Set(1),
        dept_ids: Set(None),
        tenant_id: Set(Some(DEFAULT_TENANT_CODE.to_string())),
        ..Default::default()
    }
    .insert(&boot.app_context.db)
    .await
    .expect("Failed to create test role");

    roles_menus::Entity::insert(roles_menus::ActiveModel {
        role_id: Set(role.id),
        menu_id: Set(menu.id),
        permissions: Set(Some(serde_json::json!(["read"]))),
        tenant_id: Set(Some(DEFAULT_TENANT_CODE.to_string())),
        ..Default::default()
    })
    .exec(&boot.app_context.db)
    .await
    .expect("Failed to create tenant-scoped role menu");

    roles_menus::Entity::insert(roles_menus::ActiveModel {
        role_id: Set(role.id),
        menu_id: Set(menu.id),
        permissions: Set(Some(serde_json::json!(["delete"]))),
        tenant_id: Set(Some("other-tenant".to_string())),
        ..Default::default()
    })
    .exec(&boot.app_context.db)
    .await
    .expect("Failed to create cross-tenant role menu");

    let perms = role
        .get_menu_perms(&boot.app_context.db)
        .await
        .expect("Failed to load role menu permissions");

    assert_eq!(perms, vec![(menu.id, vec!["read".to_string()])]);
}

#[tokio::test]
#[serial]
async fn role_menu_actions_are_normalized_and_validated() {
    let boot = boot_test::<loco::app::App>()
        .await
        .expect("Failed to boot test application");

    let menu = menus::Entity::find()
        .filter(menus::Column::Permission.eq("system:role:list"))
        .filter(menus::Column::TenantId.eq(DEFAULT_TENANT_CODE))
        .one(&boot.app_context.db)
        .await
        .expect("Failed to load role menu")
        .expect("Role menu missing");

    let normalized = roles_model::Model::validate_menu_tenant(
        &boot.app_context.db,
        &[(menu.id, vec!["list".to_string(), "read".to_string()])],
        DEFAULT_TENANT_CODE,
    )
    .await
    .expect("Legacy action aliases should normalize");
    assert_eq!(normalized, vec![(menu.id, vec!["read".to_string()])]);

    let rejected = roles_model::Model::validate_menu_tenant(
        &boot.app_context.db,
        &[(menu.id, vec!["export".to_string()])],
        DEFAULT_TENANT_CODE,
    )
    .await;
    assert!(rejected
        .expect_err("Unsupported action should be rejected")
        .to_string()
        .contains("不支持动作"));
}
