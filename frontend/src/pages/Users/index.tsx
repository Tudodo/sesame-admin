import { DataTable } from "@/components/data-table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirm } from "@/lib/confirm";
import { message } from "@/lib/message";
import { apiFetch, create, getList, remove, update } from "@/services/api";
import { can } from "@/services/permission";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import React from "react";

interface UserItem {
  id: number;
  name: string;
  email: string;
  pid?: string;
  department_id: number | null;
  department_ids?: number[];
  manager_pid?: string | null;
}

export const UsersPage = () => {
  const [data, setData] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserItem | null>(null);
  const [allRoles, setAllRoles] = useState<{ id: number; name: string }[]>([]);
  const [allDepts, setAllDepts] = useState<Record<number, string>>({});
  const [allPositions, setAllPositions] = useState<Record<number, string>>({});

  // form fields
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRoleIds, setFormRoleIds] = useState<number[]>([]);
  const [formDeptIds, setFormDeptIds] = useState<number[]>([]);
  const [formPosIds, setFormPosIds] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formManagerPid, setFormManagerPid] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const query: Record<string, unknown> = { _start: 0, _end: 999 };
      if (search) query.name = search;
      const res = await getList<UserItem>("users", query);
      setData(res.data);
      setTotal(res.total);
    } catch (e: unknown) {
      // 非关键：列表加载失败时保留旧数据，不阻塞页面
      if (e instanceof Error) message.error(`加载失败: ${e.message}`);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => {
    (async () => {
      const deptRes = await getList<{ id: number; name: string }>(
        "departments",
        {
          _start: 0,
          _end: 500,
        },
      );
      const deptMap: Record<number, string> = {};
      for (const d of deptRes.data) deptMap[d.id] = d.name;
      setAllDepts(deptMap);
      const roleRes = await getList<{ id: number; name: string }>("roles", {
        _start: 0,
        _end: 100,
      });
      setAllRoles(roleRes.data);
      const posRes = await getList<{
        id: number;
        name: string;
        dept_id: number;
      }>("positions", {
        _start: 0,
        _end: 9999,
      });
      const posMap: Record<number, string> = {};
      for (const p of posRes.data) {
        const deptName = p.dept_id != null ? deptMap[p.dept_id] : undefined;
        posMap[p.id] = deptName ? `${p.name} (${deptName})` : p.name;
      }
      setAllPositions(posMap);
    })();
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openAdd = async () => {
    setEditing(null);
    setFormName("");
    setFormEmail("");
    setFormPassword("");
    setFormRoleIds([]);
    setFormDeptIds([]);
    setFormPosIds([]);
    const rolesRes = await getList<{ id: number; name: string }>("roles", {
      _start: 0,
      _end: 100,
    });
    setAllRoles(rolesRes.data);
    setModalOpen(true);
    setFormManagerPid("");
  };

  const openEdit = async (record: UserItem) => {
    setEditing(record);
    setFormName(record.name);
    setFormEmail(record.email);
    setFormPassword("");
    setFormRoleIds([]);
    setFormDeptIds(
      record.department_ids ||
        (record.department_id ? [record.department_id] : []),
    );
    const rolesRes = await getList<{ id: number; name: string }>("roles", {
      _start: 0,
      _end: 100,
    });
    setAllRoles(rolesRes.data);
    let roleIds: number[] = [];
    try {
      const roleData = await apiFetch<{ role_id?: number; id?: number }[]>(
        `/api/users/${record.id}/roles`,
      );
      roleIds = (roleData || []).map((r) => r.role_id ?? r.id ?? 0);
    } catch {
      roleIds = [];
    }
    setFormRoleIds(roleIds);
    // 直接内联加载岗位，避免闭包竞态：状态更新是异步的，
    // 旧代码读到的岗位 ID 是上一个渲染周期的旧值
    let posIds: number[] = [];
    try {
      const posData = await apiFetch<{ position_id?: number; id?: number }[]>(
        `/api/users/${record.id}/positions`,
      );
      posIds = (posData || []).map(
        (p: { position_id?: number; id?: number }) =>
          p.position_id ?? p.id ?? 0,
      );
    } catch {
      posIds = [];
    }
    setFormPosIds(posIds);
    setModalOpen(true);
    setFormManagerPid(record.manager_pid || "");
  };

  const handleSubmit = async () => {
    if (!formName || !formEmail) {
      message.error("请填写完整信息");
      return;
    }
    const payload: Record<string, unknown> = {
      name: formName,
      email: formEmail,
      role_ids: formRoleIds,
      department_ids: formDeptIds,
      position_ids: formPosIds,
      manager_pid: formManagerPid,
    };
    setSubmitting(true);
    try {
      if (editing) {
        await update("users", editing.id, payload);
        message.success("已更新");
      } else {
        await create("users", {
          ...payload,
          password: formPassword || "Aa123456",
        });
        message.success("已创建");
      }
      setModalOpen(false);
      loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (record: UserItem) => {
    const ok = await confirm({ title: "确定删除？", okVariant: "destructive" });
    if (!ok) return;
    try {
      await remove("users", record.id);
      loadData();
      message.success("已删除");
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const toggleArray = <T,>(arr: T[], val: T): T[] =>
    arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

  const columns: ColumnDef<UserItem>[] = [
    {
      accessorKey: "name",
      header: "用户",
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex items-center gap-2">
            <Avatar className="size-7">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {r.name?.[0]?.toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="font-medium leading-tight">{r.name}</div>
              <div className="text-xs text-muted-foreground">{r.email}</div>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "pid",
      header: "账号",
      cell: ({ row }) => (
        <code className="text-xs">
          {row.original.pid || row.original.email}
        </code>
      ),
    },
    {
      id: "departments",
      header: "部门",
      cell: ({ row }) => {
        const r = row.original;
        const ids =
          r.department_ids || (r.department_id ? [r.department_id] : []);
        if (!ids.length)
          return <span className="text-muted-foreground">-</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {ids.map((id) => (
              <Badge key={id} variant="outline">
                {allDepts[id] || `#${id}`}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex gap-2">
            {can("system:user:update") && (
              <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                <Pencil className="size-3.5" /> 编辑
              </Button>
            )}
            {can("system:user:delete") && (
              <Button variant="ghost" size="sm" onClick={() => handleDelete(r)}>
                <Trash2 className="size-3.5" /> 删除
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Input
            placeholder="搜索用户名"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48"
            onKeyDown={(e) => e.key === "Enter" && loadData()}
          />
          <Button variant="outline" size="sm" onClick={loadData}>
            搜索
          </Button>
        </div>
        {can("system:user:create") && (
          <Button onClick={openAdd}>
            <Plus className="size-4" /> 新建用户
          </Button>
        )}
      </div>

      <DataTable columns={columns} data={data} pageSize={15} />

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑用户" : "新建用户"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>姓名</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>邮箱</Label>
              <Input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
              />
            </div>
            {!editing && (
              <div className="space-y-2">
                <Label>密码</Label>
                <Input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="留空默认Aa123456"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>直属上级</Label>
              <select
                value={formManagerPid || ""}
                onChange={(e) => setFormManagerPid(e.target.value)}
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              >
                <option value="">无直属上级</option>
                {data
                  .filter((u) => u.pid && (!editing || u.pid !== editing.pid))
                  .map((u) => (
                    <option key={u.pid} value={u.pid}>
                      {u.name} · {u.email}
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>角色</Label>
              <div className="flex flex-wrap gap-2">
                {allRoles.map((r) => (
                  <div key={r.id} className="flex items-center gap-1">
                    <Checkbox
                      id={`role-${r.id}`}
                      checked={formRoleIds.includes(r.id)}
                      onCheckedChange={() =>
                        setFormRoleIds(toggleArray(formRoleIds, r.id))
                      }
                    />
                    <Label
                      htmlFor={`role-${r.id}`}
                      className="text-sm cursor-pointer"
                    >
                      {r.name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>部门</Label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(allDepts).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1">
                    <Checkbox
                      id={`dept-${k}`}
                      checked={formDeptIds.includes(Number(k))}
                      onCheckedChange={() =>
                        setFormDeptIds(toggleArray(formDeptIds, Number(k)))
                      }
                    />
                    <Label
                      htmlFor={`dept-${k}`}
                      className="text-sm cursor-pointer"
                    >
                      {v}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>岗位</Label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(allPositions).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1">
                    <Checkbox
                      id={`pos-${k}`}
                      checked={formPosIds.includes(Number(k))}
                      onCheckedChange={() =>
                        setFormPosIds(toggleArray(formPosIds, Number(k)))
                      }
                    />
                    <Label
                      htmlFor={`pos-${k}`}
                      className="text-sm cursor-pointer"
                    >
                      {v}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "提交中…" : "确定"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
