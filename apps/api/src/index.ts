import { createApp } from "./app";
import { ConfigError, loadConfig } from "./config";

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
createApp(config).listen({
  port: config.port,
  // Locally only this machine may connect, as with Vite and the Docker PostgreSQL.
  // "localhost" would bind ::1 alone on macOS. Deployed, Cloud Run reaches the
  // container from outside, so every interface listens.
  hostname: config.appEnv === "local" ? "127.0.0.1" : "0.0.0.0",
});
