import { InlineError } from "@/components/InlineError";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePageVisibility } from "@/hooks/usePageVisibility";
import { confirm } from "@/lib/confirm";
import { message } from "@/lib/message";
import { cn } from "@/lib/utils";
import { apiFetch, getListWithMeta } from "@/services/api";
import { can } from "@/services/permission";
import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

interface QueueJobItem {
  id: string;
  name: string;
  queue: string | null;
  status: string;
  tags: string[];
  created_at: string | null;
  updated_at: string | null;
  run_at: string | null;
}

interface QueueStats {
  connected: boolean;
  provider: string;
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  truncated?: boolean;
}

function statusBadge(status: string) {
  const map: Record<
    string,
    {
      label: string;
      variant:
        | "default"
        | "secondary"
        | "destructive"
        | "success"
        | "warning"
        | "outline";
    }
  > = {
    queued: { label: "待执行", variant: "secondary" },
    processing: { label: "处理中", variant: "warning" },
    completed: { label: "已完成", variant: "success" },
    failed: { label: "失败", variant: "destructive" },
    cancelled: { label: "已取消", variant: "outline" },
  };
  const item = map[status] || { label: status, variant: "secondary" as const };
  return <Badge variant={item.variant}>{item.label}</Badge>;
}

export const JobQueuePage: React.FC = () => {
  const [jobs, setJobs] = useState<QueueJobItem[]>([]);
  const [stats, setStats] = useState<QueueStats>({
    connected: false,
    provider: "N/A",
    total: 0,
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    truncated: false,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);
  const [clearLoading, setClearLoading] = useState(false);
  const requestIdRef = useRef(0);
  const fetchingRef = useRef(false);
  const queueActionRef = useRef(false);

  const queueState = !hasLoaded
    ? "loading"
    : loadError || stats.connected === false
      ? "unavailable"
      : "connected";
  const queueUnavailable = queueState === "unavailable";
  const displayCount = (value: number) =>
    queueState === "loading" || queueUnavailable ? "-" : String(value);

  const fetchData = useCallback(
    async (force = false) => {
      if (fetchingRef.current && !force) return;
      fetchingRef.current = true;
      setLoading(true);
      const requestId = ++requestIdRef.current;
      try {
        const result = await getListWithMeta<
          QueueJobItem,
          { stats: QueueStats }
        >("queue", {
          _start: page * pageSize,
          _end: (page + 1) * pageSize,
        });
        if (requestId !== requestIdRef.current) return;
        setHasLoaded(true);
        setStats(
          result.meta.stats || {
            connected: false,
            provider: "N/A",
            total: 0,
            queued: 0,
            processing: 0,
            completed: 0,
            failed: 0,
            cancelled: 0,
            truncated: false,
          },
        );
        if (result.data.length === 0 && page > 0) {
          // 先保留旧列表和总数，避免 DataTable 在回退页加载前误判越界并跳到第一页。
          setPage(page - 1);
          return;
        }
        setJobs(result.data);
        setTotal(result.total);
        setLoadError(false);
      } catch (e: unknown) {
        if (requestId !== requestIdRef.current) return;
        setHasLoaded(true);
        message.error(e instanceof Error ? e.message : "加载任务队列失败");
        setLoadError(true);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          fetchingRef.current = false;
        }
      }
    },
    [page, pageSize],
  );

  useEffect(() => {
    void fetchData(true);
    return () => {
      requestIdRef.current += 1;
      fetchingRef.current = false;
    };
  }, [fetchData]);

  const pageVisible = usePageVisibility();
  const queueBusy = deleteLoadingId !== null || clearLoading;
  useEffect(() => {
    if (queueBusy || !pageVisible) return;
    const t = setInterval(() => void fetchData(true), 30000);
    return () => clearInterval(t);
  }, [fetchData, queueBusy, pageVisible]);

  const handleDelete = async (item: QueueJobItem) => {
    if (deleteLoadingId !== null || clearLoading || loading) return;
    if (queueActionRef.current) return;
    queueActionRef.current = true;
    const ok = await confirm({
      title: `确定删除队列任务「${item.name}」？`,
      content: `任务ID ${item.id}，删除后不可恢复；处理中的任务不能删除。`,
      okVariant: "destructive",
    });
    if (!ok) {
      queueActionRef.current = false;
      return;
    }
    setDeleteLoadingId(item.id);
    try {
      await apiFetch(`/api/queue/${encodeURIComponent(item.id)}`, {
        method: "DELETE",
      });
      message.success("已删除");
      fetchData(true);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleteLoadingId(null);
      queueActionRef.current = false;
    }
  };

  const handleClear = async () => {
    if (deleteLoadingId !== null || clearLoading || loading) return;
    if (queueActionRef.current) return;
    queueActionRef.current = true;
    const ok = await confirm({
      title: "清理已结束任务",
      content:
        "确定清理已完成、失败、已取消的任务？清理后不可恢复；待执行和处理中的任务会保留。",
      okVariant: "destructive",
    });
    if (!ok) {
      queueActionRef.current = false;
      return;
    }
    setClearLoading(true);
    try {
      await apiFetch("/api/queue/clear", { method: "POST" });
      message.success("已清理");
      fetchData(true);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "清理失败");
    } finally {
      setClearLoading(false);
      queueActionRef.current = false;
    }
  };

  const canDelete = can("system:job:delete");
  const columns: ColumnDef<QueueJobItem>[] = [
    {
      accessorKey: "id",
      header: "任务ID",
      cell: ({ row }) => (
        <code className="text-xs" title={row.original.id}>
          {row.original.id.substring(0, 16)}...
        </code>
      ),
    },
    {
      accessorKey: "name",
      header: "任务",
      cell: ({ row }) => (
        <span
          className="block max-w-[220px] truncate"
          title={row.original.name}
        >
          {row.original.name}
        </span>
      ),
    },
    {
      accessorKey: "queue",
      header: "队列",
      cell: ({ row }) => (
        <span
          className="block max-w-[160px] truncate"
          title={row.original.queue || "-"}
        >
          {row.original.queue || "-"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => statusBadge(row.original.status),
    },
    {
      accessorKey: "tags",
      header: "标签",
      cell: ({ row }) => {
        const tags = (row.original.tags || []).join(", ");
        return (
          <span className="block max-w-[220px] truncate" title={tags}>
            {tags || "-"}
          </span>
        );
      },
    },
    {
      accessorKey: "created_at",
      header: "创建时间",
      cell: ({ row }) =>
        row.original.created_at
          ? dayjs(row.original.created_at).format("YYYY-MM-DD HH:mm:ss")
          : "-",
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) =>
        canDelete ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`删除队列任务 ${row.original.name}`}
                disabled={
                  queueBusy ||
                  row.original.status === "processing" ||
                  queueUnavailable ||
                  loading
                }
                onClick={() => handleDelete(row.original)}
              >
                {deleteLoadingId === row.original.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4 text-destructive" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>删除队列任务</TooltipContent>
          </Tooltip>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">任务队列</h2>
        <p className="text-sm text-muted-foreground mt-1">
          后台任务（邮件、导出、同步）的状态和执行队列。缓存请前往缓存管理。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={
            queueState === "connected"
              ? "success"
              : queueState === "unavailable"
                ? "destructive"
                : "secondary"
          }
        >
          {queueState === "loading"
            ? "状态加载中…"
            : queueState === "unavailable"
              ? "队列未连接"
              : "队列已连接"}
        </Badge>
        {queueState === "connected" &&
          stats.provider &&
          stats.provider !== "N/A" && (
            <span className="text-xs text-muted-foreground">
              {stats.provider}
            </span>
          )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">任务总数</p>
            <p className="text-2xl font-bold">{displayCount(stats.total)}</p>
            {stats.truncated && (
              <p className="text-xs text-muted-foreground">仅统计前 1000 条</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">待执行</p>
            <p className="text-2xl font-bold">{displayCount(stats.queued)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">处理中</p>
            <p className="text-2xl font-bold">
              {displayCount(stats.processing)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">失败</p>
            <p className="text-2xl font-bold">{displayCount(stats.failed)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void fetchData(true)}
        >
          <RefreshCw className={cn("size-4 mr-1", loading && "animate-spin")} />
          刷新
        </Button>
        {canDelete && (
          <Button
            variant="destructive"
            size="sm"
            disabled={queueBusy || queueUnavailable || !hasLoaded || loading}
            onClick={handleClear}
          >
            {clearLoading ? (
              <Loader2 className="size-4 mr-1 animate-spin" />
            ) : (
              <Trash2 className="size-4 mr-1" />
            )}
            清理已结束
          </Button>
        )}
      </div>

      {loadError && (
        <InlineError
          title="任务队列加载失败"
          description={"队列数据可能未更新，已保留原有数据。"}
          onRetry={() => void fetchData(true)}
          loading={loading}
        />
      )}

      <DataTable
        columns={columns}
        data={jobs}
        loading={loading}
        emptyMessage="队列中暂无任务"
        pageSize={pageSize}
        serverSide
        total={total}
        pageIndex={page}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPage(0);
          setPageSize(size);
        }}
      />
    </div>
  );
};
