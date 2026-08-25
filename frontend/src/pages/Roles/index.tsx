import { InlineError } from "@/components/InlineError";
import {
  CheckboxTree,
  type TreeNode,
  type TreeNodeLoadState,
} from "@/components/checkbox-tree";
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
import { FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { RequiredLabel } from "@/components/ui/required-label";
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
import { TextareaWithCounter } from "@/components/ui/textarea-counter";
import { useFieldErrors } from "@/hooks/useFieldErrors";
import { confirm } from "@/lib/confirm";
import { message } from "@/lib/message";
import {
  apiFetch,
  create,
  getList,
  getOne,
  remove,
  update,
} from "@/services/api";
import { can } from "@/services/permission";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Building,
  CheckSquare,
  Code,
  Folder,
  Loader2,
  Menu as MenuIcon,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

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

interface MenuTreeNode extends TreeNode {
  menu: MenuItem;
}
interface DeptTreeNode extends TreeNode {
  dept: DeptItem;
}

const MENU_PAGE_SIZE = 100;
const DEPT_PAGE_SIZE = 100;

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

function buildMenuTreeNodes(
  roots: MenuItem[],
  childrenByParent: Record<number, MenuItem[]>,
): MenuTreeNode[] {
  const build = (items: MenuItem[]): MenuTreeNode[] =>
    items.map((menu) => {
      const children = childrenByParent[menu.id];
      const loaded = children !== undefined;
      const Icon = TYPE_ICONS[menu.menu_type];
      return {
        key: String(menu.id),
        title: (
          <span className="flex items-center gap-1.5">
            {Icon && <Icon className="size-4 text-muted-foreground" />}
            <span>{menu.name}</span>
            {menu.permission && (
              <span className="text-xs text-muted-foreground">
                ({menu.permission})
              </span>
            )}
          </span>
        ),
        menu,
        children: loaded ? build(children) : undefined,
        loaded,
        hasChildren: loaded ? children.length > 0 : true,
      };
    });
  return build(roots);
}

function buildDeptTreeNodes(
  roots: DeptItem[],
  childrenByParent: Record<number, DeptItem[]>,
): DeptTreeNode[] {
  const build = (items: DeptItem[]): DeptTreeNode[] =>
    items.map((dept) => {
      const children = childrenByParent[dept.id];
      const loaded = children !== undefined;
      return {
        key: String(dept.id),
        title: dept.name,
        dept,
        children: loaded ? build(children) : undefined,
        loaded,
        hasChildren: loaded ? children.length > 0 : true,
      };
    });
  return build(roots);
}

function groupMenuTree(items: MenuItem[]) {
  const roots: MenuItem[] = [];
  const childrenByParent: Record<number, MenuItem[]> = {};
  const childrenMeta: Record<string, TreeNodeLoadState> = {};
  for (const item of items) {
    if (childrenByParent[item.id] === undefined) childrenByParent[item.id] = [];
    childrenMeta[String(item.id)] = {
      total: 0,
      nextPage: 0,
      loading: false,
      error: false,
    };
    if (item.parent_id === null || item.parent_id === 0) {
      roots.push(item);
    } else {
      if (childrenByParent[item.parent_id] === undefined)
        childrenByParent[item.parent_id] = [];
      childrenByParent[item.parent_id].push(item);
    }
  }
  for (const [parentId, children] of Object.entries(childrenByParent)) {
    if (children.length > 0) {
      childrenMeta[parentId] = {
        total: children.length,
        nextPage: Math.ceil(children.length / MENU_PAGE_SIZE),
        loading: false,
        error: false,
      };
    }
  }
  return { roots, childrenByParent, childrenMeta };
}

function groupDeptTree(items: DeptItem[]) {
  const roots: DeptItem[] = [];
  const childrenByParent: Record<number, DeptItem[]> = {};
  const childrenMeta: Record<string, TreeNodeLoadState> = {};
  for (const item of items) {
    if (childrenByParent[item.id] === undefined) childrenByParent[item.id] = [];
    childrenMeta[String(item.id)] = {
      total: 0,
      nextPage: 0,
      loading: false,
      error: false,
    };
    if (item.parent_id === null || item.parent_id === 0) {
      roots.push(item);
    } else {
      if (childrenByParent[item.parent_id] === undefined)
        childrenByParent[item.parent_id] = [];
      childrenByParent[item.parent_id].push(item);
    }
  }
  for (const [parentId, children] of Object.entries(childrenByParent)) {
    if (children.length > 0) {
      childrenMeta[parentId] = {
        total: children.length,
        nextPage: Math.ceil(children.length / DEPT_PAGE_SIZE),
        loading: false,
        error: false,
      };
    }
  }
  return { roots, childrenByParent, childrenMeta };
}

export const RolesPage = () => {
  const [data, setData] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RoleItem | null>(null);
  const [menuRoots, setMenuRoots] = useState<MenuItem[]>([]);
  const [menuRootMeta, setMenuRootMeta] = useState<TreeNodeLoadState>({
    total: 0,
    nextPage: 0,
    loading: false,
    error: false,
  });
  const [menuChildrenByParent, setMenuChildrenByParent] = useState<
    Record<number, MenuItem[]>
  >({});
  const [menuChildrenMeta, setMenuChildrenMeta] = useState<
    Record<string, TreeNodeLoadState>
  >({});
  const [deptRoots, setDeptRoots] = useState<DeptItem[]>([]);
  const [deptRootMeta, setDeptRootMeta] = useState<TreeNodeLoadState>({
    total: 0,
    nextPage: 0,
    loading: false,
    error: false,
  });
  const [menuSelectAllLoading, setMenuSelectAllLoading] = useState(false);
  const [deptSelectAllLoading, setDeptSelectAllLoading] = useState(false);
  const [deptChildrenByParent, setDeptChildrenByParent] = useState<
    Record<number, DeptItem[]>
  >({});
  const [deptChildrenMeta, setDeptChildrenMeta] = useState<
    Record<string, TreeNodeLoadState>
  >({});
  const [checkedMenuIds, setCheckedMenuIds] = useState<string[]>([]);
  const [menuPerms, setMenuPerms] = useState<Record<string, string[]>>({});
  const [deptCheckedKeys, setDeptCheckedKeys] = useState<string[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RoleItem | null>(null);
  const requestIdRef = useRef(0);
  const menuRootRequestIdRef = useRef(0);
  const menuChildrenRequestIdRef = useRef<Record<number, number>>({});
  const deptRootRequestIdRef = useRef(0);
  const deptChildrenRequestIdRef = useRef<Record<number, number>>({});
  const rolePermsRequestIdRef = useRef(0);
  const permSessionRef = useRef(0);
  const permOpeningRef = useRef(false);
  const submittingRef = useRef(false);
  const deleteRef = useRef(false);
  const menuByIdRef = useRef<Record<number, MenuItem>>({});
  const menuChildrenByParentRef = useRef<Record<number, MenuItem[]>>({});
  const menuChildrenMetaRef = useRef<Record<string, TreeNodeLoadState>>({});
  const deptChildrenByParentRef = useRef<Record<number, DeptItem[]>>({});
  const deptChildrenMetaRef = useRef<Record<string, TreeNodeLoadState>>({});
  const menuRootsRef = useRef<MenuItem[]>([]);
  const deptRootsRef = useRef<DeptItem[]>([]);

  const [fName, setFName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState<number | null>(null);
  const formErrors = useFieldErrors();
  const [permLoading, setPermLoading] = useState(false);
  const [permLoadError, setPermLoadError] = useState(false);
  const [fKey, setFKey] = useState("");
  const [fSort, setFSort] = useState(0);
  const [fStatus, setFStatus] = useState(1);
  const [fScope, setFScope] = useState(1);
  const [fDesc, setFDesc] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(15);
  const [total, setTotal] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    const requestId = ++requestIdRef.current;
    try {
      const res = await getList<RoleItem>("roles", {
        _start: page * pageSize,
        _end: (page + 1) * pageSize,
      });
      if (requestId !== requestIdRef.current) return;
      setData(res.data);
      setTotal(res.total);
      setLoadError(false);
    } catch {
      // 非关键：角色列表加载失败时保留旧数据
      if (requestId !== requestIdRef.current) return;
      setLoadError(true);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [page, pageSize]);

  const rememberMenus = (items: MenuItem[]) => {
    for (const item of items) menuByIdRef.current[item.id] = item;
  };

  const loadMenuRoot = async (page = 0) => {
    const requestId = ++menuRootRequestIdRef.current;
    setMenuRootMeta((prev) => ({ ...prev, loading: true, error: false }));
    try {
      const res = await getList<MenuItem>("menus", {
        parent_id: 0,
        _start: page * MENU_PAGE_SIZE,
        _end: (page + 1) * MENU_PAGE_SIZE,
      });
      if (requestId !== menuRootRequestIdRef.current) return;
      rememberMenus(res.data);
      menuRootsRef.current =
        page === 0 ? res.data : [...menuRootsRef.current, ...res.data];
      setMenuRoots([...menuRootsRef.current]);
      setMenuRootMeta({
        total: res.total,
        nextPage: page + 1,
        loading: false,
        error: false,
      });
    } catch (e: unknown) {
      if (requestId !== menuRootRequestIdRef.current) return;
      message.error(e instanceof Error ? `加载失败: ${e.message}` : "加载失败");
      setMenuRootMeta((prev) => ({ ...prev, loading: false, error: true }));
    } finally {
      if (requestId === menuRootRequestIdRef.current)
        setMenuRootMeta((prev) => ({ ...prev, loading: false }));
    }
  };

  const loadAllMenuRoots = async (): Promise<MenuItem[]> => {
    if (menuRootsRef.current.length > 0) return menuRootsRef.current;
    await loadMenus();
    return menuRootsRef.current;
  };

  const loadMenuChildren = async (parentId: number, page = 0) => {
    const requestId = (menuChildrenRequestIdRef.current[parentId] ?? 0) + 1;
    menuChildrenRequestIdRef.current[parentId] = requestId;
    const metaKey = String(parentId);
    setMenuChildrenMeta((prev) => ({
      ...prev,
      [metaKey]: {
        total: prev[metaKey]?.total ?? 0,
        nextPage: prev[metaKey]?.nextPage ?? 0,
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
      if (menuChildrenRequestIdRef.current[parentId] !== requestId) return;
      rememberMenus(res.data);
      const existing = menuChildrenByParentRef.current[parentId] ?? [];
      const next = page === 0 ? res.data : [...existing, ...res.data];
      menuChildrenByParentRef.current[parentId] = next;
      menuChildrenMetaRef.current[metaKey] = {
        total: res.total,
        nextPage: page + 1,
        loading: false,
        error: false,
      };
      setMenuChildrenByParent({ ...menuChildrenByParentRef.current });
      setMenuChildrenMeta({ ...menuChildrenMetaRef.current });
    } catch (e: unknown) {
      if (menuChildrenRequestIdRef.current[parentId] !== requestId) return;
      message.error(e instanceof Error ? `加载失败: ${e.message}` : "加载失败");
      menuChildrenMetaRef.current[metaKey] = {
        total: menuChildrenMetaRef.current[metaKey]?.total ?? 0,
        nextPage: menuChildrenMetaRef.current[metaKey]?.nextPage ?? 0,
        loading: false,
        error: true,
      };
      setMenuChildrenMeta({ ...menuChildrenMetaRef.current });
    } finally {
      if (menuChildrenRequestIdRef.current[parentId] === requestId) {
        menuChildrenMetaRef.current[metaKey] = {
          ...(menuChildrenMetaRef.current[metaKey] ?? {
            total: 0,
            nextPage: 0,
          }),
          loading: false,
        };
        setMenuChildrenMeta({ ...menuChildrenMetaRef.current });
      }
    }
  };

  const loadAllMenuChildren = async (parentId: number): Promise<MenuItem[]> => {
    const metaKey = String(parentId);
    const sessionId = permSessionRef.current;
    const cached = menuChildrenByParentRef.current[parentId] ?? [];
    const cachedMeta = menuChildrenMetaRef.current[metaKey];
    if (cachedMeta && cached.length >= cachedMeta.total) return cached;
    let items = cached;
    let page = cachedMeta?.nextPage ?? 0;
    let total = cachedMeta?.total ?? 0;
    let nextPage = cachedMeta?.nextPage ?? 0;
    let first = cached.length === 0;
    menuChildrenMetaRef.current[metaKey] = {
      ...(cachedMeta ?? { total: 0, nextPage: 0 }),
      loading: true,
      error: false,
    };
    setMenuChildrenMeta({ ...menuChildrenMetaRef.current });
    try {
      while (!cachedMeta || items.length < cachedMeta.total) {
        const res = await getList<MenuItem>("menus", {
          parent_id: parentId,
          _start: page * MENU_PAGE_SIZE,
          _end: (page + 1) * MENU_PAGE_SIZE,
        });
        if (sessionId !== permSessionRef.current) return [];
        rememberMenus(res.data);
        items = first ? res.data : [...items, ...res.data];
        first = false;
        total = res.total;
        nextPage = page + 1;
        page += 1;
        if (!res.data.length || items.length >= res.total) break;
      }
      if (sessionId !== permSessionRef.current) return [];
      menuChildrenByParentRef.current[parentId] = items;
      menuChildrenMetaRef.current[metaKey] = {
        total,
        nextPage,
        loading: false,
        error: false,
      };
      setMenuChildrenByParent({ ...menuChildrenByParentRef.current });
      setMenuChildrenMeta({ ...menuChildrenMetaRef.current });
      return items;
    } catch (e: unknown) {
      if (sessionId !== permSessionRef.current) return [];
      menuChildrenMetaRef.current[metaKey] = {
        total: cachedMeta?.total ?? 0,
        nextPage: cachedMeta?.nextPage ?? 0,
        loading: false,
        error: true,
      };
      setMenuChildrenMeta({ ...menuChildrenMetaRef.current });
      throw e;
    }
  };

  const loadDeptRoot = async (page = 0) => {
    const requestId = ++deptRootRequestIdRef.current;
    setDeptRootMeta((prev) => ({ ...prev, loading: true, error: false }));
    try {
      const res = await getList<DeptItem>("departments", {
        parent_id: 0,
        _start: page * DEPT_PAGE_SIZE,
        _end: (page + 1) * DEPT_PAGE_SIZE,
      });
      if (requestId !== deptRootRequestIdRef.current) return;
      deptRootsRef.current =
        page === 0 ? res.data : [...deptRootsRef.current, ...res.data];
      setDeptRoots([...deptRootsRef.current]);
      setDeptRootMeta({
        total: res.total,
        nextPage: page + 1,
        loading: false,
        error: false,
      });
    } catch (e: unknown) {
      if (requestId !== deptRootRequestIdRef.current) return;
      message.error(e instanceof Error ? `加载失败: ${e.message}` : "加载失败");
      setDeptRootMeta((prev) => ({ ...prev, loading: false, error: true }));
    } finally {
      if (requestId === deptRootRequestIdRef.current)
        setDeptRootMeta((prev) => ({ ...prev, loading: false }));
    }
  };

  const loadAllDeptRoots = async (): Promise<DeptItem[]> => {
    if (deptRootsRef.current.length > 0) return deptRootsRef.current;
    await loadDepts();
    return deptRootsRef.current;
  };

  const loadDeptChildren = async (parentId: number, page = 0) => {
    const requestId = (deptChildrenRequestIdRef.current[parentId] ?? 0) + 1;
    deptChildrenRequestIdRef.current[parentId] = requestId;
    const metaKey = String(parentId);
    setDeptChildrenMeta((prev) => ({
      ...prev,
      [metaKey]: {
        total: prev[metaKey]?.total ?? 0,
        nextPage: prev[metaKey]?.nextPage ?? 0,
        loading: true,
        error: false,
      },
    }));
    try {
      const res = await getList<DeptItem>("departments", {
        parent_id: parentId,
        _start: page * DEPT_PAGE_SIZE,
        _end: (page + 1) * DEPT_PAGE_SIZE,
      });
      if (deptChildrenRequestIdRef.current[parentId] !== requestId) return;
      const existing = deptChildrenByParentRef.current[parentId] ?? [];
      const next = page === 0 ? res.data : [...existing, ...res.data];
      deptChildrenByParentRef.current[parentId] = next;
      deptChildrenMetaRef.current[metaKey] = {
        total: res.total,
        nextPage: page + 1,
        loading: false,
        error: false,
      };
      setDeptChildrenByParent({ ...deptChildrenByParentRef.current });
      setDeptChildrenMeta({ ...deptChildrenMetaRef.current });
    } catch (e: unknown) {
      if (deptChildrenRequestIdRef.current[parentId] !== requestId) return;
      message.error(e instanceof Error ? `加载失败: ${e.message}` : "加载失败");
      deptChildrenMetaRef.current[metaKey] = {
        total: deptChildrenMetaRef.current[metaKey]?.total ?? 0,
        nextPage: deptChildrenMetaRef.current[metaKey]?.nextPage ?? 0,
        loading: false,
        error: true,
      };
      setDeptChildrenMeta({ ...deptChildrenMetaRef.current });
    } finally {
      if (deptChildrenRequestIdRef.current[parentId] === requestId) {
        deptChildrenMetaRef.current[metaKey] = {
          ...(deptChildrenMetaRef.current[metaKey] ?? {
            total: 0,
            nextPage: 0,
          }),
          loading: false,
        };
        setDeptChildrenMeta({ ...deptChildrenMetaRef.current });
      }
    }
  };

  const loadAllDeptChildren = async (parentId: number): Promise<DeptItem[]> => {
    const metaKey = String(parentId);
    const sessionId = permSessionRef.current;
    const cached = deptChildrenByParentRef.current[parentId] ?? [];
    const cachedMeta = deptChildrenMetaRef.current[metaKey];
    if (cachedMeta && cached.length >= cachedMeta.total) return cached;
    let items = cached;
    let page = cachedMeta?.nextPage ?? 0;
    let total = cachedMeta?.total ?? 0;
    let nextPage = cachedMeta?.nextPage ?? 0;
    let first = cached.length === 0;
    deptChildrenMetaRef.current[metaKey] = {
      ...(cachedMeta ?? { total: 0, nextPage: 0 }),
      loading: true,
      error: false,
    };
    setDeptChildrenMeta({ ...deptChildrenMetaRef.current });
    try {
      while (!cachedMeta || items.length < cachedMeta.total) {
        const res = await getList<DeptItem>("departments", {
          parent_id: parentId,
          _start: page * DEPT_PAGE_SIZE,
          _end: (page + 1) * DEPT_PAGE_SIZE,
        });
        if (sessionId !== permSessionRef.current) return [];
        items = first ? res.data : [...items, ...res.data];
        first = false;
        total = res.total;
        nextPage = page + 1;
        page += 1;
        if (!res.data.length || items.length >= res.total) break;
      }
      if (sessionId !== permSessionRef.current) return [];
      deptChildrenByParentRef.current[parentId] = items;
      deptChildrenMetaRef.current[metaKey] = {
        total,
        nextPage,
        loading: false,
        error: false,
      };
      setDeptChildrenByParent({ ...deptChildrenByParentRef.current });
      setDeptChildrenMeta({ ...deptChildrenMetaRef.current });
      return items;
    } catch (e: unknown) {
      if (sessionId !== permSessionRef.current) return [];
      deptChildrenMetaRef.current[metaKey] = {
        total: cachedMeta?.total ?? 0,
        nextPage: cachedMeta?.nextPage ?? 0,
        loading: false,
        error: true,
      };
      setDeptChildrenMeta({ ...deptChildrenMetaRef.current });
      throw e;
    }
  };

  const loadMenus = async () => {
    const requestId = ++menuRootRequestIdRef.current;
    const sessionId = permSessionRef.current;
    setMenuRootMeta((prev) => ({ ...prev, loading: true, error: false }));
    try {
      const items = await apiFetch<MenuItem[]>("/api/menus/all");
      if (
        requestId !== menuRootRequestIdRef.current ||
        sessionId !== permSessionRef.current
      )
        return;
      const grouped = groupMenuTree(items);
      menuByIdRef.current = {};
      for (const item of items) menuByIdRef.current[item.id] = item;
      menuRootsRef.current = grouped.roots;
      menuChildrenByParentRef.current = grouped.childrenByParent;
      menuChildrenMetaRef.current = grouped.childrenMeta;
      setMenuRoots(grouped.roots);
      setMenuChildrenByParent({ ...grouped.childrenByParent });
      setMenuChildrenMeta({ ...grouped.childrenMeta });
      setMenuRootMeta({
        total: grouped.roots.length,
        nextPage: Math.ceil(grouped.roots.length / MENU_PAGE_SIZE),
        loading: false,
        error: false,
      });
    } catch (e: unknown) {
      if (
        requestId === menuRootRequestIdRef.current &&
        sessionId === permSessionRef.current
      ) {
        message.error(
          e instanceof Error ? `加载失败: ${e.message}` : "加载失败",
        );
        setMenuRootMeta((prev) => ({ ...prev, loading: false, error: true }));
      }
      throw e;
    } finally {
      if (requestId === menuRootRequestIdRef.current)
        setMenuRootMeta((prev) => ({ ...prev, loading: false }));
    }
  };

  const loadDepts = async () => {
    const requestId = ++deptRootRequestIdRef.current;
    const sessionId = permSessionRef.current;
    setDeptRootMeta((prev) => ({ ...prev, loading: true, error: false }));
    try {
      const items = await apiFetch<DeptItem[]>("/api/departments/all");
      if (
        requestId !== deptRootRequestIdRef.current ||
        sessionId !== permSessionRef.current
      )
        return;
      const grouped = groupDeptTree(items);
      deptRootsRef.current = grouped.roots;
      deptChildrenByParentRef.current = grouped.childrenByParent;
      deptChildrenMetaRef.current = grouped.childrenMeta;
      setDeptRoots(grouped.roots);
      setDeptChildrenByParent({ ...grouped.childrenByParent });
      setDeptChildrenMeta({ ...grouped.childrenMeta });
      setDeptRootMeta({
        total: grouped.roots.length,
        nextPage: Math.ceil(grouped.roots.length / DEPT_PAGE_SIZE),
        loading: false,
        error: false,
      });
    } catch (e: unknown) {
      if (
        requestId === deptRootRequestIdRef.current &&
        sessionId === permSessionRef.current
      ) {
        message.error(
          e instanceof Error ? `加载失败: ${e.message}` : "加载失败",
        );
        setDeptRootMeta((prev) => ({ ...prev, loading: false, error: true }));
      }
      throw e;
    } finally {
      if (requestId === deptRootRequestIdRef.current)
        setDeptRootMeta((prev) => ({ ...prev, loading: false }));
    }
  };

  const resetPermissionTrees = () => {
    menuChildrenByParentRef.current = {};
    menuChildrenMetaRef.current = {};
    deptChildrenByParentRef.current = {};
    deptChildrenMetaRef.current = {};
    menuByIdRef.current = {};
    setMenuRoots([]);
    setMenuChildrenByParent({});
    setMenuChildrenMeta({});
    setDeptRoots([]);
    setDeptChildrenByParent({});
    setDeptChildrenMeta({});
    setMenuRootMeta({ total: 0, nextPage: 0, loading: false, error: false });
    setDeptRootMeta({ total: 0, nextPage: 0, loading: false, error: false });
    menuRootsRef.current = [];
    deptRootsRef.current = [];
    menuChildrenRequestIdRef.current = {};
    deptChildrenRequestIdRef.current = {};
  };

  useEffect(() => {
    loadData();
    return () => {
      requestIdRef.current += 1;
    };
  }, [loadData]);

  useEffect(() => {
    return () => {
      permSessionRef.current += 1;
      permOpeningRef.current = false;
      menuRootRequestIdRef.current += 1;
      deptRootRequestIdRef.current += 1;
      menuChildrenRequestIdRef.current = {};
      deptChildrenRequestIdRef.current = {};
      rolePermsRequestIdRef.current += 1;
    };
  }, []);

  const menuTreeData = buildMenuTreeNodes(menuRoots, menuChildrenByParent);
  const deptTreeData = buildDeptTreeNodes(deptRoots, deptChildrenByParent);

  const getMenuActions = (menuId: string): string[] => {
    const menu = menuByIdRef.current[Number(menuId)];
    if (!menu || menu.menu_type === "F") return [];
    if (Array.isArray(menu.actions))
      return [
        ...new Set([...menu.actions, "create", "read", "update", "delete"]),
      ];
    return ["create", "read", "update", "delete"];
  };

  const handleTreeCheck = (
    checkedKeys: string[],
    _info: { node: TreeNode; checked: boolean },
  ) => {
    setCheckedMenuIds(checkedKeys);
    setMenuPerms((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (!checkedKeys.includes(k)) delete next[k];
      }
      for (const k of checkedKeys) {
        if (!next[k]) {
          const m = menuByIdRef.current[Number(k)];
          next[k] =
            m?.menu_type === "F"
              ? []
              : m?.actions || ["create", "read", "update", "delete"];
        }
      }
      return next;
    });
  };

  const collectMenuDescendantKeys = async (
    menuId: number,
  ): Promise<string[]> => {
    const keys: string[] = [];
    const children = await loadAllMenuChildren(menuId);
    for (const child of children) {
      keys.push(String(child.id));
      if (child.menu_type !== "F")
        keys.push(...(await collectMenuDescendantKeys(child.id)));
    }
    return keys;
  };

  const getMenuSubtreeKeys = async (node: TreeNode) => {
    const menu = menuByIdRef.current[Number(node.key)];
    const keys = [node.key];
    if (menu && menu.menu_type !== "F")
      keys.push(...(await collectMenuDescendantKeys(menu.id)));
    return keys;
  };

  const collectDeptDescendantKeys = async (
    deptId: number,
  ): Promise<string[]> => {
    const keys: string[] = [];
    const children = await loadAllDeptChildren(deptId);
    for (const child of children) {
      keys.push(String(child.id));
      keys.push(...(await collectDeptDescendantKeys(child.id)));
    }
    return keys;
  };

  const getDeptSubtreeKeys = async (node: TreeNode) => {
    const keys = [node.key];
    keys.push(...(await collectDeptDescendantKeys(Number(node.key))));
    return keys;
  };

  const getAllMenuKeys = async (): Promise<string[]> => {
    const roots = await loadAllMenuRoots();
    const keys = roots.map((menu) => String(menu.id));
    for (const root of roots) {
      if (root.menu_type !== "F")
        keys.push(...(await collectMenuDescendantKeys(root.id)));
    }
    return [...new Set(keys)];
  };

  const selectAllMenus = async () => {
    const sessionId = permSessionRef.current;
    setMenuSelectAllLoading(true);
    try {
      const ids = await getAllMenuKeys();
      if (sessionId !== permSessionRef.current) return;
      setCheckedMenuIds(ids);
      const next: Record<string, string[]> = {};
      for (const id of ids) {
        const menu = menuByIdRef.current[Number(id)];
        if (menu && menu.menu_type !== "F")
          next[id] = menu.actions || ["create", "read", "update", "delete"];
      }
      setMenuPerms(next);
    } catch (e: unknown) {
      if (sessionId !== permSessionRef.current) return;
      message.error(e instanceof Error ? `加载失败: ${e.message}` : "加载失败");
    } finally {
      setMenuSelectAllLoading(false);
    }
  };

  const getAllDeptKeys = async (): Promise<string[]> => {
    const roots = await loadAllDeptRoots();
    const keys: string[] = [];
    for (const root of roots) {
      keys.push(String(root.id));
      keys.push(...(await collectDeptDescendantKeys(root.id)));
    }
    return [...new Set(keys)];
  };

  const selectAllDepts = async () => {
    const sessionId = permSessionRef.current;
    setDeptSelectAllLoading(true);
    try {
      const keys = await getAllDeptKeys();
      if (sessionId !== permSessionRef.current) return;
      setDeptCheckedKeys(keys);
    } catch (e: unknown) {
      if (sessionId !== permSessionRef.current) return;
      message.error(e instanceof Error ? `加载失败: ${e.message}` : "加载失败");
    } finally {
      setDeptSelectAllLoading(false);
    }
  };

  const loadRolePerms = async (roleId: number) => {
    const requestId = ++rolePermsRequestIdRef.current;
    try {
      setPermLoading(true);
      setPermLoadError(false);
      const perms = await apiFetch<{ menu_id: number; actions: string[] }[]>(
        `/api/roles/${roleId}/menus`,
      );
      if (requestId !== rolePermsRequestIdRef.current) return;
      const missingIds = perms
        .map((p) => p.menu_id)
        .filter((id) => !menuByIdRef.current[id]);
      if (missingIds.length > 0) {
        const missingMenus = await Promise.all(
          missingIds.map((id) => getOne<MenuItem>("menus", id)),
        );
        if (requestId !== rolePermsRequestIdRef.current) return;
        rememberMenus(missingMenus);
      }
      setCheckedMenuIds(perms.map((p) => String(p.menu_id)));
      const mp: Record<string, string[]> = {};
      for (const p of perms) mp[String(p.menu_id)] = p.actions;
      setMenuPerms(mp);
    } catch {
      // 权限树是保存角色权限的依据，失败时必须阻止静默覆盖。
      if (requestId !== rolePermsRequestIdRef.current) return;
      setCheckedMenuIds([]);
      setMenuPerms({});
      setPermLoadError(true);
    } finally {
      if (requestId === rolePermsRequestIdRef.current) setPermLoading(false);
    }
  };

  const openEdit = async (record: RoleItem) => {
    if (permOpeningRef.current) return;
    permOpeningRef.current = true;
    const sessionId = ++permSessionRef.current;
    setEditing(record);
    setFName(record.name);
    setFKey(record.role_key);
    setFSort(record.role_sort);
    setFStatus(record.status);
    setFScope(record.data_scope);
    setFDesc(record.description || "");
    setDeptCheckedKeys(record.dept_ids?.map(String) || []);
    setModalOpen(true);
    formErrors.clearErrors();
    setPermLoadError(false);
    setPermLoading(true);
    resetPermissionTrees();
    try {
      if (record.data_scope === 2) await loadDepts();
      await loadMenus();
      if (sessionId !== permSessionRef.current) return;
      await loadRolePerms(record.id);
      if (sessionId !== permSessionRef.current) return;
    } catch {
      if (sessionId !== permSessionRef.current) return;
      resetPermissionTrees();
      setCheckedMenuIds([]);
      setMenuPerms({});
      setPermLoadError(true);
    } finally {
      if (sessionId === permSessionRef.current) setPermLoading(false);
      permOpeningRef.current = false;
    }
  };

  const openPermissionDrawer = async (record: RoleItem) => {
    if (permOpeningRef.current) return;
    permOpeningRef.current = true;
    const sessionId = ++permSessionRef.current;
    setSelectedRole(record);
    setDrawerOpen(true);
    setPermLoadError(false);
    setPermLoading(true);
    resetPermissionTrees();
    try {
      if (record.data_scope === 2) await loadDepts();
      await loadMenus();
      if (sessionId !== permSessionRef.current) return;
      setDeptCheckedKeys(record.dept_ids?.map(String) || []);
      await loadRolePerms(record.id);
      if (sessionId !== permSessionRef.current) return;
    } catch {
      if (sessionId !== permSessionRef.current) return;
      resetPermissionTrees();
      setCheckedMenuIds([]);
      setMenuPerms({});
      setPermLoadError(true);
    } finally {
      if (sessionId === permSessionRef.current) setPermLoading(false);
      permOpeningRef.current = false;
    }
  };

  const openAdd = async () => {
    if (permOpeningRef.current) return;
    permOpeningRef.current = true;
    const sessionId = ++permSessionRef.current;
    setEditing(null);
    setModalOpen(true);
    formErrors.clearErrors();
    setCheckedMenuIds([]);
    setMenuPerms({});
    setDeptCheckedKeys([]);
    setPermLoadError(false);
    setPermLoading(false);
    setFName("");
    setFKey("");
    setFSort(0);
    setFStatus(1);
    setFScope(5);
    setFDesc("");
    setPermLoading(true);
    resetPermissionTrees();
    try {
      await loadMenus();
      if (sessionId !== permSessionRef.current) return;
    } catch {
      if (sessionId !== permSessionRef.current) return;
      resetPermissionTrees();
      setCheckedMenuIds([]);
      setMenuPerms({});
      setPermLoadError(true);
    } finally {
      if (sessionId === permSessionRef.current) setPermLoading(false);
      permOpeningRef.current = false;
    }
  };

  const savePermission = async () => {
    if (submitting || submittingRef.current) return;
    if (!selectedRole) return;
    if (permLoading || permLoadError) {
      message.error("菜单权限尚未完整加载，请重试后再保存");
      return;
    }
    if (fScope === 2 && (deptRootMeta.loading || deptRootMeta.error)) {
      message.error("自定义部门权限尚未完整加载，请重试后再保存");
      return;
    }
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
      description: selectedRole.description?.trim() || null,
      menu_perms,
    };
    if (selectedRole.data_scope === 2)
      payload.dept_ids = deptCheckedKeys.map(Number);
    setSubmitting(true);
    submittingRef.current = true;
    try {
      await update("roles", selectedRole.id, payload);
      message.success("权限已保存");
      setDrawerOpen(false);
      loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  };

  const handleSubmit = async () => {
    if (submitting || submittingRef.current) return;
    const trimmedName = fName.trim();
    const trimmedKey = fKey.trim();
    const nextErrors: Record<string, string> = {};
    if (!trimmedName) nextErrors.name = "请输入角色名称";
    if (!trimmedKey) nextErrors.key = "请输入权限字符";
    if (Object.keys(nextErrors).length > 0) {
      formErrors.setErrors(nextErrors);
      return;
    }
    formErrors.clearErrors();
    if (permLoading || permLoadError) {
      message.error("菜单权限尚未完整加载，请重试后再保存");
      return;
    }
    const menu_perms = checkedMenuIds.map((mid) => ({
      menu_id: Number(mid),
      actions:
        menuPerms[mid] ||
        (editing ? [] : ["create", "read", "update", "delete"]),
    }));
    const payload: Record<string, unknown> = {
      name: trimmedName,
      role_key: trimmedKey,
      role_sort: fSort,
      status: fStatus,
      data_scope: fScope,
      description: fDesc.trim(),
      menu_perms,
    };
    if (fScope === 2 && deptCheckedKeys.length > 0) {
      payload.dept_ids = deptCheckedKeys.map(Number);
    }
    setSubmitting(true);
    submittingRef.current = true;
    try {
      if (editing) {
        await update("roles", editing.id, payload);
        message.success("已更新");
      } else {
        await create("roles", payload);
        message.success("已创建");
      }
      setModalOpen(false);
      if (page === 0) void loadData();
      else setPage(0);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  };

  const handleDelete = async (record: RoleItem) => {
    if (deleteRef.current || deleteLoadingId !== null || loading) return;
    deleteRef.current = true;
    const ok = await confirm({
      title: `确定删除角色「${record.name}」？`,
      content: "删除后不可恢复",
      okVariant: "destructive",
    });
    if (!ok) {
      deleteRef.current = false;
      return;
    }
    setDeleteLoadingId(record.id);
    try {
      await remove("roles", record.id);
      message.success("已删除");
      const nextTotal = Math.max(0, total - 1);
      const nextMaxPage = Math.max(0, Math.ceil(nextTotal / pageSize) - 1);
      if (page > nextMaxPage) setPage(nextMaxPage);
      else void loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleteLoadingId(null);
      deleteRef.current = false;
    }
  };

  const columns: ColumnDef<RoleItem>[] = [
    {
      accessorKey: "name",
      header: "角色",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span
            className="max-w-[180px] truncate font-medium"
            title={row.original.name}
          >
            {row.original.name}
          </span>
          <code
            className="block max-w-[220px] break-all text-xs text-muted-foreground"
            title={row.original.role_key}
          >
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
        <Badge
          variant="outline"
          className="max-w-[160px] truncate"
          title={
            DATA_SCOPE_MAP[row.original.data_scope] ||
            `类型${row.original.data_scope}`
          }
        >
          {DATA_SCOPE_MAP[row.original.data_scope] ||
            `类型${row.original.data_scope}`}
        </Badge>
      ),
    },
    {
      accessorKey: "description",
      header: "描述",
      cell: ({ row }) =>
        row.original.description ? (
          <span
            className="block max-w-[220px] truncate"
            title={row.original.description}
          >
            {row.original.description}
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex gap-2">
          {can("system:role:update") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openPermissionDrawer(row.original)}
              disabled={deleteLoadingId !== null || loading}
            >
              <CheckSquare className="size-4" /> 权限
            </Button>
          )}
          {can("system:role:update") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openEdit(row.original)}
              disabled={deleteLoadingId !== null || loading}
            >
              <Pencil className="size-4" /> 编辑
            </Button>
          )}
          {can("system:role:delete") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(row.original)}
              disabled={deleteLoadingId !== null || loading}
            >
              {deleteLoadingId === row.original.id ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Trash2 className="size-4" /> 删除
                </>
              )}
            </Button>
          )}
        </div>
      ),
    },
  ];

  const retryPermissionLoad = async () => {
    const sessionId = ++permSessionRef.current;
    const roleId = editing?.id ?? selectedRole?.id;
    if (!roleId) return;
    setPermLoadError(false);
    setPermLoading(true);
    try {
      const record = editing ?? selectedRole;
      const deptIds = record?.dept_ids?.map(String) || [];
      const deptScope =
        editing !== null ? fScope === 2 : record?.data_scope === 2;
      if (deptScope) {
        await loadDepts();
        if (sessionId !== permSessionRef.current) return;
        setDeptCheckedKeys(deptIds);
      } else {
        setDeptCheckedKeys([]);
      }
      await loadMenus();
      if (sessionId !== permSessionRef.current) return;
      await loadRolePerms(roleId);
      if (sessionId !== permSessionRef.current) return;
    } catch {
      if (sessionId !== permSessionRef.current) return;
      resetPermissionTrees();
      setCheckedMenuIds([]);
      setMenuPerms({});
      setDeptCheckedKeys([]);
      setPermLoadError(true);
    } finally {
      if (sessionId === permSessionRef.current) setPermLoading(false);
    }
  };

  const PermissionTree = () => (
    <div>
      {permLoadError && (
        <div className="mb-3">
          <InlineError
            title="角色权限加载失败"
            description="为避免覆盖现有权限，请重试后再保存"
            loading={permLoading}
            onRetry={() => {
              void retryPermissionLoad();
            }}
          />
        </div>
      )}
      {permLoading && !permLoadError && (
        <div className="flex items-center justify-center gap-2 rounded-md border border-dashed px-3 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          正在加载菜单权限…
        </div>
      )}
      {!permLoading && !permLoadError && (
        <>
          <div className="mb-3 flex items-center gap-2">
            <span className="font-medium">菜单权限</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void selectAllMenus()}
              disabled={menuSelectAllLoading || menuRootMeta.loading}
            >
              {menuSelectAllLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              全选
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCheckedMenuIds([]);
                setMenuPerms({});
              }}
              disabled={menuSelectAllLoading || menuRootMeta.loading}
            >
              清空
            </Button>
          </div>
          <ScrollArea className="h-[360px] rounded-md border p-2">
            <CheckboxTree
              treeData={menuTreeData}
              checkedKeys={checkedMenuIds}
              onCheck={handleTreeCheck}
              loadChildren={(node) => {
                void loadMenuChildren(Number(node.key));
              }}
              loadMoreChildren={(node) => {
                const meta = menuChildrenMeta[node.key];
                void loadMenuChildren(Number(node.key), meta?.nextPage ?? 0);
              }}
              childrenState={menuChildrenMeta}
              rootLoadState={menuRootMeta}
              loadMoreRoot={() => {
                void loadMenuRoot(menuRootMeta.nextPage);
              }}
              getSubtreeKeys={getMenuSubtreeKeys}
            />
          </ScrollArea>
          {checkedMenuIds.length > 0 && (
            <>
              <Separator className="my-3" />
              <span className="mb-2 block text-sm font-medium">操作权限</span>
              <div className="space-y-2">
                {checkedMenuIds.map((mid) => {
                  const menu = menuByIdRef.current[Number(mid)];
                  if (!menu || menu.menu_type === "F") return null;
                  const available = getMenuActions(mid);
                  if (available.length === 0) return null;
                  const Icon = TYPE_ICONS[menu.menu_type];
                  return (
                    <Card key={mid}>
                      <CardContent className="p-3">
                        <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                          {Icon && <Icon className="size-4 shrink-0" />}
                          <span
                            className="min-w-0 break-words"
                            title={menu.name}
                          >
                            {menu.name}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {available.map((action) => (
                            <label
                              key={action}
                              className="flex min-w-0 items-center gap-1.5 cursor-pointer"
                            >
                              <Checkbox
                                checked={(menuPerms[mid] || []).includes(
                                  action,
                                )}
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
                              <span
                                className="min-w-0 break-words text-sm"
                                title={action}
                              >
                                {action}
                              </span>
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
        </>
      )}
    </div>
  );

  const renderDeptPermissionPanel = () => (
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
          disabled={deptRootMeta.loading || deptSelectAllLoading}
          onClick={() => void selectAllDepts()}
        >
          {deptSelectAllLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : null}
          全选
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={deptRootMeta.loading || deptSelectAllLoading}
          onClick={() => setDeptCheckedKeys([])}
        >
          清空
        </Button>
      </div>
      {deptRootMeta.error && (
        <InlineError
          title="部门树加载失败"
          description="自定义部门权限未完整加载，请重试。"
          onRetry={() => {
            void loadDepts().catch(() => undefined);
          }}
          loading={deptRootMeta.loading}
        />
      )}
      {deptRootMeta.loading && deptRoots.length === 0 && (
        <div className="block py-4 text-center text-sm text-muted-foreground">
          加载部门…
        </div>
      )}
      {!deptRootMeta.error && deptRoots.length > 0 && (
        <ScrollArea className="h-[260px] rounded-md border p-2">
          <CheckboxTree
            treeData={deptTreeData}
            checkedKeys={deptCheckedKeys}
            onCheck={(keys) => setDeptCheckedKeys(keys)}
            loadChildren={(node) => {
              void loadDeptChildren(Number(node.key));
            }}
            loadMoreChildren={(node) => {
              const meta = deptChildrenMeta[node.key];
              void loadDeptChildren(Number(node.key), meta?.nextPage ?? 0);
            }}
            childrenState={deptChildrenMeta}
            rootLoadState={deptRootMeta}
            loadMoreRoot={() => {
              void loadDeptRoot(deptRootMeta.nextPage);
            }}
            getSubtreeKeys={getDeptSubtreeKeys}
          />
        </ScrollArea>
      )}
      {!deptRootMeta.error &&
        !deptRootMeta.loading &&
        deptRoots.length === 0 && (
          <div className="block py-4 text-center text-sm text-muted-foreground">
            暂无部门
          </div>
        )}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">角色管理</h2>
        {can("system:role:create") && (
          <Button onClick={openAdd} disabled={loading}>
            <Plus className="size-4" /> 新建角色
          </Button>
        )}
      </div>

      {loadError && (
        <InlineError
          title="角色列表加载失败"
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
        emptyMessage="暂无角色，点击「新增角色」创建"
      />

      <Sheet
        open={drawerOpen}
        onOpenChange={(open) => {
          if (!open && submitting) return;
          if (!open) {
            permSessionRef.current += 1;
            permOpeningRef.current = false;
            menuRootRequestIdRef.current += 1;
            deptRootRequestIdRef.current += 1;
            menuChildrenRequestIdRef.current = {};
            deptChildrenRequestIdRef.current = {};
            rolePermsRequestIdRef.current += 1;
            setPermLoading(false);
            setMenuSelectAllLoading(false);
            setDeptSelectAllLoading(false);
          }
          setDrawerOpen(open);
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:w-[640px] sm:max-w-[640px]"
        >
          <SheetHeader>
            <SheetTitle className="break-words">
              {selectedRole?.name} — 权限配置
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <PermissionTree />
            {selectedRole &&
              selectedRole.data_scope === 2 &&
              renderDeptPermissionPanel()}
          </div>
          <SheetFooter className="mt-4">
            {can("system:role:update") && (
              <Button
                onClick={savePermission}
                disabled={
                  submitting ||
                  permLoading ||
                  permLoadError ||
                  (selectedRole?.data_scope === 2 &&
                    (deptRootMeta.loading || deptRootMeta.error))
                }
              >
                <CheckSquare className="size-4" /> 保存权限
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          if (!open && submitting) return;
          if (!open) {
            permSessionRef.current += 1;
            permOpeningRef.current = false;
            menuRootRequestIdRef.current += 1;
            deptRootRequestIdRef.current += 1;
            menuChildrenRequestIdRef.current = {};
            deptChildrenRequestIdRef.current = {};
            rolePermsRequestIdRef.current += 1;
            setPermLoading(false);
            setMenuSelectAllLoading(false);
            setDeptSelectAllLoading(false);
          }
          setModalOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-[660px] max-h-[90vh] overflow-y-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
          >
            <DialogHeader>
              <DialogTitle>{editing ? "编辑角色" : "新建角色"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <RequiredLabel htmlFor="role-name" required>
                    角色名称
                  </RequiredLabel>
                  <Input
                    id="role-name"
                    placeholder="请输入角色名称"
                    value={fName}
                    onChange={(e) => {
                      setFName(e.target.value);
                      formErrors.clearError("name");
                    }}
                    {...formErrors.fieldProps("name", "role-name")}
                  />
                  {formErrors.errors.name && (
                    <FormMessage
                      id="role-name-error"
                      error={formErrors.errors.name}
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <RequiredLabel htmlFor="role-key" required>
                    权限字符
                  </RequiredLabel>
                  <Input
                    id="role-key"
                    value={fKey}
                    onChange={(e) => {
                      setFKey(e.target.value);
                      formErrors.clearError("key");
                    }}
                    {...formErrors.fieldProps("key", "role-key")}
                    placeholder="admin, editor"
                  />
                  {formErrors.errors.key && (
                    <FormMessage
                      id="role-key-error"
                      error={formErrors.errors.key}
                    />
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="role-sort">排序</Label>
                  <Input
                    type="number"
                    min={0}
                    id="role-sort"
                    value={fSort}
                    onChange={(e) => setFSort(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label id="role-status-label">状态</Label>
                  <RadioGroup
                    aria-labelledby="role-status-label"
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
                <Label htmlFor="role-data-scope">数据范围</Label>
                <Select
                  value={String(fScope)}
                  onValueChange={(v) => {
                    const n = Number(v);
                    setFScope(n);
                    if (n !== 2) setDeptCheckedKeys([]);
                    if (n === 2) void loadDepts().catch(() => undefined);
                  }}
                >
                  <SelectTrigger id="role-data-scope">
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
                <Label htmlFor="role-description">描述</Label>
                <TextareaWithCounter
                  id="role-description"
                  placeholder="请输入描述（选填）"
                  value={fDesc}
                  maxLength={500}
                  onChange={(e) => setFDesc(e.target.value)}
                />
              </div>
              <Separator />
              <PermissionTree />
              {fScope === 2 ? renderDeptPermissionPanel() : null}
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
              <Button
                type="submit"
                disabled={
                  submitting ||
                  permLoading ||
                  permLoadError ||
                  (fScope === 2 && (deptRootMeta.loading || deptRootMeta.error))
                }
              >
                {submitting ? "提交中…" : "确定"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
