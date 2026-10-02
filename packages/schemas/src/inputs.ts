import { z } from "zod";
import type { economicsFieldSchema } from "./enums";

/** Amount in the workspace currency. Commas are stripped by the clients before sending. */
export const amountSchema = z.number().min(0).max(1e12);
/** Rate as a 0-1 fraction (35% is `0.35`). */
export const rateSchema = z.number().min(0).max(1);

/** Value ranges per economics field (design-spec 6.4 "入力"). */
export const economicsValueSchemas = {
  selling_price: z.number().gt(0).max(1e12),
  operating_days: z.number().int().min(1).max(31),
  target_margin: z.number().min(0).max(0.99),
  units_conservative: z.number().min(0).max(1e9),
  units_expected: z.number().min(0).max(1e9),
  units_strong: z.number().min(0).max(1e9),
  units_capacity: z.number().min(0).max(1e9),
} as const satisfies Record<z.infer<typeof economicsFieldSchema>, z.ZodNumber>;

/** `value: null` clears the input. */
export const economicsInputBodySchema = (field: z.infer<typeof economicsFieldSchema>) =>
  z.object({ value: economicsValueSchemas[field].nullable() });

/** Parses a money or number text typed by a person (accepts thousands commas). */
export function parseNumberInput(text: string): number | null {
  const cleaned = text.trim().replace(/,/g, "");
  if (cleaned === "" || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}
