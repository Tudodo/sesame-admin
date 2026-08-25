import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useFieldErrors } from "@/hooks/useFieldErrors";
import { isEmail } from "@/lib/email";
import { message } from "@/lib/message";
import { passwordError } from "@/lib/password";
import { publicFetch } from "@/services/api";
import { Loader2, Lock, Mail, User } from "lucide-react";
import type React from "react";
import { useRef, useState } from "react";

export const RegisterPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const {
    errors: formErrors,
    setErrors: setFormErrors,
    clearError: clearFormError,
    fieldProps: formFieldProps,
  } = useFieldErrors();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || loading) return;
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = "请输入姓名";
    if (!email.trim()) {
      nextErrors.email = "请输入邮箱";
    } else if (!isEmail(email)) {
      nextErrors.email = "请输入有效邮箱";
    }
    const pwdIssue = passwordError(password);
    if (!password) {
      nextErrors.password = "请输入密码";
    } else if (pwdIssue) {
      nextErrors.password = pwdIssue;
    }
    if (!confirm) {
      nextErrors.confirm = "请确认密码";
    } else if (password !== confirm) {
      nextErrors.confirm = "两次密码不一致";
    }
    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors);
      return;
    }
    setFormErrors({});
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    submittingRef.current = true;
    setLoading(true);
    try {
      await publicFetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          password,
        }),
      });
      message.success("注册成功，请登录");
      window.location.href = "/";
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "网络错误");
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  return (
    <div className="glow-bg relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "52px 52px",
          maskImage:
            "radial-gradient(ellipse 80% 70% at center, black 20%, transparent 76%)",
        }}
      />
      <div className="glass hairline relative z-10 w-full max-w-[400px] rounded-2xl border p-6 shadow-lg sm:p-10">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold">创建账户</h1>
          <p className="mt-1 text-sm text-muted-foreground">注册一个新账号</p>
        </div>
        <form onSubmit={handleRegister} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="register-name">姓名</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="register-name"
                value={name}
                autoFocus
                autoComplete="name"
                disabled={loading}
                onChange={(e) => {
                  setName(e.target.value);
                  clearFormError("name");
                }}
                {...formFieldProps("name", "register-name")}
                placeholder="请输入姓名"
                className="pl-9"
              />
            </div>
            {formErrors.name && (
              <FormMessage id="register-name-error" error={formErrors.name} />
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="register-email">邮箱</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                id="register-email"
                value={email}
                autoComplete="email"
                disabled={loading}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearFormError("email");
                }}
                {...formFieldProps("email", "register-email")}
                placeholder="请输入邮箱"
                className="pl-9"
              />
            </div>
            {formErrors.email && (
              <FormMessage id="register-email-error" error={formErrors.email} />
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="register-password">密码</Label>
            <PasswordInput
              id="register-password"
              leadingIcon={<Lock className="size-4" />}
              value={password}
              autoComplete="new-password"
              disabled={loading}
              onChange={(e) => {
                setPassword(e.target.value);
                clearFormError("password");
              }}
              {...formFieldProps("password", "register-password", [
                "register-password-hint",
              ])}
              placeholder="请输入密码"
            />
            <p
              id="register-password-hint"
              className="px-1 text-xs text-muted-foreground"
            >
              至少8位，需包含大写字母、小写字母和数字
            </p>
            {formErrors.password && (
              <FormMessage
                id="register-password-error"
                error={formErrors.password}
              />
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="register-confirm-password">确认密码</Label>
            <PasswordInput
              id="register-confirm-password"
              leadingIcon={<Lock className="size-4" />}
              value={confirm}
              autoComplete="new-password"
              disabled={loading}
              onChange={(e) => {
                setConfirm(e.target.value);
                clearFormError("confirm");
              }}
              {...formFieldProps("confirm", "register-confirm-password")}
              placeholder="请确认密码"
            />
            {formErrors.confirm && (
              <FormMessage
                id="register-confirm-password-error"
                error={formErrors.confirm}
              />
            )}
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {loading ? "注册中…" : "注册"}
          </Button>
        </form>
        <div className="mt-4 text-center text-sm">
          <span className="text-muted-foreground">已有账号？</span>
          <Button
            variant="link"
            type="button"
            disabled={loading}
            onClick={() => {
              window.location.href = "/";
            }}
            className="ml-1 p-0"
          >
            去登录
          </Button>
        </div>
      </div>
    </div>
  );
};
