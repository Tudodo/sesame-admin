import {
  FileQuestion,
  Loader2,
  RefreshCw,
  ShieldAlert,
  WifiOff,
} from "lucide-react";
import type React from "react";
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "./components/ui/button";
import { TooltipProvider } from "./components/ui/tooltip";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { UserNamesProvider } from "./hooks/useUserNames";
import { AdminLayout } from "./layouts/AdminLayout";
import { confirm } from "./lib/confirm";
import { clearDirty, getDirtyMessage, hasDirty } from "./lib/dirtyRegistry";
import { isSafeAppPath, navigate, setNavigator } from "./lib/navigation";
import { safeLocalStorage } from "./lib/utils";
import { I18nProvider } from "./locales/I18nContext";
import { DashboardPage } from "./pages/Dashboard";
import { LoginPage } from "./pages/Login";
import { RegisterPage } from "./pages/Register";
import {
  clearSessionState,
  getCurrentUser,
  isSessionRevokedError,
  logout,
} from "./services/api";
import { can } from "./services/permission";

// Lazy-loaded admin pages — only fetched when the user navigates to them.
// Login, Register, and Dashboard stay eager because they are first-paint
// critical (unauthenticated shell or default landing page).
const CacheManagementPage = lazy(() =>
  import("./pages/CacheManagement").then((m) => ({
    default: m.CacheManagementPage,
  })),
);
const CodeGenPage = lazy(() =>
  import("./pages/CodeGen").then((m) => ({ default: m.CodeGenPage })),
);
const DataSyncPage = lazy(() =>
  import("./pages/DataSync").then((m) => ({ default: m.DataSyncPage })),
);
const DepartmentsPage = lazy(() =>
  import("./pages/Departments").then((m) => ({ default: m.DepartmentsPage })),
);
const DictionariesPage = lazy(() =>
  import("./pages/Dictionaries").then((m) => ({ default: m.DictionariesPage })),
);
const DynamicPage = lazy(() =>
  import("./pages/DynamicPage").then((m) => ({ default: m.DynamicPage })),
);
const FileManagementPage = lazy(() =>
  import("./pages/FileManagement").then((m) => ({
    default: m.FileManagementPage,
  })),
);
const JobQueuePage = lazy(() =>
  import("./pages/JobQueue").then((m) => ({ default: m.JobQueuePage })),
);
const LoginLogsPage = lazy(() =>
  import("./pages/LoginLogs").then((m) => ({ default: m.LoginLogsPage })),
);
const MenusPage = lazy(() =>
  import("./pages/Menus").then((m) => ({ default: m.MenusPage })),
);
const NotificationsPage = lazy(() =>
  import("./pages/Notifications").then((m) => ({
    default: m.NotificationsPage,
  })),
);
const OnlineUsersPage = lazy(() =>
  import("./pages/OnlineUsers").then((m) => ({ default: m.OnlineUsersPage })),
);
const OperLogsPage = lazy(() =>
  import("./pages/OperLogs").then((m) => ({ default: m.OperLogsPage })),
);
const PositionsPage = lazy(() =>
  import("./pages/Positions").then((m) => ({ default: m.PositionsPage })),
);
const ProfilePage = lazy(() =>
  import("./pages/Profile").then((m) => ({ default: m.ProfilePage })),
);
const RolesPage = lazy(() =>
  import("./pages/Roles").then((m) => ({ default: m.RolesPage })),
);
const ScheduledTasksPage = lazy(() =>
  import("./pages/ScheduledTasks").then((m) => ({
    default: m.ScheduledTasksPage,
  })),
);
const ServerMonitorPage = lazy(() =>
  import("./pages/ServerMonitor").then((m) => ({
    default: m.ServerMonitorPage,
  })),
);
const SysConfigsPage = lazy(() =>
  import("./pages/SysConfigs").then((m) => ({ default: m.SysConfigsPage })),
);
const TenantsPage = lazy(() =>
  import("./pages/Tenants").then((m) => ({ default: m.TenantsPage })),
);
const UsersPage = lazy(() =>
  import("./pages/Users").then((m) => ({ default: m.UsersPage })),
);

export interface MenuPerm {
  id: number;
  name: string;
  path: string | null;
  icon: string | null;
  parent_id: number | null;
  sort_order: number;
  permission: string | null;
  visible: boolean;
  menu_type: string;
  available_actions: string[];
  granted_actions: string[];
}

interface UserInfo {
  pid: string;
  name: string;
  email: string;
  roles: string[];
  menus: MenuPerm[];
}

/** Page registry keyed by normalized path (leading-slash-stripped). */
const pageMap: Record<string, React.ReactNode> = {
  dashboard: <DashboardPage />,
  users: <UsersPage />,
  roles: <RolesPage />,
  departments: <DepartmentsPage />,
  positions: <PositionsPage />,
  menus: <MenusPage />,
  dictionaries: <DictionariesPage />,
  "oper-logs": <OperLogsPage />,
  "login-logs": <LoginLogsPage />,
  "sys-configs": <SysConfigsPage />,
  "online-users": <OnlineUsersPage />,
  "server-monitor": <ServerMonitorPage />,
  profile: <ProfilePage />,
  register: <RegisterPage />,
  codegen: <CodeGenPage />,
  cache: <CacheManagementPage />,
  tenants: <TenantsPage />,
  dynamic: <DynamicPage pageCode="" />,
  "scheduled-tasks": <ScheduledTasksPage />,
  "data-sync": <DataSyncPage />,
  "job-queue": <JobQueuePage />,
  notifications: <NotificationsPage />,
  "file-management": <FileManagementPage />,
};

const APP_TITLE = "Sesame Admin";

const PAGE_TITLES: Record<string, string> = {
  dashboard: "仪表盘",
  users: "用户管理",
  roles: "角色管理",
  departments: "部门管理",
  positions: "岗位管理",
  menus: "菜单管理",
  dictionaries: "字典管理",
  "oper-logs": "操作日志",
  "login-logs": "登录日志",
  "sys-configs": "系统参数",
  "online-users": "在线用户",
  "server-monitor": "服务监控",
  profile: "个人中心",
  register: "注册",
  codegen: "代码生成",
  cache: "缓存管理",
  tenants: "租户管理",
  dynamic: "动态页面",
  "scheduled-tasks": "定时任务",
  "data-sync": "数据同步",
  "job-queue": "任务队列",
  notifications: "通知中心",
  "file-management": "文件管理",
};

function isUnauthorizedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;
  // 后端 401 可能返回多种文案：英文 "Unauthorized"，
  // 或中文 description 如 "未在任何已配置的位置找到令牌，请重新登录"。
  return (
    msg === "Unauthorized" ||
    msg.includes("未在任何已配置的位置找到令牌") ||
    msg.includes("登录已过期") ||
    msg.includes("请重新登录")
  );
}

function friendlyBootstrapError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "";
  if (!raw) return "服务暂时不可用，请稍后重试";
  const lower = raw.toLowerCase();
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("load failed") ||
    lower.includes("internal server error") ||
    lower.includes("bad gateway") ||
    lower.includes("service unavailable") ||
    lower.includes("gateway timeout")
  ) {
    return "服务暂时不可用，请稍后重试";
  }
  return raw;
}

function normalizePath(raw: string | null): string {
  return (raw || "").replace(/^\/+/, "");
}

// Routes available to every authenticated user regardless of menu perms.
const PUBLIC_ROUTES = new Set([
  "dashboard",
  "profile",
  "register",
  "notifications",
]);

function AccessDeniedPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
        <ShieldAlert className="size-7 text-destructive" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">无权访问</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          当前账号没有访问该页面的权限，请联系管理员分配对应菜单或权限。
        </p>
      </div>
      <Button onClick={() => navigate("/dashboard")}>返回首页</Button>
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <FileQuestion className="size-7 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">页面不存在</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          你访问的页面不存在或链接已失效。
        </p>
      </div>
      <Button onClick={() => navigate("/dashboard")}>返回首页</Button>
    </div>
  );
}

function PageSuspense({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          页面加载中…
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

function matchPage(path: string | null, menus: MenuPerm[]): React.ReactNode {
  const key = normalizePath(path);
  if (!key) return <DashboardPage />;
  // Front-end route guard: only render a page if the user's menu set grants
  // access to its path, or the route is in the public set. This prevents a
  // user from viewing a page shell by hand-editing the URL even when the
  // backend would reject its API calls. Without this the SPA renders the
  // page component (which then shows empty/error states) for menus the user
  // cannot see — a confusing UX that looks like a broken page.
  const allowedPaths = new Set(
    menus
      .filter((m) => m.visible !== false && m.menu_type !== "F")
      .map((m) => normalizePath(m.path))
      .filter(Boolean),
  );
  const baseKey = key.split("?")[0];
  const query = new URLSearchParams(key.split("?")[1] || "");
  const dynamicCode = query.get("code");
  const isDynamicAllowed =
    baseKey === "dynamic" &&
    Boolean(dynamicCode) &&
    (allowedPaths.has(key) || allowedPaths.has(`dynamic?code=${dynamicCode}`));
  // Public/dynamic pages that exist in the registry are always reachable.
  // Menu-backed pages need an allowed menu path before they render.
  const publicPageAllowed = PUBLIC_ROUTES.has(baseKey) || isDynamicAllowed;
  if (!publicPageAllowed && !allowedPaths.has(baseKey)) {
    const hasPage = Object.keys(pageMap).some(
      (pk) => baseKey === pk || baseKey.startsWith(`${pk}/`),
    );
    if (hasPage) return <AccessDeniedPage />;
    return <NotFoundPage />;
  }

  if (baseKey === "dynamic") {
    return <DynamicPage pageCode={dynamicCode || ""} />;
  }
  if (pageMap[key]) return pageMap[key];
  for (const [pk, page] of Object.entries(pageMap).sort(
    (a, b) => b[0].length - a[0].length,
  )) {
    if (key === pk || key.startsWith(`${pk}?`) || key.startsWith(`${pk}/`)) {
      return page;
    }
  }
  return <NotFoundPage />;
}

export const App = () => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const isOnline = useOnlineStatus();
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const sessionRequestRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [currentRoute, setCurrentRoute] = useState<string>(() => {
    const path = window.location.pathname;
    if (path === "/register") return "/register";
    if (path && path !== "/") return path + window.location.search;
    return safeLocalStorage.getItem("currentRoute") || "/dashboard";
  });
  const [menus, setMenus] = useState<MenuPerm[]>([]);
  const currentRouteRef = useRef(currentRoute);
  const confirmingRef = useRef(false);
  useEffect(() => {
    currentRouteRef.current = currentRoute;
  }, [currentRoute]);

  const go = useCallback((path: string) => {
    if (!isSafeAppPath(path)) return;
    const navigateTo = () => {
      setCurrentRoute(path);
      safeLocalStorage.setItem("currentRoute", path);
      window.history.pushState({}, "", path);
    };
    if (hasDirty() && !confirmingRef.current) {
      confirmingRef.current = true;
      void confirm({
        title: "离开页面",
        content: getDirtyMessage(),
        okText: "离开",
        cancelText: "继续编辑",
        okVariant: "destructive",
      }).then((leave) => {
        confirmingRef.current = false;
        if (leave) {
          clearDirty(currentRouteRef.current);
          navigateTo();
        }
      });
      return;
    }
    navigateTo();
  }, []);

  const isRegisterRoute = normalizePath(currentRoute) === "register";
  useEffect(() => {
    if (user && isRegisterRoute) go("/dashboard");
  }, [user, isRegisterRoute, go]);

  const loadSession = useCallback(async () => {
    // 登录态来自 HttpOnly cookie，不依赖 localStorage token；未登录时由
    // /auth/current 返回 401 并正常落到登录页。网络抖动或服务端 5xx 不能
    // 被当作会话失效，否则已登录用户会被无谓踢回登录页。
    const requestId = ++sessionRequestRef.current;
    setLoading(true);
    setBootstrapError(null);
    let stored: string | null = null;
    stored = safeLocalStorage.getItem("menus");
    if (stored) {
      try {
        setMenus(JSON.parse(stored));
      } catch {
        // 非关键：localStorage 菜单JSON解析失败时跳过，后续 getCurrentUser 会重新拉取
      }
    }
    try {
      const u = await getCurrentUser(false);
      if (requestId !== sessionRequestRef.current) return;
      setUser(u);
      if (u.menus) {
        setMenus(u.menus);
        safeLocalStorage.setItem("menus", JSON.stringify(u.menus));
      }
      const uWithPerms = u as UserInfo & { permissions?: string[] };
      if (uWithPerms.permissions) {
        safeLocalStorage.setItem(
          "permissions",
          JSON.stringify(uWithPerms.permissions),
        );
      }
    } catch (error) {
      if (requestId !== sessionRequestRef.current) return;
      if (isUnauthorizedError(error)) {
        clearSessionState();
        setMenus([]);
        return;
      }
      if (isSessionRevokedError(error)) {
        clearSessionState();
        setMenus([]);
        // 会话已注销时把地址栏重置到应用首页，避免停留在旧路由或深层链接上
        // 反复看到 403，直到用户重新登录后再由 currentRoute 带回原页面。
        window.history.replaceState({}, "", "/");
        return;
      }
      setBootstrapError(friendlyBootstrapError(error));
    } finally {
      if (requestId === sessionRequestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
    return () => {
      sessionRequestRef.current += 1;
    };
  }, [loadSession]);

  // Expose a SPA navigator so standalone screens (Notifications, post-submit
  // success views, ...) can switch routes without a full page reload, which
  // the App would otherwise ignore (only /register is read on load).
  useEffect(() => {
    setNavigator(go);
    return () => setNavigator(null);
  }, [go]);

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      const next = path === "/" ? "/dashboard" : path + window.location.search;
      // SPA 后退/前进：若存在未保存的改动，先拦截并提示用户。
      if (hasDirty() && !confirmingRef.current) {
        const prev = currentRouteRef.current;
        // 恢复原始 URL，阻止本次跳转
        window.history.pushState({}, "", prev);
        confirmingRef.current = true;
        void confirm({
          title: "离开页面",
          content: getDirtyMessage(),
          okText: "离开",
          cancelText: "继续编辑",
          okVariant: "destructive",
        }).then((leave) => {
          confirmingRef.current = false;
          if (leave) {
            clearDirty(prev);
            setCurrentRoute(next);
            safeLocalStorage.setItem("currentRoute", next);
            window.history.pushState({}, "", next);
          }
        });
        return;
      }
      setCurrentRoute(next);
      safeLocalStorage.setItem("currentRoute", next);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const key = normalizePath(currentRoute);
    const currentMenu = menus.find((m) => normalizePath(m.path) === key);
    const actions = currentMenu?.granted_actions || [];
    const available = currentMenu?.available_actions || [];
    safeLocalStorage.setItem("currentActions", JSON.stringify(actions));
    safeLocalStorage.setItem(
      "currentAvailableActions",
      JSON.stringify(available),
    );
  }, [currentRoute, menus]);

  useEffect(() => {
    if (loading) {
      document.title = `系统加载中 - ${APP_TITLE}`;
      return;
    }
    if (bootstrapError) {
      document.title = `系统加载失败 - ${APP_TITLE}`;
      return;
    }
    const normalized = normalizePath(currentRoute);
    const baseKey = normalized.split("?")[0];
    const currentMenu = menus.find((m) => normalizePath(m.path) === normalized);
    const pageTitle = PAGE_TITLES[baseKey] || currentMenu?.name || "";
    if (!user) {
      document.title =
        baseKey === "register" ? `注册 - ${APP_TITLE}` : `登录 - ${APP_TITLE}`;
      return;
    }
    document.title = pageTitle ? `${pageTitle} - ${APP_TITLE}` : APP_TITLE;
  }, [currentRoute, menus, user, bootstrapError, loading]);

  // Capture unhandled Promise rejections and window errors so the user gets
  // visible feedback instead of a silent failure (React ErrorBoundary does
  // not catch async or event-handler errors).
  useEffect(() => {
    const onUnhandledRejection = (e: PromiseRejectionEvent) => {
      console.error("Unhandled promise rejection", e.reason);
    };
    const onError = (e: ErrorEvent) => {
      console.error("Uncaught error", e.error ?? e.message);
    };
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <span className="sr-only">系统加载中…</span>
      </div>
    );
  }

  if (bootstrapError) {
    return (
      <div
        role="alert"
        className="flex h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center"
      >
        <ShieldAlert className="size-10 text-destructive" />
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">系统加载失败</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {bootstrapError}
          </p>
        </div>
        <Button onClick={loadSession} disabled={loading}>
          <RefreshCw className="size-4" />
          重试
        </Button>
      </div>
    );
  }

  if (currentRoute === "/register" && !user) {
    return <RegisterPage />;
  }
  if (isRegisterRoute) {
    if (!user) return <RegisterPage />;
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <span className="sr-only">系统加载中…</span>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginPage
        onLogin={(u: UserInfo) => {
          setUser(u);
          if (u.menus) {
            setMenus(u.menus);
            safeLocalStorage.setItem("menus", JSON.stringify(u.menus));
          }
          const uWithPerms = u as UserInfo & { permissions?: string[] };
          if (uWithPerms.permissions) {
            safeLocalStorage.setItem(
              "permissions",
              JSON.stringify(uWithPerms.permissions),
            );
          }
          navigate(currentRoute === "/" ? "/dashboard" : currentRoute);
        }}
      />
    );
  }

  return (
    <I18nProvider>
      <TooltipProvider>
        <UserNamesProvider>
          <AdminLayout
            user={{ ...user, menus }}
            onLogout={async () => {
              await logout();
              setUser(null);
              navigate("/dashboard");
            }}
            currentRoute={currentRoute}
            onRouteChange={go}
          >
            {!isOnline && (
              <div className="flex items-center gap-2 border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
                <WifiOff className="size-4 shrink-0" />
                网络已断开，部分功能不可用
              </div>
            )}
            <PageSuspense>{matchPage(currentRoute, menus)}</PageSuspense>
          </AdminLayout>
        </UserNamesProvider>
      </TooltipProvider>
    </I18nProvider>
  );
};
