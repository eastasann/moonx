import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { createDb } from "./client";

const url = process.env.DATABASE_URL_TEST;
if (!url) {
  console.error("DATABASE_URL_TEST is required");
  process.exit(2);
}

// This script drops every table. A `?database=` query parameter overrides the path in the URL
// without showing up in postgres.js's parsed options, so any query string is refused.
const parsed = new URL(url);
const dbName = parsed.pathname.slice(1);
if (parsed.search !== "" || !dbName.endsWith("_test")) {
  console.error(
    `refusing to reset "${dbName}": the URL must have no query string and the database name must end with _test`,
  );
  process.exit(2);
}

const admin = postgres(url, { max: 1, onnotice: () => {} });
await admin.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE");
await admin.unsafe("DROP SCHEMA IF EXISTS public CASCADE");
await admin.unsafe("CREATE SCHEMA public");
await admin.end();

const { db, client } = createDb(url, { max: 1, quiet: true });
await migrate(db, { migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)) });
await client.end();
console.log(`reset and migrated ${dbName}`);
