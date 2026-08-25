import { InlineError } from "@/components/InlineError";
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
import { TextareaWithCounter } from "@/components/ui/textarea-counter";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useFieldErrors } from "@/hooks/useFieldErrors";
import { confirm } from "@/lib/confirm";
import { message } from "@/lib/message";
import { cn } from "@/lib/utils";
import { getList, request } from "@/services/api";
import { can } from "@/services/permission";
import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import {
  History,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledTask | null>(null);
  const [logModal, setLogModal] = useState(false);
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [logTaskId, setLogTaskId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logLoadingId, setLogLoadingId] = useState<number | null>(null);
  const [handlersLoading, setHandlersLoading] = useState(false);
  const [handlersError, setHandlersError] = useState(false);
  const [logsError, setLogsError] = useState(false);
  const [logPage, setLogPage] = useState(0);
  const [logPageSize, setLogPageSize] = useState(20);
  const [logTotal, setLogTotal] = useState(0);

  const [fName, setFName] = useState("");
  const [fCron, setFCron] = useState("");
  const [fHandler, setFHandler] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fStatus, setFStatus] = useState("enabled");
  const [handlers, setHandlers] = useState<HandlerInfo[]>([]);
  const formErrors = useFieldErrors();
  const tasksRequestIdRef = useRef(0);
  const tasksFetchingRef = useRef(false);
  const handlersRequestIdRef = useRef(0);
  const logsRequestIdRef = useRef(0);
  const logsOpeningRef = useRef(false);
  const savingRef = useRef(false);
  const busyRef = useRef(false);
  const handlersOpeningRef = useRef(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const loadData = useCallback(
    async (force = false) => {
      if (tasksFetchingRef.current && !force) return;
      tasksFetchingRef.current = true;
      setLoading(true);
      const requestId = ++tasksRequestIdRef.current;
      try {
        const res = await getList<ScheduledTask>("scheduled-tasks", {
          _start: page * pageSize,
          _end: (page + 1) * pageSize,
        });
        if (requestId !== tasksRequestIdRef.current) return;
        setData(res.data);
        setTotal(res.total);
        setLoadError(false);
      } catch (e: unknown) {
        // 非关键：数据加载失败时保留旧数据，不阻塞页面
        if (requestId !== tasksRequestIdRef.current) return;
        if (e instanceof Error) message.error(`加载失败: ${e.message}`);
        setLoadError(true);
      } finally {
        if (requestId === tasksRequestIdRef.current) {
          setLoading(false);
          tasksFetchingRef.current = false;
        }
      }
    },
    [page, pageSize],
  );

  useEffect(() => {
    void loadData(true);
    return () => {
      tasksRequestIdRef.current += 1;
      tasksFetchingRef.current = false;
    };
  }, [loadData]);

  const loadHandlers = useCallback(async () => {
    if (handlersOpeningRef.current) return;
    handlersOpeningRef.current = true;
    setHandlersLoading(true);
    setHandlersError(false);
    const requestId = ++handlersRequestIdRef.current;
    try {
      const res = await request<HandlerInfo[]>("/scheduled-tasks/handlers");
      if (requestId !== handlersRequestIdRef.current) return;
      setHandlers(Array.isArray(res) ? res : []);
    } catch (e: unknown) {
      if (requestId !== handlersRequestIdRef.current) return;
      setHandlers([]);
      setHandlersError(true);
      if (e instanceof Error) message.error(`加载失败: ${e.message}`);
    } finally {
      if (requestId === handlersRequestIdRef.current) setHandlersLoading(false);
      handlersOpeningRef.current = false;
    }
  }, []);

  useEffect(() => {
    void loadHandlers();
    return () => {
      handlersRequestIdRef.current += 1;
      handlersOpeningRef.current = false;
    };
  }, [loadHandlers]);

  const openCreate = () => {
    setEditing(null);
    setFName("");
    setFCron("");
    setFHandler("");
    setFDesc("");
    setFStatus("enabled");
    setModalOpen(true);
    formErrors.clearErrors();
  };

  const openEdit = (r: ScheduledTask) => {
    setEditing(r);
    setFName(r.name);
    setFCron(r.cron_expr);
    setFHandler(r.handler);
    setFDesc(r.description || "");
    setFStatus(r.status);
    setModalOpen(true);
    formErrors.clearErrors();
  };

  const handleSave = async () => {
    if (saving) return;
    if (savingRef.current) return;
    if (handlersLoading || handlersError) {
      message.error("处理器列表尚未加载完成，请稍后重试");
      return;
    }
    const nextErrors: Record<string, string> = {};
    if (!fName.trim()) nextErrors.name = "请输入任务名称";
    if (!fCron.trim()) nextErrors.cron = "请输入 Cron 表达式";
    if (!fHandler.trim()) nextErrors.handler = "请选择处理器";
    if (Object.keys(nextErrors).length > 0) {
      formErrors.setErrors(nextErrors);
      return;
    }
    formErrors.clearErrors();
    const trimmedName = fName.trim();
    const trimmedCron = fCron.trim();
    const trimmedHandler = fHandler.trim();
    const values = {
      name: trimmedName,
      cron_expr: trimmedCron,
      handler: trimmedHandler,
      description: fDesc.trim(),
      status: fStatus,
    };
    savingRef.current = true;
    setSaving(true);
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
      if (page === 0) void loadData(true);
      else setPage(0);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  const handleDelete = async (r: ScheduledTask) => {
    if (busyRef.current || busyId !== null || loading) return;
    busyRef.current = true;
    const ok = await confirm({
      title: `确定删除任务「${r.name}」？`,
      content: "删除后不可恢复",
      okVariant: "destructive",
    });
    if (!ok) {
      busyRef.current = false;
      return;
    }
    setBusyId(r.id);
    try {
      await request(`/scheduled-tasks/${r.id}`, { method: "DELETE" });
      message.success("已删除");
      const nextTotal = Math.max(0, total - 1);
      const nextMaxPage = Math.max(0, Math.ceil(nextTotal / pageSize) - 1);
      if (page > nextMaxPage) setPage(nextMaxPage);
      else void loadData(true);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusyId(null);
      busyRef.current = false;
    }
  };

  const handleTrigger = async (r: ScheduledTask) => {
    if (busyRef.current || busyId !== null || loading) return;
    busyRef.current = true;
    setBusyId(r.id);
    try {
      await request(`/scheduled-tasks/${r.id}/trigger`, { method: "POST" });
      message.success("触发成功");
      void loadData(true);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "触发失败");
    } finally {
      setBusyId(null);
      busyRef.current = false;
    }
  };

  const loadLogs = async (
    taskId: number,
    targetPage = 0,
    targetPageSize = 20,
  ) => {
    setLogsLoading(true);
    setLogLoadingId(taskId);
    setLogsError(false);
    setLogPage(targetPage);
    setLogPageSize(targetPageSize);
    const requestId = ++logsRequestIdRef.current;
    try {
      const res = await getList<TaskLog>("scheduled-tasks/logs", {
        task_id: taskId,
        _start: targetPage * targetPageSize,
        _end: (targetPage + 1) * targetPageSize,
      });
      if (requestId !== logsRequestIdRef.current) return;
      if (res.data.length === 0 && targetPage > 0) {
        void loadLogs(taskId, targetPage - 1, targetPageSize);
        return;
      }
      setLogs(res.data);
      setLogTotal(res.total);
    } catch (e: unknown) {
      if (requestId !== logsRequestIdRef.current) return;
      setLogs([]);
      setLogTotal(0);
      setLogsError(true);
      if (e instanceof Error) message.error(`加载失败: ${e.message}`);
    } finally {
      if (requestId === logsRequestIdRef.current) setLogsLoading(false);
      if (requestId === logsRequestIdRef.current) setLogLoadingId(null);
    }
  };

  const handleViewLogs = async (r: ScheduledTask) => {
    if (busyRef.current || busyId !== null || logsLoading || loading) return;
    if (logsOpeningRef.current) return;
    logsOpeningRef.current = true;
    busyRef.current = true;
    setLogTaskId(r.id);
    setLogs([]);
    setLogModal(true);
    setLogPage(0);
    setLogPageSize(20);
    setLogTotal(0);
    try {
      await loadLogs(r.id, 0, 20);
    } finally {
      logsOpeningRef.current = false;
      busyRef.current = false;
    }
  };

  const columns: ColumnDef<ScheduledTask>[] = [
    { accessorKey: "id", header: "ID" },
    {
      accessorKey: "name",
      header: "任务名称",
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
      accessorKey: "cron_expr",
      header: "Cron表达式",
      cell: ({ row }) => (
        <span
          className="block max-w-[120px] truncate"
          title={row.original.cron_expr}
        >
          {row.original.cron_expr}
        </span>
      ),
    },
    {
      accessorKey: "handler",
      header: "处理器",
      cell: ({ row }) => (
        <span
          className="block max-w-[180px] truncate"
          title={row.original.handler}
        >
          {row.original.handler}
        </span>
      ),
    },
    {
      accessorKey: "description",
      header: "描述",
      cell: ({ row }) => (
        <span
          className="block max-w-[220px] truncate"
          title={row.original.description || "-"}
        >
          {row.original.description || "-"}
        </span>
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
      accessorKey: "next_run_at",
      header: "下次执行",
      cell: ({ row }) =>
        row.original.next_run_at
          ? dayjs(row.original.next_run_at).format("YYYY-MM-DD HH:mm:ss")
          : "-",
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          {can("system:sched:update") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyId !== null || loading}
                  onClick={() => openEdit(row.original)}
                  aria-label={`编辑任务 ${row.original.name}`}
                >
                  <Pencil className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>编辑任务</TooltipContent>
            </Tooltip>
          )}
          {can("system:sched:update") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyId !== null || loading}
                  onClick={() => handleTrigger(row.original)}
                  aria-label={`触发任务 ${row.original.name}`}
                >
                  {busyId === row.original.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Play className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>触发任务</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={busyId !== null || logsLoading || loading}
                onClick={() => handleViewLogs(row.original)}
                aria-label={`查看执行日志 ${row.original.name}`}
              >
                {logsLoading && logLoadingId === row.original.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <History className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>查看执行日志</TooltipContent>
          </Tooltip>
          {can("system:sched:delete") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyId !== null || loading}
                  onClick={() => handleDelete(row.original)}
                  aria-label={`删除任务 ${row.original.name}`}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>删除任务</TooltipContent>
            </Tooltip>
          )}
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
          ? dayjs(row.original.start_time).format("YYYY-MM-DD HH:mm:ss")
          : "-",
    },
    {
      accessorKey: "end_time",
      header: "结束",
      cell: ({ row }) =>
        row.original.end_time
          ? dayjs(row.original.end_time).format("YYYY-MM-DD HH:mm:ss")
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
      cell: ({ row }) => (
        <span
          className="block max-w-[260px] truncate"
          title={row.original.output || "-"}
        >
          {row.original.output || "-"}
        </span>
      ),
    },
    {
      accessorKey: "error_message",
      header: "错误",
      cell: ({ row }) => (
        <span
          className="block max-w-[260px] truncate"
          title={row.original.error_message || "-"}
        >
          {row.original.error_message || "-"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">定时任务</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData(true)}
          >
            <RefreshCw
              className={cn("size-4 mr-1", loading && "animate-spin")}
            />
            刷新
          </Button>
          {can("system:sched:create") && (
            <Button size="sm" onClick={openCreate} disabled={loading}>
              <Plus className="size-4 mr-1" />
              新建任务
            </Button>
          )}
        </div>
      </div>

      {loadError && (
        <InlineError
          title="定时任务加载失败"
          description={"列表可能未更新，已保留原有数据。"}
          onRetry={() => void loadData(true)}
          loading={loading}
        />
      )}

      <DataTable
        columns={columns}
        data={data}
        pageSize={pageSize}
        serverSide
        total={total}
        pageIndex={page}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPage(0);
          setPageSize(size);
        }}
        loading={loading}
        emptyMessage="暂无定时任务，点击「新增任务」创建"
      />

      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          if (!open && saving) return;
          setModalOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSave();
            }}
          >
            <DialogHeader>
              <DialogTitle>{editing ? "编辑任务" : "新建任务"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <RequiredLabel htmlFor="task-name" required>
                  任务名称
                </RequiredLabel>
                <Input
                  id="task-name"
                  value={fName}
                  onChange={(e) => {
                    setFName(e.target.value);
                    formErrors.clearError("name");
                  }}
                  {...formErrors.fieldProps("name", "task-name")}
                  placeholder="例: 清理临时文件"
                />
                {formErrors.errors.name && (
                  <FormMessage
                    id="task-name-error"
                    error={formErrors.errors.name}
                  />
                )}
              </div>
              <div className="space-y-1">
                <RequiredLabel htmlFor="task-cron" required>
                  Cron 表达式
                </RequiredLabel>
                <Input
                  id="task-cron"
                  value={fCron}
                  onChange={(e) => {
                    setFCron(e.target.value);
                    formErrors.clearError("cron");
                  }}
                  {...formErrors.fieldProps("cron", "task-cron")}
                  placeholder="0 0 2 * * ?"
                />
                <p className="text-xs text-muted-foreground">
                  6-7 位：秒 分 时 日 月 周（年）。例：0 0 2 * * ? 每天 02:00
                </p>
                {formErrors.errors.cron && (
                  <FormMessage
                    id="task-cron-error"
                    error={formErrors.errors.cron}
                  />
                )}
              </div>
              <div className="space-y-1">
                <RequiredLabel htmlFor="task-handler" required>
                  处理器
                </RequiredLabel>
                <Select
                  value={fHandler}
                  onValueChange={(v) => {
                    setFHandler(v);
                    formErrors.clearError("handler");
                  }}
                  disabled={handlersLoading}
                >
                  <SelectTrigger
                    id="task-handler"
                    {...formErrors.fieldProps("handler", "task-handler")}
                    aria-busy={handlersLoading || undefined}
                  >
                    {handlersLoading ? (
                      "加载处理器…"
                    ) : (
                      <SelectValue placeholder="选择已注册的处理器" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {handlers.length === 0 ? (
                      <div className="py-4 text-center text-sm text-muted-foreground">
                        暂无已注册的处理器
                      </div>
                    ) : (
                      handlers.map((h) => (
                        <SelectItem key={h.name} value={h.name}>
                          {h.display_name}（{h.name}）
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {formErrors.errors.handler && (
                  <FormMessage
                    id="task-handler-error"
                    error={formErrors.errors.handler}
                  />
                )}
                {(() => {
                  const h = handlers.find((x) => x.name === fHandler);
                  return h ? (
                    <p className="text-xs text-muted-foreground">
                      {h.description}
                    </p>
                  ) : null;
                })()}
                {handlersError && (
                  <InlineError
                    title="处理器列表加载失败"
                    description="请重试后再选择处理器"
                    loading={handlersLoading}
                    onRetry={() => {
                      void loadHandlers();
                    }}
                  />
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="task-desc">描述</Label>
                <TextareaWithCounter
                  id="task-desc"
                  placeholder="请输入描述（选填）"
                  value={fDesc}
                  maxLength={500}
                  onChange={(e) => setFDesc(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="task-status">状态</Label>
                <Select value={fStatus} onValueChange={(v) => setFStatus(v)}>
                  <SelectTrigger id="task-status">
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
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => {
                  if (saving) return;
                  setModalOpen(false);
                }}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={saving || handlersLoading || handlersError}
              >
                {saving ? (
                  <Loader2 className="size-4 mr-1 animate-spin" />
                ) : null}
                保存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={logModal}
        onOpenChange={(open) => {
          if (!open) {
            logsRequestIdRef.current += 1;
            logsOpeningRef.current = false;
            setLogs([]);
            setLogTaskId(null);
            setLogsError(false);
            setLogPage(0);
            setLogTotal(0);
            setLogsLoading(false);
            setLogLoadingId(null);
          }
          setLogModal(open);
        }}
      >
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>执行日志</DialogTitle>
          </DialogHeader>
          {logsError && (
            <InlineError
              title="执行日志加载失败"
              description="日志可能未加载，请重试后再查看"
              loading={logsLoading}
              onRetry={() => {
                if (logTaskId) void loadLogs(logTaskId, logPage, logPageSize);
              }}
            />
          )}
          <DataTable
            columns={logColumns}
            data={logs}
            pageSize={logPageSize}
            serverSide
            total={logTotal}
            pageIndex={logPage}
            onPageChange={(nextPage) => {
              if (logTaskId) void loadLogs(logTaskId, nextPage, logPageSize);
            }}
            onPageSizeChange={(nextSize) => {
              if (logTaskId) void loadLogs(logTaskId, 0, nextSize);
            }}
            loading={logsLoading}
            loadingMessage="加载执行日志…"
            emptyMessage="该任务暂无执行日志"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};
