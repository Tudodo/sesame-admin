use loco::app::App;
use loco::middleware::tenant::DEFAULT_TENANT_CODE;
use loco::models::_entities::{menus, roles, roles_menus, users_roles};
use loco::models::users as users_model;
use loco::views::auth::LoginResponse;
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use serial_test::serial;
use std::sync::atomic::{AtomicI32, Ordering};

use super::prepare_data;

static NEXT_USER_TEST_ID: AtomicI32 = AtomicI32::new(0);

fn next_test_id() -> i32 {
    NEXT_USER_TEST_ID.fetch_add(1, Ordering::Relaxed)
}

async fn create_role_manager_role(db: &sea_orm::DatabaseConnection, test_id: i32) -> roles::Model {
    let now: chrono::DateTime<chrono::Utc> = chrono::Utc::now();
    roles::ActiveModel {
        name: Set(format!("audit-role-manager-{test_id}")),
        description: Set(Some("Audit role manager".to_string())),
        role_key: Set(format!("audit_role_manager_{test_id}")),
        role_sort: Set(0),
        status: Set(1),
        data_scope: Set(1),
        is_system: Set(false),
        dept_ids: Set(None),
        tenant_id: Set(Some(DEFAULT_TENANT_CODE.to_string())),
        created_at: Set(now.into()),
        updated_at: Set(now.into()),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("Failed to create audit role manager role")
}

async fn grant_role_actions(
    db: &sea_orm::DatabaseConnection,
    role_id: i32,
    menu: &menus::Model,
    actions: &[&str],
) {
    let now: chrono::DateTime<chrono::Utc> = chrono::Utc::now();
    roles_menus::ActiveModel {
        role_id: Set(role_id),
        menu_id: Set(menu.id),
        permissions: Set(Some(serde_json::json!(actions))),
        created_at: Set(now.into()),
        tenant_id: Set(Some(DEFAULT_TENANT_CODE.to_string())),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("Failed to grant role action");
}

async fn assign_role(db: &sea_orm::DatabaseConnection, user_id: i32, role_id: i32) {
    let now: chrono::DateTime<chrono::Utc> = chrono::Utc::now();
    users_roles::ActiveModel {
        user_id: Set(user_id),
        role_id: Set(role_id),
        created_at: Set(now.into()),
        tenant_id: Set(Some(DEFAULT_TENANT_CODE.to_string())),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("Failed to assign role");
}

#[tokio::test]
#[serial]
async fn non_system_admin_cannot_assign_system_role() {
    request::<App, _, _>(|request, ctx| async move {
        let test_id = next_test_id();
        let admin_role = roles::Entity::find()
            .filter(roles::Column::Name.eq("admin"))
            .filter(roles::Column::TenantId.eq(DEFAULT_TENANT_CODE))
            .one(&ctx.db)
            .await
            .expect("admin role should exist")
            .expect("admin role should be in default tenant");
        let user_create_menu = menus::Entity::find()
            .filter(menus::Column::Permission.eq("system:user:create"))
            .filter(menus::Column::TenantId.eq(DEFAULT_TENANT_CODE))
            .one(&ctx.db)
            .await
            .expect("user create menu should exist")
            .expect("user create menu should be in default tenant");
        let manager_role = create_role_manager_role(&ctx.db, test_id).await;
        grant_role_actions(&ctx.db, manager_role.id, &user_create_menu, &["read"]).await;

        let manager = users_model::Model::create_with_password(
            &ctx.db,
            &users_model::RegisterParams {
                department_id: None,
                department_ids: None,
                role_ids: None,
                manager_pid: None,
                position_ids: None,
                email: format!("audit-role-manager-{test_id}@example.com"),
                password: "Test1234".to_string(),
                name: "audit-role-manager".to_string(),
            },
            Some(DEFAULT_TENANT_CODE),
        )
        .await
        .expect("Failed to create role manager user");
        assign_role(&ctx.db, manager.id, manager_role.id).await;

        let login = request
            .post("/api/auth/login")
            .json(&serde_json::json!({
                "email": format!("audit-role-manager-{test_id}@example.com"),
                "password": "Test1234"
            }))
            .await;
        assert_eq!(
            login.status_code(),
            200,
            "role manager should be able to log in"
        );
        let login_response: LoginResponse =
            serde_json::from_str(&login.text()).expect("login response should contain a token");
        let (key, value) = prepare_data::auth_header(&login_response.token);

        let created = request
            .post("/api/users")
            .add_header(key, value)
            .json(&serde_json::json!({
                "name": "must-not-be-created",
                "email": format!("must-not-be-created-{test_id}@example.com"),
                "password": "Test1234",
                "role_ids": [admin_role.id]
            }))
            .await;
        assert_eq!(
            created.status_code(),
            403,
            "Non-system admin must not assign a system role"
        );
    })
    .await;
}

#[tokio::test]
#[serial]
async fn non_system_admin_cannot_modify_system_role_user() {
    request::<App, _, _>(|request, ctx| async move {
        let test_id = next_test_id();
        let admin_role = roles::Entity::find()
            .filter(roles::Column::Name.eq("admin"))
            .filter(roles::Column::TenantId.eq(DEFAULT_TENANT_CODE))
            .one(&ctx.db)
            .await
            .expect("admin role should exist")
            .expect("admin role should be in default tenant");
        let user_update_menu = menus::Entity::find()
            .filter(menus::Column::Permission.eq("system:user:edit"))
            .filter(menus::Column::TenantId.eq(DEFAULT_TENANT_CODE))
            .one(&ctx.db)
            .await
            .expect("user update menu should exist")
            .expect("user update menu should be in default tenant");
        let manager_role = create_role_manager_role(&ctx.db, test_id).await;
        grant_role_actions(&ctx.db, manager_role.id, &user_update_menu, &["read"]).await;

        let manager = users_model::Model::create_with_password(
            &ctx.db,
            &users_model::RegisterParams {
                department_id: None,
                department_ids: None,
                role_ids: None,
                manager_pid: None,
                position_ids: None,
                email: format!("audit-user-manager-{test_id}@example.com"),
                password: "Test1234".to_string(),
                name: "audit-user-manager".to_string(),
            },
            Some(DEFAULT_TENANT_CODE),
        )
        .await
        .expect("Failed to create user manager");
        assign_role(&ctx.db, manager.id, manager_role.id).await;

        let system_user = users_model::Model::create_with_password(
            &ctx.db,
            &users_model::RegisterParams {
                department_id: None,
                department_ids: None,
                role_ids: None,
                manager_pid: None,
                position_ids: None,
                email: format!("audit-system-user-{test_id}@example.com"),
                password: "Test1234".to_string(),
                name: "audit-system-user".to_string(),
            },
            Some(DEFAULT_TENANT_CODE),
        )
        .await
        .expect("Failed to create system user");
        assign_role(&ctx.db, system_user.id, admin_role.id).await;

        let login = request
            .post("/api/auth/login")
            .json(&serde_json::json!({
                "email": format!("audit-user-manager-{test_id}@example.com"),
                "password": "Test1234"
            }))
            .await;
        assert_eq!(
            login.status_code(),
            200,
            "user manager should be able to log in"
        );
        let login_response: LoginResponse =
            serde_json::from_str(&login.text()).expect("login response should contain a token");
        let (key, value) = prepare_data::auth_header(&login_response.token);

        let updated = request
            .put(format!("/api/users/{}", system_user.id).as_str())
            .add_header(key, value)
            .json(&serde_json::json!({
                "name": "renamed-system-user"
            }))
            .await;
        assert_eq!(
            updated.status_code(),
            403,
            "Non-system admin must not modify a system-role user"
        );
    })
    .await;
}
#[tokio::test]
#[serial]
async fn non_system_admin_cannot_modify_or_delete_system_role() {
    request::<App, _, _>(|request, ctx| async move {
        let test_id = next_test_id();
        let admin_role = roles::Entity::find()
            .filter(roles::Column::Name.eq("admin"))
            .filter(roles::Column::TenantId.eq(DEFAULT_TENANT_CODE))
            .one(&ctx.db)
            .await
            .expect("admin role should exist")
            .expect("admin role should be in default tenant");
        let role_update_menu = menus::Entity::find()
            .filter(menus::Column::Permission.eq("system:role:edit"))
            .filter(menus::Column::TenantId.eq(DEFAULT_TENANT_CODE))
            .one(&ctx.db)
            .await
            .expect("role update menu should exist")
            .expect("role update menu should be in default tenant");
        let role_delete_menu = menus::Entity::find()
            .filter(menus::Column::Permission.eq("system:role:delete"))
            .filter(menus::Column::TenantId.eq(DEFAULT_TENANT_CODE))
            .one(&ctx.db)
            .await
            .expect("role delete menu should exist")
            .expect("role delete menu should be in default tenant");
        let manager_role = create_role_manager_role(&ctx.db, test_id).await;
        grant_role_actions(&ctx.db, manager_role.id, &role_update_menu, &["read"]).await;
        grant_role_actions(&ctx.db, manager_role.id, &role_delete_menu, &["read"]).await;

        let manager = users_model::Model::create_with_password(
            &ctx.db,
            &users_model::RegisterParams {
                department_id: None,
                department_ids: None,
                role_ids: None,
                manager_pid: None,
                position_ids: None,
                email: format!("audit-role-guard-{test_id}@example.com"),
                password: "Test1234".to_string(),
                name: "audit-role-guard".to_string(),
            },
            Some(DEFAULT_TENANT_CODE),
        )
        .await
        .expect("Failed to create role guard user");
        assign_role(&ctx.db, manager.id, manager_role.id).await;

        let login = request
            .post("/api/auth/login")
            .json(&serde_json::json!({
                "email": format!("audit-role-guard-{test_id}@example.com"),
                "password": "Test1234"
            }))
            .await;
        assert_eq!(
            login.status_code(),
            200,
            "role guard should be able to log in"
        );
        let login_response: LoginResponse =
            serde_json::from_str(&login.text()).expect("login response should contain a token");
        let (key, value) = prepare_data::auth_header(&login_response.token);

        let updated = request
            .put(format!("/api/roles/{}", admin_role.id).as_str())
            .add_header(key, value)
            .json(&serde_json::json!({
                "name": "renamed-admin",
                "status": 0
            }))
            .await;
        assert_eq!(
            updated.status_code(),
            403,
            "Non-system role must not modify a system role"
        );

        let (key, value) = prepare_data::auth_header(&login_response.token);
        let deleted = request
            .delete(format!("/api/roles/{}", admin_role.id).as_str())
            .add_header(key, value)
            .await;

        assert_eq!(
            deleted.status_code(),
            403,
            "Non-system role must not delete a system role"
        );
    })
    .await;
}
