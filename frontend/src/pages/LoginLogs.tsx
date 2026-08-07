import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirm } from "@/lib/confirm";
import { message } from "@/lib/message";
import { cn } from "@/lib/utils";
import { getList, request } from "@/services/api";
import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { RefreshCw, Trash2 } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";

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

export const LoginLogsPage: React.FC = () => {
  const [data, setData] = useState<LoginLogItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getList<LoginLogItem>("login-logs", {
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
      title: "清空登录日志",
      content: "确定清空所有登录日志？",
      okVariant: "destructive",
      okText: "清空",
    });
    if (!ok) return;
    try {
      await request("/login-logs/clear", { method: "POST" });
      message.success("已清空");
      loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "操作失败");
    }
  };

  const columns: ColumnDef<LoginLogItem>[] = [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "user_name", header: "用户" },
    {
      accessorKey: "login_ip",
      header: "IP",
      cell: ({ row }) => (
        <code className="text-xs">{row.original.login_ip}</code>
      ),
    },
    {
      accessorKey: "login_location",
      header: "地点",
      cell: ({ row }) => row.original.login_location || "-",
    },
    {
      accessorKey: "browser",
      header: "浏览器",
      cell: ({ row }) => (
        <span className="flex items-center gap-1">
          <span>{row.original.browser || "-"}</span>
          {row.original.os && (
            <Badge variant="outline" className="text-xs">
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
      cell: ({ row }) => row.original.msg || "-",
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
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">登录日志</h2>
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
    </div>
  );
};
