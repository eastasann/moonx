import { z } from "zod";
import {
  checkResultSchema,
  dateOnlySchema,
  dateTimeSchema,
  decisionValueSchema,
  fauBreakdownSchema,
  goNoGoValueSchema,
  keyMetricsSchema,
  pageQuerySchema,
  pageSchema,
  userRefSchema,
  uuidSchema,
} from "./common";

// The decision log of SDD 5.11. Entries are only ever added: no update or delete.

export const decisionLogKindSchema = z.enum([
  "validation_decision",
  "go_no_go",
  "version_saved",
]);
export type DecisionLogKind = z.infer<typeof decisionLogKindSchema>;

/** An idea or plan named where it is listed. */
export const namedRefSchema = z.object({ id: uuidSchema, name: z.string() });
export type NamedRef = z.infer<typeof namedRefSchema>;

/**
 * The longest `reasonExcerpt`, and the excerpts of notifications, in characters: the
 * client clamps it to the one or two lines design-spec 6.15 shows.
 */
export const EXCERPT_MAX = 200;

export const decisionLogSummarySchema = z.object({
  id: uuidSchema,
  kind: decisionLogKindSchema,
  /** Null for a saved version. */
  value: z.union([decisionValueSchema, goNoGoValueSchema]).nullable(),
  /** The saved version's name, for a saved version and a Go / No-Go on one. */
  versionName: z.string().nullable(),
  idea: namedRefSchema,
  plan: namedRefSchema.nullable(),
  /** The start of the reason, at most {@link EXCERPT_MAX} characters. */
  reasonExcerpt: z.string().nullable(),
  recordedBy: userRefSchema,
  recordedAt: dateTimeSchema,
});
export type DecisionLogSummary = z.infer<typeof decisionLogSummarySchema>;

/** What an entry keeps of the validation at the moment it was recorded. */
export const decisionSnapshotSchema = z.object({
  missingChecks: z.array(checkResultSchema),
  keyMetrics: keyMetricsSchema,
  fau: fauBreakdownSchema,
  /** A Go / No-Go: the three conditions of §24. */
  conditions: z
    .object({
      launchIf: z.string().nullable(),
      delayIf: z.string().nullable(),
      stopIf: z.string().nullable(),
    })
    .optional(),
  /** A Go / No-Go or a saved version: the plan version it was recorded on. */
  planVersion: namedRefSchema.nullable().optional(),
});
export type DecisionSnapshot = z.infer<typeof decisionSnapshotSchema>;

export const decisionLogEntrySchema = decisionLogSummarySchema.extend({
  reason: z.string().nullable(),
  snapshot: decisionSnapshotSchema,
});
export type DecisionLogEntry = z.infer<typeof decisionLogEntrySchema>;

/** L1 GET. */
export const decisionLogPageSchema = pageSchema(decisionLogSummarySchema);

/**
 * The query of L1. `from` and `to` are dates in the caller's time zone, both included:
 * the period of 7 filters by the day an entry was recorded on, as the caller sees it.
 */
export const decisionLogQuerySchema = pageQuerySchema.extend({
  kind: decisionLogKindSchema.optional(),
  ideaId: uuidSchema.optional(),
  planId: uuidSchema.optional(),
  recordedBy: uuidSchema.optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
});
export type DecisionLogQuery = z.infer<typeof decisionLogQuerySchema>;

/** The `{entryId}` of L2. */
export const decisionLogEntryParamsSchema = z.object({ entryId: z.string() });
