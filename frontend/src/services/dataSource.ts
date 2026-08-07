// Runtime data-source resolver for dynamic form fields.
// Handles dictionary lookups and API-driven options for Select/Radio/Checkbox components.

import { request as apiRequest } from "@/services/api";

export interface DataSourceConfig {
  type: "dictionary" | "api";
  code?: string; // dictionary code, e.g. "gender"
  url?: string; // API endpoint, e.g. "/users/list"
  labelField?: string; // defaults to "label"
  valueField?: string; // defaults to "value"
  params?: Record<string, string>;
}

interface DictEntry {
  id: number;
  label: string;
  value: string;
  // biome-ignore lint/suspicious/noExplicitAny: dynamic dict fields
  [key: string]: any;
}

/** Resolve a DataSourceConfig into {label, value}[] options. */
export async function resolveDataSource(
  cfg: DataSourceConfig,
  // biome-ignore lint/suspicious/noExplicitAny: value type varies by data source
): Promise<{ label: string; value: any }[]> {
  const labelField = cfg.labelField || "label";
  const valueField = cfg.valueField || "value";

  if (cfg.type === "dictionary") {
    if (!cfg.code) return [];
    const data = await apiRequest<DictEntry[]>(
      `/dictionary-entries?dict_type=${encodeURIComponent(cfg.code)}&_start=0&_end=999`,
    );
    return (data || []).map((item) => ({
      label: item[labelField] ?? item.label,
      value: item[valueField] ?? item.value,
    }));
  }

  if (cfg.type === "api") {
    if (!cfg.url) return [];
    const qs = cfg.params
      ? `?${new URLSearchParams(cfg.params).toString()}`
      : "";
    // biome-ignore lint/suspicious/noExplicitAny: API response shape is dynamic
    const data = await apiRequest<any[]>(`${cfg.url}${qs}`);
    return (data || []).map((item) => ({
      label: item[labelField],
      value: item[valueField],
    }));
  }

  return [];
}
