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
import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { Eye, RefreshCw, Trash2 } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";

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

export const OperLogsPage: React.FC = () => {
  const [data, setData] = useState<OperLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<OperLogItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getList<OperLogItem>("oper-logs", {
        _start: 0,
        _end: 100,
      });
      setData(res.data);
    } catch (e: unknown) {
      // 非关键：数据加载失败时保留旧数据，不阻塞页面
      if (e instanceof Error) message.error(`加载失败: ${e.message}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleClear = async () => {
    const ok = await confirm({
      title: "清空操作日志",
      content: "确定清空所有操作日志？此操作不可恢复。",
      okVariant: "destructive",
      okText: "清空",
    });
    if (!ok) return;
    try {
      await request("/oper-logs/clear", { method: "POST" });
      message.success("已清空");
      loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "操作失败");
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
        <code className="text-xs">{row.original.oper_url}</code>
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
          <span className="sr-only">查看详情</span>
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">操作日志</h2>
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
          <Button variant="destructive" size="sm" onClick={handleClear}>
            <Trash2 className="size-4 mr-1" />
            清空
          </Button>
        </div>
      </div>

      <DataTable columns={columns} data={data} pageSize={20} />

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent
          side="right"
          className="w-[640px] sm:max-w-[640px] overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>日志详情</SheetTitle>
          </SheetHeader>
          {detail && (
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">URL:</span>{" "}
                <code>{detail.oper_url}</code>
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
