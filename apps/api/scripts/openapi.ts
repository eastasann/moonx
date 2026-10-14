// make openapi: writes apps/api/openapi.json, the same document staging serves at
// /api/docs/json, formatted as make format would format it so make lint covers it. CI
// runs this and fails on a diff (04_deployment-procedure.md 2章).

import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { connectDatabase } from "@moonx/db";
import { createApp } from "../src/app";
import { OPENAPI_JSON_PATH } from "../src/docs";
import { createLogger } from "../src/log";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const OUTPUT = fileURLToPath(new URL("../openapi.json", import.meta.url));

// Only routes matter here, so the values are placeholders: nothing is read from the
// environment, the database is never queried (postgres.js connects on the first
// query), and nothing is logged or reported.
const { db, close } = connectDatabase("postgres://openapi@127.0.0.1:1/none");
const app = createApp(
  {
    appEnv: "staging",
    appVersion: "openapi",
    port: 3000,
    webDistDir: undefined,
    databaseUrl: "postgres://openapi@127.0.0.1:1/none",
    betterAuthSecret: "openapi".repeat(5),
    betterAuthUrl: "https://stg.example.invalid",
    trustedOrigins: ["https://stg.example.invalid"],
    google: undefined,
    mail: {
      transport: "resend",
      resendApiKey: undefined,
      from: "moonx <no-reply@example.invalid>",
      allowlist: [],
    },
    avatarBucket: undefined,
    sentryDsn: undefined,
    webSentryDsn: undefined,
    logLevel: "error",
  },
  {
    db,
    log: createLogger("error", () => {}),
    reporter: { report: async () => {} },
  },
);

const response = await app.handle(
  new Request(`http://localhost${OPENAPI_JSON_PATH}`),
);
if (!response.ok) {
  throw new Error(`${OPENAPI_JSON_PATH} answered ${response.status}`);
}
const document = JSON.stringify(await response.json());
await close();

const formatted = Bun.spawnSync(
  [
    process.execPath,
    "--bun",
    "x",
    "--no-install",
    "biome",
    "format",
    `--stdin-file-path=${relative(REPO_ROOT, OUTPUT)}`,
  ],
  { cwd: REPO_ROOT, stdin: Buffer.from(document), stderr: "pipe" },
);
if (formatted.exitCode !== 0) {
  throw new Error(`biome could not format openapi.json:\n${formatted.stderr}`);
}
await Bun.write(OUTPUT, formatted.stdout);
