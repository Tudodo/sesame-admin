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
import { Textarea } from "@/components/ui/textarea";
import { confirm } from "@/lib/confirm";
import { message } from "@/lib/message";
import { cn } from "@/lib/utils";
import { create, getList, remove, update } from "@/services/api";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";

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
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SysConfigItem | null>(null);

  const [fName, setFName] = useState("");
  const [fKey, setFKey] = useState("");
  const [fValue, setFValue] = useState("");
  const [fType, setFType] = useState("N");
  const [fRemark, setFRemark] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getList<SysConfigItem>("sys-configs", {
        _start: 0,
        _end: 100,
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

  const openCreate = () => {
    setEditing(null);
    setFName("");
    setFKey("");
    setFValue("");
    setFType("N");
    setFRemark("");
    setModalOpen(true);
  };

  const openEdit = (r: SysConfigItem) => {
    setEditing(r);
    setFName(r.config_name);
    setFKey(r.config_key);
    setFValue(r.config_value);
    setFType(r.config_type);
    setFRemark(r.remark || "");
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!fName.trim() || !fKey.trim() || !fValue.trim()) {
      message.warning("请填写必填项");
      return;
    }
    const values = {
      config_name: fName,
      config_key: fKey,
      config_value: fValue,
      config_type: fType,
      remark: fRemark,
    };
    try {
      if (editing) {
        await update("sys-configs", editing.id, values);
        message.success("已更新");
      } else {
        await create("sys-configs", values);
        message.success("已创建");
      }
      setModalOpen(false);
      loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  const handleDelete = async (r: SysConfigItem) => {
    const ok = await confirm({
      title: "删除参数",
      content: `确定删除 ${r.config_name}？`,
      okVariant: "destructive",
    });
    if (!ok) return;
    try {
      await remove("sys-configs", r.id);
      message.success("已删除");
      loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const columns: ColumnDef<SysConfigItem>[] = [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "config_name", header: "参数名称" },
    {
      accessorKey: "config_key",
      header: "参数键名",
      cell: ({ row }) => (
        <code className="text-xs">{row.original.config_key}</code>
      ),
    },
    {
      accessorKey: "config_value",
      header: "参数值",
      cell: ({ row }) => (
        <span className="truncate max-w-[180px] inline-block">
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
      cell: ({ row }) => row.original.remark || "-",
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEdit(row.original)}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDelete(row.original)}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">系统参数</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw
              className={cn("size-4 mr-1", loading && "animate-spin")}
            />
            刷新
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4 mr-1" />
            新增
          </Button>
        </div>
      </div>

      <DataTable columns={columns} data={data} pageSize={20} />

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑参数" : "新增参数"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>参数名称 *</Label>
              <Input value={fName} onChange={(e) => setFName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>参数键名 *</Label>
              <Input value={fKey} onChange={(e) => setFKey(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>参数值 *</Label>
              <Input
                value={fValue}
                onChange={(e) => setFValue(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>系统内置</Label>
              <Select value={fType} onValueChange={setFType}>
                <SelectTrigger>
                  <SelectValue placeholder="选择" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Y">是</SelectItem>
                  <SelectItem value="N">否</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>备注</Label>
              <Textarea
                value={fRemark}
                onChange={(e) => setFRemark(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
