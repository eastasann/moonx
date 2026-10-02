import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/** Rebuilds the test database and fills it with the demo data (design-spec 8). */
export default function globalSetup() {
  const url = process.env.DATABASE_URL_TEST ?? "postgres://moonx:moonx@localhost:5432/moonx_test";
  const env = {
    ...process.env,
    APP_ENV: "local",
    DATABASE_URL: url,
    DATABASE_URL_DIRECT: url,
    DATABASE_URL_TEST: url,
  };
  for (const script of ["reset-test", "seed"]) {
    execFileSync("bun", ["run", "--cwd", "packages/db", script], {
      cwd: root,
      env,
      stdio: "inherit",
    });
  }
}
