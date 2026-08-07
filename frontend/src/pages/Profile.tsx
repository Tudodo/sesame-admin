import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { message } from "@/lib/message";
import { apiFetch } from "@/services/api";
import { Lock, Mail, User } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";

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
  const [pwdLoading, setPwdLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");

  const fetchProfile = async () => {
    try {
      const data = await apiFetch<ProfileData>("/api/profile");
      setProfile(data);
      setName(data.name);
      setEmail(data.email);
    } catch {
      /* profile load failure is non-critical; user can retry by navigating */
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    fetchProfile();
  }, []);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiFetch("/api/profile", {
        method: "PUT",
        body: JSON.stringify({ name, email }),
      });
      message.success("资料已更新");
      fetchProfile();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "更新失败");
    }
    setLoading(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPwd !== confirmPwd) {
      message.error("两次密码不一致");
      return;
    }
    setPwdLoading(true);
    try {
      await apiFetch("/api/profile/password", {
        method: "PUT",
        body: JSON.stringify({ old_password: oldPwd, new_password: newPwd }),
      });
      message.success("密码已修改");
      setOldPwd("");
      setNewPwd("");
      setConfirmPwd("");
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "修改失败");
    }
    setPwdLoading(false);
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>基本资料</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="space-y-2">
              <Label>姓名</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
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
                  className="pl-9"
                />
              </div>
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? "保存中..." : "保存"}
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
                <Label>原密码</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="password"
                    value={oldPwd}
                    onChange={(e) => setOldPwd(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>新密码</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="password"
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
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
                    value={confirmPwd}
                    onChange={(e) => setConfirmPwd(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <Button type="submit" disabled={pwdLoading}>
                {pwdLoading ? "修改中..." : "修改密码"}
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
                <span className="font-mono">{profile.pid}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">角色</span>
                <div className="flex flex-wrap justify-end gap-1">
                  {profile.roles.map((r) => (
                    <Badge key={r.id} variant="secondary">
                      {r.name}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">部门</span>
                <div className="flex flex-wrap justify-end gap-1">
                  {profile.departments.map((d) => (
                    <Badge key={d.id} variant="outline">
                      {d.name}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">岗位</span>
                <div className="flex flex-wrap justify-end gap-1">
                  {profile.positions.map((p) => (
                    <Badge key={p.id} variant="secondary">
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
