import {
  businessPlans,
  type Database,
  decisionLogEntries,
  ideas,
  users,
} from "@moonx/db";
import { formatIsoDate } from "@moonx/i18n";
import {
  decisionLogEntryParamsSchema,
  decisionLogEntrySchema,
  decisionLogPageSchema,
  decisionLogQuerySchema,
  decisionSnapshotSchema,
  errorBodySchema,
  uuidSchema,
} from "@moonx/schemas";
import { and, eq, isNull, or } from "drizzle-orm";
import { Elysia } from "elysia";
import type { AccessPlugin, ScopeLocator } from "./access";
import { ApiError } from "./errors";
import { decisionSummaries, newestDecisionFirst } from "./idea-views";

/** Finds the idea of the decision log entry in the path (L2). */
const entryLocator: ScopeLocator = async ({ params, db }) => {
  const id = params.entryId ?? "";
  if (!uuidSchema.safeParse(id).success) return null;
  const [entry] = await db
    .select({ ideaId: decisionLogEntries.ideaId })
    .from(decisionLogEntries)
    .where(eq(decisionLogEntries.id, id));
  return entry === undefined ? null : { ideaId: entry.ideaId };
};

/** What the decision log routes need from the app. */
export interface DecisionLogRoutesOptions {
  access: AccessPlugin;
  db: Database;
}

const errors = {
  401: errorBodySchema,
  403: errorBodySchema,
  404: errorBodySchema,
} as const;

/** L1 and L2 (SDD 5.11): 7 Decision Log. Entries are only added, never changed. */
export function decisionLogRoutes({ access, db }: DecisionLogRoutesOptions) {
  return new Elysia()
    .use(access)
    .get(
      "/api/v1/workspaces/:workspaceId/decision-log",
      async ({ scope, caller, query }) => {
        const rows = await db
          .select({ entry: decisionLogEntries })
          .from(decisionLogEntries)
          .innerJoin(ideas, eq(ideas.id, decisionLogEntries.ideaId))
          .leftJoin(
            businessPlans,
            eq(businessPlans.id, decisionLogEntries.businessPlanId),
          )
          .where(
            and(
              eq(decisionLogEntries.workspaceId, scope.workspaceId),
              // Undoing a creation removes what it made from every list (SDD 5.11).
              isNull(ideas.deletedAt),
              or(isNull(businessPlans.id), isNull(businessPlans.deletedAt)),
              query.kind === undefined
                ? undefined
                : eq(decisionLogEntries.kind, query.kind),
              query.ideaId === undefined
                ? undefined
                : eq(decisionLogEntries.ideaId, query.ideaId),
              query.planId === undefined
                ? undefined
                : eq(decisionLogEntries.businessPlanId, query.planId),
              query.recordedBy === undefined
                ? undefined
                : eq(decisionLogEntries.recordedById, query.recordedBy),
            ),
          )
          .orderBy(...newestDecisionFirst);
        let entries = rows.map((row) => row.entry);
        if (query.from !== undefined || query.to !== undefined) {
          // The period is days of the caller's calendar, as 7 shows the dates.
          const [me] = await db
            .select({ timezone: users.timezone })
            .from(users)
            .where(eq(users.id, caller.id));
          if (me === undefined) throw new Error(`No user ${caller.id}`);
          const timeZone = me.timezone;
          const { from, to } = query;
          entries = entries.filter((entry) => {
            const day = formatIsoDate(entry.recordedAt, { timeZone });
            return (
              (from === undefined || day >= from) &&
              (to === undefined || day <= to)
            );
          });
        }
        const offset = query.cursor ?? 0;
        const end = offset + query.limit;
        return {
          items: await decisionSummaries(
            db,
            scope.workspaceId,
            entries.slice(offset, end),
          ),
          nextCursor: end < entries.length ? String(end) : null,
        };
      },
      {
        scoped: { to: "workspaceId", need: "read" },
        query: decisionLogQuerySchema,
        response: {
          200: decisionLogPageSchema,
          ...errors,
          422: errorBodySchema,
        },
        detail: {
          summary: "L1 The decision log (7)",
          description:
            "Decisions, Go / No-Go and saved versions of the workspace, newest first, archived ideas and plans included. from and to are dates in the caller's time zone, both included.",
        },
      },
    )
    .get(
      "/api/v1/decision-log/:entryId",
      async ({ scope, params }) => {
        const [entry] = await db
          .select()
          .from(decisionLogEntries)
          .where(eq(decisionLogEntries.id, params.entryId));
        if (entry === undefined) {
          throw new ApiError("NOT_FOUND", "No such decision log entry");
        }
        const [summary] = await decisionSummaries(db, scope.workspaceId, [
          entry,
        ]);
        if (summary === undefined) throw new Error("No decision summary");
        return {
          ...summary,
          reason: entry.reason,
          snapshot: decisionSnapshotSchema.parse(entry.snapshot),
        };
      },
      {
        scoped: { to: entryLocator, need: "read" },
        params: decisionLogEntryParamsSchema,
        response: { 200: decisionLogEntrySchema, ...errors },
        detail: {
          summary: "L2 A decision log entry (7)",
          description:
            "The entry with what it kept of the moment it was recorded: the checks not done, the key metrics, the F/A/U breakdown, a Go / No-Go's conditions and the plan version.",
        },
      },
    );
}
