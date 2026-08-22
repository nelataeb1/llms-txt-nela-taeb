import { MemoryStore } from "./memory";
import { PostgresStore } from "./postgres";
import type { Store } from "./types";

let store: Store | null = null;

/**
 * Postgres when DATABASE_URL is set, otherwise an in-process store so the app
 * runs locally with no setup. Monitoring history only persists with Postgres.
 */
export function getStore(): Store {
  if (store) return store;
  const connectionString = process.env.DATABASE_URL;
  store = connectionString ? new PostgresStore(connectionString) : new MemoryStore();
  return store;
}

export function isPersistent(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export type * from "./types";
