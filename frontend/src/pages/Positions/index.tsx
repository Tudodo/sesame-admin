import { InlineError } from "@/components/InlineError";
import {
  LazyOptionsPicker,
  type LazyPickerOption,
} from "@/components/LazyOptionsPicker";
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
import { RequiredLabel } from "@/components/ui/required-label";
import { useFieldErrors } from "@/hooks/useFieldErrors";
import { useLazyResource } from "@/hooks/useLazyResource";
import { confirm } from "@/lib/confirm";
import { message } from "@/lib/message";
import { create, getList, getOne, remove, update } from "@/services/api";
import { can } from "@/services/permission";
import type { ColumnDef } from "@tanstack/react-table";
import { IdCard, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface PositionItem {
  id: number;
  name: string;
  description: string | null;
  dept_id: number | null;
  sort_order: number;
}

interface DeptItem {
  id: number;
  name: string;
  status: string;
}

export const PositionsPage = () => {
  const [data, setData] = useState<PositionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PositionItem | null>(null);
  const [deptNames, setDeptNames] = useState<
    Record<number, { name: string; status: string }>
  >({});
  const [selectedDept, setSelectedDept] = useState<LazyPickerOption[]>([]);
  const deptSource = useLazyResource<DeptItem>("departments", modalOpen);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [deptId, setDeptId] = useState<string>("");
  const [sortOrder, setSortOrder] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const formErrors = useFieldErrors();
  const requestIdRef = useRef(0);
  const submittingRef = useRef(false);
  const deletingRef = useRef(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    const requestId = ++requestIdRef.current;
    try {
      const res = await getList<PositionItem>("positions", {
        _start: page * pageSize,
        _end: (page + 1) * pageSize,
      });
      if (requestId !== requestIdRef.current) return;
      setData(res.data);
      setTotal(res.total);
      setLoadError(false);
    } catch (e: unknown) {
      // 非关键：列表加载失败时保留旧数据
      if (requestId !== requestIdRef.current) return;
      if (e instanceof Error) message.error(`加载失败: ${e.message}`);
      setLoadError(true);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    void loadData();
    return () => {
      requestIdRef.current += 1;
    };
  }, [loadData]);

  useEffect(() => {
    const ids = new Set<number>();
    for (const item of data) {
      if (item.dept_id != null) ids.add(item.dept_id);
    }
    const missing = [...ids].filter((id) => !deptNames[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.all(
      missing.map(async (id) => {
        try {
          return { id, dept: await getOne<DeptItem>("departments", id) };
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      const next: Record<number, { name: string; status: string }> = {};
      for (const result of results) {
        if (result) {
          next[result.id] = {
            name: result.dept.name,
            status: result.dept.status || "enabled",
          };
        }
      }
      setDeptNames((prev) => ({ ...prev, ...next }));
    });
    return () => {
      cancelled = true;
    };
  }, [data, deptNames]);

  useEffect(() => {
    if (!deptId) return;
    const id = Number(deptId);
    const dept = deptNames[id];
    if (!dept) return;
    setSelectedDept((prev) => {
      if (prev[0]?.key !== deptId) return prev;
      const next: LazyPickerOption = {
        key: deptId,
        label: dept.name || `#${id}`,
        disabled: dept.status === "disabled",
        sublabel: dept.status === "disabled" ? "已停用" : undefined,
      };
      if (
        prev[0].label === next.label &&
        prev[0].sublabel === next.sublabel &&
        prev[0].disabled === next.disabled
      ) {
        return prev;
      }
      return [next];
    });
  }, [deptNames, deptId]);

  const deptOptions = deptSource.items.map((dept) => ({
    key: String(dept.id),
    label: dept.name || `#${dept.id}`,
    disabled: dept.status === "disabled",
    sublabel: dept.status === "disabled" ? "已停用" : undefined,
  }));

  const handleToggleDept = (key: string, option: LazyPickerOption) => {
    const next = deptId === key ? "" : key;
    setDeptId(next);
    setSelectedDept(next ? [option] : []);
  };

  const openAdd = () => {
    deptSource.setSearch("");
    setEditing(null);
    setName("");
    setDesc("");
    setDeptId("");
    setSelectedDept([]);
    setSortOrder(0);
    formErrors.clearErrors();
    setModalOpen(true);
  };

  const openEdit = (record: PositionItem) => {
    deptSource.setSearch("");
    setEditing(record);
    setName(record.name);
    setDesc(record.description || "");
    setDeptId(record.dept_id != null ? String(record.dept_id) : "");
    setSelectedDept(
      record.dept_id != null
        ? [
            {
              key: String(record.dept_id),
              label: deptNames[record.dept_id]?.name || "当前部门",
              disabled: deptNames[record.dept_id]?.status === "disabled",
              sublabel:
                deptNames[record.dept_id]?.status === "disabled"
                  ? "已停用"
                  : undefined,
            },
          ]
        : [],
    );
    setSortOrder(record.sort_order);
    formErrors.clearErrors();
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (submitting || submittingRef.current) return;
    const trimmedName = name.trim();
    const trimmedDesc = desc.trim();
    if (!trimmedName) {
      formErrors.setErrors({ name: "请输入岗位名称" });
      return;
    }
    formErrors.clearErrors();
    const payload = {
      name: trimmedName,
      description: trimmedDesc,
      dept_id: deptId ? Number(deptId) : null,
      sort_order: sortOrder,
    };
    setSubmitting(true);
    submittingRef.current = true;
    try {
      if (editing) {
        await update("positions", editing.id, payload);
        message.success("已更新");
      } else {
        await create("positions", payload);
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

  const handleDelete = async (record: PositionItem) => {
    if (deletingRef.current || deletingId !== null || loading) return;
    deletingRef.current = true;
    const ok = await confirm({
      title: `确定删除岗位「${record.name}」？`,
      content: "删除后不可恢复",
      okVariant: "destructive",
    });
    if (!ok) {
      deletingRef.current = false;
      return;
    }
    setDeletingId(record.id);
    try {
      await remove("positions", record.id);
      message.success("已删除");
      const nextTotal = Math.max(0, total - 1);
      const nextMaxPage = Math.max(0, Math.ceil(nextTotal / pageSize) - 1);
      if (page > nextMaxPage) setPage(nextMaxPage);
      else void loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeletingId(null);
      deletingRef.current = false;
    }
  };

  const columns: ColumnDef<PositionItem>[] = [
    {
      accessorKey: "name",
      header: "岗位名称",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <IdCard className="size-4 text-primary" />
          <span
            className="block max-w-[180px] truncate font-medium"
            title={row.original.name}
          >
            {row.original.name}
          </span>
        </div>
      ),
    },
    {
      id: "dept",
      header: "所属部门",
      cell: ({ row }) => {
        const id = row.original.dept_id;
        if (id == null) return <Badge variant="outline">不限部门</Badge>;
        const dept = deptNames[id];
        if (!dept)
          return (
            <Badge
              variant="outline"
              className="max-w-[160px] truncate"
              title={`#${id}`}
            >
              #{id}
            </Badge>
          );
        if (dept.status === "disabled")
          return (
            <Badge
              variant="destructive"
              className="max-w-[160px] truncate"
              title={`${dept.name}（停用）`}
            >
              {dept.name}（停用）
            </Badge>
          );
        return (
          <Badge
            variant="secondary"
            className="max-w-[160px] truncate"
            title={dept.name}
          >
            {dept.name}
          </Badge>
        );
      },
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
      accessorKey: "sort_order",
      header: "排序",
      cell: ({ row }) => (
        <Badge variant="outline">{row.original.sort_order}</Badge>
      ),
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex gap-2">
          {can("system:post:update") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openEdit(row.original)}
              disabled={deletingId !== null || loading}
            >
              <Pencil className="size-4" /> 编辑
            </Button>
          )}
          {can("system:post:delete") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(row.original)}
              disabled={deletingId !== null || loading}
            >
              {deletingId === row.original.id ? (
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">岗位管理</h2>
        {can("system:post:create") && (
          <Button onClick={openAdd} disabled={loading}>
            <Plus className="size-4" /> 新建岗位
          </Button>
        )}
      </div>
      {loadError && (
        <InlineError
          title="岗位列表加载失败"
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
        emptyMessage="暂无岗位，点击「新增岗位」创建"
      />

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
              <DialogTitle>{editing ? "编辑岗位" : "新建岗位"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <RequiredLabel htmlFor="position-name" required>
                  岗位名称
                </RequiredLabel>
                <Input
                  id="position-name"
                  placeholder="请输入岗位名称"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    formErrors.clearError("name");
                  }}
                  {...formErrors.fieldProps("name", "position-name")}
                />
              </div>
              {formErrors.errors.name && (
                <FormMessage
                  id="position-name-error"
                  error={formErrors.errors.name}
                />
              )}
              <div className="space-y-2">
                <Label htmlFor="position-description">描述</Label>
                <Input
                  id="position-description"
                  placeholder="请输入描述（选填）"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="position-department">所属部门</Label>
                <LazyOptionsPicker
                  placeholder="搜索并选择所属部门"
                  id="position-department"
                  options={deptOptions}
                  selectedOptions={selectedDept}
                  total={deptSource.total}
                  loading={deptSource.loading}
                  error={deptSource.error}
                  multiple={false}
                  search={deptSource.search}
                  onSearchChange={deptSource.setSearch}
                  onLoadMore={deptSource.loadMore}
                  onRetry={deptSource.reload}
                  onToggle={handleToggleDept}
                />
                {selectedDept.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-1"
                    onClick={() => {
                      setDeptId("");
                      setSelectedDept([]);
                    }}
                  >
                    设为不限部门
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="position-sort">排序</Label>
                <Input
                  type="number"
                  min={0}
                  id="position-sort"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value))}
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
