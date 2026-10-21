"use client";
import { useEffect, useState } from "react";
import { api, useSession } from "./client";
import type { Listing } from "./types";
const key = "gp:favorites:v1";
export function useFavorites() {
  const { user } = useSession();
  const [ids, setIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (user) {
      api<Array<Listing | string>>("/api/favorites")
        .then((data) => {
          if (active)
            setIds(data.map((x) => (typeof x === "string" ? x : x.id)));
        })
        .catch(() => {});
    } else {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || "[]");
        setIds(
          Array.isArray(parsed)
            ? parsed.filter((x) => typeof x === "string").slice(0, 100)
            : [],
        );
      } catch {
        setIds([]);
      }
    }
    return () => {
      active = false;
    };
  }, [user]);
  async function toggle(id: string) {
    const selected = ids.includes(id);
    const previous = ids;
    const next = selected ? ids.filter((x) => x !== id) : [...ids, id];
    setIds(next);
    setError("");
    try {
      if (user)
        await api(`/api/favorites/${id}`, {
          method: selected ? "DELETE" : "PUT",
        });
      else localStorage.setItem(key, JSON.stringify(next));
    } catch (e) {
      setIds(previous);
      setError((e as Error).message);
    }
  }
  return { ids, toggle, error };
}
