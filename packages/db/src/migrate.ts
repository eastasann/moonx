import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Where make db-generate writes migrations (`out` in drizzle.config.ts). */
export const migrationsFolder = fileURLToPath(
  new URL("../migrations", import.meta.url),
);

/**
 * Applies the migrations the database does not have yet. make db-migrate runs the same
 * migrator through drizzle-kit, so both record what they applied in
 * drizzle.__drizzle_migrations and either can pick up where the other left off.
 */
export async function migrateDatabase(url: string): Promise<void> {
  const client = postgres(url, { max: 1 });
  try {
    await migrate(drizzle({ client, casing: "snake_case" }), {
      migrationsFolder,
    });
  } finally {
    await client.end();
  }
}
