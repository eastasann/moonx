import { createI18n } from "@moonx/i18n";
import { AUTH_HOOK_ERROR_CODES, ERROR_CODES } from "@moonx/schemas";
import { expect, test } from "vitest";
import {
  ApiError,
  type ClientErrorCode,
  fromAuthError,
  fromEnvelope,
  isUnauthenticated,
} from "../src/lib/api-error";
import { errorReference, errorText } from "../src/lib/error-text";

const t = createI18n().t;

test("every API and auth hook code has its own catalog text", () => {
  for (const code of [...ERROR_CODES, ...AUTH_HOOK_ERROR_CODES]) {
    const text = errorText(t, new ApiError(code as ClientErrorCode, 400, "x"));
    expect(text, code).not.toBe(`errors:${code}`);
    expect(text, code).not.toMatch(/\{\{/);
  }
});

test("codes only the client knows have catalog text too", () => {
  expect(errorText(t, new ApiError("INVALID_CREDENTIALS", 401, "x"))).toBe(
    "Email or password is incorrect",
  );
  expect(errorText(t, new ApiError("INVALID_TOKEN", 400, "x"))).toBe(
    "This link is invalid or has expired. Request a new one.",
  );
  expect(errorText(t, new ApiError("NETWORK", 0, "x"))).toBe(t("errors:UPSTREAM_UNAVAILABLE"));
  expect(errorText(t, new ApiError("UNKNOWN", 418, "x"))).toBe(t("errors:INTERNAL"));
  expect(errorText(t, new Error("render failed"))).toBe(t("errors:INTERNAL"));
});

test("the text for an email mismatch names the invited address", () => {
  const error = new ApiError("INVITATION_EMAIL_MISMATCH", 403, "x", null, [], {
    invitedEmail: "new@example.com",
  });
  expect(errorText(t, error)).toBe(
    "This invitation was sent to new@example.com. Log in with that email.",
  );
});

test("an unreadable body is never shown: the server's message stays out of the text", () => {
  const error = new ApiError("FORBIDDEN", 403, "developer-facing english");
  expect(errorText(t, error)).not.toContain("developer-facing");
});

test("the envelope of SDD 8.1 is read into an ApiError", () => {
  const error = fromEnvelope(422, {
    error: {
      code: "VALIDATION_FAILED",
      message: "amount: too small",
      requestId: "8f14e45f-ea9e-4c5b-9a1f-2c7e1d5a3b6c",
      details: [{ path: "amount", code: "too_small", message: "Must be 0 or more" }],
      emptyCount: 2,
    },
  });
  expect(error.code).toBe("VALIDATION_FAILED");
  expect(error.status).toBe(422);
  expect(error.details).toEqual([
    { path: "amount", code: "too_small", message: "Must be 0 or more" },
  ]);
  expect(error.extra).toEqual({ emptyCount: 2 });
  expect(errorReference(error)).toBe("8f14e45f");
});

test("a body that is not the envelope becomes UNKNOWN, or UPSTREAM_UNAVAILABLE for a 5xx", () => {
  expect(fromEnvelope(418, "teapot").code).toBe("UNKNOWN");
  expect(fromEnvelope(502, null).code).toBe("UPSTREAM_UNAVAILABLE");
  expect(fromEnvelope(400, { error: { code: "SOMETHING_NEW" } }).code).toBe("UNKNOWN");
});

test("Better Auth answers map to the codes of the screens", () => {
  expect(fromAuthError({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" }).code).toBe(
    "INVALID_CREDENTIALS",
  );
  expect(fromAuthError({ status: 400, code: "INVALID_TOKEN" }).code).toBe("INVALID_TOKEN");
  expect(fromAuthError({ status: 400, code: "INVALID_PASSWORD" }).code).toBe("INVALID_PASSWORD");
  expect(fromAuthError({ status: 403, code: "ACCOUNT_SUSPENDED" }).code).toBe("ACCOUNT_SUSPENDED");
  expect(fromAuthError({ status: 403, code: "INVITATION_REQUIRED" }).code).toBe(
    "INVITATION_REQUIRED",
  );
  expect(fromAuthError({ status: 429 }).code).toBe("RATE_LIMITED");
  expect(fromAuthError({ status: 503 }).code).toBe("UPSTREAM_UNAVAILABLE");
  expect(fromAuthError({ status: 0 }).code).toBe("UPSTREAM_UNAVAILABLE");
  expect(fromAuthError({ status: 400, code: "SOMETHING" }).code).toBe("UNKNOWN");
});

test("only the UNAUTHENTICATED code means the session is gone", () => {
  expect(isUnauthenticated(new ApiError("UNAUTHENTICATED", 401, "x"))).toBe(true);
  expect(isUnauthenticated(new ApiError("FORBIDDEN", 403, "x"))).toBe(false);
  expect(isUnauthenticated(new Error("x"))).toBe(false);
});

test("a reference needs a request id", () => {
  expect(errorReference(new ApiError("INTERNAL", 500, "x"))).toBeNull();
  expect(errorReference(new Error("x"))).toBeNull();
});
