//! 定时任务 handler 注册表。
//!
//! 设计要点（大厂做法）：
//! - handler 是注册到全局注册表里的 trait object，不是用户手输的任意字符串。
//! - 前端新建/编辑任务时从 `/scheduled-tasks/handlers` 拉取已注册 handler 列表做下拉，
//!   不允许手输，避免"点了触发但没真正执行"的假成功。
//! - `trigger_task` 从注册表按名查找 handler 真实执行，写真实成败日志。
//! - cron 调度器暂不内置：Loco 已有 job executor，外部 cron 也可调 trigger API。
//!   这样不重复造调度器，又保证了"触发即真执行"。
//!
//! 新增可调度逻辑时：实现 `ScheduledHandler` trait，在 `register_defaults` 里注册即可。

use std::collections::HashMap;
use std::sync::OnceLock;

use async_trait::async_trait;
use loco_rs::{app::AppContext, Result};
use serde::{Deserialize, Serialize};

/// handler 执行输出。写进 scheduled_task_log 的 output 字段。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandlerOutput {
    /// 人类可读的执行结果摘要。
    pub message: String,
    /// 影响行数等结构化指标，可选。
    pub metrics: Option<serde_json::Value>,
}

impl HandlerOutput {
    pub fn new(msg: impl Into<String>) -> Self {
        Self {
            message: msg.into(),
            metrics: None,
        }
    }

    #[allow(dead_code)]
    pub fn with_metrics(mut self, m: serde_json::Value) -> Self {
        self.metrics = Some(m);
        self
    }
}

/// 定时任务 handler trait。
/// 实现者封装一段可调度业务逻辑，由注册表统一调度。
#[async_trait]
pub trait ScheduledHandler: Send + Sync {
    /// handler 唯一标识，对应 scheduled_task.handler 字段。建议 snake_case。
    fn name(&self) -> &'static str;
    /// 展示名（前端下拉用）。
    fn display_name(&self) -> &'static str;
    /// 描述。
    fn description(&self) -> &'static str;
    /// 真实执行。params 来自 scheduled_task.params（JSON）。
    async fn run(
        &self,
        ctx: &AppContext,
        params: &serde_json::Value,
        tenant_code: &str,
    ) -> Result<HandlerOutput>;
}

/// 全局注册表。进程启动时一次性注册所有内置 handler。
static REGISTRY: OnceLock<HashMap<&'static str, Box<dyn ScheduledHandler>>> = OnceLock::new();

/// 获取全局注册表（首次访问时初始化）。
pub fn registry() -> &'static HashMap<&'static str, Box<dyn ScheduledHandler>> {
    REGISTRY.get_or_init(|| {
        let mut m: HashMap<&'static str, Box<dyn ScheduledHandler>> = HashMap::new();
        register_defaults(&mut m);
        m
    })
}

/// 注册内置 handler。新增可调度逻辑时在此追加。
fn register_defaults(m: &mut HashMap<&'static str, Box<dyn ScheduledHandler>>) {
    m.insert(
        "cleanup_sessions",
        Box::new(CleanupSessionsHandler) as Box<dyn ScheduledHandler>,
    );
}

/// 列出已注册 handler（前端下拉用）。
pub fn list_handlers() -> Vec<HandlerInfo> {
    registry()
        .values()
        .map(|h| HandlerInfo {
            name: h.name().to_string(),
            display_name: h.display_name().to_string(),
            description: h.description().to_string(),
        })
        .collect()
}

/// 按 name 查找 handler。
pub fn find(name: &str) -> Option<&'static dyn ScheduledHandler> {
    registry().get(name).map(|b| b.as_ref())
}

/// 前端下拉项。
#[derive(Debug, Clone, Serialize)]
pub struct HandlerInfo {
    pub name: String,
    pub display_name: String,
    pub description: String,
}

// ── 内置 handler 实现 ──────────────────────────────────────────

/// 清理过期用户会话。复用 tasks::CleanupSessions 的逻辑。
struct CleanupSessionsHandler;

#[async_trait]
impl ScheduledHandler for CleanupSessionsHandler {
    fn name(&self) -> &'static str {
        "cleanup_sessions"
    }
    fn display_name(&self) -> &'static str {
        "清理过期会话"
    }
    fn description(&self) -> &'static str {
        "删除超过 24 小时的过期用户会话记录"
    }
    async fn run(
        &self,
        ctx: &AppContext,
        _params: &serde_json::Value,
        _tenant_code: &str,
    ) -> Result<HandlerOutput> {
        let deleted = crate::models::user_sessions::Model::cleanup_expired(&ctx.db)
            .await
            .map_err(|e| loco_rs::Error::string(&e.to_string()))?;
        Ok(HandlerOutput::new(format!("已清理 {deleted} 条过期会话")))
    }
}
