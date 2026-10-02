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
