import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import { create, getList, remove, update } from "@/services/api";
import { can } from "@/services/permission";
import {
  Building,
  ChevronDown,
  ChevronRight,
  IdCard,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";

interface DeptItem {
  id: number;
  name: string;
  description: string | null;
  parent_id: number | null;
  sort_order: number;
  code: string | null;
  children?: DeptItem[];
  leader_pid?: string | null;
}
interface PositionItem {
  id: number;
  name: string;
  dept_id: number;
  sort_order: number;
}

function buildTree(list: DeptItem[]): DeptItem[] {
  const map = new Map<number, DeptItem>();
  for (const item of list) map.set(item.id, { ...item, children: [] });
  const roots: DeptItem[] = [];
  for (const [, item] of map) {
    if (item.parent_id != null && map.has(item.parent_id))
      map.get(item.parent_id)?.children?.push(item);
    else roots.push(item);
  }
  const prune = (nodes: DeptItem[]): DeptItem[] =>
    nodes.map((n) => ({
      ...n,
      children: n.children?.length ? prune(n.children) : undefined,
    }));
  return prune(roots);
}

function DeptRow({
  node,
  level,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onPositions,
}: {
  node: DeptItem;
  level: number;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onEdit: (d: DeptItem) => void;
  onDelete: (d: DeptItem) => void;
  onPositions: (d: DeptItem) => void;
}) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  return (
    <>
      <div
        className="flex items-center gap-2 border-b px-3 py-2 hover:bg-muted/50"
        style={{ paddingLeft: level * 24 + 12 }}
      >
        {hasChildren ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="p-0 size-4"
            onClick={() => onToggle(node.id)}
            aria-label={isExpanded ? "收起" : "展开"}
          >
            {isExpanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </Button>
        ) : (
          <span className="w-4" />
        )}
        <Building className="size-4 text-primary" />
        <span className="flex-1 font-medium">{node.name}</span>
        {node.code && (
          <Badge variant="secondary" className="font-mono text-xs">
            {node.code}
          </Badge>
        )}
        <span className="text-sm text-muted-foreground">
          {node.description || "-"}
        </span>
        <Badge variant="outline" className="ml-2">
          {node.sort_order}
        </Badge>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => onPositions(node)}>
            <IdCard className="size-3.5" /> 岗位
          </Button>
          {can("system:dept:update") && (
            <Button variant="ghost" size="sm" onClick={() => onEdit(node)}>
              <Pencil className="size-3.5" />
            </Button>
          )}
          {can("system:dept:delete") && (
            <Button variant="ghost" size="sm" onClick={() => onDelete(node)}>
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
      {hasChildren &&
        isExpanded &&
        node.children?.map((child) => (
          <DeptRow
            key={child.id}
            node={child}
            level={level + 1}
            expanded={expanded}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
            onPositions={onPositions}
          />
        ))}
    </>
  );
}

export const DepartmentsPage = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DeptItem | null>(null);
  const [allDepts, setAllDepts] = useState<DeptItem[]>([]);
  const [treeData, setTreeData] = useState<DeptItem[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [sortOrder, setSortOrder] = useState(0);
  const [code, setCode] = useState("");
  const [formLeaderPid, setFormLeaderPid] = useState("");
  const [allUsers, setAllUsers] = useState<
    Array<{ pid: string; name: string; email: string }>
  >([]);

  // Positions modal
  const [posDept, setPosDept] = useState<DeptItem | null>(null);
  const [positions, setPositions] = useState<PositionItem[]>([]);
  const [posModalOpen, setPosModalOpen] = useState(false);
  const [posEditing, setPosEditing] = useState<PositionItem | null>(null);
  const [posName, setPosName] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getList<DeptItem>("departments", {
        _start: 0,
        _end: 500,
      });
      setAllDepts(res.data);
      const tree = buildTree(res.data);
      setTreeData(tree);
      // auto-expand all on first load
      const allIds = new Set(res.data.map((d) => d.id));
      setExpanded(allIds);
    } catch (e: unknown) {
      message.error(e instanceof Error ? `加载失败: ${e.message}` : "加载失败");
    }
    setLoading(false);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    loadData();
  }, []);
  useEffect(() => {
    getList<{ pid: string; name: string; email: string }>("users", {
      _start: 0,
      _end: 999,
    })
      .then((res) => setAllUsers(res.data))
      .catch(() => setAllUsers([]));
  }, []);

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const loadPositions = async (deptId: number) => {
    const res = await getList<PositionItem>("positions", {
      _start: 0,
      _end: 500,
      dept_id: deptId,
    });
    setPositions(res.data);
  };

  const handleOpenPositions = async (dept: DeptItem) => {
    setPosDept(dept);
    setPosEditing(null);
    setPosName("");
    await loadPositions(dept.id);
    setPosModalOpen(true);
  };

  const handleSavePosition = async () => {
    if (!posDept || !posName.trim()) return;
    try {
      if (posEditing) {
        await update("positions", posEditing.id, {
          name: posName,
          dept_id: posDept.id,
          sort_order: posEditing.sort_order,
        });
        message.success("岗位已更新");
      } else {
        await create("positions", { name: posName, dept_id: posDept.id });
        message.success("岗位已创建");
      }
      await loadPositions(posDept.id);
      setPosEditing(null);
      setPosName("");
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "操作失败");
    }
  };

  const handleDeletePosition = async (pos: PositionItem) => {
    const ok = await confirm({ title: "确定删除？" });
    if (!ok) return;
    try {
      await remove("positions", pos.id);
      message.success("岗位已删除");
      if (posDept) await loadPositions(posDept.id);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const openAdd = () => {
    setEditing(null);
    setName("");
    setDesc("");
    setParentId("");
    setSortOrder(0);
    setCode("");
    setModalOpen(true);
    setFormLeaderPid("");
  };

  const openEdit = (record: DeptItem) => {
    setEditing(record);
    setName(record.name);
    setDesc(record.description || "");
    setParentId(record.parent_id != null ? String(record.parent_id) : "");
    setSortOrder(record.sort_order);
    setCode(record.code || "");
    setModalOpen(true);
    setFormLeaderPid(record.leader_pid || "");
  };

  const handleSubmit = async () => {
    if (!name) {
      message.error("请填写名称");
      return;
    }
    const payload = {
      name,
      description: desc,
      parent_id: parentId ? Number(parentId) : null,
      sort_order: sortOrder,
      code: code || null,
      leader_pid: formLeaderPid,
    };
    setSubmitting(true);
    try {
      if (editing) {
        await update("departments", editing.id, payload);
        message.success("已更新");
      } else {
        await create("departments", payload);
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

  const handleDelete = async (record: DeptItem) => {
    const ok = await confirm({
      title: "确定删除？子部门也会删除",
      okVariant: "destructive",
    });
    if (!ok) return;
    try {
      await remove("departments", record.id);
      message.success("已删除");
      loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">部门管理</h2>
        {can("system:dept:create") && (
          <Button onClick={openAdd}>
            <Plus className="size-4" /> 新建部门
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="border-b bg-muted/50 px-3 py-2 text-sm font-medium text-muted-foreground">
          名称 / 描述 / 排序
        </div>
        {treeData.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            暂无部门，点击「新建部门」添加
          </div>
        ) : (
          treeData.map((node) => (
            <DeptRow
              key={node.id}
              node={node}
              level={0}
              expanded={expanded}
              onToggle={toggle}
              onEdit={openEdit}
              onDelete={handleDelete}
              onPositions={handleOpenPositions}
            />
          ))
        )}
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "编辑部门" : "新建部门"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>名称</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>描述</Label>
              <Textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>上级部门</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger>
                  <SelectValue placeholder="留空为顶级部门" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">留空为顶级部门</SelectItem>
                  {allDepts
                    .filter((d) => !editing || d.id !== editing.id)
                    .map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>排序</Label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>部门负责人</Label>
              <select
                value={formLeaderPid || ""}
                onChange={(e) => setFormLeaderPid(e.target.value)}
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              >
                <option value="">无部门负责人</option>
                {allUsers.map((u) => (
                  <option key={u.pid} value={u.pid}>
                    {u.name} · {u.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>部门编码</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="如 sales、tech"
              />
              <p className="text-xs text-muted-foreground">
                稳定编码，用于业务系统引用。留空时由系统自动生成。
              </p>
              {editing && (
                <p className="text-xs text-destructive">
                  部门编码用于业务系统引用，请勿随意修改。
                </p>
              )}
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

      <Dialog open={posModalOpen} onOpenChange={setPosModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {posDept ? `${posDept.name} — 岗位管理` : "岗位管理"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 mb-3">
            <Input
              value={posName}
              onChange={(e) => setPosName(e.target.value)}
              placeholder={posEditing ? "编辑岗位名称" : "输入新岗位名称"}
              onKeyDown={(e) => e.key === "Enter" && handleSavePosition()}
            />
            <Button onClick={handleSavePosition} disabled={submitting}>
              {posEditing ? "保存" : "添加"}
            </Button>
            {posEditing && (
              <Button
                variant="outline"
                onClick={() => {
                  setPosEditing(null);
                  setPosName("");
                }}
              >
                取消
              </Button>
            )}
          </div>
          <div className="space-y-1">
            {positions.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                暂无岗位，输入名称添加
              </div>
            ) : (
              positions.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <IdCard className="size-4 text-primary" />
                    <span className="text-sm">{item.name}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPosEditing(item);
                        setPosName(item.name);
                      }}
                    >
                      <Pencil className="size-3" />
                      <span className="sr-only">编辑</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeletePosition(item)}
                    >
                      <Trash2 className="size-3" />
                      <span className="sr-only">删除</span>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
