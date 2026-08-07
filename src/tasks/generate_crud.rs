use loco_rs::prelude::*;
use std::fs;

/// Code generation task: scaffold CRUD for an entity.
///
/// Usage: `cargo loco task generate_crud -- --name Product --table products --resource products`
///
/// This generates:
/// - `migration/src/m{timestamp}_{table}.rs`
/// - `src/models/_entities/{table}.rs`
/// - `src/controllers/{table}.rs`
/// - `frontend/src/pages/{Name}.tsx`
///
/// Manual steps after generation:
/// 1. Add migration to `migration/src/lib.rs`
/// 2. Add entity to `src/models/_entities/mod.rs`
/// 3. Add controller to `src/controllers/mod.rs` and `src/app.rs`
/// 4. Add page to `frontend/src/App.tsx`
pub struct GenerateCrud;
#[async_trait]
impl Task for GenerateCrud {
    fn task(&self) -> TaskInfo {
        TaskInfo {
            name: "generate_crud".to_string(),
            detail: "Generate CRUD scaffold for a database entity".to_string(),
        }
    }

    async fn run(&self, _ctx: &AppContext, vars: &task::Vars) -> Result<()> {
        let name = vars.cli_arg("name")?.to_string();
        let table = vars.cli_arg("table")?.to_string();
        let resource = vars.cli_arg("resource")?.to_string();
        let project_root = std::env::current_dir().map_err(|e| Error::string(&e.to_string()))?;

        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");

        // 1. Migration file
        let mig_path = project_root
            .join("migration/src")
            .join(format!("m{}_{}.rs", timestamp, table));
        let mig_content = migration_template(&table);
        fs::write(&mig_path, mig_content).map_err(|e| Error::string(&e.to_string()))?;
        println!("✓ Created migration: {}", mig_path.display());

        // 2. Entity file
        let entity_path = project_root
            .join("src/models/_entities")
            .join(format!("{}.rs", table));
        let entity_content = entity_template(&table, &name);
        fs::write(&entity_path, entity_content).map_err(|e| Error::string(&e.to_string()))?;
        println!("✓ Created entity: {}", entity_path.display());

        // 3. Controller file
        let ctrl_path = project_root
            .join("src/controllers")
            .join(format!("{}.rs", table));
        let ctrl_content = controller_template(&table, &name, &resource);
        fs::write(&ctrl_path, ctrl_content).map_err(|e| Error::string(&e.to_string()))?;
        println!("✓ Created controller: {}", ctrl_path.display());

        // 3b. Model file
        let model_path = project_root
            .join("src/models")
            .join(format!("{}.rs", table));
        let model_content = model_template(&table, &name);
        fs::write(&model_path, model_content).map_err(|e| Error::string(&e.to_string()))?;
        println!("✓ Created model: {}", model_path.display());

        // 4. Frontend page
        let page_path = project_root
            .join("frontend/src/pages")
            .join(format!("{}.tsx", name));
        let page_content = page_template(&name, &table, &resource);
        fs::write(&page_path, page_content).map_err(|e| Error::string(&e.to_string()))?;
        println!("✓ Created frontend page: {}", page_path.display());

        println!("\n📋 Manual registration steps:");
        println!("  0. Add `pub mod {};` to src/models/mod.rs", table);
        println!(
            "  1. Add `mod m{}_{};` to migration/src/lib.rs",
            timestamp, table
        );
        println!(
            "  2. Add `Box::new(m{}_{}::Migration)` to the migrations vec",
            timestamp, table
        );
        println!(
            "  3. Add `pub mod {};` to src/models/_entities/mod.rs",
            table
        );
        println!("  4. Add `pub mod {};` to src/controllers/mod.rs", table);
        println!(
            "  5. Add `.add_route(controllers::{}::routes())` to src/app.rs",
            table
        );
        println!("  6. Add page to pageMap in frontend/src/App.tsx");
        Ok(())
    }
}

fn migration_template(table: &str) -> String {
    format!(
        r#"use sea_orm_migration::prelude::*;


#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {{
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {{
        manager
            .create_table(
                Table::create()
                    .table({table}::Table)
                    .if_not_exists()
                    .col(ColumnDef::new({table}::Id).integer().not_null().auto_increment().primary_key())
                    .col(ColumnDef::new({table}::Name).string().not_null())
                    .col(ColumnDef::new({table}::TenantId).string().null())
                    .col(ColumnDef::new({table}::CreatedAt).timestamp_with_time_zone().not_null().default(Expr::current_timestamp()))
                    .col(ColumnDef::new({table}::UpdatedAt).timestamp_with_time_zone().not_null().default(Expr::current_timestamp()))
                    .to_owned(),
            )
            .await
    }}

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {{
        manager.drop_table(Table::drop().table({table}::Table).to_owned()).await
    }}
}}

#[derive(Iden)]
enum {table} {{
    Table,
    Id,
    Name,
    TenantId,
    CreatedAt,
    UpdatedAt,
}}
"#,
        table = table
    )
}

fn entity_template(table: &str, _name: &str) -> String {
    // Convert table name to PascalCase module prefix
    let _pascal = table
        .split('_')
        .map(|w| {
            let mut c = w.chars();
            c.next()
                .map(|f| f.to_uppercase().to_string() + w[1..].as_ref())
                .unwrap_or_default()
        })
        .collect::<String>();

    format!(
        r#"use sea_orm::entity::prelude::*;
use serde::{{Deserialize, Serialize}};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize)]
#[sea_orm(table_name = "{table}")]
pub struct Model {{
    #[sea_orm(primary_key)]
    pub id: i32,
    pub name: String,
    pub tenant_id: Option<String>,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {{}}

impl ActiveModelBehavior for ActiveModel {{}}
"#,
        table = table
    )
}

fn controller_template(table: &str, name: &str, resource: &str) -> String {
    // Generate a model file path too
    let model_mod = format!("crate::models::{}", table);
    format!(
        r#"use {model_mod} as model;
use crate::data::permissions::require_perm_code;
use crate::middleware::tenant::TenantScope;
use axum::Extension;
use loco_rs::prelude::*;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct {name}Upsert {{
    pub name: String,
}}

#[derive(Deserialize)]
struct QueryParams {{
    #[serde(rename = "_start")] start: Option<usize>,
    #[serde(rename = "_end")] end: Option<usize>,
}}

#[debug_handler]
async fn list(_auth: auth::JWT, State(ctx): State<AppContext>, Extension(tenant): Extension<TenantScope>, Query(q): Query<QueryParams>) -> Result<Response> {{
    require_perm_code(&_auth, "{resource}:read")?;
    let (start, limit) = crate::data::page_range(q.start, q.end);
    let (items, total) = model::Model::list_paginated(&ctx.db, &tenant.code, start as u64, limit as u64).await.map_err(Error::wrap)?;
    crate::data::paginated_response(&items, total)
}}

#[debug_handler]
async fn get_one(_auth: auth::JWT, Path(id): Path<i32>, State(ctx): State<AppContext>, Extension(tenant): Extension<TenantScope>) -> Result<Response> {{
    require_perm_code(&_auth, "{resource}:read")?;
    let item = model::Model::find_by_id_in_tenant(&ctx.db, id, &tenant.code).await.map_err(Error::wrap)?;
    format::json(item)
}}

#[debug_handler]
async fn create(auth: auth::JWT, State(ctx): State<AppContext>, Extension(tenant): Extension<TenantScope>, Json(p): Json<{name}Upsert>) -> Result<Response> {{
    require_perm_code(&auth, "{resource}:create")?;
    let m = model::Model::create(&ctx.db, &p.name, &tenant.code).await.map_err(Error::wrap)?;
    format::json(m)
}}

#[debug_handler]
async fn update(auth: auth::JWT, Path(id): Path<i32>, State(ctx): State<AppContext>, Extension(tenant): Extension<TenantScope>, Json(p): Json<{name}Upsert>) -> Result<Response> {{
    require_perm_code(&auth, "{resource}:update")?;
    let updated = model::Model::update_name(&ctx.db, id, &p.name, &tenant.code).await.map_err(Error::wrap)?;
    format::json(updated)
}}

#[debug_handler]
async fn remove(auth: auth::JWT, Path(id): Path<i32>, State(ctx): State<AppContext>, Extension(tenant): Extension<TenantScope>) -> Result<Response> {{
    require_perm_code(&auth, "{resource}:delete")?;
    model::Model::delete_in_tenant(&ctx.db, id, &tenant.code).await.map_err(Error::wrap)?;
    format::empty()
}}

pub fn routes() -> Routes {{
    Routes::new()
        .prefix("api/{table}")
        .add("/", get(list))
        .add("/", post(create))
        .add("/{{id}}", get(get_one))
        .add("/{{id}}", put(update))
        .add("/{{id}}", delete(remove))
}}
"#,
        name = name,
        table = table,
        model_mod = model_mod
    )
}

fn model_template(table: &str, _name: &str) -> String {
    format!(
        r#"use loco_rs::prelude::*;
use sea_orm::{{ActiveValue::Set, ColumnTrait, EntityTrait, Order, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect}};

pub use super::_entities::{table}::{{self, ActiveModel, Entity, Model}};

impl Model {{
    pub async fn find_by_id_in_tenant(db: &DatabaseConnection, id: i32, tenant_code: &str) -> ModelResult<Self> {{
        Entity::find_by_id(id)
            .filter({table}::Column::TenantId.eq(tenant_code))
            .one(db).await?.ok_or_else(|| ModelError::EntityNotFound)
    }}

    pub async fn list_paginated(db: &DatabaseConnection, tenant_code: &str, offset: u64, limit: u64) -> ModelResult<(Vec<Self>, u64)> {{
        let find = Entity::find().filter({table}::Column::TenantId.eq(tenant_code));
        let total = find.clone().count(db).await.map_err(ModelError::from)?;
        let items = find.order_by({table}::Column::Id, Order::Asc).offset(offset).limit(limit).all(db).await.map_err(ModelError::from)?;
        Ok((items, total))
    }}

    pub async fn create(db: &DatabaseConnection, name: &str, tenant_code: &str) -> ModelResult<Self> {{
        let now = chrono::Utc::now().into();
        ActiveModel {{
            name: Set(name.to_string()),
            tenant_id: Set(Some(tenant_code.to_string())),
            created_at: Set(now),
            updated_at: Set(now),
            ..Default::default()
        }}.insert(db).await.map_err(ModelError::from)
    }}

    pub async fn update_name(db: &DatabaseConnection, id: i32, name: &str, tenant_code: &str) -> ModelResult<Self> {{
        let item = Self::find_by_id_in_tenant(db, id, tenant_code).await?;
        let mut a = item.into_active_model();
        a.name = Set(name.to_string());
        a.updated_at = Set(chrono::Utc::now().into());
        a.update(db).await.map_err(ModelError::from)
    }}

    pub async fn delete_in_tenant(db: &DatabaseConnection, id: i32, tenant_code: &str) -> ModelResult<()> {{
        let item = Self::find_by_id_in_tenant(db, id, tenant_code).await?;
        item.delete(db).await.map_err(ModelError::from)?;
        Ok(())
    }}
}}

impl ActiveModelBehavior for ActiveModel {{}}
"#,
        table = table
    )
}

fn page_template(name: &str, _table: &str, resource: &str) -> String {
    format!(
        r#"import {{ useEffect, useState }} from "react";
import {{ Button }} from "@/components/ui/button";
import {{ Input }} from "@/components/ui/input";
import {{ Label }} from "@/components/ui/label";
import {{ Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle }} from "@/components/ui/dialog";
import {{ message }} from "@/lib/message";
import {{ request }} from "@/services/api";

interface {name}Item {{
  id: number; name: string;
  created_at: string; updated_at: string;
}}

export function {name}Page() {{
  const [items, setItems] = useState<{name}Item[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{name}Item | null>(null);
  const [name, setName] = useState("");

  const load = async () => {{
    const res = await request<{name}Item[]>("/{resource}?_start=0&_end=100");
    setItems(res);
  }};

  useEffect(() => {{ load(); }}, []);

  const handleSubmit = async () => {{
    if (editing) {{
      await request(`/{resource}/${{editing.id}}`, {{ method: "PUT", body: JSON.stringify({{ name }}) }});
      message.success("更新成功");
    }} else {{
      await request("/{resource}", {{ method: "POST", body: JSON.stringify({{ name }}) }});
      message.success("创建成功");
    }}
    setOpen(false);
    load();
  }};

  const handleDelete = async (id: number) => {{
    await request(`/{resource}/${{id}}`, {{ method: "DELETE" }});
    message.success("删除成功");
    load();
  }};

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{name}管理</h1>
        <Button onClick={{() => {{ setEditing(null); setName(""); setOpen(true); }}}}>新建</Button>
      </div>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2 text-left">ID</th>
              <th className="p-2 text-left">名称</th>
              <th className="p-2 text-left">创建时间</th>
              <th className="p-2 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {{items.map((item) => (
              <tr key={{item.id}} className="border-t">
                <td className="p-2">{{item.id}}</td>
                <td className="p-2">{{item.name}}</td>
                <td className="p-2">{{item.created_at}}</td>
                <td className="p-2">
                  <Button variant="ghost" size="sm" onClick={{() => {{ setEditing(item); setName(item.name); setOpen(true); }}}}>编辑</Button>
                  <Button variant="ghost" size="sm" onClick={{() => handleDelete(item.id)}}>删除</Button>
                </td>
              </tr>
            ))}}
          </tbody>
        </table>
      </div>
      <Dialog open={{open}} onOpenChange={{setOpen}}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{{editing ? "编辑" : "新建"}}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">名称</Label>
              <Input id="name" value={{name}} onChange={{(e) => setName(e.target.value)}} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={{handleSubmit}}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}}
"#,
        name = name,
        resource = resource
    )
}
