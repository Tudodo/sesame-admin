import { InlineError } from "@/components/InlineError";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RequiredLabel } from "@/components/ui/required-label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { TextareaWithCounter } from "@/components/ui/textarea-counter";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useFieldErrors } from "@/hooks/useFieldErrors";
import { confirm } from "@/lib/confirm";
import { message } from "@/lib/message";
import { navigate } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { apiFetch, getList } from "@/services/api";
import { can } from "@/services/permission";
import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import {
  Link2,
  Loader2,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

interface SyncSource {
  id: number;
  name: string;
  source_type: string;
  connection_config: Record<string, unknown>;
  status: string;
}

interface SyncTable {
  id: number;
  source_id: number;
  source_table: string;
  target_table: string;
  target_connection_url?: string;
  field_mapping?: Record<string, unknown>;
  sync_mode: string;
  status: string;
  last_sync_at?: string;
  last_row_count?: number;
}

function isDbConnectionUrl(value: string): boolean {
  return /^postgres(?:ql)?:\/\/[^\s]+$/.test(value.trim());
}

function isStringMap(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((item) => typeof item === "string");
}

export const DataSyncPage: React.FC = () => {
  const [sources, setSources] = useState<SyncSource[]>([]);
  const [tables, setTables] = useState<SyncTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sourcePage, setSourcePage] = useState(0);
  const [sourcePageSize, setSourcePageSize] = useState(10);
  const [sourceTotal, setSourceTotal] = useState(0);
  const [tablePage, setTablePage] = useState(0);
  const [tablePageSize, setTablePageSize] = useState(20);
  const [tableTotal, setTableTotal] = useState(0);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablesLoadError, setTablesLoadError] = useState(false);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<SyncSource | null>(null);
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<SyncTable | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  const [discoveredTables, setDiscoveredTables] = useState<string[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState(false);
  const [mailModalOpen, setMailModalOpen] = useState(false);
  const [savingSource, setSavingSource] = useState(false);
  const [savingTable, setSavingTable] = useState(false);
  const [sendingMail, setSendingMail] = useState(false);
  const [deletingSourceId, setDeletingSourceId] = useState<number | null>(null);
  const [deletingTableId, setDeletingTableId] = useState<number | null>(null);
  const [syncingTableId, setSyncingTableId] = useState<number | null>(null);
  const sourceBusy =
    loading || discovering || deletingSourceId !== null || savingSource;
  const tableBusy =
    tablesLoading ||
    syncingTableId !== null ||
    deletingTableId !== null ||
    savingTable;
  const sourcesRequestIdRef = useRef(0);
  const sourcesFetchingRef = useRef(false);
  const tablesRequestIdRef = useRef(0);
  const tablesFetchingRef = useRef(false);
  const discoverRequestIdRef = useRef(0);
  const discoverOpeningRef = useRef(false);
  const sourceActionRef = useRef(false);
  const tableActionRef = useRef(false);
  const mailActionRef = useRef(false);

  // Source form fields
  const [sName, setSName] = useState("");
  const [sType, setSType] = useState("database");
  const [sUrl, setSUrl] = useState("postgres://user:pass@host:5432/db");
  const [sStatus, setSStatus] = useState("enabled");

  // Table form fields
  const [tSourceTable, setTSourceTable] = useState("");
  const [tTargetTable, setTTargetTable] = useState("");
  const [tTargetUrl, setTTargetUrl] = useState("");
  const [tFieldMapping, setTFieldMapping] = useState("{}");
  const [tSyncMode, setTSyncMode] = useState("full");
  const [tStatus, setTStatus] = useState("enabled");

  // Mail form fields
  const [mTo, setMTo] = useState("");
  const [mSubject, setMSubject] = useState("");
  const [mBody, setMBody] = useState("");
  const sourceFormErrors = useFieldErrors();
  const tableFormErrors = useFieldErrors();
  const mailFormErrors = useFieldErrors();

  const loadSources = useCallback(
    async (force = false) => {
      if (sourcesFetchingRef.current && !force) return;
      sourcesFetchingRef.current = true;
      setLoading(true);
      const requestId = ++sourcesRequestIdRef.current;
      try {
        const result = await getList<SyncSource>("sync-sources", {
          _start: sourcePage * sourcePageSize,
          _end: (sourcePage + 1) * sourcePageSize,
        });
        if (requestId !== sourcesRequestIdRef.current) return;
        setSources(result.data);
        setSourceTotal(result.total);
        setLoadError(false);
      } catch (e: unknown) {
        // 非关键：数据源列表加载失败时保留旧数据
        if (requestId !== sourcesRequestIdRef.current) return;
        if (e instanceof Error) message.error(`加载失败: ${e.message}`);
        setLoadError(true);
      } finally {
        if (requestId === sourcesRequestIdRef.current) {
          setLoading(false);
          sourcesFetchingRef.current = false;
        }
      }
    },
    [sourcePage, sourcePageSize],
  );

  const loadTables = useCallback(
    async (sourceId: number, force = false) => {
      if (tablesFetchingRef.current && !force) return;
      tablesFetchingRef.current = true;
      setTablesLoading(true);
      setTablesLoadError(false);
      const requestId = ++tablesRequestIdRef.current;
      try {
        const result = await getList<SyncTable>(
          `sync-sources/${sourceId}/tables`,
          {
            _start: tablePage * tablePageSize,
            _end: (tablePage + 1) * tablePageSize,
          },
        );
        if (requestId !== tablesRequestIdRef.current) return;
        if (result.data.length === 0 && tablePage > 0) {
          setTablePage(tablePage - 1);
          return;
        }
        setTables(result.data);
        setTableTotal(result.total);
      } catch (e: unknown) {
        if (requestId !== tablesRequestIdRef.current) return;
        setTables([]);
        setTablesLoadError(true);
        if (e instanceof Error) message.error(`加载失败: ${e.message}`);
      } finally {
        if (requestId === tablesRequestIdRef.current) {
          setTablesLoading(false);
          tablesFetchingRef.current = false;
        }
      }
    },
    [tablePage, tablePageSize],
  );

  useEffect(() => {
    void loadSources(true);
    return () => {
      sourcesRequestIdRef.current += 1;
      sourcesFetchingRef.current = false;
    };
  }, [loadSources]);

  useEffect(() => {
    if (selectedSourceId) {
      setTables([]);
      setTablesLoadError(false);
      setTableTotal(0);
      setDiscoveredTables([]);
      setDiscoverError(false);
      void loadTables(selectedSourceId, true);
    } else {
      tablesRequestIdRef.current += 1;
      setTables([]);
      setTablesLoadError(false);
      setTableTotal(0);
      setDiscoveredTables([]);
      setDiscoverError(false);
    }
    return () => {
      tablesRequestIdRef.current += 1;
      tablesFetchingRef.current = false;
    };
  }, [selectedSourceId, loadTables]);

  useEffect(() => {
    return () => {
      sourcesRequestIdRef.current += 1;
      sourcesFetchingRef.current = false;
      tablesRequestIdRef.current += 1;
      tablesFetchingRef.current = false;
      discoverRequestIdRef.current += 1;
      discoverOpeningRef.current = false;
      sourceActionRef.current = false;
      tableActionRef.current = false;
      mailActionRef.current = false;
    };
  }, []);

  const selectSource = (r: SyncSource) => {
    discoverRequestIdRef.current += 1;
    discoverOpeningRef.current = false;
    setDiscovering(false);
    setDiscoverError(false);
    setDiscoveredTables([]);
    setTablePage(0);
    setSelectedSourceId(r.id);
  };

  // Source CRUD
  const openCreateSource = () => {
    setEditingSource(null);
    setSName("");
    setSType("database");
    setSUrl("postgres://user:pass@host:5432/db");
    setSStatus("enabled");
    setSourceModalOpen(true);
    sourceFormErrors.clearErrors();
  };

  const openEditSource = (r: SyncSource) => {
    setEditingSource(r);
    setSName(r.name);
    setSType(r.source_type);
    setSUrl(String(r.connection_config?.url ?? ""));
    setSStatus(r.status);
    setSourceModalOpen(true);
    sourceFormErrors.clearErrors();
  };

  const handleSaveSource = async () => {
    if (sourceBusy) return;
    if (sourceActionRef.current) return;
    const connectionUrl = sUrl.trim();
    const nextErrors: Record<string, string> = {};
    if (!sName.trim()) nextErrors.name = "请输入名称";
    if (!connectionUrl) nextErrors.url = "请输入数据库连接 URL";
    else if (!isDbConnectionUrl(connectionUrl))
      nextErrors.url = "仅支持 postgres:// 或 postgresql:// 连接地址";
    if (Object.keys(nextErrors).length > 0) {
      sourceFormErrors.setErrors(nextErrors);
      return;
    }
    sourceFormErrors.clearErrors();
    const values = {
      name: sName.trim(),
      source_type: sType,
      connection_url: connectionUrl,
      status: sStatus,
    };
    const method = editingSource ? "PUT" : "POST";
    const url = editingSource
      ? `/api/sync-sources/${editingSource.id}`
      : "/api/sync-sources";
    sourceActionRef.current = true;
    setSavingSource(true);
    try {
      await apiFetch(url, { method, body: JSON.stringify(values) });
      message.success(editingSource ? "已更新" : "已创建");
      setSourceModalOpen(false);
      if (sourcePage === 0) void loadSources(true);
      else setSourcePage(0);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingSource(false);
      sourceActionRef.current = false;
    }
  };

  const handleDeleteSource = async (r: SyncSource) => {
    if (sourceBusy) return;
    if (sourceActionRef.current) return;
    sourceActionRef.current = true;
    const ok = await confirm({
      title: `确定删除数据源「${r.name}」？`,
      content: "删除后不可恢复",
      okVariant: "destructive",
    });
    if (!ok) {
      sourceActionRef.current = false;
      return;
    }
    setDeletingSourceId(r.id);
    try {
      await apiFetch(`/api/sync-sources/${r.id}`, { method: "DELETE" });
      message.success("已删除");
      if (r.id === selectedSourceId) {
        discoverRequestIdRef.current += 1;
        discoverOpeningRef.current = false;
        setDiscovering(false);
        setDiscoverError(false);
        setSelectedSourceId(null);
        setDiscoveredTables([]);
        setTables([]);
        setTablesLoadError(false);
        setTablePage(0);
        setTableTotal(0);
      }
      const nextTotal = Math.max(0, sourceTotal - 1);
      const nextMaxPage = Math.max(
        0,
        Math.ceil(nextTotal / sourcePageSize) - 1,
      );
      if (sourcePage > nextMaxPage) setSourcePage(nextMaxPage);
      else void loadSources(true);
      return;
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeletingSourceId(null);
      sourceActionRef.current = false;
    }
  };

  const handleDiscover = async (r: SyncSource) => {
    if (sourceBusy) return;
    if (sourceActionRef.current) return;
    if (discoverOpeningRef.current) return;
    sourceActionRef.current = true;
    selectSource(r);
    discoverOpeningRef.current = true;
    setDiscovering(true);
    const requestId = ++discoverRequestIdRef.current;
    setDiscoverError(false);
    try {
      const data = await apiFetch<{ tables?: string[] }>(
        "/api/sync-sources/discover-tables",
        {
          method: "POST",
          body: JSON.stringify({ source_id: r.id }),
        },
      );
      if (requestId !== discoverRequestIdRef.current) return;
      setDiscoveredTables(data.tables || []);
      message.success(`发现 ${data.tables?.length || 0} 张表`);
    } catch (e: unknown) {
      if (requestId !== discoverRequestIdRef.current) return;
      message.error(e instanceof Error ? e.message : "连接失败");
      setDiscoverError(true);
    } finally {
      sourceActionRef.current = false;
      if (requestId === discoverRequestIdRef.current) {
        setDiscovering(false);
        discoverOpeningRef.current = false;
      }
    }
  };

  // Table CRUD
  const openCreateTable = (tableName?: string) => {
    setEditingTable(null);
    setTSourceTable(tableName || "");
    setTTargetTable(tableName || "");
    setTTargetUrl("");
    setTFieldMapping("{}");
    setTSyncMode("full");
    setTStatus("enabled");
    setTableModalOpen(true);
    tableFormErrors.clearErrors();
  };

  const openEditTable = (r: SyncTable) => {
    setEditingTable(r);
    setTSourceTable(r.source_table);
    setTTargetTable(r.target_table);
    setTTargetUrl(r.target_connection_url || "");
    setTFieldMapping(
      r.field_mapping ? JSON.stringify(r.field_mapping, null, 2) : "{}",
    );
    setTSyncMode(r.sync_mode);
    setTStatus(r.status);
    setTableModalOpen(true);
    tableFormErrors.clearErrors();
  };

  const handleSaveTable = async () => {
    if (tableBusy) return;
    if (tableActionRef.current) return;
    const sourceTable = tSourceTable.trim();
    const targetTable = tTargetTable.trim();
    const targetUrl = tTargetUrl.trim();
    const fieldMappingText = tFieldMapping.trim();
    const nextErrors: Record<string, string> = {};
    if (!sourceTable) nextErrors.sourceTable = "请输入源表名";
    if (!targetTable) nextErrors.targetTable = "请输入目标表名";
    if (targetUrl && !isDbConnectionUrl(targetUrl))
      nextErrors.targetUrl =
        "目标数据库连接仅支持 postgres:// 或 postgresql:// 地址";
    let fieldMapping: Record<string, string> | undefined;
    let fieldMappingError = false;
    if (fieldMappingText) {
      try {
        const parsed: unknown = JSON.parse(fieldMappingText);
        if (isStringMap(parsed)) {
          fieldMapping = parsed;
        } else {
          nextErrors.fieldMapping = "字段映射必须是 JSON 对象，且值为源字段名";
          fieldMappingError = true;
        }
      } catch {
        nextErrors.fieldMapping = "字段映射 JSON 格式错误";
        fieldMappingError = true;
      }
    }
    if (Object.keys(nextErrors).length > 0) {
      tableFormErrors.setErrors(nextErrors);
      return;
    }
    tableFormErrors.clearErrors();
    const body = {
      source_table: sourceTable,
      target_table: targetTable,
      target_connection_url: targetUrl || undefined,
      field_mapping: fieldMapping,
      sync_mode: tSyncMode,
      status: tStatus,
    };
    const method = editingTable ? "PUT" : "POST";
    const baseUrl = `/api/sync-sources/${selectedSourceId}/tables`;
    const url = editingTable ? `${baseUrl}/${editingTable.id}` : baseUrl;
    tableActionRef.current = true;
    setSavingTable(true);
    try {
      await apiFetch(url, { method, body: JSON.stringify(body) });
      message.success(editingTable ? "已更新" : "已创建");
      setTableModalOpen(false);
      if (selectedSourceId) {
        if (editingTable) void loadTables(selectedSourceId, true);
        else if (tablePage === 0) void loadTables(selectedSourceId, true);
        else setTablePage(0);
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingTable(false);
      tableActionRef.current = false;
    }
  };

  const handleDeleteTable = async (r: SyncTable) => {
    if (tableBusy) return;
    if (tableActionRef.current) return;
    tableActionRef.current = true;
    const ok = await confirm({
      title: `确定删除表同步「${r.source_table}」？`,
      content: "删除后不可恢复",
      okVariant: "destructive",
    });
    if (!ok) {
      tableActionRef.current = false;
      return;
    }
    setDeletingTableId(r.id);
    try {
      await apiFetch(`/api/sync-sources/${r.source_id}/tables/${r.id}`, {
        method: "DELETE",
      });
      message.success("已删除");
      if (selectedSourceId) {
        const nextTotal = Math.max(0, tableTotal - 1);
        const nextMaxPage = Math.max(
          0,
          Math.ceil(nextTotal / tablePageSize) - 1,
        );
        if (tablePage > nextMaxPage) setTablePage(nextMaxPage);
        else void loadTables(selectedSourceId, true);
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeletingTableId(null);
      tableActionRef.current = false;
    }
  };

  const handleRunSync = async (r: SyncTable) => {
    if (tableBusy) return;
    if (tableActionRef.current) return;
    tableActionRef.current = true;
    setSyncingTableId(r.id);
    try {
      await apiFetch(`/api/sync-sources/${r.source_id}/tables/${r.id}/run`, {
        method: "POST",
      });
      toast.success("同步任务已提交", {
        action: can("system:job:read")
          ? { label: "查看进度", onClick: () => navigate("/job-queue") }
          : undefined,
      });
      if (selectedSourceId) void loadTables(selectedSourceId, true);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "同步失败");
    } finally {
      setSyncingTableId(null);
      tableActionRef.current = false;
    }
  };

  const handleSendMail = async () => {
    if (sendingMail) return;
    if (mailActionRef.current) return;
    const to = mTo.trim();
    const subject = mSubject.trim();
    const body = mBody.trim();
    const nextErrors: Record<string, string> = {};
    if (!to) nextErrors.to = "请输入收件人";
    if (!subject) nextErrors.subject = "请输入主题";
    if (!body) nextErrors.body = "请输入正文";
    if (Object.keys(nextErrors).length > 0) {
      mailFormErrors.setErrors(nextErrors);
      return;
    }
    mailFormErrors.clearErrors();
    mailActionRef.current = true;
    setSendingMail(true);
    try {
      await apiFetch("/api/jobs/send-mail", {
        method: "POST",
        body: JSON.stringify({ to, subject, body_text: body }),
      });
      toast.success("邮件任务已提交", {
        action: can("system:job:read")
          ? { label: "查看进度", onClick: () => navigate("/job-queue") }
          : undefined,
      });
      setMailModalOpen(false);
      setMTo("");
      setMSubject("");
      setMBody("");
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSendingMail(false);
      mailActionRef.current = false;
    }
  };

  const sourceColumns: ColumnDef<SyncSource>[] = [
    {
      accessorKey: "name",
      header: "名称",
      cell: ({ row }) => (
        <span
          className="block max-w-[180px] truncate"
          title={row.original.name}
        >
          {row.original.name}
        </span>
      ),
    },
    {
      accessorKey: "source_type",
      header: "类型",
      cell: ({ row }) => (
        <Badge variant="outline">{row.original.source_type}</Badge>
      ),
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => (
        <Badge
          variant={
            row.original.status === "enabled" ? "default" : "destructive"
          }
        >
          {row.original.status === "enabled" ? "启用" : "停用"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          {can("system:sync:create") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`发现源表 ${row.original.name}`}
                  onClick={() => handleDiscover(row.original)}
                  disabled={sourceBusy}
                >
                  <Search className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>发现源表</TooltipContent>
            </Tooltip>
          )}
          {can("system:sync:update") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEditSource(row.original)}
                  disabled={sourceBusy}
                  aria-label={`编辑数据源 ${row.original.name}`}
                >
                  <Pencil className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>编辑数据源</TooltipContent>
            </Tooltip>
          )}
          {can("system:sync:delete") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteSource(row.original)}
                  disabled={sourceBusy}
                  aria-label={`删除数据源 ${row.original.name}`}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>删除数据源</TooltipContent>
            </Tooltip>
          )}
        </div>
      ),
    },
  ];

  const tableColumns: ColumnDef<SyncTable>[] = [
    {
      accessorKey: "source_table",
      header: "源表",
      cell: ({ row }) => (
        <code
          className="block max-w-[220px] break-all text-xs"
          title={row.original.source_table}
        >
          {row.original.source_table}
        </code>
      ),
    },
    {
      accessorKey: "target_table",
      header: "目标表",
      cell: ({ row }) => (
        <code
          className="block max-w-[220px] break-all text-xs"
          title={row.original.target_table}
        >
          {row.original.target_table}
        </code>
      ),
    },
    {
      accessorKey: "target_connection_url",
      header: "目标库",
      cell: ({ row }) => (
        <Badge
          variant={row.original.target_connection_url ? "outline" : "secondary"}
        >
          {row.original.target_connection_url ? "远程" : "本地"}
        </Badge>
      ),
    },
    {
      accessorKey: "sync_mode",
      header: "模式",
      cell: ({ row }) => (
        <Badge
          variant={row.original.sync_mode === "full" ? "default" : "secondary"}
        >
          {row.original.sync_mode === "full" ? "全量" : "增量"}
        </Badge>
      ),
    },
    {
      accessorKey: "last_sync_at",
      header: "上次同步",
      cell: ({ row }) =>
        row.original.last_sync_at
          ? dayjs(row.original.last_sync_at).format("YYYY-MM-DD HH:mm:ss")
          : "-",
    },
    {
      accessorKey: "last_row_count",
      header: "行数",
      cell: ({ row }) => row.original.last_row_count ?? "-",
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          {can("system:sync:create") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRunSync(row.original)}
                  disabled={tableBusy}
                  aria-label={`执行同步 ${row.original.source_table}`}
                >
                  <RefreshCw
                    className={cn(
                      "size-4",
                      syncingTableId === row.original.id && "animate-spin",
                    )}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>执行同步</TooltipContent>
            </Tooltip>
          )}
          {can("system:sync:update") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEditTable(row.original)}
                  disabled={tableBusy}
                  aria-label={`编辑同步配置 ${row.original.source_table}`}
                >
                  <Pencil className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>编辑同步配置</TooltipContent>
            </Tooltip>
          )}
          {can("system:sync:delete") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteTable(row.original)}
                  disabled={tableBusy}
                  aria-label={`删除同步配置 ${row.original.source_table}`}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>删除同步配置</TooltipContent>
            </Tooltip>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <RefreshCw className="size-5" />
          <h2 className="text-lg font-semibold">数据同步</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          配置外部数据库连接 → 发现源表 → 选择要同步的表 → 配置目标映射 →
          执行同步
        </p>
      </div>

      {loadError && (
        <InlineError
          title="数据源加载失败"
          description={"数据源列表可能未更新，已保留原有数据。"}
          onRetry={() => void loadSources(true)}
          loading={loading}
        />
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="size-4" />
              数据源配置
            </CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadSources(true)}
                disabled={
                  discovering || deletingSourceId !== null || savingSource
                }
              >
                <RefreshCw
                  className={cn("size-4 mr-1", loading && "animate-spin")}
                />
                刷新
              </Button>
              {can("system:sync:create") && (
                <Button
                  size="sm"
                  onClick={openCreateSource}
                  disabled={sourceBusy}
                >
                  <Plus className="size-4 mr-1" />
                  新增数据源
                </Button>
              )}
              {can("system:job:create") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    mailFormErrors.clearErrors();
                    setMailModalOpen(true);
                  }}
                >
                  <Mail className="size-4 mr-1" />
                  发送邮件
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={sourceColumns}
            data={sources}
            pageSize={sourcePageSize}
            serverSide
            total={sourceTotal}
            pageIndex={sourcePage}
            onPageChange={setSourcePage}
            onPageSizeChange={(size) => {
              setSourcePage(0);
              setSourcePageSize(size);
            }}
            loading={loading}
            loadingMessage="正在加载数据源…"
            emptyMessage="暂无数据源，点击「新增数据源」创建第一个"
            onRowClick={(r) => {
              selectSource(r);
            }}
            getRowClickLabel={(r) => `选择数据源 ${r.name}`}
            rowClassName={(r) =>
              selectedSourceId === r.id ? "bg-primary/10" : ""
            }
          />
        </CardContent>
      </Card>

      {selectedSourceId && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">表同步配置</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadTables(selectedSourceId, true)}
                disabled={
                  syncingTableId !== null ||
                  deletingTableId !== null ||
                  savingTable
                }
              >
                <RefreshCw
                  className={cn("size-4 mr-1", tablesLoading && "animate-spin")}
                />
                刷新
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {tablesLoadError && (
              <InlineError
                title="表同步配置加载失败"
                description="当前可能未显示任何表配置，请重试后再操作"
                loading={tablesLoading}
                onRetry={() => void loadTables(selectedSourceId, true)}
              />
            )}
            {discoverError && (
              <InlineError
                title="源表发现失败"
                description="请检查数据源连接后重试；发现成功后即可快速添加源表。"
                loading={discovering}
                onRetry={() => {
                  const source = sources.find(
                    (item) => item.id === selectedSourceId,
                  );
                  if (source) void handleDiscover(source);
                }}
              />
            )}
            {discoveredTables.length > 0 && (
              <div className="rounded-md bg-muted p-3">
                <p className="text-sm font-medium mb-2">
                  源库表清单（点击快速添加）：
                </p>
                <div className="flex flex-wrap gap-2">
                  {can("system:sync:create") &&
                    discoveredTables.map((t) => (
                      <Button
                        key={t}
                        variant="outline"
                        size="sm"
                        onClick={() => openCreateTable(t)}
                        disabled={tableBusy}
                        className="max-w-full whitespace-normal break-all"
                      >
                        {t}
                      </Button>
                    ))}
                </div>
              </div>
            )}
            <DataTable
              columns={tableColumns}
              data={tables}
              loading={tablesLoading}
              loadingMessage="正在加载表同步配置…"
              emptyMessage="暂无表同步配置，请先在数据源中点击搜索发现源表"
              pageSize={tablePageSize}
              serverSide
              total={tableTotal}
              pageIndex={tablePage}
              onPageChange={setTablePage}
              onPageSizeChange={(size) => {
                setTablePage(0);
                setTablePageSize(size);
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Source Modal */}
      <Dialog
        open={sourceModalOpen}
        onOpenChange={(open) => {
          if (!open && savingSource) return;
          setSourceModalOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSaveSource();
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {editingSource ? "编辑数据源" : "新增数据源"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <RequiredLabel htmlFor="ds-source-name" required>
                  名称
                </RequiredLabel>
                <Input
                  id="ds-source-name"
                  value={sName}
                  onChange={(e) => {
                    setSName(e.target.value);
                    sourceFormErrors.clearError("name");
                  }}
                  {...sourceFormErrors.fieldProps("name", "ds-source-name")}
                  placeholder="生产库"
                />
                {sourceFormErrors.errors.name && (
                  <FormMessage
                    id="ds-source-name-error"
                    error={sourceFormErrors.errors.name}
                  />
                )}
              </div>
              <div className="space-y-1">
                <RequiredLabel htmlFor="ds-source-type" required>
                  类型
                </RequiredLabel>
                <Select value={sType} onValueChange={setSType}>
                  <SelectTrigger id="ds-source-type">
                    <SelectValue placeholder="选择类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="database">PostgreSQL 数据库</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <RequiredLabel htmlFor="ds-source-url" required>
                  数据库连接 URL
                </RequiredLabel>
                <Input
                  id="ds-source-url"
                  value={sUrl}
                  onChange={(e) => {
                    setSUrl(e.target.value);
                    sourceFormErrors.clearError("url");
                  }}
                  {...sourceFormErrors.fieldProps("url", "ds-source-url")}
                  placeholder="postgres://user:pass@host:5432/db"
                />
                {sourceFormErrors.errors.url && (
                  <FormMessage
                    id="ds-source-url-error"
                    error={sourceFormErrors.errors.url}
                  />
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="ds-source-status">状态</Label>
                <Select value={sStatus} onValueChange={setSStatus}>
                  <SelectTrigger id="ds-source-status">
                    <SelectValue placeholder="选择状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enabled">启用</SelectItem>
                    <SelectItem value="disabled">停用</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                disabled={savingSource}
                onClick={() => setSourceModalOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={savingSource}>
                {savingSource && (
                  <Loader2 className="size-4 animate-spin mr-1" />
                )}
                {savingSource ? "保存中…" : "保存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Table Modal */}
      <Dialog
        open={tableModalOpen}
        onOpenChange={(open) => {
          if (!open && savingTable) return;
          setTableModalOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSaveTable();
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {editingTable ? "编辑表同步配置" : "新增表同步配置"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <RequiredLabel htmlFor="ds-table-source" required>
                  源表名
                </RequiredLabel>
                <Input
                  id="ds-table-source"
                  value={tSourceTable}
                  onChange={(e) => {
                    setTSourceTable(e.target.value);
                    tableFormErrors.clearError("sourceTable");
                  }}
                  {...tableFormErrors.fieldProps(
                    "sourceTable",
                    "ds-table-source",
                  )}
                  placeholder="remote_users"
                />
                {tableFormErrors.errors.sourceTable && (
                  <FormMessage
                    id="ds-table-source-error"
                    error={tableFormErrors.errors.sourceTable}
                  />
                )}
              </div>
              <div className="space-y-1">
                <RequiredLabel htmlFor="ds-table-target" required>
                  目标表名
                </RequiredLabel>
                <Input
                  id="ds-table-target"
                  value={tTargetTable}
                  onChange={(e) => {
                    setTTargetTable(e.target.value);
                    tableFormErrors.clearError("targetTable");
                  }}
                  {...tableFormErrors.fieldProps(
                    "targetTable",
                    "ds-table-target",
                  )}
                  placeholder="local_users"
                />
                {tableFormErrors.errors.targetTable && (
                  <FormMessage
                    id="ds-table-target-error"
                    error={tableFormErrors.errors.targetTable}
                  />
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="ds-table-target-url">
                  目标数据库连接 (可选，默认本地)
                </Label>
                <Input
                  id="ds-table-target-url"
                  value={tTargetUrl}
                  onChange={(e) => {
                    setTTargetUrl(e.target.value);
                    tableFormErrors.clearError("targetUrl");
                  }}
                  {...tableFormErrors.fieldProps(
                    "targetUrl",
                    "ds-table-target-url",
                  )}
                  placeholder="postgres://user:pass@target-host:5432/db"
                />
                {tableFormErrors.errors.targetUrl && (
                  <FormMessage
                    id="ds-table-target-url-error"
                    error={tableFormErrors.errors.targetUrl}
                  />
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="ds-table-field-mapping">字段映射 (JSON)</Label>
                <TextareaWithCounter
                  id="ds-table-field-mapping"
                  value={tFieldMapping}
                  onChange={(e) => {
                    setTFieldMapping(e.target.value);
                    tableFormErrors.clearError("fieldMapping");
                  }}
                  maxLength={4000}
                  {...tableFormErrors.fieldProps(
                    "fieldMapping",
                    "ds-table-field-mapping",
                  )}
                  rows={3}
                  className="font-mono text-xs"
                  placeholder='{"local_col": "remote_col"}'
                />
                {tableFormErrors.errors.fieldMapping && (
                  <FormMessage
                    id="ds-table-field-mapping-error"
                    error={tableFormErrors.errors.fieldMapping}
                  />
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="ds-table-sync-mode">同步模式</Label>
                <Select value={tSyncMode} onValueChange={setTSyncMode}>
                  <SelectTrigger id="ds-table-sync-mode">
                    <SelectValue placeholder="选择同步模式" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">全量 (清空后导入)</SelectItem>
                    <SelectItem value="incremental">增量 (追加)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ds-table-status">状态</Label>
                <Select value={tStatus} onValueChange={setTStatus}>
                  <SelectTrigger id="ds-table-status">
                    <SelectValue placeholder="选择状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enabled">启用</SelectItem>
                    <SelectItem value="disabled">停用</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                disabled={savingTable}
                onClick={() => setTableModalOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={savingTable}>
                {savingTable && (
                  <Loader2 className="size-4 animate-spin mr-1" />
                )}
                {savingTable ? "保存中…" : "保存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Mail Modal */}
      <Dialog
        open={mailModalOpen}
        onOpenChange={(open) => {
          if (!open && sendingMail) return;
          setMailModalOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>发送邮件</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <RequiredLabel htmlFor="ds-mail-to" required>
                收件人
              </RequiredLabel>
              <Input
                id="ds-mail-to"
                placeholder="请输入收件人邮箱"
                value={mTo}
                onChange={(e) => {
                  setMTo(e.target.value);
                  mailFormErrors.clearError("to");
                }}
                {...mailFormErrors.fieldProps("to", "ds-mail-to")}
              />
              {mailFormErrors.errors.to && (
                <FormMessage
                  id="ds-mail-to-error"
                  error={mailFormErrors.errors.to}
                />
              )}
            </div>
            <div className="space-y-1">
              <RequiredLabel htmlFor="ds-mail-subject" required>
                主题
              </RequiredLabel>
              <Input
                id="ds-mail-subject"
                placeholder="请输入邮件主题"
                value={mSubject}
                onChange={(e) => {
                  setMSubject(e.target.value);
                  mailFormErrors.clearError("subject");
                }}
                {...mailFormErrors.fieldProps("subject", "ds-mail-subject")}
              />
              {mailFormErrors.errors.subject && (
                <FormMessage
                  id="ds-mail-subject-error"
                  error={mailFormErrors.errors.subject}
                />
              )}
            </div>
            <div className="space-y-1">
              <RequiredLabel htmlFor="ds-mail-body" required>
                正文
              </RequiredLabel>
              <TextareaWithCounter
                id="ds-mail-body"
                value={mBody}
                onChange={(e) => {
                  setMBody(e.target.value);
                  mailFormErrors.clearError("body");
                }}
                maxLength={2000}
                {...mailFormErrors.fieldProps("body", "ds-mail-body")}
                rows={3}
              />
              {mailFormErrors.errors.body && (
                <FormMessage
                  id="ds-mail-body-error"
                  error={mailFormErrors.errors.body}
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={sendingMail}
              onClick={() => setMailModalOpen(false)}
            >
              取消
            </Button>
            <Button onClick={handleSendMail} disabled={sendingMail}>
              {sendingMail && <Loader2 className="size-4 animate-spin mr-1" />}
              {sendingMail ? "发送中…" : "发送"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
