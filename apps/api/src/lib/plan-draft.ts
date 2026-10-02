import { schema } from "@moonx/db";
import type { Confidence } from "@moonx/schemas";
import { and, asc, desc, eq } from "drizzle-orm";
import { ApiError } from "../errors";
import { answerHistorySection } from "../history/sections";
import {
  executionItemSnapshot,
  planAnswerSnapshot,
  planHeaderSnapshot,
} from "../history/snapshots";
import { type HistoryActor, withHistory } from "../history/with-history";
import type { Tx } from "./db";
import { EXECUTION_ITEM_NO, itemKey } from "./plan-context";
import { assertPlanNameFree, namedPlanWrite } from "./plan-write";
import { latestPublishedVersion } from "./template";
import {
  evidenceFor,
  hasText,
  isActiveEvidence,
  loadValidationData,
  toEvidence,
  type ValidationData,
} from "./validation-data";
import { orderRisks } from "./validation-table-dto";
import { touchValidationActivity } from "./validation-write";

type Cell = string | number | null;
type Copied = { text: string } | { rows: Record<string, Cell>[] };

const capitalize = (level: Confidence | null): string | null =>
  level ? level.charAt(0).toUpperCase() + level.slice(1) : null;

/** One evidence line for the Evidence column of the assumptions table (design-spec 6.12 §21). */
function evidenceLines(data: ValidationData, assumptionId: string): string[] {
  return evidenceFor(data, { type: "assumption", id: assumptionId, key: null })
    .filter((link) => isActiveEvidence(data, link))
    .map((link) => toEvidence(data, link))
    .map((e) => {
      if (e.kind === "research_log" && e.researchLog) {
        return [e.researchLog.observedOn, e.researchLog.topic].filter(Boolean).join(" ");
      }
      return e.url ?? "";
    })
    .filter((line) => line !== "");
}

/**
 * What one `copy_from` source gives a draft (design-spec 6.12): idea fields, validation answers,
 * or the rows of the assumptions and risks tables. Null when the source is empty.
 */
function copySource(
  source: string,
  idea: { oneLineConcept: string; proposedSolution: string | null },
  data: ValidationData,
): Copied | null {
  if (source === "IDEA.ONE_LINE_CONCEPT") {
    return hasText(idea.oneLineConcept) ? { text: idea.oneLineConcept } : null;
  }
  if (source === "IDEA.PROPOSED_SOLUTION") {
    return hasText(idea.proposedSolution) ? { text: idea.proposedSolution as string } : null;
  }
  if (source === "LIST.ASSUMPTIONS") {
    const rows = data.assumptions.map((a) => ({
      assumption: a.statement,
      why_believe: a.whyBelieve ?? null,
      evidence: [a.evidenceNote, ...evidenceLines(data, a.id)].filter(hasText).join("\n") || null,
      disprove: a.disproveCondition ?? null,
    }));
    return rows.length > 0 ? { rows } : null;
  }
  if (source === "LIST.RISKS") {
    const rows = orderRisks(data.risks).map((r) => ({
      risk: r.statement,
      probability: capitalize(r.probability),
      impact: capitalize(r.impact),
      mitigation: r.mitigation ?? null,
      trigger_indicator: null,
    }));
    return rows.length > 0 ? { rows } : null;
  }
  const text = data.answers.find((a) => a.questionKey === source)?.text;
  return hasText(text) ? { text: text as string } : null;
}

/** Where and by whom a draft is created. */
export interface DraftContext {
  workspaceId: string;
  ideaId: string;
  user: { id: string; displayName: string };
  actor: HistoryActor;
  now: Date;
}

/**
 * P1 POST (M5). Creates the plan on the newest published template, copies the validation's
 * answers into the sub-items that name a source, and adds the template's execution rows. Every
 * row is a `plan_draft` history row of one batch, so the draft can be undone as a whole. The idea
 * row is locked first: its latest decision is read in the same transaction as the insert.
 */
export async function createPlanDraft(tx: Tx, ctx: DraftContext, name: string): Promise<string> {
  const [idea] = await tx
    .select()
    .from(schema.ideas)
    .where(and(eq(schema.ideas.id, ctx.ideaId), eq(schema.ideas.workspaceId, ctx.workspaceId)))
    .for("update");
  if (!idea) throw new ApiError("NOT_FOUND", "Resource not found");
  if (idea.archivedAt) throw new ApiError("ARCHIVED", "Archived items cannot be changed");
  if (idea.latestDecision !== "proceed") {
    throw new ApiError("DECISION_NOT_PROCEED", "The latest decision is not Proceed");
  }
  await assertPlanNameFree(tx, ctx.ideaId, name, null);

  const [decision] = await tx
    .select({ id: schema.decisionLogEntries.id })
    .from(schema.decisionLogEntries)
    .where(
      and(
        eq(schema.decisionLogEntries.ideaId, ctx.ideaId),
        eq(schema.decisionLogEntries.kind, "validation_decision"),
      ),
    )
    .orderBy(desc(schema.decisionLogEntries.recordedAt), desc(schema.decisionLogEntries.createdAt))
    .limit(1);
  const [validation] = await tx
    .select({ id: schema.validations.id })
    .from(schema.validations)
    .where(eq(schema.validations.ideaId, ctx.ideaId));
  const data = (await loadValidationData(tx, [(validation as { id: string }).id])).get(
    (validation as { id: string }).id,
  ) as ValidationData;

  const version = await latestPublishedVersion(tx, "business_plan");
  const batchId = crypto.randomUUID();
  const actor: HistoryActor = { ...ctx.actor, source: "plan_draft", batchId };
  const planId = crypto.randomUUID();
  const stamp = { updatedById: ctx.user.id, updatedAt: ctx.now };
  const container = { type: "business_plan" as const, id: planId };

  await withHistory(
    tx,
    {
      container,
      workspaceId: ctx.workspaceId,
      target: { type: "business_plan", id: planId },
      actor,
    },
    async () => {
      const [plan] = await namedPlanWrite(() =>
        tx
          .insert(schema.businessPlans)
          .values({
            id: planId,
            ideaId: ctx.ideaId,
            name,
            businessName: idea.name,
            preparedBy: ctx.user.displayName,
            templateVersionId: version.id,
            createdFromDecisionId: decision?.id ?? null,
            lastActivityAt: ctx.now,
            createdById: ctx.user.id,
            lockVersion: 0,
            ...stamp,
            createdAt: ctx.now,
          })
          .returning(),
      );
      return {
        result: undefined,
        before: null,
        after: planHeaderSnapshot(plan as NonNullable<typeof plan>),
      };
    },
  );

  const questions = await tx
    .select({
      key: schema.templateQuestions.questionKey,
      copyFrom: schema.templateQuestions.copyFrom,
      answerType: schema.templateQuestions.answerType,
    })
    .from(schema.templateQuestions)
    .where(eq(schema.templateQuestions.templateVersionId, version.id))
    .orderBy(asc(schema.templateQuestions.sortOrder));
  for (const question of questions) {
    const sources = (question.copyFrom as string[] | null) ?? [];
    const parts = sources
      .map((s) => copySource(s, idea, data))
      .filter((p): p is Copied => p != null);
    if (parts.length === 0) continue;
    const rows = parts.flatMap((p) => ("rows" in p ? p.rows : []));
    const texts = parts.flatMap((p) => ("text" in p ? [p.text] : []));
    if (question.answerType !== "table" && texts.length === 0) continue;
    const values =
      question.answerType === "table"
        ? { text: null, rows }
        : { text: texts.join("\n\n"), rows: null };
    if (values.text == null && values.rows?.length === 0) continue;
    await withHistory(
      tx,
      {
        container,
        workspaceId: ctx.workspaceId,
        sectionKey: answerHistorySection(question.key),
        target: { type: "plan_answer", id: planId, key: question.key },
        actor,
      },
      async () => {
        await tx.insert(schema.planAnswers).values({
          businessPlanId: planId,
          questionKey: question.key,
          ...values,
          copiedFrom: { source: sources.join("+"), copiedAt: ctx.now.toISOString() },
          lockVersion: 1,
          ...stamp,
        });
        return { result: undefined, before: null, after: planAnswerSnapshot(values) };
      },
    );
  }

  const presets = await tx
    .select()
    .from(schema.templateExecutionPresets)
    .where(eq(schema.templateExecutionPresets.templateVersionId, version.id))
    .orderBy(asc(schema.templateExecutionPresets.sortOrder));
  const counters = new Map<string, number>();
  for (const preset of presets) {
    const index = counters.get(preset.type) ?? 0;
    counters.set(preset.type, index + 1);
    const id = crypto.randomUUID();
    await withHistory(
      tx,
      {
        container,
        workspaceId: ctx.workspaceId,
        sectionKey: itemKey(EXECUTION_ITEM_NO[preset.type]),
        target: { type: "execution_item", id },
        actor,
      },
      async () => {
        const [row] = await tx
          .insert(schema.executionItems)
          .values({
            id,
            businessPlanId: planId,
            type: preset.type,
            title: preset.title,
            status: preset.type === "kpi" ? null : "todo",
            launchTiming: preset.type === "launch" ? (preset.launchTiming ?? "other") : null,
            kpiArea: preset.type === "kpi" ? preset.area : null,
            fromPreset: true,
            sortOrder: index,
            lockVersion: 0,
            updatedById: ctx.user.id,
          })
          .returning();
        return {
          result: undefined,
          before: null,
          after: executionItemSnapshot(row as NonNullable<typeof row>),
        };
      },
    );
  }

  await touchValidationActivity(tx, ctx, ctx.now);
  return planId;
}
