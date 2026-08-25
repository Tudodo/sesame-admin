import { InlineError } from "@/components/InlineError";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePageVisibility } from "@/hooks/usePageVisibility";
import { confirm } from "@/lib/confirm";
import { message } from "@/lib/message";
import { cn } from "@/lib/utils";
import { getList, request } from "@/services/api";
import { can } from "@/services/permission";
import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { Loader2, LogOut, RefreshCw } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

interface OnlineUserItem {
  id: string;
  user_id: string;
  user_name: string;
  login_ip: string;
  login_location: string | null;
  browser: string | null;
  os: string | null;
  login_time: string;
}

export const OnlineUsersPage: React.FC = () => {
  const [data, setData] = useState<OnlineUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [kickingId, setKickingId] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const kickActionRef = useRef(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    const requestId = ++requestIdRef.current;
    try {
      const res = await getList<OnlineUserItem>("online-users", {
        _start: page * pageSize,
        _end: (page + 1) * pageSize,
      });
      if (requestId !== requestIdRef.current) return;
      setData(res.data);
      setTotal(res.total);
      setLoadError(false);
    } catch (e: unknown) {
      // 非关键：数据加载失败时保留旧数据，不阻塞页面
      if (requestId !== requestIdRef.current) return;
      if (e instanceof Error) message.error(`加载失败: ${e.message}`);
      setLoadError(true);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    loadData();
    return () => {
      requestIdRef.current += 1;
    };
  }, [loadData]);

  const pageVisible = usePageVisibility();
  useEffect(() => {
    if (kickingId !== null || !pageVisible) return;
    const t = setInterval(() => void loadData(), 30000);
    return () => clearInterval(t);
  }, [loadData, kickingId, pageVisible]);

  const handleKick = async (item: OnlineUserItem) => {
    if (kickingId !== null || loading) return;
    if (kickActionRef.current) return;
    kickActionRef.current = true;
    const ok = await confirm({
      title: "强制下线",
      content: `确定强制下线用户 ${item.user_name}？`,
      okVariant: "destructive",
      okText: "下线",
    });
    if (!ok) {
      kickActionRef.current = false;
      return;
    }
    setKickingId(item.id);
    try {
      await request(`/online-users/${item.id}/logout`, { method: "POST" });
      message.success("已下线");
      const nextTotal = Math.max(0, total - 1);
      const nextMaxPage = Math.max(0, Math.ceil(nextTotal / pageSize) - 1);
      if (page > nextMaxPage) setPage(nextMaxPage);
      else void loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setKickingId(null);
      kickActionRef.current = false;
    }
  };

  const columns: ColumnDef<OnlineUserItem>[] = [
    {
      accessorKey: "id",
      header: "会话ID",
      cell: ({ row }) => (
        <code className="text-xs" title={row.original.id}>
          {row.original.id.substring(0, 12)}...
        </code>
      ),
    },
    {
      accessorKey: "user_name",
      header: "用户",
      cell: ({ row }) => (
        <span
          className="block max-w-[180px] truncate"
          title={row.original.user_name}
        >
          {row.original.user_name}
        </span>
      ),
    },
    {
      accessorKey: "login_ip",
      header: "IP",
      cell: ({ row }) => (
        <code
          className="block max-w-[200px] break-all text-xs"
          title={row.original.login_ip}
        >
          {row.original.login_ip}
        </code>
      ),
    },
    {
      accessorKey: "login_location",
      header: "地点",
      cell: ({ row }) => (
        <span
          className="block max-w-[180px] truncate"
          title={row.original.login_location || "-"}
        >
          {row.original.login_location || "-"}
        </span>
      ),
    },
    {
      accessorKey: "browser",
      header: "设备",
      cell: ({ row }) => (
        <span className="flex items-center gap-1">
          <Badge
            variant="outline"
            className="max-w-[180px] truncate"
            title={row.original.browser || "-"}
          >
            {row.original.browser || "-"}
          </Badge>
          {row.original.os && (
            <Badge
              variant="outline"
              className="max-w-[120px] truncate"
              title={row.original.os}
            >
              {row.original.os}
            </Badge>
          )}
        </span>
      ),
    },
    {
      accessorKey: "login_time",
      header: "登录时间",
      cell: ({ row }) =>
        row.original.login_time
          ? dayjs(row.original.login_time).format("YYYY-MM-DD HH:mm:ss")
          : "-",
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) =>
        can("system:online:delete") ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleKick(row.original)}
                disabled={kickingId !== null || loading}
                aria-label={`强制下线 ${row.original.user_name}`}
              >
                {kickingId === row.original.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <LogOut className="size-4 text-destructive" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>强制下线</TooltipContent>
          </Tooltip>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">在线用户</h2>
        <Button variant="outline" size="sm" onClick={() => void loadData()}>
          <RefreshCw className={cn("size-4 mr-1", loading && "animate-spin")} />
          刷新
        </Button>
      </div>

      {loadError && (
        <InlineError
          title="在线用户加载失败"
          description={"列表可能未更新，已保留原有数据。"}
          onRetry={loadData}
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
        emptyMessage="当前无在线用户"
      />
    </div>
  );
};
