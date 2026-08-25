import { InlineError } from "@/components/InlineError";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageVisibility } from "@/hooks/usePageVisibility";
import { message } from "@/lib/message";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/services/api";
import { RefreshCw, Server } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

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
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const requestIdRef = useRef(0);
  const fetchingRef = useRef(false);

  const fetchInfo = useCallback(async (force = false) => {
    if (fetchingRef.current && !force) return;
    fetchingRef.current = true;
    setLoading(true);
    const requestId = ++requestIdRef.current;
    try {
      const data = await apiFetch<ServerInfo>("/api/server-monitor");
      if (requestId !== requestIdRef.current) return;
      setInfo(data);
      setLoadError(false);
    } catch (e: unknown) {
      // 非关键：数据加载失败时保留旧数据，不阻塞页面
      if (requestId !== requestIdRef.current) return;
      if (e instanceof Error) message.error(`加载失败: ${e.message}`);
      setLoadError(true);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        fetchingRef.current = false;
      }
    }
  }, []);

  useEffect(() => {
    fetchInfo();
    return () => {
      requestIdRef.current += 1;
      fetchingRef.current = false;
    };
  }, [fetchInfo]);

  const pageVisible = usePageVisibility();
  useEffect(() => {
    if (!pageVisible) return;
    const t = setInterval(() => void fetchInfo(true), 10000);
    return () => clearInterval(t);
  }, [fetchInfo, pageVisible]);

  const memPercent =
    info && info.total_memory > 0
      ? Math.min(100, Math.round((info.used_memory / info.total_memory) * 100))
      : 0;
  const swapPercent =
    info && info.total_swap > 0
      ? Math.min(100, Math.round((info.used_swap / info.total_swap) * 100))
      : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Server className="size-5" />
          <h2 className="text-lg font-semibold">服务监控</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void fetchInfo(true)}
        >
          <RefreshCw className={cn("size-4 mr-1", loading && "animate-spin")} />
          刷新
        </Button>
      </div>

      {loadError && (
        <InlineError
          title="服务监控加载失败"
          description={"监控数据可能未更新，已保留原有数据。"}
          onRetry={() => void fetchInfo(true)}
          loading={loading}
        />
      )}

      {loading && !info ? (
        <>
          <span className="sr-only">正在加载监控数据…</span>
          <div aria-hidden="true" className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton cards
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="mt-2 h-8 w-16" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {Array.from({ length: 2 }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton cards
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-5 w-20" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Skeleton className="h-3 w-full rounded-full" />
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-40" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-20" />
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {Array.from({ length: 3 }, (_, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
                    <Skeleton key={i} className="h-5 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : !info ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            <div className="block">暂无监控数据，点击上方"刷新"重试</div>
          </CardContent>
        </Card>
      ) : null}

      {info && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">CPU 使用率</p>
                <p className="text-2xl font-bold">
                  {info.cpu_usage.toFixed(1)}%
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">CPU 核心数</p>
                <p className="text-2xl font-bold">{info.cpu_count}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">进程数</p>
                <p className="text-2xl font-bold">{info.process_count}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">运行时间</p>
                <p className="text-lg font-bold">{formatUptime(info.uptime)}</p>
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
                    {formatBytes(info.total_memory)}
                  </div>
                  <div>
                    <span className="text-muted-foreground">已用:</span>{" "}
                    {formatBytes(info.used_memory)}
                  </div>
                  <div>
                    <span className="text-muted-foreground">可用:</span>{" "}
                    {formatBytes(info.free_memory)}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">交换分区</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {info.total_swap > 0 ? (
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
              <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">主机名:</span>{" "}
                  <span className="break-words" title={info.hostname}>
                    {info.hostname}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">操作系统:</span>{" "}
                  <span className="break-words" title={info.os_name}>
                    {info.os_name}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">系统版本:</span>{" "}
                  <span className="break-words" title={info.os_version}>
                    {info.os_version}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};
