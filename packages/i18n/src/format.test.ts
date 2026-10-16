import { describe, expect, test } from "bun:test";
import {
  formatCheckName,
  formatCount,
  formatDate,
  formatInputNumber,
  formatInputPercent,
  formatIsoDate,
  formatIsoDateTime,
  formatMoney,
  formatMonths,
  formatNumberAffixes,
  formatNumberText,
  formatOverdue,
  formatPercent,
  formatRelativeTime,
  formatTime,
  formatUnits,
  formatWaitTime,
} from "./format";

const timeZone = "Asia/Manila";
// 11:00 on Oct 12, 2026 in Manila.
const now = new Date("2026-10-12T03:00:00.000Z");

describe("amounts (design-spec 1.2・6.4)", () => {
  test("whole units with grouping", () => {
    expect(formatMoney(18490, "PHP")).toBe("₱18,490");
    expect(formatMoney(81058.29, "PHP")).toBe("₱81,058");
    expect(formatMoney(0.5, "PHP")).toBe("₱1");
  });

  test("the sign goes before the currency symbol", () => {
    expect(formatMoney(-5586, "PHP")).toBe("−₱5,586");
  });

  test("a loss that rounds to zero has no sign", () => {
    expect(formatMoney(-0.4, "PHP")).toBe("₱0");
  });

  test("per-sale amounts keep two decimals", () => {
    expect(formatMoney(218.5, "PHP", { cents: true })).toBe("₱218.50");
    expect(formatMoney(231.5, "PHP", { cents: true, bound: "upper" })).toBe(
      "≤ ₱231.50",
    );
  });

  test("lower and upper bounds", () => {
    expect(formatMoney(450000, "PHP", { bound: "lower" })).toBe("₱450,000+");
    expect(formatMoney(18490, "PHP", { bound: "upper" })).toBe("≤ ₱18,490");
    expect(formatMoney(-5586, "PHP", { bound: "upper" })).toBe("≤ −₱5,586");
  });

  test("other currencies use the narrow symbol, the same in browsers and Bun", () => {
    expect(formatMoney(1234, "USD")).toBe("$1,234");
    expect(formatMoney(1234, "JPY")).toBe("¥1,234");
  });

  test("values whose exact decimal ends in 5 round half up despite binary noise", () => {
    expect(formatMoney(0.1 + 0.065, "PHP", { cents: true })).toBe("₱0.17");
    expect(formatMoney(9.594999999999999, "PHP", { cents: true })).toBe(
      "₱9.60",
    );
    expect(formatUnits(6.249999999999999)).toBe("6.3");
  });

  test("values with more than 15 digits on display keep them all", () => {
    expect(formatMoney(12345678901234.56, "PHP", { cents: true })).toBe(
      "₱12,345,678,901,234.56",
    );
    expect(formatMoney(1234567890123456, "PHP")).toBe("₱1,234,567,890,123,456");
    expect(formatUnits(-123456789012345.6)).toBe("−123,456,789,012,345.6");
  });

  test("a value that may lie either way is approximate", () => {
    expect(formatPercent(-0.24, { bound: "approximate" })).toBe("≈ −24.0%");
  });
});

describe("counts, rates and months (design-spec 6.4 端数)", () => {
  test("units: one decimal, no trailing .0", () => {
    expect(formatUnits(180.12958963)).toBe("180.1");
    expect(formatUnits(6.928)).toBe("6.9");
    expect(formatUnits(13)).toBe("13");
    expect(formatUnits(156.04)).toBe("156");
    expect(formatUnits(6.928, { bound: "lower" })).toBe("6.9+");
  });

  test("typed numbers are shown as typed", () => {
    expect(formatInputNumber(6.25)).toBe("6.25");
    expect(formatInputNumber(26)).toBe("26");
    expect(formatInputNumber(1000)).toBe("1,000");
  });

  test("typed number text is regrouped, its decimals untouched", () => {
    expect(formatNumberText("1500.5")).toBe("1,500.5");
    expect(formatNumberText(" 1234567 ")).toBe("1,234,567");
    expect(formatNumberText("1,500.505")).toBe("1,500.505");
    expect(formatNumberText("1000000000000.00")).toBe("1,000,000,000,000.00");
    expect(formatNumberText("12345678901234567890")).toBe(
      "12,345,678,901,234,567,890",
    );
    expect(formatNumberText("0")).toBe("0");
    expect(formatNumberText("0.75")).toBe("0.75");
  });

  test("leading zeros stay as typed", () => {
    expect(formatNumberText("007.50")).toBe("007.50");
    expect(formatNumberText("0,500")).toBe("0,500");
  });

  test("number text the form refuses comes back as typed", () => {
    for (const text of ["1,5", "12.", "₱1,500", "-3", "1e3", "", "abc"]) {
      expect(formatNumberText(text)).toBe(text);
    }
  });

  test("number fields show the narrow currency symbol before, the % after", () => {
    expect(formatNumberAffixes({ currency: "PHP" })).toEqual({
      prefix: "₱",
      suffix: "",
    });
    expect(formatNumberAffixes({ currency: "USD" })).toEqual({
      prefix: "$",
      suffix: "",
    });
    expect(formatMoney(1, "JPY")).toBe(
      `${formatNumberAffixes({ currency: "JPY" }).prefix}1`,
    );
    expect(formatNumberAffixes({ percent: true })).toEqual({
      prefix: "",
      suffix: "%",
    });
  });

  test("rates: one decimal, keeping .0", () => {
    expect(formatPercent(0.51425)).toBe("51.4%");
    expect(formatPercent(0.5)).toBe("50.0%");
    expect(formatPercent(1.30914)).toBe("130.9%");
    expect(formatPercent(1.30914, { bound: "upper" })).toBe("≤ 130.9%");
    expect(formatPercent(-0.0796)).toBe("−8.0%");
  });

  test("typed rates are shown as typed", () => {
    expect(formatInputPercent(0.15)).toBe("15%");
    expect(formatInputPercent(0.1225)).toBe("12.25%");
    expect(formatInputPercent(0.35)).toBe("35%");
  });

  test("months: one decimal, keeping .0", () => {
    expect(formatMonths(9.1671)).toBe("9.2 months");
    expect(formatMonths(9)).toBe("9.0 months");
    expect(formatMonths(9.1671, { bound: "lower" })).toBe("9.2+ months");
  });

  test("badge counts stop at 99+", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(99)).toBe("99");
    expect(formatCount(100)).toBe("99+");
  });
});

describe("dates and times (design-spec 1.2)", () => {
  test("this year's dates leave the year out", () => {
    expect(formatDate("2026-10-01", { timeZone, now })).toBe("Oct 1");
    expect(formatDate("2025-09-30", { timeZone, now })).toBe("Sep 30, 2025");
  });

  test("date-times are shown in the user's time zone", () => {
    // 20:00 UTC on Sep 30 is already Oct 1 in Manila.
    expect(formatDate("2026-09-30T20:00:00.000Z", { timeZone, now })).toBe(
      "Oct 1",
    );
    expect(
      formatDate("2026-09-30T20:00:00.000Z", { timeZone: "UTC", now }),
    ).toBe("Sep 30");
  });

  test("the year is the user's: Jan 1 in Manila is still last year in UTC", () => {
    const newYear = new Date("2026-12-31T17:00:00.000Z");
    expect(formatDate("2025-12-31", { timeZone, now: newYear })).toBe(
      "Dec 31, 2025",
    );
  });

  test("years before 100 stay as they are", () => {
    expect(formatIsoDate("0050-03-01", { timeZone })).toBe("0050-03-01");
    expect(formatDate("0050-03-01", { timeZone, now })).toContain("50");
    expect(formatDate("0050-03-01", { timeZone, now })).not.toContain("1950");
  });

  test("a date-only value never moves to another day", () => {
    expect(
      formatDate("2026-10-01", { timeZone: "Pacific/Honolulu", now }),
    ).toBe("Oct 1");
    expect(formatIsoDate("2026-10-01", { timeZone: "Pacific/Honolulu" })).toBe(
      "2026-10-01",
    );
  });

  test("an instant as local ISO 8601 with its offset (design-spec 6.6)", () => {
    expect(formatIsoDateTime("2026-10-01T02:00:00.000Z", { timeZone })).toBe(
      "2026-10-01T10:00+08:00",
    );
    expect(
      formatIsoDateTime(
        "2026-10-01T02:00:09.900Z",
        { timeZone },
        { seconds: true },
      ),
    ).toBe("2026-10-01T10:00:09+08:00");
    expect(
      formatIsoDateTime("2026-10-01T02:00:00.000Z", { timeZone: "UTC" }),
    ).toBe("2026-10-01T02:00+00:00");
    expect(
      formatIsoDateTime("2026-10-01T02:00:00.000Z", {
        timeZone: "America/St_Johns",
      }),
    ).toBe("2026-09-30T23:30-02:30");
    expect(formatIsoDateTime("2026-09-30T16:00:00.000Z", { timeZone })).toBe(
      "2026-10-01T00:00+08:00",
    );
  });

  test("12-hour times", () => {
    expect(formatTime("2026-09-30T05:05:00.000Z", { timeZone })).toBe(
      "1:05 PM",
    );
  });

  test("ISO dates for exports", () => {
    expect(formatIsoDate("2026-09-30T20:00:00.000Z", { timeZone })).toBe(
      "2026-10-01",
    );
    expect(
      formatIsoDate(new Date("2026-09-30T05:00:00.000Z"), { timeZone }),
    ).toBe("2026-09-30");
  });
});

describe("relative times (design-spec 1.2)", () => {
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  test("under a minute is just now, also slightly in the future", () => {
    expect(formatRelativeTime(ago(59_000), { timeZone, now })).toBe("just now");
    expect(formatRelativeTime(ago(-5_000), { timeZone, now })).toBe("just now");
  });

  test("minutes and hours, rounded down", () => {
    expect(formatRelativeTime(ago(60_000), { timeZone, now })).toBe("1m ago");
    expect(
      formatRelativeTime(ago(5 * 60_000 + 59_000), { timeZone, now }),
    ).toBe("5m ago");
    expect(formatRelativeTime(ago(2 * 3_600_000 + 1), { timeZone, now })).toBe(
      "2h ago",
    );
    expect(formatRelativeTime(ago(24 * 3_600_000 - 1), { timeZone, now })).toBe(
      "23h ago",
    );
  });

  test('more than a minute ahead is not "ago": the date', () => {
    expect(formatRelativeTime(ago(-60_000), { timeZone, now })).toBe("Oct 12");
    expect(
      formatRelativeTime(ago(-8 * 24 * 3_600_000), { timeZone, now }),
    ).toBe("Oct 20");
  });

  test("24 hours and older is a date", () => {
    expect(formatRelativeTime(ago(24 * 3_600_000), { timeZone, now })).toBe(
      "Oct 11",
    );
    expect(
      formatRelativeTime("2025-09-30T03:00:00.000Z", { timeZone, now }),
    ).toBe("Sep 30, 2025");
  });

  test("defaults to the current time", () => {
    expect(formatRelativeTime(new Date(), { timeZone: "UTC" })).toBe(
      "just now",
    );
  });
});

describe("deadlines (design-spec 1.2)", () => {
  test("days past the due date, by the user's calendar", () => {
    expect(formatOverdue("2026-10-10", { timeZone, now })).toBe("overdue 2d");
    expect(formatOverdue("2026-10-11", { timeZone, now })).toBe("overdue 1d");
  });

  test("not overdue on the day or before", () => {
    expect(formatOverdue("2026-10-12", { timeZone, now })).toBeNull();
    expect(formatOverdue("2026-10-20", { timeZone, now })).toBeNull();
  });

  test("only a date-only value is a due date", () => {
    expect(() =>
      formatOverdue("2026-10-01T00:00:00.000Z", { timeZone, now }),
    ).toThrow(RangeError);
  });

  test("it is still Oct 11 in Honolulu", () => {
    expect(
      formatOverdue("2026-10-11", { timeZone: "Pacific/Honolulu", now }),
    ).toBeNull();
  });
});

describe("waits (design-spec 1.2)", () => {
  test("minutes under an hour, rounded up", () => {
    expect(formatWaitTime(1)).toBe("1 minute");
    expect(formatWaitTime(60)).toBe("1 minute");
    expect(formatWaitTime(61)).toBe("2 minutes");
    expect(formatWaitTime(45 * 60)).toBe("45 minutes");
  });

  test("hours once the minutes reach 60, rounded up", () => {
    expect(formatWaitTime(59 * 60)).toBe("59 minutes");
    expect(formatWaitTime(59 * 60 + 30)).toBe("1 hour");
    expect(formatWaitTime(3600)).toBe("1 hour");
    expect(formatWaitTime(3601)).toBe("2 hours");
  });
});

test("check names carry the competitor threshold (design-spec 6.1)", () => {
  expect(formatCheckName("competitors", { min: 3, max: 5 })).toBe(
    "Competitors (3–5)",
  );
  expect(formatCheckName("competitors", { min: 4, max: 5 })).toBe(
    "Competitors (4–5)",
  );
  expect(formatCheckName("competitors", { min: 5, max: 5 })).toBe(
    "Competitors (5+)",
  );
  expect(formatCheckName("competitors", { min: 7, max: 5 })).toBe(
    "Competitors (7+)",
  );
  expect(formatCheckName("break_even", {})).toBe("Break-even volume");
  expect(() => formatCheckName("competitors", { min: 3 })).toThrow();
});
