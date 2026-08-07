import { DataTable } from "@/components/data-table";
import { Card, CardContent } from "@/components/ui/card";
import { message } from "@/lib/message";
import { request } from "@/services/api";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertCircle, Loader2 } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";

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

export const DynamicPage: React.FC<DynamicPageProps> = ({ pageCode }) => {
  const [config, setConfig] = useState<PageConfig | null>(null);
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    request(`/page-configs/${pageCode}`)
      .then((c) => setConfig(c as PageConfig))
      .catch(() => {
        setConfig(null);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [pageCode]);

  useEffect(() => {
    if (!config) return;
    const { endpoint } = config.config as {
      endpoint?: string;
      columns?: { dataIndex: string; title: string }[];
      rowKey?: string;
    };
    if (!endpoint) return;
    setDataLoading(true);
    // Guard against absolute / protocol-relative endpoints in page config:
    // request() prepends "/api" but still issues a cross-origin fetch for
    // absolute URLs, leaking the Bearer token to an external host. Only
    // allow same-origin relative paths.
    if (!endpoint.startsWith("/") || endpoint.includes("://")) {
      setData([]);
      message.error("页面配置的 endpoint 必须是相对路径");
      return;
    }
    request(`${endpoint}?_start=0&_end=100`)
      .then((res) => setData(Array.isArray(res) ? res : []))
      .catch((e: unknown) => {
        setData([]);
        message.error(e instanceof Error ? e.message : "加载数据失败");
      })
      .finally(() => setDataLoading(false));
  }, [config]);

  if (loading) {
    return (
      <div className="flex justify-center p-24">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!config) {
    return (
      <Card>
        {error && (
          <div className="flex items-center gap-2 p-4 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            页面配置加载失败
          </div>
        )}
        <CardContent className="p-6">
          <p className="text-muted-foreground">页面配置未找到: {pageCode}</p>
        </CardContent>
      </Card>
    );
  }

  const { columns = [] } = config.config as {
    endpoint?: string;
    columns?: { dataIndex: string; title: string }[];
    rowKey?: string;
  };

  const dynamicColumns: ColumnDef<Record<string, unknown>>[] = columns.map(
    (col: { dataIndex: string; title: string }) => ({
      id: col.dataIndex,
      accessorKey: col.dataIndex,
      header: col.title,
      cell: ({ row }) => {
        const val = row.original[col.dataIndex];
        return val != null ? String(val) : "-";
      },
    }),
  );

  if (dataLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{config.name}</h2>
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{config.name}</h2>
      <DataTable
        columns={dynamicColumns}
        data={data}
        pageSize={10}
        emptyMessage="暂无数据"
      />
    </div>
  );
};
