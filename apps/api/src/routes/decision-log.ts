import { schema } from "@moonx/db";
import { listDecisionLogQuerySchema } from "@moonx/schemas";
import { and, eq, gte, lt, lte } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import { type AccessInput, accessPlugin } from "../access";
import type { AppContext } from "../context";
import { ApiError } from "../errors";
import { loadDecisionSummaries } from "../lib/decision-log";
import { loadDecisionEntry } from "../lib/decision-record";
import { decodeCursor, toPage } from "../lib/page";
import { addDays, resolveTimeZone, startOfLocalDay } from "../lib/timezone";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * L1 and L2 (SDD 5.11). The log is append-only, so there is no route that changes or deletes an
 * entry. Every role of the workspace may read it (SDD 7.1).
 */
export function decisionLogRoutes(ctx: AppContext) {
  const { db } = ctx;
  return new Elysia({ name: "moonx-decision-log" })
    .use(accessPlugin(ctx))
    .get(
      "/workspaces/:workspaceId/decision-log",
      async ({ query, user, scope }) => {
        // A date without a time means a whole day on the caller's calendar.
        const zone = resolveTimeZone(user.timezone);
        const from = query.from
          ? DATE_ONLY.test(query.from)
            ? startOfLocalDay(query.from, zone)
            : new Date(query.from)
          : null;
        const to = query.to
          ? DATE_ONLY.test(query.to)
            ? startOfLocalDay(addDays(query.to, 1), zone)
            : new Date(query.to)
          : null;
        const upperBound = query.to && DATE_ONLY.test(query.to) ? lt : lte;
        const entries = schema.decisionLogEntries;
        const offset = decodeCursor(query.cursor);
        const items = await loadDecisionSummaries(
          db,
          scope.workspaceId,
          and(
            eq(entries.workspaceId, scope.workspaceId),
            query.kind ? eq(entries.kind, query.kind) : undefined,
            query.ideaId ? eq(entries.ideaId, query.ideaId) : undefined,
            query.planId ? eq(entries.businessPlanId, query.planId) : undefined,
            query.recordedBy ? eq(entries.recordedById, query.recordedBy) : undefined,
            from ? gte(entries.recordedAt, from) : undefined,
            to ? upperBound(entries.recordedAt, to) : undefined,
          ),
          query.limit + 1,
          offset,
        );
        return toPage(items, offset, query.limit);
      },
      {
        params: z.object({ workspaceId: z.uuid() }),
        query: listDecisionLogQuerySchema,
        scoped: { to: { workspaceId: "workspaceId" }, need: "member" },
      },
    )
    .get(
      "/decision-log/:entryId",
      ({ params, scope }) => loadDecisionEntry(db, scope.workspaceId, params.entryId),
      {
        params: z.object({ entryId: z.uuid() }),
        scoped: {
          to: async ({ params }: AccessInput) => {
            const [entry] = await db
              .select({ workspaceId: schema.decisionLogEntries.workspaceId })
              .from(schema.decisionLogEntries)
              .where(eq(schema.decisionLogEntries.id, params.entryId));
            if (!entry) throw new ApiError("NOT_FOUND", "Decision not found");
            return { workspaceId: entry.workspaceId };
          },
          need: "member",
        },
      },
    );
}
