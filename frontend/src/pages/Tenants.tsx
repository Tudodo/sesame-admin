import { InlineError } from "@/components/InlineError";
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
import { FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { RequiredLabel } from "@/components/ui/required-label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TextareaWithCounter } from "@/components/ui/textarea-counter";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useFieldErrors } from "@/hooks/useFieldErrors";
import { confirm } from "@/lib/confirm";
import { isEmail } from "@/lib/email";
import { message } from "@/lib/message";
import { passwordError } from "@/lib/password";
import { getList, request } from "@/services/api";
import { can } from "@/services/permission";
import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState<number | null>(null);

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
  const formErrors = useFieldErrors();
  const requestIdRef = useRef(0);
  const savingRef = useRef(false);
  const deleteRef = useRef(false);
  const canCreate = can("system:tenant:create");
  const canUpdate = can("system:tenant:update");
  const canDelete = can("system:tenant:delete");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    const requestId = ++requestIdRef.current;
    try {
      const res = await getList<Tenant>("tenants", {
        _start: page * pageSize,
        _end: (page + 1) * pageSize,
      });
      if (requestId !== requestIdRef.current) return;
      setData(res.data);
      setTotal(res.total);
      setLoadError(false);
    } catch (e: unknown) {
      // 非关键：数据加载失败时保留旧数据，不阻塞页面
      if (requestId !== requestIdRef.current) return;
      if (e instanceof Error) message.error(`加载失败: ${e.message}`);
      setLoadError(true);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    loadData();
    return () => {
      requestIdRef.current += 1;
    };
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
    formErrors.clearErrors();
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
    formErrors.clearErrors();
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (saving || savingRef.current) return;
    const nextErrors: Record<string, string> = {};
    const trimmedName = fName.trim();
    const trimmedCode = fCode.trim();
    const trimmedEmail = fEmail.trim();
    if (!trimmedName) nextErrors.name = "请输入租户名称";
    if (!trimmedCode) nextErrors.code = "请输入租户编码";
    if (trimmedEmail && !isEmail(trimmedEmail)) {
      nextErrors.email = "请输入有效邮箱";
    }
    const adminName = fAdminName.trim();
    const adminEmail = fAdminEmail.trim();
    const adminPassword = fAdminPassword;
    if (!editing) {
      if (!adminEmail) nextErrors.adminEmail = "请输入管理员邮箱";
      else if (!isEmail(adminEmail)) nextErrors.adminEmail = "请输入有效邮箱";
      if (!adminPassword) {
        nextErrors.adminPassword = "请输入管理员密码";
      } else {
        const pwdIssue = passwordError(adminPassword);
        if (pwdIssue) nextErrors.adminPassword = `管理员${pwdIssue}`;
      }
    }
    if (Object.keys(nextErrors).length > 0) {
      formErrors.setErrors(nextErrors);
      return;
    }
    formErrors.clearErrors();
    const values = {
      name: fName.trim(),
      code: fCode.trim(),
      domain: fDomain.trim(),
      contact_name: fContact.trim(),
      contact_email: trimmedEmail,
      description: fDesc.trim(),
      status: fStatus,
    };
    if (!editing) {
      (values as Record<string, unknown>).admin_name = adminName || "admin";
      (values as Record<string, unknown>).admin_email = adminEmail;
      (values as Record<string, unknown>).admin_password = adminPassword;
    }
    setSaving(true);
    savingRef.current = true;
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
      if (page === 0) void loadData();
      else setPage(0);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  const handleDelete = async (r: Tenant) => {
    if (deleteRef.current || deleteLoadingId !== null || loading) return;
    deleteRef.current = true;
    const ok = await confirm({
      title: `确定删除租户「${r.name}」？`,
      content: "将级联删除该租户下所有用户、部门、角色及流程数据，且不可恢复。",
      okVariant: "destructive",
    });
    if (!ok) {
      deleteRef.current = false;
      return;
    }
    setDeleteLoadingId(r.id);
    let removed = false;
    try {
      await request(`/tenants/${r.id}`, { method: "DELETE" });
      removed = true;
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
      setDeleteLoadingId(null);
      deleteRef.current = false;
      if (removed) {
        const nextTotal = Math.max(0, total - 1);
        const nextMaxPage = Math.max(0, Math.ceil(nextTotal / pageSize) - 1);
        if (page > nextMaxPage) setPage(nextMaxPage);
        else void loadData();
      } else {
        void loadData();
      }
    }
  };
  const columns: ColumnDef<Tenant>[] = [
    { accessorKey: "id", header: "ID" },
    {
      accessorKey: "name",
      header: "租户名称",
      cell: ({ row }) => (
        <span
          className="block max-w-[180px] truncate"
          title={row.original.name}
        >
          {row.original.name}
        </span>
      ),
    },
    {
      accessorKey: "code",
      header: "租户编码",
      cell: ({ row }) => (
        <code
          className="block max-w-[220px] break-all text-xs"
          title={row.original.code}
        >
          {row.original.code}
        </code>
      ),
    },
    {
      accessorKey: "domain",
      header: "域名",
      cell: ({ row }) => (
        <span
          className="block max-w-[220px] break-all text-xs"
          title={row.original.domain}
        >
          {row.original.domain || "-"}
        </span>
      ),
    },
    {
      accessorKey: "contact_name",
      header: "联系人",
      cell: ({ row }) => (
        <span
          className="block max-w-[160px] truncate"
          title={row.original.contact_name}
        >
          {row.original.contact_name || "-"}
        </span>
      ),
    },
    {
      accessorKey: "contact_email",
      header: "邮箱",
      cell: ({ row }) => (
        <span
          className="block max-w-[220px] break-all text-xs"
          title={row.original.contact_email}
        >
          {row.original.contact_email || "-"}
        </span>
      ),
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
          {canUpdate && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEdit(row.original)}
                  disabled={deleteLoadingId !== null || loading}
                  aria-label={`编辑租户 ${row.original.name}`}
                >
                  <Pencil className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>编辑租户</TooltipContent>
            </Tooltip>
          )}
          {canDelete && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(row.original)}
                  disabled={deleteLoadingId !== null || loading}
                  aria-label={`删除租户 ${row.original.name}`}
                >
                  {deleteLoadingId === row.original.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4 text-destructive" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>删除租户</TooltipContent>
            </Tooltip>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">租户管理</h2>
        {canCreate && (
          <Button size="sm" onClick={openCreate} disabled={loading}>
            <Plus className="size-4 mr-1" />
            新建租户
          </Button>
        )}
      </div>

      {loadError && (
        <InlineError
          title="租户列表加载失败"
          description={"列表可能未更新，已保留原有数据。"}
          onRetry={loadData}
          loading={loading}
        />
      )}

      <DataTable
        columns={columns}
        data={data}
        pageSize={pageSize}
        serverSide
        total={total}
        pageIndex={page}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPage(0);
          setPageSize(size);
        }}
        loading={loading}
        emptyMessage="暂无租户，点击「新增租户」创建"
      />

      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          if (!open && saving) return;
          setModalOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSave();
            }}
          >
            <DialogHeader>
              <DialogTitle>{editing ? "编辑租户" : "新建租户"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <RequiredLabel htmlFor="tenant-name" required>
                  租户名称
                </RequiredLabel>
                <Input
                  id="tenant-name"
                  placeholder="请输入租户名称"
                  value={fName}
                  onChange={(e) => {
                    setFName(e.target.value);
                    formErrors.clearError("name");
                  }}
                  {...formErrors.fieldProps("name", "tenant-name")}
                />
              </div>
              {formErrors.errors.name && (
                <FormMessage
                  id="tenant-name-error"
                  error={formErrors.errors.name}
                />
              )}
              <div className="space-y-1">
                <RequiredLabel htmlFor="tenant-code" required>
                  租户编码
                </RequiredLabel>
                <Input
                  id="tenant-code"
                  value={fCode}
                  onChange={(e) => {
                    setFCode(e.target.value);
                    formErrors.clearError("code");
                  }}
                  {...formErrors.fieldProps("code", "tenant-code")}
                  placeholder="唯一标识"
                />
              </div>
              {formErrors.errors.code && (
                <FormMessage
                  id="tenant-code-error"
                  error={formErrors.errors.code}
                />
              )}
              <div className="space-y-1">
                <Label htmlFor="tenant-domain">域名</Label>
                <Input
                  id="tenant-domain"
                  value={fDomain}
                  onChange={(e) => setFDomain(e.target.value)}
                  placeholder="example.com"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tenant-contact">联系人</Label>
                <Input
                  id="tenant-contact"
                  placeholder="请输入联系人姓名"
                  value={fContact}
                  onChange={(e) => setFContact(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tenant-email">联系邮箱</Label>
                <Input
                  id="tenant-email"
                  placeholder="请输入联系邮箱"
                  value={fEmail}
                  onChange={(e) => {
                    setFEmail(e.target.value);
                    formErrors.clearError("email");
                  }}
                  {...formErrors.fieldProps("email", "tenant-email")}
                />
              </div>
              {formErrors.errors.email && (
                <FormMessage
                  id="tenant-email-error"
                  error={formErrors.errors.email}
                />
              )}
              <div className="space-y-1">
                <Label htmlFor="tenant-desc">描述</Label>
                <TextareaWithCounter
                  id="tenant-desc"
                  placeholder="请输入描述（选填）"
                  value={fDesc}
                  maxLength={500}
                  onChange={(e) => setFDesc(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tenant-status">状态</Label>
                <Select value={fStatus} onValueChange={setFStatus}>
                  <SelectTrigger id="tenant-status">
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
                    <Label htmlFor="tenant-admin-name">管理员姓名</Label>
                    <Input
                      id="tenant-admin-name"
                      value={fAdminName}
                      onChange={(e) => setFAdminName(e.target.value)}
                      placeholder="默认 admin"
                    />
                  </div>
                  <div className="space-y-1">
                    <RequiredLabel htmlFor="tenant-admin-email" required>
                      管理员邮箱
                    </RequiredLabel>
                    <Input
                      id="tenant-admin-email"
                      value={fAdminEmail}
                      onChange={(e) => {
                        setFAdminEmail(e.target.value);
                        formErrors.clearError("adminEmail");
                      }}
                      {...formErrors.fieldProps(
                        "adminEmail",
                        "tenant-admin-email",
                      )}
                      placeholder="admin@newtenant.com"
                    />
                    {formErrors.errors.adminEmail && (
                      <FormMessage
                        id="tenant-admin-email-error"
                        error={formErrors.errors.adminEmail}
                      />
                    )}
                  </div>
                  <div className="space-y-1">
                    <RequiredLabel htmlFor="tenant-admin-password" required>
                      管理员密码
                    </RequiredLabel>
                    <PasswordInput
                      id="tenant-admin-password"
                      value={fAdminPassword}
                      autoComplete="new-password"
                      onChange={(e) => {
                        setFAdminPassword(e.target.value);
                        formErrors.clearError("adminPassword");
                      }}
                      {...formErrors.fieldProps(
                        "adminPassword",
                        "tenant-admin-password",
                        ["tenant-admin-password-hint"],
                      )}
                      placeholder="初始登录密码"
                    />
                    <p
                      id="tenant-admin-password-hint"
                      className="text-xs text-muted-foreground"
                    >
                      至少8位，需包含大写字母、小写字母和数字
                    </p>
                    {formErrors.errors.adminPassword && (
                      <FormMessage
                        id="tenant-admin-password-error"
                        error={formErrors.errors.adminPassword}
                      />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    创建后将自动克隆默认租户的菜单与权限，该账号可登录新租户后台。
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => {
                  if (saving) return;
                  setModalOpen(false);
                }}
              >
                取消
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <Loader2 className="size-4 mr-1 animate-spin" />
                ) : null}
                保存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
