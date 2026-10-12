import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { errorBodySchema, errorCodes, errorStatus } from "./errors";

const sdd = readFileSync(
  new URL("../../../docs/02-01_system-design-doc.md", import.meta.url),
  "utf8",
);

/** The rows of the code table in SDD 8.1: `| status | codes | ... |`. */
const sddCodes = () => {
  const section = sdd.slice(
    sdd.indexOf("### 8.1 APIエラーレスポンス"),
    sdd.indexOf("### 8.2"),
  );
  const codes = new Map<string, string>();
  for (const line of section.split("\n")) {
    const row = /^\| ([0-9 /]+) \| (.+?) \|/.exec(line);
    if (row === null) continue;
    for (const [, code] of (row[2] ?? "").matchAll(/`([A-Z_]+)`/g))
      codes.set(code as string, (row[1] ?? "").trim());
  }
  return codes;
};

test("the codes are the ones of SDD 8.1, with their statuses", () => {
  const expected = sddCodes();
  expect(expected.size).toBeGreaterThan(50);
  expect(new Set<string>(errorCodes)).toEqual(new Set(expected.keys()));
  for (const [code, status] of expected) {
    // 502 / 503 / 504: the API itself answers 503.
    const statuses = status.split("/").map((s) => Number(s.trim()));
    expect(statuses).toContain(errorStatus[code as keyof typeof errorStatus]);
  }
});

test("an error body", () => {
  const body = {
    error: {
      code: "VALIDATION_FAILED" as const,
      message: "amount must be greater than or equal to 0",
      requestId: "8f14e45f-ea9e-4c5b-9a1f-2c7e1d5a3b6c",
      details: [
        { path: "amount", code: "too_small", message: "Must be 0 or more" },
      ],
    },
  };
  expect(errorBodySchema.parse(body)).toEqual(body);
  const rateLimited = {
    error: {
      code: "RATE_LIMITED" as const,
      message: "Too many requests",
      requestId: "8f14e45f-ea9e-4c5b-9a1f-2c7e1d5a3b6c",
      retryAfterSeconds: 42,
    },
  };
  expect(errorBodySchema.parse(rateLimited).error.retryAfterSeconds).toBe(42);
  expect(
    errorBodySchema.safeParse({
      error: { ...body.error, code: "TEAPOT" },
    }).success,
  ).toBe(false);
});
