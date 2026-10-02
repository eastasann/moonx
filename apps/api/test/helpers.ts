import { createDb, type Db, schema } from "@moonx/db";
import { DEMO_PASSWORD, hashPassword, type PersonKey, people, seedDemo } from "@moonx/db/seed";
import type { Elysia } from "elysia";
import { createApp } from "../src/app";
import { type AppConfig, testConfig } from "../src/config";
import { createLogger } from "../src/lib/logger";
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
 * Signs in through Better Auth the way a client does and returns the headers that carry the
 * session; `headers` are sent with the sign-in (the Worker's shared secret, for guarded apps). Sends no `CF-Connecting-IP`, so Better Auth's per-IP limit does not count these.
 */
export async function loginWith(
  app: Elysia,
  email: string,
  password: string = DEMO_PASSWORD,
  headers: Record<string, string> = {},
): Promise<Record<string, string>> {
  const response = await app.handle(
    new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ email, password }),
    }),
  );
  if (response.status !== 200) {
    throw new Error(`sign-in as ${email} answered ${response.status}: ${await response.text()}`);
  }
  return { cookie: cookieHeader(response) };
}

/** The `Cookie` header that replays the cookies a response set. */
export function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

/** How a test acts as one of the demo people. */
export function login(
  app: Elysia,
  person: PersonKey,
  headers: Record<string, string> = {},
): Promise<Record<string, string>> {
  return loginWith(app, people[person].email, DEMO_PASSWORD, headers);
}

/** Adds a user who can sign in with `DEMO_PASSWORD` and belongs to no workspace. */
export async function createLoginUser(
  db: Db,
  user: { id: string; email: string; displayName: string },
): Promise<void> {
  await db.insert(schema.users).values(user);
  await db.insert(schema.accounts).values({
    userId: user.id,
    accountId: user.id,
    providerId: "credential",
    password: await hashPassword(DEMO_PASSWORD),
  });
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
