import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { message } from "@/lib/message";
import { navigate } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { request } from "@/services/api";
import { resolveDataSource } from "@/services/dataSource";
import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { Check, CheckCheck, Loader2, RefreshCw } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";

interface Notification {
  id: number;
  user_id: string;
  title: string;
  content: string;
  notification_type: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationListResponse {
  data: Notification[];
  total: number;
  page: number;
  page_size: number;
}

// 通知类型标签：从字典 notification_type 动态加载。
// 回退常量仅在网络失败时兜底。
const FALLBACK_TYPE_LABELS: Record<string, string> = {
  task: "任务",
  remind: "催办",
  overdue: "超时",
  system: "系统",
  alert: "告警",
};

const PAGE_SIZE = 20;

export const NotificationsPage: React.FC = () => {
  const [data, setData] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [readLoadingId, setReadLoadingId] = useState<number | null>(null);
  const [readAllLoading, setReadAllLoading] = useState(false);
  const [typeLabels, setTypeLabels] =
    useState<Record<string, string>>(FALLBACK_TYPE_LABELS);

  useEffect(() => {
    resolveDataSource({ type: "dictionary", code: "notification_type" })
      .then((opts) => {
        const map: Record<string, string> = {};
        for (const o of opts) map[String(o.value)] = o.label;
        setTypeLabels(map);
      })
      .catch(() => setTypeLabels(FALLBACK_TYPE_LABELS));
  }, []);

  const loadData = useCallback(async (targetPage: number) => {
    setLoading(true);
    try {
      const start = targetPage * PAGE_SIZE;
      const res = await request<NotificationListResponse>(
        `/notifications?_start=${start}&_end=${start + PAGE_SIZE}`,
      );
      setData(Array.isArray(res?.data) ? res.data : []);
      setTotal(Number(res?.total) || 0);
      setPage(targetPage);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "加载通知失败");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData(0);
  }, [loadData]);

  const handleMarkRead = async (id: number) => {
    setReadLoadingId(id);
    try {
      await request(`/notifications/${id}/read`, { method: "POST" });
      message.success("已标记为已读");
      loadData(page);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setReadLoadingId(null);
    }
  };

  const handleReadAll = async () => {
    setReadAllLoading(true);
    try {
      await request("/notifications/read-all", { method: "POST" });
      message.success("全部标记为已读");
      loadData(0);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setReadAllLoading(false);
    }
  };

  const columns: ColumnDef<Notification>[] = [
    {
      accessorKey: "title",
      header: "标题",
      cell: ({ row }) => (
        <button
          type="button"
          className="text-left font-medium hover:text-primary"
          onClick={() => {
            if (!row.original.is_read) handleMarkRead(row.original.id);
            const target = row.original.link || null;
            if (target) navigate(target);
          }}
        >
          {row.original.title}
        </button>
      ),
    },
    {
      accessorKey: "content",
      header: "内容",
      cell: ({ row }) => (
        <span className="text-muted-foreground truncate max-w-[300px] inline-block">
          {row.original.content}
        </span>
      ),
    },
    {
      accessorKey: "notification_type",
      header: "类型",
      cell: ({ row }) => (
        <Badge variant="outline">
          {typeLabels[row.original.notification_type] ||
            row.original.notification_type}
        </Badge>
      ),
    },
    {
      accessorKey: "is_read",
      header: "已读",
      cell: ({ row }) => (
        <Badge variant={row.original.is_read ? "secondary" : "default"}>
          {row.original.is_read ? "已读" : "未读"}
        </Badge>
      ),
    },
    {
      accessorKey: "created_at",
      header: "时间",
      cell: ({ row }) =>
        row.original.created_at
          ? dayjs(row.original.created_at).format("YYYY-MM-DD HH:mm:ss")
          : "-",
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) =>
        !row.original.is_read ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={readLoadingId === row.original.id}
            onClick={() => handleMarkRead(row.original.id)}
          >
            {readLoadingId === row.original.id ? (
              <Loader2 className="size-4 mr-1 animate-spin" />
            ) : (
              <Check className="size-4 mr-1" />
            )}
            标为已读
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">通知中心</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => loadData(page)}
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            刷新
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={readAllLoading}
            onClick={handleReadAll}
          >
            <CheckCheck className="size-4 mr-1" />
            {readAllLoading ? "处理中..." : "全部已读"}
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data}
        pageSize={PAGE_SIZE}
        emptyMessage="暂无通知"
        serverSide
        total={total}
        pageIndex={page}
        onPageChange={(nextPage) => loadData(nextPage)}
      />
    </div>
  );
};
