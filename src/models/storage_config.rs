use loco_rs::prelude::*;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter, Set};

pub use super::_entities::storage_config::{self, ActiveModel, Entity, Model};

impl Model {
    /// 获取当前租户的存储配置（单行配置）。
    /// 如果不存在，返回 None，调用方回退到本地存储。
    pub async fn find_by_tenant(
        db: &DatabaseConnection,
        tenant_code: &str,
    ) -> ModelResult<Option<Self>> {
        let row = Entity::find()
            .filter(storage_config::Column::TenantId.eq(tenant_code))
            .one(db)
            .await?;
        Ok(row)
    }

    /// 获取或创建当前租户的存储配置。
    /// 不存在时插入一行默认的 local 配置。
    pub async fn get_or_create(db: &DatabaseConnection, tenant_code: &str) -> ModelResult<Self> {
        if let Some(existing) = Self::find_by_tenant(db, tenant_code).await? {
            return Ok(existing);
        }
        let now = chrono::Utc::now();
        let active = ActiveModel {
            provider: Set("local".to_string()),
            local_path: Set("uploads".to_string()),
            s3_bucket: Set(None),
            s3_region: Set(None),
            s3_endpoint: Set(None),
            s3_access_key: Set(None),
            s3_secret_key: Set(None),
            s3_enabled: Set(false),
            tenant_id: Set(Some(tenant_code.to_string())),
            updated_at: Set(now.into()),
            ..Default::default()
        };
        let model = active.insert(db).await?;
        Ok(model)
    }

    /// 更新存储配置（带租户校验）。
    pub async fn update_config(
        db: &DatabaseConnection,
        id: i64,
        tenant_code: &str,
        params: UpdateStorageParams,
    ) -> ModelResult<Self> {
        validate_storage_params(&params).map_err(|e| ModelError::msg(&e))?;
        let existing = Entity::find()
            .filter(storage_config::Column::Id.eq(id))
            .filter(storage_config::Column::TenantId.eq(tenant_code))
            .one(db)
            .await?
            .ok_or(ModelError::EntityNotFound)?;
        let mut active: ActiveModel = existing.into();
        active.provider = Set(params.provider);
        active.local_path = Set(params.local_path);
        active.s3_bucket = Set(params.s3_bucket);
        active.s3_region = Set(params.s3_region);
        active.s3_endpoint = Set(params.s3_endpoint);
        active.s3_access_key = Set(params.s3_access_key);
        let s3_secret_key = match params.s3_secret_key {
            Some(value) if crate::data::storage_secret::is_encrypted(&value) => Some(value),
            Some(value) if value.contains('*') => {
                return Err(ModelError::msg("S3 密钥不能使用掩码值保存"));
            }
            Some(value) => Some(
                crate::data::storage_secret::encrypt_secret(&value)
                    .map_err(|e| ModelError::msg(&e))?,
            ),
            None => None,
        };
        active.s3_secret_key = Set(s3_secret_key);
        active.s3_enabled = Set(params.s3_enabled);
        active.updated_at = Set(chrono::Utc::now().into());
        let model = active.update(db).await?;
        Ok(model)
    }
}

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct UpdateStorageParams {
    pub provider: String,
    pub local_path: String,
    pub s3_bucket: Option<String>,
    pub s3_region: Option<String>,
    pub s3_endpoint: Option<String>,
    pub s3_access_key: Option<String>,
    pub s3_secret_key: Option<String>,
    pub s3_enabled: bool,
}

/// 校验存储配置，防止本地路径逃逸和 S3 端点 SSRF。
pub fn validate_storage_params(params: &UpdateStorageParams) -> Result<(), String> {
    if params.provider != "local" && params.provider != "s3" {
        return Err("provider 只支持 local 或 s3".to_string());
    }
    if params.s3_enabled && params.provider != "s3" {
        return Err("启用 S3 时 provider 必须是 s3".to_string());
    }
    let local_path = params.local_path.trim();
    if local_path.is_empty() {
        return Err("本地存储目录不能为空".to_string());
    }
    if local_path.starts_with('/')
        || local_path.starts_with('\\')
        || local_path.contains("..")
        || local_path.contains('\\')
        || local_path.chars().any(char::is_control)
    {
        return Err("本地存储目录必须是安全的相对路径".to_string());
    }
    if params.s3_enabled {
        let bucket = params.s3_bucket.as_deref().unwrap_or("").trim();
        if bucket.is_empty() {
            return Err("S3 bucket 不能为空".to_string());
        }
        if !bucket
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.')
        {
            return Err("S3 bucket 名称包含非法字符".to_string());
        }
        if let Some(endpoint) = params.s3_endpoint.as_deref() {
            let endpoint = endpoint.trim();
            if !endpoint.is_empty() {
                crate::data::security::validate_s3_endpoint(endpoint)?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn local_params(local_path: &str) -> UpdateStorageParams {
        UpdateStorageParams {
            provider: "local".into(),
            local_path: local_path.into(),
            s3_bucket: None,
            s3_region: None,
            s3_endpoint: None,
            s3_access_key: None,
            s3_secret_key: None,
            s3_enabled: false,
        }
    }

    #[test]
    fn accepts_relative_local_path() {
        assert!(validate_storage_params(&local_params("uploads")).is_ok());
    }

    #[test]
    fn rejects_absolute_local_path() {
        assert!(validate_storage_params(&local_params("/tmp/uploads")).is_err());
    }

    #[test]
    fn rejects_path_traversal() {
        assert!(validate_storage_params(&local_params("uploads/../secret")).is_err());
    }

    #[test]
    fn rejects_http_s3_endpoint() {
        let mut params = local_params("uploads");
        params.provider = "s3".into();
        params.s3_enabled = true;
        params.s3_bucket = Some("bucket".into());
        params.s3_endpoint = Some("http://example.com".into());
        assert!(validate_storage_params(&params).is_err());
    }
}
