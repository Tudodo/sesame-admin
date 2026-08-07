import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { message } from "@/lib/message";
import {
  type MenuData,
  login as apiLogin,
  listPublicTenants,
} from "@/services/api";
import { Building2, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useEffect, useState } from "react";

interface LoginPageProps {
  onLogin?: (user: {
    pid: string;
    name: string;
    email: string;
    roles: string[];
    permissions: string[];
    menus: MenuData[];
  }) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tenants, setTenants] = useState<{ code: string; name: string }[]>([]);
  const [tenantCode, setTenantCode] = useState(
    () => localStorage.getItem("tenantCode") || "default",
  );

  useEffect(() => {
    listPublicTenants()
      .then((list) => {
        if (Array.isArray(list) && list.length > 0) {
          setTenants(list);
          // 若已存的 tenantCode 不在列表里，回退到第一个
          if (!list.some((t) => t.code === tenantCode)) {
            setTenantCode(list[0].code);
          }
        }
      })
      .catch(() => {});
  }, [tenantCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // 必须在 apiLogin 之前写入：request() 内部从 localStorage 读取
      // tenantCode 作为 X-Tenant-Code 请求头，否则用的是上次的值
      localStorage.setItem("tenantCode", tenantCode);
      const res = await apiLogin(email, password);
      // JWT 由后端写入 HttpOnly cookie，前端不再把 token 放进 localStorage。
      message.success("登录成功");
      if (onLogin) {
        onLogin(res);
      } else {
        window.location.href = "/";
      }
    } catch (error) {
      // 登录失败时清除旧登录态，避免残留 token/user 导致页面错乱
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("menus");
      localStorage.removeItem("permissions");
      const detail =
        error instanceof Error && error.message !== "Unauthorized"
          ? error.message
          : "登录失败，请检查邮箱和密码";
      message.error(detail);
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 rounded-lg border bg-card p-8 shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">登录</h1>
          <p className="text-sm text-muted-foreground">
            输入您的账号密码登录系统
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {tenants.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="tenant">租户</Label>
              <Select value={tenantCode} onValueChange={setTenantCode}>
                <SelectTrigger id="tenant">
                  <Building2 className="size-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="选择租户" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => (
                    <SelectItem key={t.code} value={t.code}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                className="pl-9"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type={showPwd ? "text" : "password"}
                placeholder="••••••••"
                className="pl-9 pr-9"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowPwd(!showPwd)}
                className="absolute right-1 top-1/2 -translate-y-1/2 size-7 text-muted-foreground hover:text-foreground"
              >
                {showPwd ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </Button>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "登录中..." : "登录"}
          </Button>
        </form>
        <div className="mt-6 text-center text-sm">
          <span className="text-muted-foreground">还没有账号？</span>
          <Button
            variant="link"
            type="button"
            onClick={() => {
              window.location.href = "/register";
            }}
            className="ml-1 p-0"
          >
            注册新账号
          </Button>
        </div>
      </div>
    </div>
  );
}
