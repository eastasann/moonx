import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client";

const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_DIRECT or DATABASE_URL is required");
  process.exit(2);
}

const { db, client } = createDb(url, { max: 1, quiet: true });
await migrate(db, { migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)) });
await client.end();
console.log("migrations applied");
