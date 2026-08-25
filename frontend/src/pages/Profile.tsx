import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useFieldErrors } from "@/hooks/useFieldErrors";
import { message } from "@/lib/message";
import { passwordError } from "@/lib/password";
import { apiFetch, logout } from "@/services/api";
import { AlertCircle, Lock, Mail, User } from "lucide-react";
import { Loader2 } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { useRef } from "react";

interface ProfileData {
  pid: string;
  name: string;
  email: string;
  avatar: string | null;
  roles: { id: number; name: string }[];
  departments: { id: number; name: string }[];
  positions: { id: number; name: string }[];
}

export const ProfilePage: React.FC = () => {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);
  const profileRequestRef = useRef(0);
  const [pwdLoading, setPwdLoading] = useState(false);
  const profileSavingRef = useRef(false);
  const pwdSavingRef = useRef(false);
  const fetchingProfileRef = useRef(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const profileFormErrors = useFieldErrors();
  const pwdFormErrors = useFieldErrors();
  const profileSaveDisabled =
    !profile || profileLoading || profileError || loading || pwdLoading;
  const pwdSaveDisabled = loading || pwdLoading;

  const fetchProfile = async (force = false) => {
    if (fetchingProfileRef.current && !force) return;
    fetchingProfileRef.current = true;
    const requestId = ++profileRequestRef.current;
    setProfileLoading(true);
    try {
      const data = await apiFetch<ProfileData>("/api/profile");
      if (requestId !== profileRequestRef.current) return;
      setProfile(data);
      setName(data.name);
      setEmail(data.email);
      setProfileError(false);
    } catch {
      if (requestId !== profileRequestRef.current) return;
      // 资料加载失败时在页面上给出可见提示，保留已填字段供用户重试。
      setProfileError(true);
    } finally {
      if (requestId === profileRequestRef.current) {
        setProfileLoading(false);
        fetchingProfileRef.current = false;
      }
    }
  };

  useEffect(() => {
    fetchProfile();
    return () => {
      profileRequestRef.current += 1;
      fetchingProfileRef.current = false;
    };
  }, []);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || pwdLoading || profileLoading || profileError || !profile)
      return;
    if (!profile) {
      message.error("资料尚未加载，请稍后重试");
      return;
    }
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const nextErrors: Record<string, string> = {};
    if (!trimmedName) {
      nextErrors.name = "姓名不能为空";
    }
    if (!trimmedEmail) {
      nextErrors.email = "邮箱不能为空";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      nextErrors.email = "请输入有效邮箱";
    }
    if (Object.keys(nextErrors).length > 0) {
      profileFormErrors.setErrors(nextErrors);
      return;
    }
    profileFormErrors.clearErrors();
    if (profileSavingRef.current) return;
    profileSavingRef.current = true;
    setLoading(true);
    try {
      await apiFetch("/api/profile", {
        method: "PUT",
        body: JSON.stringify({ name: trimmedName, email: trimmedEmail }),
      });
      message.success("资料已更新");
      await fetchProfile(true);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "更新失败");
    } finally {
      setLoading(false);
      profileSavingRef.current = false;
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || pwdLoading) return;
    if (pwdSavingRef.current) return;
    const nextErrors: Record<string, string> = {};
    if (!oldPwd) {
      nextErrors.oldPwd = "请输入原密码";
    }
    if (!newPwd) {
      nextErrors.newPwd = "请输入新密码";
    } else {
      const pwdIssue = passwordError(newPwd);
      if (pwdIssue) nextErrors.newPwd = pwdIssue;
    }
    if (!confirmPwd) {
      nextErrors.confirmPwd = "请确认新密码";
    } else if (newPwd !== confirmPwd) {
      nextErrors.confirmPwd = "两次密码不一致";
    }
    if (Object.keys(nextErrors).length > 0) {
      pwdFormErrors.setErrors(nextErrors);
      return;
    }
    pwdFormErrors.clearErrors();
    pwdSavingRef.current = true;
    setPwdLoading(true);
    try {
      await apiFetch("/api/profile/password", {
        method: "PUT",
        body: JSON.stringify({ old_password: oldPwd, new_password: newPwd }),
      });
      // 后端改密后会吊销当前用户所有会话，必须清理本地登录态并回到登录页。
      await logout();
      message.success("密码已修改，请重新登录");
      window.location.href = "/";
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "修改失败");
    } finally {
      setPwdLoading(false);
      pwdSavingRef.current = false;
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>基本资料</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            {profileError && (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
              >
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>资料加载失败，请稍后重试</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void fetchProfile(true)}
                  disabled={profileLoading}
                >
                  {profileLoading ? (
                    <Loader2 className="size-4 mr-1 animate-spin" />
                  ) : null}
                  重试
                </Button>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="profile-name">姓名</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="profile-name"
                  placeholder="请输入姓名"
                  value={name}
                  disabled={profileSaveDisabled}
                  onChange={(e) => {
                    setName(e.target.value);
                    profileFormErrors.clearError("name");
                  }}
                  {...profileFormErrors.fieldProps("name", "profile-name")}
                  className="pl-9"
                  autoComplete="name"
                />
              </div>
              {profileFormErrors.errors.name && (
                <FormMessage
                  id="profile-name-error"
                  error={profileFormErrors.errors.name}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-email">邮箱</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="email"
                  id="profile-email"
                  placeholder="请输入邮箱地址"
                  value={email}
                  disabled={profileSaveDisabled}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    profileFormErrors.clearError("email");
                  }}
                  {...profileFormErrors.fieldProps("email", "profile-email")}
                  className="pl-9"
                  autoComplete="email"
                />
              </div>
              {profileFormErrors.errors.email && (
                <FormMessage
                  id="profile-email-error"
                  error={profileFormErrors.errors.email}
                />
              )}
            </div>
            <Button type="submit" disabled={profileSaveDisabled}>
              {profileLoading ? "加载中…" : loading ? "保存中…" : "保存"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>安全设置</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profile-current-password">原密码</Label>
                <PasswordInput
                  id="profile-current-password"
                  placeholder="请输入当前密码"
                  leadingIcon={<Lock className="size-4" />}
                  value={oldPwd}
                  autoComplete="current-password"
                  disabled={pwdSaveDisabled}
                  onChange={(e) => {
                    setOldPwd(e.target.value);
                    pwdFormErrors.clearError("oldPwd");
                  }}
                  {...pwdFormErrors.fieldProps(
                    "oldPwd",
                    "profile-current-password",
                  )}
                />
                {pwdFormErrors.errors.oldPwd && (
                  <FormMessage
                    id="profile-current-password-error"
                    error={pwdFormErrors.errors.oldPwd}
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-new-password">新密码</Label>
                <PasswordInput
                  id="profile-new-password"
                  placeholder="请输入新密码"
                  leadingIcon={<Lock className="size-4" />}
                  value={newPwd}
                  autoComplete="new-password"
                  disabled={pwdSaveDisabled}
                  onChange={(e) => {
                    setNewPwd(e.target.value);
                    pwdFormErrors.clearError("newPwd");
                  }}
                  {...pwdFormErrors.fieldProps(
                    "newPwd",
                    "profile-new-password",
                    ["profile-new-password-hint"],
                  )}
                />
                <p
                  id="profile-new-password-hint"
                  className="px-1 text-xs text-muted-foreground"
                >
                  至少8位，需包含大写字母、小写字母和数字
                </p>
                {pwdFormErrors.errors.newPwd && (
                  <FormMessage
                    id="profile-new-password-error"
                    error={pwdFormErrors.errors.newPwd}
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-confirm-password">确认密码</Label>
                <PasswordInput
                  id="profile-confirm-password"
                  placeholder="请再次输入新密码"
                  leadingIcon={<Lock className="size-4" />}
                  value={confirmPwd}
                  autoComplete="new-password"
                  disabled={pwdSaveDisabled}
                  onChange={(e) => {
                    setConfirmPwd(e.target.value);
                    pwdFormErrors.clearError("confirmPwd");
                  }}
                  {...pwdFormErrors.fieldProps(
                    "confirmPwd",
                    "profile-confirm-password",
                  )}
                />
                {pwdFormErrors.errors.confirmPwd && (
                  <FormMessage
                    id="profile-confirm-password-error"
                    error={pwdFormErrors.errors.confirmPwd}
                  />
                )}
              </div>
              <Button type="submit" disabled={pwdSaveDisabled}>
                {pwdLoading ? "修改中…" : "修改密码"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {profile && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">账户信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">用户ID</span>
                <span
                  className="min-w-0 break-all text-right font-mono"
                  title={profile.pid}
                >
                  {profile.pid}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">角色</span>
                <div className="flex flex-wrap justify-end gap-1">
                  {profile.roles.map((r) => (
                    <Badge
                      key={r.id}
                      variant="secondary"
                      className="max-w-[280px] truncate"
                      title={r.name}
                    >
                      {r.name}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">部门</span>
                <div className="flex flex-wrap justify-end gap-1">
                  {profile.departments.map((d) => (
                    <Badge
                      key={d.id}
                      variant="outline"
                      className="max-w-[280px] truncate"
                      title={d.name}
                    >
                      {d.name}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">岗位</span>
                <div className="flex flex-wrap justify-end gap-1">
                  {profile.positions.map((p) => (
                    <Badge
                      key={p.id}
                      variant="secondary"
                      className="max-w-[280px] truncate"
                      title={p.name}
                    >
                      {p.name}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
