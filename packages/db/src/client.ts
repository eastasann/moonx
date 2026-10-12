import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as relations from "./relations";
import * as schema from "./schema";

/** Every table and relation, as given to drizzle() for relational queries. */
export const fullSchema = { ...schema, ...relations };

/** A Drizzle client over postgres.js that knows every table and relation. */
export type Database = PostgresJsDatabase<typeof fullSchema>;

/** A Drizzle client and the way to close its connection pool. */
export interface DatabaseConnection {
  db: Database;
  /** Waits for running queries, then closes every connection. */
  close: () => Promise<void>;
}

/**
 * Opens a connection pool of at most 5 connections to `url`. Call it once per process:
 * SDD 7.3 counts on one pool per Cloud Run instance, 15 connections for 3 instances.
 * Prepared statements are off for the Neon pooler (PgBouncer) in staging and production
 * (ADR-008), and locally too, so that local runs send the same protocol.
 */
export function connectDatabase(url: string): DatabaseConnection {
  const client = postgres(url, { max: 5, prepare: false });
  return {
    db: drizzle({ client, schema: fullSchema, casing: "snake_case" }),
    close: () => client.end(),
  };
}
