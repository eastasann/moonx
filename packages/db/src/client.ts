import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as relations from "./relations";
import * as tables from "./schema";

export const schema = { ...tables, ...relations };

/**
 * Opens a pooled connection. `prepare: false` keeps it working behind a
 * transaction-mode pooler (Neon's PgBouncer); `max` is per instance (SDD 7.3). `quiet` drops server NOTICEs, which
 * migrations emit for "already exists, skipping" and identifiers truncated to 63 characters.
 */
export function createDb(url: string, options: { max?: number; quiet?: boolean } = {}) {
  const client = postgres(url, {
    max: options.max ?? 5,
    prepare: false,
    ...(options.quiet ? { onnotice: () => {} } : {}),
  });
  const db = drizzle(client, { schema, casing: "snake_case" });
  return { db, client };
}

export type Db = ReturnType<typeof createDb>["db"];
