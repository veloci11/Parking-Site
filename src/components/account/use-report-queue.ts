"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./shared";

export function useReportQueue<T extends { id: string }>(
  path: string,
  status: string,
) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const failedCursor = useRef<string | undefined>(undefined);
  const load = useCallback(
    async (next?: string) => {
      if (next && pending.current) return;
      const request = ++generation.current;
      pending.current = true;
      setError("");
      if (next) setLoadingMore(true);
      else setLoading(true);
      try {
        const params = new URLSearchParams({ status, limit: "50" });
        if (next) params.set("cursor", next);
        const response = await api<{ data: T[]; nextCursor?: string | null }>(
          `${path}?${params}`,
        );
        if (request !== generation.current) return;
        setItems((current) =>
          next
            ? [
                ...current,
                ...response.data.filter(
                  (item) => !current.some((old) => old.id === item.id),
                ),
              ]
            : response.data,
        );
        setCursor(response.nextCursor || null);
      } catch (e) {
        if (request === generation.current) {
          failedCursor.current = next;
          setError((e as Error).message);
        }
      } finally {
        if (request === generation.current) {
          pending.current = false;
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [path, status],
  );
  useEffect(() => {
    setItems([]);
    setCursor(null);
    void load();
    return () => {
      generation.current++;
      pending.current = false;
    };
  }, [load]);
  return {
    items,
    loading,
    loadingMore,
    error,
    cursor,
    refresh: () => load(),
    retry: () => load(failedCursor.current),
    more: () => (cursor ? load(cursor) : Promise.resolve()),
  };
}
