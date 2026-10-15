import { z } from "zod";
import {
  dateTimeSchema,
  goNoGoValueSchema,
  userRefSchema,
  uuidSchema,
} from "./common";

// The plan types of SDD 5.9.

/** A plan as 13 and 20 list it. */
export const planSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  archived: z.boolean(),
  latestVersion: z
    .object({ id: uuidSchema, name: z.string(), savedAt: dateTimeSchema })
    .nullable(),
  /**
   * An answer, table, the header or an execution item was updated after the latest
   * version was saved ("+ changes"). False when no version is saved.
   */
  hasChangesSinceVersion: z.boolean(),
  latestGoNoGo: z
    .object({
      value: goNoGoValueSchema,
      recordedAt: dateTimeSchema,
      recordedBy: userRefSchema,
    })
    .nullable(),
});
export type PlanSummary = z.infer<typeof planSummarySchema>;
