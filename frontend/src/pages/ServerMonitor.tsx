import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { message } from "@/lib/message";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/services/api";
import { RefreshCw, Server } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";

interface ServerInfo {
  cpu_usage: number;
  cpu_count: number;
  total_memory: number;
  used_memory: number;
  free_memory: number;
  total_swap: number;
  used_swap: number;
  free_swap: number;
  os_name: string;
  os_version: string;
  hostname: string;
  uptime: number;
  process_count: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

function formatUptime(secs: number): string {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${d}天 ${h}时 ${m}分`;
}

export const ServerMonitorPage: React.FC = () => {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchInfo = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<ServerInfo>("/api/server-monitor");
      setInfo(data);
    } catch (e: unknown) {
      // 非关键：数据加载失败时保留旧数据，不阻塞页面
      if (e instanceof Error) message.error(`加载失败: ${e.message}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchInfo();
  }, [fetchInfo]);

  const memPercent = info
    ? Math.round((info.used_memory / info.total_memory) * 100)
    : 0;
  const swapPercent =
    info && info.total_swap > 0
      ? Math.round((info.used_swap / info.total_swap) * 100)
      : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="size-5" />
          <h2 className="text-lg font-semibold">服务监控</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchInfo}
          disabled={loading}
        >
          <RefreshCw className={cn("size-4 mr-1", loading && "animate-spin")} />
          刷新
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">CPU 使用率</p>
            <p className="text-2xl font-bold">
              {(info?.cpu_usage || 0).toFixed(1)}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">CPU 核心数</p>
            <p className="text-2xl font-bold">{info?.cpu_count || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">进程数</p>
            <p className="text-2xl font-bold">{info?.process_count || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">运行时间</p>
            <p className="text-lg font-bold">
              {info ? formatUptime(info.uptime) : "-"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">内存使用</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={memPercent} />
            <div className="text-sm space-y-1">
              <div>
                <span className="text-muted-foreground">总内存:</span>{" "}
                {info ? formatBytes(info.total_memory) : "-"}
              </div>
              <div>
                <span className="text-muted-foreground">已用:</span>{" "}
                {info ? formatBytes(info.used_memory) : "-"}
              </div>
              <div>
                <span className="text-muted-foreground">可用:</span>{" "}
                {info ? formatBytes(info.free_memory) : "-"}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">交换分区</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {info && info.total_swap > 0 ? (
              <>
                <Progress value={swapPercent} />
                <div className="text-sm space-y-1">
                  <div>
                    <span className="text-muted-foreground">总交换:</span>{" "}
                    {formatBytes(info.total_swap)}
                  </div>
                  <div>
                    <span className="text-muted-foreground">已用:</span>{" "}
                    {formatBytes(info.used_swap)}
                  </div>
                  <div>
                    <span className="text-muted-foreground">可用:</span>{" "}
                    {formatBytes(info.free_swap)}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">无交换分区</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">系统信息</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">主机名:</span>{" "}
              {info?.hostname || "-"}
            </div>
            <div>
              <span className="text-muted-foreground">操作系统:</span>{" "}
              {info?.os_name || "-"}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
