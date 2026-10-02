import { describe, expect, test } from "bun:test";
import {
  AUTH_HOOK_ERROR_CODES,
  amountSchema,
  classificationInputSchema,
  ERROR_CODES,
  ERROR_STATUS,
  economicsInputBodySchema,
  economicsResultSchema,
  fauBreakdownSchema,
  pageQuerySchema,
  parseNumberInput,
  rateSchema,
  targetRefSchema,
} from "../src";

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) =>
  schema.safeParse(v).success;

describe("economics inputs (design-spec 6.4)", () => {
  const body = economicsInputBodySchema;
  test("selling price is above 0", () => {
    expect(ok(body("selling_price"), { value: 0 })).toBe(false);
    expect(ok(body("selling_price"), { value: 0.01 })).toBe(true);
    expect(ok(body("selling_price"), { value: null })).toBe(true);
  });
  test("operating days are an integer from 1 to 31", () => {
    for (const [v, expected] of [
      [0, false],
      [1, true],
      [31, true],
      [32, false],
      [26.5, false],
    ] as const) {
      expect(ok(body("operating_days"), { value: v })).toBe(expected);
    }
  });
  test("target margin is 0 to 0.99", () => {
    expect(ok(body("target_margin"), { value: 0 })).toBe(true);
    expect(ok(body("target_margin"), { value: 0.99 })).toBe(true);
    expect(ok(body("target_margin"), { value: 1 })).toBe(false);
    expect(ok(body("target_margin"), { value: -0.01 })).toBe(false);
  });
  test("daily sales are 0 or more, decimals allowed", () => {
    for (const f of [
      "units_conservative",
      "units_expected",
      "units_strong",
      "units_capacity",
    ] as const) {
      expect(ok(body(f), { value: 0 })).toBe(true);
      expect(ok(body(f), { value: 2.5 })).toBe(true);
      expect(ok(body(f), { value: -1 })).toBe(false);
    }
  });
});

describe("amounts and rates", () => {
  test("amount is 0 or more", () => {
    expect(ok(amountSchema, 0)).toBe(true);
    expect(ok(amountSchema, -0.01)).toBe(false);
  });
  test("rate is a 0-1 fraction", () => {
    expect(ok(rateSchema, 0.35)).toBe(true);
    expect(ok(rateSchema, 35)).toBe(false);
  });
  test("parseNumberInput accepts thousands commas", () => {
    expect(parseNumberInput("1,234.5")).toBe(1234.5);
    expect(parseNumberInput(" 450 ")).toBe(450);
    expect(parseNumberInput("-3")).toBe(-3);
    expect(parseNumberInput("")).toBeNull();
    expect(parseNumberInput("12abc")).toBeNull();
    expect(parseNumberInput("1.")).toBeNull();
  });
});

describe("classification input", () => {
  test("assumption requires a confidence, the others forbid it", () => {
    expect(ok(classificationInputSchema, { fau: "assumption", confidence: "low" })).toBe(true);
    expect(ok(classificationInputSchema, { fau: "assumption" })).toBe(false);
    expect(ok(classificationInputSchema, { fau: "assumption", confidence: null })).toBe(false);
    expect(ok(classificationInputSchema, { fau: "fact", confidence: "low" })).toBe(false);
    expect(ok(classificationInputSchema, { fau: "unknown" })).toBe(true);
    expect(ok(classificationInputSchema, { fau: null, confidence: null })).toBe(true);
    expect(ok(classificationInputSchema, { fau: "nope" })).toBe(false);
  });
});

describe("shared shapes", () => {
  test("target ref", () => {
    const id = "8f14e45f-ea9e-4c5b-9a1f-2c7e1d5a3b6c";
    expect(ok(targetRefSchema, { type: "validation_answer", id, key: "V.01.WHO" })).toBe(true);
    expect(ok(targetRefSchema, { type: "idea", id })).toBe(true);
    expect(ok(targetRefSchema, { type: "idea", id: "x" })).toBe(false);
    expect(ok(targetRefSchema, { type: "other", id })).toBe(false);
  });
  test("page query limit defaults to 50 and caps at 200", () => {
    expect(pageQuerySchema.parse({}).limit).toBe(50);
    expect(pageQuerySchema.parse({ limit: "200" }).limit).toBe(200);
    expect(ok(pageQuerySchema, { limit: "201" })).toBe(false);
    expect(ok(pageQuerySchema, { limit: "0" })).toBe(false);
  });
  test("breakdown and result schemas reject malformed values", () => {
    expect(ok(fauBreakdownSchema, { fact: -1 })).toBe(false);
    expect(ok(economicsResultSchema, {})).toBe(false);
  });
});

describe("error codes (SDD 8.1)", () => {
  test("every code has a status and the list matches", () => {
    expect(ERROR_CODES.length).toBe(Object.keys(ERROR_STATUS).length);
    for (const code of ERROR_CODES) {
      expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
      expect(code).toMatch(/^[A-Z_]+$/);
    }
  });
  test("representative statuses", () => {
    expect(ERROR_STATUS.UNAUTHENTICATED).toBe(401);
    expect(ERROR_STATUS.NO_ACCESS).toBe(403);
    expect(ERROR_STATUS.CONFLICT).toBe(409);
    expect(ERROR_STATUS.INVITATION_INVALID).toBe(410);
    expect(ERROR_STATUS.VALIDATION_FAILED).toBe(422);
    expect(ERROR_STATUS.APP_UPDATE_REQUIRED).toBe(426);
    expect(ERROR_STATUS.RATE_LIMITED).toBe(429);
    expect(ERROR_STATUS.INTERNAL).toBe(500);
  });
  test("auth hook codes stay out of the API envelope", () => {
    for (const code of AUTH_HOOK_ERROR_CODES) {
      expect((ERROR_CODES as string[]).includes(code)).toBe(false);
    }
  });
});
