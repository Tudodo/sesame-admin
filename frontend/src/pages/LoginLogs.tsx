import { InlineError } from "@/components/InlineError";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirm } from "@/lib/confirm";
import { message } from "@/lib/message";
import { cn } from "@/lib/utils";
import { getList, request } from "@/services/api";
import { can } from "@/services/permission";
import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

interface LoginLogItem {
  id: number;
  user_name: string;
  login_ip: string;
  login_location: string | null;
  browser: string | null;
  os: string | null;
  status: number;
  msg: string | null;
  login_time: string;
}

const DEFAULT_PAGE_SIZE = 20;

export const LoginLogsPage: React.FC = () => {
  const [data, setData] = useState<LoginLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [total, setTotal] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [clearLoading, setClearLoading] = useState(false);
  const pageRef = useRef(0);
  const requestIdRef = useRef(0);
  const failedPageRef = useRef<number | null>(null);
  const clearRef = useRef(false);

  const loadData = useCallback(
    async (targetPage = 0, targetPageSize = DEFAULT_PAGE_SIZE) => {
      setLoading(true);
      const previousPage = pageRef.current;
      pageRef.current = targetPage;
      setPageIndex(targetPage);
      const requestId = ++requestIdRef.current;
      failedPageRef.current = null;
      try {
        const res = await getList<LoginLogItem>("login-logs", {
          _start: targetPage * targetPageSize,
          _end: (targetPage + 1) * targetPageSize,
        });
        if (requestId !== requestIdRef.current) return;
        setData(res.data);
        setTotal(res.total);
        setLoadError(false);
      } catch (e: unknown) {
        if (requestId !== requestIdRef.current) return;
        pageRef.current = previousPage;
        setPageIndex(previousPage);
        failedPageRef.current = targetPage;
        // 非关键：数据加载失败时保留旧数据，不阻塞页面
        if (e instanceof Error) message.error(`加载失败: ${e.message}`);
        setLoadError(true);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadData(0, DEFAULT_PAGE_SIZE);
    return () => {
      requestIdRef.current += 1;
    };
  }, [loadData]);

  const handleClear = async () => {
    if (clearLoading || loading) return;
    if (clearRef.current) return;
    clearRef.current = true;
    const ok = await confirm({
      title: "清空登录日志",
      content: "确定清空所有登录日志？清空后不可恢复。",
      okVariant: "destructive",
      okText: "清空",
    });
    if (!ok) {
      clearRef.current = false;
      return;
    }
    setClearLoading(true);
    try {
      await request("/login-logs/clear", { method: "POST" });
      message.success("已清空");
      loadData(0, pageSize);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setClearLoading(false);
      clearRef.current = false;
    }
  };

  const columns: ColumnDef<LoginLogItem>[] = [
    { accessorKey: "id", header: "ID" },
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
        <code className="text-xs" title={row.original.login_ip}>
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
      header: "浏览器",
      cell: ({ row }) => (
        <span className="flex min-w-0 items-center gap-1">
          <span
            className="min-w-0 max-w-[160px] truncate"
            title={row.original.browser || "-"}
          >
            {row.original.browser || "-"}
          </span>
          {row.original.os && (
            <Badge
              variant="outline"
              className="max-w-[120px] truncate text-xs"
              title={row.original.os}
            >
              {row.original.os}
            </Badge>
          )}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => (
        <Badge
          variant={row.original.status === 0 ? "secondary" : "destructive"}
        >
          {row.original.status === 0 ? "成功" : "失败"}
        </Badge>
      ),
    },
    {
      accessorKey: "msg",
      header: "信息",
      cell: ({ row }) => (
        <span
          className="block max-w-[260px] truncate"
          title={row.original.msg || "-"}
        >
          {row.original.msg || "-"}
        </span>
      ),
    },
    {
      accessorKey: "login_time",
      header: "时间",
      cell: ({ row }) =>
        row.original.login_time
          ? dayjs(row.original.login_time).format("YYYY-MM-DD HH:mm:ss")
          : "-",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">登录日志</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(pageIndex, pageSize)}
          >
            <RefreshCw
              className={cn("size-4 mr-1", loading && "animate-spin")}
            />
            刷新
          </Button>
          {can("system:loginlog:delete") && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleClear}
              disabled={clearLoading || loading}
            >
              {clearLoading ? (
                <Loader2 className="size-4 mr-1 animate-spin" />
              ) : (
                <Trash2 className="size-4 mr-1" />
              )}
              {clearLoading ? "清空中…" : "清空"}
            </Button>
          )}
        </div>
      </div>

      {loadError && (
        <InlineError
          title="登录日志加载失败"
          description={"列表可能未更新，已保留原有数据。"}
          onRetry={() => loadData(failedPageRef.current ?? pageIndex, pageSize)}
          loading={loading}
        />
      )}

      <DataTable
        columns={columns}
        data={data}
        pageSize={pageSize}
        serverSide
        total={total}
        pageIndex={pageIndex}
        onPageChange={(page) => loadData(page, pageSize)}
        onPageSizeChange={(size) => {
          setPageSize(size);
          loadData(0, size);
        }}
        loading={loading}
        emptyMessage="暂无登录日志"
      />
    </div>
  );
};
