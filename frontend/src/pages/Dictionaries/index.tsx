import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { confirm } from "@/lib/confirm";
import { message } from "@/lib/message";
import { create, getList, remove, update } from "@/services/api";
import { can } from "@/services/permission";
import type { ColumnDef } from "@tanstack/react-table";
import { BookOpen, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

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
  const [loading, setLoading] = useState(false);
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
  const [entryEditing, setEntryEditing] = useState<DictEntryItem | null>(null);
  const [entryAdding, setEntryAdding] = useState(false);
  const [entryLabel, setEntryLabel] = useState("");
  const [entryValue, setEntryValue] = useState("");
  const [entrySort, setEntrySort] = useState(0);
  const [entrySubmitting, setEntrySubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getList<DictItem>("dictionaries", {
        _start: 0,
        _end: 999,
      });
      setData(res.data);
    } catch (e: unknown) {
      // 非关键：列表加载失败时保留旧数据
      if (e instanceof Error) message.error(`加载失败: ${e.message}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openAdd = () => {
    setEditing(null);
    setName("");
    setCode("");
    setDesc("");
    setModalOpen(true);
  };

  const openEdit = (record: DictItem) => {
    setEditing(record);
    setName(record.name);
    setCode(record.code);
    setDesc(record.description || "");
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!name || !code) {
      message.error("请填写完整信息");
      return;
    }
    const payload = { name, code, description: desc };
    setSubmitting(true);
    try {
      if (editing) {
        await update("dictionaries", editing.id, payload);
        message.success("已更新");
      } else {
        await create("dictionaries", payload);
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

  const handleDelete = async (record: DictItem) => {
    const ok = await confirm({
      title: "确定删除？子项也会删除",
      okVariant: "destructive",
    });
    if (!ok) return;
    try {
      await remove("dictionaries", record.id);
      message.success("已删除");
      loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const loadEntries = useCallback(async (dict: DictItem) => {
    setEntryLoading(true);
    try {
      const res = await getList<DictEntryItem>("dictionary-entries", {
        _start: 0,
        _end: 999,
        dictionary_id: dict.id,
      });
      setEntries(res.data);
    } catch (e: unknown) {
      if (e instanceof Error) message.error(`加载字典项失败: ${e.message}`);
    }
    setEntryLoading(false);
  }, []);

  const openEntries = (record: DictItem) => {
    setEntryDict(record);
    setEntryEditing(null);
    setEntryAdding(false);
    setEntryLabel("");
    setEntryValue("");
    setEntrySort(0);
    setEntryModalOpen(true);
    loadEntries(record);
  };

  const openAddEntry = () => {
    setEntryEditing(null);
    setEntryAdding(true);
    setEntryLabel("");
    setEntryValue("");
    setEntrySort(entries.length + 1);
  };

  const openEditEntry = (record: DictEntryItem) => {
    setEntryEditing(record);
    setEntryAdding(false);
    setEntryLabel(record.label);
    setEntryValue(record.value);
    setEntrySort(record.sort_order);
  };

  const handleEntrySubmit = async () => {
    if (!entryDict || !entryLabel || !entryValue) {
      message.error("请填写完整信息");
      return;
    }
    const payload = {
      dictionary_id: entryDict.id,
      label: entryLabel,
      value: entryValue,
      sort_order: entrySort,
    };
    setEntrySubmitting(true);
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
      if (entryDict) loadEntries(entryDict);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setEntrySubmitting(false);
    }
  };

  const handleEntryDelete = async (record: DictEntryItem) => {
    const ok = await confirm({
      title: `确定删除"${record.label}"？`,
      okVariant: "destructive",
    });
    if (!ok) return;
    try {
      await remove("dictionary-entries", record.id);
      message.success("已删除");
      if (entryDict) loadEntries(entryDict);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const columns: ColumnDef<DictItem>[] = [
    {
      accessorKey: "name",
      header: "字典",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <BookOpen className="size-4 text-primary" />
          <span className="font-medium">{row.original.name}</span>
        </div>
      ),
    },
    {
      accessorKey: "code",
      header: "编码",
      cell: ({ row }) => (
        <code className="text-xs text-primary">{row.original.code}</code>
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
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => openEntries(r)}>
              <ChevronRight className="size-3.5" /> 字典项
            </Button>
            {can("system:dict:update") && (
              <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                <Pencil className="size-3.5" /> 编辑
              </Button>
            )}
            {can("system:dict:delete") && (
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
        <h2 className="text-lg font-semibold">字典管理</h2>
        {can("system:dict:create") && (
          <Button onClick={openAdd}>
            <Plus className="size-4" /> 新建字典
          </Button>
        )}
      </div>
      <DataTable columns={columns} data={data} pageSize={15} />

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "编辑字典" : "新建字典"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>名称</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>编码</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>描述</Label>
              <Textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
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

      {/* 字典项管理弹窗 */}
      <Dialog open={entryModalOpen} onOpenChange={setEntryModalOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>
              字典项 — {entryDict?.name}{" "}
              <code className="text-xs text-muted-foreground">
                {entryDict?.code}
              </code>
            </DialogTitle>
          </DialogHeader>

          {!entryAdding && entryEditing === null ? (
            /* 列表模式 */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  共 {entries.length} 项
                </span>
                {can("system:dict:create") && (
                  <Button size="sm" onClick={openAddEntry}>
                    <Plus className="size-4" /> 新增字典项
                  </Button>
                )}
              </div>
              {entryLoading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  加载中…
                </p>
              ) : entries.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  暂无字典项
                </p>
              ) : (
                <div className="max-h-[360px] overflow-y-auto space-y-1">
                  {entries.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center gap-3 rounded-md border px-3 py-2"
                    >
                      <span className="w-8 text-center text-xs text-muted-foreground">
                        {e.sort_order}
                      </span>
                      <div className="flex-1">
                        <span className="font-medium">{e.label}</span>
                        <code className="ml-2 text-xs text-muted-foreground">
                          {e.value}
                        </code>
                      </div>
                      {can("system:dict:update") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditEntry(e)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      )}
                      {can("system:dict:delete") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEntryDelete(e)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* 编辑/新增模式 */
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>标签</Label>
                <Input
                  value={entryLabel}
                  onChange={(e) => setEntryLabel(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>值</Label>
                <Input
                  value={entryValue}
                  onChange={(e) => setEntryValue(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>排序</Label>
                <Input
                  type="number"
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
              <Button onClick={handleEntrySubmit} disabled={entrySubmitting}>
                {entrySubmitting ? "提交中…" : "确定"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
