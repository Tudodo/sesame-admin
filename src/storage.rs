//! 动态存储层：根据存储配置动态选择 S3 或本地磁盘。
//!
//! 设计要点：
//! - S3 配置存在数据库里，运行时动态读取，无需改 config 文件重启。
//! - `s3_enabled = true` 且 S3 可达 → 走 S3 桶。
//! - 否则 → 走本地磁盘（uploads 目录）。
//! - 每次操作都查配置，保证配置变更后立即生效。
//!
//! 实现说明：直接持有 opendal::Operator 而非 loco_rs::storage::drivers::StoreDriver，
//! 因为 StoreDriver trait 未暴露 check()/list()，而这两个能力正是测试连接和文件浏览所需。

use std::path::{Path, PathBuf};

use bytes::Bytes;
use opendal::{services::S3, Operator};
use sea_orm::DatabaseConnection;

use crate::models::storage_config;

/// 文件元信息（列表浏览用）。
#[derive(Debug, Clone, serde::Serialize)]
pub struct FileInfo {
    pub name: String,
    pub size: u64,
    pub modified: Option<String>,
    pub url: String,
}

/// 动态存储句柄。
/// S3 模式持有 opendal::Operator；本地模式只持有根路径，用 tokio::fs 操作。
pub struct DynamicStorage {
    pub use_s3: bool,
    s3: Option<Operator>,
    local_path: String,
}

impl DynamicStorage {
    /// 根据租户配置创建存储句柄。
    /// S3 配置存在且启用时尝试创建 S3 Operator；创建失败或未启用时回退本地。
    pub async fn new(db: &DatabaseConnection, tenant_code: &str) -> Self {
        let config = match storage_config::Model::find_by_tenant(db, tenant_code).await {
            Ok(Some(c)) => c,
            _ => {
                return Self {
                    use_s3: false,
                    s3: None,
                    local_path: "uploads".to_string(),
                };
            }
        };

        if config.s3_enabled && config.provider == "s3" {
            match build_s3_operator(&config) {
                Ok(op) => {
                    return Self {
                        use_s3: true,
                        s3: Some(op),
                        local_path: config.local_path,
                    };
                }
                Err(e) => {
                    tracing::warn!(error = %e, "S3 operator init failed, falling back to local");
                }
            }
        }

        Self {
            use_s3: false,
            s3: None,
            local_path: config.local_path,
        }
    }

    /// 真实测试 S3 连接：构造 Operator 后依次做 list 探测和写权限探测。
    /// list 验证凭据/endpoint/bucket 可达；写探针验证实际上传权限。
    /// 两步都通过才返回成功，避免 list 能过但 upload 403 的情形。
    pub async fn test_s3(config: &storage_config::Model) -> Result<(), String> {
        if let Some(endpoint) = config
            .s3_endpoint
            .as_deref()
            .filter(|s| !s.trim().is_empty())
        {
            crate::data::security::validate_s3_endpoint(endpoint)?;
        }
        let op = build_s3_operator(config)?;

        // 第一步：list 探测，验证可达性与读权限
        op.check()
            .await
            .map_err(|e| format!("list 探测失败: {e:?}"))?;

        // 第二步：写探针，验证上传/删除权限
        let probe_key = ".loco-storage-probe";
        op.write(probe_key, bytes::Bytes::from_static(b"probe"))
            .await
            .map_err(|e| format!("写入探针失败（上传权限不足）: {e:?}"))?;
        op.delete(probe_key)
            .await
            .map_err(|e| format!("删除探针失败: {e:?}"))?;

        Ok(())
    }

    /// 上传文件。
    pub async fn upload(&self, path: &Path, content: &Bytes) -> Result<(), String> {
        if self.use_s3 {
            if let Some(ref op) = self.s3 {
                let key = path_to_key(path);
                op.write(&key, content.clone())
                    .await
                    .map_err(|e| format!("{e:?}"))?;
                return Ok(());
            }
        }
        // 本地存储
        let full_path = self.local_full_path(path);
        if let Some(parent) = full_path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| e.to_string())?;
        }
        tokio::fs::write(&full_path, content)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// 下载文件内容。
    pub async fn download(&self, path: &Path) -> Result<Vec<u8>, String> {
        if self.use_s3 {
            if let Some(ref op) = self.s3 {
                let key = path_to_key(path);
                let bytes = op.read(&key).await.map_err(|e| format!("{e:?}"))?;
                return Ok(bytes.to_vec());
            }
        }
        let full_path = self.local_full_path(path);
        tokio::fs::read(&full_path).await.map_err(|e| e.to_string())
    }

    /// 删除文件。
    pub async fn delete(&self, path: &Path) -> Result<(), String> {
        if self.use_s3 {
            if let Some(ref op) = self.s3 {
                let key = path_to_key(path);
                op.delete(&key).await.map_err(|e| format!("{e:?}"))?;
                return Ok(());
            }
        }
        let full_path = self.local_full_path(path);
        tokio::fs::remove_file(&full_path)
            .await
            .map_err(|e| e.to_string())
    }

    /// 列出目录下的文件（浏览功能）。
    /// S3 模式用 Operator::list 列出桶内对象；本地模式扫描目录。
    pub async fn list(&self, prefix: &str) -> Result<Vec<FileInfo>, String> {
        if self.use_s3 {
            if let Some(ref op) = self.s3 {
                return list_s3(op, prefix).await;
            }
            return Ok(vec![]);
        }

        // 本地存储：扫描目录
        let dir = self.local_full_path(Path::new(prefix));
        if !dir.exists() {
            return Ok(vec![]);
        }

        let mut files = Vec::new();
        let mut entries = tokio::fs::read_dir(&dir).await.map_err(|e| e.to_string())?;
        while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
            let meta = entry.metadata().await.map_err(|e| e.to_string())?;
            if meta.is_file() {
                let name = entry.file_name().to_str().unwrap_or("").to_string();
                let modified = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| {
                        chrono::DateTime::<chrono::Utc>::from_timestamp(d.as_secs() as i64, 0)
                            .map(|dt| dt.to_rfc3339())
                            .unwrap_or_default()
                    });
                files.push(FileInfo {
                    name: name.clone(),
                    size: meta.len(),
                    modified,
                    url: format!("/api/files/{}", name),
                });
            }
        }
        files.sort_by(|a, b| b.name.cmp(&a.name));
        Ok(files)
    }

    /// 本地存储的完整路径。
    fn local_full_path(&self, rel: &Path) -> PathBuf {
        PathBuf::from(&self.local_path).join(rel)
    }
}

/// 构造 S3 Operator。仅本地组装 builder，不发网络请求。
fn build_s3_operator(config: &storage_config::Model) -> Result<Operator, String> {
    let bucket = config.s3_bucket.as_deref().unwrap_or("");
    let region = config.s3_region.as_deref().unwrap_or("us-east-1");
    let endpoint = config.s3_endpoint.as_deref().unwrap_or("");
    let access_key = config.s3_access_key.as_deref().unwrap_or("");
    let secret_key = match config.s3_secret_key.as_deref() {
        Some(stored) => crate::data::storage_secret::decrypt_secret(stored)?,
        None => String::new(),
    };

    if bucket.is_empty() {
        return Err("S3 bucket is required".into());
    }

    let mut s3 = S3::default()
        .bucket(bucket)
        .region(region)
        // 避免 EC2 metadata 探测拖慢连接/误用本机 IAM 凭据
        .disable_ec2_metadata();

    if !endpoint.is_empty() {
        // 保存/测试路径会做 DNS 校验；运行期只重复格式和内部字面量校验，
        // 防止历史或被篡改配置直接进入 opendal，同时避免每次文件操作都解析域名。
        crate::data::security::validate_s3_endpoint_format(endpoint)?;
        s3 = s3.endpoint(endpoint);
    }
    if !access_key.is_empty() && !secret_key.is_empty() {
        s3 = s3.access_key_id(access_key).secret_access_key(&secret_key);
    } else {
        // 未提供凭据时允许匿名访问（公开桶场景）
        s3 = s3.allow_anonymous();
    }

    Ok(Operator::new(s3).map_err(|e| e.to_string())?.finish())
}

/// 把 Path 转成 S3 key（opendal 用正斜杠字符串，不用系统路径分隔符）。
fn path_to_key(path: &Path) -> String {
    // 用 / 拼接各组件，避免 Windows 反斜杠
    let parts: Vec<String> = path
        .components()
        .filter_map(|c| c.as_os_str().to_str().map(|s| s.to_string()))
        .collect();
    parts.join("/")
}

/// 列出 S3 桶内指定前缀下的对象。
async fn list_s3(op: &Operator, prefix: &str) -> Result<Vec<FileInfo>, String> {
    let list_prefix = if prefix.is_empty() {
        "/".to_string()
    } else {
        let p = prefix.trim_start_matches('/');
        if p.ends_with('/') {
            p.to_string()
        } else {
            format!("{p}/")
        }
    };

    let entries = op.list(&list_prefix).await.map_err(|e| format!("{e:?}"))?;

    let mut files = Vec::new();
    for entry in entries {
        let meta = op.stat(entry.path()).await.map_err(|e| format!("{e:?}"))?;
        // 跳过"目录"占位符（size 为 0 且以 / 结尾）
        if meta.is_dir() {
            continue;
        }
        let full_path = entry.path().to_string();
        // name 去掉前缀，只保留文件名部分用于展示和 url
        let name = full_path
            .trim_start_matches(&list_prefix)
            .trim_start_matches('/');
        let modified = meta.last_modified().map(|t| t.to_rfc3339());
        files.push(FileInfo {
            name: name.to_string(),
            size: meta.content_length(),
            modified,
            url: format!("/api/files/{}", name),
        });
    }
    files.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::build_s3_operator;
    use crate::models::storage_config;

    fn test_config(endpoint: Option<String>) -> storage_config::Model {
        storage_config::Model {
            id: 0,
            provider: "s3".to_string(),
            local_path: "uploads".to_string(),
            s3_bucket: Some("test-bucket".to_string()),
            s3_region: Some("us-east-1".to_string()),
            s3_endpoint: endpoint,
            s3_access_key: Some("test-key".to_string()),
            s3_secret_key: None,
            s3_enabled: true,
            tenant_id: Some("default".to_string()),
            updated_at: chrono::Utc::now().into(),
        }
    }

    #[test]
    fn build_s3_operator_rejects_http_endpoint() {
        let err =
            build_s3_operator(&test_config(Some("http://example.com".to_string()))).unwrap_err();
        assert!(err.contains("HTTPS"));
    }

    #[test]
    fn build_s3_operator_rejects_internal_literal_endpoint() {
        let err =
            build_s3_operator(&test_config(Some("https://127.0.0.1".to_string()))).unwrap_err();
        assert!(err.contains("内部或本地"));
    }

    #[test]
    fn build_s3_operator_allows_empty_endpoint() {
        assert!(build_s3_operator(&test_config(None)).is_ok());
    }
}
