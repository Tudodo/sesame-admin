import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { confirm } from "@/lib/confirm";
import { message } from "@/lib/message";
import { request } from "@/services/api";
import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";

interface Tenant {
  id: number;
  name: string;
  code: string;
  domain: string;
  status: string;
  contact_name: string;
  contact_email: string;
  description: string;
  created_at: string;
}

export const TenantsPage: React.FC = () => {
  const [data, setData] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);

  const [fName, setFName] = useState("");
  const [fCode, setFCode] = useState("");
  const [fDomain, setFDomain] = useState("");
  const [fContact, setFContact] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fStatus, setFStatus] = useState("enabled");
  const [fAdminName, setFAdminName] = useState("");
  const [fAdminEmail, setFAdminEmail] = useState("");
  const [fAdminPassword, setFAdminPassword] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request<Tenant[]>("/tenants?_start=0&_end=100");
      setData(Array.isArray(res) ? res : []);
    } catch (e: unknown) {
      // 非关键：数据加载失败时保留旧数据，不阻塞页面
      if (e instanceof Error) message.error(`加载失败: ${e.message}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreate = () => {
    setEditing(null);
    setFName("");
    setFCode("");
    setFDomain("");
    setFContact("");
    setFEmail("");
    setFDesc("");
    setFStatus("enabled");
    setFAdminName("");
    setFAdminEmail("");
    setFAdminPassword("");
    setModalOpen(true);
  };

  const openEdit = (r: Tenant) => {
    setEditing(r);
    setFName(r.name);
    setFCode(r.code);
    setFDomain(r.domain || "");
    setFContact(r.contact_name || "");
    setFEmail(r.contact_email || "");
    setFDesc(r.description || "");
    setFStatus(r.status);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!fName.trim() || !fCode.trim()) {
      message.warning("请填写必填项");
      return;
    }
    if (!editing) {
      if (!fAdminEmail.trim() || !fAdminPassword.trim()) {
        message.warning("新建租户时请填写管理员账号信息");
        return;
      }
    }
    const values = {
      name: fName,
      code: fCode,
      domain: fDomain,
      contact_name: fContact,
      contact_email: fEmail,
      description: fDesc,
      status: fStatus,
    };
    if (!editing) {
      (values as Record<string, unknown>).admin_name = fAdminName || "admin";
      (values as Record<string, unknown>).admin_email = fAdminEmail;
      (values as Record<string, unknown>).admin_password = fAdminPassword;
    }
    try {
      if (editing) {
        await request(`/tenants/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(values),
        });
        message.success("更新成功");
      } else {
        await request("/tenants", {
          method: "POST",
          body: JSON.stringify(values),
        });
        message.success("创建成功");
      }
      setModalOpen(false);
      loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  const handleDelete = async (r: Tenant) => {
    const ok = await confirm({
      title: "删除租户",
      content: `确定删除 ${r.name}？`,
      okVariant: "destructive",
    });
    if (!ok) return;
    try {
      await request(`/tenants/${r.id}`, { method: "DELETE" });
      message.success("已删除");
    } catch (e: unknown) {
      // 404 说明记录已被删除或不存在，按已删除处理；其他错误提示用户
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("404") || msg.includes("not_found")) {
        message.warning("该租户已不存在");
      } else {
        message.error(e instanceof Error ? e.message : "删除失败");
      }
    } finally {
      loadData();
    }
  };
  const columns: ColumnDef<Tenant>[] = [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "name", header: "租户名称" },
    { accessorKey: "code", header: "租户编码" },
    {
      accessorKey: "domain",
      header: "域名",
      cell: ({ row }) => row.original.domain || "-",
    },
    {
      accessorKey: "contact_name",
      header: "联系人",
      cell: ({ row }) => row.original.contact_name || "-",
    },
    {
      accessorKey: "contact_email",
      header: "邮箱",
      cell: ({ row }) => row.original.contact_email || "-",
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => (
        <Badge
          variant={
            row.original.status === "enabled" ? "default" : "destructive"
          }
        >
          {row.original.status === "enabled" ? "启用" : "禁用"}
        </Badge>
      ),
    },
    {
      accessorKey: "created_at",
      header: "创建时间",
      cell: ({ row }) =>
        row.original.created_at
          ? dayjs(row.original.created_at).format("YYYY-MM-DD HH:mm:ss")
          : "-",
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEdit(row.original)}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDelete(row.original)}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">租户管理</h2>
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4 mr-1" />
          新建租户
        </Button>
      </div>

      <DataTable columns={columns} data={data} pageSize={20} />

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑租户" : "新建租户"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>租户名称 *</Label>
              <Input value={fName} onChange={(e) => setFName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>租户编码 *</Label>
              <Input
                value={fCode}
                onChange={(e) => setFCode(e.target.value)}
                placeholder="唯一标识"
              />
            </div>
            <div className="space-y-1">
              <Label>域名</Label>
              <Input
                value={fDomain}
                onChange={(e) => setFDomain(e.target.value)}
                placeholder="example.com"
              />
            </div>
            <div className="space-y-1">
              <Label>联系人</Label>
              <Input
                value={fContact}
                onChange={(e) => setFContact(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>联系邮箱</Label>
              <Input
                value={fEmail}
                onChange={(e) => setFEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>描述</Label>
              <Textarea
                value={fDesc}
                onChange={(e) => setFDesc(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-1">
              <Label>状态</Label>
              <Select value={fStatus} onValueChange={setFStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="选择状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="enabled">启用</SelectItem>
                  <SelectItem value="disabled">禁用</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!editing && (
              <div className="space-y-3 rounded-md border border-dashed p-3">
                <p className="text-sm font-medium">初始管理员账号</p>
                <div className="space-y-1">
                  <Label>管理员姓名</Label>
                  <Input
                    value={fAdminName}
                    onChange={(e) => setFAdminName(e.target.value)}
                    placeholder="默认 admin"
                  />
                </div>
                <div className="space-y-1">
                  <Label>管理员邮箱 *</Label>
                  <Input
                    value={fAdminEmail}
                    onChange={(e) => setFAdminEmail(e.target.value)}
                    placeholder="admin@newtenant.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label>管理员密码 *</Label>
                  <Input
                    value={fAdminPassword}
                    onChange={(e) => setFAdminPassword(e.target.value)}
                    placeholder="初始登录密码"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  创建后将自动克隆默认租户的菜单与权限，该账号可登录新租户后台。
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
