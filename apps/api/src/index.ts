import { connectDatabase } from "@moonx/db";
import { createApp } from "./app";
import { ConfigError, loadConfig } from "./config";
import { createLogger } from "./log";
import { createMailer } from "./mail";
import { createErrorReporter } from "./sentry";

function readConfig() {
  try {
    return loadConfig(process.env);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    // One JSON line so Cloud Logging records the reason a revision failed to start.
    console.error(
      JSON.stringify({ severity: "ERROR", message: error.message }),
    );
    process.exit(1);
  }
}

const config = readConfig();
// postgres.js connects on the first query, so the API starts even while the database
// is down, and /api/health keeps answering (SDD 5.14).
const { db } = connectDatabase(config.databaseUrl);
const log = createLogger(config.logLevel);
createApp(config, {
  db,
  log,
  reporter: createErrorReporter(config),
  mailer: createMailer(config, log),
}).listen({
  port: config.port,
  // Locally only this machine may connect, as with Vite and the Docker PostgreSQL.
  // "localhost" would bind ::1 alone on macOS. Deployed, Cloud Run reaches the
  // container from outside, so every interface listens.
  hostname: config.appEnv === "local" ? "127.0.0.1" : "0.0.0.0",
});
