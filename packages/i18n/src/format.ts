import type { CheckKey, DateOnly, MetricBound } from "@moonx/schemas";
import { i18n } from "./i18n";

// The display formats of design-spec 1.2 (locale and dates) and 6.4 (rounding, lower and
// upper bounds). Screens, PDF and AI export all format through these (SDD 9章).

/** Fixed for the first release (design-spec 1.2). */
export const LOCALE = "en-PH";

// A true minus sign, put before the currency symbol: "−₱5,586".
const MINUS = "−";

const numberFormats = new Map<string, Intl.NumberFormat>();
const numberFormat = (options: Intl.NumberFormatOptions) => {
  const key = JSON.stringify(options);
  let format = numberFormats.get(key);
  if (format === undefined) {
    format = new Intl.NumberFormat(LOCALE, options);
    numberFormats.set(key, format);
  }
  return format;
};

/**
 * Formats the size and puts the minus in front, dropping it when the value rounds to 0.
 *
 * The size is first cut to 15 significant digits, what a double holds of a decimal: a sum
 * like 0.1 + 0.065 is 0.16499999999999998 in binary and would round down to "0.16". Intl
 * then rounds the decimal half up. A value showing more digits than that (cents above
 * ₱10 trillion) keeps every digit it shows: the cut would drop the last ones.
 */
const signed = (value: number, options: Intl.NumberFormatOptions) => {
  const format = numberFormat(options);
  const size = Math.abs(value);
  const shown = options.style === "percent" ? size * 100 : size;
  const integerDigits = shown < 1 ? 0 : Math.trunc(shown).toFixed(0).length;
  const digits = Math.min(
    100,
    Math.max(15, integerDigits + (options.maximumFractionDigits ?? 0)),
  );
  const text = format.format(Number(size.toPrecision(digits)));
  return value < 0 && text !== format.format(0) ? `${MINUS}${text}` : text;
};

/**
 * "+" after a lower bound, "≤" before an upper bound, "≈" before a value that may lie
 * either way (design-spec 6.4).
 */
const withBound = (text: string, bound: MetricBound = "exact") => {
  if (bound === "lower") return `${text}+`;
  if (bound === "upper") return `≤ ${text}`;
  if (bound === "approximate") return `≈ ${text}`;
  return text;
};

/** `MetricValue.bound` of the value; exact when left out. */
export interface BoundOption {
  bound?: MetricBound;
}

/**
 * An amount in `currency` (ISO 4217): whole units, or two decimals with `cents` (variable
 * cost and contribution per sale). Example: "₱18,490", "−₱5,586", "₱450,000+".
 *
 * The symbol is the narrow one ("$1,234", not "US$1,234"; design-spec 1.2): the default
 * one differs between the ICU data of browsers and Bun, and the screens, PDF and AI
 * export must agree.
 */
export const formatMoney = (
  amount: number,
  currency: string,
  options: BoundOption & { cents?: boolean } = {},
) => {
  const digits = options.cents ? 2 : 0;
  return withBound(
    signed(amount, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }),
    options.bound,
  );
};

/** A calculated count of units: one decimal, without a trailing ".0" ("6.9", "13"). */
export const formatUnits = (units: number, options: BoundOption = {}) =>
  withBound(signed(units, { maximumFractionDigits: 1 }), options.bound);

/** A number shown as typed, such as the daily sales of a scenario ("6.25"). */
export const formatInputNumber = (value: number) =>
  signed(value, { maximumFractionDigits: 2 });

/** A calculated rate (0.514) as a % with one decimal, keeping ".0" ("51.4%", "50.0%"). */
export const formatPercent = (rate: number, options: BoundOption = {}) =>
  withBound(
    signed(rate, {
      style: "percent",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
    options.bound,
  );

/** A typed rate (0.15) as the % the user typed ("15%", "12.25%"). */
export const formatInputPercent = (rate: number) =>
  signed(rate, { style: "percent", maximumFractionDigits: 2 });

/** The payback period: one decimal, keeping ".0" ("9.2 months", "9.2+ months"). */
export const formatMonths = (months: number, options: BoundOption = {}) =>
  i18n.t("format:months", {
    value: withBound(
      signed(months, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      options.bound,
    ),
  });

/** A badge count: above 99 it shows "99+". */
export const formatCount = (count: number) =>
  count > 99
    ? `${numberFormat({}).format(99)}+`
    : numberFormat({}).format(count);

/** A Date, a UTC ISO 8601 date-time, or a date-only "2026-10-01". */
export type DateInput = Date | string;

export interface ZoneOptions {
  /** The user's IANA time zone (`users.timezone`). */
  timeZone: string;
}

export interface NowOptions extends ZoneOptions {
  /** The current time; tests pass a fixed one. */
  now?: Date;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A date-only value is a calendar day, not an instant: it is shown as is, in UTC, so no
 * time zone can move it to another day.
 */
const toInstant = (
  value: DateInput,
  timeZone: string,
): { date: Date; timeZone: string } => {
  if (typeof value === "string") {
    const match = DATE_ONLY.exec(value);
    if (match) {
      // setUTCFullYear, not Date.UTC, which reads the years 0 to 99 as 1900 to 1999.
      const date = new Date(0);
      date.setUTCFullYear(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
      );
      return { date, timeZone: "UTC" };
    }
    return { date: new Date(value), timeZone };
  }
  return { date: value, timeZone };
};

const dateParts = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return { year: part("year"), month: part("month"), day: part("day") };
};

/** The ISO 8601 date in the user's time zone ("2026-10-01"), as exports write dates. */
export const formatIsoDate = (value: DateInput, { timeZone }: ZoneOptions) => {
  if (typeof value === "string" && DATE_ONLY.test(value)) return value;
  const instant = toInstant(value, timeZone);
  const { year, month, day } = dateParts(instant.date, instant.timeZone);
  return `${year}-${month}-${day}`;
};

/** A date: "Oct 1" this year, "Sep 30, 2025" before it (design-spec 1.2). */
export const formatDate = (
  value: DateInput,
  { timeZone, now = new Date() }: NowOptions,
) => {
  const instant = toInstant(value, timeZone);
  const sameYear =
    dateParts(instant.date, instant.timeZone).year ===
    dateParts(now, timeZone).year;
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: instant.timeZone,
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(instant.date);
};

/** A time of day on the 12-hour clock ("1:05 PM"). */
export const formatTime = (value: DateInput, { timeZone }: ZoneOptions) =>
  new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(toInstant(value, timeZone).date);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Within 24 hours: "just now" under a minute, then "5m ago" and "2h ago" (rounded down).
 * Older: the date. Up to a minute ahead of `now` (clock skew between the server and the
 * device) also reads as "just now"; further ahead is not "ago", so it is the date.
 */
export const formatRelativeTime = (value: DateInput, options: NowOptions) => {
  const now = options.now ?? new Date();
  const elapsed =
    now.getTime() - toInstant(value, options.timeZone).date.getTime();
  if (elapsed <= -MINUTE) return formatDate(value, { ...options, now });
  if (elapsed < MINUTE) return i18n.t("format:relative.justNow");
  if (elapsed < HOUR)
    return i18n.t("format:relative.minutesAgo", {
      count: Math.floor(elapsed / MINUTE),
    });
  if (elapsed < DAY)
    return i18n.t("format:relative.hoursAgo", {
      count: Math.floor(elapsed / HOUR),
    });
  return formatDate(value, { ...options, now });
};

/**
 * How long past its deadline a date-only due date is, in the user's time zone
 * ("overdue 2d"). Null on or before the day itself. The date is shown with `formatDate`:
 * deadlines are never relative (design-spec 1.2).
 */
export const formatOverdue = (
  dueDate: DateOnly,
  { timeZone, now = new Date() }: NowOptions,
) => {
  if (!DATE_ONLY.test(dueDate))
    throw new RangeError(`A due date is a date only: ${dueDate}`);
  const today = formatIsoDate(now, { timeZone });
  const days = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) /
      DAY,
  );
  return days > 0 ? i18n.t("format:overdue", { count: days }) : null;
};

/**
 * A wait such as the retry time of a rate limit: rounded up to minutes ("1 minute",
 * "45 minutes"), and once that reaches 60, rounded up to hours ("1 hour", "2 hours";
 * design-spec 1.2).
 */
export const formatWaitTime = (seconds: number) => {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 60) return i18n.t("format:wait.minute", { count: minutes });
  return i18n.t("format:wait.hour", { count: Math.ceil(seconds / 3600) });
};

/**
 * The name of a check (design-spec 6.1). Competitors carries its threshold and the guide's
 * upper end: "Competitors (3–5)", "(4–5)", and "(7+)" once the threshold reaches the end.
 */
export const formatCheckName = (
  key: CheckKey,
  params: Record<string, number>,
) => {
  if (key !== "competitors") return i18n.t(`common:check.${key}`);
  const { min, max } = params;
  if (min === undefined || max === undefined)
    throw new Error("The competitors check needs params { min, max }");
  return min < max
    ? i18n.t("common:check.competitorsRange", { min, max })
    : i18n.t("common:check.competitorsAtLeast", { min });
};
