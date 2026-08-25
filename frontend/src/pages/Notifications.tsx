import { InlineError } from "@/components/InlineError";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { message } from "@/lib/message";
import { navigate } from "@/lib/navigation";
import { NOTIFICATION_READ_EVENT } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { request } from "@/services/api";
import { resolveDataSource } from "@/services/dataSource";
import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { Check, CheckCheck, Loader2, RefreshCw } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

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
  workflow: "工作流",
  task: "任务",
  remind: "催办",
  overdue: "超时",
  system: "系统",
  alert: "告警",
};

const DEFAULT_PAGE_SIZE = 20;

export const NotificationsPage: React.FC = () => {
  const [data, setData] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [readLoadingId, setReadLoadingId] = useState<number | null>(null);
  const [readAllLoading, setReadAllLoading] = useState(false);
  const [typeLabels, setTypeLabels] =
    useState<Record<string, string>>(FALLBACK_TYPE_LABELS);
  const [typeLabelsLoading, setTypeLabelsLoading] = useState(false);
  const [typeLabelsError, setTypeLabelsError] = useState(false);
  const pageRef = useRef(0);
  const requestIdRef = useRef(0);
  const failedPageRef = useRef<number | null>(null);
  const typeLabelsRequestRef = useRef(0);
  const dataSignatureRef = useRef<string | null>(null);
  const typeLabelsSignatureRef = useRef<string | null>(null);
  const readActionRef = useRef(false);

  const loadTypeLabels = useCallback(async () => {
    if (typeLabelsSignatureRef.current) return;
    typeLabelsSignatureRef.current = "notification-type-labels";
    const requestId = ++typeLabelsRequestRef.current;
    setTypeLabelsLoading(true);
    setTypeLabelsError(false);
    try {
      const opts = await resolveDataSource({
        type: "dictionary",
        code: "notification_type",
      });
      if (requestId !== typeLabelsRequestRef.current) return;
      const map: Record<string, string> = {};
      for (const o of opts) map[String(o.value)] = o.label;
      setTypeLabels(map);
    } catch {
      if (requestId !== typeLabelsRequestRef.current) return;
      setTypeLabels(FALLBACK_TYPE_LABELS);
      setTypeLabelsError(true);
    } finally {
      if (requestId === typeLabelsRequestRef.current) {
        typeLabelsSignatureRef.current = null;
        setTypeLabelsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadTypeLabels();
    return () => {
      typeLabelsRequestRef.current += 1;
      typeLabelsSignatureRef.current = null;
    };
  }, [loadTypeLabels]);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      typeLabelsRequestRef.current += 1;
      dataSignatureRef.current = null;
      typeLabelsSignatureRef.current = null;
    };
  }, []);

  const loadData = useCallback(
    async (
      targetPage: number,
      targetPageSize = DEFAULT_PAGE_SIZE,
      force = false,
    ) => {
      const signature = `${targetPage}:${targetPageSize}`;
      if (!force && dataSignatureRef.current === signature) return;
      dataSignatureRef.current = signature;
      setLoading(true);
      const previousPage = pageRef.current;
      pageRef.current = targetPage;
      setPage(targetPage);
      const requestId = ++requestIdRef.current;
      failedPageRef.current = null;
      try {
        const start = targetPage * targetPageSize;
        const res = await request<NotificationListResponse>(
          `/notifications?_start=${start}&_end=${start + targetPageSize}`,
        );
        if (requestId !== requestIdRef.current) return;
        setData(Array.isArray(res?.data) ? res.data : []);
        setTotal(Number(res?.total) || 0);
        setLoadError(false);
      } catch (e: unknown) {
        if (requestId !== requestIdRef.current) return;
        pageRef.current = previousPage;
        setPage(previousPage);
        failedPageRef.current = targetPage;
        message.error(e instanceof Error ? e.message : "加载通知失败");
        setLoadError(true);
      } finally {
        if (requestId === requestIdRef.current) {
          if (dataSignatureRef.current === signature) {
            dataSignatureRef.current = null;
          }
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void loadData(0, DEFAULT_PAGE_SIZE, true);
    return () => {
      requestIdRef.current += 1;
      dataSignatureRef.current = null;
    };
  }, [loadData]);

  const handleMarkRead = async (id: number, reload = true) => {
    if (readLoadingId !== null || readAllLoading || loading) return;
    if (readActionRef.current) return;
    readActionRef.current = true;
    setReadLoadingId(id);
    try {
      await request(`/notifications/${id}/read`, { method: "POST" });
      message.success("已标记为已读");
      window.dispatchEvent(new CustomEvent(NOTIFICATION_READ_EVENT));
      setData((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, is_read: true } : item,
        ),
      );
      if (reload) await loadData(page, pageSize, true);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setReadLoadingId(null);
      readActionRef.current = false;
    }
  };

  const handleReadAll = async () => {
    if (readLoadingId !== null || readAllLoading || loading) return;
    if (readActionRef.current) return;
    readActionRef.current = true;
    setReadAllLoading(true);
    try {
      await request("/notifications/read-all", { method: "POST" });
      message.success("全部标记为已读");
      window.dispatchEvent(new CustomEvent(NOTIFICATION_READ_EVENT));
      await loadData(page, pageSize, true);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setReadAllLoading(false);
      readActionRef.current = false;
    }
  };

  const columns: ColumnDef<Notification>[] = [
    {
      accessorKey: "title",
      header: "标题",
      cell: ({ row }) => (
        <button
          type="button"
          className="block max-w-[260px] truncate text-left font-medium hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          title={row.original.title}
          disabled={readLoadingId !== null || readAllLoading || loading}
          onClick={() => {
            if (readLoadingId !== null || readAllLoading || loading) return;
            if (!row.original.is_read)
              void handleMarkRead(row.original.id, false);
            const target =
              row.original.link ||
              (row.original.notification_type === "task"
                ? "/workflow/tasks"
                : null);
            if (!target) {
              message.warning("该通知没有可跳转的链接");
              return;
            }
            if (!navigate(target)) {
              message.warning("通知链接无效，请查看相关流程或联系管理员");
            }
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
        <span
          className="text-muted-foreground truncate max-w-[300px] inline-block"
          title={row.original.content}
        >
          {row.original.content}
        </span>
      ),
    },
    {
      accessorKey: "notification_type",
      header: "类型",
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className="max-w-[140px] truncate"
          title={
            typeLabels[row.original.notification_type] ||
            row.original.notification_type
          }
        >
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
            disabled={readLoadingId !== null || readAllLoading || loading}
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">通知中心</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(page, pageSize, true)}
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            刷新
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={readAllLoading || readLoadingId !== null || loading}
            onClick={handleReadAll}
          >
            <CheckCheck className="size-4 mr-1" />
            {readAllLoading ? "处理中…" : "全部已读"}
          </Button>
        </div>
      </div>

      {loadError && (
        <InlineError
          title="通知加载失败"
          description={"网络异常或服务暂时不可用，请重试。"}
          onRetry={() =>
            loadData(failedPageRef.current ?? page, pageSize, true)
          }
          loading={loading}
        />
      )}

      {typeLabelsError && (
        <InlineError
          title="通知类型字典加载失败"
          description="已使用内置类型标签，可重试加载字典配置。"
          onRetry={loadTypeLabels}
          loading={typeLabelsLoading}
        />
      )}

      <DataTable
        columns={columns}
        data={data}
        pageSize={pageSize}
        emptyMessage="暂无通知"
        serverSide
        total={total}
        pageIndex={page}
        onPageChange={(nextPage) => loadData(nextPage, pageSize, true)}
        onPageSizeChange={(size) => {
          setPageSize(size);
          loadData(0, size, true);
        }}
        loading={loading}
      />
    </div>
  );
};
