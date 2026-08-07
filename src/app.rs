use async_trait::async_trait;
use axum::Router as AxumRouter;
use loco_rs::{
    app::{AppContext, Hooks, Initializer},
    bgworker::{BackgroundWorker, Queue},
    boot::{create_app, BootResult, StartMode},
    config::Config,
    controller::AppRoutes,
    db::{self, truncate_table},
    environment::Environment,
    task::Tasks,
    Result,
};
use migration::Migrator;
use std::path::Path;

use crate::initializers::audit::AuditInitializer;
use crate::initializers::cors::CorsInitializer;
use crate::initializers::tenant::TenantInitializer;
use crate::workers::{mailer, syncer};
#[allow(unused_imports)]
use crate::{controllers, models::_entities::users, tasks, workers::downloader::DownloadWorker};

pub struct App;
#[async_trait]
impl Hooks for App {
    fn app_name() -> &'static str {
        env!("CARGO_CRATE_NAME")
    }

    fn app_version() -> String {
        format!(
            "{} ({})",
            env!("CARGO_PKG_VERSION"),
            option_env!("BUILD_SHA")
                .or(option_env!("GITHUB_SHA"))
                .unwrap_or("dev")
        )
    }

    async fn load_config(env: &Environment) -> Result<Config> {
        let config = env.load()?;
        if matches!(env, Environment::Test) {
            let db_name = config
                .database
                .uri
                .split('?')
                .next()
                .and_then(|uri| uri.rsplit('/').next())
                .unwrap_or_default();
            if db_name != "sesame_test" {
                return Err(loco_rs::Error::Message(format!(
                    "测试环境必须连接隔离数据库 sesame_test，当前为 {db_name}"
                )));
            }
        }
        Ok(config)
    }

    async fn before_run(ctx: &AppContext) -> Result<()> {
        if matches!(ctx.environment, Environment::Test) {
            crate::middleware::rate_limiter::set_disabled(true);
            crate::data::shared_redis::set_test_mode(true);
        }
        Ok(())
    }

    async fn boot(
        mode: StartMode,
        environment: &Environment,
        config: Config,
    ) -> Result<BootResult> {
        if matches!(environment, Environment::Production) {
            if let Some(jwt) = config.auth.as_ref().and_then(|a| a.jwt.as_ref()) {
                if jwt.secret == "change-me-in-production" || jwt.secret.is_empty() {
                    return Err(loco_rs::Error::string(
                        "JWT_SECRET must be set to a strong value in production",
                    ));
                }
            }
            if config.database.uri.contains("postgres:your-password@") {
                return Err(loco_rs::Error::string(
                    "DATABASE_URL must be set to a real connection string in production",
                ));
            }
        }
        if matches!(environment, Environment::Test) {
            let db_name = config
                .database
                .uri
                .split('?')
                .next()
                .and_then(|uri| uri.rsplit('/').next())
                .unwrap_or_default();
            if db_name != "sesame_test" {
                return Err(loco_rs::Error::Message(format!(
                    "测试环境必须连接隔离数据库 sesame_test，当前为 {db_name}"
                )));
            }
        }
        create_app::<Self, Migrator>(mode, environment, config).await
    }

    async fn initializers(_ctx: &AppContext) -> Result<Vec<Box<dyn Initializer>>> {
        Ok(vec![
            Box::new(AuditInitializer),
            Box::new(TenantInitializer),
            Box::new(CorsInitializer),
        ])
    }

    async fn after_routes(router: AxumRouter, ctx: &AppContext) -> Result<AxumRouter> {
        let state = ctx.clone();
        Ok(router
            .layer(axum::middleware::from_fn(
                crate::middleware::csrf::csrf_middleware,
            ))
            .layer(axum::middleware::from_fn_with_state(
                state,
                crate::middleware::session_guard::session_middleware,
            )))
    }

    fn routes(ctx: &AppContext) -> AppRoutes {
        let routes = AppRoutes::with_default_routes()
            .add_route(controllers::auth::routes())
            .add_route(controllers::users::routes())
            .add_route(controllers::roles::routes())
            .add_route(controllers::departments::routes())
            .add_route(controllers::positions::routes())
            .add_route(controllers::menus::routes())
            .add_route(controllers::dictionaries::routes())
            .add_route(controllers::dictionary_entries::routes())
            .add_route(controllers::oper_log::routes())
            .add_route(controllers::login_log::routes())
            .add_route(controllers::sys_config::routes())
            .add_route(controllers::online_users::routes())
            .add_route(controllers::server_monitor::routes())
            .add_route(controllers::cache::routes())
            .add_route(controllers::profile::routes())
            .add_route(controllers::codegen::routes())
            .add_route(controllers::files::routes())
            .add_route(controllers::captcha::routes())
            .add_route(controllers::notifications::routes())
            .add_route(controllers::scheduled_tasks::routes())
            .add_route(controllers::tenants::routes())
            .add_route(controllers::page_configs::routes())
            .add_route(controllers::jobs::routes())
            .add_route(controllers::queue::routes())
            .add_route(controllers::sync_sources::routes());

        if !matches!(ctx.environment, Environment::Production) {
            routes.add_route(controllers::api_docs::routes())
        } else {
            routes
        }
    }
    async fn connect_workers(ctx: &AppContext, queue: &Queue) -> Result<()> {
        queue.register(DownloadWorker::build(ctx)).await?;
        queue.register(mailer::MailerWorker::build(ctx)).await?;
        queue.register(syncer::SyncWorker::build(ctx)).await?;
        Ok(())
    }

    #[allow(unused_variables)]
    fn register_tasks(tasks: &mut Tasks) {
        tasks.register(tasks::generate_crud::GenerateCrud);
        tasks.register(tasks::cleanup_sessions::CleanupSessions);
        tasks.register(tasks::cleanup_logs::CleanupLogs);
    }
    async fn truncate(ctx: &AppContext) -> Result<()> {
        truncate_table(&ctx.db, users::Entity).await?;
        Ok(())
    }
    async fn seed(ctx: &AppContext, base: &Path) -> Result<()> {
        db::seed::<users::ActiveModel>(&ctx.db, &base.join("users.yaml").display().to_string())
            .await?;
        Ok(())
    }
}
