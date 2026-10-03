import { LOCALE } from "@moonx/i18n";

/** Display and parsing of one number format in en-PH. */
export interface NumberSyntax {
  format: (value: number) => string;
  /** The number the text means, or `NaN` when it is empty or not a number. */
  parse: (text: string) => number;
}

const MINUS_SIGNS = /[−‒–-]/g;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Builds the formatter and the matching parser for `options`. The parser learns the group,
 * decimal, currency and percent symbols from `formatToParts`, so what `format` produces always
 * parses back. It covers decimal, currency and percent styles; compact notation and units are
 * not parsed.
 */
export function createNumberSyntax(options: Intl.NumberFormatOptions = {}): NumberSyntax {
  const formatter = new Intl.NumberFormat(LOCALE, options);
  const parts = formatter.formatToParts(-1234567.5);
  const symbols = new Set<string>();
  let decimal = ".";
  for (const part of formatter.formatToParts(1234567.5)) {
    if (part.type === "decimal") decimal = part.value;
    if (part.type === "group" || part.type === "currency" || part.type === "percentSign") {
      symbols.add(part.value);
    }
  }
  for (const part of parts) {
    if (part.type === "currency" || part.type === "percentSign") symbols.add(part.value);
  }
  const strip = new RegExp(
    [...symbols, ...(options.style === "percent" ? ["%"] : [])]
      .filter((symbol) => symbol !== decimal)
      .map(escapeRegExp)
      .join("|") || "(?!)",
    "g",
  );
  const percent = options.style === "percent";

  const parse = (text: string): number => {
    let cleaned = text.replace(strip, "").replace(/\s/g, "").replace(MINUS_SIGNS, "-");
    const accounting = /^\(.*\)$/.test(cleaned);
    if (accounting) cleaned = `-${cleaned.slice(1, -1)}`;
    if (decimal !== ".") cleaned = cleaned.replace(decimal, ".");
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return Number.NaN;
    const value = Number(cleaned);
    return percent ? Number((value / 100).toPrecision(15)) : value;
  };

  return {
    format: (value) => formatter.format(value),
    parse,
  };
}

/**
 * Brings a typed value into the allowed range: snaps to `step` counted from `min` (or from 0),
 * then clamps. Same order as React Aria's NumberField.
 */
export function constrain(
  value: number,
  { min, max, step }: { min?: number; max?: number; step?: number },
): number {
  let next = value;
  if (step !== undefined && step > 0) {
    const base = min ?? 0;
    const digits = (step.toString().split(".")[1] ?? "").length;
    next = Number((base + Math.round((next - base) / step) * step).toFixed(digits));
  }
  if (max !== undefined && next > max) next = max;
  if (min !== undefined && next < min) next = min;
  return next;
}
