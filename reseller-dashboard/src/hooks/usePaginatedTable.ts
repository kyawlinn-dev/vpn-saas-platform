import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { PaginatedResponse } from "../types/api";

export interface PaginatedTableState<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
  loading: boolean;
  error: string;
  setPage: (page: number) => void;
  refresh: () => void;
}

export function usePaginatedTable<T>(
  path: string,
  filters: Record<string, string> = {},
  limit = 20
): PaginatedTableState<T> {
  const [data, setData] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPageState] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Keep a ref so refresh() always uses the current page without being in deps
  const pageRef = useRef(page);
  pageRef.current = page;

  const totalPages = Math.max(1, Math.ceil(total / limit));
  // Serialize filters so useEffect only re-runs when values actually change
  const filtersKey = JSON.stringify(filters);

  // Cancel a still-in-flight request when a newer one starts (e.g. typing
  // search fast, or flipping filters before the previous page loaded) — a
  // slow earlier response could otherwise resolve after a newer one and
  // overwrite fresher data on screen.
  const abortRef = useRef<AbortController | null>(null);

  const fetchPage = useCallback(
    async (p: number) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        setLoading(true);
        setError("");
        const params = new URLSearchParams({
          ...JSON.parse(filtersKey),
          page: String(p),
          limit: String(limit),
        });
        const res = await api.get<PaginatedResponse<T>>(`${path}?${params}`, {
          signal: controller.signal,
        });
        setData(res.data.data ?? []);
        setTotal(res.data.total ?? 0);
        setPageState(p);
      } catch (err: any) {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") return;
        setError(err?.response?.data?.error || err.message || "Failed to load data");
      } finally {
        if (abortRef.current === controller) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, filtersKey, limit]
  );

  // Reset to page 1 whenever path or filters change
  useEffect(() => {
    void fetchPage(1);
  }, [fetchPage]);

  const setPage = useCallback((p: number) => { void fetchPage(p); }, [fetchPage]);
  const refresh = useCallback(() => { void fetchPage(pageRef.current); }, [fetchPage]);

  return { data, total, page, totalPages, loading, error, setPage, refresh };
}
