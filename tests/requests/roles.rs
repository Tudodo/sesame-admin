use loco::app::App;
use loco::middleware::tenant::DEFAULT_TENANT_CODE;
use loco::models::_entities::{menus, roles, roles_menus, users_roles};
use loco::models::users as users_model;
use loco::views::auth::LoginResponse;
use loco_rs::prelude::*;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter, Set};
use serial_test::serial;
use std::sync::atomic::{AtomicI32, Ordering};

use super::prepare_data;

static NEXT_MENU_TEST_ID: AtomicI32 = AtomicI32::new(0);

#[tokio::test]
#[serial]
async fn disabling_role_revokes_existing_sessions() {
    request::<App, _, _>(|request, ctx| async move {
        let admin_role = roles::Entity::find()
            .filter(roles::Column::Name.eq("admin"))
            .filter(roles::Column::TenantId.eq(DEFAULT_TENANT_CODE))
            .one(&ctx.db)
            .await
            .expect("admin role should exist")
            .expect("admin role should be in default tenant");
        let editor_role = roles::Entity::find()
            .filter(roles::Column::Name.eq("editor"))
            .filter(roles::Column::TenantId.eq(DEFAULT_TENANT_CODE))
            .one(&ctx.db)
            .await
            .expect("editor role should exist")
            .expect("editor role should be in default tenant");
        let role_menu = menus::Entity::find()
            .filter(menus::Column::Permission.eq("system:role:list"))
            .filter(menus::Column::TenantId.eq(DEFAULT_TENANT_CODE))
            .one(&ctx.db)
            .await
            .expect("role menu should exist")
            .expect("role menu should be in default tenant");

        let admin = users_model::Model::create_with_password(
            &ctx.db,
            &users_model::RegisterParams {
                department_id: None,
                department_ids: None,
                role_ids: None,
                manager_pid: None,
                position_ids: None,
                email: "admin-role-revoke@example.com".to_string(),
                password: "Test1234".to_string(),
                name: "admin-role".to_string(),
            },
            Some(DEFAULT_TENANT_CODE),
        )
        .await
        .expect("Failed to create admin user");
        let editor = users_model::Model::create_with_password(
            &ctx.db,
            &users_model::RegisterParams {
                department_id: None,
                department_ids: None,
                role_ids: None,
                manager_pid: None,
                position_ids: None,
                email: "editor-role-revoke@example.com".to_string(),
                password: "Test1234".to_string(),
                name: "editor-role".to_string(),
            },
            Some(DEFAULT_TENANT_CODE),
        )
        .await
        .expect("Failed to create editor user");

        let now: chrono::DateTime<chrono::Utc> = chrono::Utc::now();
        users_roles::ActiveModel {
            user_id: Set(admin.id),
            role_id: Set(admin_role.id),
            created_at: Set(now.into()),
            tenant_id: Set(Some(DEFAULT_TENANT_CODE.to_string())),
            ..Default::default()
        }
        .insert(&ctx.db)
        .await
        .expect("Failed to assign admin role");
        users_roles::ActiveModel {
            user_id: Set(editor.id),
            role_id: Set(editor_role.id),
            created_at: Set(now.into()),
            tenant_id: Set(Some(DEFAULT_TENANT_CODE.to_string())),
            ..Default::default()
        }
        .insert(&ctx.db)
        .await
        .expect("Failed to assign editor role");
        roles_menus::ActiveModel {
            role_id: Set(editor_role.id),
            menu_id: Set(role_menu.id),
            permissions: Set(Some(serde_json::json!(["read"]))),
            created_at: Set(now.into()),
            tenant_id: Set(Some(DEFAULT_TENANT_CODE.to_string())),
            ..Default::default()
        }
        .insert(&ctx.db)
        .await
        .expect("Failed to grant role read permission");

        let login_admin = request
            .post("/api/auth/login")
            .json(&serde_json::json!({
                "email": "admin-role-revoke@example.com",
                "password": "Test1234"
            }))
            .await;
        let admin_response: LoginResponse =
            serde_json::from_str(&login_admin.text()).expect("admin login should return token");
        let login_editor = request
            .post("/api/auth/login")
            .json(&serde_json::json!({
                "email": "editor-role-revoke@example.com",
                "password": "Test1234"
            }))
            .await;
        let editor_response: LoginResponse =
            serde_json::from_str(&login_editor.text()).expect("editor login should return token");

        let (editor_key, editor_value) = prepare_data::auth_header(&editor_response.token);
        let before = request
            .get("/api/roles")
            .add_header(editor_key, editor_value)
            .await;
        assert_eq!(
            before.status_code(),
            200,
            "Editor token should work while role is enabled"
        );

        let (admin_key, admin_value) = prepare_data::auth_header(&admin_response.token);
        let disable = request
            .put(format!("/api/roles/{}", editor_role.id).as_str())
            .add_header(admin_key, admin_value)
            .json(&serde_json::json!({
                "name": "editor",
                "status": 0
            }))
            .await;
        assert_eq!(
            disable.status_code(),
            200,
            "Admin should be able to disable the editor role"
        );

        let (editor_key, editor_value) = prepare_data::auth_header(&editor_response.token);
        let after = request
            .get("/api/roles")
            .add_header(editor_key, editor_value)
            .await;
        assert_eq!(
            after.status_code(),
            403,
            "Old editor token must be rejected immediately after role disable"
        );
    })
    .await;
}

#[tokio::test]
#[serial]
async fn changing_menu_permission_revokes_existing_sessions() {
    request::<App, _, _>(|request, ctx| async move {
        let admin_role = roles::Entity::find()
            .filter(roles::Column::Name.eq("admin"))
            .filter(roles::Column::TenantId.eq(DEFAULT_TENANT_CODE))
            .one(&ctx.db)
            .await
            .expect("admin role should exist")
            .expect("admin role should be in default tenant");
        let editor_role = roles::Entity::find()
            .filter(roles::Column::Name.eq("editor"))
            .filter(roles::Column::TenantId.eq(DEFAULT_TENANT_CODE))
            .one(&ctx.db)
            .await
            .expect("editor role should exist")
            .expect("editor role should be in default tenant");
        let delete_menu = menus::Entity::find()
            .filter(menus::Column::Permission.eq("system:menu:delete"))
            .filter(menus::Column::TenantId.eq(DEFAULT_TENANT_CODE))
            .one(&ctx.db)
            .await
            .expect("menu delete button should exist")
            .expect("menu delete button should be in default tenant");
        let menu_parent = menus::Entity::find()
            .filter(menus::Column::Permission.eq("system:menu:list"))
            .filter(menus::Column::TenantId.eq(DEFAULT_TENANT_CODE))
            .one(&ctx.db)
            .await
            .expect("menu page should exist")
            .expect("menu page should be in default tenant");

        let admin = users_model::Model::create_with_password(
            &ctx.db,
            &users_model::RegisterParams {
                department_id: None,
                department_ids: None,
                role_ids: None,
                manager_pid: None,
                position_ids: None,
                email: "menu-admin@example.com".to_string(),
                password: "Test1234".to_string(),
                name: "menu-admin".to_string(),
            },
            Some(DEFAULT_TENANT_CODE),
        )
        .await
        .expect("Failed to create admin user");
        let editor = users_model::Model::create_with_password(
            &ctx.db,
            &users_model::RegisterParams {
                department_id: None,
                department_ids: None,
                role_ids: None,
                manager_pid: None,
                position_ids: None,
                email: "menu-editor@example.com".to_string(),
                password: "Test1234".to_string(),
                name: "menu-editor".to_string(),
            },
            Some(DEFAULT_TENANT_CODE),
        )
        .await
        .expect("Failed to create editor user");

        let now: chrono::DateTime<chrono::Utc> = chrono::Utc::now();
        users_roles::ActiveModel {
            user_id: Set(admin.id),
            role_id: Set(admin_role.id),
            created_at: Set(now.into()),
            tenant_id: Set(Some(DEFAULT_TENANT_CODE.to_string())),
            ..Default::default()
        }
        .insert(&ctx.db)
        .await
        .expect("Failed to assign admin role");
        users_roles::ActiveModel {
            user_id: Set(editor.id),
            role_id: Set(editor_role.id),
            created_at: Set(now.into()),
            tenant_id: Set(Some(DEFAULT_TENANT_CODE.to_string())),
            ..Default::default()
        }
        .insert(&ctx.db)
        .await
        .expect("Failed to assign editor role");
        roles_menus::ActiveModel {
            role_id: Set(editor_role.id),
            menu_id: Set(delete_menu.id),
            permissions: Set(Some(serde_json::json!(["delete"]))),
            created_at: Set(now.into()),
            tenant_id: Set(Some(DEFAULT_TENANT_CODE.to_string())),
            ..Default::default()
        }
        .insert(&ctx.db)
        .await
        .expect("Failed to grant menu delete permission");

        let login_admin = request
            .post("/api/auth/login")
            .json(&serde_json::json!({
                "email": "menu-admin@example.com",
                "password": "Test1234"
            }))
            .await;
        let admin_response: LoginResponse =
            serde_json::from_str(&login_admin.text()).expect("admin login should return token");
        let before_id = create_f_menu(&ctx.db, menu_parent.id, "before-menu").await;
        let after_id = create_f_menu(&ctx.db, menu_parent.id, "after-menu").await;

        let login_editor = request
            .post("/api/auth/login")
            .json(&serde_json::json!({
                "email": "menu-editor@example.com",
                "password": "Test1234"
            }))
            .await;
        let editor_response: LoginResponse =
            serde_json::from_str(&login_editor.text()).expect("editor login should return token");

        let (editor_key, editor_value) = prepare_data::auth_header(&editor_response.token);
        let before_delete = request
            .delete(format!("/api/menus/{before_id}").as_str())
            .add_header(editor_key, editor_value)
            .await;
        assert_eq!(
            before_delete.status_code(),
            200,
            "Editor token should work while menu permission is unchanged"
        );

        let (admin_key, admin_value) = prepare_data::auth_header(&admin_response.token);
        let update_menu = request
            .put(format!("/api/menus/{}", delete_menu.id).as_str())
            .add_header(admin_key, admin_value)
            .json(&serde_json::json!({
                "name": "删除（变更后）",
                "permission": "system:menu:audit-delete"
            }))
            .await;
        assert_eq!(
            update_menu.status_code(),
            200,
            "Admin should be able to update menu permission"
        );

        let (editor_key, editor_value) = prepare_data::auth_header(&editor_response.token);
        let after_delete = request
            .delete(format!("/api/menus/{after_id}").as_str())
            .add_header(editor_key, editor_value)
            .await;
        assert_eq!(
            after_delete.status_code(),
            403,
            "Old editor token must be rejected after menu permission change"
        );
    })
    .await;
}

#[tokio::test]
#[serial]
async fn deleting_menu_revokes_existing_sessions() {
    request::<App, _, _>(|request, ctx| async move {
        let admin_role = roles::Entity::find()
            .filter(roles::Column::Name.eq("admin"))
            .filter(roles::Column::TenantId.eq(DEFAULT_TENANT_CODE))
            .one(&ctx.db)
            .await
            .expect("admin role should exist")
            .expect("admin role should be in default tenant");
        let editor_role = roles::Entity::find()
            .filter(roles::Column::Name.eq("editor"))
            .filter(roles::Column::TenantId.eq(DEFAULT_TENANT_CODE))
            .one(&ctx.db)
            .await
            .expect("editor role should exist")
            .expect("editor role should be in default tenant");
        let delete_menu = menus::Entity::find()
            .filter(menus::Column::Permission.eq("system:menu:delete"))
            .filter(menus::Column::TenantId.eq(DEFAULT_TENANT_CODE))
            .one(&ctx.db)
            .await
            .expect("menu delete button should exist")
            .expect("menu delete button should be in default tenant");
        let menu_parent = menus::Entity::find()
            .filter(menus::Column::Permission.eq("system:menu:list"))
            .filter(menus::Column::TenantId.eq(DEFAULT_TENANT_CODE))
            .one(&ctx.db)
            .await
            .expect("menu page should exist")
            .expect("menu page should be in default tenant");

        let admin = users_model::Model::create_with_password(
            &ctx.db,
            &users_model::RegisterParams {
                department_id: None,
                department_ids: None,
                role_ids: None,
                manager_pid: None,
                position_ids: None,
                email: "menu-delete-admin@example.com".to_string(),
                password: "Test1234".to_string(),
                name: "menu-delete-admin".to_string(),
            },
            Some(DEFAULT_TENANT_CODE),
        )
        .await
        .expect("Failed to create admin user");
        let editor = users_model::Model::create_with_password(
            &ctx.db,
            &users_model::RegisterParams {
                department_id: None,
                department_ids: None,
                role_ids: None,
                manager_pid: None,
                position_ids: None,
                email: "menu-delete-editor@example.com".to_string(),
                password: "Test1234".to_string(),
                name: "menu-delete-editor".to_string(),
            },
            Some(DEFAULT_TENANT_CODE),
        )
        .await
        .expect("Failed to create editor user");

        let now: chrono::DateTime<chrono::Utc> = chrono::Utc::now();
        users_roles::ActiveModel {
            user_id: Set(admin.id),
            role_id: Set(admin_role.id),
            created_at: Set(now.into()),
            tenant_id: Set(Some(DEFAULT_TENANT_CODE.to_string())),
            ..Default::default()
        }
        .insert(&ctx.db)
        .await
        .expect("Failed to assign admin role");
        users_roles::ActiveModel {
            user_id: Set(editor.id),
            role_id: Set(editor_role.id),
            created_at: Set(now.into()),
            tenant_id: Set(Some(DEFAULT_TENANT_CODE.to_string())),
            ..Default::default()
        }
        .insert(&ctx.db)
        .await
        .expect("Failed to assign editor role");
        roles_menus::ActiveModel {
            role_id: Set(editor_role.id),
            menu_id: Set(delete_menu.id),
            permissions: Set(Some(serde_json::json!(["delete"]))),
            created_at: Set(now.into()),
            tenant_id: Set(Some(DEFAULT_TENANT_CODE.to_string())),
            ..Default::default()
        }
        .insert(&ctx.db)
        .await
        .expect("Failed to grant menu delete permission");

        let login_admin = request
            .post("/api/auth/login")
            .json(&serde_json::json!({
                "email": "menu-delete-admin@example.com",
                "password": "Test1234"
            }))
            .await;
        let admin_response: LoginResponse =
            serde_json::from_str(&login_admin.text()).expect("admin login should return token");
        let before_id = create_f_menu(&ctx.db, menu_parent.id, "before-delete-menu").await;
        let after_id = create_f_menu(&ctx.db, menu_parent.id, "after-delete-menu").await;

        let login_editor = request
            .post("/api/auth/login")
            .json(&serde_json::json!({
                "email": "menu-delete-editor@example.com",
                "password": "Test1234"
            }))
            .await;
        let editor_response: LoginResponse =
            serde_json::from_str(&login_editor.text()).expect("editor login should return token");

        let (editor_key, editor_value) = prepare_data::auth_header(&editor_response.token);
        let before_delete = request
            .delete(format!("/api/menus/{before_id}").as_str())
            .add_header(editor_key, editor_value)
            .await;
        assert_eq!(
            before_delete.status_code(),
            200,
            "Editor token should work before menu deletion"
        );

        let (admin_key, admin_value) = prepare_data::auth_header(&admin_response.token);
        let delete_menu_response = request
            .delete(format!("/api/menus/{}", delete_menu.id).as_str())
            .add_header(admin_key, admin_value)
            .await;
        assert_eq!(
            delete_menu_response.status_code(),
            200,
            "Admin should be able to delete the menu"
        );

        let (editor_key, editor_value) = prepare_data::auth_header(&editor_response.token);
        let after_delete = request
            .delete(format!("/api/menus/{after_id}").as_str())
            .add_header(editor_key, editor_value)
            .await;
        assert_eq!(
            after_delete.status_code(),
            403,
            "Old editor token must be rejected after menu deletion"
        );
    })
    .await;
}

async fn create_f_menu(db: &sea_orm::DatabaseConnection, parent_id: i32, name: &str) -> i32 {
    let now: chrono::DateTime<chrono::Utc> = chrono::Utc::now();
    let id = 900_000_000
        + ((chrono::Utc::now().timestamp_millis() as i32
            + NEXT_MENU_TEST_ID.fetch_add(1, Ordering::Relaxed))
            % 100_000_000);
    let created = menus::ActiveModel {
        id: Set(id),
        name: Set(name.to_string()),
        path: Set(None),
        icon: Set(None),
        parent_id: Set(Some(parent_id)),
        sort_order: Set(999),
        permission: Set(Some("system:menu:temp:delete".to_string())),
        visible: Set(true),
        created_at: Set(now.into()),
        updated_at: Set(now.into()),
        actions: Set(None),
        menu_type: Set("F".to_string()),
        tenant_id: Set(Some(DEFAULT_TENANT_CODE.to_string())),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("Failed to create test menu");
    created.id
}
