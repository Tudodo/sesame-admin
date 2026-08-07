import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { confirm } from "@/lib/confirm";
import { message } from "@/lib/message";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/services/api";
import { can } from "@/services/permission";
import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";

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
}

interface QueueInfo {
  jobs: QueueJobItem[];
  stats: QueueStats;
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
  });
  const [loading, setLoading] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);
  const [clearLoading, setClearLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<QueueInfo>("/api/queue");
      setStats(
        data?.stats || {
          connected: false,
          provider: "N/A",
          total: 0,
          queued: 0,
          processing: 0,
          completed: 0,
          failed: 0,
          cancelled: 0,
        },
      );
      setJobs(data?.jobs || []);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "加载任务队列失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async (item: QueueJobItem) => {
    const ok = await confirm({
      title: "删除队列任务",
      content: `确定删除任务 ${item.name}（${item.id}）？处理中的任务不能删除。`,
      okVariant: "destructive",
    });
    if (!ok) return;
    setDeleteLoadingId(item.id);
    try {
      await apiFetch(`/api/queue/${encodeURIComponent(item.id)}`, {
        method: "DELETE",
      });
      message.success("已删除");
      fetchData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleteLoadingId(null);
    }
  };

  const handleClear = async () => {
    const ok = await confirm({
      title: "清理已结束任务",
      content:
        "确定清理已完成、失败、已取消的任务？待执行和处理中的任务会保留。",
      okVariant: "destructive",
    });
    if (!ok) return;
    setClearLoading(true);
    try {
      await apiFetch("/api/queue/clear", { method: "POST" });
      message.success("已清理");
      fetchData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "清理失败");
    } finally {
      setClearLoading(false);
    }
  };

  const canDelete = can("system:job:delete");
  const columns: ColumnDef<QueueJobItem>[] = [
    {
      accessorKey: "id",
      header: "任务ID",
      cell: ({ row }) => (
        <code className="text-xs">{row.original.id.substring(0, 16)}...</code>
      ),
    },
    { accessorKey: "name", header: "任务" },
    {
      accessorKey: "queue",
      header: "队列",
      cell: ({ row }) => row.original.queue || "-",
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => statusBadge(row.original.status),
    },
    {
      accessorKey: "tags",
      header: "标签",
      cell: ({ row }) =>
        (row.original.tags || []).length > 0
          ? (row.original.tags || []).join(", ")
          : "-",
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
          <Button
            variant="ghost"
            size="sm"
            aria-label="删除队列任务"
            disabled={
              deleteLoadingId === row.original.id ||
              row.original.status === "processing"
            }
            onClick={() => handleDelete(row.original)}
          >
            {deleteLoadingId === row.original.id ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4 text-destructive" />
            )}
          </Button>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">任务总数</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">待执行</p>
            <p className="text-2xl font-bold">{stats.queued}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">处理中</p>
            <p className="text-2xl font-bold">{stats.processing}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">失败</p>
            <p className="text-2xl font-bold">{stats.failed}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={fetchData}
          disabled={loading}
        >
          <RefreshCw className={cn("size-4 mr-1", loading && "animate-spin")} />
          刷新
        </Button>
        {canDelete && (
          <Button
            variant="destructive"
            size="sm"
            disabled={clearLoading}
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

      <DataTable
        columns={columns}
        data={jobs}
        pageSize={50}
        emptyMessage="队列中暂无任务"
      />
    </div>
  );
};
