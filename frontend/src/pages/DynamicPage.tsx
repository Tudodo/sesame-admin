import { InlineError } from "@/components/InlineError";
import { DataTable } from "@/components/data-table";
import { Card, CardContent } from "@/components/ui/card";
import { message } from "@/lib/message";
import { getListWithMeta, isSafeApiPath, request } from "@/services/api";
import type { ColumnDef } from "@tanstack/react-table";
import { Loader2 } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";

interface PageConfig {
  id: number;
  name: string;
  code: string;
  page_type: string;
  config: Record<string, unknown>;
  description: string;
}

interface DynamicPageProps {
  pageCode: string;
}

function normalizePageSize(value: unknown, fallback = 10): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.max(1, Math.min(Math.floor(number), 500));
}

interface DynamicPageConfig {
  endpoint?: string;
  columns?: { dataIndex: string; title: string }[];
  rowKey?: string;
  pageSize?: number | string;
}

export const DynamicPage: React.FC<DynamicPageProps> = ({ pageCode }) => {
  const [config, setConfig] = useState<PageConfig | null>(null);
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [dataPage, setDataPage] = useState(0);
  const [dataPageSize, setDataPageSize] = useState(10);
  const [dataTotal, setDataTotal] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [dataRetryCount, setDataRetryCount] = useState(0);
  const configRequestIdRef = useRef(0);
  const dataRequestIdRef = useRef(0);

  useEffect(() => {
    setLoading(true);
    setError(false);
    setConfig(null);
    setData([]);
    setDataLoading(false);
    const requestId = ++configRequestIdRef.current;
    request(`/page-configs/${pageCode}`)
      .then((c) => {
        if (requestId !== configRequestIdRef.current) return;
        setConfig(c as PageConfig);
        setError(false);
        setDataError(null);
        setDataLoading(true);
        const dynamicConfig = (c as PageConfig).config ?? {};
        setDataPage(0);
        setDataPageSize(
          normalizePageSize((dynamicConfig as DynamicPageConfig).pageSize, 10),
        );
        setDataTotal(0);
      })
      .catch(() => {
        if (requestId !== configRequestIdRef.current) return;
        setConfig(null);
        setError(true);
      })
      .finally(() => {
        if (requestId === configRequestIdRef.current) setLoading(false);
      });
    return () => {
      if (requestId === configRequestIdRef.current) {
        configRequestIdRef.current += 1;
      }
    };
  }, [pageCode, retryCount]);

  useEffect(() => {
    if (!config) return;
    const { endpoint } = (config.config ?? {}) as DynamicPageConfig;
    const effectivePageSize = normalizePageSize(dataPageSize, 10);
    const requestId = ++dataRequestIdRef.current;
    if (typeof endpoint !== "string" || !endpoint) {
      setData([]);
      setDataError(null);
      setDataLoading(false);
      return;
    }
    // Guard against absolute / protocol-relative endpoints in page config:
    // getListWithMeta() prepends "/api" but still issues a cross-origin fetch
    // for absolute URLs, leaking the Bearer token to an external host. Only
    // allow same-origin relative paths.
    if (!endpoint.startsWith("/") || !isSafeApiPath(endpoint)) {
      setData([]);
      setDataError("页面配置的 endpoint 必须是相对路径，请先修正页面配置");
      setDataLoading(false);
      return;
    }
    setDataLoading(true);
    setDataError(null);
    getListWithMeta<Record<string, unknown>>(endpoint, {
      _start: dataPage * effectivePageSize,
      _end: (dataPage + 1) * effectivePageSize,
    })
      .then((res) => {
        if (requestId !== dataRequestIdRef.current) return;
        if (res.data.length === 0 && dataPage > 0) {
          setDataPage(dataPage - 1);
          return;
        }
        setData(res.data);
        setDataTotal(res.total);
      })
      .catch((e: unknown) => {
        if (requestId !== dataRequestIdRef.current) return;
        setData([]);
        setDataError(
          e instanceof Error ? e.message : "数据源暂时不可用，请重试",
        );
        message.error(e instanceof Error ? e.message : "加载数据失败");
      })
      .finally(() => {
        if (requestId === dataRequestIdRef.current) setDataLoading(false);
      });
    return () => {
      if (requestId === dataRequestIdRef.current) {
        dataRequestIdRef.current += 1;
      }
    };
  }, [config, dataPage, dataPageSize, dataRetryCount]);

  if (loading) {
    return (
      <div className="flex justify-center p-24">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <span className="sr-only">正在加载动态页面配置…</span>
      </div>
    );
  }

  if (!config) {
    return (
      <Card>
        <CardContent className="p-6">
          {error ? (
            <InlineError
              title="页面配置加载失败"
              description="未能读取动态页面配置，请重试"
              loading={loading}
              onRetry={() => setRetryCount((count) => count + 1)}
            />
          ) : (
            <div className="text-muted-foreground">
              页面配置未找到: {pageCode}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const { endpoint, columns = [] } = (config.config ?? {}) as DynamicPageConfig;
  const hasEndpoint = typeof endpoint === "string" && endpoint.length > 0;

  const missingConfig: string[] = [];
  if (!hasEndpoint) missingConfig.push("数据源 endpoint");
  if (!Array.isArray(columns) || columns.length === 0)
    missingConfig.push("显示列 columns");
  if (missingConfig.length > 0) {
    return (
      <div className="space-y-4">
        <h2 className="break-words text-lg font-semibold">{config.name}</h2>
        <Card>
          <CardContent className="p-6">
            <div className="block text-sm text-muted-foreground">
              页面尚未配置{missingConfig.join("、")}
              ，请先在页面配置中补充后再使用。
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const dynamicColumns: ColumnDef<Record<string, unknown>>[] = (
    Array.isArray(columns) ? columns : []
  ).map((col: { dataIndex: string; title: string }) => ({
    id: col.dataIndex,
    accessorKey: col.dataIndex,
    header: col.title,
    cell: ({ row }) => {
      const val = row.original[col.dataIndex];
      const display = val != null ? String(val) : "-";
      return (
        <span className="block max-w-[240px] truncate" title={display}>
          {display}
        </span>
      );
    },
  }));

  if (dataError) {
    return (
      <div className="space-y-4">
        <h2 className="break-words text-lg font-semibold">{config.name}</h2>
        <InlineError
          title="动态数据加载失败"
          description={dataError}
          loading={dataLoading}
          onRetry={() => setDataRetryCount((count) => count + 1)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="break-words text-lg font-semibold">{config.name}</h2>
      <DataTable
        columns={dynamicColumns}
        data={data}
        pageSize={dataPageSize}
        loading={dataLoading}
        emptyMessage={`「${config.name}」暂无数据`}
        serverSide
        total={dataTotal}
        pageIndex={dataPage}
        onPageChange={setDataPage}
        onPageSizeChange={(size) => {
          setDataPage(0);
          setDataPageSize(size);
        }}
      />
    </div>
  );
};
