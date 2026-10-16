import {
  type Database,
  type DatabaseTransaction,
  decisionLogEntries,
  ideas,
  snapshotView,
} from "@moonx/db";
import {
  buildDecisionSnapshot,
  evaluateValidation,
  keyMetricOf,
} from "@moonx/domain";
import {
  type DecisionContext,
  decisionContextSchema,
  decisionCreateSchema,
  decisionResultSchema,
  decisionSnapshotSchema,
  errorBodySchema,
} from "@moonx/schemas";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import type { AccessPlugin } from "./access";
import { ApiError } from "./errors";
import {
  decisionSummaries,
  findIdea,
  ideaKeyMetrics,
  loadIdeaContexts,
  newestDecisionFirst,
} from "./idea-views";
import { notifyDecision } from "./notifications";
import { recordChange, writeInScope } from "./scope";
import { quotedAnswer } from "./validation";

type Executor = Database | DatabaseTransaction;

/** The latest decision recorded on the idea (not a Go / No-Go), or undefined. */
async function latestDecision(db: Executor, ideaId: string) {
  const [entry] = await db
    .select()
    .from(decisionLogEntries)
    .where(
      and(
        eq(decisionLogEntries.ideaId, ideaId),
        eq(decisionLogEntries.kind, "validation_decision"),
      ),
    )
    .orderBy(...newestDecisionFirst)
    .limit(1);
  return entry;
}

/** What the decision routes need from the app. */
export interface DecisionRoutesOptions {
  access: AccessPlugin;
  db: Database;
  now: () => number;
}

/** V18 and V19 (SDD 5.7): what 19 decides on, and recording the decision. */
export function decisionRoutes({ access, db, now }: DecisionRoutesOptions) {
  return new Elysia()
    .use(access)
    .get(
      "/api/v1/ideas/:ideaId/decision-context",
      async ({ scope }): Promise<DecisionContext> => {
        const ideaId = scope.ideaId as string;
        const row = await findIdea(db, ideaId);
        if (row === undefined) throw new ApiError("NOT_FOUND", "No such idea");
        const [context] = await loadIdeaContexts(db, [row], scope.role);
        if (context === undefined) throw new Error(`No context for ${ideaId}`);
        const { state } = context.loaded;
        const { evaluation } = context;
        const last = await latestDecision(db, ideaId);
        const [lastDecision] =
          last === undefined
            ? []
            : await decisionSummaries(db, scope.workspaceId, [last]);
        return {
          summary: {
            oneLineConcept: row.oneLineConcept,
            customer: quotedAnswer(state, "V.01.WHO"),
            problem: quotedAnswer(state, "V.01.PROBLEM"),
            solution: row.proposedSolution?.trim()
              ? row.proposedSolution
              : null,
            marketType: quotedAnswer(state, "V.02.OCEAN"),
            biggestOpportunity: quotedAnswer(state, "V.10.BIGGEST_OPPORTUNITY"),
            biggestRisk: quotedAnswer(state, "V.10.BIGGEST_RISK"),
            biggestUnknown: quotedAnswer(state, "V.10.BIGGEST_UNKNOWN"),
          },
          keyMetrics: {
            ...ideaKeyMetrics(evaluation.keyMetrics),
            simple_roi: keyMetricOf(evaluation.keyMetrics, "simple_roi"),
          },
          missingChecks: evaluation.checks.filter(
            (check) => check.state !== "done",
          ),
          fau: evaluation.fau,
          lastDecision: lastDecision ?? null,
        };
      },
      {
        // An archived idea's material still shows on 19, without the form (design-spec 6.5).
        scoped: { to: "ideaId", need: "write" },
        response: {
          200: decisionContextSchema,
          401: errorBodySchema,
          403: errorBodySchema,
          404: errorBodySchema,
        },
        detail: {
          summary: "V18 What a decision is recorded on (19)",
          description:
            "The summary, key numbers, the checks not done, the F/A/U breakdown and the latest decision.",
        },
      },
    )
    .post(
      "/api/v1/ideas/:ideaId/decisions",
      async ({ scope, caller, body, status }) => {
        const ideaId = scope.ideaId as string;
        const entry = await writeInScope(
          db,
          scope,
          new Date(now()),
          async (tx) => {
            if (body.basedOnDecisionId !== null) {
              const [based] = await tx
                .select({ id: decisionLogEntries.id })
                .from(decisionLogEntries)
                .where(
                  and(
                    eq(decisionLogEntries.id, body.basedOnDecisionId),
                    eq(decisionLogEntries.ideaId, ideaId),
                    eq(decisionLogEntries.kind, "validation_decision"),
                  ),
                );
              if (based === undefined) {
                throw new ApiError(
                  "VALIDATION_FAILED",
                  "No such decision on this idea",
                  {
                    details: [
                      {
                        path: "basedOnDecisionId",
                        code: "invalid_value",
                        message: "No such decision on this idea",
                      },
                    ],
                  },
                );
              }
            }
            const latest = await latestDecision(tx, ideaId);
            // Decided under the idea's lock and after the latest decision, which may
            // come from another instance whose clock runs ahead, so the new one is the
            // latest by `recordedAt` too (SDD 5.7 V19).
            const recordedAt = new Date(
              Math.max(now(), (latest?.recordedAt.getTime() ?? 0) + 1),
            );
            if (
              latest !== undefined &&
              latest.id !== body.basedOnDecisionId &&
              body.confirmNewer !== true
            ) {
              const [summary] = await decisionSummaries(tx, scope.workspaceId, [
                latest,
              ]);
              throw new ApiError(
                "DECISION_CHANGED",
                "Someone recorded a decision after this screen was opened",
                { latest: summary },
              );
            }
            const [row] = await tx
              .select()
              .from(ideas)
              .where(eq(ideas.id, ideaId));
            if (row === undefined) throw new Error(`No idea ${ideaId}`);
            const [context] = await loadIdeaContexts(tx, [row], scope.role);
            if (context === undefined)
              throw new Error(`No context for ${ideaId}`);
            const [created] = await tx
              .insert(decisionLogEntries)
              .values({
                workspaceId: scope.workspaceId,
                ideaId,
                kind: "validation_decision",
                value: body.value,
                reason: body.reason,
                snapshot: buildDecisionSnapshot(
                  evaluateValidation(
                    context.loaded.state,
                    snapshotView(context.loaded),
                  ),
                ),
                recordedById: caller.id,
                recordedAt,
                createdAt: recordedAt,
              })
              .returning();
            if (created === undefined)
              throw new Error("decision insert failed");
            await tx
              .update(ideas)
              .set({ latestDecision: body.value })
              .where(eq(ideas.id, ideaId));
            await notifyDecision(tx, created, recordedAt);
            recordChange(tx);
            return created;
          },
        );
        const [summary] = await decisionSummaries(db, scope.workspaceId, [
          entry,
        ]);
        if (summary === undefined) throw new Error("No decision summary");
        return status(201, {
          entry: {
            ...summary,
            reason: entry.reason,
            snapshot: decisionSnapshotSchema.parse(entry.snapshot),
          },
          latestDecision: body.value,
          canCreatePlan: body.value === "proceed",
        });
      },
      {
        scoped: { to: "ideaId", need: "writeUnarchived" },
        body: decisionCreateSchema,
        parse: "json",
        response: {
          201: decisionResultSchema,
          401: errorBodySchema,
          403: errorBodySchema,
          404: errorBodySchema,
          409: errorBodySchema,
          422: errorBodySchema,
        },
        detail: {
          summary: "V19 Record a decision",
          description:
            "Adds a decision log entry with a snapshot of the checks not done, the key metrics and the F/A/U breakdown, changes the idea's latest decision and notifies the workspace. 409 DECISION_CHANGED with the latest decision when one was recorded after basedOnDecisionId, unless confirmNewer.",
        },
      },
    );
}
