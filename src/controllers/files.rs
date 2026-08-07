use crate::data::permissions::{require_authenticated, require_perm_code};
use crate::middleware::tenant::TenantScope;
use crate::models::storage_config;
use crate::storage::DynamicStorage;
use axum::extract::State;
use axum::extract::{Multipart, Path, Query};
use axum::Extension;
use loco_rs::prelude::*;
use serde::Deserialize;
use uuid::Uuid;

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/files")
        .add("/upload", post(upload))
        .add("/list", get(list_files))
        .add("/download", get(download_by_query))
        .add("/download", delete(delete_file_by_query))
        .add("/{filename}", get(download))
        .add("/{filename}", delete(delete_file))
        .add("/config", get(get_config))
        .add("/config", post(update_config))
        .add("/config/test", post(test_connection))
}

// ─── 文件上传/下载/删除/浏览 ──────────────────────────────────

/// 单次上传请求最多允许的文件数，防止表单字段海量枚举。
const MAX_FILES_PER_REQUEST: usize = 20;
/// 单次上传请求允许的总字节数，避免多文件叠加绕过单文件限制。
const MAX_TOTAL_BYTES: usize = 50 * 1024 * 1024;

#[debug_handler]
async fn upload(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    mut multipart: Multipart,
) -> Result<Response> {
    require_authenticated(&auth)?;
    require_perm_code(&auth, "system:file:upload")?;

    let storage = DynamicStorage::new(&ctx.db, &tenant.code).await;

    let mut uploaded = vec![];
    let mut uploaded_paths = vec![];
    let mut total_bytes = 0usize;
    loop {
        let field = match multipart.next_field().await {
            Ok(Some(field)) => field,
            Ok(None) => break,
            Err(e) => {
                cleanup_uploaded(&storage, &uploaded_paths).await;
                return Err(Error::string(&e.to_string()));
            }
        };
        let mut field = field;
        let original = field.file_name().unwrap_or("file").to_string();
        let safe_ext = std::path::Path::new(&original)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");
        let lower_ext = safe_ext.to_lowercase();
        if [
            "exe", "sh", "bat", "cmd", "php", "jsp", "asp", "html", "htm",
        ]
        .contains(&lower_ext.as_str())
        {
            cleanup_uploaded(&storage, &uploaded_paths).await;
            return Err(Error::BadRequest("File type not allowed".into()));
        }
        let name = format!("{}.{}", Uuid::new_v4(), safe_ext);
        if uploaded_paths.len() >= MAX_FILES_PER_REQUEST {
            cleanup_uploaded(&storage, &uploaded_paths).await;
            return Err(Error::BadRequest(format!(
                "File count exceeds max ({MAX_FILES_PER_REQUEST})"
            )));
        }
        let mut data = Vec::new();
        loop {
            let chunk = match field.chunk().await {
                Ok(Some(chunk)) => chunk,
                Ok(None) => break,
                Err(e) => {
                    cleanup_uploaded(&storage, &uploaded_paths).await;
                    return Err(Error::string(&e.to_string()));
                }
            };
            if total_budget_exceeded(total_bytes, chunk.len(), MAX_TOTAL_BYTES) {
                cleanup_uploaded(&storage, &uploaded_paths).await;
                return Err(Error::BadRequest(format!(
                    "Total upload size exceeds max ({} bytes)",
                    MAX_TOTAL_BYTES
                )));
            }
            data.extend_from_slice(&chunk);
            total_bytes = total_bytes.saturating_add(chunk.len());
        }
        let size = data.len();
        let data = bytes::Bytes::from(data);
        let storage_path = std::path::PathBuf::from(format!("{}/{}", tenant.code, name));
        uploaded_paths.push(storage_path.clone());
        if let Err(e) = storage.upload(&storage_path, &data).await {
            cleanup_uploaded(&storage, &uploaded_paths).await;
            return Err(Error::string(&e));
        }
        uploaded.push(serde_json::json!({
            "name": name,
            "original": original,
            "size": size,
            "url": format!("/api/files/{}", name),
        }));
    }

    format::json(uploaded)
}

fn total_budget_exceeded(current: usize, next_len: usize, max: usize) -> bool {
    current.saturating_add(next_len) > max
}

async fn cleanup_uploaded(storage: &DynamicStorage, paths: &[std::path::PathBuf]) {
    for path in paths {
        let _ = storage.delete(path).await;
    }
}

#[debug_handler]
async fn download(
    State(ctx): State<AppContext>,
    auth: auth::JWT,
    Path(filename): Path<String>,
    Query(q): Query<DownloadQuery>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_authenticated(&auth)?;
    require_perm_code(&auth, "system:file:read")?;
    let name = q.name.as_deref().unwrap_or(&filename);
    validate_storage_name(name)?;

    let storage = DynamicStorage::new(&ctx.db, &tenant.code).await;
    let storage_path = std::path::PathBuf::from(format!("{}/{}", tenant.code, name));
    let data = storage
        .download(&storage_path)
        .await
        .map_err(|e| map_storage_err(&e))?;
    let mime = mime_guess::from_path(name).first_or_octet_stream();
    let disposition_name = name.split('/').next_back().unwrap_or(name);
    let resp = axum::http::Response::builder()
        .header("Content-Type", mime.as_ref())
        .header(
            "Content-Disposition",
            format!("attachment; filename=\"{}\"", disposition_name),
        )
        .header("Cache-Control", "private, no-store")
        .body(axum::body::Body::from(data))
        .map_err(|e| Error::string(&e.to_string()))?;
    Ok(resp)
}

#[debug_handler]
async fn download_by_query(
    State(ctx): State<AppContext>,
    auth: auth::JWT,
    Query(q): Query<DownloadQuery>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    let name = q
        .name
        .ok_or_else(|| Error::BadRequest("缺少 name 参数".into()))?;
    require_authenticated(&auth)?;
    require_perm_code(&auth, "system:file:read")?;
    validate_storage_name(&name)?;

    let storage = DynamicStorage::new(&ctx.db, &tenant.code).await;
    let storage_path = std::path::PathBuf::from(format!("{}/{}", tenant.code, name));
    let data = storage
        .download(&storage_path)
        .await
        .map_err(|e| map_storage_err(&e))?;
    let mime = mime_guess::from_path(&name).first_or_octet_stream();
    let disposition_name = name.split('/').next_back().unwrap_or(&name);
    let resp = axum::http::Response::builder()
        .header("Content-Type", mime.as_ref())
        .header(
            "Content-Disposition",
            format!("attachment; filename=\"{}\"", disposition_name),
        )
        .header("Cache-Control", "private, no-store")
        .body(axum::body::Body::from(data))
        .map_err(|e| Error::string(&e.to_string()))?;
    Ok(resp)
}

#[debug_handler]
async fn delete_file(
    State(ctx): State<AppContext>,
    auth: auth::JWT,
    Path(filename): Path<String>,
    Query(q): Query<DownloadQuery>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_authenticated(&auth)?;
    require_perm_code(&auth, "system:file:delete")?;
    let name = q.name.as_deref().unwrap_or(&filename);
    validate_storage_name(name)?;

    let storage = DynamicStorage::new(&ctx.db, &tenant.code).await;
    let storage_path = std::path::PathBuf::from(format!("{}/{}", tenant.code, name));
    storage
        .delete(&storage_path)
        .await
        .map_err(|e| map_storage_err(&e))?;
    format::json(())
}

#[derive(Deserialize)]
struct ListQuery {
    #[serde(default)]
    prefix: Option<String>,
}

#[debug_handler]
async fn delete_file_by_query(
    State(ctx): State<AppContext>,
    auth: auth::JWT,
    Query(q): Query<DownloadQuery>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    let name = q
        .name
        .ok_or_else(|| Error::BadRequest("缺少 name 参数".into()))?;
    require_authenticated(&auth)?;
    require_perm_code(&auth, "system:file:delete")?;
    validate_storage_name(&name)?;

    let storage = DynamicStorage::new(&ctx.db, &tenant.code).await;
    let storage_path = std::path::PathBuf::from(format!("{}/{}", tenant.code, name));
    storage
        .delete(&storage_path)
        .await
        .map_err(|e| map_storage_err(&e))?;
    format::json(())
}

#[derive(Deserialize)]
struct DownloadQuery {
    name: Option<String>,
}

fn validate_storage_name(name: &str) -> Result<()> {
    if name.is_empty()
        || name.starts_with('/')
        || name.contains("..")
        || name.contains('\\')
        || name.contains('\r')
        || name.contains('\n')
        || name.contains('"')
    {
        return Err(Error::NotFound);
    }
    Ok(())
}

#[debug_handler]
async fn list_files(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Query(q): Query<ListQuery>,
) -> Result<Response> {
    require_authenticated(&auth)?;
    require_perm_code(&auth, "system:file:read")?;
    let storage = DynamicStorage::new(&ctx.db, &tenant.code).await;
    // 文件按 <tenant_code>/<filename> 存储，list 始终以租户 code 为基础前缀。
    // 前端可选传 prefix 作为租户目录内的相对子路径，拼接成 tenant_code[/prefix]。
    // 这同时保证 S3 模式下不会跨租户列文件。
    // 防止路径遍历：prefix 中不允许出现 .. 或反斜杠
    let sub = q.prefix.unwrap_or_default();
    if sub.contains("..") || sub.contains("\\") {
        return Err(Error::NotFound);
    }
    let prefix = if sub.is_empty() {
        tenant.code.clone()
    } else {
        format!("{}/{}", tenant.code, sub.trim_start_matches('/'))
    };
    let files = storage.list(&prefix).await.map_err(|e| Error::string(&e))?;
    format::json(files)
}

// ─── 存储配置管理 ──────────────────────────────────────────────

#[debug_handler]
async fn get_config(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_authenticated(&auth)?;
    require_perm_code(&auth, "system:config:read")?;
    let config = storage_config::Model::get_or_create(&ctx.db, &tenant.code).await?;
    // 返回时隐藏 secret_key 的完整值，只返回是否已设置
    let mut config_json =
        serde_json::to_value(&config).map_err(|e| Error::string(&e.to_string()))?;
    if let Some(obj) = config_json.as_object_mut() {
        if let Some(secret) = obj.get("s3_secret_key").and_then(|v| v.as_str()) {
            if !secret.is_empty() {
                obj.insert(
                    "s3_secret_key".to_string(),
                    serde_json::Value::String(mask_secret(secret)),
                );
            }
        }
    }
    format::json(config_json)
}

#[debug_handler]
async fn update_config(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(params): Json<storage_config::UpdateStorageParams>,
) -> Result<Response> {
    require_authenticated(&auth)?;
    require_perm_code(&auth, "system:config:update")?;

    // 如果 secret_key 是掩码值（含 *），保留原值
    let mut params = params;
    storage_config::validate_storage_params(&params).map_err(Error::BadRequest)?;
    if params
        .s3_secret_key
        .as_ref()
        .map(|s| s.contains('*'))
        .unwrap_or(false)
    {
        // 读取现有配置的 secret_key
        let existing = storage_config::Model::get_or_create(&ctx.db, &tenant.code).await?;
        params.s3_secret_key = existing.s3_secret_key;
    }

    let config = storage_config::Model::get_or_create(&ctx.db, &tenant.code).await?;
    let updated =
        storage_config::Model::update_config(&ctx.db, config.id, &tenant.code, params).await?;

    // Mask sensitive fields before returning, consistent with get_config.
    let mut config_json =
        serde_json::to_value(&updated).map_err(|e| Error::string(&e.to_string()))?;
    if let Some(obj) = config_json.as_object_mut() {
        if let Some(secret) = obj.get("s3_secret_key").and_then(|v| v.as_str()) {
            if !secret.is_empty() {
                obj.insert(
                    "s3_secret_key".to_string(),
                    serde_json::Value::String(mask_secret(secret)),
                );
            }
        }
    }
    format::json(config_json)
}

#[derive(Deserialize)]
struct TestParams {
    #[serde(flatten)]
    config: storage_config::UpdateStorageParams,
}

#[debug_handler]
async fn test_connection(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(params): Json<TestParams>,
) -> Result<Response> {
    require_authenticated(&auth)?;
    require_perm_code(&auth, "system:config:update")?;

    storage_config::validate_storage_params(&params.config).map_err(Error::BadRequest)?;
    if !params.config.s3_enabled || params.config.provider != "s3" {
        return format::json(serde_json::json!({
            "success": false,
            "message": "S3 未启用或 provider 不是 s3"
        }));
    }

    // 如果 secret_key 是掩码值，用现有的
    let mut secret = params.config.s3_secret_key.clone();
    if secret.as_ref().map(|s| s.contains('*')).unwrap_or(false) {
        let existing = storage_config::Model::get_or_create(&ctx.db, &tenant.code).await?;
        secret = existing.s3_secret_key;
    } else if let Some(raw) = secret
        .as_ref()
        .filter(|s| !crate::data::storage_secret::is_encrypted(s))
    {
        secret = Some(crate::data::storage_secret::encrypt_secret(raw).map_err(Error::BadRequest)?);
    }

    let model = storage_config::Model {
        id: 0,
        provider: params.config.provider,
        local_path: params.config.local_path,
        s3_bucket: params.config.s3_bucket,
        s3_region: params.config.s3_region,
        s3_endpoint: params.config.s3_endpoint,
        s3_access_key: params.config.s3_access_key,
        s3_secret_key: secret,
        s3_enabled: params.config.s3_enabled,
        tenant_id: Some(tenant.code.clone()),
        updated_at: chrono::Utc::now().into(),
    };

    match DynamicStorage::test_s3(&model).await {
        Ok(()) => format::json(serde_json::json!({
            "success": true,
            "message": "S3 连接成功"
        })),
        Err(e) => format::json(serde_json::json!({
            "success": false,
            "message": e
        })),
    }
}

/// 掩码 secret_key，只保留前4位和后4位。
fn mask_secret(s: &str) -> String {
    if crate::data::storage_secret::is_encrypted(s) {
        return "********".to_string();
    }
    if s.len() <= 8 {
        return "****".to_string();
    }
    let chars: Vec<char> = s.chars().collect();
    let prefix: String = chars.iter().take(4).collect();
    let suffix: String = chars
        .iter()
        .rev()
        .take(4)
        .cloned()
        .collect::<Vec<_>>()
        .iter()
        .rev()
        .collect();
    format!("{}****{}", prefix, suffix)
}

/// 存储操作错误映射：对象不存在返回 404，其他返回 500。
fn map_storage_err(e: &str) -> Error {
    let lower = e.to_lowercase();
    if lower.contains("notfound")
        || lower.contains("not found")
        || lower.contains("nosuchkey")
        || lower.contains("404")
    {
        Error::NotFound
    } else {
        Error::string(e)
    }
}

#[cfg(test)]
mod tests {
    use super::{total_budget_exceeded, MAX_TOTAL_BYTES};

    #[test]
    fn total_budget_allows_at_limit() {
        assert!(!total_budget_exceeded(0, 1, 1));
        assert!(!total_budget_exceeded(
            MAX_TOTAL_BYTES - 1,
            1,
            MAX_TOTAL_BYTES
        ));
    }

    #[test]
    fn total_budget_rejects_crossing_limit() {
        assert!(total_budget_exceeded(1, 1, 1));
        assert!(total_budget_exceeded(MAX_TOTAL_BYTES, 1, MAX_TOTAL_BYTES));
    }

    #[test]
    fn total_budget_saturates_on_overflow() {
        assert!(!total_budget_exceeded(usize::MAX, 1, usize::MAX));
    }
}
