import { describe, expect, test } from "vitest";
import { authErrorOf, safeNext } from "./auth";

describe("safeNext: where a sign-in may go back to (SDD 4章 ?next=)", () => {
  test("a path of this site, with its search and hash", () => {
    expect(safeNext("/w/1?modal=switch-workspace#top")).toBe(
      "/w/1?modal=switch-workspace#top",
    );
    expect(safeNext("/")).toBe("/");
  });

  test("anywhere else is dropped", () => {
    for (const next of [
      undefined,
      "",
      "w/1",
      "//evil.example/w/1",
      "/\\evil.example",
      "https://evil.example/",
      "javascript:alert(1)",
      "/.//evil.example",
      "/a/..//evil.example",
      "/./\\evil.example",
      "/%2F%2Fevil.example",
      "/%5cevil.example",
    ]) {
      expect(safeNext(next)).toBeUndefined();
    }
  });
});

describe("authErrorOf: Better Auth's { code, message } (SDD 8.1)", () => {
  test("the code, the request id and the wait of a 429", () => {
    const error = authErrorOf(
      new Response(null, {
        status: 429,
        headers: { "x-request-id": "8f14e45f", "x-retry-after": "45" },
      }),
      { code: "RATE_LIMITED", message: "Too many requests" },
    );
    expect(error.status).toBe(429);
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.requestId).toBe("8f14e45f");
    expect(error.retryAfterSeconds).toBe(45);
  });

  test("Better Auth's own codes stay as they are", () => {
    const error = authErrorOf(new Response(null, { status: 401 }), {
      code: "INVALID_EMAIL_OR_PASSWORD",
      message: "Invalid email or password",
    });
    expect(error.code).toBe("INVALID_EMAIL_OR_PASSWORD");
    expect(error.retryAfterSeconds).toBeNull();
    expect(error.requestId).toBeNull();
  });

  test("a bare 502–504 from the front of Cloud Run is UPSTREAM_UNAVAILABLE", () => {
    for (const status of [502, 503, 504]) {
      expect(authErrorOf(new Response(null, { status }), null).code).toBe(
        "UPSTREAM_UNAVAILABLE",
      );
    }
    expect(authErrorOf(new Response(null, { status: 500 }), null).code).toBe(
      null,
    );
  });
});
