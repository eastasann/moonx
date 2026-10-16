import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectDatabase, type DatabaseConnection } from "@moonx/db";
import { accessPlugin } from "./access";
import { createApp } from "./app";
import { createAuth } from "./auth";
import {
  type AvatarStore,
  createCloudStorageAvatarStore,
  createDiskAvatarStore,
} from "./avatars";
import type { Config } from "./config";
import { createLogger } from "./log";
import { createMailer, type Mailer } from "./mail";
import type { ErrorReporter, FailureReport } from "./sentry";

// Shared by the API's tests (README「テスト」): the config is assembled here instead of
// read from the environment, and the log and Sentry are captured instead of sent.

export const testConfig: Config = {
  appEnv: "test",
  appVersion: "abc1234",
  port: 3000,
  webDistDir: undefined,
  databaseUrl: "postgres://moonx:moonx@localhost:5432/moonx_test",
  betterAuthSecret: "x".repeat(32),
  betterAuthUrl: "http://localhost:5173",
  trustedOrigins: ["http://localhost:5173"],
  google: undefined,
  mail: {
    transport: "console",
    resendApiKey: undefined,
    from: "moonx <no-reply@localhost>",
    allowlist: undefined,
  },
  avatarBucket: undefined,
  sentryDsn: undefined,
  webSentryDsn: undefined,
  logLevel: "debug",
};

/**
 * The test database, which make test-api recreates with every migration before the
 * tests run. Close it in `afterAll`.
 */
export function connectTestDatabase(): DatabaseConnection {
  const url = process.env.DATABASE_URL_TEST;
  if (url === undefined || url === "") {
    throw new Error("DATABASE_URL_TEST is required for make test-api");
  }
  return connectDatabase(url);
}

/** A database that refuses every connection, for the paths that must not need one. */
export function unreachableDatabase(): DatabaseConnection {
  return connectDatabase("postgres://nobody@127.0.0.1:1/none_test");
}

export type LogLine = Record<string, unknown>;

export interface TestApp {
  app: ReturnType<typeof createApp>;
  /**
   * Where the app keeps photos: a fresh directory on disk, or Cloud Storage when the
   * config names a bucket, unless `avatars` replaces it.
   */
  avatars: AvatarStore;
  /** Every log line written so far, parsed. */
  lines: LogLine[];
  /** Every failure handed to Sentry so far. */
  reports: FailureReport[];
}

/**
 * The API over `db` with {@link testConfig}. Mail goes through the console transport
 * unless `mailer` replaces it, so a sent mail is a `message: "mail"` line in `lines`.
 */
export function buildTestApp(
  db: DatabaseConnection,
  options: {
    config?: Partial<Config>;
    reporter?: ErrorReporter;
    mailer?: Mailer;
    avatars?: AvatarStore;
    now?: () => number;
    /** Defaults to 0, so password-reset requests answer at once. */
    resetAnswerMs?: number;
  } = {},
): TestApp {
  const lines: LogLine[] = [];
  const reports: FailureReport[] = [];
  const config = { ...testConfig, ...options.config };
  const log = createLogger(config.logLevel, (line) =>
    lines.push(JSON.parse(line)),
  );
  // As src/index.ts chooses: a bucket makes the app a deployed one, without U9.
  const avatars =
    options.avatars ??
    (config.avatarBucket === undefined
      ? createDiskAvatarStore(mkdtempSync(join(tmpdir(), "moonx-avatars-")))
      : createCloudStorageAvatarStore({ bucket: config.avatarBucket }));
  const app = createApp(config, {
    db: db.db,
    log,
    avatars,
    reporter: options.reporter ?? {
      report: async (failure) => {
        reports.push(failure);
      },
    },
    mailer: options.mailer ?? createMailer(config, log),
    now: options.now,
    resetAnswerMs: options.resetAnswerMs ?? 0,
  });
  return { app, avatars, lines, reports };
}

/**
 * The authorization plugin over `db` with {@link testConfig}, for tests that assemble
 * routes without the whole app.
 */
export function buildTestAccess(db: DatabaseConnection) {
  const log = createLogger("error", () => {});
  const { auth } = createAuth({
    config: testConfig,
    db: db.db,
    log,
    mailer: createMailer(testConfig, log),
    now: Date.now,
  });
  return accessPlugin({ auth, db: db.db });
}

/**
 * Waits for the log line matching `predicate`. Elysia writes the access log after the
 * response is handed over, so it may not exist yet when `handle` resolves.
 */
export async function waitForLine(
  lines: readonly LogLine[],
  predicate: (line: LogLine) => boolean,
): Promise<LogLine> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const line = lines.find(predicate);
    if (line !== undefined) return line;
    await Bun.sleep(10);
  }
  throw new Error("no matching log line was written");
}

/** The access log line of the response, found by its `X-Request-Id`. */
export function accessLine(
  lines: readonly LogLine[],
  response: Response,
): Promise<LogLine> {
  const requestId = response.headers.get("x-request-id");
  return waitForLine(
    lines,
    (line) => line.message === "request" && line.requestId === requestId,
  );
}

/**
 * An IP (from the documentation range 2001:db8::/32) in a /64 no other test uses, so
 * counts kept in `rate_limits` and per instance, which go by the /64, never leak
 * between tests or runs.
 */
export function uniqueIp(): string {
  const [high = 0, low = 0] = crypto.getRandomValues(new Uint16Array(2));
  return `2001:db8:${high.toString(16)}:${low.toString(16)}::1`;
}
