"use client";
import { useCallback, useEffect, useState } from "react";
import type { User } from "./types";
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...options, headers });
  const result = await response.json();
  if (!response.ok || result.error)
    throw new Error(result.error || "Une erreur est survenue. Réessayez.");
  return result.data as T;
}
export function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("demo");
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/session", { cache: "no-store" });
      const value = await r.json();
      setUser(value.data || null);
      setMode(value.mode || "demo");
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const listener = () => void refresh();
    window.addEventListener("gp:session", listener);
    return () => window.removeEventListener("gp:session", listener);
  }, [refresh]);
  return { user, loading, mode, refresh };
}
