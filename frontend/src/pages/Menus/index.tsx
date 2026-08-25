import { InlineError } from "@/components/InlineError";
import {
  LazyOptionsPicker,
  type LazyPickerOption,
} from "@/components/LazyOptionsPicker";
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
import { FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { RequiredLabel } from "@/components/ui/required-label";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useFieldErrors } from "@/hooks/useFieldErrors";
import { useLazyResource } from "@/hooks/useLazyResource";
import { confirm } from "@/lib/confirm";
import { message } from "@/lib/message";
import { create, getList, remove, update } from "@/services/api";
import { can } from "@/services/permission";
import {
  ChevronDown,
  ChevronRight,
  Code,
  Folder,
  Loader2,
  Menu as MenuIcon,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

const TYPE_MAP: Record<string, { label: string; icon: typeof Folder }> = {
  M: { label: "目录", icon: Folder },
  C: { label: "菜单", icon: MenuIcon },
  F: { label: "按钮", icon: Code },
};

const MENU_PAGE_SIZE = 100;

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

interface MenuChildMeta {
  total: number;
  nextPage: number;
  loading: boolean;
  error: boolean;
}

function MenuRow({
  node,
  level,
  expanded,
  onToggle,
  onLoadChildren,
  onLoadMoreChildren,
  childrenByParent,
  childrenMeta,
  onEdit,
  onDelete,
  onAddChild,
  busyId,
  loading,
}: {
  node: MenuItem;
  level: number;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onLoadChildren: (id: number) => void;
  onLoadMoreChildren: (id: number) => void;
  childrenByParent: Record<number, MenuItem[]>;
  childrenMeta: Record<number, MenuChildMeta>;
  onEdit: (m: MenuItem) => void;
  onDelete: (m: MenuItem) => void;
  onAddChild: (parentId: number) => void;
  busyId: number | null;
  loading: boolean;
}) {
  const children = childrenByParent[node.id];
  const meta = childrenMeta[node.id];
  const isExpanded = expanded.has(node.id);
  const childrenLoaded = children !== undefined;
  const hasChildren = !childrenLoaded || children.length > 0;
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
            disabled={meta?.loading || loading}
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? "收起" : "展开"} ${node.name}`}
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
        <span
          className={
            node.menu_type !== "F"
              ? "min-w-0 max-w-[220px] truncate font-medium"
              : "min-w-0 max-w-[220px] truncate"
          }
          title={node.name}
        >
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
          <code
            className="block max-w-[220px] break-all text-xs text-muted-foreground"
            title={node.path}
          >
            {node.path}
          </code>
        )}
        {node.permission && (
          <code
            className="block max-w-[220px] break-all text-xs text-primary"
            title={node.permission}
          >
            {node.permission}
          </code>
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onAddChild(node.id)}
                  disabled={busyId !== null || loading}
                  aria-label={`添加子菜单 ${node.name}`}
                >
                  <Plus className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>添加子菜单</TooltipContent>
            </Tooltip>
          )}
          {can("system:menu:update") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(node)}
                  disabled={busyId !== null || loading}
                  aria-label={`编辑 ${node.name}`}
                >
                  <Pencil className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>编辑</TooltipContent>
            </Tooltip>
          )}
          {can("system:menu:delete") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(node)}
                  disabled={busyId !== null || loading}
                  aria-label={`删除 ${node.name}`}
                >
                  {busyId === node.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>删除</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      {isExpanded && (
        <div>
          {!childrenLoaded && meta?.loading && (
            <div className="flex items-center gap-2 border-b px-8 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> 加载子菜单…
            </div>
          )}
          {!childrenLoaded && meta?.error && (
            <div className="border-b px-6 py-2">
              <InlineError
                title="子菜单加载失败"
                description="请重试后再展开该节点。"
                loading={meta.loading}
                onRetry={() => onLoadChildren(node.id)}
              />
            </div>
          )}
          {childrenLoaded &&
            (children.length ? (
              children.map((child) => (
                <MenuRow
                  key={child.id}
                  node={child}
                  level={level + 1}
                  expanded={expanded}
                  onToggle={onToggle}
                  onLoadChildren={onLoadChildren}
                  onLoadMoreChildren={onLoadMoreChildren}
                  childrenByParent={childrenByParent}
                  childrenMeta={childrenMeta}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onAddChild={onAddChild}
                  busyId={busyId}
                  loading={loading}
                />
              ))
            ) : (
              <div className="block border-b px-8 py-2 text-xs text-muted-foreground">
                暂无子菜单
              </div>
            ))}
          {childrenLoaded && meta && meta.total > children.length && (
            <div className="border-b px-6 py-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onLoadMoreChildren(node.id)}
                disabled={meta.loading || loading}
              >
                {meta.loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> 加载中…
                  </>
                ) : (
                  `加载更多子菜单（${children.length}/${meta.total}）`
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export const MenusPage = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [parentForNew, setParentForNew] = useState<number | null>(null);
  const [treeData, setTreeData] = useState<MenuItem[]>([]);
  const [rootTotal, setRootTotal] = useState(0);
  const [rootNextPage, setRootNextPage] = useState(0);
  const [childrenByParent, setChildrenByParent] = useState<
    Record<number, MenuItem[]>
  >({});
  const [childrenMeta, setChildrenMeta] = useState<
    Record<number, MenuChildMeta>
  >({});
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const rootRequestIdRef = useRef(0);
  const childrenRequestIdRef = useRef<Record<number, number>>({});
  const submittingRef = useRef(false);
  const deletingRef = useRef(false);

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
  const formErrors = useFieldErrors();

  const menuSource = useLazyResource<MenuItem>("menus", modalOpen);

  const loadRoot = async (page = 0) => {
    setLoading(true);
    setLoadError(false);
    const requestId = ++rootRequestIdRef.current;
    try {
      const res = await getList<MenuItem>("menus", {
        parent_id: 0,
        _start: page * MENU_PAGE_SIZE,
        _end: (page + 1) * MENU_PAGE_SIZE,
      });
      if (requestId !== rootRequestIdRef.current) return;
      setTreeData((prev) => (page === 0 ? res.data : [...prev, ...res.data]));
      setRootTotal(res.total);
      setRootNextPage(page + 1);
      setLoadError(false);
    } catch (e: unknown) {
      if (requestId !== rootRequestIdRef.current) return;
      message.error(e instanceof Error ? `加载失败: ${e.message}` : "加载失败");
      setLoadError(true);
    } finally {
      if (requestId === rootRequestIdRef.current) setLoading(false);
    }
  };

  const loadChildren = async (parentId: number, page = 0) => {
    const requestId = (childrenRequestIdRef.current[parentId] ?? 0) + 1;
    childrenRequestIdRef.current[parentId] = requestId;
    setChildrenMeta((prev) => ({
      ...prev,
      [parentId]: {
        total: prev[parentId]?.total ?? 0,
        nextPage: prev[parentId]?.nextPage ?? 0,
        loading: true,
        error: false,
      },
    }));
    try {
      const res = await getList<MenuItem>("menus", {
        parent_id: parentId,
        _start: page * MENU_PAGE_SIZE,
        _end: (page + 1) * MENU_PAGE_SIZE,
      });
      if (childrenRequestIdRef.current[parentId] !== requestId) return;
      setChildrenByParent((prev) => ({
        ...prev,
        [parentId]:
          page === 0 ? res.data : [...(prev[parentId] ?? []), ...res.data],
      }));
      setChildrenMeta((prev) => ({
        ...prev,
        [parentId]: {
          total: res.total,
          nextPage: page + 1,
          loading: false,
          error: false,
        },
      }));
    } catch (e: unknown) {
      if (childrenRequestIdRef.current[parentId] !== requestId) return;
      message.error(e instanceof Error ? `加载失败: ${e.message}` : "加载失败");
      setChildrenMeta((prev) => ({
        ...prev,
        [parentId]: {
          total: prev[parentId]?.total ?? 0,
          nextPage: prev[parentId]?.nextPage ?? 0,
          loading: false,
          error: true,
        },
      }));
    } finally {
      if (childrenRequestIdRef.current[parentId] === requestId) {
        setChildrenMeta((prev) => {
          const current = prev[parentId];
          if (!current) return prev;
          return { ...prev, [parentId]: { ...current, loading: false } };
        });
      }
    }
  };

  const loadMoreChildren = (parentId: number) => {
    const meta = childrenMeta[parentId];
    if (meta?.loading) return;
    void loadChildren(parentId, meta?.nextPage ?? 0);
  };

  const loadData = async () => {
    setTreeData([]);
    setRootTotal(0);
    setRootNextPage(0);
    setChildrenByParent({});
    setChildrenMeta({});
    setExpanded(new Set());
    childrenRequestIdRef.current = {};
    await loadRoot(0);
  };

  useEffect(() => {
    loadData();
    return () => {
      rootRequestIdRef.current += 1;
      childrenRequestIdRef.current = {};
    };
  }, []);

  const toggle = (id: number) => {
    if (expanded.has(id)) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return;
    }
    setExpanded((prev) => new Set(prev).add(id));
    if (childrenByParent[id] === undefined && !childrenMeta[id]?.loading) {
      void loadChildren(id);
    }
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
    formErrors.clearErrors();
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
    formErrors.clearErrors();
  };

  const handleSubmit = async () => {
    if (submitting || submittingRef.current) return;
    const trimmedName = name.trim();
    const trimmedPath = path.trim();
    const trimmedIcon = icon.trim();
    const trimmedPermission = permission.trim();
    if (!trimmedName) {
      formErrors.setErrors({ name: "请输入菜单名称" });
      return;
    }
    formErrors.clearErrors();
    const payload: unknown = {
      name: trimmedName,
      path: trimmedPath || null,
      icon: trimmedIcon || null,
      parent_id: parentId ? Number(parentId) : null,
      sort_order: sortOrder,
      permission: trimmedPermission || null,
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
    submittingRef.current = true;
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
      submittingRef.current = false;
    }
  };

  const handleDelete = async (record: MenuItem) => {
    if (deletingRef.current || deletingId !== null || loading) return;
    deletingRef.current = true;
    const ok = await confirm({
      title: `确定删除菜单「${record.name}」？`,
      content: "子级也会一起删除，删除后不可恢复",
      okVariant: "destructive",
    });
    if (!ok) {
      deletingRef.current = false;
      return;
    }
    setDeletingId(record.id);
    try {
      await remove("menus", record.id);
      message.success("已删除");
      loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeletingId(null);
      deletingRef.current = false;
    }
  };

  const parentOptions = menuSource.items
    .filter((m) => m.menu_type !== "F" && (!editing || m.id !== editing.id))
    .map((m) => ({
      key: String(m.id),
      label: `${TYPE_MAP[m.menu_type]?.label || ""} ${m.name}`.trim(),
      sublabel: m.permission || m.path || undefined,
      disabled: editing?.id === m.id,
    }));
  const selectedParent = (() => {
    if (!parentId) return [];
    const current = menuSource.items.find((m) => m.id === Number(parentId));
    return [
      {
        key: parentId,
        label: current
          ? `${TYPE_MAP[current.menu_type]?.label || ""} ${current.name}`.trim()
          : "当前上级",
        sublabel: current
          ? current.permission || current.path || undefined
          : "重新搜索可选择其他菜单",
      },
    ];
  })();
  const handleToggleParent = (key: string) => {
    setParentId((prev) => (prev === key ? "" : key));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">菜单管理</h2>
        {can("system:menu:create") && (
          <Button onClick={() => openAdd(null)} disabled={loading}>
            <Plus className="size-4" /> 新建菜单
          </Button>
        )}
      </div>

      {loadError && (
        <InlineError
          title="菜单加载失败"
          description={"菜单数据可能未更新，已保留原有数据。"}
          onRetry={() => void loadRoot(0)}
          loading={loading}
        />
      )}

      <Card className="overflow-hidden">
        <div className="border-b bg-muted/50 px-3 py-2 text-sm font-medium text-muted-foreground">
          名称 / 路由 / 权限标识 / 排序
        </div>
        {treeData.length === 0 ? (
          <div className="block py-12 text-center text-muted-foreground">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" /> 加载菜单…
              </span>
            ) : (
              "暂无菜单，点击「新建菜单」添加"
            )}
          </div>
        ) : (
          treeData.map((node) => (
            <MenuRow
              key={node.id}
              node={node}
              level={0}
              expanded={expanded}
              onToggle={toggle}
              onLoadChildren={(id) => void loadChildren(id)}
              onLoadMoreChildren={loadMoreChildren}
              childrenByParent={childrenByParent}
              childrenMeta={childrenMeta}
              onEdit={openEdit}
              onDelete={handleDelete}
              onAddChild={openAdd}
              busyId={deletingId}
              loading={loading}
            />
          ))
        )}
        {rootTotal > treeData.length && (
          <div className="px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void loadRoot(rootNextPage)}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> 加载中…
                </>
              ) : (
                `加载更多菜单（${treeData.length}/${rootTotal}）`
              )}
            </Button>
          </div>
        )}
      </Card>

      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          if (!open && submitting) return;
          setModalOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {editing
                  ? "编辑菜单"
                  : parentForNew
                    ? "添加子菜单"
                    : "新建菜单"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label id="menu-type-label">菜单类型</Label>
                <RadioGroup
                  aria-labelledby="menu-type-label"
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
                <RequiredLabel htmlFor="menu-name" required>
                  名称
                </RequiredLabel>
                <Input
                  id="menu-name"
                  placeholder="请输入菜单名称"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    formErrors.clearError("name");
                  }}
                  {...formErrors.fieldProps("name", "menu-name")}
                />
                {formErrors.errors.name && (
                  <FormMessage
                    id="menu-name-error"
                    error={formErrors.errors.name}
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="menu-parent">上级菜单</Label>
                <LazyOptionsPicker
                  id="menu-parent"
                  placeholder="留空为顶级"
                  options={parentOptions}
                  selectedOptions={selectedParent}
                  total={menuSource.total}
                  loading={menuSource.loading}
                  error={menuSource.error}
                  multiple={false}
                  search={menuSource.search}
                  onSearchChange={menuSource.setSearch}
                  onLoadMore={menuSource.loadMore}
                  onRetry={menuSource.reload}
                  onToggle={(key) => handleToggleParent(key)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="menu-path">路由路径</Label>
                <Input
                  id="menu-path"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="/users"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="menu-icon">图标</Label>
                <Input
                  id="menu-icon"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="UserOutlined"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="menu-permission">权限标识</Label>
                <Input
                  id="menu-permission"
                  value={permission}
                  onChange={(e) => setPermission(e.target.value)}
                  placeholder="system:user:list"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="menu-sort">排序</Label>
                  <Input
                    type="number"
                    min={0}
                    id="menu-sort"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(Number(e.target.value))}
                  />
                </div>
                <div className="flex items-end gap-2 pb-1">
                  <Switch
                    id="menu-visible"
                    checked={visible}
                    onCheckedChange={setVisible}
                  />
                  <Label htmlFor="menu-visible">可见</Label>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="menu-actions">可用操作</Label>
                <Input
                  id="menu-actions"
                  value={actions}
                  onChange={(e) => setActions(e.target.value)}
                  placeholder="create, read, update, delete"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                disabled={submitting}
                onClick={() => {
                  if (submitting) return;
                  setModalOpen(false);
                }}
              >
                取消
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "提交中…" : "确定"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
