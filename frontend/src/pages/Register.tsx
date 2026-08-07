import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { message } from "@/lib/message";
import { publicFetch } from "@/services/api";
import { Lock, Mail, User } from "lucide-react";
import type React from "react";
import { useState } from "react";

export const RegisterPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      message.error("请填写完整信息");
      return;
    }
    if (password.length < 6) {
      message.error("密码至少6位");
      return;
    }
    if (password !== confirm) {
      message.error("两次密码不一致");
      return;
    }
    setLoading(true);
    try {
      await publicFetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      message.success("注册成功，请登录");
      window.location.href = "/";
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "网络错误");
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      <div className="w-[400px] rounded-xl border bg-card p-10 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold">创建账户</h1>
          <p className="mt-1 text-sm text-muted-foreground">注册一个新账号</p>
        </div>
        <form onSubmit={handleRegister} className="space-y-4">
          <div className="space-y-2">
            <Label>姓名</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="请输入姓名"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>邮箱</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="请输入邮箱"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>密码</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>确认密码</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="请确认密码"
                className="pl-9"
              />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "注册中..." : "注册"}
          </Button>
        </form>
        <div className="mt-4 text-center text-sm">
          <span className="text-muted-foreground">已有账号？</span>
          <Button
            variant="link"
            type="button"
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
