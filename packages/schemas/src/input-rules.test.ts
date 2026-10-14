import { describe, expect, test } from "bun:test";
import type { z } from "zod";
import {
  assigneeNameSchema,
  CURRENCY_CODES,
  canReduceSchema,
  checkThresholdSchema,
  commentBodySchema,
  competitorTypeSchema,
  costRowNameSchema,
  countChars,
  currencySchema,
  dateInputSchema,
  displayNameSchema,
  emailSchema,
  fitWithSuffix,
  guidanceSchema,
  ideaNameSchema,
  isQuestionKey,
  longTextSchema,
  MONEY_MAX,
  moneySchema,
  numberTextSchema,
  oneLineConceptSchema,
  operatingDaysSchema,
  optionalText,
  passwordSchema,
  percentInputSchema,
  percentToRate,
  planNameSchema,
  rateSchema,
  rateToPercent,
  reasonSchema,
  requiredLongTextSchema,
  requiredShortTextSchema,
  requiredText,
  sameEmail,
  sellingPriceSchema,
  shortTextSchema,
  tableNumberCellSchema,
  tableTextCellSchema,
  targetMarginInputSchema,
  targetMarginRateSchema,
  timeZoneSchema,
  unitsPerDaySchema,
  urlSchema,
  versionNameSchema,
  workspaceNameSchema,
} from "./input-rules";

const ok = (schema: z.ZodType, value: unknown) =>
  expect(schema.safeParse(value).success).toBe(true);
const ng = (schema: z.ZodType, value: unknown) =>
  expect(schema.safeParse(value).success).toBe(false);

const chars = (n: number, char = "a") => char.repeat(n);

describe("text (design-spec 6.0.8 共通の決まり)", () => {
  test("characters are Unicode characters, not UTF-16 units", () => {
    expect(countChars("😀")).toBe(1);
    expect(countChars("日本語")).toBe(3);
    ok(requiredText(3), "😀😀😀");
    ng(requiredText(3), "😀😀😀😀");
  });

  test("a required text that is only whitespace is empty", () => {
    ng(requiredShortTextSchema, "   ");
    ng(requiredShortTextSchema, "");
    const issue = requiredShortTextSchema.safeParse(" \n").error?.issues[0];
    expect(issue).toMatchObject({
      code: "custom",
      params: { rule: "required" },
    });
  });

  test("a blank password reads as required, a short one as too short", () => {
    expect(passwordSchema.safeParse("").error?.issues[0]).toMatchObject({
      params: { rule: "required" },
    });
    expect(passwordSchema.safeParse(chars(7)).error?.issues[0]).toMatchObject({
      code: "too_small",
      minimum: 8,
    });
  });

  test("no NUL character, which PostgreSQL text cannot hold", () => {
    for (const schema of [
      requiredShortTextSchema,
      shortTextSchema,
      costRowNameSchema,
    ]) {
      const issue = schema.safeParse("a\u0000b").error?.issues[0];
      expect(issue).toMatchObject({ params: { rule: "nul_character" } });
    }
  });

  test("no lone surrogate, which is no character", () => {
    for (const schema of [
      requiredShortTextSchema,
      shortTextSchema,
      costRowNameSchema,
    ]) {
      const issue = schema.safeParse("a\ud800b").error?.issues[0];
      expect(issue).toMatchObject({ params: { rule: "lone_surrogate" } });
    }
    expect(requiredShortTextSchema.parse("a\ud83c\udf19")).toBe("a🌙");
  });

  test("a required text is kept as typed", () => {
    expect(requiredShortTextSchema.parse(" Piaya ")).toBe(" Piaya ");
  });

  test("short, reason and long limits", () => {
    ok(requiredShortTextSchema, chars(200));
    ng(requiredShortTextSchema, chars(201));
    ok(reasonSchema, chars(5000));
    ng(reasonSchema, chars(5001));
    ok(longTextSchema, chars(20000));
    ng(longTextSchema, chars(20001));
    ok(requiredLongTextSchema, chars(20000));
    ng(requiredLongTextSchema, chars(20001));
    ok(guidanceSchema, chars(5000));
    ng(guidanceSchema, chars(5001));
    const issue = reasonSchema.safeParse(chars(5001)).error?.issues[0];
    expect(issue).toMatchObject({ code: "too_big", maximum: 5000 });
  });

  test("an optional text that is only whitespace is saved as null", () => {
    expect(shortTextSchema.parse("  ")).toBeNull();
    expect(shortTextSchema.parse(null)).toBeNull();
    expect(shortTextSchema.parse(" note ")).toBe(" note ");
    ng(shortTextSchema, chars(201));
    expect(optionalText(5).optional().parse(undefined)).toBeUndefined();
  });

  test("a cost row name may be empty, and whitespace only is saved empty", () => {
    ok(costRowNameSchema, "");
    expect(costRowNameSchema.parse("  ")).toBe("");
    expect(costRowNameSchema.parse(" Rent ")).toBe(" Rent ");
    ok(costRowNameSchema, chars(200));
    ng(costRowNameSchema, chars(201));
    expect(costRowNameSchema.parse(" ".repeat(201))).toBe("");
    expect(shortTextSchema.parse(" ".repeat(201))).toBeNull();
  });
});

describe("numbers", () => {
  test("amounts: 0 to 1 trillion, two decimals", () => {
    ok(moneySchema, 0);
    ok(moneySchema, MONEY_MAX);
    ok(moneySchema, 0.07);
    ok(moneySchema, 1234.56);
    ng(moneySchema, -0.01);
    ng(moneySchema, MONEY_MAX + 0.01);
    ng(moneySchema, 1.005);
    expect(moneySchema.safeParse(1.005).error?.issues[0]).toMatchObject({
      params: { rule: "decimals", digits: 2 },
    });
    ng(moneySchema, Number.NaN);
    ng(moneySchema, Number.POSITIVE_INFINITY);
  });

  test("percent as typed and as a rate", () => {
    ok(percentInputSchema, 0);
    ok(percentInputSchema, 100);
    ok(percentInputSchema, 12.25);
    ng(percentInputSchema, 12.255);
    ng(percentInputSchema, 100.01);
    ng(percentInputSchema, -0.01);
    ok(rateSchema, 0.1225);
    ok(rateSchema, 1);
    ng(rateSchema, -0.0001);
    ng(rateSchema, 0.12255);
    ng(rateSchema, 1.0001);
    expect(percentToRate(12.25)).toBe(0.1225);
    expect(percentToRate(35)).toBe(0.35);
    expect(rateToPercent(0.1225)).toBe(12.25);
    expect(rateToPercent(0.07)).toBe(7);
  });

  test("18 selling price is above 0", () => {
    ng(sellingPriceSchema, 0);
    ok(sellingPriceSchema, 0.01);
    ok(sellingPriceSchema, MONEY_MAX);
    ng(sellingPriceSchema, MONEY_MAX + 1);
    ng(sellingPriceSchema, 0.001);
    expect(sellingPriceSchema.safeParse(0).error?.issues[0]).toMatchObject({
      params: { rule: "positive" },
    });
  });

  test("18 operating days: whole numbers 1 to 31", () => {
    ng(operatingDaysSchema, 0);
    ok(operatingDaysSchema, 1);
    ok(operatingDaysSchema, 31);
    ng(operatingDaysSchema, 32);
    ng(operatingDaysSchema, 26.5);
    expect(operatingDaysSchema.safeParse(26.5).error?.issues[0]).toMatchObject({
      code: "invalid_type",
      expected: "int",
    });
    expect(operatingDaysSchema.safeParse(1e20).error?.issues[0]).toMatchObject({
      code: "too_big",
      maximum: 31,
    });
  });

  test("18 target margin: 0 to 99%", () => {
    ok(targetMarginInputSchema, 0);
    ok(targetMarginInputSchema, 99);
    ng(targetMarginInputSchema, 99.01);
    ng(targetMarginInputSchema, -0.01);
    ok(targetMarginRateSchema, 0.99);
    ng(targetMarginRateSchema, 0.9901);
    ng(targetMarginRateSchema, -0.0001);
  });

  test("18 daily sales: 0 to 1 billion, two decimals", () => {
    ok(unitsPerDaySchema, 0);
    ok(unitsPerDaySchema, 6.25);
    ok(unitsPerDaySchema, 1_000_000_000);
    ng(unitsPerDaySchema, 1_000_000_000.01);
    ng(unitsPerDaySchema, 6.255);
    ng(unitsPerDaySchema, -0.01);
  });

  test("21 number cells and 27 thresholds", () => {
    ok(tableNumberCellSchema, 0);
    ng(tableNumberCellSchema, -1);
    ok(checkThresholdSchema, 1);
    ok(checkThresholdSchema, 99);
    ng(checkThresholdSchema, 0);
    ng(checkThresholdSchema, 100);
    ng(checkThresholdSchema, 2.5);
  });

  test("typed numbers accept thousands separators grouped by three", () => {
    const amount = numberTextSchema(moneySchema);
    expect(amount.parse("1,500.50")).toBe(1500.5);
    expect(amount.parse(" 450000 ")).toBe(450000);
    expect(amount.parse("1,000,000")).toBe(1000000);
    ng(amount, "1,5");
    ng(amount, "1,50,000");
    ng(amount, "₱450");
    ng(amount, "-5");
    ng(amount, "");
    ng(amount, "1.005");
    expect(amount.safeParse("1,5").error?.issues[0]).toMatchObject({
      params: { rule: "number_format" },
    });
  });
});

describe("dates, URLs and emails", () => {
  test("only calendar dates", () => {
    ok(dateInputSchema, "2026-02-28");
    ok(dateInputSchema, "2028-02-29");
    ng(dateInputSchema, "2026-02-29");
    ng(dateInputSchema, "2026-13-01");
    ng(dateInputSchema, "2026-10-1");
    // PostgreSQL has no year 0.
    ng(dateInputSchema, "0000-01-01");
    expect(
      dateInputSchema.safeParse("0000-01-01").error?.issues[0],
    ).toMatchObject({ code: "invalid_format", format: "date" });
    ok(dateInputSchema, "0001-01-01");
    ok(dateInputSchema, "9999-12-31");
    ng(dateInputSchema, "10000-01-01");
  });

  test("URLs start with http:// or https:// and are at most 2,000 characters", () => {
    ok(urlSchema, "https://psa.gov.ph/stats");
    ok(urlSchema, "http://example.com");
    ng(urlSchema, "ftp://example.com");
    ng(urlSchema, "javascript:alert(1)");
    ng(urlSchema, "http:example.com");
    ng(urlSchema, "example.com");
    // As written: URL would read these as https:// too.
    for (const url of ["Https://example.com", "HTTPS://example.com"]) {
      ng(urlSchema, url);
      expect(urlSchema.safeParse(url).error?.issues[0]).toMatchObject({
        code: "invalid_format",
        format: "url",
      });
    }
    ng(urlSchema, " https://example.com");
    ng(urlSchema, "https://example.com\n");
    const base = "https://example.com/";
    ok(urlSchema, base + chars(2000 - base.length));
    ng(urlSchema, base + chars(2001 - base.length));
  });

  test("emails are at most 254 characters", () => {
    ok(emailSchema, "Ana@Example.com");
    ng(emailSchema, "ana@");
    ng(emailSchema, "not an email");
    const label = chars(60, "b");
    const domain = `@${label}.${label}.${label}.${label}.com`;
    ok(emailSchema, `${chars(254 - domain.length)}${domain}`);
    ng(emailSchema, `${chars(255 - domain.length)}${domain}`);
  });

  test("addresses are compared ignoring case", () => {
    expect(sameEmail("Ana@Example.com", "ana@example.COM")).toBe(true);
    expect(sameEmail("ana@example.com", "ana@example.org")).toBe(false);
  });
});

describe("the rows of the 6.0.8 table", () => {
  test("password: 8 to 128 characters of any kind", () => {
    ng(passwordSchema, chars(7));
    ok(passwordSchema, "パスワードは長い");
    ok(passwordSchema, chars(128));
    ng(passwordSchema, chars(129));
    ng(passwordSchema, " ".repeat(8));
  });

  test("names", () => {
    ok(displayNameSchema, chars(60));
    ng(displayNameSchema, chars(61));
    ng(displayNameSchema, "");
    ok(workspaceNameSchema, chars(60));
    ng(workspaceNameSchema, chars(61));
    ok(ideaNameSchema, chars(100));
    ng(ideaNameSchema, chars(101));
    ok(oneLineConceptSchema, chars(200));
    ng(oneLineConceptSchema, chars(201));
    ok(versionNameSchema, chars(80));
    ng(versionNameSchema, chars(81));
    ok(planNameSchema, chars(80));
    ng(planNameSchema, chars(81));
    ok(assigneeNameSchema, chars(60));
    ng(assigneeNameSchema, chars(61));
    // Optional: clearing the typed assignee saves it empty.
    expect(assigneeNameSchema.parse("")).toBeNull();
    expect(assigneeNameSchema.parse("   ")).toBeNull();
  });

  test("competitor types and Can Reduce?", () => {
    expect(competitorTypeSchema.options).toEqual([
      "direct",
      "indirect",
      "substitute",
    ]);
    expect(canReduceSchema.options).toEqual(["yes", "partly", "no"]);
  });

  test("comments and table text cells", () => {
    ng(commentBodySchema, " ");
    ok(commentBodySchema, chars(5000));
    ng(commentBodySchema, chars(5001));
    ok(tableTextCellSchema, chars(2000));
    ng(tableTextCellSchema, chars(2001));
  });

  test("time zones the runtime knows, currencies from the fixed list", () => {
    ok(timeZoneSchema, "Asia/Manila");
    ok(timeZoneSchema, "America/Argentina/Buenos_Aires");
    ok(timeZoneSchema, "Etc/GMT+8");
    // Names devices report that Intl.supportedValuesOf leaves out in Bun or V8.
    ok(timeZoneSchema, "UTC");
    ok(timeZoneSchema, "Etc/UTC");
    ok(timeZoneSchema, "Asia/Kolkata");
    ok(timeZoneSchema, "Europe/Kyiv");
    ok(timeZoneSchema, "Asia/Calcutta");
    ok(timeZoneSchema, "US/Eastern");
    // Case variants would not match the picker's names.
    ng(timeZoneSchema, "asia/manila");
    ng(timeZoneSchema, "ASIA/MANILA");
    ng(timeZoneSchema, "Mars/Olympus");
    ng(timeZoneSchema, "+08:00");
    ng(timeZoneSchema, "");
    expect(timeZoneSchema.safeParse("+08:00").error?.issues[0]).toMatchObject({
      params: { rule: "time_zone" },
    });
    ok(currencySchema, "PHP");
    ok(currencySchema, "JPY");
    ok(currencySchema, "XCG");
    ok(currencySchema, "VED");
    ng(currencySchema, "php");
    ng(currencySchema, "XYZ1");
    // Replaced, test and fund codes that Bun's Intl list still has.
    for (const code of ["BGN", "HRK", "DEM", "XTS", "XAU", "USN"])
      ng(currencySchema, code);
    expect(currencySchema.safeParse("DEM").error?.issues[0]).toMatchObject({
      params: { rule: "currency" },
    });
    expect(new Set(CURRENCY_CODES).size).toBe(CURRENCY_CODES.length);
    expect(CURRENCY_CODES.every((code) => /^[A-Z]{3}$/.test(code))).toBe(true);
  });

  test("question IDs (design-spec 6.6)", () => {
    expect(isQuestionKey("SA.WHY.1", "self_analysis")).toBe(true);
    expect(isQuestionKey("SA.INCOME.3", "self_analysis")).toBe(true);
    expect(isQuestionKey("SA.WHY.0", "self_analysis")).toBe(false);
    expect(isQuestionKey("V.01.WHO", "validation")).toBe(true);
    expect(isQuestionKey("V.02.RED_1", "validation")).toBe(true);
    expect(isQuestionKey("V.1.WHO", "validation")).toBe(false);
    expect(isQuestionKey("V.01.who", "validation")).toBe(false);
    expect(isQuestionKey("V.01.WHO", "business_plan")).toBe(false);
    expect(isQuestionKey("P.24.3", "business_plan")).toBe(true);
    expect(isQuestionKey("P.1.1", "business_plan")).toBe(false);
    // Validation has the question sections 01, 02, 04, 08 and 10; plans 30 items.
    expect(isQuestionKey("V.08.WORTH", "validation")).toBe(true);
    expect(isQuestionKey("V.03.X", "validation")).toBe(false);
    expect(isQuestionKey("P.30.2", "business_plan")).toBe(true);
    expect(isQuestionKey("P.00.1", "business_plan")).toBe(false);
    expect(isQuestionKey("P.31.1", "business_plan")).toBe(false);
  });

  test("default names fit by cutting the end of the base", () => {
    expect(fitWithSuffix("Ana", "'s workspace", 60)).toBe("Ana's workspace");
    const long = fitWithSuffix(chars(60), "'s workspace", 60);
    expect(countChars(long)).toBe(60);
    expect(long.endsWith("a's workspace")).toBe(true);
    const copy = fitWithSuffix("😀".repeat(100), " (copy)", 100);
    expect(countChars(copy)).toBe(100);
    expect(copy.startsWith("😀")).toBe(true);
    expect(fitWithSuffix("x", "abc", 2)).toBe("abc");
    // A family emoji is 5 code points: kept whole or dropped, never cut into another one.
    const family = "👨‍👩‍👧";
    expect(fitWithSuffix(`${family} home`, " (copy)", 10)).toBe(" (copy)");
    expect(fitWithSuffix(`${family} home`, " (copy)", 12)).toBe(
      `${family} (copy)`,
    );
  });
});
