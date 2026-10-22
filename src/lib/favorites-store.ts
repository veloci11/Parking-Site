export interface FavoriteSource {
  load(): Promise<string[]>;
  save(id: string, selected: boolean): Promise<void>;
}

export interface FavoritesState {
  ids: string[];
  pendingIds: string[];
  loading: boolean;
  error: string;
}

export const initialFavoritesState: FavoritesState = {
  ids: [],
  pendingIds: [],
  loading: true,
  error: "",
};

type Change = { selected: boolean; done(): void };
type Connection = {
  source: FavoriteSource;
  confirmed: Set<string>;
  pending: Map<string, Change[]>;
  ready: Promise<boolean>;
  loaded: boolean;
  loading: boolean;
  error: string;
};

/** Each favorite has its own ordered writes; a failed write never undoes another item. */
export function createFavoritesStore() {
  let current: Connection | null = null;
  let state = initialFavoritesState;
  const listeners = new Set<() => void>();
  function publish(connection: Connection) {
    if (current !== connection) return;
    const ids = new Set(connection.confirmed);
    for (const [id, changes] of connection.pending) {
      if (changes.at(-1)?.selected) ids.add(id);
      else ids.delete(id);
    }
    state = {
      ids: [...ids],
      pendingIds: [...connection.pending.keys()],
      loading: connection.loading,
      error: connection.error,
    };
    listeners.forEach((listener) => listener());
  }
  function load(connection: Connection) {
    connection.loading = true;
    connection.error = "";
    publish(connection);
    connection.ready = (async () => {
      try {
        const ids = await connection.source.load();
        if (current !== connection) return false;
        connection.confirmed = new Set(ids);
        connection.loaded = true;
        return true;
      } catch (error) {
        connection.error =
          error instanceof Error
            ? error.message
            : "Impossible de charger vos favoris.";
        return false;
      } finally {
        connection.loading = false;
        publish(connection);
      }
    })();
    return connection.ready;
  }
  async function flush(connection: Connection, id: string) {
    const changes = connection.pending.get(id)!;
    while (changes.length) {
      const change = changes[0];
      try {
        if (current === connection) {
          await connection.source.save(id, change.selected);
          if (change.selected) connection.confirmed.add(id);
          else connection.confirmed.delete(id);
        }
      } catch (error) {
        connection.error =
          error instanceof Error
            ? error.message
            : "Impossible de modifier ce favori.";
      } finally {
        changes.shift();
        if (!changes.length) connection.pending.delete(id);
        publish(connection);
        change.done();
      }
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    connect(source: FavoriteSource) {
      const connection: Connection = {
        source,
        confirmed: new Set(),
        pending: new Map(),
        ready: Promise.resolve(false),
        loaded: false,
        loading: true,
        error: "",
      };
      current = connection;
      void load(connection);
      return () => {
        if (current === connection) {
          current = null;
          state = initialFavoritesState;
          listeners.forEach((listener) => listener());
        }
      };
    },
    async toggle(id: string) {
      const connection = current;
      if (!connection) return;
      if (
        !connection.loaded &&
        !(await (connection.loading ? connection.ready : load(connection)))
      )
        return;
      if (current !== connection) return;
      const selected = !state.ids.includes(id);
      connection.error = "";
      await new Promise<void>((done) => {
        const changes = connection.pending.get(id) || [];
        changes.push({ selected, done });
        connection.pending.set(id, changes);
        publish(connection);
        if (changes.length === 1) void flush(connection, id);
      });
    },
  };
}
