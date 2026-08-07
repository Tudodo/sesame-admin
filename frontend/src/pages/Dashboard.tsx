import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getList } from "@/services/api";
import { useTheme } from "@/theme/AppThemeProvider";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Building,
  Clock,
  Folder,
  FolderOpen,
  Loader2,
  RefreshCw,
  Users,
} from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";

interface StatsData {
  users: number;
  roles: number;
  departments: number;
  positions: number;
}

interface DashboardContentProps {
  stats: StatsData;
  onRefresh: () => void;
}

function DashboardContent({ stats, onRefresh }: DashboardContentProps) {
  const kpis = [
    {
      label: "用户总数",
      value: String(stats.users),
      trend: "较上周 +12.4%",
      up: true,
      icon: Users,
      color: "hsl(var(--viz-1))",
      points: "0,22 20,18 40,20 60,12 80,14 100,6 120,4",
    },
    {
      label: "部门数量",
      value: String(stats.departments),
      trend: "较上周 +2.1%",
      up: true,
      icon: Building,
      color: "hsl(var(--viz-1))",
      points: "0,20 20,16 40,18 60,10 80,12 100,6 120,3",
    },
  ];

  const targets = [
    {
      label: "角色覆盖",
      value: `${stats.roles} / ${stats.users}`,
      percent: Math.min(
        100,
        Math.round((stats.roles / Math.max(stats.users, 1)) * 100),
      ),
      color: "hsl(var(--viz-1))",
    },
    {
      label: "岗位配置",
      value: `${stats.positions} / ${stats.departments}`,
      percent: Math.min(
        100,
        Math.round((stats.positions / Math.max(stats.departments, 1)) * 100),
      ),
      color: "hsl(var(--viz-3))",
    },
  ];

  const recentRows = [
    {
      name: "初始化角色与菜单",
      detail: "系统管理",
      status: "已完成",
      badge: "success",
      time: "09:12",
    },
    {
      name: "配置系统字典",
      detail: "基础数据",
      status: "待处理",
      badge: "destructive",
      time: "11:04",
    },
    {
      name: "添加演示用户",
      detail: "用户管理",
      status: "已完成",
      badge: "success",
      time: "昨天",
    },
  ];

  const feed = [
    {
      title: "新用户已加入",
      meta: "1 小时前",
      icon: Users,
    },
    {
      title: "任务队列运行正常",
      meta: "3 小时前",
      icon: Clock,
    },
    {
      title: "缓存数据已刷新",
      meta: "昨天",
      icon: RefreshCw,
    },
  ];

  return (
    <div className="tudodo-dashboard">
      <header className="tudodo-page-head">
        <div>
          <h1 className="tudodo-page-title">概览</h1>
          <p className="tudodo-page-subtitle">核心指标与系统运行状态</p>
        </div>
        <div className="tudodo-row">
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="size-4" />
            刷新
          </Button>
        </div>
      </header>

      <section className="tudodo-grid-stats" aria-label="关键指标">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <article key={kpi.label} className="tudodo-card tudodo-stat">
              <div
                className="tudodo-row"
                style={{ justifyContent: "space-between" }}
              >
                <span className="tudodo-stat-label">{kpi.label}</span>
                <Icon
                  className="size-4"
                  style={{ color: "var(--tudodo-text-tertiary)" }}
                />
              </div>
              <span className="tudodo-stat-value">{kpi.value}</span>
              <span className={cn("tudodo-stat-trend", kpi.up ? "up" : "down")}>
                {kpi.up ? (
                  <ArrowUpRight className="size-3" />
                ) : (
                  <ArrowDownRight className="size-3" />
                )}
                {kpi.trend}
              </span>
              <svg
                className="tudodo-spark"
                viewBox="0 0 120 28"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <polyline
                  fill="none"
                  stroke={kpi.color}
                  strokeWidth="2"
                  points={kpi.points}
                />
              </svg>
            </article>
          );
        })}
      </section>

      <section className="tudodo-section-grid">
        <article className="tudodo-card">
          <div className="tudodo-card-head">
            <span className="tudodo-card-title">运行趋势</span>
            <div className="tudodo-legend">
              <span>
                <i style={{ background: "hsl(var(--viz-1))" }} />
                本期
              </span>
              <span>
                <i style={{ background: "hsl(var(--viz-2))" }} />
                上期
              </span>
            </div>
          </div>
          <div className="tudodo-card-body">
            <svg
              className="tudodo-chart"
              viewBox="0 0 608 220"
              role="img"
              aria-label="本期与上期运行趋势折线图"
            >
              <defs>
                <linearGradient id="tudodo-area" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="hsl(var(--viz-1))"
                    stopOpacity="0.2"
                  />
                  <stop
                    offset="100%"
                    stopColor="hsl(var(--viz-1))"
                    stopOpacity="0"
                  />
                </linearGradient>
              </defs>
              <line
                className="tudodo-grid-line"
                x1="40"
                y1="40"
                x2="600"
                y2="40"
              />
              <line
                className="tudodo-grid-line"
                x1="40"
                y1="90"
                x2="600"
                y2="90"
              />
              <line
                className="tudodo-grid-line"
                x1="40"
                y1="140"
                x2="600"
                y2="140"
              />
              <line
                className="tudodo-grid-line"
                x1="40"
                y1="190"
                x2="600"
                y2="190"
              />
              <text className="tudodo-axis-label" x="8" y="44">
                高
              </text>
              <text className="tudodo-axis-label" x="8" y="144">
                低
              </text>
              <path
                d="M40,150 L128,120 L216,135 L304,90 L392,100 L480,60 L568,45 L568,200 L40,200 Z"
                fill="url(#tudodo-area)"
              />
              <path
                className="tudodo-line-prev"
                d="M40,170 L128,150 L216,158 L304,130 L392,140 L480,115 L568,95"
              />
              <path
                className="tudodo-line-main"
                d="M40,150 L128,120 L216,135 L304,90 L392,100 L480,60 L568,45"
              />
              <circle className="tudodo-dot" cx="568" cy="45" r="4" />
            </svg>
            <div className="tudodo-kpi-foot">
              <span>最近 7 天 · 每日更新</span>
              <Badge variant="success">
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: "currentColor",
                    display: "inline-block",
                  }}
                />
                实时
              </Badge>
            </div>
          </div>
        </article>

        <article className="tudodo-card">
          <div className="tudodo-card-head">
            <span className="tudodo-card-title">目标进度</span>
          </div>
          <div className="tudodo-card-body tudodo-stack">
            {targets.map((target) => (
              <div key={target.label}>
                <div
                  className="tudodo-row"
                  style={{ justifyContent: "space-between" }}
                >
                  <span className="tudodo-cell-muted">{target.label}</span>
                  <span className="tudodo-cell-strong">{target.value}</span>
                </div>
                <div className="tudodo-progress">
                  <span
                    style={{
                      width: `${target.percent}%`,
                      background: target.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="tudodo-section-grid">
        <article className="tudodo-card">
          <div className="tudodo-card-head">
            <span className="tudodo-card-title">近期任务</span>
            <Button variant="ghost" size="sm">
              查看全部
            </Button>
          </div>
          <div className="tudodo-table-wrap">
            <table className="tudodo-data-table">
              <thead>
                <tr>
                  <th scope="col">任务</th>
                  <th scope="col">模块</th>
                  <th scope="col">状态</th>
                  <th scope="col">时间</th>
                </tr>
              </thead>
              <tbody>
                {recentRows.map((row) => (
                  <tr key={row.name}>
                    <td className="tudodo-cell-strong">{row.name}</td>
                    <td className="tudodo-cell-muted">{row.detail}</td>
                    <td>
                      <Badge
                        variant={
                          row.badge === "success"
                            ? "success"
                            : row.badge === "warning"
                              ? "warning"
                              : "destructive"
                        }
                      >
                        {row.status}
                      </Badge>
                    </td>
                    <td className="tudodo-cell-muted">{row.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="tudodo-card">
          <div className="tudodo-card-head">
            <span className="tudodo-card-title">动态</span>
          </div>
          <div className="tudodo-card-body">
            <div className="tudodo-feed">
              {feed.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="tudodo-feed-item">
                    <span className="tudodo-feed-icon">
                      <Icon />
                    </span>
                    <div className="tudodo-feed-body">
                      <div className="tudodo-feed-title">{item.title}</div>
                      <div className="tudodo-feed-meta">{item.meta}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </article>
      </section>

      <section>
        <article className="tudodo-card">
          <div className="tudodo-empty">
            <div className="tudodo-empty-art">
              <FolderOpen className="size-7" />
            </div>
            <h3>还没有归档的报表</h3>
            <p>把常用的分析固定在首页，下次一键直达。</p>
            <Button size="sm">
              <Folder className="size-4" />
              创建报表
            </Button>
          </div>
        </article>
      </section>
    </div>
  );
}

export const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const { themePreset, darkMode } = useTheme();

  // biome-ignore lint/correctness/useExhaustiveDependencies: retryCount triggers re-fetch
  useEffect(() => {
    Promise.all([
      getList("users", { _start: 0, _end: 1 }),
      getList("roles", { _start: 0, _end: 1 }),
      getList("departments", { _start: 0, _end: 1 }),
      getList("positions", { _start: 0, _end: 1 }),
    ])
      .then(([users, roles, depts, pos]) => {
        setStats({
          users: users.total,
          roles: roles.total,
          departments: depts.total,
          positions: pos.total,
        });
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [retryCount]);

  const refresh = () => {
    setError(false);
    setLoading(true);
    setRetryCount((count) => count + 1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-24">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <AlertCircle className="size-12 text-destructive" />
        <p className="text-sm text-muted-foreground">数据加载失败</p>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="size-4" /> 重试
        </Button>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    // 数据仍只接入一次，主题只负责仪表盘的视觉呈现。
    <div data-theme={themePreset} className={cn(darkMode && "dark")}>
      <DashboardContent stats={stats} onRefresh={refresh} />
    </div>
  );
};
