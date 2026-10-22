"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { api, useSession } from "./client";
import { createFavoritesStore, initialFavoritesState } from "./favorites-store";
import type { Listing } from "./types";
const key = "gp:favorites:v1";
function localIds(): string[] {
  const raw = localStorage.getItem(key);
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed)
      ? [
          ...new Set(
            parsed.filter((id): id is string => typeof id === "string"),
          ),
        ].slice(0, 100)
      : [];
  } catch {
    return [];
  }
}
export function useFavorites() {
  const { user, loading: sessionLoading } = useSession();
  const userId = user?.id;
  const [store] = useState(createFavoritesStore);
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => initialFavoritesState,
  );
  useEffect(() => {
    if (sessionLoading) return;
    return store.connect(
      userId
        ? {
            load: async () =>
              (await api<Array<Listing | string>>("/api/favorites")).map(
                (item) => (typeof item === "string" ? item : item.id),
              ),
            save: async (id, selected) => {
              await api(`/api/favorites/${id}`, {
                method: selected ? "PUT" : "DELETE",
              });
            },
          }
        : {
            load: async () => localIds(),
            save: async (id, selected) => {
              const ids = new Set(localIds());
              if (selected) ids.add(id);
              else ids.delete(id);
              localStorage.setItem(key, JSON.stringify([...ids]));
            },
          },
    );
  }, [userId, sessionLoading, store]);
  return {
    ...state,
    loading: sessionLoading || state.loading,
    toggle: store.toggle,
  };
}
