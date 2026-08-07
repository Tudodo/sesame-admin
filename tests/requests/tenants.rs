use axum::http::{HeaderName, HeaderValue};
use loco::app::App;
use loco::middleware::tenant::DEFAULT_TENANT_CODE;
use loco::models::_entities::{roles, users_roles};
use loco::models::tenants as tenants_model;
use loco::models::users as users_model;
use loco::views::auth::LoginResponse;
use loco_rs::testing::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use serial_test::serial;
use std::sync::atomic::{AtomicI32, Ordering};

use super::prepare_data;

static NEXT_TENANT_TEST_ID: AtomicI32 = AtomicI32::new(0);

fn next_test_id() -> i32 {
    NEXT_TENANT_TEST_ID.fetch_add(1, Ordering::Relaxed)
}

async fn assign_default_admin_role(
    db: &sea_orm::DatabaseConnection,
    user_id: i32,
    tenant_code: &str,
) {
    let role = roles::Entity::find()
        .filter(roles::Column::Name.eq("admin"))
        .filter(roles::Column::TenantId.eq(tenant_code))
        .one(db)
        .await
        .expect("admin role should exist")
        .expect("admin role should be in the expected tenant");
    let now: chrono::DateTime<chrono::Utc> = chrono::Utc::now();
    users_roles::ActiveModel {
        user_id: Set(user_id),
        role_id: Set(role.id),
        created_at: Set(now.into()),
        tenant_id: Set(Some(tenant_code.to_string())),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("Failed to assign admin role");
}

async fn login_as(
    request: &loco_rs::TestServer,
    email: &str,
    tenant_code: Option<&str>,
) -> LoginResponse {
    let mut login = request.post("/api/auth/login").json(&serde_json::json!({
        "email": email,
        "password": "Test1234"
    }));
    if let Some(code) = tenant_code {
        login = login.add_header(
            HeaderName::from_static("x-tenant-code"),
            HeaderValue::from_str(code).expect("tenant code must be a valid header value"),
        );
    }
    let response = login.await;
    assert_eq!(
        response.status_code(),
        200,
        "login should succeed for {email}: {}",
        response.text()
    );
    serde_json::from_str(&response.text()).expect("login response should contain a token")
}

async fn create_platform_admin(
    db: &sea_orm::DatabaseConnection,
    test_id: i32,
) -> loco::models::users::Model {
    let admin = users_model::Model::create_with_password(
        db,
        &users_model::RegisterParams {
            department_id: None,
            department_ids: None,
            role_ids: None,
            manager_pid: None,
            position_ids: None,
            email: format!("audit-platform-admin-{test_id}@example.com"),
            password: "Test1234".to_string(),
            name: "audit-platform-admin".to_string(),
        },
        Some(DEFAULT_TENANT_CODE),
    )
    .await
    .expect("Failed to create platform admin user");
    assign_default_admin_role(db, admin.id, DEFAULT_TENANT_CODE).await;
    admin
}

async fn create_tenant_admin(
    db: &sea_orm::DatabaseConnection,
    test_id: i32,
    tenant_code: &str,
) -> loco::models::users::Model {
    let _tenant = tenants_model::Model::create_tenant(
        db,
        &format!("Audit Tenant {test_id}"),
        tenant_code,
        None,
    )
    .await
    .expect("Failed to create tenant");
    let now: chrono::DateTime<chrono::Utc> = chrono::Utc::now();
    let role = roles::ActiveModel {
        name: Set("admin".to_string()),
        description: Set(Some("Tenant administrator".to_string())),
        role_key: Set("admin".to_string()),
        role_sort: Set(0),
        status: Set(1),
        data_scope: Set(1),
        is_system: Set(true),
        dept_ids: Set(None),
        tenant_id: Set(Some(tenant_code.to_string())),
        created_at: Set(now.into()),
        updated_at: Set(now.into()),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("Failed to create tenant admin role");
    let user = users_model::Model::create_with_password(
        db,
        &users_model::RegisterParams {
            department_id: None,
            department_ids: None,
            role_ids: None,
            manager_pid: None,
            position_ids: None,
            email: format!("audit-tenant-admin-{test_id}@example.com"),
            password: "Test1234".to_string(),
            name: "audit-tenant-admin".to_string(),
        },
        Some(tenant_code),
    )
    .await
    .expect("Failed to create tenant admin user");
    users_roles::ActiveModel {
        user_id: Set(user.id),
        role_id: Set(role.id),
        created_at: Set(now.into()),
        tenant_id: Set(Some(tenant_code.to_string())),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("Failed to assign tenant admin role");
    user
}

#[tokio::test]
#[serial]
async fn disabling_tenant_revokes_existing_sessions() {
    request::<App, _, _>(|request, ctx| async move {
        let test_id = next_test_id();
        let tenant_code = format!("audit-tenant-{test_id}");
        create_tenant_admin(&ctx.db, test_id, &tenant_code).await;
        let tenant = tenants_model::Model::find_by_code(&ctx.db, &tenant_code)
            .await
            .expect("tenant should exist after bootstrap");
        let _platform_admin = create_platform_admin(&ctx.db, test_id).await;

        let tenant_login = login_as(
            &request,
            &format!("audit-tenant-admin-{test_id}@example.com"),
            Some(&tenant_code),
        )
        .await;
        let (tenant_key, tenant_value) = prepare_data::auth_header(&tenant_login.token);
        let before = request
            .get("/api/roles")
            .add_header(tenant_key, tenant_value)
            .await;
        assert_eq!(
            before.status_code(),
            200,
            "Tenant token should work while tenant is enabled"
        );

        let platform_login = login_as(
            &request,
            &format!("audit-platform-admin-{test_id}@example.com"),
            None,
        )
        .await;
        let (admin_key, admin_value) = prepare_data::auth_header(&platform_login.token);
        let disable = request
            .put(format!("/api/tenants/{}", tenant.id).as_str())
            .add_header(admin_key, admin_value)
            .json(&serde_json::json!({
                "name": tenant.name,
                "code": tenant.code,
                "status": "disabled"
            }))
            .await;
        assert_eq!(
            disable.status_code(),
            200,
            "Platform admin should be able to disable the tenant"
        );

        let (tenant_key, tenant_value) = prepare_data::auth_header(&tenant_login.token);
        let after = request
            .get("/api/roles")
            .add_header(tenant_key, tenant_value)
            .await;
        assert_eq!(
            after.status_code(),
            403,
            "Old tenant token must be rejected immediately after tenant disable"
        );
    })
    .await;
}

#[tokio::test]
#[serial]
async fn deleting_tenant_revokes_existing_sessions() {
    request::<App, _, _>(|request, ctx| async move {
        let test_id = next_test_id();
        let tenant_code = format!("audit-tenant-{test_id}");
        create_tenant_admin(&ctx.db, test_id, &tenant_code).await;
        let tenant = tenants_model::Model::find_by_code(&ctx.db, &tenant_code)
            .await
            .expect("tenant should exist after bootstrap");
        let _platform_admin = create_platform_admin(&ctx.db, test_id).await;

        let tenant_login = login_as(
            &request,
            &format!("audit-tenant-admin-{test_id}@example.com"),
            Some(&tenant_code),
        )
        .await;
        let (tenant_key, tenant_value) = prepare_data::auth_header(&tenant_login.token);
        let before = request
            .get("/api/roles")
            .add_header(tenant_key, tenant_value)
            .await;
        assert_eq!(
            before.status_code(),
            200,
            "Tenant token should work before tenant deletion"
        );

        let platform_login = login_as(
            &request,
            &format!("audit-platform-admin-{test_id}@example.com"),
            None,
        )
        .await;
        let (admin_key, admin_value) = prepare_data::auth_header(&platform_login.token);
        let delete = request
            .delete(format!("/api/tenants/{}", tenant.id).as_str())
            .add_header(admin_key, admin_value)
            .await;
        assert_eq!(
            delete.status_code(),
            200,
            "Platform admin should be able to delete the tenant"
        );

        let (tenant_key, tenant_value) = prepare_data::auth_header(&tenant_login.token);
        let after = request
            .get("/api/roles")
            .add_header(tenant_key, tenant_value)
            .await;
        assert_eq!(
            after.status_code(),
            403,
            "Old tenant token must be rejected immediately after tenant deletion"
        );
    })
    .await;
}
