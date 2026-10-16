import { afterAll, describe, expect, test } from "bun:test";
import { createTransport, type ErrorEvent } from "@sentry/bun";
import { sql } from "drizzle-orm";
import { createErrorReporter, redactUrl, scrubEvent } from "./sentry";
import { buildTestApp, connectTestDatabase, testConfig } from "./test-app";

const database = connectTestDatabase();
afterAll(() => database.close());

const DSN = "https://public@o0.ingest.sentry.io/1";

/** A reporter whose transport keeps every envelope instead of sending it. */
function capturingReporter(config = testConfig) {
  const envelopes: string[] = [];
  const reporter = createErrorReporter(
    { ...config, sentryDsn: DSN },
    (options) =>
      createTransport(options, async (request) => {
        envelopes.push(
          typeof request.body === "string"
            ? request.body
            : new TextDecoder().decode(request.body),
        );
        return { statusCode: 200 };
      }),
  );
  const events = () =>
    envelopes.map((envelope) => {
      // An envelope is a header line, an item header line and the event.
      const [, , event] = envelope.split("\n");
      return JSON.parse(event ?? "{}") as ErrorEvent;
    });
  return { reporter, envelopes, events };
}

describe("redactUrl", () => {
  test.each([
    [
      "https://moonx.example/api/v1/ideas/1?q=secret#frag",
      "https://moonx.example/api/v1/ideas/1",
    ],
    [
      "https://moonx.example/invite/tok123",
      "https://moonx.example/invite/[redacted]",
    ],
    [
      "https://moonx.example/api/v1/invitations/by-token/tok123/accept",
      "https://moonx.example/api/v1/invitations/by-token/[redacted]/accept",
    ],
    [
      "https://moonx.example/api/auth/reset-password/tok123?callbackURL=/x",
      "https://moonx.example/api/auth/reset-password/[redacted]",
    ],
    ["https://moonx.example/invite/", "https://moonx.example/invite/"],
    ["not a url", ""],
  ])("%s → %s", (url, expected) => {
    expect(redactUrl(url)).toBe(expected);
  });
});

describe("scrubEvent", () => {
  test("keeps only what SDD 7.2 lets an event carry", () => {
    const event: ErrorEvent = {
      type: undefined,
      request: {
        method: "POST",
        url: "https://moonx.example/invite/tok?next=/x",
        headers: { authorization: "Bearer secret" },
        cookies: { session: "secret" },
        query_string: "next=/x",
        data: { password: "secret" },
        env: { REMOTE_ADDR: "203.0.113.1" },
      },
      user: { id: "user-1", email: "a@example.com", ip_address: "203.0.113.1" },
      breadcrumbs: [{ message: "navigated to /invite/tok" }],
      extra: { body: "secret" },
      tags: { requestId: "r1" },
      exception: {
        values: [
          {
            type: "Error",
            value: "boom",
            stacktrace: {
              frames: [
                { function: "f", lineno: 1, vars: { password: "secret" } },
              ],
            },
          },
        ],
      },
    };

    expect(scrubEvent(event)).toEqual({
      type: undefined,
      request: {
        method: "POST",
        url: "https://moonx.example/invite/[redacted]",
      },
      user: { id: "user-1" },
      tags: { requestId: "r1" },
      exception: {
        values: [
          {
            type: "Error",
            value: "boom",
            stacktrace: { frames: [{ function: "f", lineno: 1 }] },
          },
        ],
      },
    });
  });

  test("drops a user without an id", () => {
    const scrubbed = scrubEvent({
      type: undefined,
      user: { email: "a@example.com" },
    });

    expect(scrubbed.user).toBeUndefined();
  });
});

describe("createErrorReporter", () => {
  test("does nothing without a DSN", async () => {
    const reporter = createErrorReporter(testConfig);

    await expect(
      reporter.report({
        error: new Error("x"),
        requestId: "r",
        route: null,
        userId: null,
        method: "GET",
        url: "http://localhost/",
      }),
    ).resolves.toBeUndefined();
  });

  test("sends a failed request without the user's data (SDD 7.2「個人情報」, 11章)", async () => {
    const { reporter, envelopes, events } = capturingReporter({
      ...testConfig,
      appEnv: "staging",
    });
    const { app } = buildTestApp(database, {
      config: { appEnv: "staging" },
      reporter,
    });
    // A path no route of the app has, with a token segment the URL must lose.
    app.post("/api/v1/invitations/by-token/:token/fail", () => {
      throw new TypeError("handler bug");
    });

    const response = await app.handle(
      new Request(
        "http://localhost/api/v1/invitations/by-token/invite-secret-token/fail?next=query-secret#fragment-secret",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: "__Secure-better-auth.session_token=cookie-secret",
            authorization: "Bearer header-secret",
            "x-forwarded-for": "203.0.113.9",
          },
          body: JSON.stringify({ password: "body-secret" }),
        },
      ),
    );

    expect(response.status).toBe(500);
    expect(envelopes).toHaveLength(1);
    const raw = envelopes.join("\n");
    for (const secret of [
      "invite-secret-token",
      "query-secret",
      "fragment-secret",
      "cookie-secret",
      "header-secret",
      "body-secret",
      "203.0.113.9",
    ]) {
      expect(raw).not.toContain(secret);
    }
    const [event] = events();
    expect(event).toMatchObject({
      environment: "staging",
      release: "abc1234",
      level: "error",
      tags: {
        requestId: response.headers.get("x-request-id"),
        route: "POST /api/v1/invitations/by-token/:token/fail",
      },
      request: {
        method: "POST",
        url: "http://localhost/api/v1/invitations/by-token/[redacted]/fail",
      },
      exception: { values: [{ type: "TypeError", value: "handler bug" }] },
    });
    expect(event?.user).toBeUndefined();
    expect(event?.breadcrumbs).toBeUndefined();
    expect(Object.keys(event?.request ?? {}).sort()).toEqual(["method", "url"]);
  });

  test("sends a database error by its code, without the query or its values", async () => {
    const { reporter, envelopes, events } = capturingReporter();
    const { app } = buildTestApp(database, { reporter });
    app.get("/api/v1/db-crash", async () => {
      await database.db.execute(sql`select ${"value-secret"}::int as broken`);
    });

    const response = await app.handle(
      new Request("http://localhost/api/v1/db-crash"),
    );

    expect(response.status).toBe(500);
    const raw = envelopes.join("\n");
    expect(raw).not.toContain("value-secret");
    expect(raw).not.toContain("broken");
    expect(events()[0]?.exception?.values?.[0]).toMatchObject({
      type: "PostgresError",
      value: "PostgreSQL error 22P02",
    });
  });

  test("sends the user's id, and nothing else about them, once authentication sets it", async () => {
    const { reporter, events } = capturingReporter();

    await reporter.report({
      error: new Error("boom"),
      requestId: "r",
      route: "GET /api/v1/x",
      userId: "6c1f8f1e-6f3e-4a51-9b2e-0d3c2f1a9b7e",
      method: "GET",
      url: "http://localhost/api/v1/x",
    });

    expect(events()[0]?.user).toEqual({
      id: "6c1f8f1e-6f3e-4a51-9b2e-0d3c2f1a9b7e",
    });
  });
});
