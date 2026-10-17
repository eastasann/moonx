import { z } from "zod";
import {
  dateOnlySchema,
  dateTimeSchema,
  metricValueSchema,
  uuidSchema,
} from "./common";
import { PLAN_ITEM_COUNT } from "./plans";

// The Pitch Deck of SDD 5.9 (P12, P13): the slides packages/domain builds from a plan
// (design-spec 6.14), as 23 shows them and the PDF prints them.

/** One-minute (8 slides) or five-minute (14 slides). */
export const pitchVariantSchema = z.enum(["one", "five"]);
export type PitchVariant = z.infer<typeof pitchVariantSchema>;

export const pitchSlideKeySchema = z.enum([
  "title",
  "problem",
  "customer",
  "solution",
  "why_now",
  "market",
  "competition",
  "business_model",
  "economics",
  "funding",
  "why_us",
  "execution",
  "launch",
  "risks",
  "next_step",
  "ask",
]);
export type PitchSlideKey = z.infer<typeof pitchSlideKeySchema>;

export const pitchSlideTypeSchema = z.enum([
  "title",
  "text",
  "number",
  "table",
]);
export type PitchSlideType = z.infer<typeof pitchSlideTypeSchema>;

/** The query of P12 and P13. */
export const pitchDeckQuerySchema = z.object({
  variant: pitchVariantSchema,
  versionId: uuidSchema.optional(),
});

/** A text a source fills; `empty` when the source is blank and `text` is "Not written yet". */
export const pitchTextSchema = z.object({
  text: z.string(),
  empty: z.boolean(),
});
export type PitchText = z.infer<typeof pitchTextSchema>;

/** A bullet: the source's name and what it says. */
export const pitchBulletSchema = pitchTextSchema.extend({ label: z.string() });
export type PitchBullet = z.infer<typeof pitchBulletSchema>;

export const pitchTableColumnSchema = z.object({
  label: z.string(),
  /** Amounts and counts, written in the monospaced font and aligned right. */
  numeric: z.boolean(),
  /** The column's share of the table's width; a table's widths add up to 1. */
  width: z.number().positive().max(1),
});
export type PitchTableColumn = z.infer<typeof pitchTableColumnSchema>;

export const pitchSlideSchema = z.object({
  /** The comment target of a slide is `pitch_slide` with the key `{variant}.{key}`. */
  key: pitchSlideKeySchema,
  type: pitchSlideTypeSchema,
  /** The slide's name; the title slide's is the Business Name, which may be blank. */
  title: pitchTextSchema,
  /** The title slide's §1 What is the business?; null on the others. */
  subtitle: pitchTextSchema.nullable(),
  /**
   * A text slide's sources, one each; the title slide's Prepared by, Date and Version;
   * the notes under a number or table slide's figures or table.
   */
  bullets: z.array(pitchBulletSchema),
  /** The figures of a number slide, and the economics slide's beside its table. */
  numbers: z.array(
    z.object({
      label: z.string(),
      metricKey: z.string(),
      value: metricValueSchema,
    }),
  ),
  /**
   * How the fit set the figures side by side (`figureColumns` of packages/domain), measured
   * with the PDF's font files, so 23 lays them out as the PDF does (ADR-012): each
   * column's width in pt of `semantic.print.slide`, in the order of `numbers`, and
   * whether they fit unbroken (false: they share the width by their widths, and long
   * values break). Null on a slide without figures, and before the fit.
   */
  figureColumns: z
    .object({
      widths: z.array(z.number().positive()),
      fits: z.boolean(),
    })
    .nullable(),
  /** Formatted cells; null is a blank cell. No rows: the table's source is empty. */
  table: z
    .object({
      columns: z.array(pitchTableColumnSchema),
      rows: z.array(z.array(z.string().nullable())),
    })
    .nullable(),
  /** The names of the sources that show "Not written yet". */
  emptySources: z.array(z.string()),
  /**
   * How many steps of `semantic.print.slide.shrink-step` every font size of the slide
   * went down to fit, each stopping at its `-min`.
   */
  shrink: z.int().nonnegative(),
  /**
   * It did not fit at the smallest sizes: texts were cut with "…", or it runs past the
   * bottom of its body even so. Figures that only break do not set it (design-spec 6.14).
   */
  overflow: z.boolean(),
  /** Null for a Viewer, a version, an archived plan or idea (design-spec 6.14). */
  editSource: z
    .object({ itemNo: z.int().min(1).max(PLAN_ITEM_COUNT) })
    .nullable(),
  editInValidation: z.enum(["costs", "economics"]).nullable(),
  commentCount: z.int().nonnegative(),
});
export type PitchSlide = z.infer<typeof pitchSlideSchema>;

/** P12: the slides of one variant, from the plan now or a saved version. */
export const pitchDeckSchema = z.object({
  variant: pitchVariantSchema,
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("latest") }),
    z.object({
      kind: z.literal("version"),
      versionId: uuidSchema,
      name: z.string(),
      savedAt: dateTimeSchema,
    }),
  ]),
  businessName: z.string(),
  generatedAt: dateTimeSchema,
  footer: z.object({
    businessName: z.string(),
    /** The version's name, or "Draft" for the plan now. */
    versionLabel: z.string(),
    /** The day of the content (the last change, or the version's save) for the caller. */
    date: dateOnlySchema,
  }),
  /** §30's One-minute or Five-minute explanation. Never printed. */
  speakerNotes: z.string().nullable(),
  slides: z.array(pitchSlideSchema),
});
export type PitchDeck = z.infer<typeof pitchDeckSchema>;
