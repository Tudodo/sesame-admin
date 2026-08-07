use chrono::Duration;
use loco_rs::{auth::jwt, hash, prelude::*};
use sea_orm::{
    ColumnTrait, ConnectionTrait, EntityTrait, Order, PaginatorTrait, QueryFilter, QueryOrder,
    QuerySelect, Set, Statement,
};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

pub use super::_entities::users::{self, ActiveModel, Entity, Model};
pub use super::_entities::{
    departments, menus, positions, roles, roles_menus, users_departments, users_positions,
    users_roles,
};

/// Result of building a JWT login token: token, role names, menus, and permission map.
pub struct LoginToken {
    pub token: String,
    pub role_names: Vec<String>,
    pub menu_list: Vec<menus::Model>,
    pub menu_perm_map: Vec<(i32, Vec<String>)>,
}

pub const MAGIC_LINK_LENGTH: i8 = 32;
pub const MAGIC_LINK_EXPIRATION_MIN: i8 = 5;

#[derive(Debug, Deserialize, Serialize)]
pub struct LoginParams {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct RegisterParams {
    pub email: String,
    pub password: String,
    pub name: String,
    pub role_ids: Option<Vec<i32>>,
    pub department_id: Option<i32>,
    pub department_ids: Option<Vec<i32>>,
    pub position_ids: Option<Vec<i32>>,
    pub manager_pid: Option<Uuid>,
}

#[derive(Debug, Validate, Deserialize)]
pub struct Validator {
    #[validate(length(min = 2, message = "Name must be at least 2 characters long."))]
    pub name: String,
    #[validate(email(message = "invalid email"))]
    pub email: String,
}

impl Validatable for ActiveModel {
    fn validator(&self) -> Box<dyn Validate> {
        Box::new(Validator {
            name: self.name.as_ref().to_owned(),
            email: self.email.as_ref().to_owned(),
        })
    }
}

#[async_trait::async_trait]
impl loco_rs::model::Authenticable for Model {
    async fn find_by_api_key(db: &DatabaseConnection, api_key: &str) -> ModelResult<Self> {
        Entity::find()
            .filter(users::Column::ApiKey.eq(api_key))
            .one(db)
            .await?
            .ok_or_else(|| ModelError::EntityNotFound)
    }

    async fn find_by_claims_key(db: &DatabaseConnection, claims_key: &str) -> ModelResult<Self> {
        let pid = claims_key
            .parse::<Uuid>()
            .map_err(|e| ModelError::Message(e.to_string()))?;
        Self::find_by_pid(db, pid).await
    }
}

impl Model {
    pub fn verify_password(&self, password: &str) -> bool {
        hash::verify_password(password, &self.password)
    }

    pub async fn find_by_id_in_tenant(
        db: &DatabaseConnection,
        id: i32,
        tenant_code: &str,
    ) -> ModelResult<Self> {
        Entity::find_by_id(id)
            .filter(users::Column::TenantId.eq(tenant_code))
            .one(db)
            .await?
            .ok_or_else(|| ModelError::EntityNotFound)
    }

    pub async fn find_by_email_in_tenant(
        db: &DatabaseConnection,
        email: &str,
        tenant_code: &str,
    ) -> ModelResult<Self> {
        Entity::find()
            .filter(users::Column::Email.eq(email))
            .filter(users::Column::TenantId.eq(tenant_code))
            .one(db)
            .await?
            .ok_or_else(|| ModelError::EntityNotFound)
    }

    pub async fn find_by_pid(db: &DatabaseConnection, pid: Uuid) -> ModelResult<Self> {
        Entity::find()
            .filter(users::Column::Pid.eq(pid))
            .one(db)
            .await?
            .ok_or_else(|| ModelError::EntityNotFound)
    }

    pub async fn find_by_pid_in_tenant(
        db: &DatabaseConnection,
        pid: Uuid,
        tenant_code: &str,
    ) -> ModelResult<Self> {
        Entity::find()
            .filter(users::Column::Pid.eq(pid))
            .filter(users::Column::TenantId.eq(tenant_code))
            .one(db)
            .await?
            .ok_or_else(|| ModelError::EntityNotFound)
    }

    pub async fn find_by_verification_token(
        db: &DatabaseConnection,
        token: &str,
    ) -> ModelResult<Self> {
        let user = Entity::find()
            .filter(users::Column::EmailVerificationToken.eq(token))
            .one(db)
            .await?
            .ok_or_else(|| ModelError::EntityNotFound)?;
        // Reject expired or missing verification tokens (24-hour window).
        // A None sent_at means the token was never properly issued or
        // has been cleared — treat as invalid for defense-in-depth.
        match user.email_verification_sent_at {
            Some(sent_at)
                if (chrono::Utc::now().fixed_offset() - sent_at) <= Duration::hours(24) =>
            {
                Ok(user)
            }
            _ => Err(ModelError::EntityNotFound),
        }
    }

    pub async fn find_by_reset_token(db: &DatabaseConnection, token: &str) -> ModelResult<Self> {
        let user = Entity::find()
            .filter(users::Column::ResetToken.eq(token))
            .one(db)
            .await?
            .ok_or_else(|| ModelError::EntityNotFound)?;
        // Reject expired or missing reset tokens (30-minute window).
        // A None reset_sent_at means the token was never properly issued or
        // has been cleared — treat as invalid for defense-in-depth.
        match user.reset_sent_at {
            Some(sent_at)
                if (chrono::Utc::now().fixed_offset() - sent_at) <= Duration::minutes(30) =>
            {
                Ok(user)
            }
            _ => Err(ModelError::EntityNotFound),
        }
    }

    pub async fn find_by_magic_token(db: &DatabaseConnection, token: &str) -> ModelResult<Self> {
        let user = Entity::find()
            .filter(users::Column::MagicLinkToken.eq(token))
            .one(db)
            .await?
            .ok_or_else(|| ModelError::EntityNotFound)?;
        // Reject expired or missing magic link expiration.
        // A None expiration means the token was never properly issued or
        // has been cleared — treat as invalid for defense-in-depth.
        match user.magic_link_expiration {
            Some(exp) if chrono::Utc::now() <= exp => Ok(user),
            _ => Err(ModelError::EntityNotFound),
        }
    }

    /// Build JWT claims (roles, perms, iat) and generate a login token.
    /// This is the single place where JWT claims construction lives —
    /// controllers call this and handle HTTP response formatting.
    pub async fn build_login_token(
        &self,
        db: &DatabaseConnection,
        jwt_secret: &str,
        jwt_expiration: u64,
        tenant_code: &str,
    ) -> ModelResult<LoginToken> {
        let user_roles = self.get_roles(db, tenant_code).await?;
        let role_names: Vec<String> = user_roles.iter().map(|r| r.name.clone()).collect();
        let is_system_admin = user_roles.iter().any(|r| r.is_system);
        let (menu_list, menu_perm_map) = self.get_menu_permissions(db, tenant_code).await?;

        // Build flat permission code list (e.g. "system:user:create") for
        // resource-scoped checks in require_perm. This prevents horizontal
        // privilege escalation: a user with "system:user:read" should NOT
        // pass a "system:role:read" check.
        let (perm_codes, _menus) =
            crate::views::auth::build_menu_data(menu_list.clone(), &menu_perm_map);
        let perm_codes_json =
            Value::String(crate::data::permissions::encode_perm_codes(&perm_codes));

        let mut claims = Map::new();
        claims.insert(
            "roles".to_string(),
            Value::Array(
                role_names
                    .iter()
                    .map(|n| Value::String(n.clone()))
                    .collect(),
            ),
        );
        claims.insert("is_admin".to_string(), Value::Bool(is_system_admin));
        claims.insert("perm_codes".to_string(), perm_codes_json);
        // Bind the tenant into the token so downstream middleware can trust
        // it instead of the user-controlled `X-Tenant-Code` header. Without
        // this, a user could forge the header to read another tenant's data.
        claims.insert("tenant".to_string(), Value::String(tenant_code.to_string()));
        claims.insert(
            "iat".to_string(),
            Value::Number(chrono::Utc::now().timestamp().into()),
        );

        let token = self
            .generate_jwt(jwt_secret, jwt_expiration, claims)
            .map_err(|e| ModelError::Message(format!("JWT generation failed: {}", e)))?;

        Ok(LoginToken {
            token,
            role_names,
            menu_list,
            menu_perm_map,
        })
    }

    pub fn generate_jwt(
        &self,
        secret: &str,
        expiration: u64,
        claims: Map<String, Value>,
    ) -> Result<String, String> {
        jwt::JWT::new(secret)
            .generate_token(expiration, self.pid.to_string(), claims)
            .map_err(|e| e.to_string())
    }

    pub async fn get_roles(
        &self,
        db: &DatabaseConnection,
        tenant_code: &str,
    ) -> ModelResult<Vec<roles::Model>> {
        let user_roles = users_roles::Entity::find()
            .filter(users_roles::Column::UserId.eq(self.id))
            .filter(users_roles::Column::TenantId.eq(tenant_code))
            .all(db)
            .await?;
        let role_ids: Vec<i32> = user_roles.iter().map(|ur| ur.role_id).collect();
        if role_ids.is_empty() {
            return Ok(vec![]);
        }
        roles::Entity::find()
            .filter(roles::Column::Id.is_in(role_ids))
            .filter(roles::Column::TenantId.eq(tenant_code))
            // 仅启用状态的角色生效：被禁用的角色不应再授予权限或数据范围。
            .filter(roles::Column::Status.eq(1i16))
            .all(db)
            .await
            .map_err(ModelError::from)
    }

    pub async fn get_role_assignments(
        &self,
        db: &DatabaseConnection,
        tenant_code: &str,
    ) -> ModelResult<Vec<roles::Model>> {
        let user_roles = users_roles::Entity::find()
            .filter(users_roles::Column::UserId.eq(self.id))
            .filter(users_roles::Column::TenantId.eq(tenant_code))
            .all(db)
            .await?;
        let role_ids: Vec<i32> = user_roles.iter().map(|ur| ur.role_id).collect();
        if role_ids.is_empty() {
            return Ok(vec![]);
        }
        roles::Entity::find()
            .filter(roles::Column::Id.is_in(role_ids))
            .filter(roles::Column::TenantId.eq(tenant_code))
            .all(db)
            .await
            .map_err(ModelError::from)
    }

    pub async fn get_menu_permissions(
        &self,
        db: &DatabaseConnection,
        tenant_code: &str,
    ) -> ModelResult<(Vec<menus::Model>, Vec<(i32, Vec<String>)>)> {
        let user_roles = self.get_roles(db, tenant_code).await?;
        let role_ids: Vec<i32> = user_roles.iter().map(|r| r.id).collect();
        if role_ids.is_empty() {
            return Ok((vec![], vec![]));
        }
        let role_menus = roles_menus::Entity::find()
            .filter(roles_menus::Column::RoleId.is_in(role_ids))
            .filter(roles_menus::Column::TenantId.eq(tenant_code))
            .all(db)
            .await?;
        let mut perm_map: HashMap<i32, Vec<String>> = HashMap::new();
        for rm in &role_menus {
            let perms: Vec<String> = rm
                .permissions
                .as_ref()
                .and_then(|j| serde_json::from_value::<Vec<String>>(j.clone()).ok())
                .unwrap_or_else(|| vec!["read".to_string()]);
            perm_map.entry(rm.menu_id).or_default().extend(perms);
        }
        let menu_ids: Vec<i32> = perm_map.keys().cloned().collect();
        if menu_ids.is_empty() {
            return Ok((vec![], vec![]));
        }
        let menu_list = menus::Entity::find()
            .filter(menus::Column::Id.is_in(menu_ids))
            .filter(menus::Column::TenantId.eq(tenant_code))
            .order_by(menus::Column::SortOrder, Order::Asc)
            .all(db)
            .await
            .map_err(ModelError::from)?;
        let menu_perms: Vec<(i32, Vec<String>)> = perm_map.into_iter().collect();
        Ok((menu_list, menu_perms))
    }

    pub async fn get_department_ids(
        &self,
        db: &DatabaseConnection,
        tenant_code: &str,
    ) -> ModelResult<Vec<i32>> {
        let depts = users_departments::Entity::find()
            .filter(users_departments::Column::UserId.eq(self.id))
            .filter(users_departments::Column::TenantId.eq(tenant_code))
            .all(db)
            .await?;
        Ok(depts.iter().map(|d| d.department_id).collect())
    }

    /// Recursively collect all descendant department ids of `root` (BFS),
    /// used to expand the "本部门及以下" data scope.
    async fn collect_descendant_departments(
        db: &DatabaseConnection,
        root: i32,
        tenant_code: &str,
        out: &mut HashSet<i32>,
    ) -> ModelResult<()> {
        use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
        let mut frontier: Vec<i32> = vec![root];
        while let Some(parent) = frontier.pop() {
            let children = departments::Entity::find()
                .filter(departments::Column::ParentId.eq(parent))
                .filter(departments::Column::TenantId.eq(tenant_code))
                .all(db)
                .await?;
            for c in children {
                if out.insert(c.id) {
                    frontier.push(c.id);
                }
            }
        }
        Ok(())
    }

    /// Compute the department-id scope limiting which users/instances the
    /// caller may see, honoring each role's `data_scope` configuration.
    ///
    /// Return conventions: `vec![-1]` = all data; `vec![-2]` = self only;
    /// `vec![]` = no visible departments (restricted, NOT "no filter");
    /// otherwise the union of visible department ids.
    pub async fn get_visible_department_ids(
        &self,
        db: &DatabaseConnection,
        tenant_code: &str,
    ) -> ModelResult<Vec<i32>> {
        let roles = self.get_roles(db, tenant_code).await?;
        // data_scope=1 (全部数据) on any active role, or a system role,
        // grants full visibility.
        if roles.iter().any(|r| r.is_system || r.data_scope == 1) {
            return Ok(vec![-1]);
        }
        // Collect per-role scope, taking the union (widest visible set wins,
        // matching RuoYi semantics where multiple roles combine).
        let mut union: HashSet<i32> = HashSet::new();
        let mut self_only = false;
        let own_depts = self.get_department_ids(db, tenant_code).await?;
        for r in &roles {
            match r.data_scope {
                // 2 自定数据权限：使用角色配置的 dept_ids
                2 => {
                    if let Some(ids) = r
                        .dept_ids
                        .as_ref()
                        .and_then(|j| serde_json::from_value::<Vec<i32>>(j.clone()).ok())
                    {
                        for d in ids {
                            union.insert(d);
                        }
                    }
                }
                // 3 本部门数据权限
                3 => {
                    for d in &own_depts {
                        union.insert(*d);
                    }
                }
                // 4 本部门及以下数据权限：本部门 + 所有后代部门
                4 => {
                    for d in &own_depts {
                        union.insert(*d);
                        Self::collect_descendant_departments(db, *d, tenant_code, &mut union)
                            .await?;
                    }
                }
                // 5 仅本人数据权限
                5 => {
                    self_only = true;
                }
                // 未知值按最保守处理：本部门
                _ => {
                    for d in &own_depts {
                        union.insert(*d);
                    }
                }
            }
        }
        // 若所有角色都是"仅本人"且没有更宽的角色，返回 self-only 哨兵。
        if union.is_empty() {
            if self_only {
                return Ok(vec![-2]);
            }
            // 无任何可见部门：返回空集（受限，非"无过滤"）。
            return Ok(vec![]);
        }
        Ok(union.into_iter().collect())
    }

    pub async fn get_positions(
        &self,
        db: &DatabaseConnection,
        tenant_code: &str,
    ) -> ModelResult<Vec<positions::Model>> {
        let user_pos = users_positions::Entity::find()
            .filter(users_positions::Column::UserId.eq(self.id))
            .filter(users_positions::Column::TenantId.eq(tenant_code))
            .all(db)
            .await?;
        let pos_ids: Vec<i32> = user_pos.iter().map(|up| up.position_id).collect();
        if pos_ids.is_empty() {
            return Ok(vec![]);
        }
        positions::Entity::find()
            .filter(positions::Column::Id.is_in(pos_ids))
            .filter(positions::Column::TenantId.eq(tenant_code))
            .all(db)
            .await
            .map_err(ModelError::from)
    }

    pub async fn create_with_password(
        db: &DatabaseConnection,
        params: &RegisterParams,
        tenant_code: Option<&str>,
    ) -> ModelResult<Self> {
        let txn = db.begin().await.map_err(ModelError::from)?;
        // Check email uniqueness within tenant before inserting.
        let mut query = Entity::find().filter(users::Column::Email.eq(&params.email));
        if let Some(tc) = tenant_code {
            query = query.filter(users::Column::TenantId.eq(tc));
        }
        let existing = query.one(&txn).await.map_err(ModelError::from)?;
        if existing.is_some() {
            return Err(ModelError::Message("该邮箱已被使用".to_string()));
        }
        let now = chrono::Utc::now().into();
        let hashed =
            hash::hash_password(&params.password).map_err(|e| ModelError::msg(&e.to_string()))?;
        let active = ActiveModel {
            name: Set(params.name.clone()),
            email: Set(params.email.clone()),
            password: Set(hashed),
            manager_pid: Set(params.manager_pid),
            tenant_id: Set(tenant_code.map(|s| s.to_string())),
            created_at: Set(now),
            updated_at: Set(now),
            ..Default::default()
        };
        let user = active.insert(&txn).await.map_err(ModelError::from)?;
        if let Some(ref role_ids) = params.role_ids {
            if !role_ids.is_empty() {
                users_roles::Entity::delete_many()
                    .filter(users_roles::Column::UserId.eq(user.id))
                    .exec(&txn)
                    .await
                    .map_err(ModelError::from)?;
                for &rid in role_ids {
                    users_roles::ActiveModel {
                        user_id: Set(user.id),
                        role_id: Set(rid),
                        tenant_id: Set(tenant_code.map(|s| s.to_string())),
                        ..Default::default()
                    }
                    .insert(&txn)
                    .await
                    .map_err(ModelError::from)?;
                }
            }
        }
        if let Some(ref dept_ids) = params.department_ids {
            if !dept_ids.is_empty() {
                users_departments::Entity::delete_many()
                    .filter(users_departments::Column::UserId.eq(user.id))
                    .exec(&txn)
                    .await
                    .map_err(ModelError::from)?;
                for &did in dept_ids {
                    users_departments::ActiveModel {
                        user_id: Set(user.id),
                        department_id: Set(did),
                        tenant_id: Set(tenant_code.map(|s| s.to_string())),
                        ..Default::default()
                    }
                    .insert(&txn)
                    .await
                    .map_err(ModelError::from)?;
                }
            }
        }
        if let Some(ref pos_ids) = params.position_ids {
            if !pos_ids.is_empty() {
                users_positions::Entity::delete_many()
                    .filter(users_positions::Column::UserId.eq(user.id))
                    .exec(&txn)
                    .await
                    .map_err(ModelError::from)?;
                for &pid in pos_ids {
                    users_positions::ActiveModel {
                        user_id: Set(user.id),
                        position_id: Set(pid),
                        tenant_id: Set(tenant_code.map(|s| s.to_string())),
                        ..Default::default()
                    }
                    .insert(&txn)
                    .await
                    .map_err(ModelError::from)?;
                }
            }
        }
        txn.commit().await.map_err(ModelError::from)?;
        Ok(user)
    }

    /// Update user fields and optionally replace role/department/position assignments
    /// within a single transaction.
    #[allow(clippy::too_many_arguments)]
    pub async fn update_with_relations(
        self,
        db: &DatabaseConnection,
        name: Option<String>,
        email: Option<String>,
        password_hash: Option<String>,
        department_id: Option<i32>,
        role_ids: Option<Vec<i32>>,
        department_ids: Option<Vec<i32>>,
        position_ids: Option<Vec<i32>>,
        manager_pid: Option<Option<Uuid>>,
    ) -> ModelResult<Self> {
        let txn = db.begin().await.map_err(ModelError::from)?;
        // Check email uniqueness within tenant if email is being changed.
        if let Some(ref e) = email {
            let existing = Entity::find()
                .filter(users::Column::Email.eq(e))
                .filter(users::Column::TenantId.eq(self.tenant_id.clone()))
                .filter(users::Column::Id.ne(self.id))
                .one(&txn)
                .await
                .map_err(ModelError::from)?;
            if existing.is_some() {
                return Err(ModelError::Message("该邮箱已被使用".to_string()));
            }
        }
        let mut active = self.into_active_model();
        if let Some(n) = name {
            active.name = Set(n);
        }
        if let Some(e) = email {
            active.email = Set(e);
        }
        if let Some(p) = password_hash {
            active.password = Set(p);
        }
        if let Some(mp) = manager_pid {
            active.manager_pid = Set(mp);
        }
        if let Some(did) = department_id {
            active.department_id = Set(Some(did));
        }
        let updated = active.update(&txn).await.map_err(ModelError::from)?;
        if let Some(ref rids) = role_ids {
            users_roles::Entity::delete_many()
                .filter(users_roles::Column::UserId.eq(updated.id))
                .filter(users_roles::Column::TenantId.eq(updated.tenant_id.clone()))
                .exec(&txn)
                .await
                .map_err(ModelError::from)?;
            for &rid in rids {
                users_roles::ActiveModel {
                    user_id: Set(updated.id),
                    role_id: Set(rid),
                    tenant_id: Set(updated.tenant_id.clone()),
                    ..Default::default()
                }
                .insert(&txn)
                .await
                .map_err(ModelError::from)?;
            }
        }
        if let Some(ref dids) = department_ids {
            users_departments::Entity::delete_many()
                .filter(users_departments::Column::UserId.eq(updated.id))
                .filter(users_departments::Column::TenantId.eq(updated.tenant_id.clone()))
                .exec(&txn)
                .await
                .map_err(ModelError::from)?;
            for &did in dids {
                users_departments::ActiveModel {
                    user_id: Set(updated.id),
                    department_id: Set(did),
                    tenant_id: Set(updated.tenant_id.clone()),
                    ..Default::default()
                }
                .insert(&txn)
                .await
                .map_err(ModelError::from)?;
            }
        }
        if let Some(ref pids) = position_ids {
            users_positions::Entity::delete_many()
                .filter(users_positions::Column::UserId.eq(updated.id))
                .filter(users_positions::Column::TenantId.eq(updated.tenant_id.clone()))
                .exec(&txn)
                .await
                .map_err(ModelError::from)?;
            for &pid in pids {
                users_positions::ActiveModel {
                    user_id: Set(updated.id),
                    position_id: Set(pid),
                    tenant_id: Set(updated.tenant_id.clone()),
                    ..Default::default()
                }
                .insert(&txn)
                .await
                .map_err(ModelError::from)?;
            }
        }
        txn.commit().await.map_err(ModelError::from)?;
        Ok(updated)
    }

    pub async fn validate_tenant_ids(
        db: &DatabaseConnection,
        tenant_code: &str,
        role_ids: Option<&[i32]>,
        department_ids: Option<&[i32]>,
        position_ids: Option<&[i32]>,
    ) -> ModelResult<()> {
        if let Some(ids) = role_ids {
            for &id in ids {
                roles::Entity::find_by_id(id)
                    .filter(roles::Column::TenantId.eq(tenant_code))
                    .one(db)
                    .await
                    .map_err(ModelError::from)?
                    .ok_or_else(|| ModelError::Message(format!("Role {} not in tenant", id)))?;
            }
        }
        if let Some(ids) = department_ids {
            for &id in ids {
                departments::Entity::find_by_id(id)
                    .filter(departments::Column::TenantId.eq(tenant_code))
                    .one(db)
                    .await
                    .map_err(ModelError::from)?
                    .ok_or_else(|| {
                        ModelError::Message(format!("Department {} not in tenant", id))
                    })?;
            }
        }
        if let Some(ids) = position_ids {
            for &id in ids {
                positions::Entity::find_by_id(id)
                    .filter(positions::Column::TenantId.eq(tenant_code))
                    .one(db)
                    .await
                    .map_err(ModelError::from)?
                    .ok_or_else(|| ModelError::Message(format!("Position {} not in tenant", id)))?;
            }
        }
        Ok(())
    }

    pub async fn set_roles(&self, db: &DatabaseConnection, role_ids: &[i32]) -> ModelResult<()> {
        let txn = db.begin().await.map_err(ModelError::from)?;
        users_roles::Entity::delete_many()
            .filter(users_roles::Column::UserId.eq(self.id))
            .filter(users_roles::Column::TenantId.eq(self.tenant_id.clone()))
            .exec(&txn)
            .await
            .map_err(ModelError::from)?;
        for &rid in role_ids {
            users_roles::ActiveModel {
                user_id: Set(self.id),
                role_id: Set(rid),
                tenant_id: Set(self.tenant_id.clone()),
                ..Default::default()
            }
            .insert(&txn)
            .await
            .map_err(ModelError::from)?;
        }
        txn.commit().await.map_err(ModelError::from)
    }

    pub async fn set_departments(
        &self,
        db: &DatabaseConnection,
        dept_ids: &[i32],
    ) -> ModelResult<()> {
        let txn = db.begin().await.map_err(ModelError::from)?;
        users_departments::Entity::delete_many()
            .filter(users_departments::Column::UserId.eq(self.id))
            .filter(users_departments::Column::TenantId.eq(self.tenant_id.clone()))
            .exec(&txn)
            .await
            .map_err(ModelError::from)?;
        for &did in dept_ids {
            users_departments::ActiveModel {
                user_id: Set(self.id),
                department_id: Set(did),
                tenant_id: Set(self.tenant_id.clone()),
                ..Default::default()
            }
            .insert(&txn)
            .await
            .map_err(ModelError::from)?;
        }
        txn.commit().await.map_err(ModelError::from)
    }

    pub async fn set_positions(&self, db: &DatabaseConnection, pos_ids: &[i32]) -> ModelResult<()> {
        let txn = db.begin().await.map_err(ModelError::from)?;
        users_positions::Entity::delete_many()
            .filter(users_positions::Column::UserId.eq(self.id))
            .filter(users_positions::Column::TenantId.eq(self.tenant_id.clone()))
            .exec(&txn)
            .await
            .map_err(ModelError::from)?;
        for &pid in pos_ids {
            users_positions::ActiveModel {
                user_id: Set(self.id),
                position_id: Set(pid),
                tenant_id: Set(self.tenant_id.clone()),
                ..Default::default()
            }
            .insert(&txn)
            .await
            .map_err(ModelError::from)?;
        }
        txn.commit().await.map_err(ModelError::from)
    }

    /// Delete user and related records (roles, departments, positions).
    /// Wrapped in a transaction for atomicity.
    pub async fn delete_with_relations(self, db: &DatabaseConnection) -> ModelResult<()> {
        let txn = db.begin().await.map_err(ModelError::from)?;
        let tenant_id = self.tenant_id.clone();
        users_roles::Entity::delete_many()
            .filter(users_roles::Column::UserId.eq(self.id))
            .filter(users_roles::Column::TenantId.eq(self.tenant_id.clone()))
            .exec(&txn)
            .await
            .map_err(ModelError::from)?;
        users_departments::Entity::delete_many()
            .filter(users_departments::Column::UserId.eq(self.id))
            .filter(users_departments::Column::TenantId.eq(self.tenant_id.clone()))
            .exec(&txn)
            .await
            .map_err(ModelError::from)?;
        users_positions::Entity::delete_many()
            .filter(users_positions::Column::UserId.eq(self.id))
            .filter(users_positions::Column::TenantId.eq(self.tenant_id.clone()))
            .exec(&txn)
            .await
            .map_err(ModelError::from)?;
        // 解除其它用户/部门对该用户的上级或负责人引用，避免留下悬空 PID。
        txn.execute(Statement::from_sql_and_values(
            db.get_database_backend(),
            "UPDATE users SET manager_pid = NULL WHERE manager_pid = $1 AND tenant_id = $2",
            [self.pid.into(), tenant_id.clone().into()],
        ))
        .await
        .map_err(ModelError::from)?;
        txn.execute(Statement::from_sql_and_values(
            db.get_database_backend(),
            "UPDATE departments SET leader_pid = NULL WHERE leader_pid = $1 AND tenant_id = $2",
            [self.pid.into(), tenant_id.into()],
        ))
        .await
        .map_err(ModelError::from)?;
        Entity::delete_by_id(self.id)
            .exec(&txn)
            .await
            .map_err(ModelError::from)?;
        txn.commit().await.map_err(ModelError::from)
    }

    /// List users paginated with department-scope visibility filter.
    /// Pass visible_dept_ids of [-1] to see all users (admin).
    pub async fn list_paginated(
        db: &DatabaseConnection,
        tenant_code: &str,
        visible_dept_ids: &[i32],
        sort_column: &str,
        order_asc: bool,
        offset: u64,
        limit: u64,
    ) -> ModelResult<(Vec<Self>, u64)> {
        let mut find = Entity::find().filter(users::Column::TenantId.eq(tenant_code));

        // Apply data scope filter.
        //   vec![-1] => 全部数据（不过滤）
        //   vec![-2] => 仅本人
        //   vec![]   => 无可见部门（返回空，而非"不过滤"）
        //   其它      => 限定在这些部门下的用户
        if visible_dept_ids == vec![-1] {
            // 全部数据，不加过滤
        } else if visible_dept_ids == vec![-2] {
            // 仅本人：调用方传入的 visible_dept_ids 已无法表达"本人 id"，
            // 由调用方在取得 current_user 后改用其 id 过滤；此处兜底返回空，
            // 避免误将"仅本人"放大成"全部"。
            return Ok((vec![], 0));
        } else if visible_dept_ids.is_empty() {
            return Ok((vec![], 0));
        } else {
            let user_ids: HashSet<i32> = users_departments::Entity::find()
                .filter(users_departments::Column::DepartmentId.is_in(visible_dept_ids.to_vec()))
                .filter(users_departments::Column::TenantId.eq(tenant_code))
                .all(db)
                .await
                .map_err(ModelError::from)?
                .iter()
                .map(|ud| ud.user_id)
                .collect();
            if user_ids.is_empty() {
                return Ok((vec![], 0));
            }
            find = find.filter(users::Column::Id.is_in(user_ids.into_iter().collect::<Vec<_>>()));
        }

        let total = find.clone().count(db).await.map_err(ModelError::from)?;
        let column = match sort_column {
            "name" => users::Column::Name,
            "email" => users::Column::Email,
            _ => users::Column::Id,
        };
        let order = if order_asc { Order::Asc } else { Order::Desc };
        let items = find
            .order_by(column, order)
            .offset(offset)
            .limit(limit)
            .all(db)
            .await
            .map_err(ModelError::from)?;
        Ok((items, total))
    }

    /// List only the caller's own record (data_scope = 仅本人).
    pub async fn list_paginated_self(
        db: &DatabaseConnection,
        tenant_code: &str,
        self_user_id: i32,
        sort_column: &str,
        order_asc: bool,
        offset: u64,
        limit: u64,
    ) -> ModelResult<(Vec<Self>, u64)> {
        let find = Entity::find()
            .filter(users::Column::TenantId.eq(tenant_code))
            .filter(users::Column::Id.eq(self_user_id));
        let total = find.clone().count(db).await.map_err(ModelError::from)?;
        let column = match sort_column {
            "name" => users::Column::Name,
            "email" => users::Column::Email,
            _ => users::Column::Id,
        };
        let order = if order_asc { Order::Asc } else { Order::Desc };
        let items = find
            .order_by(column, order)
            .offset(offset)
            .limit(limit)
            .all(db)
            .await
            .map_err(ModelError::from)?;
        Ok((items, total))
    }

    /// Get user PIDs visible within given department scope.
    ///
    /// * `vec![-1]` → empty set (caller interprets empty as "no filter" only
    ///   when it separately knows the scope is "all"; prefer handling [-1]
    ///   at the call site).
    /// * `vec![-2]` → empty set (仅本人 must be handled by the caller using
    ///   the caller's own pid, since this function does not receive it).
    /// * `vec![]`   → empty set (no visible departments).
    /// * otherwise  → pids of users in those departments.
    pub async fn get_visible_pids(
        db: &DatabaseConnection,
        visible_dept_ids: &[i32],
        tenant_code: &str,
    ) -> ModelResult<HashSet<String>> {
        if visible_dept_ids.is_empty()
            || visible_dept_ids == vec![-1]
            || visible_dept_ids == vec![-2]
        {
            return Ok(HashSet::new());
        }
        let user_ids: HashSet<i32> = users_departments::Entity::find()
            .filter(users_departments::Column::DepartmentId.is_in(visible_dept_ids.to_vec()))
            .filter(users_departments::Column::TenantId.eq(tenant_code))
            .all(db)
            .await
            .map_err(ModelError::from)?
            .iter()
            .map(|ud| ud.user_id)
            .collect();
        let pids: HashSet<String> = Entity::find()
            .filter(users::Column::Id.is_in(user_ids.into_iter().collect::<Vec<_>>()))
            .all(db)
            .await
            .map_err(ModelError::from)?
            .iter()
            .map(|u| u.pid.to_string())
            .collect();
        Ok(pids)
    }
}

impl super::_entities::users::ActiveModel {
    pub async fn verified(
        self,
        db: &DatabaseConnection,
    ) -> ModelResult<super::_entities::users::Model> {
        let mut this = self;
        this.email_verified_at = Set(Some(chrono::Utc::now().into()));
        this.email_verification_token = Set(None);
        this.update(db).await.map_err(ModelError::from)
    }

    pub async fn set_email_verification_sent(
        self,
        db: &DatabaseConnection,
    ) -> ModelResult<super::_entities::users::Model> {
        let mut this = self;
        this.email_verification_token = Set(Some(uuid::Uuid::new_v4().to_string()));
        this.email_verification_sent_at = Set(Some(chrono::Utc::now().into()));
        this.update(db).await.map_err(ModelError::from)
    }

    pub async fn set_forgot_password_sent(
        self,
        db: &DatabaseConnection,
    ) -> ModelResult<super::_entities::users::Model> {
        let mut this = self;
        this.reset_token = Set(Some(uuid::Uuid::new_v4().to_string()));
        this.reset_sent_at = Set(Some(chrono::Utc::now().into()));
        this.update(db).await.map_err(ModelError::from)
    }

    pub async fn reset_password(
        self,
        db: &DatabaseConnection,
        new_password: &str,
    ) -> ModelResult<super::_entities::users::Model> {
        let mut this = self;
        this.password =
            Set(hash::hash_password(new_password).map_err(|e| ModelError::msg(&e.to_string()))?);
        this.reset_token = Set(None);
        this.reset_sent_at = Set(None);
        this.update(db).await.map_err(ModelError::from)
    }

    pub async fn create_magic_link(
        self,
        db: &DatabaseConnection,
    ) -> ModelResult<super::_entities::users::Model> {
        let mut this = self;
        use rand::Rng;
        let token: String = rand::thread_rng()
            .sample_iter(&rand::distributions::Alphanumeric)
            .take(MAGIC_LINK_LENGTH as usize)
            .map(char::from)
            .collect();
        this.magic_link_token = Set(Some(token));
        this.magic_link_expiration = Set(Some(
            (chrono::Utc::now() + Duration::minutes(MAGIC_LINK_EXPIRATION_MIN as i64)).into(),
        ));
        this.update(db).await.map_err(ModelError::from)
    }

    pub async fn clear_magic_link(
        self,
        db: &DatabaseConnection,
    ) -> ModelResult<super::_entities::users::Model> {
        let mut this = self;
        this.magic_link_token = Set(None);
        this.magic_link_expiration = Set(None);
        this.update(db).await.map_err(ModelError::from)
    }
}

#[async_trait::async_trait]
impl ActiveModelBehavior for super::_entities::users::ActiveModel {
    async fn before_save<C>(self, _db: &C, insert: bool) -> Result<Self, DbErr>
    where
        C: ConnectionTrait,
    {
        self.validate()?;
        if insert {
            let mut this = self;
            this.pid = ActiveValue::Set(Uuid::new_v4());
            this.api_key = ActiveValue::Set(format!("lo-{}", Uuid::new_v4()));
            Ok(this)
        } else {
            Ok(self)
        }
    }
}
