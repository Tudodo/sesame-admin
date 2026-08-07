# Sesame Admin (社区版)

企业级后台管理系统脚手架，基于 Rust (Loco) + React + TypeScript 构建。

## 技术栈

**后端**: Rust + [Loco.rs](https://loco.rs) + SeaORM + PostgreSQL + Redis

**前端**: React + TypeScript + shadcn/ui (Radix UI + Tailwind CSS) + Rsbuild

## 核心功能

- 用户与权限: RBAC 角色权限、多租户、部门数据权限、岗位管理
- 系统管理: 菜单、字典、通知、定时任务、数据同步、代码生成
- 主题系统: 默认 / Tudodo / Ant Design / LayUI 四套主题，支持暗色模式
- 基础设施: 缓存管理、任务队列、服务器监控、在线用户、操作日志

## 快速开始

### 环境要求

- Rust 1.95+ (推荐 rustup 管理)
- Node.js 18+ 与 npm
- PostgreSQL 14+
- Redis 6+

### 1. 启动数据库

```sh
docker compose up -d postgres redis
```

### 2. 配置环境变量

```sh
cp .env.example .env
# 编辑 .env，修改数据库密码、JWT 密钥等
```

### 3. 启动后端

```sh
cargo loco start
```

后端默认监听 `http://0.0.0.0:5150`，首次启动会自动执行数据库迁移。

### 4. 启动前端

```sh
cd frontend
npm install
npm run dev
```

前端开发服务器默认监听 `http://localhost:3000`。

### 5. 运行测试

测试需要独立的测试数据库，避免清空开发数据:

```sh
createdb sesame_test
DATABASE_URL=postgres://postgres:your-password@127.0.0.1:5432/sesame_test cargo test --all-features --all
```

将 `your-password` 替换为 `.env` 中配置的 `DB_PASSWORD`。

## 项目结构

```
src/                  后端业务代码 (控制器、模型、中间件、任务)
migration/            SeaORM 数据库迁移
frontend/             React 前端
config/               环境配置 (development / test / production)
loco-rs-patched/      Loco 框架补丁 (移除 SQLite 依赖)
```

## 开发指南

- 代码格式化: `cargo fmt --all`
- Lint: `cargo clippy --all-features -- -D warnings`
- 前端 Lint: `cd frontend && npm run lint`
- 前端构建: `cd frontend && npm run build`

## 开源许可

[Apache License 2.0](LICENSE)

## 贡献

欢迎提交 Issue 和 Pull Request。提交前请确保:

- `cargo fmt --all -- --check` 通过
- `cargo check --all-features` 通过
- `cd frontend && npm run lint` 通过
- `cd frontend && npm run build` 通过
