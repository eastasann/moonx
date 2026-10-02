import { schema } from "@moonx/db";
import { recordDecisionBodySchema } from "@moonx/schemas";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import type { AppContext } from "../../context";
import { ApiError } from "../../errors";
import type { Executor } from "../../lib/db";
import {
  latestValidationDecision,
  loadDecisionEntry,
  recordValidationDecision,
  validationDecisionSnapshot,
} from "../../lib/decision-record";
import { requireEditor, requireWritable, resolveScope, type Scope } from "../../lib/scope";
import { computeValidationState, hasText, loadValidationData } from "../../lib/validation-data";
import { authPlugin } from "../../plugins";

const params = z.object({ ideaId: z.uuid() });

const KEY_METRICS = [
  "initial_cost_total",
  "break_even_units_day",
  "expected_operating_profit",
  "payback_months",
  "simple_roi",
] as const;

/** The idea and its calculated state, read inside `db` (a transaction for the write). */
async function loadIdeaState(db: Executor, scope: Scope) {
  const [idea] = await db
    .select()
    .from(schema.ideas)
    .where(eq(schema.ideas.id, scope.ideaId as string));
  const [validation] = await db
    .select({ id: schema.validations.id })
    .from(schema.validations)
    .where(eq(schema.validations.ideaId, scope.ideaId as string));
  if (!idea || !validation) throw new ApiError("NOT_FOUND", "Resource not found");
  const data = (await loadValidationData(db, [validation.id])).get(validation.id);
  if (!data) throw new ApiError("NOT_FOUND", "Resource not found");
  const state = computeValidationState(data, {
    workspaceId: scope.workspaceId,
    ideaId: idea.id,
  });
  return { idea, data, state };
}

/** V18-V19 (SDD 5.7). */
export function decisionRoutes(ctx: AppContext) {
  const { db } = ctx;
  return new Elysia({ name: "moonx-validation-decisions" })
    .use(authPlugin(ctx))
    .get(
      "/ideas/:ideaId/decision-context",
      async ({ params, user }) => {
        const scope = await resolveScope(db, user, { ideaId: params.ideaId });
        requireEditor(scope);
        const { idea, data, state } = await loadIdeaState(db, scope);
        const answer = (key: string) => {
          const text = data.answers.find((a) => a.questionKey === key)?.text;
          return hasText(text) ? (text as string) : null;
        };
        const metrics = Object.fromEntries(
          KEY_METRICS.map((k) => [
            k,
            state.keyMetrics[k] ?? { value: null, bound: "exact", reason: "empty" },
          ]),
        );
        return {
          summary: {
            oneLineConcept: idea.oneLineConcept,
            customer: answer("V.01.WHO"),
            problem: answer("V.01.PROBLEM"),
            solution: hasText(idea.proposedSolution) ? idea.proposedSolution : null,
            marketType: answer("V.02.OCEAN"),
            biggestOpportunity: answer("V.10.BIGGEST_OPPORTUNITY"),
            biggestRisk: answer("V.10.BIGGEST_RISK"),
            biggestUnknown: answer("V.10.BIGGEST_UNKNOWN"),
          },
          keyMetrics: metrics,
          missingChecks: state.checks.filter((c) => c.state !== "done"),
          fau: state.fau,
          lastDecision: await latestValidationDecision(db, scope.workspaceId, idea.id),
        };
      },
      { params },
    )
    .post(
      "/ideas/:ideaId/decisions",
      async ({ params, body, user, set }) => {
        const scope = await resolveScope(db, user, { ideaId: params.ideaId });
        requireWritable(scope);
        const result = await db.transaction(async (tx) => {
          const { entryId } = await recordValidationDecision(tx, {
            workspaceId: scope.workspaceId,
            ideaId: scope.ideaId as string,
            recorder: user,
            value: body.value,
            reason: body.reason,
            basedOnDecisionId: body.basedOnDecisionId,
            confirmNewer: body.confirmNewer === true,
            snapshot: async () =>
              validationDecisionSnapshot((await loadIdeaState(tx, scope)).state),
            now: ctx.now(),
          });
          return loadDecisionEntry(tx, scope.workspaceId, entryId);
        });
        set.status = 201;
        return {
          entry: result,
          latestDecision: body.value,
          canCreatePlan: body.value === "proceed",
        };
      },
      { params, body: recordDecisionBodySchema },
    );
}
