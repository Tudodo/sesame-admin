import { InlineError } from "@/components/InlineError";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { confirm } from "@/lib/confirm";
import { message } from "@/lib/message";
import { cn } from "@/lib/utils";
import { getList } from "@/services/api";
import { request } from "@/services/api";
import { can } from "@/services/permission";
import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { Eye, Loader2, RefreshCw, Trash2 } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

interface OperLogItem {
  id: number;
  title: string;
  business_type: number;
  method: string;
  request_method: string;
  oper_url: string;
  oper_ip: string;
  oper_param: string | null;
  json_result: string | null;
  status: number;
  error_msg: string | null;
  oper_time: string;
  cost_time: number;
  oper_name: string;
  dept_name: string | null;
}

const METHOD_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  GET: "secondary",
  POST: "default",
  PUT: "outline",
  DELETE: "destructive",
  PATCH: "default",
};

const DEFAULT_PAGE_SIZE = 20;

export const OperLogsPage: React.FC = () => {
  const [data, setData] = useState<OperLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [total, setTotal] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [detail, setDetail] = useState<OperLogItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
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
        const res = await getList<OperLogItem>("oper-logs", {
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
      title: "清空操作日志",
      content: "确定清空所有操作日志？此操作不可恢复。",
      okVariant: "destructive",
      okText: "清空",
    });
    if (!ok) {
      clearRef.current = false;
      return;
    }
    setClearLoading(true);
    try {
      await request("/oper-logs/clear", { method: "POST" });
      message.success("已清空");
      loadData(0, pageSize);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setClearLoading(false);
      clearRef.current = false;
    }
  };

  const columns: ColumnDef<OperLogItem>[] = [
    { accessorKey: "id", header: "ID" },
    {
      accessorKey: "request_method",
      header: "请求",
      cell: ({ row }) => (
        <Badge
          variant={METHOD_VARIANT[row.original.request_method] || "secondary"}
        >
          {row.original.request_method}
        </Badge>
      ),
    },
    {
      accessorKey: "oper_url",
      header: "URL",
      cell: ({ row }) => (
        <code
          className="block max-w-[320px] break-all text-xs"
          title={row.original.oper_url}
        >
          {row.original.oper_url}
        </code>
      ),
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => (
        <Badge
          variant={row.original.status === 1 ? "secondary" : "destructive"}
        >
          {row.original.status === 1 ? "成功" : "失败"}
        </Badge>
      ),
    },
    { accessorKey: "oper_ip", header: "IP" },
    {
      accessorKey: "cost_time",
      header: "耗时",
      cell: ({ row }) => `${row.original.cost_time}ms`,
    },
    {
      accessorKey: "oper_time",
      header: "时间",
      cell: ({ row }) =>
        row.original.oper_time
          ? dayjs(row.original.oper_time).format("YYYY-MM-DD HH:mm:ss")
          : "-",
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setDetail(row.original);
            setDetailOpen(true);
          }}
        >
          <Eye className="size-4" />
          <span className="sr-only">查看详情 {row.original.title}</span>
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">操作日志</h2>
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
          {can("system:operlog:delete") && (
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
          title="操作日志加载失败"
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
        emptyMessage="暂无操作日志"
      />

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:w-[640px] sm:max-w-[640px]"
        >
          <SheetHeader>
            <SheetTitle>日志详情</SheetTitle>
          </SheetHeader>
          {detail && (
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">操作名称:</span>{" "}
                <span className="break-words">{detail.title}</span>
              </div>
              <div>
                <span className="text-muted-foreground">操作人:</span>{" "}
                {detail.oper_name}
              </div>
              <div>
                <span className="text-muted-foreground">部门:</span>{" "}
                {detail.dept_name || "-"}
              </div>
              <div>
                <span className="text-muted-foreground">URL:</span>{" "}
                <code className="break-all">{detail.oper_url}</code>
              </div>
              <div>
                <span className="text-muted-foreground">方法:</span>{" "}
                <Badge>{detail.request_method}</Badge>
              </div>
              <div>
                <span className="text-muted-foreground">IP:</span>{" "}
                {detail.oper_ip}
              </div>
              <div>
                <span className="text-muted-foreground">耗时:</span>{" "}
                {detail.cost_time}ms
              </div>
              <div>
                <span className="text-muted-foreground">状态:</span>{" "}
                <Badge
                  variant={detail.status === 1 ? "secondary" : "destructive"}
                >
                  {detail.status === 1 ? "成功" : "失败"}
                </Badge>
              </div>
              {detail.error_msg && (
                <div>
                  <span className="text-muted-foreground">错误:</span>{" "}
                  <span className="text-destructive">{detail.error_msg}</span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground block mb-1">
                  请求参数:
                </span>
                <pre className="text-xs max-h-48 overflow-auto rounded-md bg-muted p-3">
                  {detail.oper_param || "-"}
                </pre>
              </div>
              <div>
                <span className="text-muted-foreground block mb-1">
                  响应结果:
                </span>
                <pre className="text-xs max-h-48 overflow-auto rounded-md bg-muted p-3">
                  {detail.json_result || "-"}
                </pre>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};
