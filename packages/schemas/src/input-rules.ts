import { z } from "zod";
import type { EconomicsField, TemplateKind } from "./common";
import { dateOnlySchema } from "./common";

// The input rules of design-spec 6.0.8, which owns the values: copy them from there, and
// change them there first. Endpoint schemas compose these blocks; the form checks use the
// same blocks while typing (SDD 7.2).

/** Length limits by kind of text, in Unicode characters. */
export const TEXT_LIMITS = { short: 200, reason: 5000, long: 20000 } as const;

export const MONEY_MAX = 1_000_000_000_000;
export const UNITS_PER_DAY_MAX = 1_000_000_000;
export const URL_MAX = 2000;
export const EMAIL_MAX = 254;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
// A MB is 1,000,000 bytes (design-spec 6.0.8).
const MB = 1_000_000;
export const PHOTO_MAX_BYTES = 5 * MB;
export const AI_PASTE_MAX_CHARS = 200_000;
export const AI_FILE_MAX_BYTES = MB;
export const TEMPLATE_FILE_MAX_BYTES = MB;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const DISPLAY_NAME_MAX = 60;
export const WORKSPACE_NAME_MAX = 60;

/**
 * The rule a `custom` issue breaks, in `issue.params.rule`, so the client can pick its
 * catalog text (SDD 9章: screens never show `message`). Length and range issues carry
 * Zod's own `too_small` / `too_big` with `minimum` / `maximum` instead.
 */
export type InputRule =
  | "required"
  | "decimals"
  | "positive"
  | "nul_character"
  | "number_format"
  | "currency"
  | "time_zone"
  | "lone_surrogate"
  | "unique";

/** The `params` of a `custom` issue that breaks `rule`. */
export const ruleIssue = (
  rule: InputRule,
  extra: Record<string, number> = {},
) => ({
  params: { rule, ...extra },
});

/** Counts Unicode characters (code points), so an emoji or a CJK character counts once. */
export const countChars = (value: string) => Array.from(value).length;

const isBlank = (value: string) => value.trim().length === 0;

const hasAtMostDecimals = (value: number, digits: number) =>
  Number(value.toFixed(digits)) === value;

/**
 * Length, no U+0000 and no lone surrogate. PostgreSQL `text` cannot hold U+0000, and a
 * lone surrogate (a JSON `\ud800` escape) is no character: `text` stores it as U+FFFD
 * and `jsonb` refuses it. Either would otherwise change the input or fail as a 500
 * instead of a 422.
 */
const checkText = (
  value: string,
  min: number,
  max: number,
  ctx: z.RefinementCtx,
) => {
  if (value.includes("\u0000"))
    ctx.addIssue({
      code: "custom",
      input: value,
      message: "Must not contain a NUL character",
      ...ruleIssue("nul_character"),
    });
  if (!value.isWellFormed())
    ctx.addIssue({
      code: "custom",
      input: value,
      message: "Must not contain a lone surrogate",
      ...ruleIssue("lone_surrogate"),
    });
  const length = countChars(value);
  if (length < min) {
    ctx.addIssue({
      code: "too_small",
      origin: "string",
      minimum: min,
      inclusive: true,
      input: value,
      message: `Must be at least ${min} characters`,
    });
  } else if (length > max) {
    ctx.addIssue({
      code: "too_big",
      origin: "string",
      maximum: max,
      inclusive: true,
      input: value,
      message: `Must be at most ${max} characters`,
    });
  }
};

/**
 * A required text. Whitespace only counts as empty, reported as the rule `required` (so a
 * blank password reads differently from a short one). The value is kept as typed (not
 * trimmed).
 */
export const requiredText = (max: number, min = 1) =>
  z.string().superRefine((value, ctx) => {
    if (isBlank(value)) {
      ctx.addIssue({
        code: "custom",
        input: value,
        message: "Required",
        ...ruleIssue("required"),
      });
      return;
    }
    checkText(value, min, max, ctx);
  });

/**
 * An optional text: whitespace only is saved as null. Accepts null; an endpoint where the
 * field may be left out adds `.optional()` itself, so a missing field stays "not sent"
 * instead of turning into null.
 */
export const optionalText = (max: number) =>
  z
    .string()
    .nullable()
    .superRefine((value, ctx) => {
      if (value !== null && !isBlank(value)) checkText(value, 0, max, ctx);
    })
    .transform((value) => (value === null || isBlank(value) ? null : value));

/**
 * A text that may be empty but is never null, like a cost row name. Whitespace only is
 * saved as the empty string, whatever its length.
 */
export const plainText = (max: number) =>
  z
    .string()
    .superRefine((value, ctx) => {
      if (!isBlank(value)) checkText(value, 0, max, ctx);
    })
    .transform((value) => (isBlank(value) ? "" : value));

const decimal = (min: number, max: number, digits: number) =>
  z
    .number()
    .min(min)
    .max(max)
    .refine((value) => hasAtMostDecimals(value, digits), {
      message: `At most ${digits} decimal places`,
      ...ruleIssue("decimals", { digits }),
    });

export const moneySchema = decimal(0, MONEY_MAX, 2);

/** A % as typed in a form (12.25). */
export const percentInputSchema = decimal(0, 100, 2);

/**
 * A % as the API carries it: a 0 to 1 rate (SDD 5.1). Its four decimal places are the two
 * of the typed %.
 */
export const rateSchema = decimal(0, 1, 4);

/** The typed % (12.25) as the stored rate (0.1225). */
export const percentToRate = (percent: number) =>
  Number((percent / 100).toFixed(4));

/** The stored rate (0.1225) as the % a form shows (12.25). */
export const rateToPercent = (rate: number) => Number((rate * 100).toFixed(2));

export const dateInputSchema = dateOnlySchema;

/**
 * Starts with `http://` or `https://` as written (design-spec 6.0.8). Checked on the raw
 * text before Zod's URL check, which would pass `HTTPS://` (`URL` lowercases the scheme)
 * and trim surrounding spaces. Both fail with the same `invalid_format` as any other
 * non-URL.
 */
export const urlSchema = z
  .string()
  .superRefine((value, ctx) => {
    if (!/^https?:\/\//.test(value) || value.trim() !== value)
      ctx.addIssue({
        code: "invalid_format",
        format: "url",
        input: value,
        message: "Must start with http:// or https://",
      });
  })
  .pipe(z.url({ protocol: /^https?$/ }))
  .superRefine((value, ctx) => checkText(value, 1, URL_MAX, ctx));

/**
 * An email address. Kept as typed: addresses are compared ignoring case, with
 * `sameEmail`.
 */
export const emailSchema = z
  .email()
  .superRefine((value, ctx) => checkText(value, 1, EMAIL_MAX, ctx));

/** Whether two addresses are the same address: design-spec 6.0.8 ignores case. */
export const sameEmail = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase();

/**
 * A typed number: digits with an optional decimal part, and thousands separators only in
 * groups of three ("1,500.50" yes, "1,5" no). `formatNumberText` in packages/i18n
 * regroups exactly the text this accepts.
 */
export const groupedNumberPattern = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;

/**
 * A number typed into a form, with optional thousands separators ("1,500.50"), then
 * checked by `target`. Commas must group by three, so "1,5" is refused instead of being
 * read as 15.
 */
export const numberTextSchema = <T extends z.ZodType<number, number>>(
  target: T,
) =>
  z
    .string()
    .trim()
    .refine((text) => groupedNumberPattern.test(text), {
      message: "Enter a number",
      ...ruleIssue("number_format"),
    })
    .transform((text) => Number(text.replaceAll(",", "")))
    .pipe(target);

// ---- Rows of the 6.0.8 table ----

/**
 * Counted in Unicode characters like every text (design-spec 6.0.8). Better Auth measures
 * `password.length` in UTF-16 units, so its own limits must be set wide enough never to
 * refuse a password this accepts.
 */
export const passwordSchema = requiredText(PASSWORD_MAX, PASSWORD_MIN);
export const displayNameSchema = requiredText(DISPLAY_NAME_MAX);

const timeZoneName = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;
const isTimeZone = (value: string) => {
  if (!timeZoneName.test(value)) return false;
  let resolved: string;
  try {
    resolved = new Intl.DateTimeFormat("en", {
      timeZone: value,
    }).resolvedOptions().timeZone;
  } catch {
    return false;
  }
  // Bun returns the name in its own case; another name is V8 resolving an alias.
  return resolved === value || resolved.toLowerCase() !== value.toLowerCase();
};

/**
 * An IANA time zone name the runtime can format in, spelt in its own case: "asia/manila"
 * fails, so a stored name always matches the picker's. V8 swaps an alias for another
 * name, so it cannot tell the case of an alias ("asia/kolkata") and lets it pass; Bun,
 * where the API checks, refuses it. Not checked against
 * `Intl.supportedValuesOf("timeZone")`: that list differs between runtimes and leaves out
 * names browsers report for the device, such as "UTC" in V8 and "Asia/Kolkata" in Bun.
 * The pattern refuses UTC offsets ("+08:00"), which newer engines also accept.
 */
export const timeZoneSchema = z.string().refine(isTimeZone, {
  message: "Unknown time zone",
  ...ruleIssue("time_zone"),
});

/**
 * The ISO 4217 codes of the currencies in circulation, as of 2026-10, for the currency
 * pickers and their check: the ISO 4217 list without funds, units of account, precious
 * metals, bond units and the test codes (design-spec 6.0.8). A fixed list, not
 * `Intl.supportedValuesOf("currency")`: Bun and V8 return different lists (307 and 162
 * codes) and both keep replaced codes, and Web and API must agree.
 */
export const CURRENCY_CODES = [
  ..."AED AFN ALL AMD AOA ARS AUD AWG AZN BAM BBD BDT BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VED VES VND VUV WST XAF XCD XCG XOF XPF YER ZAR ZMW ZWG".split(
    " ",
  ),
] as const;

const currencies = new Set<string>(CURRENCY_CODES);
export const currencySchema = z
  .string()
  .refine((value) => currencies.has(value), {
    message: "Unknown currency",
    ...ruleIssue("currency"),
  });

export const workspaceNameSchema = requiredText(WORKSPACE_NAME_MAX);
/** Also what the default name of a copy keeps to (design-spec 6.8). */
export const IDEA_NAME_MAX = 100;
export const ideaNameSchema = requiredText(IDEA_NAME_MAX);
export const oneLineConceptSchema = requiredText(200);

export const shortTextSchema = optionalText(TEXT_LIMITS.short);
export const longTextSchema = optionalText(TEXT_LIMITS.long);
export const requiredShortTextSchema = requiredText(TEXT_LIMITS.short);
export const requiredLongTextSchema = requiredText(TEXT_LIMITS.long);

/** The reason of a decision and of a Go / No-Go. */
export const reasonSchema = requiredText(TEXT_LIMITS.reason);
export const commentBodySchema = requiredText(TEXT_LIMITS.reason);
/** Guidance and hints of a template. */
export const guidanceSchema = optionalText(TEXT_LIMITS.reason);

/** 15 Type of a competitor. */
export const competitorTypeSchema = z.enum([
  "direct",
  "indirect",
  "substitute",
]);
export type CompetitorType = z.infer<typeof competitorTypeSchema>;

export const costRowNameSchema = plainText(TEXT_LIMITS.short);
/** 17 Can Reduce? of a startup cost row. */
export const canReduceSchema = z.enum(["yes", "partly", "no"]);
export type CanReduce = z.infer<typeof canReduceSchema>;

/** 18 Selling price. */
export const sellingPriceSchema = moneySchema.refine((value) => value > 0, {
  message: "Must be greater than 0",
  ...ruleIssue("positive"),
});

/**
 * 18 Operating days per month. The range comes before `.int()`, so a huge number reports
 * 1 to 31 first, not the safe integer limit.
 */
export const operatingDaysSchema = z.number().min(1).max(31).int();

/** 18 Target operating margin as typed. */
export const targetMarginInputSchema = decimal(0, 99, 2);
/** 18 Target operating margin as the API carries it, a rate. */
export const targetMarginRateSchema = decimal(0, 0.99, 4);

/** 18 Daily sales of a scenario. */
export const unitsPerDaySchema = decimal(0, UNITS_PER_DAY_MAX, 2);

/** The rule of each number of 18, as the API carries it (the target margin as a rate). */
export const economicsValueSchemas: Record<
  EconomicsField,
  z.ZodType<number, number>
> = {
  selling_price: sellingPriceSchema,
  operating_days: operatingDaysSchema,
  target_margin: targetMarginRateSchema,
  units_conservative: unitsPerDaySchema,
  units_expected: unitsPerDaySchema,
  units_strong: unitsPerDaySchema,
  units_capacity: unitsPerDaySchema,
};

export const versionNameSchema = requiredText(80);
export const planNameSchema = requiredText(80);

/** 21 A text cell of a table item. */
export const tableTextCellSchema = optionalText(2000);
/** 21 A number cell of a table item. */
export const tableNumberCellSchema = decimal(0, MONEY_MAX, 2);

/** 22 An assignee typed as a name instead of picked from the members. */
export const assigneeNameSchema = optionalText(60);

/** 27 A check threshold. */
export const checkThresholdSchema = z.number().min(1).max(99).int();

/** The validation sections that hold questions (design-spec 6.6). */
export const VALIDATION_QUESTION_SECTIONS = [
  "01",
  "02",
  "04",
  "08",
  "10",
] as const;

// The sections of design-spec 6.6: the question sections of a validation and the 30 plan
// items. Self-analysis section names are words, so only their form is checked.
const questionKeyPatterns: Record<TemplateKind, RegExp> = {
  self_analysis: /^SA\.[A-Z0-9_]+\.[1-9][0-9]*$/,
  validation: new RegExp(
    `^V\\.(?:${VALIDATION_QUESTION_SECTIONS.join("|")})\\.[A-Z0-9_]+$`,
  ),
  business_plan: /^P\.(?:0[1-9]|[12][0-9]|30)\.[1-9][0-9]*$/,
};

/**
 * Whether `key` has the question ID format of design-spec 6.6 for a template of `kind`.
 * A predicate, not a schema: the API answers a bad key with its own code, 422
 * INVALID_QUESTION_KEY (SDD 5.13 AD4).
 */
export const isQuestionKey = (key: string, kind: TemplateKind) =>
  questionKeyPatterns[kind].test(key);

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

/**
 * `base` followed by `suffix`, cutting the end of `base` so the whole fits in `max`
 * characters. For the default names "{display name}'s workspace" and "{idea name}
 * (copy)". Cuts between user-perceived characters, so an emoji made of several code points
 * is kept whole or dropped, never turned into another one.
 */
export const fitWithSuffix = (base: string, suffix: string, max: number) => {
  let room = max - countChars(suffix);
  let kept = "";
  for (const { segment } of graphemes.segment(base)) {
    room -= countChars(segment);
    if (room < 0) break;
    kept += segment;
  }
  return kept + suffix;
};
