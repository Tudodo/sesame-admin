import { InlineError } from "@/components/InlineError";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { confirm } from "@/lib/confirm";
import { message } from "@/lib/message";
import { cn } from "@/lib/utils";
import { apiFetch, getListWithMeta } from "@/services/api";
import { can } from "@/services/permission";
import type { ColumnDef } from "@tanstack/react-table";
import { Loader2, RefreshCw, Search, Trash2 } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

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
  truncated?: boolean;
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
    truncated: false,
  });
  const [searchKey, setSearchKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [deleteLoadingKey, setDeleteLoadingKey] = useState<string | null>(null);
  const [clearLoading, setClearLoading] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const cacheBusy = deleteLoadingKey !== null || clearLoading;
  const requestIdRef = useRef(0);
  const fetchingRef = useRef(false);
  const canDeleteCache = can("system:cache:delete");
  const cacheActionRef = useRef(false);

  const fetchData = useCallback(
    async (force = false) => {
      if (!force && fetchingRef.current) return;
      fetchingRef.current = true;
      setLoading(true);
      const requestId = ++requestIdRef.current;
      try {
        const result = await getListWithMeta<
          CacheKeyItem,
          { stats: CacheStats }
        >("cache", {
          _start: page * pageSize,
          _end: (page + 1) * pageSize,
          search: searchKey,
        });
        if (requestId !== requestIdRef.current) return;
        setStatsLoaded(true);
        setStats(
          result.meta.stats || {
            total_keys: 0,
            hits: 0,
            misses: 0,
            memory_used: "N/A",
            truncated: false,
          },
        );
        if (result.data.length === 0 && page > 0) {
          // 先保留旧列表和总数，避免 DataTable 在回退页加载前误判越界并跳到第一页。
          setPage(page - 1);
          return;
        }
        setKeys(result.data);
        setTotal(result.total);
        setLoadError(false);
      } catch (e: unknown) {
        if (requestId !== requestIdRef.current) return;
        message.error(e instanceof Error ? e.message : "加载缓存失败");
        setLoadError(true);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          fetchingRef.current = false;
        }
      }
    },
    [page, pageSize, searchKey],
  );

  const refreshNow = useCallback(() => void fetchData(true), [fetchData]);

  useEffect(() => {
    void fetchData(true);
    return () => {
      requestIdRef.current += 1;
      fetchingRef.current = false;
    };
  }, [fetchData]);

  const handleDelete = async (key: string) => {
    if (cacheBusy || loading) return;
    if (cacheActionRef.current) return;
    cacheActionRef.current = true;
    const ok = await confirm({
      title: `确定删除缓存「${key}」？`,
      content: "删除后不可恢复。",
      okVariant: "destructive",
    });
    if (!ok) {
      cacheActionRef.current = false;
      return;
    }
    setDeleteLoadingKey(key);
    try {
      await apiFetch(`/api/cache/${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      message.success("已删除");
      refreshNow();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleteLoadingKey(null);
      cacheActionRef.current = false;
    }
  };

  const handleClear = async () => {
    if (cacheBusy || loading) return;
    if (cacheActionRef.current) return;
    cacheActionRef.current = true;
    const ok = await confirm({
      title: "清空缓存",
      content: "确定清空所有缓存？清空后不可恢复，将删除 Loco 缓存和字典缓存。",
      okVariant: "destructive",
    });
    if (!ok) {
      cacheActionRef.current = false;
      return;
    }
    setClearLoading(true);
    try {
      await apiFetch("/api/cache/clear", { method: "POST" });
      message.success("已清空");
      refreshNow();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "清空失败");
    } finally {
      setClearLoading(false);
      cacheActionRef.current = false;
    }
  };

  const columns: ColumnDef<CacheKeyItem>[] = [
    {
      accessorKey: "key",
      header: "Key",
      cell: ({ row }) => (
        <code
          className="block max-w-[360px] break-all text-xs"
          title={row.original.key}
        >
          {row.original.key}
        </code>
      ),
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
      cell: ({ row }) =>
        canDeleteCache ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`删除缓存 ${row.original.key}`}
                disabled={cacheBusy || loading}
                onClick={() => handleDelete(row.original.key)}
              >
                {deleteLoadingKey === row.original.key ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4 text-destructive" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>删除缓存</TooltipContent>
          </Tooltip>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">缓存管理</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">缓存键数</p>
            <p className="text-2xl font-bold">
              {statsLoaded ? stats.total_keys : "-"}
            </p>
            {stats.truncated && (
              <p className="text-xs text-muted-foreground">仅统计前 1000 条</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">命中次数</p>
            <p className="text-2xl font-bold">
              {statsLoaded ? stats.hits : "-"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">未命中</p>
            <p className="text-2xl font-bold">
              {statsLoaded ? stats.misses : "-"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Input
            aria-label="搜索缓存 Key"
            placeholder="搜索 Key"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !cacheBusy && !loading) {
                setSearchKey(searchInput.trim());
                setPage(0);
              }
            }}
            disabled={cacheBusy || loading}
            className="max-w-[240px]"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchKey(searchInput.trim());
              setPage(0);
            }}
            disabled={cacheBusy || loading}
          >
            <Search className="size-4 mr-1" />
            搜索
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshNow}
            disabled={cacheBusy}
          >
            <RefreshCw
              className={cn("size-4 mr-1", loading && "animate-spin")}
            />
            刷新
          </Button>
          {canDeleteCache && (
            <Button
              variant="destructive"
              size="sm"
              disabled={cacheBusy || loading}
              onClick={handleClear}
            >
              {clearLoading ? (
                <Loader2 className="size-4 mr-1 animate-spin" />
              ) : (
                <Trash2 className="size-4 mr-1" />
              )}
              清空全部
            </Button>
          )}
        </div>
      </div>

      {loadError && (
        <InlineError
          title="缓存数据加载失败"
          description={"列表可能未更新，已保留原有数据。"}
          onRetry={refreshNow}
          loading={loading}
        />
      )}

      <DataTable
        columns={columns}
        data={keys}
        pageSize={pageSize}
        emptyMessage={searchKey ? "未找到匹配的缓存 Key" : "暂无缓存数据"}
        loading={loading}
        serverSide
        total={total}
        pageIndex={page}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPage(0);
          setPageSize(size);
        }}
      />
    </div>
  );
};
