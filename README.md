# Sesame Admin (社区版)

企业级后台管理系统脚手架，基于 Rust (Loco) + React + TypeScript 构建。

## 技术栈

**后端**: Rust + [Loco.rs](https://loco.rs) + SeaORM + PostgreSQL + Redis

**前端**: React + TypeScript + shadcn/ui (Radix UI + Tailwind CSS) + Rsbuild

## 核心功能

- 用户与权限: RBAC 角色权限、多租户、部门数据权限、岗位管理
- 系统管理: 菜单、字典、通知、定时任务、数据同步、代码生成
- 文件管理: 本地/S3 存储配置、文件上传下载
- 运维中心: 缓存管理、任务队列、服务器监控、在线用户、操作日志、登录日志、页面配置
- 主题系统: 默认 / Tudodo / Ant Design / LayUI 四套主题，支持暗色模式

## 社区版 / 商业版功能边界

本仓库是 MIT 开源的 Sesame Admin 社区版，只包含上述基础管理能力。

商业版（Sesame Admin Enterprise）在社区版基础上额外提供：

- 流程引擎：BPMN 可视化设计、流程定义/实例、我的待办/申请、审批/驳回/加签/委派/转办、条件网关
- 表单定制：表单设计器、表单模板、动态表单与表单快照
- 智能助手：Web Agent 页面接入与服务端反代
- 数据与运营：演示模式、默认演示账号、每日 00:00 快照还原、Excel 导入导出
- 企业能力：人大金仓/达梦数据库适配、安全响应头加固、异常兜底、分区维护

### 在线演示

- 地址: <https://sesame.swipath.com/>
- 演示账号: `admin@swipath.com` / `123456`
- 说明: 演示数据每天北京时间 00:00 自动还原，请勿录入真实业务数据。

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

[MIT License](LICENSE)

## 贡献

欢迎提交 Issue 和 Pull Request。提交前请确保:

- `cargo fmt --all -- --check` 通过
- `cargo check --all-features` 通过
- `cd frontend && npm run lint` 通过
- `cd frontend && npm run build` 通过
