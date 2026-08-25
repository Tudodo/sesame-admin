import { message } from "@/lib/message";
import { getList } from "@/services/api";
import { useCallback, useEffect, useRef, useState } from "react";

export const OPTION_PAGE_SIZE = 20;

export interface LazyResource<T extends { id: number; name: string }> {
  items: T[];
  total: number;
  search: string;
  loading: boolean;
  error: boolean;
  setSearch: (value: string) => void;
  reload: () => void;
  loadMore: () => void;
}

/** Searchable, paginated resource for option pickers. */
export function useLazyResource<T extends { id: number; name: string }>(
  resource: string,
  enabled = true,
): LazyResource<T> {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [nextPage, setNextPage] = useState(0);
  const requestRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedOnceRef = useRef(false);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [search]);

  const loadPage = useCallback(
    async (page: number) => {
      const requestId = ++requestRef.current;
      setLoading(true);
      setError(false);
      try {
        const query: Record<string, unknown> = {
          _start: page * OPTION_PAGE_SIZE,
          _end: (page + 1) * OPTION_PAGE_SIZE,
        };
        if (debouncedSearch) query.name = debouncedSearch;
        const res = await getList<T>(resource, query);
        if (requestId !== requestRef.current) return;
        setItems((prev) => (page === 0 ? res.data : [...prev, ...res.data]));
        setTotal(res.total);
        setNextPage(page + 1);
      } catch (e: unknown) {
        if (requestId !== requestRef.current) return;
        setError(true);
        if (e instanceof Error) message.error(`加载失败: ${e.message}`);
      } finally {
        if (requestId === requestRef.current) {
          loadedOnceRef.current = true;
          setLoading(false);
        }
      }
    },
    [resource, debouncedSearch],
  );
  useEffect(() => {
    if (enabled) void loadPage(0);
    return () => {
      requestRef.current += 1;
    };
  }, [enabled, loadPage]);

  const isPendingFirstLoad = enabled && !loadedOnceRef.current;

  const reload = useCallback(() => {
    void loadPage(0);
  }, [loadPage]);

  const loadMore = useCallback(() => {
    if (loading) return;
    void loadPage(nextPage);
  }, [loading, loadPage, nextPage]);

  return {
    items,
    total,
    search,
    setSearch,
    loading: loading || isPendingFirstLoad,
    error,
    reload,
    loadMore,
  };
}
