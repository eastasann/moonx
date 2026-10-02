/** Locale fixed for the first release (design-spec 1.2). */
export const LOCALE = "en-PH";

export type Bound = "exact" | "lower" | "upper";

interface Formatted {
  bound?: Bound;
}

const MINUS = "−";

const number = new Map<string, Intl.NumberFormat>();
function numberFormat(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let format = number.get(key);
  if (!format) {
    format = new Intl.NumberFormat(LOCALE, options);
    number.set(key, format);
  }
  return format;
}

/** Bounds come from costs with Empty or Unknown rows: "+" for a lower bound, "≤" for an upper one. */
function withBound(text: string, bound: Bound | undefined): string {
  if (bound === "lower") return `${text}+`;
  if (bound === "upper") return `≤ ${text}`;
  return text;
}

const typographicMinus = (text: string) => text.replace("-", MINUS);

/**
 * Money in the given currency. Whole amounts by default; `decimals: 2` for variable cost and
 * contribution per sale (design-spec 6.4).
 */
export function formatMoney(
  amount: number,
  currency: string,
  options: Formatted & { decimals?: 0 | 2 } = {},
): string {
  const digits = options.decimals ?? 0;
  const text = numberFormat({
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    currencyDisplay: "narrowSymbol",
    signDisplay: "negative",
  }).format(amount);
  return withBound(typographicMinus(text), options.bound);
}

/** Unit counts to one decimal place; a trailing ".0" is dropped (13.0 becomes 13). */
export function formatUnits(value: number, options: Formatted = {}): string {
  const text = numberFormat({
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
    signDisplay: "negative",
  }).format(value);
  return withBound(typographicMinus(text), options.bound);
}

/** A number as typed by a person (daily sales inputs): no rounding to one decimal. */
export function formatInputNumber(value: number): string {
  return typographicMinus(numberFormat({ maximumFractionDigits: 6 }).format(value));
}

/** Months to one decimal place. The unit word comes from the catalog (`format.months`). */
export function formatMonths(value: number, options: Formatted = {}): string {
  return formatUnits(value, options);
}

/** A 0-1 rate as a percentage with one decimal place. */
export function formatPercent(rate: number, options: Formatted = {}): string {
  const text = numberFormat({
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
    signDisplay: "negative",
  }).format(rate);
  return withBound(typographicMinus(text), options.bound);
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function toDate(value: string | Date): { date: Date; dateOnly: boolean } {
  if (value instanceof Date) return { date: value, dateOnly: false };
  if (DATE_ONLY.test(value)) return { date: new Date(`${value}T00:00:00Z`), dateOnly: true };
  return { date: new Date(value), dateOnly: false };
}

/** "Sep 30, 2026". A date-only value is never shifted by the time zone. */
export function formatDate(value: string | Date, timeZone = "UTC"): string {
  const { date, dateOnly } = toDate(value);
  return new Intl.DateTimeFormat(LOCALE, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: dateOnly ? "UTC" : timeZone,
  }).format(date);
}

/** 12-hour time, "3:05 PM", in the user's time zone. */
export function formatTime(value: string | Date, timeZone = "UTC"): string {
  const { date } = toDate(value);
  return new Intl.DateTimeFormat(LOCALE, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  })
    .format(date)
    .replace(/\s?(am|pm)$/i, (_, m: string) => ` ${m.toUpperCase()}`);
}

/** ISO 8601 date, "2026-10-01", as used by exports. */
export function formatIsoDate(value: string | Date, timeZone = "UTC"): string {
  const { date, dateOnly } = toDate(value);
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: dateOnly ? "UTC" : timeZone,
  }).format(date);
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];
const RELATIVE_LIMIT_DAYS = 7;

/**
 * How long ago a moment was, "2 hr. ago" or "yesterday". A week or more back it is the date
 * (`formatDate`), because "23 days ago" is harder to place than "Sep 9, 2026". `now` is passed in
 * so the same value renders the same text in tests and across one render pass.
 */
export function formatRelativeTime(value: string | Date, now: Date, timeZone = "UTC"): string {
  const { date } = toDate(value);
  const seconds = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  if (seconds >= RELATIVE_LIMIT_DAYS * 86_400) return formatDate(date, timeZone);
  const format = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto", style: "short" });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (seconds >= size) return format.format(-Math.floor(seconds / size), unit);
  }
  return format.format(0, "second");
}

/** Options for a number field that takes money: the symbol shows, whole or two-decimal amounts. */
export function moneyInputFormat(currency: string): Intl.NumberFormatOptions {
  return {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  };
}

/** Options for a number field that takes a rate: the field shows 35% and holds 0.35. */
export const PERCENT_INPUT_FORMAT: Intl.NumberFormatOptions = {
  style: "percent",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
};
