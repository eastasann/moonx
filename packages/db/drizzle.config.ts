import { defineConfig } from "drizzle-kit";

// make db-migrate passes DATABASE_URL_DIRECT here as DATABASE_URL when it is set, so
// migrations bypass the pool (SDD 2章「環境変数」). make db-generate needs no database.
const url = process.env.DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  casing: "snake_case",
  ...(url === undefined || url === "" ? {} : { dbCredentials: { url } }),
});
