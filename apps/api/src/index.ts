import { resolve } from "node:path";
import { connectDatabase } from "@moonx/db";
import { AccessDeclarationError } from "./access";
import { createApp } from "./app";
import {
  createCloudStorageAvatarStore,
  createDiskAvatarStore,
} from "./avatars";
import { ConfigError, loadConfig } from "./config";
import { createLogger } from "./log";
import { createMailer } from "./mail";
import { createErrorReporter } from "./sentry";

/** Stops the process with one JSON line, so Cloud Logging records why a revision failed. */
function refuseToStart(error: Error): never {
  console.error(JSON.stringify({ severity: "ERROR", message: error.message }));
  process.exit(1);
}

function readConfig() {
  try {
    return loadConfig(process.env);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    refuseToStart(error);
  }
}

const config = readConfig();
// postgres.js connects on the first query, so the API starts even while the database
// is down, and /api/health keeps answering (SDD 5.14).
const { db } = connectDatabase(config.databaseUrl);
const log = createLogger(config.logLevel);

function buildApp() {
  try {
    return createApp(config, {
      db,
      log,
      reporter: createErrorReporter(config),
      mailer: createMailer(config, log),
      // Without a bucket (local) photos live on disk, under the directory make dev-api
      // runs in (SDD 2章 AVATAR_BUCKET).
      avatars:
        config.avatarBucket === undefined
          ? createDiskAvatarStore(resolve(".data/avatars"))
          : createCloudStorageAvatarStore({ bucket: config.avatarBucket }),
    });
  } catch (error) {
    if (!(error instanceof AccessDeclarationError)) throw error;
    refuseToStart(error);
  }
}

buildApp().listen({
  port: config.port,
  // Locally only this machine may connect, as with Vite and the Docker PostgreSQL.
  // "localhost" would bind ::1 alone on macOS. Deployed, Cloud Run reaches the
  // container from outside, so every interface listens.
  hostname: config.appEnv === "local" ? "127.0.0.1" : "0.0.0.0",
});
