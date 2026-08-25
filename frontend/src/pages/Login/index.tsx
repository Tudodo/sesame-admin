import { AuthShell } from "@/components/AuthShell";
import { InlineError } from "@/components/InlineError";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFieldErrors } from "@/hooks/useFieldErrors";
import { message } from "@/lib/message";
import { safeLocalStorage } from "@/lib/utils";
import {
  type MenuData,
  login as apiLogin,
  listPublicTenants,
} from "@/services/api";
import { Building2, Loader2, Lock, Mail } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

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
  const [loading, setLoading] = useState(false);
  const {
    errors: loginErrors,
    setErrors: setLoginErrors,
    clearError: clearLoginError,
    fieldProps: loginFieldProps,
  } = useFieldErrors();
  const [tenants, setTenants] = useState<{ code: string; name: string }[]>([]);
  const [tenantLoadError, setTenantLoadError] = useState(false);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantCode, setTenantCode] = useState(
    () => safeLocalStorage.getItem("tenantCode") || "default",
  );
  const tenantRequestRef = useRef(0);
  const submittingRef = useRef(false);
  const formBusy = loading || tenantLoading;

  const loadTenants = useCallback(async () => {
    const requestId = ++tenantRequestRef.current;
    setTenantLoading(true);
    setTenantLoadError(false);
    try {
      const list = await listPublicTenants();
      if (requestId !== tenantRequestRef.current) return;
      setTenants(Array.isArray(list) ? list : []);
      if (Array.isArray(list) && list.length > 0) {
        // 若已存的 tenantCode 不在列表里，回退到第一个
        setTenantCode((current) =>
          list.some((t) => t.code === current) ? current : list[0].code,
        );
      }
    } catch {
      if (requestId !== tenantRequestRef.current) return;
      setTenantLoadError(true);
    } finally {
      if (requestId === tenantRequestRef.current) setTenantLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTenants();
    return () => {
      tenantRequestRef.current += 1;
    };
  }, [loadTenants]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || formBusy) return;
    const nextErrors: Record<string, string> = {};
    if (!email.trim()) nextErrors.email = "请输入邮箱";
    if (!password) nextErrors.password = "请输入密码";
    if (Object.keys(nextErrors).length > 0) {
      setLoginErrors(nextErrors);
      return;
    }
    setLoginErrors({});
    submittingRef.current = true;
    setLoading(true);
    try {
      // 必须在 apiLogin 之前写入：request() 内部从 localStorage 读取
      // tenantCode 作为 X-Tenant-Code 请求头，否则用的是上次的值
      safeLocalStorage.setItem("tenantCode", tenantCode);
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
      safeLocalStorage.removeItem("token");
      safeLocalStorage.removeItem("user");
      safeLocalStorage.removeItem("menus");
      safeLocalStorage.removeItem("permissions");
      const detail =
        error instanceof Error && error.message !== "Unauthorized"
          ? error.message
          : "登录失败，请检查邮箱和密码";
      message.error(detail);
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  return (
    <AuthShell compact>
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">登录账号</h1>
          <p className="text-sm text-muted-foreground">使用账号和密码登录</p>
        </div>
        {tenantLoadError && (
          <InlineError
            title="租户列表加载失败"
            description="可重试；提交时会使用当前选择的租户"
            onRetry={loadTenants}
            loading={tenantLoading}
          />
        )}
        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          {tenants.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="tenant">租户</Label>
              <Select
                value={tenantCode}
                onValueChange={setTenantCode}
                disabled={formBusy}
              >
                <SelectTrigger
                  id="tenant"
                  aria-busy={tenantLoading || undefined}
                >
                  {tenantLoading ? (
                    "加载租户…"
                  ) : (
                    <>
                      <Building2 className="size-4 mr-2 text-muted-foreground" />
                      <SelectValue placeholder="选择租户" />
                    </>
                  )}
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => (
                    <SelectItem key={t.code} value={t.code}>
                      <span
                        className="block max-w-[240px] truncate"
                        title={t.name}
                      >
                        {t.name}
                      </span>
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
                autoFocus
                placeholder="admin@swipath.com"
                className="pl-10"
                value={email}
                autoComplete="email"
                disabled={formBusy}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearLoginError("email");
                }}
                {...loginFieldProps("email", "email")}
              />
            </div>
            {loginErrors.email && (
              <FormMessage id="email-error" error={loginErrors.email} />
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <PasswordInput
              id="password"
              leadingIcon={<Lock className="size-4" />}
              placeholder="••••••••"
              value={password}
              autoComplete="current-password"
              disabled={formBusy}
              onChange={(e) => {
                setPassword(e.target.value);
                clearLoginError("password");
              }}
              {...loginFieldProps("password", "password")}
            />
            {loginErrors.password && (
              <FormMessage id="password-error" error={loginErrors.password} />
            )}
          </div>
          <Button type="submit" className="w-full" disabled={formBusy}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {loading ? "登录中…" : "登录"}
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
            disabled={formBusy}
            className="ml-1 p-0"
          >
            注册新账号
          </Button>
        </div>
      </div>
    </AuthShell>
  );
}
