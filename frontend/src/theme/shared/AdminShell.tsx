import type { MenuPerm } from "@/App";
import { BrandLogo } from "@/components/BrandLogo";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { InlineError } from "@/components/InlineError";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePageVisibility } from "@/hooks/usePageVisibility";
import { useUserNames } from "@/hooks/useUserNames";
import { message } from "@/lib/message";
import { NOTIFICATION_READ_EVENT } from "@/lib/notifications";
import { cn, safeLocalStorage } from "@/lib/utils";
import { request } from "@/services/api";
import { useTheme } from "@/theme/AppThemeProvider";
import {
  AppWindow,
  ArrowRightLeft,
  BarChart3,
  Bell,
  BookOpen,
  Building,
  Calendar,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  Cloud,
  Code,
  Container,
  Cpu,
  Database,
  Eraser,
  FileOutput,
  FilePen,
  FileSearch,
  FileText,
  Folder,
  GitBranch,
  Globe,
  HardDrive,
  Home,
  IdCard,
  Image,
  Key,
  Landmark,
  Laptop,
  LayoutDashboard,
  ListOrdered,
  LogIn,
  LogOut,
  type LucideIcon,
  Mail,
  Menu as MenuIcon,
  Monitor,
  Moon,
  Network,
  Projector,
  RefreshCw,
  Rocket,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Star,
  Sun,
  Tag,
  Trophy,
  User,
  Users,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

const iconMap: Record<string, LucideIcon> = {
  UserOutlined: User,
  TeamOutlined: Users,
  ApartmentOutlined: Building,
  MenuOutlined: MenuIcon,
  BookOutlined: BookOpen,
  SettingOutlined: Settings,
  DashboardOutlined: LayoutDashboard,
  FileOutlined: FileText,
  FileSearchOutlined: FileSearch,
  FileTextOutlined: FileText,
  FormOutlined: FilePen,
  AppstoreOutlined: AppWindow,
  SafetyOutlined: Shield,
  ToolOutlined: Wrench,
  HomeOutlined: Home,
  ShopOutlined: Building,
  ProfileOutlined: FileOutput,
  DatabaseOutlined: Database,
  CloudOutlined: Cloud,
  CalendarOutlined: Calendar,
  ContainerOutlined: Container,
  BankOutlined: Landmark,
  BellOutlined: Bell,
  BranchesOutlined: GitBranch,
  SwapOutlined: ArrowRightLeft,
  SlidersHorizontalOutlined: SlidersHorizontal,
  BarChartOutlined: BarChart3,
  CheckCircleOutlined: CircleCheck,
  ClockCircleOutlined: Clock,
  ControlOutlined: Cpu,
  DesktopOutlined: Monitor,
  EnvironmentOutlined: Network,
  FolderOutlined: Folder,
  GlobalOutlined: Globe,
  IdcardOutlined: IdCard,
  KeyOutlined: Key,
  LaptopOutlined: Laptop,
  MonitorOutlined: Monitor,
  PictureOutlined: Image,
  ProjectOutlined: Projector,
  ReadOutlined: BookOpen,
  RocketOutlined: Rocket,
  SearchOutlined: Search,
  SolutionOutlined: CheckSquare,
  StarOutlined: Star,
  TagOutlined: Tag,
  TrophyOutlined: Trophy,
  WalletOutlined: Wallet,
  HddOutlined: HardDrive,
  CodeOutlined: Code,
  LoginOutlined: LogIn,
  SyncOutlined: RefreshCw,
  OrderedListOutlined: ListOrdered,
  ClearOutlined: Eraser,
};

function getIcon(name: string | null): LucideIcon | null {
  if (!name) return null;
  return iconMap[name] || null;
}

interface NavItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  children?: NavItem[];
}

function buildNav(menus: MenuPerm[]): NavItem[] {
  const visible = menus
    .filter((m) => m.visible !== false && m.menu_type !== "F")
    .sort((a, b) => a.sort_order - b.sort_order);
  const topLevel = visible.filter((m) => !m.parent_id);
  function childrenOf(parentId: number): NavItem[] {
    return visible
      .filter((m) => m.parent_id === parentId)
      .map((m) => {
        const nested = childrenOf(m.id);
        return {
          key: m.path || `/page/${m.id}`,
          label: m.name,
          icon: getIcon(m.icon) || undefined,
          children: nested.length > 0 ? nested : undefined,
        };
      });
  }
  return topLevel.map((m) => {
    const nested = childrenOf(m.id);
    return {
      key: m.path || `/page/${m.id}`,
      label: m.name,
      icon: getIcon(m.icon) || undefined,
      children: nested.length > 0 ? nested : undefined,
    };
  });
}

function firstLeaf(item: NavItem): NavItem | null {
  if (!item.children?.length) return item;
  for (const child of item.children) {
    const leaf = firstLeaf(child);
    if (leaf) return leaf;
  }
  return null;
}

function findSearchTarget(items: NavItem[], keyword: string): NavItem | null {
  for (const item of items) {
    const matched = item.label.toLowerCase().includes(keyword);
    if (matched && !item.children?.length) return item;
    if (item.children?.length) {
      const childTarget = findSearchTarget(item.children, keyword);
      if (childTarget) return childTarget;
      if (matched) {
        const fallback = firstLeaf(item);
        if (fallback) return fallback;
      }
    }
  }
  return null;
}

export interface AdminLayoutProps {
  user: {
    pid: string;
    name: string;
    email: string;
    roles: string[];
    menus: MenuPerm[];
  };
  onLogout: () => void | Promise<void>;
  currentRoute: string;
  onRouteChange: (path: string) => void;
  children: React.ReactNode;
}

function NavMenu({
  items,
  currentRoute,
  onNavigate,
  level = 0,
  collapsed = false,
}: {
  items: NavItem[];
  currentRoute: string;
  onNavigate: (path: string) => void;
  level?: number;
  collapsed?: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    function find(items: NavItem[], parents: string[]): boolean {
      for (const item of items) {
        if (item.key === currentRoute) return true;
        if (item.children) {
          if (find(item.children, [...parents, item.key])) {
            for (const p of parents) s.add(p);
            return true;
          }
        }
      }
      return false;
    }
    find(items, []);
    return s;
  });

  useEffect(() => {
    const parentKeys = new Set<string>();
    function markParents(nodes: NavItem[], parents: string[]): boolean {
      for (const node of nodes) {
        if (node.key === currentRoute) {
          for (const key of parents) parentKeys.add(key);
          return true;
        }
        if (
          node.children &&
          markParents(node.children, [...parents, node.key])
        ) {
          return true;
        }
      }
      return false;
    }
    markParents(items, []);
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const key of parentKeys) next.add(key);
      return next.size === prev.size ? prev : next;
    });
  }, [items, currentRoute]);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-0.5">
      {items.map((item) => {
        const hasChildren = item.children && item.children.length > 0;
        const isExpanded = expanded.has(item.key);
        const isActive =
          currentRoute === item.key || currentRoute.startsWith(`${item.key}/`);
        const Icon = item.icon;

        return (
          <div key={item.key}>
            <Button
              type="button"
              variant="ghost"
              className={cn(
                "flex items-center rounded-xl py-2 text-sm cursor-pointer transition-all duration-300 ease-fluid",
                collapsed ? "justify-center px-2" : "gap-2 px-3",
                isActive
                  ? "bg-accent text-accent-foreground shadow-[inset_0_0_0_1px_var(--hairline),0_10px_28px_-16px_var(--primary)]"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
                !collapsed && level > 0 && "ml-4",
              )}
              title={item.label}
              data-active={isActive ? "true" : undefined}
              aria-expanded={hasChildren && !collapsed ? isExpanded : undefined}
              aria-label={collapsed ? item.label : undefined}
              aria-current={isActive && !hasChildren ? "page" : undefined}
              onClick={() => {
                if (hasChildren) {
                  if (collapsed) {
                    const leaf = firstLeaf(item);
                    if (leaf) onNavigate(leaf.key);
                  } else {
                    toggle(item.key);
                  }
                } else {
                  onNavigate(item.key);
                }
              }}
            >
              {Icon && <Icon className="size-4 flex-shrink-0" />}
              {!collapsed && (
                <span className="flex-1 truncate" title={item.label}>
                  {item.label}
                </span>
              )}
              {!collapsed && hasChildren && (
                <ChevronRight
                  className={cn(
                    "size-4 transition-transform",
                    isExpanded && "rotate-90",
                  )}
                />
              )}
            </Button>
            {!collapsed && hasChildren && isExpanded && (
              <div className="mt-0.5">
                <NavMenu
                  items={item.children ?? []}
                  currentRoute={currentRoute}
                  onNavigate={onNavigate}
                  level={level + 1}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AdminShell({
  user,
  onLogout,
  currentRoute,
  onRouteChange,
  children,
}: AdminLayoutProps) {
  const { darkMode, setDarkMode } = useTheme();
  const pageVisible = usePageVisibility();
  const {
    error: userNamesError,
    refreshing: userNamesRefreshing,
    refresh: refreshUserNames,
  } = useUserNames();

  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return safeLocalStorage.getItem("sidebarCollapsed") === "true";
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const mainRef = useRef<HTMLElement>(null);

  // 路由切换时将内容区域滚动到顶部，避免新页面停留在上一个页面的滚动位置。
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [currentRoute]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const pollNotif = () => {
      request<{ count: number }>("/notifications/unread-count")
        .then((res) => {
          if (active) setUnreadNotifications(Number(res?.count) || 0);
        })
        .catch(() => {
          /* non-critical */
        });
    };
    pollNotif();
    if (!pageVisible) {
      const refreshOnRead = () => pollNotif();
      window.addEventListener(NOTIFICATION_READ_EVENT, refreshOnRead);
      return () => {
        active = false;
        window.removeEventListener(NOTIFICATION_READ_EVENT, refreshOnRead);
      };
    }
    const notifTimer = setInterval(pollNotif, 60000);
    const refreshOnRead = () => pollNotif();
    window.addEventListener(NOTIFICATION_READ_EVENT, refreshOnRead);
    return () => {
      active = false;
      clearInterval(notifTimer);
      window.removeEventListener(NOTIFICATION_READ_EVENT, refreshOnRead);
    };
  }, [user, pageVisible]);

  const navItems = useMemo(
    () => (user.menus.length > 0 ? buildNav(user.menus) : []),
    [user.menus],
  );

  const handleNavigate = (path: string) => {
    onRouteChange(path);
    setMobileOpen(false);
  };

  const handleSearch = () => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) return;
    const target = findSearchTarget(navItems, keyword);
    if (target) {
      handleNavigate(target.key);
      setSearchQuery("");
    } else {
      message.info("未找到匹配菜单");
    }
  };

  const renderSidebar = (collapsed: boolean, showProduct = false) => (
    <div className="flex h-full flex-col">
      <div className="flex h-[4.5rem] items-center border-b border-hairline px-4">
        <BrandLogo
          showText={!collapsed}
          suffix="顺程云创"
          productName={showProduct ? "Sesame Admin" : undefined}
          productSize="sm"
          className="min-w-0"
        />
      </div>
      <ScrollArea className="flex-1 px-3 py-4">
        {navItems.length > 0 ? (
          <NavMenu
            items={navItems}
            currentRoute={currentRoute}
            onNavigate={handleNavigate}
            collapsed={collapsed}
          />
        ) : (
          <div className="block px-3 py-4 text-sm text-muted-foreground">
            当前账号暂无可用菜单，请联系管理员分配菜单或权限。
          </div>
        )}
      </ScrollArea>
      <div className="border-t border-hairline px-4 py-3 text-center text-xs text-muted-foreground">
        Sesame Admin ©{new Date().getFullYear()}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <button
        type="button"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-lg"
        onClick={() => {
          mainRef.current?.focus();
          mainRef.current?.scrollTo(0, 0);
        }}
      >
        跳转到主内容
      </button>

      <aside
        className={cn(
          "glass hairline hidden md:flex flex-col border-r transition-all duration-300 ease-fluid",
          sidebarCollapsed ? "w-[4.5rem]" : "w-60",
        )}
      >
        {renderSidebar(sidebarCollapsed)}
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">导航菜单</SheetTitle>
          <SheetDescription className="sr-only">
            移动端侧边栏导航
          </SheetDescription>
          {renderSidebar(false, true)}
        </SheetContent>
      </Sheet>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="glass hairline flex h-16 items-center justify-between gap-3 border-b px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={() => setMobileOpen(true)}
                  aria-label="打开菜单"
                >
                  <MenuIcon className="size-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>打开菜单</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden md:flex"
                  onClick={() => {
                    const next = !sidebarCollapsed;
                    setSidebarCollapsed(next);
                    safeLocalStorage.setItem("sidebarCollapsed", String(next));
                  }}
                  aria-label={sidebarCollapsed ? "展开侧边栏" : "折叠侧边栏"}
                >
                  {sidebarCollapsed ? (
                    <ChevronRight className="size-5" />
                  ) : (
                    <ChevronLeft className="size-5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>折叠侧边栏</TooltipContent>
            </Tooltip>
            <span className="hidden min-w-0 truncate text-sm font-semibold tracking-tight text-foreground md:inline-flex">
              Sesame Admin
            </span>
            <div className="hidden min-w-0 max-w-[420px] flex-1 items-center gap-2 rounded-full border border-hairline bg-muted/70 px-3 py-1.5 backdrop-blur-sm md:flex">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                className="w-full border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleSearch();
                }}
                placeholder="搜索菜单"
                aria-label="搜索菜单"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setSearchQuery("")}
                  aria-label="清除搜索"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative"
                  onClick={() => onRouteChange("/notifications")}
                  aria-label="通知"
                >
                  <Bell className="size-4" />
                  {unreadNotifications > 0 && (
                    <Badge
                      variant="destructive"
                      className="absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 text-[10px]"
                    >
                      {unreadNotifications > 99 ? "99+" : unreadNotifications}
                    </Badge>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>通知</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const next = !darkMode;
                    setDarkMode(next);
                  }}
                  aria-label={darkMode ? "浅色模式" : "深色模式"}
                  aria-pressed={darkMode}
                >
                  {darkMode ? (
                    <Sun className="size-4" />
                  ) : (
                    <Moon className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {darkMode ? "浅色模式" : "深色模式"}
              </TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="flex items-center gap-2 rounded-full px-2 py-1"
                  aria-label={`用户菜单：${user.name}`}
                >
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {user.name?.[0]?.toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className="hidden max-w-[160px] truncate text-sm font-medium sm:inline"
                    title={user.name}
                  >
                    {user.name}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="max-w-[260px] px-2 py-1.5 text-xs text-muted-foreground">
                  <p className="truncate" title={user.email}>
                    {user.email}
                  </p>
                  <p className="break-words">{user.roles?.join(", ")}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onRouteChange("/profile")}>
                  <User className="size-4" />
                  个人中心
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    await onLogout();
                  }}
                >
                  <LogOut className="size-4" />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main
          ref={mainRef}
          tabIndex={-1}
          aria-label="主内容区域"
          className="glow-bg flex-1 overflow-auto p-4 focus:outline-none md:p-6"
        >
          {userNamesError && (
            <div className="mb-3">
              <InlineError
                title="用户姓名解析失败"
                description="部分姓名将显示用户编号，请重试后再查看列表。"
                loading={userNamesRefreshing}
                onRetry={() => void refreshUserNames()}
              />
            </div>
          )}
          <ErrorBoundary key={currentRoute}>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
