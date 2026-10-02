import { describe, expect, test } from "bun:test";
import {
  formatDate,
  formatInputNumber,
  formatIsoDate,
  formatMoney,
  formatMonths,
  formatPercent,
  formatTime,
  formatUnits,
} from "../src";

describe("formatMoney", () => {
  test("whole amounts by default, decimals for per-sale values", () => {
    expect(formatMoney(169500, "PHP")).toBe("₱169,500");
    expect(formatMoney(218.5, "PHP", { decimals: 2 })).toBe("₱218.50");
    expect(formatMoney(18490.4, "PHP")).toBe("₱18,490");
    expect(formatMoney(0.5, "PHP")).toBe("₱1");
  });
  test("negative amounts use a minus sign", () => {
    expect(formatMoney(-5586, "PHP")).toBe("−₱5,586");
  });
  test("lower and upper bounds", () => {
    expect(formatMoney(169500, "PHP", { bound: "lower" })).toBe("₱169,500+");
    expect(formatMoney(18490, "PHP", { bound: "upper" })).toBe("≤ ₱18,490");
    expect(formatMoney(5, "PHP", { bound: "exact" })).toBe("₱5");
  });
  test("other currencies follow their own digits", () => {
    expect(formatMoney(1234.5, "JPY")).toBe("¥1,235");
  });
});

describe("formatUnits", () => {
  test("one decimal place, trailing .0 dropped", () => {
    expect(formatUnits(6.9281)).toBe("6.9");
    expect(formatUnits(180.13)).toBe("180.1");
    expect(formatUnits(13.04)).toBe("13");
    expect(formatUnits(156)).toBe("156");
    expect(formatUnits(1234.56)).toBe("1,234.6");
  });
  test("rounds half up on the displayed digit only", () => {
    expect(formatUnits(0.05)).toBe("0.1");
    expect(formatUnits(2.25)).toBe("2.3");
  });
  test("bounds", () => {
    expect(formatUnits(6.93, { bound: "lower" })).toBe("6.9+");
    expect(formatUnits(6.93, { bound: "upper" })).toBe("≤ 6.9");
  });
  test("negative", () => {
    expect(formatUnits(-1.5)).toBe("−1.5");
  });
});

describe("formatInputNumber", () => {
  test("keeps what was typed", () => {
    expect(formatInputNumber(6)).toBe("6");
    expect(formatInputNumber(2.25)).toBe("2.25");
    expect(formatInputNumber(1234.5)).toBe("1,234.5");
  });
});

describe("formatPercent and formatMonths", () => {
  test("percent to one decimal", () => {
    expect(formatPercent(0.514)).toBe("51.4%");
    expect(formatPercent(1.3091)).toBe("130.9%");
    expect(formatPercent(0.15)).toBe("15%");
    expect(formatPercent(1.3091, { bound: "upper" })).toBe("≤ 130.9%");
    expect(formatPercent(-0.025)).toBe("−2.5%");
  });
  test("months to one decimal with bounds", () => {
    expect(formatMonths(9.167)).toBe("9.2");
    expect(formatMonths(9.167, { bound: "lower" })).toBe("9.2+");
  });
});

describe("dates and times (en-PH, 12-hour)", () => {
  test("formatDate", () => {
    expect(formatDate("2026-09-30")).toBe("Sep 30, 2026");
    expect(formatDate("2026-09-30T15:05:00.000Z", "Asia/Manila")).toBe("Sep 30, 2026");
    expect(formatDate("2026-09-30T20:00:00.000Z", "Asia/Manila")).toBe("Oct 1, 2026");
    expect(formatDate(new Date("2026-01-05T00:00:00Z"))).toBe("Jan 5, 2026");
  });
  test("a date-only value is not shifted by the time zone", () => {
    expect(formatDate("2026-09-30", "Pacific/Honolulu")).toBe("Sep 30, 2026");
    expect(formatIsoDate("2026-09-30", "Pacific/Honolulu")).toBe("2026-09-30");
  });
  test("formatTime uses the user's time zone and upper-case AM/PM", () => {
    expect(formatTime("2026-09-30T15:05:00.000Z", "Asia/Manila")).toBe("11:05 PM");
    expect(formatTime("2026-09-30T01:07:00.000Z", "Asia/Manila")).toBe("9:07 AM");
    expect(formatTime("2026-09-30T04:00:00.000Z")).toBe("4:00 AM");
  });
  test("formatIsoDate", () => {
    expect(formatIsoDate("2026-09-30T20:00:00.000Z", "Asia/Manila")).toBe("2026-10-01");
    expect(formatIsoDate("2026-10-01T02:00:00.000Z")).toBe("2026-10-01");
    expect(formatIsoDate(new Date("2026-10-01T02:00:00Z"))).toBe("2026-10-01");
  });
});
