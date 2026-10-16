import { z } from "zod";

/** Z1 `GET /api/health` (SDD 5.14). */
export const healthSchema = z.object({
  status: z.literal("ok"),
  /** Commit SHA of the running version. */
  version: z.string(),
  env: z.string(),
});
export type Health = z.infer<typeof healthSchema>;

/** Z2 `GET /api/health/db` (SDD 5.14). */
export const healthDbSchema = z.object({
  status: z.literal("ok"),
  /** Round trip of one query, in whole milliseconds. */
  latencyMs: z.number().int().nonnegative(),
});
export type HealthDb = z.infer<typeof healthDbSchema>;
