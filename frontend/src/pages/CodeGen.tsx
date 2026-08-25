import { InlineError } from "@/components/InlineError";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFieldErrors } from "@/hooks/useFieldErrors";
import { message } from "@/lib/message";
import { apiFetch } from "@/services/api";
import { can } from "@/services/permission";
import type { ColumnDef } from "@tanstack/react-table";
import { Code, Copy, Loader2, RefreshCw, Search } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

interface ColumnInfo {
  name: string;
  data_type: string;
  is_nullable: boolean;
  is_primary_key: boolean;
  comment: string;
}

interface TableInfo {
  name: string;
  comment: string;
  column_count: number;
}

interface TableListResponse {
  data: TableInfo[];
  total: number;
  page: number;
  page_size: number;
}

interface GeneratedFile {
  path: string;
  content: string;
}

function toTitle(s: string): string {
  return s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export const CodeGenPage: React.FC = () => {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [columnsError, setColumnsError] = useState(false);
  const [selectedTable, setSelectedTable] = useState("");
  const [selectedTableInfo, setSelectedTableInfo] = useState<TableInfo | null>(
    null,
  );
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [moduleName, setModuleName] = useState("system");
  const [businessName, setBusinessName] = useState("");
  const [functionName, setFunctionName] = useState("");
  const [generated, setGenerated] = useState<GeneratedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [tableError, setTableError] = useState(false);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeFile, setActiveFile] = useState("");
  const [copyingPath, setCopyingPath] = useState("");
  const formErrors = useFieldErrors();
  const tablesRequestRef = useRef(0);
  const columnsRequestRef = useRef(0);
  const tablesFetchingRef = useRef(false);
  const tablesFetchingSignatureRef = useRef("");
  const columnsFetchingRef = useRef(false);
  const columnsFetchingTableRef = useRef<string | null>(null);
  const generatingRef = useRef(false);
  const skipSearchRef = useRef(true);
  const copyingRef = useRef(false);
  const canGenerate = can("system:codegen:create");

  const fetchTables = useCallback(
    async (
      targetPage: number,
      targetPageSize: number,
      keyword: string,
      force = false,
    ) => {
      const signature = `${targetPage}:${targetPageSize}:${keyword.trim()}`;
      if (
        !force &&
        tablesFetchingRef.current &&
        tablesFetchingSignatureRef.current === signature
      )
        return;
      tablesFetchingRef.current = true;
      tablesFetchingSignatureRef.current = signature;
      const requestId = ++tablesRequestRef.current;
      setTablesLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(targetPage + 1),
          page_size: String(targetPageSize),
        });
        const trimmedKeyword = keyword.trim();
        if (trimmedKeyword) params.set("keyword", trimmedKeyword);
        const data = await apiFetch<TableListResponse>(
          `/api/codegen/tables?${params.toString()}`,
        );
        if (requestId !== tablesRequestRef.current) return;
        setTables(data?.data || []);
        setTotal(data?.total ?? 0);
        setPage(targetPage);
        setPageSize(targetPageSize);
        setTableError(false);
      } catch (e: unknown) {
        if (requestId !== tablesRequestRef.current) return;
        // 非关键：数据加载失败时保留旧数据，不阻塞页面
        if (e instanceof Error) message.error(`加载失败: ${e.message}`);
        setTableError(true);
      } finally {
        if (requestId === tablesRequestRef.current) {
          setTablesLoading(false);
          tablesFetchingRef.current = false;
          tablesFetchingSignatureRef.current = "";
        }
      }
    },
    [],
  );

  useEffect(() => {
    void fetchTables(0, 10, "");
    return () => {
      tablesRequestRef.current += 1;
      tablesFetchingRef.current = false;
      tablesFetchingSignatureRef.current = "";
      columnsRequestRef.current += 1;
      columnsFetchingRef.current = false;
      columnsFetchingTableRef.current = null;
    };
  }, [fetchTables]);

  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      if (loading) return;
      setPage(0);
      void fetchTables(0, pageSize, search);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, pageSize, loading, fetchTables]);

  const fetchColumns = async (name: string) => {
    if (columnsFetchingRef.current && columnsFetchingTableRef.current === name)
      return;
    columnsFetchingRef.current = true;
    columnsFetchingTableRef.current = name;
    const requestId = ++columnsRequestRef.current;
    setColumnsLoading(true);
    setColumnsError(false);
    setColumns([]);
    try {
      const data = await apiFetch<ColumnInfo[]>(
        `/api/codegen/tables/${encodeURIComponent(name)}/columns`,
      );
      if (requestId !== columnsRequestRef.current) return;
      setColumns(data);
    } catch (e: unknown) {
      if (requestId !== columnsRequestRef.current) return;
      if (e instanceof Error) message.error(`加载失败: ${e.message}`);
      setColumnsError(true);
    } finally {
      if (requestId === columnsRequestRef.current) {
        setColumnsLoading(false);
        columnsFetchingRef.current = false;
        columnsFetchingTableRef.current = null;
      }
    }
  };

  const currentTable = selectedTableInfo;

  const handleSelectTable = (table: TableInfo) => {
    if (loading) return;
    setSelectedTable(table.name);
    setSelectedTableInfo(table);
    setSelectedColumns([]);
    setBusinessName(table.comment || toTitle(table.name));
    setFunctionName(table.name);
    formErrors.clearErrors();
    void fetchColumns(table.name);
  };

  const handleGenerate = async () => {
    if (
      loading ||
      tablesLoading ||
      tableError ||
      columnsLoading ||
      columnsError ||
      !selectedTable
    )
      return;
    if (generatingRef.current) return;
    if (!selectedTable) {
      formErrors.setErrors({ table: "请先选择数据表" });
      return;
    }
    if (selectedColumns.length === 0) {
      formErrors.setErrors({ fields: "请至少选择一个字段" });
      return;
    }
    formErrors.clearErrors();
    setLoading(true);
    generatingRef.current = true;
    try {
      const data = await apiFetch<{ files: GeneratedFile[] }>(
        "/api/codegen/preview",
        {
          method: "POST",
          body: JSON.stringify({
            table_name: selectedTable,
            module_name: moduleName,
            business_name: businessName,
            function_name: functionName,
            selected_columns: selectedColumns,
          }),
        },
      );
      if (!data.files?.length) {
        message.warning("未生成任何文件");
        return;
      }
      setGenerated(data.files);
      setActiveFile(data.files[0]?.path || "");
      setPreviewOpen(true);
      message.success("代码预览已生成");
    } catch (e: unknown) {
      // 非关键：数据加载失败时保留旧数据，不阻塞页面
      if (e instanceof Error) message.error(`加载失败: ${e.message}`);
    } finally {
      setLoading(false);
      generatingRef.current = false;
    }
  };

  const toggleColumn = (colName: string) => {
    setSelectedColumns((prev) =>
      prev.includes(colName)
        ? prev.filter((c) => c !== colName)
        : [...prev, colName],
    );
    formErrors.clearError("fields");
  };

  const handleCopy = async (path: string, content: string) => {
    if (copyingPath || copyingRef.current) return;
    if (!navigator.clipboard?.writeText) {
      message.warning("当前浏览器不支持自动复制，请手动选择代码");
      return;
    }
    copyingRef.current = true;
    setCopyingPath(path);
    try {
      await navigator.clipboard.writeText(content);
      message.success(`已复制 ${path}`);
    } catch {
      message.error("复制失败，请手动选择代码复制");
    } finally {
      setCopyingPath("");
      copyingRef.current = false;
    }
  };

  const tableColumns: ColumnDef<TableInfo>[] = [
    {
      accessorKey: "name",
      header: "表名",
      cell: ({ row }) => (
        <code
          className="block max-w-[260px] break-all text-xs"
          title={row.original.name}
        >
          {row.original.name}
        </code>
      ),
    },
    {
      accessorKey: "comment",
      header: "说明",
      cell: ({ row }) => (
        <span
          className="block max-w-[220px] truncate"
          title={row.original.comment}
        >
          {row.original.comment || "-"}
        </span>
      ),
    },
    {
      accessorKey: "column_count",
      header: "列数",
      cell: ({ row }) => (
        <span className="text-right">{row.original.column_count}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Code className="size-5" />
        <h2 className="text-lg font-semibold">代码生成</h2>
      </div>

      {tableError && (
        <InlineError
          title="数据表加载失败"
          description={"数据表列表可能未更新，请重试。"}
          onRetry={() => void fetchTables(page, pageSize, search, true)}
          loading={tablesLoading}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">选择数据表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="搜索表名"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索表名"
                className="pl-9"
                disabled={loading}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void fetchTables(page, pageSize, search, true)}
            >
              <RefreshCw
                className={
                  tablesLoading ? "size-4 mr-1 animate-spin" : "size-4 mr-1"
                }
              />
              刷新
            </Button>
          </div>
          <DataTable
            columns={tableColumns}
            data={tables}
            pageSize={pageSize}
            serverSide
            total={total}
            pageIndex={page}
            onPageChange={(nextPage) =>
              void fetchTables(nextPage, pageSize, search, true)
            }
            onPageSizeChange={(nextSize) => {
              setPage(0);
              setPageSize(nextSize);
            }}
            onRowClick={(row) => handleSelectTable(row)}
            getRowClickLabel={(row) => `选择数据表 ${row.name}`}
            rowClassName={(row) =>
              row.name === selectedTable ? "bg-primary/10" : ""
            }
            emptyMessage="暂无数据表"
            loading={tablesLoading || loading}
          />
          {formErrors.errors.table && (
            <FormMessage
              id="codegen-table-error"
              error={formErrors.errors.table}
            />
          )}
        </CardContent>
      </Card>

      {currentTable && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">生成配置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <Label htmlFor="codegen-module">模块名</Label>
                <Input
                  id="codegen-module"
                  placeholder="如 system"
                  value={moduleName}
                  onChange={(e) => setModuleName(e.target.value)}
                  className="w-[120px]"
                  disabled={loading}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="codegen-business">业务名</Label>
                <Input
                  id="codegen-business"
                  placeholder="如 user"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-[150px]"
                  disabled={loading}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="codegen-function">功能名</Label>
                <Input
                  id="codegen-function"
                  placeholder="如 用户管理"
                  value={functionName}
                  onChange={(e) => setFunctionName(e.target.value)}
                  className="w-[150px]"
                  disabled={loading}
                />
              </div>
              {canGenerate && (
                <Button
                  onClick={handleGenerate}
                  disabled={
                    loading ||
                    tablesLoading ||
                    tableError ||
                    columnsLoading ||
                    columnsError ||
                    !selectedTable
                  }
                >
                  {loading ? (
                    <Loader2 className="size-4 mr-1 animate-spin" />
                  ) : (
                    <Code className="size-4 mr-1" />
                  )}
                  {loading ? "生成中…" : "生成预览"}
                </Button>
              )}
            </div>

            <div>
              <p id="codegen-fields-label" className="mb-2 text-sm font-medium">
                选择字段
              </p>
              {formErrors.errors.fields && (
                <FormMessage
                  id="codegen-fields-error"
                  error={formErrors.errors.fields}
                />
              )}
              {columnsLoading ? (
                <div className="block py-2 text-sm text-muted-foreground">
                  字段加载中…
                </div>
              ) : columnsError ? (
                <InlineError
                  title="字段加载失败"
                  description={"字段列表可能未更新，请重试。"}
                  onRetry={() => void fetchColumns(selectedTable)}
                  loading={columnsLoading}
                />
              ) : columns.length === 0 ? (
                <div className="block py-2 text-sm text-muted-foreground">
                  暂无字段
                </div>
              ) : (
                <div
                  className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3"
                  aria-labelledby="codegen-fields-label"
                >
                  {columns.map((c) => (
                    <label
                      key={c.name}
                      className={`flex min-w-0 items-center gap-2 text-sm ${loading ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                    >
                      <Checkbox
                        checked={selectedColumns.includes(c.name)}
                        onCheckedChange={() => toggleColumn(c.name)}
                        disabled={loading}
                      />
                      <span className="block min-w-0 break-words">
                        <code className="break-all text-xs">{c.name}</code>
                        <span className="text-muted-foreground ml-1">
                          ({c.data_type})
                        </span>
                        {c.comment && (
                          <span className="text-muted-foreground ml-1 break-words">
                            — {c.comment}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>代码预览</DialogTitle>
          </DialogHeader>
          <Tabs value={activeFile} onValueChange={setActiveFile}>
            <TabsList className="flex flex-wrap h-auto">
              {generated.map((f) => (
                <TabsTrigger
                  key={f.path}
                  value={f.path}
                  className="text-xs font-mono"
                >
                  {f.path}
                </TabsTrigger>
              ))}
            </TabsList>
            {generated.map((f) => (
              <TabsContent key={f.path} value={f.path}>
                <div className="mb-2 flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={copyingPath !== ""}
                    onClick={() => void handleCopy(f.path, f.content)}
                  >
                    <Copy className="size-4 mr-1" />
                    {copyingPath === f.path ? "复制中…" : "复制"}
                  </Button>
                </div>
                <pre className="text-xs max-h-[500px] overflow-auto rounded-md bg-muted p-3 font-mono whitespace-pre-wrap break-all">
                  {f.content}
                </pre>
              </TabsContent>
            ))}
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
};
