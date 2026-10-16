import { afterAll, describe, expect, test } from "bun:test";
import { rateLimits } from "@moonx/db";
import { errorBodySchema } from "@moonx/schemas";
import { sql } from "drizzle-orm";
import { t } from "elysia";
import { z } from "zod";
import { JSON_BODY_MAX_BYTES } from "./body";
import { CLIENT_IP_HEADER, requestContext } from "./entry";
import { ApiError } from "./errors";
import {
  accessLine,
  buildTestApp,
  connectTestDatabase,
  uniqueIp,
  waitForLine,
} from "./test-app";

const database = connectTestDatabase();
afterAll(() => database.close());

const ORIGIN = "http://localhost:5173";

/** An app with routes standing in for the endpoints later steps add. */
function appWithRoutes(options: Parameters<typeof buildTestApp>[1] = {}) {
  const built = buildTestApp(database, options);
  const app = built.app
    .post("/api/v1/echo", ({ body }) => ({ body }))
    .post("/api/v1/amounts", ({ body }) => body, {
      body: z.object({
        amount: z.number().min(0),
        name: z.string().max(5),
      }),
    })
    .get("/api/v1/items", ({ query }) => query, {
      query: z.object({ cursor: z.coerce.number().int().min(0) }),
    })
    .post("/api/v1/typebox", ({ body }) => body, {
      body: t.Object({ items: t.Array(t.Object({ name: t.String() })) }),
    })
    .delete("/api/v1/items/:id", () => new Response(null, { status: 204 }))
    .put("/api/v1/me/avatar", ({ body }) => ({ ok: body !== undefined }))
    .get("/api/v1/crash", () => {
      throw new TypeError("a bug in a handler");
    })
    .get("/api/v1/db-crash", async () => {
      await database.db.execute(
        sql`select ${"private-input-value"}::int as broken`,
      );
    })
    .get("/api/v1/injected-stack", async () => {
      await database.db.execute(
        sql`select ${"x\n    at password=hunter2"}::int as broken`,
      );
    })
    .get("/api/v1/duplicate", async () => {
      const key = `app:test:duplicate:${crypto.randomUUID()}`;
      await database.db
        .insert(rateLimits)
        .values({ key, count: 1, lastRequest: 0 });
      await database.db
        .insert(rateLimits)
        .values({ key, count: 1, lastRequest: 0 });
    })
    .get("/api/v1/denied", () => {
      throw new ApiError("UNAUTHENTICATED", "Sign in first");
    })
    .get("/api/v1/forbidden", () => {
      throw new ApiError("FORBIDDEN", "Not allowed");
    })
    .get("/api/v1/conflict", () => {
      throw new ApiError("CONFLICT", "Changed meanwhile", {
        current: { lockVersion: 3 },
      });
    })
    .get("/api/v1/whoami", ({ request }) => ({
      ...requestContext(request),
      header: request.headers.get(CLIENT_IP_HEADER),
    }))
    .post(
      "/api/auth/test-echo",
      async ({ request }) => ({
        length: (await request.arrayBuffer()).byteLength,
      }),
      { parse: "none" },
    )
    .get("/api/auth/limited", () => {
      throw new ApiError("RATE_LIMITED", "Too many attempts", {
        retryAfterSeconds: 42,
      });
    });
  return { ...built, app };
}

const request = (
  method: string,
  path: string,
  init: { headers?: Record<string, string>; body?: RequestInit["body"] } = {},
) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { "x-forwarded-for": uniqueIp(), ...init.headers },
    body: init.body,
    // A ReadableStream body is sent chunked, without Content-Length.
    ...(init.body instanceof ReadableStream ? { duplex: "half" } : {}),
  } as RequestInit);

const json = (
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  request(method, path, {
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** A body sent in chunks with no Content-Length, `size` bytes in all. */
function chunked(size: number): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      const next = Math.min(64 * 1024, size - sent);
      if (next === 0) return controller.close();
      controller.enqueue(new Uint8Array(next).fill(0x20));
      sent += next;
    },
  });
}

/** The `error` of an 8.1 body, its own extra fields kept. */
async function errorOf(response: Response) {
  const { error } = errorBodySchema.parse(await response.json());
  expect(error.requestId).toBe(response.headers.get("x-request-id") ?? "");
  return error;
}

/** The context `/api/v1/whoami` echoes. */
async function whoami(response: Response) {
  return (await response.json()) as {
    clientIp?: string;
    /** What the request carries in X-Moonx-Client-Ip once the entry plugin ran. */
    header: string | null;
  };
}

describe("caller IP (SDD 7.2)", () => {
  test("is the rightmost X-Forwarded-For value", async () => {
    const { app, lines } = appWithRoutes();
    const response = await app.handle(
      request("GET", "/api/v1/whoami", {
        headers: {
          "x-forwarded-for": "203.0.113.7, 198.51.100.4 , 192.0.2.9 ",
        },
      }),
    );

    expect((await whoami(response)).clientIp).toBe("192.0.2.9");
    expect((await accessLine(lines, response)).clientIp).toBe("192.0.2.9");
  });

  test("ignores what a client claims to its left", async () => {
    const { app } = appWithRoutes();
    const response = await app.handle(
      request("GET", "/api/v1/whoami", {
        headers: { "x-forwarded-for": "10.0.0.1, 203.0.113.50" },
      }),
    );

    expect((await whoami(response)).clientIp).toBe("203.0.113.50");
  });

  test("is unknown without the header or a connection", async () => {
    const { app, lines } = appWithRoutes();
    const response = await app.handle(
      new Request("http://localhost/api/v1/whoami"),
    );

    expect((await whoami(response)).clientIp).toBeUndefined();
    expect((await accessLine(lines, response)).clientIp).toBeNull();
  });

  test("goes on in X-Moonx-Client-Ip for Better Auth, replacing what the client sent", async () => {
    const { app } = appWithRoutes();
    const sent = await app.handle(
      request("GET", "/api/v1/whoami", {
        headers: {
          "x-forwarded-for": "198.51.100.4, 192.0.2.9",
          [CLIENT_IP_HEADER]: "203.0.113.66",
        },
      }),
    );
    const unknown = await app.handle(
      new Request("http://localhost/api/v1/whoami", {
        headers: { [CLIENT_IP_HEADER]: "203.0.113.66" },
      }),
    );

    expect((await whoami(sent)).header).toBe("192.0.2.9");
    expect((await whoami(unknown)).header).toBeNull();
  });
});

describe("request ID (SDD 8.3)", () => {
  test("is made by the API, not taken from the client", async () => {
    const { app, lines } = appWithRoutes();
    const response = await app.handle(
      request("GET", "/api/v1/denied", {
        headers: { "x-request-id": "forged" },
      }),
    );
    const requestId = response.headers.get("x-request-id") ?? "";

    expect(requestId).not.toBe("forged");
    expect(z.uuid().safeParse(requestId).success).toBe(true);
    expect((await errorOf(response)).requestId).toBe(requestId);
    expect((await accessLine(lines, response)).requestId).toBe(requestId);
  });

  test("differs per request", async () => {
    const { app } = appWithRoutes();
    const first = await app.handle(request("GET", "/api/health"));
    const second = await app.handle(request("GET", "/api/health"));

    expect(first.headers.get("x-request-id")).not.toBe(
      second.headers.get("x-request-id"),
    );
  });
});

describe("access log (SDD 8.3, ADR-023)", () => {
  test("writes one JSON line with the fields of ADR-023", async () => {
    const { app, lines } = appWithRoutes();
    const response = await app.handle(
      request("DELETE", "/api/v1/items/123", {
        headers: {
          "content-type": "application/json",
          "x-moonx-client": "web_mobile",
          "x-forwarded-for": "192.0.2.33",
        },
      }),
    );
    const line = await accessLine(lines, response);

    expect(response.status).toBe(204);
    expect(line).toEqual({
      severity: "INFO",
      message: "request",
      requestId: response.headers.get("x-request-id"),
      userId: null,
      route: "DELETE /api/v1/items/:id",
      status: 204,
      latencyMs: expect.any(Number),
      client: "web_mobile",
      clientIp: "192.0.2.33",
    });
    expect(Number.isInteger(line.latencyMs)).toBe(true);
    expect(
      lines.filter((l) => l.requestId === response.headers.get("x-request-id")),
    ).toHaveLength(1);
  });

  test("records the route pattern, never the path with its values", async () => {
    const { app, lines } = appWithRoutes();
    const response = await app.handle(
      request("DELETE", "/api/v1/items/secret-token-like-id", {
        headers: { "content-type": "application/json" },
      }),
    );

    expect(JSON.stringify(await accessLine(lines, response))).not.toContain(
      "secret-token-like-id",
    );
  });

  test("records an unmatched route as null", async () => {
    const { app, lines } = appWithRoutes();
    const response = await app.handle(request("GET", "/nowhere/abc"));

    expect(response.status).toBe(404);
    expect(await accessLine(lines, response)).toMatchObject({
      route: null,
      status: 404,
      severity: "INFO",
    });
  });

  for (const [header, expected] of [
    ["web", "web"],
    ["web_mobile", "web_mobile"],
    ["ios", "unknown"],
    [undefined, "unknown"],
  ] as const) {
    test(`records X-Moonx-Client ${header ?? "(absent)"} as ${expected}`, async () => {
      const { app, lines } = appWithRoutes();
      const response = await app.handle(
        request("GET", "/api/health", {
          headers: header === undefined ? {} : { "x-moonx-client": header },
        }),
      );

      expect(response.status).toBe(200);
      expect((await accessLine(lines, response)).client).toBe(expected);
    });
  }

  test("drops lines below LOG_LEVEL", async () => {
    const { app, lines } = appWithRoutes({ config: { logLevel: "warn" } });
    await app.handle(request("GET", "/api/health"));
    const failed = await app.handle(request("GET", "/api/v1/crash"));

    expect(failed.status).toBe(500);
    await accessLine(lines, failed);
    expect(lines.map((line) => line.severity)).toEqual(["ERROR", "ERROR"]);
  });
});

describe("log levels (SDD 8.3)", () => {
  test("logs 4xx as INFO", async () => {
    const { app, lines } = appWithRoutes();
    const response = await app.handle(request("GET", "/api/v1/conflict"));

    expect(response.status).toBe(409);
    expect((await accessLine(lines, response)).severity).toBe("INFO");
  });

  test("turns 401 and 403 from one IP into WARNING after 10 a minute", async () => {
    let clock = 5_000_000;
    const { app, lines } = appWithRoutes({ now: () => clock });
    const ip = uniqueIp();
    const severities: unknown[] = [];
    for (let i = 0; i < 12; i++) {
      const path = i % 2 === 0 ? "/api/v1/denied" : "/api/v1/forbidden";
      const response = await app.handle(
        request("GET", path, { headers: { "x-forwarded-for": ip } }),
      );
      severities.push((await accessLine(lines, response)).severity);
    }
    const otherIp = await app.handle(request("GET", "/api/v1/denied"));
    clock += 60_000;
    const nextMinute = await app.handle(
      request("GET", "/api/v1/denied", { headers: { "x-forwarded-for": ip } }),
    );

    expect(severities).toEqual([
      ...Array(10).fill("INFO"),
      "WARNING",
      "WARNING",
    ]);
    expect((await accessLine(lines, otherIp)).severity).toBe("INFO");
    expect((await accessLine(lines, nextMinute)).severity).toBe("INFO");
  });

  test("keeps WARNING while denials go on past the minute the flood began in", async () => {
    let clock = 7_000_000;
    const { app, lines } = appWithRoutes({ now: () => clock });
    const ip = uniqueIp();
    const deny = async () =>
      (
        await accessLine(
          lines,
          await app.handle(
            request("GET", "/api/v1/denied", {
              headers: { "x-forwarded-for": ip },
            }),
          ),
        )
      ).severity;
    for (let i = 0; i < 10; i++) {
      await deny();
      clock += 5_000;
    }
    const eleventh = await deny();
    // 61s after the first: the 10 denials since +5s are still within a minute.
    clock += 11_000;
    const later = await deny();

    expect(eleventh).toBe("WARNING");
    expect(later).toBe("WARNING");
  });

  test("logs a 5xx twice: the access line and a request failed line with the error", async () => {
    const { app, lines, reports } = appWithRoutes();
    const response = await app.handle(request("GET", "/api/v1/crash"));
    const requestId = response.headers.get("x-request-id") ?? "";

    expect(response.status).toBe(500);
    expect(await errorOf(response)).toEqual({
      code: "INTERNAL",
      message: "Internal error",
      requestId,
    });
    expect(await accessLine(lines, response)).toMatchObject({
      severity: "ERROR",
      status: 500,
    });
    expect(
      await waitForLine(lines, (line) => line.message === "request failed"),
    ).toEqual({
      severity: "ERROR",
      message: "request failed",
      requestId,
      errorCode: "INTERNAL",
      errorName: "TypeError",
      errorMessage: "a bug in a handler",
      stack: expect.stringContaining("TypeError"),
    });
    expect(reports.map((report) => report.requestId)).toEqual([requestId]);
  });

  test("logs only the code and constraint of a database error, never its SQL or values", async () => {
    const { app, lines, reports } = appWithRoutes();
    const response = await app.handle(request("GET", "/api/v1/db-crash"));
    const failure = await waitForLine(
      lines,
      (line) => line.message === "request failed",
    );

    expect(response.status).toBe(500);
    expect(failure).toMatchObject({
      errorCode: "INTERNAL",
      errorName: "PostgresError",
      pgCode: "22P02",
    });
    expect(failure.errorMessage).toBeUndefined();
    const text = JSON.stringify(lines);
    expect(text).not.toContain("private-input-value");
    expect(text).not.toContain("select");
    expect(reports).toHaveLength(1);
  });

  test("still answers 500 when Sentry cannot take the report, and logs that", async () => {
    const { app, lines } = appWithRoutes({
      reporter: {
        report: () => Promise.reject(new Error("sentry is down")),
      },
    });
    const response = await app.handle(request("GET", "/api/v1/crash"));

    expect(response.status).toBe(500);
    expect(
      await waitForLine(
        lines,
        (line) => line.message === "sentry report failed",
      ),
    ).toMatchObject({
      severity: "ERROR",
      requestId: response.headers.get("x-request-id"),
      errorMessage: "sentry is down",
    });
  });

  test("keeps input that looks like stack frames out of a database error's stack", async () => {
    const { app, lines } = appWithRoutes();
    await app.handle(request("GET", "/api/v1/injected-stack"));
    const failure = await waitForLine(
      lines,
      (line) => line.message === "request failed",
    );

    expect(failure.pgCode).toBe("22P02");
    expect(JSON.stringify(lines)).not.toContain("hunter2");
  });

  test("names the constraint a database error broke", async () => {
    const { app, lines } = appWithRoutes();
    const response = await app.handle(request("GET", "/api/v1/duplicate"));
    const failure = await waitForLine(
      lines,
      (line) => line.message === "request failed",
    );

    expect(response.status).toBe(500);
    expect(failure).toMatchObject({
      pgCode: "23505",
      constraint: "rate_limits_key_unique",
    });
    expect(JSON.stringify(failure)).not.toContain("app:test:duplicate");
  });

  test("does not report 4xx to Sentry", async () => {
    const { app, reports } = appWithRoutes();
    await app.handle(request("GET", "/api/v1/forbidden"));
    await app.handle(request("GET", "/missing"));

    expect(reports).toEqual([]);
  });
});

describe("error shape (SDD 8.1)", () => {
  test("answers an unknown route with 404 NOT_FOUND", async () => {
    const { app } = appWithRoutes();
    const response = await app.handle(request("GET", "/api/v1/nothing"));

    expect(response.status).toBe(404);
    expect((await errorOf(response)).code).toBe("NOT_FOUND");
  });

  test("adds the fields a code carries", async () => {
    const { app } = appWithRoutes();
    const response = await app.handle(request("GET", "/api/v1/conflict"));

    expect(await errorOf(response)).toEqual({
      code: "CONFLICT",
      message: "Changed meanwhile",
      requestId: response.headers.get("x-request-id") ?? "",
      current: { lockVersion: 3 },
    });
  });

  test("answers failed input with 422 VALIDATION_FAILED, one detail per issue, without the values", async () => {
    const { app } = appWithRoutes();
    const response = await app.handle(
      json(
        "POST",
        "/api/v1/amounts",
        { amount: -5, name: "too long value" },
        { origin: ORIGIN },
      ),
    );

    expect(response.status).toBe(422);
    const error = await errorOf(response);
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.details).toEqual([
      { path: "amount", code: "too_small", message: expect.any(String) },
      { path: "name", code: "too_big", message: expect.any(String) },
    ]);
    // Without the request ID, a UUID that may contain "-5" by chance.
    const { requestId: _, ...rest } = error;
    const text = JSON.stringify(rest);
    expect(text).not.toContain("-5");
    expect(text).not.toContain("too long value");
  });

  test("names the query parameter that failed", async () => {
    const { app } = appWithRoutes();
    const response = await app.handle(
      request("GET", "/api/v1/items?cursor=abc"),
    );

    expect(response.status).toBe(422);
    expect((await errorOf(response)).details).toEqual([
      { path: "cursor", code: "invalid_type", message: expect.any(String) },
    ]);
  });

  test("reads the issues of a TypeBox schema too", async () => {
    const { app } = appWithRoutes();
    const response = await app.handle(
      json("POST", "/api/v1/typebox", { items: [{ name: 1 }] }),
    );

    expect(response.status).toBe(422);
    expect((await errorOf(response)).details).toEqual([
      { path: "items.0.name", code: "custom", message: expect.any(String) },
    ]);
  });

  test("answers a body that is not JSON with 400 BAD_REQUEST", async () => {
    const { app } = appWithRoutes();
    const response = await app.handle(
      request("POST", "/api/v1/echo", {
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
    );

    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe("BAD_REQUEST");
  });
});

describe("CSRF on state-changing /api/v1 requests (SDD 7.2)", () => {
  test("accepts JSON from a trusted origin or without Origin", async () => {
    const { app } = appWithRoutes();
    const cases: Record<string, string>[] = [{ origin: ORIGIN }, {}];
    for (const headers of cases) {
      const response = await app.handle(
        json("POST", "/api/v1/echo", { a: 1 }, headers),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ body: { a: 1 } });
    }
  });

  test("logs a request it rejects before routing, with no route", async () => {
    const { app, lines } = appWithRoutes();
    const response = await app.handle(
      json(
        "POST",
        "/api/v1/echo",
        { a: 1 },
        { origin: "https://evil.example" },
      ),
    );

    expect(await accessLine(lines, response)).toMatchObject({
      route: null,
      status: 403,
    });
  });

  test("answers an untrusted Origin with 403 FORBIDDEN", async () => {
    const { app } = appWithRoutes();
    for (const origin of ["https://evil.example", "null", `${ORIGIN}/`]) {
      const response = await app.handle(
        json("POST", "/api/v1/echo", { a: 1 }, { origin }),
      );
      expect(response.status).toBe(403);
      expect((await errorOf(response)).code).toBe("FORBIDDEN");
    }
  });

  test("checks DELETE, PUT and PATCH as well, even before routing", async () => {
    const { app } = appWithRoutes();
    for (const method of ["DELETE", "PUT", "PATCH"]) {
      const response = await app.handle(
        json(method, "/api/v1/items/1", undefined, {
          origin: "https://evil.example",
        }),
      );
      expect(response.status).toBe(403);
    }
  });

  test("answers a body that is not JSON with 400 BAD_REQUEST", async () => {
    const { app } = appWithRoutes();
    for (const contentType of [
      "text/plain",
      "application/x-www-form-urlencoded",
      "multipart/form-data; boundary=x",
    ]) {
      const response = await app.handle(
        request("POST", "/api/v1/echo", {
          headers: { "content-type": contentType },
          body: "a=1",
        }),
      );
      expect(response.status).toBe(400);
      expect((await errorOf(response)).code).toBe("BAD_REQUEST");
    }
  });

  test("requires application/json without a body too", async () => {
    const { app } = appWithRoutes();
    const bare = await app.handle(request("DELETE", "/api/v1/items/1"));
    const declared = await app.handle(json("DELETE", "/api/v1/items/1"));
    const emptyPost = await app.handle(json("POST", "/api/v1/echo"));

    expect(bare.status).toBe(400);
    expect(declared.status).toBe(204);
    expect(emptyPost.status).toBe(200);
    expect(await emptyPost.json()).toEqual({ body: null });
  });

  test("accepts a charset parameter on application/json", async () => {
    const { app } = appWithRoutes();
    const response = await app.handle(
      json(
        "POST",
        "/api/v1/echo",
        { a: 1 },
        {
          "content-type": "Application/JSON; charset=utf-8",
        },
      ),
    );

    expect(response.status).toBe(200);
  });

  test("takes multipart/form-data only on PUT /api/v1/me/avatar", async () => {
    const { app } = appWithRoutes();
    const form = new FormData();
    form.append("file", new Blob(["x"]), "a.png");
    const upload = await app.handle(
      new Request("http://localhost/api/v1/me/avatar", {
        method: "PUT",
        body: form,
      }),
    );
    const jsonAvatar = await app.handle(json("PUT", "/api/v1/me/avatar", {}));

    expect(upload.status).toBe(200);
    expect(jsonAvatar.status).toBe(400);
  });

  test("answers a malformed multipart body with 400 BAD_REQUEST", async () => {
    const { app } = appWithRoutes();
    const response = await app.handle(
      request("PUT", "/api/v1/me/avatar", {
        headers: { "content-type": "multipart/form-data; boundary=x" },
        body: "not multipart at all",
      }),
    );

    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe("BAD_REQUEST");
  });

  test("leaves reads alone", async () => {
    const { app } = appWithRoutes();
    const response = await app.handle(
      request("GET", "/api/v1/items?cursor=1", {
        headers: { origin: "https://evil.example" },
      }),
    );

    expect(response.status).toBe(200);
  });
});

describe("body size (SDD 7.2, 8.1 の 413, ADR-029)", () => {
  const justOver = JSON_BODY_MAX_BYTES + 1;

  test("answers JSON over 1MB with 413 PAYLOAD_TOO_LARGE", async () => {
    const { app } = appWithRoutes();
    const response = await app.handle(
      json("POST", "/api/v1/echo", { text: "x".repeat(JSON_BODY_MAX_BYTES) }),
    );

    expect(response.status).toBe(413);
    expect((await errorOf(response)).code).toBe("PAYLOAD_TOO_LARGE");
  });

  test("rejects by Content-Length alone, before reading the body", async () => {
    const { app } = appWithRoutes();
    const declared = { "content-length": String(justOver) };
    const v1 = await app.handle(
      json("POST", "/api/v1/echo", { a: 1 }, declared),
    );
    const auth = await app.handle(
      request("POST", "/api/auth/test-echo", {
        headers: { "content-type": "application/json", ...declared },
        body: "{}",
      }),
    );

    expect(v1.status).toBe(413);
    expect((await errorOf(v1)).code).toBe("PAYLOAD_TOO_LARGE");
    expect(auth.status).toBe(413);
    expect(await auth.json()).toEqual({
      code: "PAYLOAD_TOO_LARGE",
      message: expect.any(String),
    });
  });

  test("counts the bytes read when a chunked JSON body has no Content-Length", async () => {
    const { app } = appWithRoutes();
    const response = await app.handle(
      request("POST", "/api/v1/echo", {
        headers: { "content-type": "application/json" },
        body: chunked(justOver),
      }),
    );

    expect(response.status).toBe(413);
    expect((await errorOf(response)).code).toBe("PAYLOAD_TOO_LARGE");
  });

  test("accepts JSON of exactly 1MB", async () => {
    const { app } = appWithRoutes();
    const text = "x".repeat(JSON_BODY_MAX_BYTES - '{"text":""}'.length);
    const response = await app.handle(json("POST", "/api/v1/echo", { text }));

    expect(response.status).toBe(200);
  });

  test("answers an /api/auth/* body over 1MB in Better Auth's shape", async () => {
    const { app } = appWithRoutes();
    const declared = await app.handle(
      request("POST", "/api/auth/test-echo", {
        headers: { "content-type": "application/json" },
        body: "x".repeat(justOver),
      }),
    );
    const streamed = await app.handle(
      request("POST", "/api/auth/test-echo", {
        headers: { "content-type": "application/json" },
        body: chunked(justOver),
      }),
    );

    for (const response of [declared, streamed]) {
      expect(response.status).toBe(413);
      expect(await response.json()).toEqual({
        code: "PAYLOAD_TOO_LARGE",
        message: expect.any(String),
      });
    }
  });

  test("leaves an /api/auth/* body within the limit for its handler to read", async () => {
    const { app } = appWithRoutes();
    const response = await app.handle(
      request("POST", "/api/auth/test-echo", {
        headers: { "content-type": "application/json" },
        body: chunked(JSON_BODY_MAX_BYTES),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ length: JSON_BODY_MAX_BYTES });
  });

  test("answers 429 on /api/auth/* with X-Retry-After in Better Auth's shape", async () => {
    const { app } = appWithRoutes();
    const response = await app.handle(request("GET", "/api/auth/limited"));

    expect(response.status).toBe(429);
    expect(response.headers.get("x-retry-after")).toBe("42");
    expect(await response.json()).toEqual({
      code: "RATE_LIMITED",
      message: "Too many attempts",
    });
  });
});

describe("requestContext", () => {
  test("throws for a request the entry plugin never saw", () => {
    expect(() => requestContext(new Request("http://localhost/"))).toThrow(
      "entry plugin",
    );
  });
});

describe("over a real connection", () => {
  /** Serves the test app on a free port of this machine. */
  function serve(options: Parameters<typeof buildTestApp>[1] = {}) {
    const built = appWithRoutes(options);
    built.app.listen({ port: 0, hostname: "127.0.0.1" });
    const port = built.app.server?.port;
    if (port === undefined) throw new Error("no port assigned");
    return { ...built, port, stop: () => built.app.stop(true) };
  }

  /** Writes raw bytes, then either reads the whole answer or hangs up at once. */
  async function exchange(
    port: number,
    text: string,
    hangUp: boolean,
  ): Promise<string> {
    let answer = "";
    const { promise: closed, resolve } = Promise.withResolvers<void>();
    const socket = await Bun.connect({
      hostname: "127.0.0.1",
      port,
      socket: {
        data(_, data) {
          answer += new TextDecoder().decode(data);
        },
        close() {
          resolve();
        },
        error() {
          resolve();
        },
      },
    });
    socket.write(text);
    if (hangUp) socket.end();
    await closed;
    return answer;
  }

  const partBody = "x".repeat(64 * 1024);

  for (const [name, path, headers] of [
    [
      "a chunked /api/auth/* body",
      "/api/auth/test-echo",
      "Transfer-Encoding: chunked",
    ],
    [
      "an /api/auth/* body with Content-Length",
      "/api/auth/test-echo",
      "Content-Length: 999999",
    ],
    [
      "a chunked /api/v1 JSON body",
      "/api/v1/echo",
      "Transfer-Encoding: chunked",
    ],
  ] as const) {
    test(`ends ${name} whose client hangs up halfway with 400 in the log`, async () => {
      const { port, lines, stop } = serve();
      try {
        const chunk = headers.startsWith("Transfer")
          ? `${partBody.length.toString(16)}\r\n${partBody}\r\n`
          : partBody;
        await exchange(
          port,
          `POST ${path} HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\n${headers}\r\n\r\n${chunk}`,
          true,
        );

        expect(
          await waitForLine(lines, (line) => line.message === "request"),
        ).toMatchObject({ status: 400 });
      } finally {
        stop();
      }
    });
  }

  test("checks the path the router runs even when the Host is short", async () => {
    const { port, stop } = serve();
    try {
      const answer = await exchange(
        port,
        "POST /ab/api/v1/echo HTTP/1.1\r\nHost: x\r\nOrigin: https://evil.example\r\nContent-Type: text/plain\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}",
        false,
      );

      expect(answer).toStartWith("HTTP/1.1 403");
    } finally {
      stop();
    }
  });

  test("answers in its own shape, headers included, when the Host is malformed", async () => {
    const { port, lines, stop } = serve();
    try {
      const answer = await exchange(
        port,
        "GET /api/v1/nothing HTTP/1.1\r\nHost: a b\r\nConnection: close\r\n\r\n",
        false,
      );

      expect(answer).toStartWith("HTTP/1.1 404");
      expect(answer.toLowerCase()).toContain("content-security-policy:");
      expect(answer.toLowerCase()).toContain("x-request-id:");
      expect(answer).toContain('"code":"NOT_FOUND"');
      expect(
        await waitForLine(lines, (line) => line.message === "request"),
      ).toMatchObject({ status: 404 });
    } finally {
      stop();
    }
  });
});
