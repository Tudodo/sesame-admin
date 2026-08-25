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
import { RequiredLabel } from "@/components/ui/required-label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TextareaWithCounter } from "@/components/ui/textarea-counter";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useFieldErrors } from "@/hooks/useFieldErrors";
import { useLazyResource } from "@/hooks/useLazyResource";
import { useUserNames } from "@/hooks/useUserNames";
import { confirm } from "@/lib/confirm";
import { message } from "@/lib/message";
import { create, getList, remove, update } from "@/services/api";
import { can } from "@/services/permission";
import {
  Building,
  ChevronDown,
  ChevronRight,
  IdCard,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Wand2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface DeptItem {
  id: number;
  name: string;
  description: string | null;
  parent_id: number | null;
  sort_order: number;
  code: string | null;
  status: string;
  children?: DeptItem[];
  leader_pid?: string | null;
}
interface PositionItem {
  id: number;
  name: string;
  dept_id: number;
  sort_order: number;
}

interface LeaderUser {
  id: number;
  pid: string;
  name: string;
  email: string;
}

const LEADER_PAGE_SIZE = 20;
const POSITIONS_PAGE_SIZE = 20;
const DEPT_PAGE_SIZE = 100;

interface GenerateDeptCodeItem {
  id: number;
  name: string;
  old_code: string | null;
  new_code: string | null;
  skipped: boolean;
  reason?: string | null;
}

interface GenerateCodesResponse {
  total: number;
  generated: number;
  applied: number;
  skipped: number;
  items: GenerateDeptCodeItem[];
}

interface DeptChildMeta {
  total: number;
  nextPage: number;
  loading: boolean;
  error: boolean;
}
function DeptRow({
  node,
  level,
  expanded,
  onToggle,
  childrenByParent,
  childrenMeta,
  onLoadChildren,
  onLoadMoreChildren,
  onEdit,
  onDelete,
  onPositions,
  onToggleStatus,
  busyId,
  busyAction,
  loading,
}: {
  node: DeptItem;
  level: number;
  expanded: Set<number>;
  childrenByParent: Record<number, DeptItem[]>;
  childrenMeta: Record<number, DeptChildMeta>;
  onToggle: (id: number) => void;
  onLoadChildren: (id: number) => void;
  onLoadMoreChildren: (id: number) => void;
  onEdit: (d: DeptItem) => void;
  onDelete: (d: DeptItem) => void;
  onPositions: (d: DeptItem) => void;
  onToggleStatus: (d: DeptItem) => void;
  busyId: number | null;
  busyAction: "delete" | "status" | null;
  loading: boolean;
}) {
  const children = childrenByParent[node.id];
  const meta = childrenMeta[node.id];
  const isExpanded = expanded.has(node.id);
  const hasChildren =
    children === undefined || isExpanded || children.length > 0;
  const isBusy = busyId === node.id;
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
        <Building className="size-4 text-primary" />
        <span
          className="min-w-0 max-w-[220px] truncate flex-1 font-medium"
          title={node.name}
        >
          {node.name}
        </span>
        {node.code && (
          <Badge
            variant="secondary"
            className="max-w-[160px] truncate font-mono text-xs"
            title={node.code}
          >
            {node.code}
          </Badge>
        )}
        {node.status === "disabled" ? (
          <Badge variant="destructive">停用</Badge>
        ) : (
          <Badge variant="secondary">启用</Badge>
        )}
        <span className="text-sm text-muted-foreground">
          <span
            className="min-w-0 max-w-[200px] truncate"
            title={node.description ?? undefined}
          >
            {node.description || "-"}
          </span>
        </span>
        <Badge variant="outline" className="ml-2">
          {node.sort_order}
        </Badge>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={busyId !== null || loading}
            onClick={() => onPositions(node)}
          >
            <IdCard className="size-4.5" /> 岗位
          </Button>
          {can("system:dept:update") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyId !== null || loading}
                  onClick={() => onEdit(node)}
                  aria-label={`编辑 ${node.name}`}
                >
                  <Pencil className="size-4.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>编辑</TooltipContent>
            </Tooltip>
          )}
          {can("system:dept:update") && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busyId !== null || loading}
              onClick={() => onToggleStatus(node)}
            >
              {isBusy && busyAction === "status" ? (
                <Loader2 className="size-4.5 animate-spin" />
              ) : node.status === "disabled" ? (
                "启用"
              ) : (
                "停用"
              )}
            </Button>
          )}
          {can("system:dept:delete") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyId !== null || loading}
                  onClick={() => onDelete(node)}
                  aria-label={`删除 ${node.name}`}
                >
                  {isBusy && busyAction === "delete" ? (
                    <Loader2 className="size-4.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-4.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>删除</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      {isExpanded && (
        <>
          {children === undefined && meta?.loading && (
            <div
              className="flex items-center gap-2 border-b px-3 py-2 text-sm text-muted-foreground"
              style={{ paddingLeft: (level + 1) * 24 + 12 }}
            >
              <Loader2 className="size-4.5 animate-spin" /> 加载子部门…
            </div>
          )}
          {children === undefined && meta?.error && (
            <div
              role="alert"
              className="flex items-center gap-2 border-b px-3 py-2 text-sm text-destructive"
              style={{ paddingLeft: (level + 1) * 24 + 12 }}
            >
              <span>子部门加载失败</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onLoadChildren(node.id)}
              >
                重试
              </Button>
            </div>
          )}
          {children?.map((child) => (
            <DeptRow
              key={child.id}
              node={child}
              level={level + 1}
              expanded={expanded}
              childrenByParent={childrenByParent}
              childrenMeta={childrenMeta}
              onToggle={onToggle}
              onLoadChildren={onLoadChildren}
              onLoadMoreChildren={onLoadMoreChildren}
              onEdit={onEdit}
              onDelete={onDelete}
              onPositions={onPositions}
              onToggleStatus={onToggleStatus}
              busyId={busyId}
              busyAction={busyAction}
              loading={loading}
            />
          ))}
          {children &&
            children.length === 0 &&
            !meta?.loading &&
            !meta?.error && (
              <div
                className="block border-b px-3 py-2 text-sm text-muted-foreground"
                style={{ paddingLeft: (level + 1) * 24 + 12 }}
              >
                暂无子部门
              </div>
            )}
          {children &&
            meta &&
            children.length > 0 &&
            meta.total > children.length && (
              <div
                className="border-b px-3 py-1"
                style={{ paddingLeft: (level + 1) * 24 + 12 }}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={meta.loading}
                  onClick={() => onLoadMoreChildren(node.id)}
                >
                  {meta.loading ? (
                    <Loader2 className="size-4.5 animate-spin" />
                  ) : (
                    `加载更多子部门（${children.length}/${meta.total}）`
                  )}
                </Button>
              </div>
            )}
        </>
      )}
    </>
  );
}

export const DepartmentsPage = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DeptItem | null>(null);
  const [treeData, setTreeData] = useState<DeptItem[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [rootTotal, setRootTotal] = useState(0);
  const [rootNextPage, setRootNextPage] = useState(0);
  const [childrenByParent, setChildrenByParent] = useState<
    Record<number, DeptItem[]>
  >({});
  const [childrenMeta, setChildrenMeta] = useState<
    Record<number, DeptChildMeta>
  >({});
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [sortOrder, setSortOrder] = useState(0);
  const [code, setCode] = useState("");
  const [formLeaderPid, setFormLeaderPid] = useState("");
  const [leaderUsers, setLeaderUsers] = useState<LeaderUser[]>([]);
  const [leaderTotal, setLeaderTotal] = useState(0);
  const [leaderSearch, setLeaderSearch] = useState("");
  const [leaderLoading, setLeaderLoading] = useState(false);
  const [leaderError, setLeaderError] = useState(false);
  const [leaderNextPage, setLeaderNextPage] = useState(0);
  const [selectedLeader, setSelectedLeader] = useState<LazyPickerOption[]>([]);
  const { getName, userMap, users } = useUserNames();

  // Positions modal
  const [posDept, setPosDept] = useState<DeptItem | null>(null);
  const [positions, setPositions] = useState<PositionItem[]>([]);
  const [posModalOpen, setPosModalOpen] = useState(false);
  const [posEditing, setPosEditing] = useState<PositionItem | null>(null);
  const [posName, setPosName] = useState("");
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [positionsError, setPositionsError] = useState(false);
  const [posTotal, setPosTotal] = useState(0);
  const [posNextPage, setPosNextPage] = useState(0);
  const [positionSaving, setPositionSaving] = useState(false);
  const [positionDeletingId, setPositionDeletingId] = useState<number | null>(
    null,
  );
  const formErrors = useFieldErrors();
  const positionFormErrors = useFieldErrors();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [busyAction, setBusyAction] = useState<"delete" | "status" | null>(
    null,
  );
  const [genOpen, setGenOpen] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [genItems, setGenItems] = useState<GenerateDeptCodeItem[]>([]);
  const [genSummary, setGenSummary] = useState({
    generated: 0,
    applied: 0,
    skipped: 0,
  });
  const deptsRequestIdRef = useRef(0);
  const childrenRequestIdRef = useRef<Record<number, number>>({});
  const positionsRequestIdRef = useRef(0);
  const positionsOpeningRef = useRef(false);
  const leaderRequestIdRef = useRef(0);
  const leaderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittingRef = useRef(false);
  const positionSavingRef = useRef(false);
  const positionDeletingRef = useRef(false);
  const busyRef = useRef(false);
  const genLoadingRef = useRef(false);

  const deptSource = useLazyResource<DeptItem>("departments", modalOpen);
  const deptCodeError = (() => {
    const value = code.trim();
    if (!value) return null;
    if (value.length > 64) return "部门编码长度不能超过64个字符";
    if (!/^[a-zA-Z0-9_.-]+$/.test(value))
      return "只能包含字母、数字、下划线、连字符和点";
    return null;
  })();
  const codeError = deptCodeError || formErrors.errors.code;

  const loadRoot = async (page = 0) => {
    setLoading(true);
    setLoadError(false);
    const requestId = ++deptsRequestIdRef.current;
    try {
      const res = await getList<DeptItem>("departments", {
        parent_id: 0,
        _start: page * DEPT_PAGE_SIZE,
        _end: (page + 1) * DEPT_PAGE_SIZE,
      });
      if (requestId !== deptsRequestIdRef.current) return;
      setTreeData((prev) => (page === 0 ? res.data : [...prev, ...res.data]));
      setRootTotal(res.total);
      setRootNextPage(page + 1);
      setLoadError(false);
    } catch (e: unknown) {
      if (requestId !== deptsRequestIdRef.current) return;
      message.error(e instanceof Error ? `加载失败: ${e.message}` : "加载失败");
      setLoadError(true);
    } finally {
      if (requestId === deptsRequestIdRef.current) setLoading(false);
    }
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
      const res = await getList<DeptItem>("departments", {
        parent_id: parentId,
        _start: page * DEPT_PAGE_SIZE,
        _end: (page + 1) * DEPT_PAGE_SIZE,
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
    const meta = childrenMeta[id];
    if (!childrenByParent[id] && !meta?.loading) {
      void loadChildren(id);
    }
  };

  useEffect(() => {
    loadData();
    return () => {
      deptsRequestIdRef.current += 1;
      childrenRequestIdRef.current = {};
    };
  }, []);

  useEffect(() => {
    return () => {
      positionsRequestIdRef.current += 1;
      positionsOpeningRef.current = false;
      leaderRequestIdRef.current += 1;
    };
  }, []);
  // 部门负责人的当前值仅存了 pid，这里结合共享姓名缓存解析真实姓名与邮箱，
  // 避免编辑弹窗里只显示占位文本。
  useEffect(() => {
    if (!formLeaderPid) return;
    getName(formLeaderPid);
    const resolvedName = userMap[formLeaderPid];
    const leaderUser = users.find((u) => u.pid === formLeaderPid);
    setSelectedLeader((prev) => {
      if (!prev.length || prev[0].key !== formLeaderPid) return prev;
      return [
        {
          key: formLeaderPid,
          label: resolvedName || "当前负责人",
          sublabel: resolvedName
            ? leaderUser?.email || formLeaderPid
            : "重新搜索可选择其他人员",
        },
      ];
    });
  }, [formLeaderPid, getName, userMap, users]);
  const loadLeaderUsers = useCallback(
    async (page: number) => {
      const requestId = ++leaderRequestIdRef.current;
      setLeaderLoading(true);
      setLeaderError(false);
      try {
        const query: Record<string, unknown> = {
          _start: page * LEADER_PAGE_SIZE,
          _end: (page + 1) * LEADER_PAGE_SIZE,
        };
        const keyword = leaderSearch.trim();
        if (keyword) query.name = keyword;
        const res = await getList<LeaderUser>("users", query);
        if (requestId !== leaderRequestIdRef.current) return;
        setLeaderUsers((prev) =>
          page === 0 ? res.data : [...prev, ...res.data],
        );
        setLeaderTotal(res.total);
        setLeaderNextPage(page + 1);
      } catch (e: unknown) {
        if (requestId !== leaderRequestIdRef.current) return;
        setLeaderError(true);
        message.error(
          e instanceof Error ? `加载失败: ${e.message}` : "加载失败",
        );
      } finally {
        if (requestId === leaderRequestIdRef.current) setLeaderLoading(false);
      }
    },
    [leaderSearch],
  );

  useEffect(() => {
    if (!modalOpen) return;
    if (leaderTimerRef.current) clearTimeout(leaderTimerRef.current);
    leaderTimerRef.current = setTimeout(() => {
      leaderTimerRef.current = null;
      void loadLeaderUsers(0);
    }, 300);
    return () => {
      if (leaderTimerRef.current) clearTimeout(leaderTimerRef.current);
    };
  }, [modalOpen, loadLeaderUsers]);

  const leaderOptions = leaderUsers.map((user) => ({
    key: user.pid,
    label: user.name || user.email || `#${user.id}`,
    sublabel: user.email,
  }));
  const handleToggleLeader = (key: string, option: LazyPickerOption) => {
    const next = formLeaderPid === key ? "" : key;
    setFormLeaderPid(next);
    setSelectedLeader(next ? [option] : []);
  };

  const parentOptions = deptSource.items
    .filter((d) => !editing || d.id !== editing.id)
    .map((d) => ({
      key: String(d.id),
      label: d.name,
      sublabel: d.code || d.description || undefined,
      disabled:
        d.status === "disabled" || (editing !== null && d.id === editing.id),
    }));
  // 用已经加载到树上的部门补全上级名称，避免上级不在下拉首屏时只显示占位文本。
  const parentById = useMemo(() => {
    const map = new Map<number, DeptItem>();
    const visit = (list: DeptItem[]) => {
      for (const d of list) {
        map.set(d.id, d);
        if (d.children?.length) visit(d.children);
      }
    };
    visit(treeData);
    for (const children of Object.values(childrenByParent)) {
      visit(children);
    }
    return map;
  }, [treeData, childrenByParent]);
  const selectedParent = (() => {
    if (!parentId) return [];
    const current = parentById.get(Number(parentId));
    return [
      {
        key: parentId,
        label: current?.name || "当前上级",
        sublabel: current
          ? current.code || undefined
          : "重新搜索可选择其他部门",
        disabled: current?.status === "disabled",
      },
    ];
  })();
  const handleToggleParent = (key: string) => {
    setParentId((prev) => (prev === key ? "" : key));
  };

  const loadPositions = async (deptId: number, page = 0) => {
    if (positionsOpeningRef.current) return;
    positionsOpeningRef.current = true;
    setPositionsLoading(true);
    setPositionsError(false);
    const requestId = ++positionsRequestIdRef.current;
    try {
      const res = await getList<PositionItem>("positions", {
        dept_id: deptId,
        _start: page * POSITIONS_PAGE_SIZE,
        _end: (page + 1) * POSITIONS_PAGE_SIZE,
      });
      if (requestId !== positionsRequestIdRef.current) return;
      setPositions((prev) => (page === 0 ? res.data : [...prev, ...res.data]));
      setPosTotal(res.total);
      setPosNextPage(page + 1);
    } catch (e: unknown) {
      if (requestId !== positionsRequestIdRef.current) return;
      if (page === 0) setPositions([]);
      setPositionsError(true);
      message.error(e instanceof Error ? e.message : "加载岗位失败");
    } finally {
      if (requestId === positionsRequestIdRef.current)
        setPositionsLoading(false);
      if (requestId === positionsRequestIdRef.current) {
        positionsOpeningRef.current = false;
      }
    }
  };

  const handleOpenPositions = async (dept: DeptItem) => {
    setPosDept(dept);
    setPosEditing(null);
    setPosName("");
    setPositions([]);
    setPosModalOpen(true);
    setPosTotal(0);
    setPosNextPage(0);
    positionFormErrors.clearErrors();
    await loadPositions(dept.id);
  };

  const handleSavePosition = async () => {
    if (positionSaving || positionSavingRef.current) return;
    if (!posDept) return;
    if (positionsLoading || positionsError) {
      message.error("岗位列表尚未加载完成，请稍后重试");
      return;
    }
    if (!posName.trim()) {
      positionFormErrors.setErrors({ name: "请输入岗位名称" });
      return;
    }
    positionFormErrors.clearErrors();
    const trimmedPosName = posName.trim();
    if (posDept.status === "disabled") {
      message.error("部门已停用，不能继续新增岗位");
      return;
    }
    setPositionSaving(true);
    positionSavingRef.current = true;
    try {
      if (posEditing) {
        await update("positions", posEditing.id, {
          name: trimmedPosName,
          dept_id: posDept.id,
          sort_order: posEditing.sort_order,
        });
        message.success("岗位已更新");
      } else {
        await create("positions", {
          name: trimmedPosName,
          dept_id: posDept.id,
        });
        message.success("岗位已创建");
      }
      await loadPositions(posDept.id);
      setPosEditing(null);
      setPosName("");
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setPositionSaving(false);
      positionSavingRef.current = false;
    }
  };

  const handleDeletePosition = async (pos: PositionItem) => {
    if (
      positionDeletingRef.current ||
      positionDeletingId !== null ||
      positionsLoading
    )
      return;
    positionDeletingRef.current = true;
    const ok = await confirm({
      title: `确定删除岗位「${pos.name}」？`,
      content: "删除后不可恢复",
      okVariant: "destructive",
    });
    if (!ok) {
      positionDeletingRef.current = false;
      return;
    }
    setPositionDeletingId(pos.id);
    try {
      await remove("positions", pos.id);
      message.success("岗位已删除");
      if (posDept) await loadPositions(posDept.id);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setPositionDeletingId(null);
      positionDeletingRef.current = false;
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
    formErrors.clearErrors();
    setFormLeaderPid("");
    setLeaderSearch("");
    setLeaderUsers([]);
    setLeaderTotal(0);
    setLeaderNextPage(0);
    setLeaderError(false);
    setSelectedLeader([]);
  };

  const openEdit = (record: DeptItem) => {
    setEditing(record);
    setName(record.name);
    setDesc(record.description || "");
    setParentId(record.parent_id != null ? String(record.parent_id) : "");
    setSortOrder(record.sort_order);
    setCode(record.code || "");
    setModalOpen(true);
    formErrors.clearErrors();
    setFormLeaderPid(record.leader_pid || "");
    setLeaderSearch("");
    setLeaderUsers([]);
    setLeaderTotal(0);
    setLeaderNextPage(0);
    setLeaderError(false);
    setSelectedLeader(
      record.leader_pid
        ? [
            {
              key: record.leader_pid,
              label: "当前负责人",
              sublabel: "重新搜索可选择其他人员",
            },
          ]
        : [],
    );
  };

  const handleSubmit = async () => {
    if (submitting || submittingRef.current) return;
    const trimmedName = name.trim();
    const trimmedDesc = desc.trim();
    const trimmedCode = code.trim();
    const nextErrors: Record<string, string> = {};
    if (!trimmedName) nextErrors.name = "请输入部门名称";
    if (deptCodeError) nextErrors.code = deptCodeError;
    if (Object.keys(nextErrors).length > 0) {
      formErrors.setErrors(nextErrors);
      return;
    }
    formErrors.clearErrors();
    const payload = {
      name: trimmedName,
      description: trimmedDesc,
      parent_id: parentId ? Number(parentId) : null,
      sort_order: sortOrder,
      code: trimmedCode || null,
      leader_pid: formLeaderPid,
    };
    setSubmitting(true);
    submittingRef.current = true;
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
      submittingRef.current = false;
    }
  };

  const handleDelete = async (record: DeptItem) => {
    if (busyRef.current || busyId !== null || loading) return;
    busyRef.current = true;
    const ok = await confirm({
      title: `确定删除部门「${record.name}」？`,
      content: "子部门也会一起删除，删除后不可恢复",
      okVariant: "destructive",
    });
    if (!ok) {
      busyRef.current = false;
      return;
    }
    setBusyId(record.id);
    setBusyAction("delete");
    try {
      await remove("departments", record.id);
      message.success("已删除");
      loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusyId(null);
      setBusyAction(null);
      busyRef.current = false;
    }
  };

  const handleToggleStatus = async (record: DeptItem) => {
    if (busyRef.current || busyId !== null || loading) return;
    busyRef.current = true;
    const disabling = record.status !== "disabled";
    const ok = await confirm({
      title: disabling ? "停用部门？" : "启用部门？",
      content: disabling
        ? "停用后不会出现在新的流程设计和选人入口，历史流程数据仍会保留。"
        : "启用后可用于新的流程设计、选人和组织关联。",
      okVariant: disabling ? "destructive" : undefined,
    });
    if (!ok) {
      busyRef.current = false;
      return;
    }
    setBusyId(record.id);
    setBusyAction("status");
    try {
      await create(
        `departments/${record.id}/${disabling ? "disable" : "enable"}`,
        {},
      );
      message.success(disabling ? "部门已停用" : "部门已启用");
      loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusyId(null);
      setBusyAction(null);
      busyRef.current = false;
    }
  };

  const handlePreviewCodes = async () => {
    if (genLoading || genLoadingRef.current) return;
    setGenLoading(true);
    genLoadingRef.current = true;
    try {
      const res = await create<GenerateCodesResponse>(
        "departments/generate-codes",
        { apply: false },
      );
      setGenItems(res.items);
      setGenSummary({
        generated: res.generated,
        applied: res.applied,
        skipped: res.skipped,
      });
      setGenOpen(true);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "预览失败");
    } finally {
      setGenLoading(false);
      genLoadingRef.current = false;
    }
  };

  const handleApplyCodes = async () => {
    if (genLoading || genLoadingRef.current) return;
    setGenLoading(true);
    genLoadingRef.current = true;
    try {
      const res = await create<GenerateCodesResponse>(
        "departments/generate-codes",
        { apply: true },
      );
      setGenSummary({
        generated: res.generated,
        applied: res.applied,
        skipped: res.skipped,
      });
      message.success(`已生成 ${res.applied} 个部门编码`);
      setGenItems(res.items);
      setGenOpen(false);
      loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "应用失败");
    } finally {
      setGenLoading(false);
      genLoadingRef.current = false;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">部门管理</h2>
        <div className="flex items-center gap-2">
          {can("system:dept:update") && (
            <Button
              variant="outline"
              onClick={handlePreviewCodes}
              disabled={genLoading}
            >
              <Wand2 className="size-4" /> 批量生成编码
            </Button>
          )}
          {can("system:dept:create") && (
            <Button onClick={openAdd} disabled={loading}>
              <Plus className="size-4" /> 新建部门
            </Button>
          )}
        </div>
      </div>

      {loadError && (
        <InlineError
          title="部门列表加载失败"
          description={"列表可能未更新，已保留原有数据。"}
          onRetry={() => void loadRoot(0)}
          loading={loading}
        />
      )}

      <Card className="overflow-hidden">
        <div className="border-b bg-muted/50 px-3 py-2 text-sm font-medium text-muted-foreground">
          名称 / 描述 / 排序
        </div>
        {treeData.length === 0 ? (
          <div className="block py-12 text-center text-muted-foreground">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" /> 加载部门…
              </span>
            ) : (
              "暂无部门，点击「新建部门」添加"
            )}
          </div>
        ) : (
          <>
            {treeData.map((node) => (
              <DeptRow
                key={node.id}
                node={node}
                level={0}
                expanded={expanded}
                onToggle={toggle}
                childrenByParent={childrenByParent}
                childrenMeta={childrenMeta}
                onLoadChildren={(id) => void loadChildren(id)}
                onLoadMoreChildren={loadMoreChildren}
                onEdit={openEdit}
                onDelete={handleDelete}
                onPositions={handleOpenPositions}
                onToggleStatus={handleToggleStatus}
                busyId={busyId}
                busyAction={busyAction}
                loading={loading}
              />
            ))}
            {treeData.length > 0 && treeData.length < rootTotal && (
              <div className="border-b p-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={loading}
                  onClick={() => void loadRoot(rootNextPage)}
                >
                  {loading ? (
                    <Loader2 className="size-4.5 animate-spin" />
                  ) : (
                    `加载更多部门（${treeData.length}/${rootTotal}）`
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          if (!open && submitting) return;
          setModalOpen(open);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
          >
            <DialogHeader>
              <DialogTitle>{editing ? "编辑部门" : "新建部门"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <RequiredLabel htmlFor="dept-name" required>
                  名称
                </RequiredLabel>
                <Input
                  id="dept-name"
                  placeholder="请输入部门名称"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    formErrors.clearError("name");
                  }}
                  {...formErrors.fieldProps("name", "dept-name")}
                />
                {formErrors.errors.name && (
                  <FormMessage
                    id="dept-name-error"
                    error={formErrors.errors.name}
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="dept-description">描述</Label>
                <TextareaWithCounter
                  id="dept-description"
                  placeholder="请输入描述（选填）"
                  value={desc}
                  maxLength={500}
                  onChange={(e) => setDesc(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dept-parent">上级部门</Label>
                <LazyOptionsPicker
                  placeholder="留空为顶级部门"
                  id="dept-parent"
                  options={parentOptions}
                  selectedOptions={selectedParent}
                  total={deptSource.total}
                  loading={deptSource.loading}
                  error={deptSource.error}
                  multiple={false}
                  search={deptSource.search}
                  onSearchChange={deptSource.setSearch}
                  onLoadMore={deptSource.loadMore}
                  onRetry={deptSource.reload}
                  onToggle={handleToggleParent}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dept-sort">排序</Label>
                <Input
                  type="number"
                  min={0}
                  id="dept-sort"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dept-leader">部门负责人</Label>
                <LazyOptionsPicker
                  placeholder="搜索并选择部门负责人"
                  id="dept-leader"
                  options={leaderOptions}
                  selectedOptions={selectedLeader}
                  total={leaderTotal}
                  loading={leaderLoading}
                  error={leaderError}
                  multiple={false}
                  search={leaderSearch}
                  onSearchChange={setLeaderSearch}
                  onLoadMore={() => {
                    if (!leaderLoading) void loadLeaderUsers(leaderNextPage);
                  }}
                  onRetry={() => void loadLeaderUsers(0)}
                  onToggle={handleToggleLeader}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dept-code">部门编码</Label>
                <Input
                  id="dept-code"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    formErrors.clearError("code");
                  }}
                  placeholder="如 sales、tech，用于流程网关路由"
                  aria-invalid={codeError ? true : undefined}
                  aria-describedby={codeError ? "dept-code-error" : undefined}
                />
                <p className="text-xs text-muted-foreground">
                  稳定编码，用于流程条件路由。留空则自动生成 DEPT-&lt;id&gt;。
                </p>
                <p className="text-xs text-muted-foreground">
                  规范：小写英文 + 数字/下划线/连字符，用点号表示层级，如
                  sales、sales.east；编码用于流程网关路由，被引用后请保持稳定。
                </p>
                {codeError && (
                  <FormMessage id="dept-code-error" error={codeError} />
                )}
                {editing && (
                  <p className="text-xs text-destructive">
                    已被流程引用的编码不能修改；如需调整，请新增编码并停用原部门。
                  </p>
                )}
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

      <Dialog
        open={posModalOpen}
        onOpenChange={(open) => {
          if (
            !open &&
            (positionSaving || positionDeletingId !== null || positionsLoading)
          )
            return;
          if (!open) {
            positionsRequestIdRef.current += 1;
            positionsOpeningRef.current = false;
            setPositionsLoading(false);
            setPosDept(null);
            setPositions([]);
            setPositionsError(false);
            setPosTotal(0);
            setPosNextPage(0);
          }
          setPosModalOpen(open);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              <span className="break-words">
                {posDept ? `${posDept.name} — 岗位管理` : "岗位管理"}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 mb-3">
            <Input
              aria-label="岗位名称"
              value={posName}
              id="position-name"
              onChange={(e) => {
                setPosName(e.target.value);
                positionFormErrors.clearError("name");
              }}
              {...positionFormErrors.fieldProps("name", "position-name")}
              placeholder={posEditing ? "编辑岗位名称" : "输入新岗位名称"}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                if (
                  positionSaving ||
                  positionDeletingId !== null ||
                  positionsLoading ||
                  positionsError ||
                  (posDept?.status === "disabled" && !posEditing)
                ) {
                  return;
                }
                void handleSavePosition();
              }}
            />
            <Button
              onClick={handleSavePosition}
              disabled={
                positionSaving ||
                positionDeletingId !== null ||
                positionsLoading ||
                positionsError ||
                (posDept?.status === "disabled" && !posEditing)
              }
            >
              {positionSaving ? (
                <Loader2 className="size-4 mr-1 animate-spin" />
              ) : null}
              {posEditing ? "保存" : "添加"}
            </Button>
            {posEditing && (
              <Button
                variant="outline"
                disabled={
                  positionSaving ||
                  positionDeletingId !== null ||
                  positionsLoading
                }
                onClick={() => {
                  setPosEditing(null);
                  setPosName("");
                  positionFormErrors.clearErrors();
                }}
              >
                取消
              </Button>
            )}
          </div>
          {posDept?.status === "disabled" && !posEditing && (
            <div className="mb-3 block text-xs text-destructive">
              部门已停用，不能新增岗位
            </div>
          )}
          <div className="space-y-1">
            {positionFormErrors.errors.name && (
              <FormMessage
                id="position-name-error"
                error={positionFormErrors.errors.name}
              />
            )}
            {positions.length === 0 ? (
              positionsLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> 加载岗位…
                </div>
              ) : positionsError ? (
                <InlineError
                  title="岗位加载失败"
                  description="请重试或刷新页面后再操作。"
                  onRetry={() => posDept && loadPositions(posDept.id)}
                  loading={positionsLoading}
                />
              ) : (
                <div className="block py-8 text-center text-sm text-muted-foreground">
                  暂无岗位，输入名称添加
                </div>
              )
            ) : (
              positions.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <IdCard className="size-4 text-primary" />
                    <span className="text-sm">{item.name}</span>
                  </div>
                  <div className="flex gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={
                            positionSaving ||
                            positionDeletingId !== null ||
                            positionsLoading
                          }
                          onClick={() => {
                            setPosEditing(item);
                            setPosName(item.name);
                            positionFormErrors.clearErrors();
                          }}
                          aria-label={`编辑岗位 ${item.name}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>编辑岗位</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={
                            positionSaving ||
                            positionDeletingId !== null ||
                            positionsLoading
                          }
                          onClick={() => handleDeletePosition(item)}
                          aria-label={`删除岗位 ${item.name}`}
                        >
                          {positionDeletingId === item.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>删除岗位</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              ))
            )}
            {positions.length > 0 && positions.length < posTotal && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={
                  positionsLoading ||
                  positionSaving ||
                  positionDeletingId !== null
                }
                onClick={() => {
                  if (posDept && !positionsLoading)
                    void loadPositions(posDept.id, posNextPage);
                }}
              >
                {positionsLoading ? (
                  <Loader2 className="size-4.5 animate-spin" />
                ) : (
                  `加载更多岗位（${positions.length}/${posTotal}）`
                )}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={genOpen}
        onOpenChange={(open) => {
          if (!open && genLoading) return;
          setGenOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>批量生成部门编码</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              仅处理空编码和 DEPT-&lt;id&gt;
              回退编码；已有业务编码和已被流程引用的编码不会覆盖。
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">建议 {genSummary.generated} 个</Badge>
              <Badge variant="secondary">跳过 {genSummary.skipped} 个</Badge>
              {genSummary.applied > 0 && (
                <Badge>已应用 {genSummary.applied} 个</Badge>
              )}
            </div>
            <div className="max-h-[360px] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>部门</TableHead>
                    <TableHead>旧编码</TableHead>
                    <TableHead>新编码</TableHead>
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {genItems.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        <div>暂无部门数据</div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    genItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell
                          className="max-w-[220px] truncate text-sm"
                          title={item.name}
                        >
                          {item.name}
                        </TableCell>
                        <TableCell
                          className="max-w-[180px] truncate font-mono text-xs"
                          title={item.old_code || "-"}
                        >
                          {item.old_code || "-"}
                        </TableCell>
                        <TableCell
                          className="max-w-[180px] truncate font-mono text-xs"
                          title={item.new_code || "-"}
                        >
                          {item.new_code || "-"}
                        </TableCell>
                        <TableCell>
                          {item.skipped ? (
                            <Badge
                              variant="secondary"
                              className="max-w-[160px] truncate"
                              title={item.reason || "跳过"}
                            >
                              {item.reason || "跳过"}
                            </Badge>
                          ) : (
                            <Badge>待应用</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setGenOpen(false)}
              disabled={genLoading}
            >
              关闭
            </Button>
            <Button
              onClick={handleApplyCodes}
              disabled={genLoading || genSummary.generated === 0}
            >
              {genLoading ? "处理中…" : "应用编码"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
