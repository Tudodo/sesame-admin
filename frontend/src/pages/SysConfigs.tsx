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
import { message } from "@/lib/message";
import { cn } from "@/lib/utils";
import { create, getList, remove, update } from "@/services/api";
import { can } from "@/services/permission";
import type { ColumnDef } from "@tanstack/react-table";
import { Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

interface SysConfigItem {
  id: number;
  config_name: string;
  config_key: string;
  config_value: string;
  config_type: string;
  remark: string | null;
}

export const SysConfigsPage: React.FC = () => {
  const [data, setData] = useState<SysConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SysConfigItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState<number | null>(null);

  const [fName, setFName] = useState("");
  const [fKey, setFKey] = useState("");
  const [fValue, setFValue] = useState("");
  const [fType, setFType] = useState("N");
  const [fRemark, setFRemark] = useState("");
  const formErrors = useFieldErrors();
  const requestIdRef = useRef(0);
  const savingRef = useRef(false);
  const deleteRef = useRef(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    const requestId = ++requestIdRef.current;
    try {
      const res = await getList<SysConfigItem>("sys-configs", {
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
    loadData();
    return () => {
      requestIdRef.current += 1;
    };
  }, [loadData]);

  const openCreate = () => {
    setEditing(null);
    setFName("");
    setFKey("");
    setFValue("");
    setFType("N");
    setFRemark("");
    formErrors.clearErrors();
    setModalOpen(true);
  };

  const openEdit = (r: SysConfigItem) => {
    setEditing(r);
    setFName(r.config_name);
    setFKey(r.config_key);
    setFValue(r.config_value);
    setFType(r.config_type);
    setFRemark(r.remark || "");
    formErrors.clearErrors();
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (saving || savingRef.current) return;
    const nextErrors: Record<string, string> = {};
    if (!fName.trim()) nextErrors.name = "请输入参数名称";
    if (!fKey.trim()) nextErrors.key = "请输入参数键名";
    if (!fValue.trim()) nextErrors.value = "请输入参数值";
    if (Object.keys(nextErrors).length > 0) {
      formErrors.setErrors(nextErrors);
      return;
    }
    formErrors.clearErrors();
    const trimmedName = fName.trim();
    const trimmedKey = fKey.trim();
    const trimmedValue = fValue.trim();
    const values = {
      config_name: trimmedName,
      config_key: trimmedKey,
      config_value: trimmedValue,
      config_type: fType,
      remark: fRemark.trim(),
    };
    setSaving(true);
    savingRef.current = true;
    try {
      if (editing) {
        await update("sys-configs", editing.id, values);
        message.success("已更新");
      } else {
        await create("sys-configs", values);
        message.success("已创建");
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

  const handleDelete = async (r: SysConfigItem) => {
    if (deleteRef.current || deleteLoadingId !== null || loading) return;
    deleteRef.current = true;
    const ok = await confirm({
      title: `确定删除参数「${r.config_name}」？`,
      content: "删除后不可恢复。",
      okVariant: "destructive",
    });
    if (!ok) {
      deleteRef.current = false;
      return;
    }
    setDeleteLoadingId(r.id);
    try {
      await remove("sys-configs", r.id);
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

  const columns: ColumnDef<SysConfigItem>[] = [
    { accessorKey: "id", header: "ID" },
    {
      accessorKey: "config_name",
      header: "参数名称",
      cell: ({ row }) => (
        <span
          className="block max-w-[180px] truncate"
          title={row.original.config_name}
        >
          {row.original.config_name}
        </span>
      ),
    },
    {
      accessorKey: "config_key",
      header: "参数键名",
      cell: ({ row }) => (
        <code
          className="block max-w-[220px] break-all text-xs"
          title={row.original.config_key}
        >
          {row.original.config_key}
        </code>
      ),
    },
    {
      accessorKey: "config_value",
      header: "参数值",
      cell: ({ row }) => (
        <span
          className="truncate max-w-[180px] inline-block"
          title={row.original.config_value}
        >
          {row.original.config_value}
        </span>
      ),
    },
    {
      accessorKey: "config_type",
      header: "系统内置",
      cell: ({ row }) => (
        <Badge
          variant={row.original.config_type === "Y" ? "default" : "secondary"}
        >
          {row.original.config_type === "Y" ? "是" : "否"}
        </Badge>
      ),
    },
    {
      accessorKey: "remark",
      header: "备注",
      cell: ({ row }) => (
        <span
          className="block max-w-[220px] truncate"
          title={row.original.remark ?? undefined}
        >
          {row.original.remark || "-"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex gap-1">
          {can("system:config:update") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEdit(row.original)}
                  disabled={deleteLoadingId !== null || loading}
                  aria-label={`编辑参数 ${row.original.config_name}`}
                >
                  <Pencil className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>编辑参数</TooltipContent>
            </Tooltip>
          )}
          {can("system:config:delete") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(row.original)}
                  disabled={deleteLoadingId !== null || loading}
                  aria-label={`删除参数 ${row.original.config_name}`}
                >
                  {deleteLoadingId === row.original.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4 text-destructive" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>删除参数</TooltipContent>
            </Tooltip>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">系统参数</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadData()}>
            <RefreshCw
              className={cn("size-4 mr-1", loading && "animate-spin")}
            />
            刷新
          </Button>
          {can("system:config:create") && (
            <Button size="sm" onClick={openCreate} disabled={loading}>
              <Plus className="size-4 mr-1" />
              新增
            </Button>
          )}
        </div>
      </div>

      {loadError && (
        <InlineError
          title="系统参数加载失败"
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
        emptyMessage="暂无系统配置，点击「新增配置」创建"
      />

      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          if (!open && saving) return;
          setModalOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSave();
            }}
          >
            <DialogHeader>
              <DialogTitle>{editing ? "编辑参数" : "新增参数"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <RequiredLabel htmlFor="config-name" required>
                  参数名称
                </RequiredLabel>
                <Input
                  id="config-name"
                  placeholder="请输入参数名称"
                  value={fName}
                  onChange={(e) => {
                    setFName(e.target.value);
                    formErrors.clearError("name");
                  }}
                  {...formErrors.fieldProps("name", "config-name")}
                />
              </div>
              {formErrors.errors.name && (
                <FormMessage
                  id="config-name-error"
                  error={formErrors.errors.name}
                />
              )}
              <div className="space-y-1">
                <RequiredLabel htmlFor="config-key" required>
                  参数键名
                </RequiredLabel>
                <Input
                  id="config-key"
                  placeholder="请输入参数键名"
                  value={fKey}
                  onChange={(e) => {
                    setFKey(e.target.value);
                    formErrors.clearError("key");
                  }}
                  {...formErrors.fieldProps("key", "config-key")}
                />
              </div>
              {formErrors.errors.key && (
                <FormMessage
                  id="config-key-error"
                  error={formErrors.errors.key}
                />
              )}
              <div className="space-y-1">
                <RequiredLabel htmlFor="config-value" required>
                  参数值
                </RequiredLabel>
                <Input
                  id="config-value"
                  placeholder="请输入参数值"
                  value={fValue}
                  onChange={(e) => {
                    setFValue(e.target.value);
                    formErrors.clearError("value");
                  }}
                  {...formErrors.fieldProps("value", "config-value")}
                />
              </div>
              {formErrors.errors.value && (
                <FormMessage
                  id="config-value-error"
                  error={formErrors.errors.value}
                />
              )}
              <div className="space-y-1">
                <Label htmlFor="config-builtin">系统内置</Label>
                <Select value={fType} onValueChange={setFType}>
                  <SelectTrigger id="config-builtin">
                    <SelectValue placeholder="选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Y">是</SelectItem>
                    <SelectItem value="N">否</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="config-remark">备注</Label>
                <TextareaWithCounter
                  id="config-remark"
                  placeholder="请输入备注（选填）"
                  value={fRemark}
                  maxLength={500}
                  onChange={(e) => setFRemark(e.target.value)}
                  rows={2}
                />
              </div>
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
