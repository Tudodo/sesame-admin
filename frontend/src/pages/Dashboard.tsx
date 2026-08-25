import { InlineError } from "@/components/InlineError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getList, request } from "@/services/api";
import dayjs from "dayjs";
import {
  AlertCircle,
  BellRing,
  Building,
  Clock,
  Folder,
  RefreshCw,
  Server,
  ShieldCheck,
  Users,
} from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";

interface StatsData {
  users: number | null;
  roles: number | null;
  departments: number | null;
  positions: number | null;
  unreadNotifications: number | null;
}

function countText(value?: number | null): string {
  return value == null ? "-" : String(value);
}

function DashboardContent({
  stats,
  onRefresh,
  partialError = false,
  loading = false,
}: {
  stats: StatsData;
  onRefresh: () => void;
  partialError?: boolean;
  loading?: boolean;
}) {
  const kpis = [
    {
      label: "用户总数",
      value: countText(stats.users),
      icon: Users,
      color: "text-primary",
      background: "bg-primary/10",
    },
    {
      label: "角色数量",
      value: countText(stats.roles),
      icon: ShieldCheck,
      color: "text-info",
      background: "bg-info/10",
    },
    {
      label: "部门数量",
      value: countText(stats.departments),
      icon: Building,
      color: "text-success",
      background: "bg-success/10",
    },
    {
      label: "未读通知",
      value: countText(stats.unreadNotifications),
      icon: BellRing,
      color: "text-warning",
      background: "bg-warning/10",
    },
  ];

  const overview = [
    { label: "岗位数量", value: countText(stats.positions) },
    { label: "部门数量", value: countText(stats.departments) },
    { label: "角色数量", value: countText(stats.roles) },
    { label: "未读通知", value: countText(stats.unreadNotifications) },
  ];

  const feed = [
    { title: "新用户已加入", meta: "1 小时前", icon: Users },
    { title: "任务队列运行正常", meta: "3 小时前", icon: Clock },
    { title: "缓存数据已刷新", meta: "昨天", icon: RefreshCw },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">概览</h1>
          <p className="text-sm text-muted-foreground">
            核心指标与系统运行状态
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onRefresh()}>
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            刷新
          </Button>
        </div>
      </div>

      {partialError && (
        <InlineError
          title="部分数据加载失败"
          description="数据加载或刷新失败，已保留最近一次可用数据，相关指标可能不完整"
          onRetry={onRefresh}
          loading={loading}
        />
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label}>
              <CardContent className="flex min-h-[132px] flex-col items-center justify-center gap-2 pt-6 text-center">
                <div
                  className={cn(
                    "flex size-10 items-center justify-center rounded-full",
                    kpi.background,
                  )}
                >
                  <Icon className={cn("size-5", kpi.color)} />
                </div>
                <p className="text-2xl font-bold">{kpi.value}</p>
                <p className="text-sm text-muted-foreground">{kpi.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>系统运行概览</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {overview.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-md border px-3 py-2.5"
                >
                  <span className="text-sm text-muted-foreground">
                    {item.label}
                  </span>
                  <span className="text-sm font-semibold">{item.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-md border bg-muted/30 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Server className="size-4 text-muted-foreground" />
                最近动态
              </div>
              <div className="mt-3 space-y-2">
                {feed.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.title}
                      className="flex items-center gap-3 text-sm"
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1">{item.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {item.meta}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>系统状态</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Folder className="size-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">数据存储</p>
                <p className="text-xs text-muted-foreground">
                  服务运行正常，数据已同步
                </p>
              </div>
              <Badge variant="success">正常</Badge>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="size-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">上次刷新</p>
                <p className="text-xs text-muted-foreground">
                  {dayjs().format("YYYY-MM-DD HH:mm")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ShieldCheck className="size-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">会话安全</p>
                <p className="text-xs text-muted-foreground">登录会话有效</p>
              </div>
              <Badge variant="success">正常</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-7 w-20" />
          <Skeleton className="mt-2 h-4 w-44" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
          <Card key={`skel-${i}`}>
            <CardContent className="pt-6">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="mt-2 h-8 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <Skeleton className="h-5 w-20" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[220px] w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-20" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 4 }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
              <Skeleton key={`skel-${i}`} className="h-4 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [partialError, setPartialError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const requestIdRef = useRef(0);
  const fetchingRef = useRef(false);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    fetchingRef.current = true;
    Promise.allSettled([
      getList("users", { _start: 0, _end: 1 }),
      getList("roles", { _start: 0, _end: 1 }),
      getList("departments", { _start: 0, _end: 1 }),
      getList("positions", { _start: 0, _end: 1 }),
      request<{ count: number }>("/notifications/unread-count"),
    ])
      .then(([users, roles, depts, pos, notif]) => {
        const settled = <T,>(r: PromiseSettledResult<T>) =>
          r.status === "fulfilled" ? r.value : undefined;
        const results = [users, roles, depts, pos, notif];
        if (results.every((r) => r.status === "rejected")) {
          if (requestId !== requestIdRef.current) return;
          setError(true);
          return;
        }
        if (requestId !== requestIdRef.current) return;
        setPartialError(results.some((r) => r.status === "rejected"));
        setStats({
          users: settled(users)?.total ?? null,
          roles: settled(roles)?.total ?? null,
          departments: settled(depts)?.total ?? null,
          positions: settled(pos)?.total ?? null,
          unreadNotifications: settled(notif)?.count ?? null,
        });
      })
      .catch(() => {
        if (requestId === requestIdRef.current) setError(true);
      })
      .finally(() => {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          fetchingRef.current = false;
        }
      });
    return () => {
      if (requestId === requestIdRef.current) {
        requestIdRef.current += 1;
        fetchingRef.current = false;
      }
    };
  }, [retryCount]);

  const refresh = (force = false) => {
    if (!force && (loading || fetchingRef.current)) return;
    fetchingRef.current = true;
    setError(false);
    setLoading(true);
    setPartialError(false);
    setRetryCount((c) => c + 1);
  };

  if (loading && !stats) return <DashboardSkeleton />;

  if (error && !stats) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <AlertCircle className="size-12 text-destructive" />
        <p className="text-sm text-muted-foreground">数据加载失败</p>
        <Button variant="outline" size="sm" onClick={() => refresh(true)}>
          <RefreshCw className="size-4" /> 重试
        </Button>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <DashboardContent
      stats={stats}
      onRefresh={() => refresh(true)}
      partialError={partialError || error}
      loading={loading}
    />
  );
};
