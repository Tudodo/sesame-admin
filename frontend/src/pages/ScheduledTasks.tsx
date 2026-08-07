import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { request } from "@/services/api";
import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { History, Pencil, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";

interface ScheduledTask {
  id: number;
  name: string;
  cron_expr: string;
  handler: string;
  params: Record<string, unknown>;
  status: string;
  description: string;
  last_run_at: string;
  next_run_at: string;
  created_at: string;
  updated_at: string;
}

interface HandlerInfo {
  name: string;
  display_name: string;
  description: string;
}

interface TaskLog {
  id: number;
  task_id: number;
  start_time: string;
  end_time: string;
  status: string;
  output: string;
  error_message: string;
}

export const ScheduledTasksPage: React.FC = () => {
  const [data, setData] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledTask | null>(null);
  const [logModal, setLogModal] = useState(false);
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [logTaskId, setLogTaskId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [fName, setFName] = useState("");
  const [fCron, setFCron] = useState("");
  const [fHandler, setFHandler] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fStatus, setFStatus] = useState("enabled");
  const [handlers, setHandlers] = useState<HandlerInfo[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request<ScheduledTask[]>(
        "/scheduled-tasks?_start=0&_end=100",
      );
      setData(Array.isArray(res) ? res : []);
    } catch (e: unknown) {
      // 非关键：数据加载失败时保留旧数据，不阻塞页面
      if (e instanceof Error) message.error(`加载失败: ${e.message}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    (async () => {
      try {
        const res = await request<HandlerInfo[]>("/scheduled-tasks/handlers");
        setHandlers(Array.isArray(res) ? res : []);
      } catch {
        setHandlers([]);
      }
    })();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setFName("");
    setFCron("");
    setFHandler("");
    setFDesc("");
    setFStatus("enabled");
    setModalOpen(true);
  };

  const openEdit = (r: ScheduledTask) => {
    setEditing(r);
    setFName(r.name);
    setFCron(r.cron_expr);
    setFHandler(r.handler);
    setFDesc(r.description || "");
    setFStatus(r.status);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!fName.trim() || !fCron.trim() || !fHandler.trim()) {
      message.warning("请填写必填项");
      return;
    }
    const values = {
      name: fName,
      cron_expr: fCron,
      handler: fHandler,
      description: fDesc,
      status: fStatus,
    };
    try {
      if (editing) {
        await request(`/scheduled-tasks/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(values),
        });
        message.success("更新成功");
      } else {
        await request("/scheduled-tasks", {
          method: "POST",
          body: JSON.stringify(values),
        });
        message.success("创建成功");
      }
      setModalOpen(false);
      loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  const handleDelete = async (r: ScheduledTask) => {
    const ok = await confirm({
      title: "删除任务",
      content: `确定删除 ${r.name}？`,
      okVariant: "destructive",
    });
    if (!ok) return;
    setBusyId(r.id);
    try {
      await request(`/scheduled-tasks/${r.id}`, { method: "DELETE" });
      message.success("已删除");
      loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusyId(null);
    }
  };

  const handleTrigger = async (r: ScheduledTask) => {
    setBusyId(r.id);
    try {
      await request(`/scheduled-tasks/${r.id}/trigger`, { method: "POST" });
      message.success("触发成功");
      loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "触发失败");
    } finally {
      setBusyId(null);
    }
  };

  const handleViewLogs = async (r: ScheduledTask) => {
    setLogTaskId(r.id);
    setLogModal(true);
    try {
      const res = await request<TaskLog[]>(
        `/scheduled-tasks/logs?task_id=${r.id}&_start=0&_end=50`,
      );
      setLogs(Array.isArray(res) ? res : []);
    } catch {
      setLogs([]);
    }
  };

  const columns: ColumnDef<ScheduledTask>[] = [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "name", header: "任务名称" },
    { accessorKey: "cron_expr", header: "Cron表达式" },
    { accessorKey: "handler", header: "处理器" },
    {
      accessorKey: "description",
      header: "描述",
      cell: ({ row }) => row.original.description || "-",
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
          {row.original.status === "enabled" ? "启用" : "禁用"}
        </Badge>
      ),
    },
    {
      accessorKey: "last_run_at",
      header: "上次执行",
      cell: ({ row }) =>
        row.original.last_run_at
          ? dayjs(row.original.last_run_at).format("YYYY-MM-DD HH:mm:ss")
          : "-",
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEdit(row.original)}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busyId === row.original.id}
            onClick={() => handleTrigger(row.original)}
          >
            <Play className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleViewLogs(row.original)}
          >
            <History className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busyId === row.original.id}
            onClick={() => handleDelete(row.original)}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  const logColumns: ColumnDef<TaskLog>[] = [
    { accessorKey: "id", header: "ID" },
    {
      accessorKey: "start_time",
      header: "开始",
      cell: ({ row }) =>
        row.original.start_time
          ? dayjs(row.original.start_time).format("MM-DD HH:mm:ss")
          : "-",
    },
    {
      accessorKey: "end_time",
      header: "结束",
      cell: ({ row }) =>
        row.original.end_time
          ? dayjs(row.original.end_time).format("MM-DD HH:mm:ss")
          : "-",
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => (
        <Badge
          variant={
            row.original.status === "success" ? "default" : "destructive"
          }
        >
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: "output",
      header: "输出",
      cell: ({ row }) => row.original.output || "-",
    },
    {
      accessorKey: "error_message",
      header: "错误",
      cell: ({ row }) => row.original.error_message || "-",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">定时任务</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw
              className={cn("size-4 mr-1", loading && "animate-spin")}
            />
            刷新
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4 mr-1" />
            新建任务
          </Button>
        </div>
      </div>

      <DataTable columns={columns} data={data} pageSize={20} />

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑任务" : "新建任务"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>任务名称 *</Label>
              <Input
                value={fName}
                onChange={(e) => setFName(e.target.value)}
                placeholder="例: 清理临时文件"
              />
            </div>
            <div className="space-y-1">
              <Label>Cron 表达式 *</Label>
              <Input
                value={fCron}
                onChange={(e) => setFCron(e.target.value)}
                placeholder="0 0 2 * * ?"
              />
            </div>
            <div className="space-y-1">
              <Label>处理器 *</Label>
              <Select value={fHandler} onValueChange={(v) => setFHandler(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="选择已注册的处理器" />
                </SelectTrigger>
                <SelectContent>
                  {handlers.map((h) => (
                    <SelectItem key={h.name} value={h.name}>
                      {h.display_name}（{h.name}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(() => {
                const h = handlers.find((x) => x.name === fHandler);
                return h ? (
                  <p className="text-xs text-muted-foreground">
                    {h.description}
                  </p>
                ) : null;
              })()}
            </div>
            <div className="space-y-1">
              <Label>描述</Label>
              <Textarea
                value={fDesc}
                onChange={(e) => setFDesc(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-1">
              <Label>状态</Label>
              <Select value={fStatus} onValueChange={(v) => setFStatus(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="enabled">启用</SelectItem>
                  <SelectItem value="disabled">禁用</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={logModal} onOpenChange={setLogModal}>
        <DialogContent className="sm:max-w-[800px]">
          <DialogHeader>
            <DialogTitle>执行日志</DialogTitle>
          </DialogHeader>
          <DataTable columns={logColumns} data={logs} pageSize={20} />
        </DialogContent>
      </Dialog>
    </div>
  );
};
