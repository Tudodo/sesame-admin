import { CheckboxTree, type TreeNode } from "@/components/checkbox-tree";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { confirm } from "@/lib/confirm";
import { message } from "@/lib/message";
import { apiFetch, create, getList, remove, update } from "@/services/api";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Building,
  CheckSquare,
  Code,
  Folder,
  Menu as MenuIcon,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import React from "react";

interface RoleItem {
  id: number;
  name: string;
  role_key: string;
  role_sort: number;
  status: number;
  data_scope: number;
  description: string | null;
  dept_ids?: number[] | null;
}
interface MenuItem {
  id: number;
  name: string;
  path: string | null;
  parent_id: number | null;
  sort_order: number;
  menu_type: string;
  permission: string | null;
  actions?: string[];
  children?: MenuItem[];
}
interface DeptItem {
  id: number;
  name: string;
  parent_id: number | null;
  sort_order: number;
}

const DATA_SCOPE_MAP: Record<number, string> = {
  1: "全部数据权限",
  2: "自定数据权限",
  3: "本部门数据权限",
  4: "本部门及以下",
  5: "仅本人数据",
};

const TYPE_ICONS: Record<string, typeof Folder> = {
  M: Folder,
  C: MenuIcon,
  F: Code,
};

function getDescendants(list: MenuItem[], parentId: number): string[] {
  const result: string[] = [];
  for (const m of list) {
    if (m.parent_id === parentId) {
      result.push(String(m.id));
      result.push(...getDescendants(list, m.id));
    }
  }
  return result;
}

function buildMenuTreeNodes(list: MenuItem[]): TreeNode[] {
  const map = new Map<number, TreeNode>();
  const roots: TreeNode[] = [];
  for (const m of list) {
    const Icon = TYPE_ICONS[m.menu_type];
    map.set(m.id, {
      key: String(m.id),
      title: (
        <span className="flex items-center gap-1.5">
          {Icon && <Icon className="size-3.5 text-muted-foreground" />}
          <span>{m.name}</span>
          {m.permission && (
            <span className="text-xs text-muted-foreground">
              ({m.permission})
            </span>
          )}
        </span>
      ),
      children: [],
    });
  }
  for (const m of list) {
    const node = map.get(m.id);
    if (!node) continue;
    if (m.parent_id && map.has(m.parent_id))
      map.get(m.parent_id)?.children?.push(node);
    else roots.push(node);
  }
  const prune = (nodes: TreeNode[]): TreeNode[] =>
    nodes.map((n) =>
      n.children?.length
        ? { ...n, children: prune(n.children) }
        : { ...n, children: undefined },
    );
  return prune(roots);
}

function buildDeptTreeNodes(list: DeptItem[]): TreeNode[] {
  const map = new Map<number, TreeNode>();
  const roots: TreeNode[] = [];
  for (const d of list)
    map.set(d.id, { key: String(d.id), title: d.name, children: [] });
  for (const d of list) {
    const node = map.get(d.id);
    if (!node) continue;
    if (d.parent_id && map.has(d.parent_id))
      map.get(d.parent_id)?.children?.push(node);
    else roots.push(node);
  }
  const prune = (nodes: TreeNode[]): TreeNode[] =>
    nodes.map((n) =>
      n.children?.length
        ? { ...n, children: prune(n.children) }
        : { ...n, children: undefined },
    );
  return prune(roots);
}

export const RolesPage = () => {
  const [data, setData] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RoleItem | null>(null);
  const [allMenus, setAllMenus] = useState<MenuItem[]>([]);
  const [allDepts, setAllDepts] = useState<DeptItem[]>([]);
  const [checkedMenuIds, setCheckedMenuIds] = useState<string[]>([]);
  const [menuPerms, setMenuPerms] = useState<Record<string, string[]>>({});
  const [deptCheckedKeys, setDeptCheckedKeys] = useState<string[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RoleItem | null>(null);

  const [fName, setFName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fKey, setFKey] = useState("");
  const [fSort, setFSort] = useState(0);
  const [fStatus, setFStatus] = useState(1);
  const [fScope, setFScope] = useState(1);
  const [fDesc, setFDesc] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getList<RoleItem>("roles", {
        _start: 0,
        _end: 999,
      });
      setData(res.data);
    } catch {
      // 非关键：角色列表加载失败时保留旧数据
    }
    setLoading(false);
  }, []);

  const loadMenus = async () => {
    const res = await getList<MenuItem>("menus", { _start: 0, _end: 500 });
    setAllMenus(res.data);
  };

  const loadDepts = async () => {
    const res = await getList<DeptItem>("departments", {
      _start: 0,
      _end: 500,
    });
    setAllDepts(res.data);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    loadData();
    loadDepts();
  }, [loadData]);

  const menuTreeData = buildMenuTreeNodes(allMenus);
  const deptTreeData = buildDeptTreeNodes(allDepts);

  const getMenuActions = (menuId: string): string[] => {
    const menu = allMenus.find((m) => String(m.id) === menuId);
    if (!menu || menu.menu_type === "F") return [];
    if (Array.isArray(menu.actions))
      return [
        ...new Set([...menu.actions, "create", "read", "update", "delete"]),
      ];
    return ["create", "read", "update", "delete"];
  };

  const handleTreeCheck = (
    checkedKeys: string[],
    info: { node: TreeNode; checked: boolean },
  ) => {
    let newKeys = [...checkedKeys];
    const nodeKey = info.node.key;
    const menu = allMenus.find((m) => String(m.id) === nodeKey);
    if (menu && (menu.menu_type === "M" || menu.menu_type === "C")) {
      const descendants = getDescendants(allMenus, menu.id);
      if (newKeys.includes(nodeKey)) {
        for (const d of descendants) {
          if (!newKeys.includes(d)) newKeys.push(d);
        }
      } else {
        newKeys = newKeys.filter((k) => !descendants.includes(k));
      }
    }
    setCheckedMenuIds(newKeys);
    setMenuPerms((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (!newKeys.includes(k)) delete next[k];
      }
      for (const k of newKeys) {
        if (!next[k]) {
          const m = allMenus.find((m2) => String(m2.id) === k);
          next[k] =
            m?.menu_type === "F"
              ? []
              : m?.actions || ["create", "read", "update", "delete"];
        }
      }
      return next;
    });
  };

  const loadRolePerms = async (roleId: number) => {
    try {
      const perms = await apiFetch<{ menu_id: number; actions: string[] }[]>(
        `/api/roles/${roleId}/menus`,
      );
      setCheckedMenuIds(perms.map((p) => String(p.menu_id)));
      const mp: Record<string, string[]> = {};
      for (const p of perms) mp[String(p.menu_id)] = p.actions;
      setMenuPerms(mp);
    } catch {
      // 非关键：角色权限加载失败时留空，用户可重新选择
    }
  };

  const openEdit = async (record: RoleItem) => {
    setEditing(record);
    await loadMenus();
    setFName(record.name);
    setFKey(record.role_key);
    setFSort(record.role_sort);
    setFStatus(record.status);
    setFScope(record.data_scope);
    setFDesc(record.description || "");
    setDeptCheckedKeys(record.dept_ids?.map(String) || []);
    await loadRolePerms(record.id);
    setModalOpen(true);
  };

  const openPermissionDrawer = async (record: RoleItem) => {
    setSelectedRole(record);
    await loadMenus();
    setDeptCheckedKeys(record.dept_ids?.map(String) || []);
    await loadRolePerms(record.id);
    setDrawerOpen(true);
  };

  const openAdd = async () => {
    setEditing(null);
    setCheckedMenuIds([]);
    setMenuPerms({});
    setDeptCheckedKeys([]);
    setFName("");
    setFKey("");
    setFSort(0);
    setFStatus(1);
    setFScope(1);
    setFDesc("");
    await loadMenus();
    setModalOpen(true);
  };

  const savePermission = async () => {
    if (!selectedRole) return;
    const menu_perms = checkedMenuIds.map((mid) => ({
      menu_id: Number(mid),
      actions: menuPerms[mid] || [],
    }));
    const payload: Record<string, unknown> = {
      name: selectedRole.name,
      role_key: selectedRole.role_key,
      role_sort: selectedRole.role_sort,
      status: selectedRole.status,
      data_scope: selectedRole.data_scope,
      description: selectedRole.description,
      menu_perms,
    };
    if (selectedRole.data_scope === 2)
      payload.dept_ids = deptCheckedKeys.map(Number);
    setSubmitting(true);
    try {
      await update("roles", selectedRole.id, payload);
      message.success("权限已保存");
      setDrawerOpen(false);
      loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!fName || !fKey) {
      message.error("请填写完整信息");
      return;
    }
    const menu_perms = checkedMenuIds.map((mid) => ({
      menu_id: Number(mid),
      actions:
        menuPerms[mid] ||
        (editing ? [] : ["create", "read", "update", "delete"]),
    }));
    const payload: Record<string, unknown> = {
      name: fName,
      role_key: fKey,
      role_sort: fSort,
      status: fStatus,
      data_scope: fScope,
      description: fDesc,
      menu_perms,
    };
    if (fScope === 2 && deptCheckedKeys.length > 0) {
      payload.dept_ids = deptCheckedKeys.map(Number);
    }
    setSubmitting(true);
    try {
      if (editing) {
        await update("roles", editing.id, payload);
        message.success("已更新");
      } else {
        await create("roles", payload);
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

  const handleDelete = async (record: RoleItem) => {
    const ok = await confirm({ title: "确定删除？", okVariant: "destructive" });
    if (!ok) return;
    try {
      await remove("roles", record.id);
      message.success("已删除");
      loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const columns: ColumnDef<RoleItem>[] = [
    {
      accessorKey: "name",
      header: "角色",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.original.name}</span>
          <code className="text-xs text-muted-foreground">
            {row.original.role_key}
          </code>
        </div>
      ),
    },
    { accessorKey: "role_sort", header: "排序" },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) =>
        row.original.status === 1 ? (
          <Badge variant="secondary">正常</Badge>
        ) : (
          <Badge variant="destructive">停用</Badge>
        ),
    },
    {
      accessorKey: "data_scope",
      header: "数据范围",
      cell: ({ row }) => (
        <Badge variant="outline">
          {DATA_SCOPE_MAP[row.original.data_scope] ||
            `类型${row.original.data_scope}`}
        </Badge>
      ),
    },
    {
      accessorKey: "description",
      header: "描述",
      cell: ({ row }) =>
        row.original.description || (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openPermissionDrawer(row.original)}
          >
            <CheckSquare className="size-3.5" /> 权限
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEdit(row.original)}
          >
            <Pencil className="size-3.5" /> 编辑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDelete(row.original)}
          >
            <Trash2 className="size-3.5" /> 删除
          </Button>
        </div>
      ),
    },
  ];

  const PermissionTree = () => (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="font-medium">菜单权限</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const allIds = allMenus.map((m) => String(m.id));
            setCheckedMenuIds(allIds);
            const mp: Record<string, string[]> = {};
            for (const m of allMenus) {
              if (m.menu_type !== "F")
                mp[String(m.id)] = m.actions || [
                  "create",
                  "read",
                  "update",
                  "delete",
                ];
            }
            setMenuPerms(mp);
          }}
        >
          全选
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setCheckedMenuIds([]);
            setMenuPerms({});
          }}
        >
          清空
        </Button>
      </div>
      <ScrollArea className="h-[360px] rounded-md border p-2">
        <CheckboxTree
          treeData={menuTreeData}
          checkedKeys={checkedMenuIds}
          onCheck={handleTreeCheck}
          defaultExpandAll
        />
      </ScrollArea>
      {checkedMenuIds.length > 0 && (
        <>
          <Separator className="my-3" />
          <span className="mb-2 block text-sm font-medium">操作权限</span>
          <div className="space-y-2">
            {checkedMenuIds.map((mid) => {
              const menu = allMenus.find((m) => String(m.id) === mid);
              if (!menu || menu.menu_type === "F") return null;
              const available = getMenuActions(mid);
              if (available.length === 0) return null;
              const Icon = TYPE_ICONS[menu.menu_type];
              return (
                <Card key={mid}>
                  <CardContent className="p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                      {Icon && <Icon className="size-3.5" />}
                      {menu.name}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {available.map((action) => (
                        // biome-ignore lint/a11y/noLabelWithoutControl: label wraps shadcn Checkbox
                        <label
                          key={action}
                          className="flex items-center gap-1.5 cursor-pointer"
                        >
                          <Checkbox
                            checked={(menuPerms[mid] || []).includes(action)}
                            onCheckedChange={(v) => {
                              setMenuPerms((prev) => {
                                const cur = prev[mid] || [];
                                return {
                                  ...prev,
                                  [mid]: v
                                    ? [...cur, action]
                                    : cur.filter((a) => a !== action),
                                };
                              });
                            }}
                          />
                          <span className="text-sm">{action}</span>
                        </label>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">角色管理</h2>
        <Button onClick={openAdd}>
          <Plus className="size-4" /> 新建角色
        </Button>
      </div>

      <DataTable columns={columns} data={data} pageSize={15} />

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="right"
          className="w-[640px] sm:max-w-[640px] overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>{selectedRole?.name} — 权限配置</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <PermissionTree />
            {selectedRole && selectedRole.data_scope === 2 && (
              <>
                <Separator className="my-4" />
                <div className="mb-2 flex items-center gap-2">
                  <Building className="size-4" />
                  <span className="font-medium">自定义部门权限</span>
                </div>
                <div className="mb-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDeptCheckedKeys(allDepts.map((d) => String(d.id)))
                    }
                  >
                    全选
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDeptCheckedKeys([])}
                  >
                    清空
                  </Button>
                </div>
                <ScrollArea className="h-[260px] rounded-md border p-2">
                  <CheckboxTree
                    treeData={deptTreeData}
                    checkedKeys={deptCheckedKeys}
                    onCheck={(keys) => setDeptCheckedKeys(keys)}
                    defaultExpandAll
                  />
                </ScrollArea>
              </>
            )}
          </div>
          <SheetFooter className="mt-4">
            <Button onClick={savePermission} disabled={submitting}>
              <CheckSquare className="size-4" /> 保存权限
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[660px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑角色" : "新建角色"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>角色名称</Label>
                <Input
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>权限字符</Label>
                <Input
                  value={fKey}
                  onChange={(e) => setFKey(e.target.value)}
                  placeholder="admin, editor"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>排序</Label>
                <Input
                  type="number"
                  value={fSort}
                  onChange={(e) => setFSort(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>状态</Label>
                <RadioGroup
                  value={String(fStatus)}
                  onValueChange={(v) => setFStatus(Number(v))}
                  className="flex gap-4 pt-2"
                >
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="1" id="role-status-1" />
                    <Label
                      htmlFor="role-status-1"
                      className="text-sm cursor-pointer"
                    >
                      正常
                    </Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="0" id="role-status-0" />
                    <Label
                      htmlFor="role-status-0"
                      className="text-sm cursor-pointer"
                    >
                      停用
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
            <div className="space-y-2">
              <Label>数据范围</Label>
              <Select
                value={String(fScope)}
                onValueChange={(v) => {
                  const n = Number(v);
                  setFScope(n);
                  if (n !== 2) setDeptCheckedKeys([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择数据范围" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DATA_SCOPE_MAP).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>描述</Label>
              <Textarea
                value={fDesc}
                onChange={(e) => setFDesc(e.target.value)}
              />
            </div>
            <Separator />
            <PermissionTree />
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
