import type { MenuPerm } from "@/App";
import { ErrorBoundary } from "@/components/ErrorBoundary";
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
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useI18n } from "@/locales/I18nContext";
import { request } from "@/services/api";
import { useTheme } from "@/theme/AppThemeProvider";
import { ThemeSwitcher } from "@/theme/shared/ThemeSwitcher";
import {
  AppWindow,
  ArrowRightLeft,
  Bell,
  BookOpen,
  BookOpen as BookRead,
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
  Globe,
  HardDrive,
  Home,
  IdCard,
  Image,
  Key,
  Landmark,
  Languages,
  Laptop,
  LayoutDashboard,
  Layout as LayoutIcon,
  ListOrdered,
  LogIn,
  LogOut,
  type LucideIcon,
  type LucideProps,
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
  Star,
  Sun,
  Tag,
  Trophy,
  User,
  User as UserIcon,
  Users,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";

const iconMap: Record<string, LucideIcon> = {
  UserOutlined: UserIcon,
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
  SwapOutlined: ArrowRightLeft,
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
      .map((m) => ({
        key: m.path || `/page/${m.id}`,
        label: m.name,
        icon: getIcon(m.icon) || undefined,
        children: childrenOf(m.id).length > 0 ? childrenOf(m.id) : undefined,
      }));
  }
  return topLevel.map((m) => ({
    key: m.path || `/page/${m.id}`,
    label: m.name,
    icon: getIcon(m.icon) || undefined,
    children: childrenOf(m.id).length > 0 ? childrenOf(m.id) : undefined,
  }));
}

function flattenNav(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => [
    item,
    ...(item.children ? flattenNav(item.children) : []),
  ]);
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
  themed = false,
}: {
  items: NavItem[];
  currentRoute: string;
  onNavigate: (path: string) => void;
  level?: number;
  collapsed?: boolean;
  themed?: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // auto-expand parents of current route
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
                "tudodo-nav-item flex items-center rounded-md py-2 text-sm cursor-pointer transition-colors",
                collapsed
                  ? "justify-center px-2 tudodo-nav-item-collapsed"
                  : "gap-2 px-3",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent",
                !collapsed && level > 0 && "ml-4",
                themed && "tudodo-nav-item",
              )}
              title={collapsed ? item.label : undefined}
              data-active={isActive ? "true" : undefined}
              onClick={() => {
                if (hasChildren) toggle(item.key);
                else onNavigate(item.key);
              }}
            >
              {Icon && <Icon className="size-4 flex-shrink-0" />}
              {!collapsed && (
                <span className="flex-1 truncate">{item.label}</span>
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
                  themed={themed}
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
  const { themePreset, darkMode, setDarkMode } = useTheme();
  const { locale, setLocale } = useI18n();
  const themed = themePreset !== "default";

  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!user) return;
    const pollNotif = () => {
      request<{ count: number }>("/notifications/unread-count")
        .then((res) => setUnreadNotifications(Number(res?.count) || 0))
        .catch(() => {
          /* non-critical */
        });
    };
    pollNotif();
    const notifTimer = setInterval(pollNotif, 60000);
    return () => clearInterval(notifTimer);
  }, [user]);
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
    const target = flattenNav(navItems).find((item) =>
      item.label.toLowerCase().includes(keyword),
    );
    if (target) {
      handleNavigate(target.key);
      setSearchQuery("");
    }
  };

  const renderSidebar = (collapsed: boolean) => (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div
        className={cn(
          "flex h-14 items-center gap-2 border-b px-4",
          themed && "tudodo-brand",
        )}
      >
        <div
          className={cn(
            "flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold",
            themed && "tudodo-brand-mark",
          )}
        >
          S
        </div>
        {!collapsed && (
          <span
            className={cn(
              "font-semibold text-lg",
              themed && "tudodo-brand-text",
            )}
          >
            Sesame Admin
          </span>
        )}
      </div>
      {/* Nav */}
      <ScrollArea
        className={cn("flex-1 px-2 py-3", themed && "tudodo-nav-scroll")}
      >
        {themed && <div className="tudodo-nav-label">菜单</div>}
        <NavMenu
          items={navItems}
          currentRoute={currentRoute}
          onNavigate={handleNavigate}
          collapsed={collapsed}
          themed={themed}
        />
      </ScrollArea>
      {/* Footer */}
      {themed ? (
        <div className="tudodo-sidebar-foot">
          <button
            type="button"
            className="tudodo-user-chip"
            onClick={() => onRouteChange("/profile")}
          >
            <Avatar className="tudodo-avatar">
              <AvatarFallback className="tudodo-avatar-fallback">
                {user.name[0]}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-semibold">
                  {user.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {user.roles?.join(", ") || user.email}
                </span>
              </span>
            )}
          </button>
        </div>
      ) : (
        <div className="border-t px-4 py-2 text-center text-xs text-muted-foreground">
          Sesame Admin ©{new Date().getFullYear()}
        </div>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        "flex h-screen overflow-hidden bg-background",
        themed && "tudodo-shell",
      )}
    >
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "tudodo-sidebar hidden md:flex flex-col border-r bg-sidebar transition-all duration-200",
          sidebarCollapsed ? "w-16" : "w-56",
          sidebarCollapsed && "is-collapsed",
        )}
      >
        {renderSidebar(sidebarCollapsed)}
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className={cn("w-64 p-0", themed && "tudodo-sidebar")}
        >
          {renderSidebar(false)}
        </SheetContent>
      </Sheet>

      {/* Main */}
      <div
        className={cn(
          "flex flex-1 flex-col overflow-hidden",
          themed && "tudodo-main-column",
        )}
      >
        {/* Header */}
        <header
          className={cn(
            "flex h-14 items-center justify-between border-b px-4",
            themed && "tudodo-topbar",
          )}
        >
          <div
            className={cn(
              "flex items-center gap-2",
              themed && "tudodo-topbar-left",
            )}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={() => setMobileOpen(true)}
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
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
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
            {themed && (
              <div className="tudodo-search hidden md:flex">
                <Search className="size-4" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleSearch();
                  }}
                  placeholder="搜索菜单"
                  aria-label="搜索菜单"
                />
              </div>
            )}
          </div>

          <div
            className={cn(
              "flex items-center gap-2",
              themed && "tudodo-topbar-actions",
            )}
          >
            {/* Notifications */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative"
                  onClick={() => onRouteChange("/notifications")}
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

            {/* Dark mode toggle */}
            <ThemeSwitcher />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const next = !darkMode;
                    setDarkMode(next);
                  }}
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

            {/* Locale toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setLocale(locale === "zh-CN" ? "en-US" : "zh-CN")
                  }
                >
                  <Languages className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {locale === "zh-CN" ? "English" : "中文"}
              </TooltipContent>
            </Tooltip>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="flex items-center gap-2 rounded-md px-2 py-1"
                >
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {user.name[0]}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium hidden sm:inline">
                    {user.name}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  {user.email}
                  <br />
                  {user.roles?.join(", ")}
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

        {/* Content */}
        <main
          className={cn(
            "flex-1 overflow-auto p-4 md:p-6",
            themed && "tudodo-content",
          )}
        >
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
