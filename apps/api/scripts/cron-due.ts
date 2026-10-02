import { createDb } from "@moonx/db";
import { loadConfig } from "../src/config";
import { processDueNotifications } from "../src/lib/due-notifications";
import { createLogger } from "../src/lib/logger";

/**
 * `make cron-due`: runs the due-notification processing once against `DATABASE_URL`, the same
 * function Z3 runs. It skips the OIDC check that guards the HTTP endpoint, so it only runs when
 * `APP_ENV=local`; a deployed environment is reached through Cloud Scheduler only.
 */
const config = loadConfig();
if (config.env !== "local") {
  console.error(`cron-due only runs when APP_ENV=local (got "${config.env}")`);
  process.exit(2);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(2);
}

const { db, client } = createDb(url, { max: 1, quiet: true });
try {
  const result = await processDueNotifications({
    db,
    now: () => new Date(),
    logger: createLogger(config.logLevel),
  });
  console.log(JSON.stringify(result));
} finally {
  await client.end();
}
