import { InlineError } from "@/components/InlineError";
import { DataTable } from "@/components/data-table";
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
import { TextareaWithCounter } from "@/components/ui/textarea-counter";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useFieldErrors } from "@/hooks/useFieldErrors";
import { confirm } from "@/lib/confirm";
import { message } from "@/lib/message";
import { create, getList, remove, update } from "@/services/api";
import { can } from "@/services/permission";
import type { ColumnDef } from "@tanstack/react-table";
import {
  BookOpen,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface DictEntryItem {
  id: number;
  label: string;
  value: string;
  sort_order: number;
}

interface DictItem {
  id: number;
  name: string;
  code: string;
  description: string | null;
}

export const DictionariesPage = () => {
  const [data, setData] = useState<DictItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DictItem | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [desc, setDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 字典项管理弹窗
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [entryDict, setEntryDict] = useState<DictItem | null>(null);
  const [entries, setEntries] = useState<DictEntryItem[]>([]);
  const [entryLoading, setEntryLoading] = useState(false);
  const [entryLoadError, setEntryLoadError] = useState(false);
  const [entryEditing, setEntryEditing] = useState<DictEntryItem | null>(null);
  const [entryAdding, setEntryAdding] = useState(false);
  const [entryLabel, setEntryLabel] = useState("");
  const [entryValue, setEntryValue] = useState("");
  const [entrySort, setEntrySort] = useState(0);
  const [entrySubmitting, setEntrySubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [entryDeletingId, setEntryDeletingId] = useState<number | null>(null);
  const dictFormErrors = useFieldErrors();
  const entryFormErrors = useFieldErrors();
  const entriesRequestIdRef = useRef(0);
  const entriesOpeningRef = useRef(false);
  const loadDataRequestIdRef = useRef(0);
  const submittingRef = useRef(false);
  const deletingRef = useRef(false);
  const entrySubmittingRef = useRef(false);
  const entryDeletingRef = useRef(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(15);
  const [total, setTotal] = useState(0);
  const [entryPage, setEntryPage] = useState(0);
  const [entryPageSize, setEntryPageSize] = useState(10);
  const [entryTotal, setEntryTotal] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    const requestId = ++loadDataRequestIdRef.current;
    try {
      const res = await getList<DictItem>("dictionaries", {
        _start: page * pageSize,
        _end: (page + 1) * pageSize,
      });
      if (requestId !== loadDataRequestIdRef.current) return;
      setData(res.data);
      setTotal(res.total);
      setLoadError(false);
    } catch (e: unknown) {
      // 非关键：列表加载失败时保留旧数据
      if (requestId !== loadDataRequestIdRef.current) return;
      if (e instanceof Error) message.error(`加载失败: ${e.message}`);
      setLoadError(true);
    } finally {
      if (requestId === loadDataRequestIdRef.current) setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    loadData();
    return () => {
      loadDataRequestIdRef.current += 1;
    };
  }, [loadData]);

  useEffect(() => {
    return () => {
      entriesRequestIdRef.current += 1;
      entriesOpeningRef.current = false;
    };
  }, []);

  const openAdd = () => {
    setEditing(null);
    setName("");
    setCode("");
    setDesc("");
    dictFormErrors.clearErrors();
    setModalOpen(true);
  };

  const openEdit = (record: DictItem) => {
    setEditing(record);
    setName(record.name);
    setCode(record.code);
    setDesc(record.description || "");
    dictFormErrors.clearErrors();
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (submitting || submittingRef.current) return;
    const nextErrors: Record<string, string> = {};
    const trimmedName = name.trim();
    const trimmedCode = code.trim();
    if (!trimmedName) nextErrors.name = "请输入字典名称";
    if (!trimmedCode) nextErrors.code = "请输入字典编码";
    if (Object.keys(nextErrors).length > 0) {
      dictFormErrors.setErrors(nextErrors);
      return;
    }
    dictFormErrors.clearErrors();
    const payload = {
      name: trimmedName,
      code: trimmedCode,
      description: desc.trim(),
    };
    setSubmitting(true);
    submittingRef.current = true;
    try {
      if (editing) {
        await update("dictionaries", editing.id, payload);
        message.success("已更新");
      } else {
        await create("dictionaries", payload);
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

  const handleDelete = async (record: DictItem) => {
    if (deletingRef.current || deletingId !== null || loading) return;
    deletingRef.current = true;
    const ok = await confirm({
      title: `确定删除字典「${record.name}」？`,
      content: "字典项也会一起删除，删除后不可恢复",
      okVariant: "destructive",
    });
    if (!ok) {
      deletingRef.current = false;
      return;
    }
    setDeletingId(record.id);
    try {
      await remove("dictionaries", record.id);
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

  const loadEntries = useCallback(
    async (
      dict: DictItem,
      targetPage = 0,
      targetPageSize = 10,
      force = false,
    ) => {
      if (entriesOpeningRef.current && !force) return;
      entriesOpeningRef.current = true;
      setEntryLoading(true);
      setEntryLoadError(false);
      const requestId = ++entriesRequestIdRef.current;
      try {
        const res = await getList<DictEntryItem>("dictionary-entries", {
          _start: targetPage * targetPageSize,
          _end: (targetPage + 1) * targetPageSize,
          dictionary_id: dict.id,
        });
        if (requestId !== entriesRequestIdRef.current) return;
        setEntryPage(targetPage);
        setEntryPageSize(targetPageSize);
        setEntries(res.data);
        setEntryTotal(res.total);
      } catch (e: unknown) {
        if (requestId !== entriesRequestIdRef.current) return;
        if (e instanceof Error) message.error(`加载字典项失败: ${e.message}`);
        setEntryLoadError(true);
      } finally {
        if (requestId === entriesRequestIdRef.current) setEntryLoading(false);
        if (requestId === entriesRequestIdRef.current) {
          entriesOpeningRef.current = false;
        }
      }
    },
    [],
  );

  const openEntries = (record: DictItem) => {
    setEntryDict(record);
    setEntries([]);
    setEntryEditing(null);
    setEntryAdding(false);
    setEntryLabel("");
    setEntryValue("");
    setEntrySort(0);
    setEntryModalOpen(true);
    entryFormErrors.clearErrors();
    setEntryPage(0);
    setEntryPageSize(10);
    setEntryTotal(0);
    void loadEntries(record, 0, 10, true);
  };

  const openAddEntry = () => {
    setEntryEditing(null);
    setEntryAdding(true);
    setEntryLabel("");
    setEntryValue("");
    const maxLoadedSort = entries.reduce(
      (max, item) => Math.max(max, item.sort_order),
      0,
    );
    setEntrySort(Math.max(entryTotal + 1, maxLoadedSort + 1));
    entryFormErrors.clearErrors();
  };

  const openEditEntry = (record: DictEntryItem) => {
    setEntryEditing(record);
    setEntryAdding(false);
    setEntryLabel(record.label);
    setEntryValue(record.value);
    setEntrySort(record.sort_order);
    entryFormErrors.clearErrors();
  };

  const handleEntrySubmit = async () => {
    if (
      entrySubmittingRef.current ||
      entrySubmitting ||
      entryDeletingId !== null
    )
      return;
    if (!entryDict) return;
    if (entryLoading || entryLoadError) {
      message.error("字典项列表未加载完成，请重试后再提交");
      return;
    }
    const nextErrors: Record<string, string> = {};
    const trimmedLabel = entryLabel.trim();
    const trimmedValue = entryValue.trim();
    if (!trimmedLabel) nextErrors.label = "请输入标签";
    if (!trimmedValue) nextErrors.value = "请输入值";
    if (Object.keys(nextErrors).length > 0) {
      entryFormErrors.setErrors(nextErrors);
      return;
    }
    entryFormErrors.clearErrors();
    const payload = {
      dictionary_id: entryDict.id,
      label: trimmedLabel,
      value: trimmedValue,
      sort_order: entrySort,
    };
    setEntrySubmitting(true);
    entrySubmittingRef.current = true;
    try {
      if (entryEditing) {
        await update("dictionary-entries", entryEditing.id, payload);
        message.success("已更新");
      } else {
        await create("dictionary-entries", payload);
        message.success("已创建");
      }
      setEntryEditing(null);
      setEntryLabel("");
      setEntryValue("");
      setEntryAdding(false);
      if (entryDict) {
        // 新增项按 sort_order 升序排在末尾，回到最后一页便于立即看到结果
        if (entryAdding) {
          const nextTotal = entryTotal + 1;
          const nextPage = Math.max(
            0,
            Math.ceil(nextTotal / entryPageSize) - 1,
          );
          void loadEntries(entryDict, nextPage, entryPageSize, true);
        } else {
          void loadEntries(entryDict, entryPage, entryPageSize, true);
        }
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setEntrySubmitting(false);
      entrySubmittingRef.current = false;
    }
  };

  const handleEntryDelete = async (record: DictEntryItem) => {
    if (
      entryDeletingRef.current ||
      entryDeletingId !== null ||
      entrySubmitting ||
      entryLoading
    )
      return;
    entryDeletingRef.current = true;
    const ok = await confirm({
      title: `确定删除字典项「${record.label}」？`,
      content: "删除后不可恢复",
      okVariant: "destructive",
    });
    if (!ok) {
      entryDeletingRef.current = false;
      return;
    }
    setEntryDeletingId(record.id);
    try {
      await remove("dictionary-entries", record.id);
      message.success("已删除");
      const nextTotal = Math.max(0, entryTotal - 1);
      const nextMaxPage = Math.max(0, Math.ceil(nextTotal / entryPageSize) - 1);
      const nextPage = Math.min(entryPage, nextMaxPage);
      if (nextPage !== entryPage) setEntryPage(nextPage);
      if (entryDict) loadEntries(entryDict, nextPage, entryPageSize, true);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setEntryDeletingId(null);
      entryDeletingRef.current = false;
    }
  };

  const columns: ColumnDef<DictItem>[] = [
    {
      accessorKey: "name",
      header: "字典",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <BookOpen className="size-4 text-primary" />
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
      accessorKey: "code",
      header: "编码",
      cell: ({ row }) => (
        <code
          className="block max-w-[220px] break-all text-xs text-primary"
          title={row.original.code}
        >
          {row.original.code}
        </code>
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
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={deletingId !== null || loading}
              onClick={() => openEntries(r)}
            >
              <ChevronRight className="size-4" /> 字典项
            </Button>
            {can("system:dict:update") && (
              <Button
                variant="ghost"
                size="sm"
                disabled={deletingId !== null || loading}
                onClick={() => openEdit(r)}
              >
                <Pencil className="size-4" /> 编辑
              </Button>
            )}
            {can("system:dict:delete") && (
              <Button
                variant="ghost"
                size="sm"
                disabled={deletingId !== null || loading}
                onClick={() => handleDelete(r)}
              >
                {deletingId === r.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                {deletingId === r.id ? "删除中…" : "删除"}
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  const entryColumns: ColumnDef<DictEntryItem>[] = [
    {
      accessorKey: "sort_order",
      header: "排序",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.sort_order}
        </span>
      ),
    },
    {
      accessorKey: "label",
      header: "名称",
      cell: ({ row }) => (
        <span
          className="block max-w-[180px] truncate font-medium"
          title={row.original.label}
        >
          {row.original.label}
        </span>
      ),
    },
    {
      accessorKey: "value",
      header: "值",
      cell: ({ row }) => (
        <code
          className="block max-w-[220px] break-all text-xs text-muted-foreground"
          title={row.original.value}
        >
          {row.original.value}
        </code>
      ),
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="flex justify-end gap-1">
            {can("system:dict:update") && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={
                      entryDeletingId !== null ||
                      entrySubmitting ||
                      entryLoading
                    }
                    onClick={() => openEditEntry(item)}
                    aria-label={`编辑 ${item.label}`}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>编辑</TooltipContent>
              </Tooltip>
            )}
            {can("system:dict:delete") && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={
                      entryDeletingId !== null ||
                      entrySubmitting ||
                      entryLoading
                    }
                    onClick={() => handleEntryDelete(item)}
                    aria-label={`删除 ${item.label}`}
                  >
                    {entryDeletingId === item.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4 text-destructive" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>删除</TooltipContent>
              </Tooltip>
            )}
          </div>
        );
      },
    },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">字典管理</h2>
        {can("system:dict:create") && (
          <Button onClick={openAdd} disabled={loading}>
            <Plus className="size-4" /> 新建字典
          </Button>
        )}
      </div>
      {loadError && (
        <InlineError
          title="字典列表加载失败"
          description={"列表可能未更新，已保留原有数据。"}
          onRetry={() => void loadData()}
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
              <DialogTitle>{editing ? "编辑字典" : "新建字典"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <RequiredLabel htmlFor="dict-name" required>
                  名称
                </RequiredLabel>
                <Input
                  id="dict-name"
                  placeholder="请输入字典名称"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    dictFormErrors.clearError("name");
                  }}
                  {...dictFormErrors.fieldProps("name", "dict-name")}
                />
              </div>
              {dictFormErrors.errors.name && (
                <FormMessage
                  id="dict-name-error"
                  error={dictFormErrors.errors.name}
                />
              )}
              <div className="space-y-2">
                <RequiredLabel htmlFor="dict-code" required>
                  编码
                </RequiredLabel>
                <Input
                  id="dict-code"
                  placeholder="请输入字典编码"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    dictFormErrors.clearError("code");
                  }}
                  {...dictFormErrors.fieldProps("code", "dict-code")}
                />
              </div>
              {dictFormErrors.errors.code && (
                <FormMessage
                  id="dict-code-error"
                  error={dictFormErrors.errors.code}
                />
              )}
              <div className="space-y-2">
                <Label htmlFor="dict-desc">描述</Label>
                <TextareaWithCounter
                  id="dict-desc"
                  placeholder="请输入描述（选填）"
                  value={desc}
                  maxLength={500}
                  onChange={(e) => setDesc(e.target.value)}
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

      {/* 字典项管理弹窗 */}
      <Dialog
        open={entryModalOpen}
        onOpenChange={(open) => {
          if (!open && entrySubmitting) return;
          if (!open) {
            entriesRequestIdRef.current += 1;
            entriesOpeningRef.current = false;
            setEntryDict(null);
            setEntries([]);
            setEntryLoadError(false);
            setEntryLoading(false);
          }
          setEntryModalOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleEntrySubmit();
            }}
          >
            <DialogHeader>
              <DialogTitle className="break-words">
                字典项 — {entryDict?.name}{" "}
                <code className="text-xs text-muted-foreground">
                  {entryDict?.code}
                </code>
              </DialogTitle>
            </DialogHeader>

            {!entryAdding && entryEditing === null ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">
                    共 {entryTotal} 项
                  </span>
                  {can("system:dict:create") && (
                    <Button
                      size="sm"
                      onClick={openAddEntry}
                      disabled={entryLoading || entryLoadError}
                    >
                      <Plus className="size-4" /> 新增字典项
                    </Button>
                  )}
                </div>
                {entryLoadError ? (
                  <InlineError
                    title="字典项加载失败"
                    description="请重试后再管理字典项。"
                    onRetry={() =>
                      entryDict &&
                      loadEntries(entryDict, entryPage, entryPageSize)
                    }
                    loading={entryLoading}
                  />
                ) : (
                  <DataTable
                    columns={entryColumns}
                    data={entries}
                    pageSize={entryPageSize}
                    serverSide
                    total={entryTotal}
                    pageIndex={entryPage}
                    onPageChange={(next) => {
                      setEntryPage(next);
                      if (entryDict)
                        void loadEntries(entryDict, next, entryPageSize, true);
                    }}
                    onPageSizeChange={(size) => {
                      setEntryPage(0);
                      if (entryDict) void loadEntries(entryDict, 0, size, true);
                    }}
                    loading={entryLoading}
                    emptyMessage="暂无字典项"
                  />
                )}
              </div>
            ) : (
              /* 编辑/新增模式 */
              <div className="space-y-4">
                <div className="space-y-2">
                  <RequiredLabel htmlFor="dict-entry-label" required>
                    标签
                  </RequiredLabel>
                  <Input
                    id="dict-entry-label"
                    placeholder="请输入标签"
                    value={entryLabel}
                    onChange={(e) => {
                      setEntryLabel(e.target.value);
                      entryFormErrors.clearError("label");
                    }}
                    {...entryFormErrors.fieldProps("label", "dict-entry-label")}
                  />
                </div>
                {entryFormErrors.errors.label && (
                  <FormMessage
                    id="dict-entry-label-error"
                    error={entryFormErrors.errors.label}
                  />
                )}
                <div className="space-y-2">
                  <RequiredLabel htmlFor="dict-entry-value" required>
                    值
                  </RequiredLabel>
                  <Input
                    id="dict-entry-value"
                    placeholder="请输入值"
                    value={entryValue}
                    onChange={(e) => {
                      setEntryValue(e.target.value);
                      entryFormErrors.clearError("value");
                    }}
                    {...entryFormErrors.fieldProps("value", "dict-entry-value")}
                  />
                </div>
                {entryFormErrors.errors.value && (
                  <FormMessage
                    id="dict-entry-value-error"
                    error={entryFormErrors.errors.value}
                  />
                )}
                <div className="space-y-2">
                  <Label htmlFor="dict-entry-sort">排序</Label>
                  <Input
                    type="number"
                    min={0}
                    id="dict-entry-sort"
                    value={entrySort}
                    onChange={(e) => setEntrySort(Number(e.target.value))}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              {(entryAdding || entryEditing !== null) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEntryEditing(null);
                    setEntryAdding(false);
                  }}
                >
                  返回列表
                </Button>
              )}
              {(entryAdding || entryEditing !== null) && (
                <Button
                  type="submit"
                  disabled={
                    entrySubmitting ||
                    entryDeletingId !== null ||
                    entryLoading ||
                    entryLoadError
                  }
                >
                  {entrySubmitting ? "提交中…" : "确定"}
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
