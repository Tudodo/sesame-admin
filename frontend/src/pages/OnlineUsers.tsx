import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirm } from "@/lib/confirm";
import { message } from "@/lib/message";
import { cn } from "@/lib/utils";
import { getList, request } from "@/services/api";
import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { LogOut, RefreshCw } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";

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
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getList<OnlineUserItem>("online-users", {
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

  const handleKick = async (item: OnlineUserItem) => {
    const ok = await confirm({
      title: "强制下线",
      content: `确定强制下线用户 ${item.user_name}？`,
      okVariant: "destructive",
      okText: "下线",
    });
    if (!ok) return;
    try {
      await request(`/online-users/${item.id}/logout`, { method: "POST" });
      message.success("已下线");
      loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "操作失败");
    }
  };

  const columns: ColumnDef<OnlineUserItem>[] = [
    {
      accessorKey: "id",
      header: "会话ID",
      cell: ({ row }) => (
        <code className="text-xs">{row.original.id.substring(0, 12)}...</code>
      ),
    },
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
      header: "设备",
      cell: ({ row }) => (
        <span className="flex items-center gap-1">
          <Badge variant="outline">{row.original.browser || "-"}</Badge>
          {row.original.os && (
            <Badge variant="outline">{row.original.os}</Badge>
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
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleKick(row.original)}
        >
          <LogOut className="size-4 text-destructive" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">在线用户</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={loadData}
          disabled={loading}
        >
          <RefreshCw className={cn("size-4 mr-1", loading && "animate-spin")} />
          刷新
        </Button>
      </div>

      <DataTable columns={columns} data={data} pageSize={20} />
    </div>
  );
};
