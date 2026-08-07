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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { confirm } from "@/lib/confirm";
import { message } from "@/lib/message";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/services/api";
import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import {
  Link2,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";

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

export const DataSyncPage: React.FC = () => {
  const [sources, setSources] = useState<SyncSource[]>([]);
  const [tables, setTables] = useState<SyncTable[]>([]);
  const [loading, setLoading] = useState(false);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<SyncSource | null>(null);
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<SyncTable | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  const [discoveredTables, setDiscoveredTables] = useState<string[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [mailModalOpen, setMailModalOpen] = useState(false);

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

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<SyncSource[]>(
        "/api/sync-sources?_start=0&_end=100",
      );
      setSources(data);
    } catch (e: unknown) {
      // 非关键：数据源列表加载失败时保留旧数据
      if (e instanceof Error) message.error(`加载失败: ${e.message}`);
    }
    setLoading(false);
  }, []);

  const loadTables = useCallback(async (sourceId: number) => {
    try {
      const data = await apiFetch<SyncTable[]>(
        `/api/sync-sources/${sourceId}/tables`,
      );
      setTables(data);
    } catch {
      setTables([]);
    }
  }, []);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  useEffect(() => {
    if (selectedSourceId) loadTables(selectedSourceId);
    else setTables([]);
  }, [selectedSourceId, loadTables]);

  // Source CRUD
  const openCreateSource = () => {
    setEditingSource(null);
    setSName("");
    setSType("database");
    setSUrl("postgres://user:pass@host:5432/db");
    setSStatus("enabled");
    setSourceModalOpen(true);
  };

  const openEditSource = (r: SyncSource) => {
    setEditingSource(r);
    setSName(r.name);
    setSType(r.source_type);
    setSUrl(String(r.connection_config?.url ?? ""));
    setSStatus(r.status);
    setSourceModalOpen(true);
  };

  const handleSaveSource = async () => {
    if (!sName.trim()) {
      message.warning("请填写名称");
      return;
    }
    const values = {
      name: sName,
      source_type: sType,
      connection_url: sUrl,
      status: sStatus,
    };
    const method = editingSource ? "PUT" : "POST";
    const url = editingSource
      ? `/api/sync-sources/${editingSource.id}`
      : "/api/sync-sources";
    try {
      await apiFetch(url, { method, body: JSON.stringify(values) });
      message.success(editingSource ? "已更新" : "已创建");
      setSourceModalOpen(false);
      loadSources();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  const handleDeleteSource = async (r: SyncSource) => {
    const ok = await confirm({
      title: "删除数据源",
      content: `确定删除 ${r.name}？`,
      okVariant: "destructive",
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/sync-sources/${r.id}`, { method: "DELETE" });
      message.success("已删除");
      loadSources();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const handleDiscover = async (r: SyncSource) => {
    setDiscovering(true);
    setSelectedSourceId(r.id);
    setDiscoveredTables([]);
    try {
      const url = r.connection_config?.url || "";
      const data = await apiFetch<{ tables?: string[] }>(
        "/api/sync-sources/discover-tables",
        {
          method: "POST",
          body: JSON.stringify({ connection_url: url }),
        },
      );
      setDiscoveredTables(data.tables || []);
      message.success(`发现 ${data.tables?.length || 0} 张表`);
    } catch {
      message.error("连接失败");
    }
    setDiscovering(false);
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
  };

  const handleSaveTable = async () => {
    if (!tSourceTable.trim() || !tTargetTable.trim()) {
      message.warning("请填写表名");
      return;
    }
    let fieldMapping: Record<string, string> | undefined;
    if (tFieldMapping.trim()) {
      try {
        fieldMapping = JSON.parse(tFieldMapping);
      } catch {
        message.warning("字段映射 JSON 格式错误");
        return;
      }
    }
    const body = {
      source_table: tSourceTable,
      target_table: tTargetTable,
      target_connection_url: tTargetUrl || undefined,
      field_mapping: fieldMapping,
      sync_mode: tSyncMode,
      status: tStatus,
    };
    const method = editingTable ? "PUT" : "POST";
    const baseUrl = `/api/sync-sources/${selectedSourceId}/tables`;
    const url = editingTable ? `${baseUrl}/${editingTable.id}` : baseUrl;
    try {
      await apiFetch(url, { method, body: JSON.stringify(body) });
      message.success(editingTable ? "已更新" : "已创建");
      setTableModalOpen(false);
      if (selectedSourceId) loadTables(selectedSourceId);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  const handleDeleteTable = async (r: SyncTable) => {
    const ok = await confirm({
      title: "删除表同步",
      content: `确定删除 ${r.source_table}？`,
      okVariant: "destructive",
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/sync-sources/${r.source_id}/tables/${r.id}`, {
        method: "DELETE",
      });
      message.success("已删除");
      if (selectedSourceId) loadTables(selectedSourceId);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const handleRunSync = async (r: SyncTable) => {
    try {
      await apiFetch(`/api/sync-sources/${r.source_id}/tables/${r.id}/run`, {
        method: "POST",
      });
      message.success("同步任务已提交");
      if (selectedSourceId) loadTables(selectedSourceId);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "同步失败");
    }
  };

  const handleSendMail = async () => {
    if (!mTo.trim() || !mSubject.trim() || !mBody.trim()) {
      message.warning("请填写完整");
      return;
    }
    try {
      await apiFetch("/api/jobs/send-mail", {
        method: "POST",
        body: JSON.stringify({ to: mTo, subject: mSubject, body_text: mBody }),
      });
      message.success("邮件任务已提交");
      setMailModalOpen(false);
      setMTo("");
      setMSubject("");
      setMBody("");
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "提交失败");
    }
  };

  const sourceColumns: ColumnDef<SyncSource>[] = [
    { accessorKey: "name", header: "名称" },
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDiscover(row.original)}
            disabled={discovering}
          >
            <Search className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEditSource(row.original)}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDeleteSource(row.original)}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  const tableColumns: ColumnDef<SyncTable>[] = [
    {
      accessorKey: "source_table",
      header: "源表",
      cell: ({ row }) => (
        <code className="text-xs">{row.original.source_table}</code>
      ),
    },
    {
      accessorKey: "target_table",
      header: "目标表",
      cell: ({ row }) => (
        <code className="text-xs">{row.original.target_table}</code>
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleRunSync(row.original)}
          >
            <RefreshCw className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEditTable(row.original)}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDeleteTable(row.original)}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="size-4" />
              数据源配置
            </CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadSources}
                disabled={loading}
              >
                <RefreshCw
                  className={cn("size-4 mr-1", loading && "animate-spin")}
                />
                刷新
              </Button>
              <Button size="sm" onClick={openCreateSource}>
                <Plus className="size-4 mr-1" />
                新增数据源
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMailModalOpen(true)}
              >
                <Mail className="size-4 mr-1" />
                发送邮件
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={sourceColumns}
            data={sources}
            pageSize={10}
            onRowClick={(r) => setSelectedSourceId(r.id)}
            rowClassName={(r) =>
              selectedSourceId === r.id ? "bg-primary/10" : ""
            }
          />
        </CardContent>
      </Card>

      {selectedSourceId && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">表同步配置</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadTables(selectedSourceId)}
              >
                <RefreshCw className="size-4 mr-1" />
                刷新
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {discoveredTables.length > 0 && (
              <div className="rounded-md bg-muted p-3">
                <p className="text-sm font-medium mb-2">
                  源库表清单（点击快速添加）：
                </p>
                <div className="flex flex-wrap gap-2">
                  {discoveredTables.map((t) => (
                    <Button
                      key={t}
                      variant="outline"
                      size="sm"
                      onClick={() => openCreateTable(t)}
                    >
                      {t}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <DataTable columns={tableColumns} data={tables} pageSize={20} />
          </CardContent>
        </Card>
      )}

      {/* Source Modal */}
      <Dialog open={sourceModalOpen} onOpenChange={setSourceModalOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>
              {editingSource ? "编辑数据源" : "新增数据源"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>名称 *</Label>
              <Input
                value={sName}
                onChange={(e) => setSName(e.target.value)}
                placeholder="生产库"
              />
            </div>
            <div className="space-y-1">
              <Label>类型 *</Label>
              <Select value={sType} onValueChange={setSType}>
                <SelectTrigger>
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="database">PostgreSQL 数据库</SelectItem>
                  <SelectItem value="api">HTTP API</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>数据库连接 URL *</Label>
              <Input
                value={sUrl}
                onChange={(e) => setSUrl(e.target.value)}
                placeholder="postgres://user:pass@host:5432/db"
              />
            </div>
            <div className="space-y-1">
              <Label>状态</Label>
              <Select value={sStatus} onValueChange={setSStatus}>
                <SelectTrigger>
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
            <Button variant="outline" onClick={() => setSourceModalOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveSource}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Table Modal */}
      <Dialog open={tableModalOpen} onOpenChange={setTableModalOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>
              {editingTable ? "编辑表同步配置" : "新增表同步配置"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>源表名 *</Label>
              <Input
                value={tSourceTable}
                onChange={(e) => setTSourceTable(e.target.value)}
                placeholder="remote_users"
              />
            </div>
            <div className="space-y-1">
              <Label>目标表名 *</Label>
              <Input
                value={tTargetTable}
                onChange={(e) => setTTargetTable(e.target.value)}
                placeholder="local_users"
              />
            </div>
            <div className="space-y-1">
              <Label>目标数据库连接 (可选，默认本地)</Label>
              <Input
                value={tTargetUrl}
                onChange={(e) => setTTargetUrl(e.target.value)}
                placeholder="postgres://user:pass@target-host:5432/db"
              />
            </div>
            <div className="space-y-1">
              <Label>字段映射 (JSON)</Label>
              <Textarea
                value={tFieldMapping}
                onChange={(e) => setTFieldMapping(e.target.value)}
                rows={3}
                className="font-mono text-xs"
                placeholder='{"local_col": "remote_col"}'
              />
            </div>
            <div className="space-y-1">
              <Label>同步模式</Label>
              <Select value={tSyncMode} onValueChange={setTSyncMode}>
                <SelectTrigger>
                  <SelectValue placeholder="选择同步模式" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">全量 (清空后导入)</SelectItem>
                  <SelectItem value="incremental">增量 (追加)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>状态</Label>
              <Select value={tStatus} onValueChange={setTStatus}>
                <SelectTrigger>
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
            <Button variant="outline" onClick={() => setTableModalOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveTable}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mail Modal */}
      <Dialog open={mailModalOpen} onOpenChange={setMailModalOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>发送邮件</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>收件人 *</Label>
              <Input value={mTo} onChange={(e) => setMTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>主题 *</Label>
              <Input
                value={mSubject}
                onChange={(e) => setMSubject(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>正文 *</Label>
              <Textarea
                value={mBody}
                onChange={(e) => setMBody(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMailModalOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSendMail}>发送</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
