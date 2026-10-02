import { createDb, type Db } from "@moonx/db";
import { type PersonKey, seedDemo, userId } from "@moonx/db/seed";
import type { Elysia } from "elysia";
import { createApp } from "../src/app";
import { type AppConfig, testConfig } from "../src/config";
import { createLogger } from "../src/lib/logger";
import { DEV_USER_HEADER } from "../src/lib/session";
import type { Mailer, MailMessage } from "../src/mail/mailer";

/** Opens the test database. Tests refuse to run anywhere but a database named `*_test`. */
export function createTestDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL must point at the test database (make test-api sets it)");
  if (!new URL(url).pathname.slice(1).endsWith("_test")) {
    throw new Error("API tests only run against a database whose name ends in _test");
  }
  const { db, client } = createDb(url, { max: 3, quiet: true });
  return { db, close: () => client.end() };
}

/** A mailer that keeps what was sent, so tests can read invitation links. */
export function createMailbox(): Mailer & { sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
    },
  };
}

export interface TestApp {
  app: Elysia;
  db: Db;
  mailbox: ReturnType<typeof createMailbox>;
  logLines: string[];
  close: () => Promise<void>;
}

/** Reseeds the demo data and builds an app on it. Call once per test file, in `beforeAll`. */
export async function startTestApp(config: Partial<AppConfig> = {}): Promise<TestApp> {
  const { db, close } = createTestDb();
  await seedDemo(db);
  const mailbox = createMailbox();
  const logLines: string[] = [];
  const app = createApp(testConfig(config), {
    db,
    mailer: mailbox,
    logger: createLogger("debug", (line) => logLines.push(line)),
  });
  return { app: app as unknown as Elysia, db, mailbox, logLines, close };
}

/**
 * How a test acts as a person. This is the one place that knows how requests are authenticated:
 * Step 9 swaps the body for a real sign-in and the tests stay as they are.
 */
export async function login(_app: Elysia, person: PersonKey): Promise<Record<string, string>> {
  return { [DEV_USER_HEADER]: userId(person) };
}

export interface CallOptions {
  as?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

// biome-ignore lint/suspicious/noExplicitAny: tests read parsed JSON of any shape
export interface CallResult<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

/** Sends a request through the app and parses the JSON answer. */
// biome-ignore lint/suspicious/noExplicitAny: tests read parsed JSON of any shape
export async function call<T = any>(
  app: Elysia,
  method: string,
  path: string,
  options: CallOptions = {},
): Promise<CallResult<T>> {
  const headers: Record<string, string> = { ...options.as, ...options.headers };
  let body: string | undefined;
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  const response = await app.handle(
    new Request(`http://localhost${path}`, { method, headers, body }),
  );
  const text = await response.text();
  return {
    status: response.status,
    body: (text ? JSON.parse(text) : null) as T,
    headers: response.headers,
  };
}

/** Another app on an existing test database, with its own config, clock, mailer or logger. */
export function appOn(
  db: Db,
  config: Partial<AppConfig> = {},
  deps: Omit<Parameters<typeof createApp>[1], "db"> = {},
): Elysia {
  return createApp(testConfig(config), { db, ...deps }) as unknown as Elysia;
}
