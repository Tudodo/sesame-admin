use crate::data::permissions::require_platform_admin;
use crate::middleware::tenant::TenantScope;
use axum::Extension;
use loco_rs::prelude::*;
use sea_orm::{ConnectionTrait, DatabaseBackend, Statement};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Serialize)]
struct TableInfo {
    name: String,
    comment: String,
    columns: Vec<ColumnInfo>,
}

#[derive(Serialize)]
struct ColumnInfo {
    name: String,
    data_type: String,
    is_nullable: bool,
    is_primary_key: bool,
    column_default: Option<String>,
    comment: String,
    max_length: Option<u32>,
}

#[derive(Deserialize)]
struct GenerateRequest {
    table_name: String,
    #[allow(dead_code)]
    module_name: String,
    #[allow(dead_code)]
    business_name: String,
    #[allow(dead_code)]
    function_name: String,
    selected_columns: Option<Vec<String>>,
}

#[debug_handler]
async fn list_tables(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_platform_admin(
        &auth,
        &tenant.code,
        "system:codegen:read",
        "代码生成仅对平台租户管理员开放",
    )?;
    let tables = get_pg_tables(&ctx.db).await.map_err(|e| {
        tracing::error!(error = %e, "codegen list_tables query failed");
        Error::InternalServerError
    })?;
    format::json(tables)
}

#[debug_handler]
async fn preview(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(req): Json<GenerateRequest>,
) -> Result<Response> {
    require_platform_admin(
        &auth,
        &tenant.code,
        "system:codegen:create",
        "代码生成仅对平台租户管理员开放",
    )?;
    // Validate table name: only alphanumeric + underscore to prevent path traversal
    // and code injection in generated file paths and templates.
    if req.table_name.is_empty()
        || req.table_name.len() > 63
        || !req
            .table_name
            .chars()
            .all(|c| c.is_alphanumeric() || c == '_')
    {
        return Err(Error::BadRequest("无效的表名".to_string()));
    }
    let columns = get_table_columns_inner(&ctx.db, &req.table_name)
        .await
        .map_err(|e| Error::Message(e.to_string()))?;
    let selected: Vec<ColumnInfo> = match &req.selected_columns {
        Some(names) if !names.is_empty() => {
            validate_selected_columns(names, &columns).map_err(Error::BadRequest)?;
            columns
                .into_iter()
                .filter(|c| names.contains(&c.name))
                .collect()
        }
        _ => columns,
    };
    let selected_refs: Vec<&ColumnInfo> = selected.iter().collect();
    let code = generate_code(&req, &selected_refs);
    format::json(serde_json::json!({
        "table": req.table_name,
        "columns": selected,
        "files": code,
    }))
}

/// Validate requested column names before code generation. Column names are
/// used as Rust/TS identifiers and as SQL identifiers in generated templates,
/// so they must be safe identifiers and must exist on the selected table.
fn validate_selected_columns(names: &[String], columns: &[ColumnInfo]) -> Result<(), String> {
    if names.is_empty() {
        return Ok(());
    }
    let mut seen = HashSet::with_capacity(names.len());
    for name in names {
        if name.is_empty()
            || name.len() > 63
            || !name.chars().all(|c| c.is_alphanumeric() || c == '_')
        {
            return Err(format!("Invalid selected column name: {name}"));
        }
        if !seen.insert(name) {
            return Err(format!("Duplicate selected column name: {name}"));
        }
        if !columns.iter().any(|c| c.name == *name) {
            return Err(format!("Selected column not found: {name}"));
        }
    }
    Ok(())
}

async fn get_pg_tables(db: &sea_orm::DatabaseConnection) -> Result<Vec<TableInfo>, DbErr> {
    let sql =
        "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename";
    let stmt = Statement::from_string(DatabaseBackend::Postgres, sql);
    let results = db.query_all(stmt).await?;
    let mut tables = Vec::new();
    for row in results {
        let name: String = row.try_get("", "tablename")?;
        let columns = match get_table_columns_inner(db, &name).await {
            Ok(c) => c,
            Err(_) => continue,
        };
        let comment = format!("{}表", name);
        tables.push(TableInfo {
            name,
            comment,
            columns,
        });
    }
    Ok(tables)
}

async fn get_table_columns_inner(
    db: &sea_orm::DatabaseConnection,
    table: &str,
) -> Result<Vec<ColumnInfo>, DbErr> {
    let sql = concat!(
        "SELECT c.column_name, c.data_type, c.is_nullable, c.column_default, c.character_maximum_length, ",
        "tc.constraint_type, pgd.description as col_comment ",
        "FROM information_schema.columns c ",
        "LEFT JOIN information_schema.key_column_usage kcu ON c.table_schema=kcu.table_schema AND c.table_name=kcu.table_name AND c.column_name=kcu.column_name ",
        "LEFT JOIN information_schema.table_constraints tc ON kcu.constraint_schema=tc.constraint_schema AND kcu.constraint_name=tc.constraint_name AND tc.constraint_type='PRIMARY KEY' ",
        "LEFT JOIN pg_catalog.pg_statio_all_tables st ON c.table_schema=st.schemaname AND c.table_name=st.relname ",
        "LEFT JOIN pg_catalog.pg_description pgd ON pgd.objoid=st.relid AND pgd.objsubid=c.ordinal_position ",
        "WHERE c.table_schema='public' AND c.table_name=$1 ORDER BY c.ordinal_position"
    );
    let stmt = Statement::from_sql_and_values(DatabaseBackend::Postgres, sql, [table.into()]);
    let results = db.query_all(stmt).await?;
    let mut columns = Vec::new();
    for row in results {
        let name: String = row.try_get("", "column_name")?;
        let data_type: String = row.try_get("", "data_type")?;
        let is_nullable_str: String = row.try_get("", "is_nullable")?;
        let column_default: Option<String> = row.try_get("", "column_default").ok();
        let max_length: Option<i32> = row.try_get("", "character_maximum_length").ok().flatten();
        let constraint_type: Option<String> = row.try_get("", "constraint_type").ok().flatten();
        let comment: Option<String> = row.try_get("", "col_comment").ok().flatten();
        columns.push(ColumnInfo {
            name,
            data_type,
            is_nullable: is_nullable_str == "YES",
            is_primary_key: constraint_type.as_deref() == Some("PRIMARY KEY"),
            column_default,
            comment: comment.unwrap_or_default(),
            max_length: max_length.map(|n| n as u32),
        });
    }
    Ok(columns)
}

fn generate_code(req: &GenerateRequest, columns: &[&ColumnInfo]) -> Vec<GeneratedFile> {
    let table = &req.table_name;
    let struct_name = to_pascal_case(table);
    let page_component_name = to_pascal_case(&struct_name);
    let mut files = Vec::new();

    let migration_name = format!("m20260101_000001_create_{}", table);
    files.push(GeneratedFile {
        path: format!("migration/src/{}.rs", migration_name),
        content: generate_migration(table, columns, &migration_name, &struct_name),
    });
    files.push(GeneratedFile {
        path: format!("src/models/_entities/{}.rs", table),
        content: generate_entity(table, columns, &struct_name),
    });
    files.push(GeneratedFile {
        path: format!("src/controllers/{}.rs", table),
        content: generate_controller(table, &struct_name),
    });
    files.push(GeneratedFile {
        path: format!("frontend/src/pages/{}.tsx", page_component_name),
        content: generate_frontend_page(table, columns, &struct_name, &req.business_name),
    });
    files
}

fn generate_migration(
    _table: &str,
    columns: &[&ColumnInfo],
    migration_name: &str,
    struct_name: &str,
) -> String {
    let mut col_defs = String::new();
    let mut iden_variants = String::new();
    for c in columns {
        let pascal = to_pascal_case(&c.name);
        let col_type = map_pg_to_seaql(&c.data_type, c.is_nullable);
        let pk = if c.is_primary_key {
            ".primary_key()"
        } else {
            ""
        };
        let null = if c.is_nullable && !c.is_primary_key {
            ".null()"
        } else {
            ".not_null()"
        };
        let default_str = match &c.column_default {
            // `Debug` for `str` emits a valid Rust string literal, so PostgreSQL
            // default expressions containing quotes/control characters cannot break
            // the generated migration source.
            Some(def) => format!(".default({def:?})"),
            None => String::new(),
        };

        col_defs.push_str(&format!(
            "                .col(ColumnDef::new({sn}::{pascal}).{col_type}{null}{pk}{default_str})\n",
            sn = struct_name, pascal = pascal, col_type = col_type, null = null, pk = pk, default_str = default_str
        ));
        iden_variants.push_str(&format!("    {},\n", pascal));
    }
    let result = [
        "use sea_orm_migration::prelude::*;\n\npub struct Migration;\n\n",
        "impl MigrationName for Migration {\n    fn name(&self) -> &str { \"",
        migration_name,
        "\" }\n}\n\n",
        "#[async_trait::async_trait]\nimpl MigrationTrait for Migration {\n",
        "    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {\n",
        "        manager.create_table(\n            Table::create()\n",
        &format!(
            "                .table({sn}::Table)\n                .if_not_exists()\n",
            sn = struct_name
        ),
        &col_defs,
        "                .to_owned()\n        ).await\n    }\n\n",
        "    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {\n",
        &format!(
            "        manager.drop_table(Table::drop().table({sn}::Table).to_owned()).await\n",
            sn = struct_name
        ),
        "    }\n}\n\n#[derive(Iden)]\n",
        &format!("enum {sn} {{\n    Table,\n", sn = struct_name),
        &iden_variants,
        "}\n",
    ]
    .concat();
    result
}

fn generate_entity(table: &str, columns: &[&ColumnInfo], _struct_name: &str) -> String {
    let mut fields = String::new();
    for c in columns {
        let rust_type = map_pg_to_rust(&c.data_type, c.is_nullable);
        let pk_attr = if c.is_primary_key {
            "\n    #[sea_orm(primary_key)]"
        } else {
            ""
        };
        fields.push_str(&format!(
            "{pk}\n    pub {snake}: {rust_type},\n",
            pk = pk_attr,
            snake = c.name,
            rust_type = rust_type
        ));
    }
    let result = [
        "use sea_orm::entity::prelude::*;\nuse serde::{Deserialize, Serialize};\n\n",
        "#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize)]\n",
        &format!("#[sea_orm(table_name = \"{}\")]\n", table),
        "pub struct Model {\n",
        &fields,
        "}\n\n#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]\npub enum Relation {}\n",
    ]
    .concat();
    result
}

fn generate_controller(table: &str, _struct_name: &str) -> String {
    // Permission code prefix derived from the table name, e.g. "user_orders"
    // -> "system:user-orders". Developers should refine this after generation.
    let perm_prefix = table.replace('_', "-");
    format!(
        r#"use axum::extract::{{Path, Query}};
use axum::Extension;
use loco_rs::prelude::*;
use sea_orm::ActiveModelTrait;
use serde::Deserialize;

use crate::data::permissions::require_perm_code;
use crate::middleware::tenant::TenantScope;
use crate::models::{table} as model;

#[derive(Deserialize)]
struct QueryParams {{
    #[serde(rename = "_start")] start: Option<usize>,
    #[serde(rename = "_end")] end: Option<usize>,
}}

#[derive(Deserialize)]
struct CreateParams {{
    // TODO: fill in fields from the generated entity
    name: Option<String>,
}}

#[derive(Deserialize)]
struct UpdateParams {{
    // TODO: fill in fields from the generated entity
    name: Option<String>,
}}

#[debug_handler]
async fn list(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Query(q): Query<QueryParams>,
) -> Result<Response> {{
    require_perm_code(&auth, "{perm_prefix}:read")?;
    let (start, end) = crate::data::page_range(q.start, q.end);
    let limit = end.saturating_sub(start).clamp(1, 500);
    let (items, total) =
        model::Model::list_paginated(&ctx.db, &tenant.code, start as u64, limit as u64)
            .await
            .map_err(Error::wrap)?;
    crate::data::paginated_response(&items, total)
}}

#[debug_handler]
async fn get_one(
    auth: auth::JWT,
    Path(id): Path<i64>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {{
    require_perm_code(&auth, "{perm_prefix}:read")?;
    let item = model::Model::find_by_id(&ctx.db, &tenant.code, id)
        .await
        .map_err(Error::wrap)?
        .ok_or(Error::NotFound)?;
    format::json(item)
}}

#[debug_handler]
async fn create(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(params): Json<CreateParams>,
) -> Result<Response> {{
    require_perm_code(&auth, "{perm_prefix}:create")?;
    let m = model::ActiveModel {{
        name: sea_orm::ActiveValue::Set(params.name),
        tenant_id: sea_orm::ActiveValue::Set(Some(tenant.code)),
        ..Default::default()
    }}
    .insert(&ctx.db)
    .await?;
    format::json(m)
}}

#[debug_handler]
async fn update(
    auth: auth::JWT,
    Path(id): Path<i64>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
    Json(params): Json<UpdateParams>,
) -> Result<Response> {{
    require_perm_code(&auth, "{perm_prefix}:update")?;
    let item = model::Model::find_by_id(&ctx.db, &tenant.code, id)
        .await
        .map_err(Error::wrap)?
        .ok_or(Error::NotFound)?;
    let mut a = item.into_active_model();
    a.name = sea_orm::ActiveValue::Set(params.name);
    format::json(a.update(&ctx.db).await?)
}}

#[debug_handler]
async fn remove(
    auth: auth::JWT,
    Path(id): Path<i64>,
    State(ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {{
    require_perm_code(&auth, "{perm_prefix}:delete")?;
    model::Model::find_by_id(&ctx.db, &tenant.code, id)
        .await
        .map_err(Error::wrap)?
        .ok_or(Error::NotFound)?
        .delete(&ctx.db)
        .await?;
    format::json(serde_json::json!({{"ok": true}}))
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
        table = table,
        perm_prefix = perm_prefix
    )
}

fn generate_frontend_page(
    table: &str,
    columns: &[&ColumnInfo],
    struct_name: &str,
    business_name: &str,
) -> String {
    // Build a TypeScript interface from the selected columns so the generated
    // page is type-safe out of the box (the previous output only declared
    // `id: number` and left every column untyped).
    let mut ts_fields = String::from("  id: number;\n");
    for c in columns {
        if c.is_primary_key {
            continue;
        }
        let ts_type = match c.data_type.as_str() {
            "integer" | "int4" | "int2" | "smallint" | "bigint" | "int8" => "number",
            "boolean" | "bool" => "boolean",
            "double precision" | "float8" | "real" | "float4" => "number",
            _ => "string",
        };
        let optional = if c.is_nullable { " | null" } else { "" };
        ts_fields.push_str(&format!(
            "  {name}: {ts_type}{opt};\n",
            name = c.name,
            ts_type = ts_type,
            opt = optional
        ));
    }

    // Build tanstack ColumnDef entries. Skip the PK (rendered implicitly by
    // DataTable) and skip tenant_id/create/update timestamps.
    let skip = |name: &str| {
        matches!(
            name,
            "id" | "tenant_id" | "created_at" | "updated_at" | "create_time" | "update_time"
        )
    };
    let mut col_defs = String::new();
    for c in columns {
        if skip(&c.name) {
            continue;
        }
        let title = if c.comment.is_empty() {
            &c.name
        } else {
            &c.comment
        };
        col_defs.push_str(&format!(
            "    {{\n      accessorKey: \"{name}\",\n      header: \"{title}\",\n      cell: ({{ row }}) =>\n        row.original.{name} != null ? (\n          <span>{{row.original.{name}}}</span>\n        ) : (\n          <span className=\"text-muted-foreground\">-</span>\n        ),\n    }},\n",
            name = c.name,
            title = title
        ));
    }

    format!(
        r#"import {{ DataTable }} from "@/components/data-table";
import {{ Button }} from "@/components/ui/button";
import {{
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
}} from "@/components/ui/dialog";
import {{ Input }} from "@/components/ui/input";
import {{ Label }} from "@/components/ui/label";
import {{ confirm }} from "@/lib/confirm";
import {{ message }} from "@/lib/message";
import {{ create, getList, remove, update }} from "@/services/api";
import type {{ ColumnDef }} from "@tanstack/react-table";
import {{ Pencil, Plus, Trash2 }} from "lucide-react";
import {{ useCallback, useEffect, useState }} from "react";

interface {sn}Item {{
{ts_fields}}}

export const {sn}Page = () => {{
  const [data, setData] = useState<{sn}Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<{sn}Item | null>(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {{
    setLoading(true);
    try {{
      const res = await getList<{sn}Item>("{table}", {{
        _start: 0,
        _end: 999,
      }});
      setData(res.data);
    }} catch (e: unknown) {{
      if (e instanceof Error) message.error(`加载失败: ${{e.message}}`);
    }}
    setLoading(false);
  }}, []);

  useEffect(() => {{
    loadData();
  }}, [loadData]);

  const openAdd = () => {{
    setEditing(null);
    setName("");
    setModalOpen(true);
  }};

  const openEdit = (record: {sn}Item) => {{
    setEditing(record);
    setName(record.name ?? "");
    setModalOpen(true);
  }};

  const handleSubmit = async () => {{
    setSubmitting(true);
    try {{
      if (editing) {{
        await update("{table}", editing.id, {{ name }});
        message.success("已更新");
      }} else {{
        await create("{table}", {{ name }});
        message.success("已创建");
      }}
      setModalOpen(false);
      loadData();
    }} catch (e: unknown) {{
      message.error(e instanceof Error ? e.message : "操作失败");
    }} finally {{
      setSubmitting(false);
    }}
  }};

  const handleDelete = async (record: {sn}Item) => {{
    const ok = await confirm({{ title: "确定删除？", okVariant: "destructive" }});
    if (!ok) return;
    try {{
      await remove("{table}", record.id);
      message.success("已删除");
      loadData();
    }} catch (e: unknown) {{
      message.error(e instanceof Error ? e.message : "删除失败");
    }}
  }};

  const columns: ColumnDef<{sn}Item>[] = [
{col_defs}    {{
      id: "actions",
      header: "操作",
      cell: ({{ row }}) => (
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={{() => openEdit(row.original)}}
          >
            <Pencil className="size-3.5" /> 编辑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={{() => handleDelete(row.original)}}
          >
            <Trash2 className="size-3.5" /> 删除
          </Button>
        </div>
      ),
    }},
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{business}</h2>
        <Button onClick={{openAdd}}>
          <Plus className="size-4" /> 新建
        </Button>
      </div>
      <DataTable columns={{columns}} data={{data}} pageSize={{20}} />

      <Dialog open={{modalOpen}} onOpenChange={{setModalOpen}}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{{editing ? "编辑" : "新建"}}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="name">名称</Label>
              <Input
                id="name"
                value={{name}}
                onChange={{(e) => setName(e.target.value)}}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={{() => setModalOpen(false)}}
            >
              取消
            </Button>
            <Button onClick={{handleSubmit}} disabled={{submitting}}>
              {{submitting ? "提交中..." : "保存"}}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}};
"#,
        sn = struct_name,
        ts_fields = ts_fields,
        table = table,
        col_defs = col_defs,
        business = business_name
    )
}

#[derive(Serialize)]
struct GeneratedFile {
    path: String,
    content: String,
}

fn to_pascal_case(s: &str) -> String {
    s.split('_')
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
            }
        })
        .collect()
}

fn map_pg_to_seaql(pg_type: &str, _nullable: bool) -> &str {
    match pg_type {
        "integer" | "int4" => "integer()",
        "bigint" | "int8" => "big_integer()",
        "smallint" | "int2" => "small_integer()",
        "boolean" | "bool" => "boolean()",
        "text" | "varchar" | "character varying" | "char" => "string()",
        "timestamp with time zone" | "timestamptz" => "timestamp_with_time_zone()",
        "timestamp" | "timestamp without time zone" => "timestamp()",
        "date" => "date()",
        "double precision" | "float8" => "double()",
        "real" | "float4" => "float()",
        "uuid" => "uuid()",
        "json" | "jsonb" => "json_binary()",
        _ => "string()",
    }
}

fn map_pg_to_rust(pg_type: &str, nullable: bool) -> String {
    let base = match pg_type {
        "integer" | "int4" | "int2" | "smallint" => "i32",
        "bigint" | "int8" => "i64",
        "boolean" | "bool" => "bool",
        "text" | "varchar" | "character varying" | "char" => "String",
        "timestamp with time zone" | "timestamptz" => "DateTimeWithTimeZone",
        "timestamp" | "timestamp without time zone" => "DateTime",
        "date" => "Date",
        "double precision" | "float8" | "real" | "float4" => "f64",
        "uuid" => "Uuid",
        "json" | "jsonb" => "Json",
        _ => "String",
    };
    if nullable {
        format!("Option<{}>", base)
    } else {
        base.to_string()
    }
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/codegen")
        .add("/tables", get(list_tables))
        .add("/preview", post(preview))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_column(name: &str) -> ColumnInfo {
        ColumnInfo {
            name: name.to_string(),
            data_type: "text".to_string(),
            is_nullable: true,
            is_primary_key: false,
            column_default: None,
            comment: String::new(),
            max_length: None,
        }
    }

    #[test]
    fn selected_columns_accepts_existing_safe_names() {
        let columns = vec![test_column("id"), test_column("name")];
        assert!(
            validate_selected_columns(&["id".to_string(), "name".to_string()], &columns).is_ok()
        );
        assert!(validate_selected_columns(&[], &columns).is_ok());
    }

    #[test]
    fn selected_columns_rejects_missing_or_unsafe_names() {
        let columns = vec![test_column("id")];
        assert!(validate_selected_columns(&["missing".to_string()], &columns).is_err());
        assert!(validate_selected_columns(&["bad-name".to_string()], &columns).is_err());
        assert!(validate_selected_columns(&["x".repeat(64)], &columns).is_err());
        assert!(
            validate_selected_columns(&["id".to_string(), "id".to_string()], &columns).is_err()
        );
    }

    #[test]
    fn migration_defaults_escape_rust_string_literals() {
        let mut column = test_column("payload");
        let mut default = String::from("quoted");
        default.insert(0, '"');
        default.push('"');
        default.push('\n');
        default.push_str("line");
        column.column_default = Some(default);
        let migration = generate_migration(
            "escaped_defaults",
            &[&column],
            "m20260101_000001_create_escaped_defaults",
            "EscapedDefaults",
        );
        assert!(migration.contains(".default(\"\\\"quoted\\\"\\nline\")"));
        assert!(!migration.contains("\"quoted\"\nline"));
    }
}
