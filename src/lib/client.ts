"use client";
import { requestJson } from "./request-json";
import { createPendingRequest } from "./pending-request";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "./types";
const readSession = createPendingRequest(() =>
  requestJson<{ data: User | null; mode?: string }>("/api/session", {
    cache: "no-store",
  }),
);
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const result = await requestJson<{ data: T }>(path, options);
  return result?.data;
}
export function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("");
  const generation = useRef(0);
  const refresh = useCallback(async (sessionEvent?: Event) => {
    const current = ++generation.current;
    try {
      // One auth event groups subscribers but never reuses a pre-login request.
      const value = await readSession(sessionEvent);
      if (current !== generation.current) return;
      setUser(value.data || null);
      setMode(value.mode || "");
    } catch {
      if (current === generation.current) setUser(null);
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const listener = (event: Event) => void refresh(event);
    window.addEventListener("gp:session", listener);
    return () => {
      generation.current++;
      window.removeEventListener("gp:session", listener);
    };
  }, [refresh]);
  return { user, loading, mode, refresh };
}
