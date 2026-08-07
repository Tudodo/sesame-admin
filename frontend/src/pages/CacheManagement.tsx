import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { confirm } from "@/lib/confirm";
import { message } from "@/lib/message";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/services/api";
import type { ColumnDef } from "@tanstack/react-table";
import { Loader2, RefreshCw, Search, Trash2 } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";

interface CacheKeyItem {
  key: string;
  ttl: number;
  size: number;
  type: string;
}

interface CacheStats {
  total_keys: number;
  hits: number;
  misses: number;
  memory_used: string;
}

interface CacheInfo {
  keys: CacheKeyItem[];
  stats: CacheStats;
}

function cacheNamespace(key: string) {
  if (key.startsWith("loco-shared:dict_cache:")) return "字典缓存";
  if (key.startsWith("cache:")) return "Loco 缓存";
  return "其他";
}

export const CacheManagementPage: React.FC = () => {
  const [keys, setKeys] = useState<CacheKeyItem[]>([]);
  const [stats, setStats] = useState<CacheStats>({
    total_keys: 0,
    hits: 0,
    misses: 0,
    memory_used: "N/A",
  });
  const [searchKey, setSearchKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleteLoadingKey, setDeleteLoadingKey] = useState<string | null>(null);
  const [clearLoading, setClearLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<CacheInfo>("/api/cache");
      setStats(
        data?.stats || {
          total_keys: 0,
          hits: 0,
          misses: 0,
          memory_used: "N/A",
        },
      );
      setKeys(data?.keys || []);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "加载缓存失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async (key: string) => {
    const ok = await confirm({
      title: "删除缓存",
      content: `确定删除 ${key}？`,
      okVariant: "destructive",
    });
    if (!ok) return;
    setDeleteLoadingKey(key);
    try {
      await apiFetch(`/api/cache/${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      message.success("已删除");
      fetchData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleteLoadingKey(null);
    }
  };

  const handleClear = async () => {
    const ok = await confirm({
      title: "清空缓存",
      content: "确定清空所有缓存？会删除 Loco 缓存和字典缓存。",
      okVariant: "destructive",
    });
    if (!ok) return;
    setClearLoading(true);
    try {
      await apiFetch("/api/cache/clear", { method: "POST" });
      message.success("已清空");
      fetchData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "清空失败");
    } finally {
      setClearLoading(false);
    }
  };

  const filtered = searchKey
    ? keys.filter((k) => k.key.includes(searchKey))
    : keys;

  const columns: ColumnDef<CacheKeyItem>[] = [
    {
      accessorKey: "key",
      header: "Key",
      cell: ({ row }) => <code className="text-xs">{row.original.key}</code>,
    },
    {
      accessorKey: "namespace",
      header: "缓存类型",
      cell: ({ row }) => cacheNamespace(row.original.key),
    },
    { accessorKey: "type", header: "类型" },
    {
      accessorKey: "ttl",
      header: "TTL",
      cell: ({ row }) =>
        row.original.ttl === -1 ? "永久" : `${row.original.ttl}s`,
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label="删除缓存"
          disabled={deleteLoadingKey === row.original.key}
          onClick={() => handleDelete(row.original.key)}
        >
          {deleteLoadingKey === row.original.key ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4 text-destructive" />
          )}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">缓存管理</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">缓存键数</p>
            <p className="text-2xl font-bold">{stats.total_keys}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">命中次数</p>
            <p className="text-2xl font-bold">{stats.hits}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">未命中</p>
            <p className="text-2xl font-bold">{stats.misses}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <Input
          placeholder="搜索 Key"
          value={searchKey}
          onChange={(e) => setSearchKey(e.target.value)}
          className="max-w-[240px]"
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
          >
            <RefreshCw
              className={cn("size-4 mr-1", loading && "animate-spin")}
            />
            刷新
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={clearLoading}
            onClick={handleClear}
          >
            {clearLoading ? (
              <Loader2 className="size-4 mr-1 animate-spin" />
            ) : (
              <Trash2 className="size-4 mr-1" />
            )}
            清空全部
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        pageSize={50}
        emptyMessage="暂无缓存数据"
      />
    </div>
  );
};
