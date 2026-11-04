import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "./api";
import { AuthError } from "./auth";
import { isTransient, reportOnce, unexpectedReference } from "./failure";
import * as sentry from "./sentry";

afterEach(() => {
  vi.restoreAllMocks();
});

const requestId = "8f14e45f-ea9e-4c5b-9a1f-2c7e1d5a3b6c";
const apiError = (status: number | null, code: ApiError["code"]) =>
  new ApiError({ status, code, requestId: status === null ? null : requestId });

describe("isTransient (SDD 8.2「一時的な失敗」)", () => {
  test("the network and an API that is not up, on the API's paths and Better Auth's", () => {
    expect(isTransient(apiError(null, null))).toBe(true);
    expect(isTransient(apiError(503, "UPSTREAM_UNAVAILABLE"))).toBe(true);
    expect(isTransient(new AuthError({ status: null, code: null }))).toBe(true);
    expect(
      isTransient(new AuthError({ status: 502, code: "UPSTREAM_UNAVAILABLE" })),
    ).toBe(true);
  });

  test("not a 500, a refusal, a rate limit or a failure of the Web's own", () => {
    expect(isTransient(apiError(500, "INTERNAL"))).toBe(false);
    expect(isTransient(apiError(409, "ARCHIVED"))).toBe(false);
    expect(isTransient(apiError(429, "RATE_LIMITED"))).toBe(false);
    expect(isTransient(new Error("render"))).toBe(false);
  });
});

describe("unexpectedReference (SDD 8.2・8.3・11章)", () => {
  test("an API 4xx shown as unexpected goes to Sentry once, tagged with its request id", () => {
    const report = vi.spyOn(sentry, "reportError").mockReturnValue("e1");
    const error = apiError(409, "DRAFT_EXISTS");
    expect(unexpectedReference(error)).toBe(requestId);
    expect(unexpectedReference(error)).toBe(requestId);
    expect(report).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(error, { requestId });
  });

  test("Better Auth's 4xx too, with the request id of its answer", () => {
    const report = vi.spyOn(sentry, "reportError").mockReturnValue("e1");
    const error = new AuthError({ status: 400, code: "WHATEVER", requestId });
    expect(unexpectedReference(error)).toBe(requestId);
    expect(report).toHaveBeenCalledWith(error, { requestId });
  });

  test("a 5xx is the API's to send; a lost session and the network are never sent", () => {
    const report = vi.spyOn(sentry, "reportError").mockReturnValue("e1");
    expect(unexpectedReference(apiError(500, "INTERNAL"))).toBe(requestId);
    expect(unexpectedReference(apiError(401, "UNAUTHENTICATED"))).toBe(
      requestId,
    );
    expect(unexpectedReference(apiError(null, null))).toBeNull();
    expect(report).not.toHaveBeenCalled();
  });

  test("a failure of the Web's own is sent and referred to by its event id", () => {
    const report = vi
      .spyOn(sentry, "reportError")
      .mockReturnValue("evt123456789");
    const error = new TypeError("x is undefined");
    expect(unexpectedReference(error)).toBe("evt123456789");
    expect(reportOnce(error)).toBe("evt123456789");
    expect(report).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(error);
  });
});
