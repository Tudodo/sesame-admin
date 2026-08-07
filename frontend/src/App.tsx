import { Loader2 } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { TooltipProvider } from "./components/ui/tooltip";
import { UserNamesProvider } from "./hooks/useUserNames";
import { AdminLayout } from "./layouts/AdminLayout";
import { setNavigator } from "./lib/navigation";
import { I18nProvider } from "./locales/I18nContext";
import { CacheManagementPage } from "./pages/CacheManagement";
import { CodeGenPage } from "./pages/CodeGen";
import { DashboardPage } from "./pages/Dashboard";
import { DataSyncPage } from "./pages/DataSync";
import { DepartmentsPage } from "./pages/Departments";
import { DictionariesPage } from "./pages/Dictionaries";
import { DynamicPage } from "./pages/DynamicPage";
import { FileManagementPage } from "./pages/FileManagement";
import { JobQueuePage } from "./pages/JobQueue";
import { LoginPage } from "./pages/Login";
import { LoginLogsPage } from "./pages/LoginLogs";
import { MenusPage } from "./pages/Menus";
import { NotificationsPage } from "./pages/Notifications";
import { OnlineUsersPage } from "./pages/OnlineUsers";
import { OperLogsPage } from "./pages/OperLogs";
import { PositionsPage } from "./pages/Positions";
import { ProfilePage } from "./pages/Profile";
import { RegisterPage } from "./pages/Register";
import { RolesPage } from "./pages/Roles";
import { ScheduledTasksPage } from "./pages/ScheduledTasks";
import { ServerMonitorPage } from "./pages/ServerMonitor";
import { SysConfigsPage } from "./pages/SysConfigs";
import { TenantsPage } from "./pages/Tenants";
import { UsersPage } from "./pages/Users";
import { clearSessionState, getCurrentUser, logout } from "./services/api";

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

function pageCodeFromRoute(route: string): string {
  const queryIndex = route.indexOf("?");
  if (queryIndex < 0) return "";
  return new URLSearchParams(route.slice(queryIndex + 1)).get("code") || "";
}

/** Page registry keyed by normalized path (leading-slash-stripped). */
const pageMap: Record<string, (route: string) => React.ReactNode> = {
  dashboard: () => <DashboardPage />,
  users: () => <UsersPage />,
  roles: () => <RolesPage />,
  departments: () => <DepartmentsPage />,
  positions: () => <PositionsPage />,
  menus: () => <MenusPage />,
  dictionaries: () => <DictionariesPage />,
  "oper-logs": () => <OperLogsPage />,
  "login-logs": () => <LoginLogsPage />,
  "sys-configs": () => <SysConfigsPage />,
  "online-users": () => <OnlineUsersPage />,
  "server-monitor": () => <ServerMonitorPage />,
  profile: () => <ProfilePage />,
  register: () => <RegisterPage />,
  codegen: () => <CodeGenPage />,
  cache: () => <CacheManagementPage />,
  tenants: () => <TenantsPage />,
  dynamic: (route) => <DynamicPage pageCode={pageCodeFromRoute(route)} />,
  "scheduled-tasks": () => <ScheduledTasksPage />,
  "data-sync": () => <DataSyncPage />,
  "job-queue": () => <JobQueuePage />,
  notifications: () => <NotificationsPage />,
  "file-management": () => <FileManagementPage />,
};

function normalizePath(raw: string | null): string {
  return (raw || "").replace(/^\/+/, "");
}

// Routes available to every authenticated user regardless of menu perms.
const PUBLIC_ROUTES = new Set([
  "dashboard",
  "profile",
  "register",
  "notifications",
  "dynamic",
]);

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
  const isAllowed =
    PUBLIC_ROUTES.has(baseKey) ||
    allowedPaths.has(baseKey) ||
    // deep-link routes: allow if the parent path is permitted
    Object.entries(pageMap).some(
      ([pk]) =>
        (baseKey === pk || baseKey.startsWith(`${pk}/`)) &&
        (PUBLIC_ROUTES.has(pk) || allowedPaths.has(pk)),
    );
  if (!isAllowed) return <DashboardPage />;
  if (pageMap[baseKey]) return pageMap[baseKey](key);
  for (const [pk, page] of Object.entries(pageMap).sort(
    (a, b) => b[0].length - a[0].length,
  )) {
    if (key === pk || key.startsWith(`${pk}?`)) return page(key);
  }
  return <DashboardPage />;
}

export const App = () => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentRoute, setCurrentRoute] = useState<string>(() => {
    const path = window.location.pathname;
    if (path === "/register") return "/register";
    if (path && path !== "/") return path + window.location.search;
    return localStorage.getItem("currentRoute") || "/users";
  });
  const [menus, setMenus] = useState<MenuPerm[]>([]);

  useEffect(() => {
    // 登录态来自 HttpOnly cookie，不依赖 localStorage token；未登录时由
    // /auth/current 返回 401 并正常落到登录页。
    const stored = localStorage.getItem("menus");
    if (stored) {
      try {
        setMenus(JSON.parse(stored));
      } catch {
        // 非关键：localStorage 菜单JSON解析失败时跳过，后续 getCurrentUser 会重新拉取
      }
    }
    getCurrentUser(false)
      .then((u) => {
        setUser(u);
        if (u.menus) {
          setMenus(u.menus);
          localStorage.setItem("menus", JSON.stringify(u.menus));
        }
        const uWithPerms = u as UserInfo & { permissions?: string[] };
        if (uWithPerms.permissions) {
          localStorage.setItem(
            "permissions",
            JSON.stringify(uWithPerms.permissions),
          );
        }
      })
      .catch(() => {
        clearSessionState();
      })
      .finally(() => setLoading(false));
  }, []);

  // Expose a SPA navigator so standalone screens (Notifications, post-submit
  // success views, ...) can switch routes without a full page reload, which
  // the App would otherwise ignore (only /register is read on load).
  useEffect(() => {
    setNavigator((path) => {
      setCurrentRoute(path);
      localStorage.setItem("currentRoute", path);
      // Mirror the path (including any query string) into the browser URL so
      // pages that read window.location.search work without a full reload.
      const target = path.startsWith("/") ? path : `/${path}`;
      window.history.replaceState({}, "", target);
    });
    return () => setNavigator(null);
  }, []);

  useEffect(() => {
    const key = normalizePath(currentRoute);
    const currentMenu = menus.find((m) => normalizePath(m.path) === key);
    const actions = currentMenu?.granted_actions || [];
    const available = currentMenu?.available_actions || [];
    localStorage.setItem("currentActions", JSON.stringify(actions));
    localStorage.setItem("currentAvailableActions", JSON.stringify(available));
  }, [currentRoute, menus]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (currentRoute === "/register" && !user) {
    return <RegisterPage />;
  }

  if (!user) {
    return (
      <LoginPage
        onLogin={(u: UserInfo) => {
          setUser(u);
          if (u.menus) setMenus(u.menus);
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
            }}
            currentRoute={currentRoute}
            onRouteChange={(path) => {
              setCurrentRoute(path);
              localStorage.setItem("currentRoute", path);
            }}
          >
            {matchPage(currentRoute, menus)}
          </AdminLayout>
        </UserNamesProvider>
      </TooltipProvider>
    </I18nProvider>
  );
};
