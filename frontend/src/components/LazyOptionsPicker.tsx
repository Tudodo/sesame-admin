import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { AlertCircle, Check, ChevronDown, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export interface LazyPickerOption {
  key: string;
  label: string;
  sublabel?: string;
  disabled?: boolean;
}

interface LazyOptionsPickerProps {
  id?: string;
  ariaLabel?: string;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
  placeholder: string;
  options: LazyPickerOption[];
  selectedOptions: LazyPickerOption[];
  total: number;
  loading: boolean;
  error: boolean;
  multiple: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  onLoadMore: () => void;
  onRetry: () => void;
  onToggle: (key: string, option: LazyPickerOption) => void;
  disabled?: boolean;
  className?: string;
}

function uniqueOptions(options: LazyPickerOption[]): LazyPickerOption[] {
  const map = new Map<string, LazyPickerOption>();
  for (const option of options) map.set(option.key, option);
  return Array.from(map.values());
}

export const LazyOptionsPicker: React.FC<LazyOptionsPickerProps> = ({
  placeholder,
  id,
  ariaLabel,
  ariaInvalid = false,
  ariaDescribedBy,
  options,
  selectedOptions,
  total,
  loading,
  error,
  multiple,
  search,
  onSearchChange,
  onLoadMore,
  onRetry,
  onToggle,
  disabled = false,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const [committedSearch, setCommittedSearch] = useState(search);
  const prevLoadingRef = useRef(loading);
  useEffect(() => {
    if (prevLoadingRef.current && !loading) {
      setCommittedSearch(search);
    }
    prevLoadingRef.current = loading;
  }, [loading, search]);
  const optionMap = useMemo(
    () => new Map(options.map((option) => [option.key, option])),
    [options],
  );
  const resolvedSelected = useMemo(
    () => selectedOptions.map((option) => optionMap.get(option.key) || option),
    [selectedOptions, optionMap],
  );
  const selectedMap = useMemo(
    () => new Map(resolvedSelected.map((option) => [option.key, option])),
    [resolvedSelected],
  );
  const pinnedSelected = resolvedSelected.filter(
    (option) => !optionMap.has(option.key),
  );
  const searchPending = search !== committedSearch;
  const visibleOptions = searchPending
    ? pinnedSelected
    : uniqueOptions([...pinnedSelected, ...options]);
  const hasMore = !searchPending && total > visibleOptions.length;
  const triggerLabel = multiple
    ? resolvedSelected.length
      ? `已选 ${resolvedSelected.length} 项`
      : placeholder
    : resolvedSelected[0]?.label || placeholder;
  const searchInputLabel = ariaLabel || placeholder || "选项";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          id={id}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid || undefined}
          aria-describedby={ariaDescribedBy}
          className={cn(
            "h-9 w-full justify-between gap-2 px-3 font-normal",
            className,
          )}
        >
          <span className="min-w-0 truncate" title={triggerLabel}>
            {triggerLabel}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[min(26rem,calc(100vw-2rem))] p-0"
      >
        <div className="border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="输入关键字搜索"
              aria-label={`搜索 ${searchInputLabel}`}
              className="h-9 pl-8"
            />
          </div>
        </div>
        <ScrollArea className="h-64">
          {visibleOptions.length === 0 && (loading || searchPending) ? (
            <div className="flex h-full items-center justify-center gap-2 p-4">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-sm text-muted-foreground">
                {searchPending && !loading ? "搜索中…" : "加载中…"}
              </span>
            </div>
          ) : !searchPending && error && visibleOptions.length === 0 ? (
            <div
              role="alert"
              className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center"
            >
              <AlertCircle className="size-4 text-destructive" />
              <p className="text-sm text-muted-foreground">选项加载失败</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onRetry()}
                disabled={loading}
              >
                重试
              </Button>
            </div>
          ) : visibleOptions.length === 0 ? (
            <div className="flex h-full items-center justify-center p-4">
              <div className="text-sm text-muted-foreground">
                没有匹配的选项
              </div>
            </div>
          ) : (
            <div className="p-1">
              {!searchPending && error && (
                <div
                  role="alert"
                  className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2 text-destructive">
                    <AlertCircle className="size-4 shrink-0" />
                    <span className="text-muted-foreground">
                      部分选项加载失败，已加载选项仍可继续选择。
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onRetry()}
                    disabled={loading}
                  >
                    重试
                  </Button>
                </div>
              )}
              {visibleOptions.map((option) => {
                const selected = selectedMap.has(option.key);
                return (
                  <button
                    type="button"
                    key={option.key}
                    disabled={option.disabled}
                    aria-pressed={selected}
                    onClick={() => onToggle(option.key, option)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent",
                      option.disabled && "cursor-not-allowed opacity-50",
                    )}
                  >
                    {multiple ? (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input",
                        )}
                      >
                        {selected ? <Check className="size-4" /> : null}
                      </span>
                    ) : selected ? (
                      <Badge variant="default">已选</Badge>
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate" title={option.label}>
                        {option.label}
                      </span>
                      {option.sublabel ? (
                        <span
                          className="block truncate text-xs text-muted-foreground"
                          title={option.sublabel}
                        >
                          {option.sublabel}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
              {hasMore ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1 w-full"
                  onClick={() => onLoadMore()}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> 加载中…
                    </>
                  ) : (
                    "加载更多"
                  )}
                </Button>
              ) : null}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
