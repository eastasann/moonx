import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/**
 * Recreates the test database and puts the demo data of design-spec 8 in it, before every
 * run (docs/03_dev-setup.md 7章): the tests change it, and each run starts the same.
 * The scripts are make test-api's and make db-seed's, pointed at DATABASE_URL_TEST.
 */
export default function globalSetup() {
  const run = (script: string, env: NodeJS.ProcessEnv = {}) =>
    execFileSync("bun", [script], {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
  run("packages/db/src/recreate-test-database.ts");
  run("apps/api/scripts/seed.ts", {
    DATABASE_URL: process.env.DATABASE_URL_TEST,
  });
}
