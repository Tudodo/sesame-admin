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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { confirm } from "@/lib/confirm";
import { message } from "@/lib/message";
import { create, getList, remove, update } from "@/services/api";
import type { ColumnDef } from "@tanstack/react-table";
import { IdCard, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface PositionItem {
  id: number;
  name: string;
  description: string | null;
  dept_id: number | null;
  sort_order: number;
}

export const PositionsPage = () => {
  const [data, setData] = useState<PositionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PositionItem | null>(null);
  const [depts, setDepts] = useState<{ id: number; name: string }[]>([]);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [deptId, setDeptId] = useState<string>("");
  const [sortOrder, setSortOrder] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getList<PositionItem>("positions", {
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

  const loadDepts = async () => {
    const res = await getList<{ id: number; name: string }>("departments", {
      _start: 0,
      _end: 999,
    });
    setDepts(res.data);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    loadData();
    loadDepts();
  }, [loadData]);

  const openAdd = () => {
    setEditing(null);
    setName("");
    setDesc("");
    setDeptId("");
    setSortOrder(0);
    setModalOpen(true);
  };

  const openEdit = (record: PositionItem) => {
    setEditing(record);
    setName(record.name);
    setDesc(record.description || "");
    setDeptId(record.dept_id != null ? String(record.dept_id) : "");
    setSortOrder(record.sort_order);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!name) {
      message.error("请填写岗位名称");
      return;
    }
    const payload = {
      name,
      description: desc,
      dept_id: deptId ? Number(deptId) : null,
      sort_order: sortOrder,
    };
    setSubmitting(true);
    try {
      if (editing) {
        await update("positions", editing.id, payload);
        message.success("已更新");
      } else {
        await create("positions", payload);
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

  const handleDelete = async (record: PositionItem) => {
    const ok = await confirm({ title: "确定删除？", okVariant: "destructive" });
    if (!ok) return;
    try {
      await remove("positions", record.id);
      message.success("已删除");
      loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const columns: ColumnDef<PositionItem>[] = [
    {
      accessorKey: "name",
      header: "岗位名称",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <IdCard className="size-4 text-primary" />
          <span className="font-medium">{row.original.name}</span>
        </div>
      ),
    },
    {
      id: "dept",
      header: "所属部门",
      cell: ({ row }) => {
        const d = depts.find((x) => x.id === row.original.dept_id);
        if (!d) return <Badge variant="outline">不限部门</Badge>;
        return <Badge variant="secondary">{d.name}</Badge>;
      },
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">岗位管理</h2>
        <Button onClick={openAdd}>
          <Plus className="size-4" /> 新建岗位
        </Button>
      </div>
      <DataTable columns={columns} data={data} pageSize={20} />

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "编辑岗位" : "新建岗位"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>岗位名称</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>描述</Label>
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>所属部门</Label>
              <Select value={deptId} onValueChange={setDeptId}>
                <SelectTrigger>
                  <SelectValue placeholder="不限部门" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">不限部门</SelectItem>
                  {depts.map((d) => (
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
