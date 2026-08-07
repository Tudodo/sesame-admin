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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { confirm } from "@/lib/confirm";
import { message } from "@/lib/message";
import { create, getList, remove, update } from "@/services/api";
import { can } from "@/services/permission";
import {
  ChevronDown,
  ChevronRight,
  Code,
  Folder,
  Menu as MenuIcon,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";

const TYPE_MAP: Record<string, { label: string; icon: typeof Folder }> = {
  M: { label: "目录", icon: Folder },
  C: { label: "菜单", icon: MenuIcon },
  F: { label: "按钮", icon: Code },
};

interface MenuItem {
  id: number;
  name: string;
  path: string | null;
  icon: string | null;
  parent_id: number | null;
  sort_order: number;
  permission: string | null;
  visible: boolean;
  menu_type: string;
  actions: string[] | null;
  children?: MenuItem[];
}

function buildTree(list: MenuItem[]): MenuItem[] {
  const map = new Map<number, MenuItem>();
  for (const item of list) map.set(item.id, { ...item, children: [] });
  const roots: MenuItem[] = [];
  for (const [, item] of map) {
    if (item.parent_id != null && map.has(item.parent_id))
      map.get(item.parent_id)?.children?.push(item);
    else roots.push(item);
  }
  const prune = (nodes: MenuItem[]): MenuItem[] =>
    nodes.map((n) => ({
      ...n,
      children: n.children?.length ? prune(n.children) : undefined,
    }));
  return prune(roots);
}

function MenuRow({
  node,
  level,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onAddChild,
}: {
  node: MenuItem;
  level: number;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onEdit: (m: MenuItem) => void;
  onDelete: (m: MenuItem) => void;
  onAddChild: (parentId: number) => void;
}) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const t = TYPE_MAP[node.menu_type] || TYPE_MAP.C;
  const TypeIcon = t.icon;
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
        <TypeIcon className="size-4 text-muted-foreground" />
        <span className={node.menu_type !== "F" ? "font-medium" : ""}>
          {node.name}
        </span>
        <Badge
          variant={
            node.menu_type === "M"
              ? "default"
              : node.menu_type === "C"
                ? "secondary"
                : "outline"
          }
          className="text-xs"
        >
          {t.label}
        </Badge>
        <span className="flex-1" />
        {node.path && (
          <code className="text-xs text-muted-foreground">{node.path}</code>
        )}
        {node.permission && (
          <code className="text-xs text-primary">{node.permission}</code>
        )}
        <Badge variant="outline" className="text-xs">
          {node.sort_order}
        </Badge>
        {node.visible ? (
          <Badge variant="secondary" className="text-xs">
            可见
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs">
            隐藏
          </Badge>
        )}
        <div className="flex gap-1">
          {node.menu_type !== "F" && can("system:menu:create") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAddChild(node.id)}
            >
              <Plus className="size-3" />
            </Button>
          )}
          {can("system:menu:update") && (
            <Button variant="ghost" size="sm" onClick={() => onEdit(node)}>
              <Pencil className="size-3" />
            </Button>
          )}
          {can("system:menu:delete") && (
            <Button variant="ghost" size="sm" onClick={() => onDelete(node)}>
              <Trash2 className="size-3" />
            </Button>
          )}
        </div>
      </div>
      {hasChildren &&
        isExpanded &&
        node.children?.map((child) => (
          <MenuRow
            key={child.id}
            node={child}
            level={level + 1}
            expanded={expanded}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
            onAddChild={onAddChild}
          />
        ))}
    </>
  );
}

export const MenusPage = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [parentForNew, setParentForNew] = useState<number | null>(null);
  const [allMenus, setAllMenus] = useState<MenuItem[]>([]);
  const [treeData, setTreeData] = useState<MenuItem[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // form fields
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [icon, setIcon] = useState("");
  const [parentId, setParentId] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [permission, setPermission] = useState("");
  const [visible, setVisible] = useState(true);
  const [menuType, setMenuType] = useState("C");
  const [actions, setActions] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    const res = await getList<MenuItem>("menus", { _start: 0, _end: 500 });
    setAllMenus(res.data);
    const tree = buildTree(res.data);
    setTreeData(tree);
    setExpanded(new Set(res.data.map((m) => m.id)));
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    loadData();
  }, []);

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openAdd = (parentId: number | null) => {
    setEditing(null);
    setParentForNew(parentId);
    setName("");
    setPath("");
    setIcon("");
    setPermission("");
    setParentId(parentId != null ? String(parentId) : "");
    setSortOrder(0);
    setVisible(true);
    setMenuType("C");
    setActions("");
    setModalOpen(true);
  };

  const openEdit = (record: MenuItem) => {
    setEditing(record);
    setParentForNew(null);
    setName(record.name);
    setPath(record.path || "");
    setIcon(record.icon || "");
    setParentId(record.parent_id != null ? String(record.parent_id) : "");
    setSortOrder(record.sort_order);
    setPermission(record.permission || "");
    setVisible(record.visible);
    setMenuType(record.menu_type || "C");
    setActions(Array.isArray(record.actions) ? record.actions.join(", ") : "");
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!name) {
      message.error("请填写名称");
      return;
    }
    const payload: unknown = {
      name,
      path: path || null,
      icon: icon || null,
      parent_id: parentId ? Number(parentId) : null,
      sort_order: sortOrder,
      permission: permission || null,
      visible,
      menu_type: menuType,
      actions: actions
        ? actions
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : null,
    };
    setSubmitting(true);
    try {
      if (editing) {
        await update("menus", editing.id, payload);
        message.success("已更新");
      } else {
        await create("menus", payload);
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

  const handleDelete = async (record: MenuItem) => {
    const ok = await confirm({
      title: "确定删除？子级也会删除",
      okVariant: "destructive",
    });
    if (!ok) return;
    try {
      await remove("menus", record.id);
      message.success("已删除");
      loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">菜单管理</h2>
        {can("system:menu:create") && (
          <Button onClick={() => openAdd(null)}>
            <Plus className="size-4" /> 新建菜单
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="border-b bg-muted/50 px-3 py-2 text-sm font-medium text-muted-foreground">
          名称 / 路由 / 权限标识 / 排序
        </div>
        {treeData.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            暂无菜单，点击「新建菜单」添加
          </div>
        ) : (
          treeData.map((node) => (
            <MenuRow
              key={node.id}
              node={node}
              level={0}
              expanded={expanded}
              onToggle={toggle}
              onEdit={openEdit}
              onDelete={handleDelete}
              onAddChild={openAdd}
            />
          ))
        )}
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>
              {editing ? "编辑菜单" : parentForNew ? "添加子菜单" : "新建菜单"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>菜单类型</Label>
              <RadioGroup
                value={menuType}
                onValueChange={setMenuType}
                className="flex gap-4"
              >
                {[
                  { value: "M", label: "目录 (M)" },
                  { value: "C", label: "菜单 (C)" },
                  { value: "F", label: "按钮 (F)" },
                ].map((opt) => (
                  <div key={opt.value} className="flex items-center gap-1.5">
                    <RadioGroupItem
                      value={opt.value}
                      id={`menu-type-${opt.value}`}
                    />
                    <Label
                      htmlFor={`menu-type-${opt.value}`}
                      className="text-sm cursor-pointer"
                    >
                      {opt.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label>名称</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>上级菜单</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger>
                  <SelectValue placeholder="留空为顶级" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">留空为顶级</SelectItem>
                  {allMenus
                    .filter(
                      (m) =>
                        m.menu_type !== "F" &&
                        (!editing || m.id !== editing.id),
                    )
                    .map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {TYPE_MAP[m.menu_type]?.label || ""} {m.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>路由路径</Label>
              <Input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/users"
              />
            </div>
            <div className="space-y-2">
              <Label>图标</Label>
              <Input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="UserOutlined"
              />
            </div>
            <div className="space-y-2">
              <Label>权限标识</Label>
              <Input
                value={permission}
                onChange={(e) => setPermission(e.target.value)}
                placeholder="system:user:list"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>排序</Label>
                <Input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value))}
                />
              </div>
              <div className="flex items-end gap-2 pb-1">
                <Switch checked={visible} onCheckedChange={setVisible} />
                <Label>可见</Label>
              </div>
            </div>
            <div className="space-y-2">
              <Label>可用操作</Label>
              <Input
                value={actions}
                onChange={(e) => setActions(e.target.value)}
                placeholder="create, read, update, delete"
              />
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
