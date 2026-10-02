import { schema } from "@moonx/db";
import type { Classification, Confidence, EconomicsField, Fau, LinkTarget } from "@moonx/schemas";
import { and, eq, isNull } from "drizzle-orm";
import { ApiError } from "../errors";
import { HISTORY_SECTION } from "../history/sections";
import {
  answerSnapshot,
  assumptionSnapshot,
  competitorSnapshot,
  costItemSnapshot,
  economicsSnapshot,
} from "../history/snapshots";
import { type HistoryActor, withHistory } from "../history/with-history";
import type { Tx } from "./db";
import {
  type AnswerRow,
  type AssumptionRow,
  buildClassification,
  type CompetitorRow,
  type CostItemRow,
  ECONOMICS_FIELDS,
  type EconomicsInputRow,
  type EvidenceRow,
  evidenceFor,
  hasText,
  QUESTION_SCREEN,
  type ValidationData,
} from "./validation-data";
import { lostInsertRace } from "./validation-write";

/** The kinds of item evidence can be attached to (SDD 5.7 V4). */
export type EvidenceTargetType =
  | "validation_answer"
  | "economics_input"
  | "cost_item"
  | "competitor"
  | "assumption";

/** The item evidence hangs on, read `FOR UPDATE` in the current transaction. */
export type LockedTarget =
  | { type: "validation_answer"; key: string; sectionKey: string; row: AnswerRow | null }
  | { type: "economics_input"; key: EconomicsField; row: EconomicsInputRow | null }
  | { type: "cost_item"; row: CostItemRow }
  | { type: "competitor"; row: CompetitorRow }
  | { type: "assumption"; row: AssumptionRow };

/** The question of the validation's pinned template version, with the section it sits in. */
export async function findQuestion(tx: Tx, validationId: string, questionKey: string) {
  const [row] = await tx
    .select({
      key: schema.templateQuestions.questionKey,
      sectionKey: schema.templateSections.key,
      answerType: schema.templateQuestions.answerType,
      options: schema.templateQuestions.options,
    })
    .from(schema.validations)
    .innerJoin(
      schema.templateQuestions,
      eq(schema.templateQuestions.templateVersionId, schema.validations.templateVersionId),
    )
    .innerJoin(
      schema.templateSections,
      eq(schema.templateSections.id, schema.templateQuestions.templateSectionId),
    )
    .where(
      and(
        eq(schema.validations.id, validationId),
        eq(schema.templateQuestions.questionKey, questionKey),
      ),
    );
  return row ?? null;
}

const notFound = () => new ApiError("NOT_FOUND", "Resource not found");

/** `economics_input` rows are keyed by field: anything else is not a target (404). */
const isEconomicsField = (key: string | null | undefined): key is EconomicsField =>
  ECONOMICS_FIELDS.includes(key as EconomicsField);

/**
 * Finds and locks the item a TargetRef names, inside the validation already authorized. An item
 * of another validation, a deleted row and an unknown key are all 404, so the response says
 * nothing about other workspaces' data.
 */
export async function lockTarget(
  tx: Tx,
  validationId: string,
  ref: { type: EvidenceTargetType; id: string; key?: string | null },
): Promise<LockedTarget> {
  const key = ref.key ?? null;
  switch (ref.type) {
    case "validation_answer": {
      const question = key ? await findQuestion(tx, validationId, key) : null;
      if (ref.id !== validationId || !question) throw notFound();
      const [row] = await tx
        .select()
        .from(schema.validationAnswers)
        .where(
          and(
            eq(schema.validationAnswers.validationId, validationId),
            eq(schema.validationAnswers.questionKey, question.key),
          ),
        )
        .for("update");
      return {
        type: "validation_answer",
        key: question.key,
        sectionKey: question.sectionKey,
        row: row ?? null,
      };
    }
    case "economics_input": {
      if (ref.id !== validationId || !isEconomicsField(key)) throw notFound();
      const [row] = await tx
        .select()
        .from(schema.economicsInputs)
        .where(
          and(
            eq(schema.economicsInputs.validationId, validationId),
            eq(schema.economicsInputs.fieldKey, key),
          ),
        )
        .for("update");
      return { type: "economics_input", key, row: row ?? null };
    }
    case "cost_item": {
      const [row] = await tx
        .select()
        .from(schema.costItems)
        .where(
          and(
            eq(schema.costItems.id, ref.id),
            eq(schema.costItems.validationId, validationId),
            isNull(schema.costItems.deletedAt),
          ),
        )
        .for("update");
      if (!row) throw notFound();
      return { type: "cost_item", row };
    }
    case "competitor": {
      const [row] = await tx
        .select()
        .from(schema.competitors)
        .where(
          and(
            eq(schema.competitors.id, ref.id),
            eq(schema.competitors.validationId, validationId),
            isNull(schema.competitors.deletedAt),
          ),
        )
        .for("update");
      if (!row) throw notFound();
      return { type: "competitor", row };
    }
    case "assumption": {
      const [row] = await tx
        .select()
        .from(schema.assumptions)
        .where(
          and(
            eq(schema.assumptions.id, ref.id),
            eq(schema.assumptions.validationId, validationId),
            isNull(schema.assumptions.deletedAt),
          ),
        )
        .for("update");
      if (!row) throw notFound();
      return { type: "assumption", row };
    }
  }
}

/** The TargetRef of the item (answers and numbers hang on the validation, rows on themselves). */
export function targetRefOf(
  target: LockedTarget,
  validationId: string,
): { type: EvidenceTargetType; id: string; key: string | null } {
  switch (target.type) {
    case "validation_answer":
    case "economics_input":
      return { type: target.type, id: validationId, key: target.key };
    default:
      return { type: target.type, id: target.row.id, key: null };
  }
}

/** The facts about a target that decide whether it may become a Fact. */
export interface TargetValueState {
  /** Competitors and assumptions carry no F/A/U. */
  hasFau: boolean;
  hasValue: boolean;
  fau: Fau | null;
  confidence: Confidence | null;
}

/** Whether the target holds a value and its current F/A/U, which decide the next classification. */
export function valueStateOf(target: LockedTarget): TargetValueState {
  switch (target.type) {
    case "validation_answer":
      return {
        hasFau: true,
        hasValue: hasText(target.row?.text),
        fau: target.row?.fau ?? null,
        confidence: target.row?.confidence ?? null,
      };
    case "economics_input":
      return {
        hasFau: true,
        hasValue: target.row?.value != null,
        fau: target.row?.fau ?? null,
        confidence: target.row?.confidence ?? null,
      };
    case "cost_item":
      return {
        hasFau: true,
        hasValue:
          target.row.inputMode === "percent_of_price"
            ? target.row.percent != null
            : target.row.amount != null,
        fau: target.row.fau,
        confidence: target.row.confidence,
      };
    default:
      return { hasFau: false, hasValue: true, fau: null, confidence: null };
  }
}

/** Ids of the links that have not been removed (including ones pointing at a deleted log). */
export function linkIdsOf(data: ValidationData, target: LockedTarget, validationId: string) {
  return linksOf(data, target, validationId).map((l) => l.id);
}

function linksOf(data: ValidationData, target: LockedTarget, validationId: string): EvidenceRow[] {
  const ref = targetRefOf(target, validationId);
  return evidenceFor(data, { type: ref.type, id: ref.id, key: ref.key }).sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  );
}

/** The snapshot that `change_history` keeps for the item (history/snapshots.ts). */
export function snapshotOf(target: LockedTarget, evidence: string[]) {
  switch (target.type) {
    case "validation_answer":
      return answerSnapshot(target.row, evidence);
    case "economics_input":
      return economicsSnapshot(target.row, evidence);
    case "cost_item":
      return costItemSnapshot(target.row, evidence);
    case "competitor":
      return competitorSnapshot(target.row, evidence);
    case "assumption":
      return assumptionSnapshot(target.row, evidence);
  }
}

/** History section: the question's section for answers, the screen's name for the rest. */
function historySectionOf(target: LockedTarget): string {
  switch (target.type) {
    case "validation_answer":
      return target.sectionKey;
    case "economics_input":
      return HISTORY_SECTION.economics;
    case "cost_item":
      return HISTORY_SECTION.costs;
    case "competitor":
      return HISTORY_SECTION.competitors;
    case "assumption":
      return HISTORY_SECTION.assumptionsRisks;
  }
}

/** The F/A/U block of a target, from the current rows and links. */
export function classificationOfTarget(
  data: ValidationData,
  target: LockedTarget,
  validationId: string,
): Classification {
  const state = valueStateOf(target);
  return buildClassification(data, {
    hasValue: state.hasValue,
    fau: state.fau,
    confidence: state.confidence,
    links: linksOf(data, target, validationId),
  });
}

/** Where the item opens (design-spec 6.0.3: the screen that shows it). */
export function linkTargetOf(
  target: LockedTarget,
  ids: { workspaceId: string; ideaId: string },
): LinkTarget {
  switch (target.type) {
    case "validation_answer":
      return {
        screen: QUESTION_SCREEN[target.sectionKey] ?? 11,
        ...ids,
        sectionKey: target.sectionKey,
        questionKey: target.key,
      };
    case "economics_input":
      return { screen: 18, ...ids, field: target.key };
    case "cost_item":
      return { screen: 17, ...ids, rowId: target.row.id };
    case "competitor":
      return { screen: 15, ...ids, rowId: target.row.id };
    case "assumption":
      return { screen: 16, ...ids, rowId: target.row.id };
  }
}

/** What a write changes on the target: its lock always, F/A/U when the evidence decides it. */
export interface TargetWrite {
  lockVersion: number;
  fau?: { fau: Fau | null; confidence: Confidence | null };
}

/**
 * Writes the new lock (and F/A/U) of the target and returns the row as saved. An answer or number
 * that had no row gets one (version 1); losing that insert to another request is a 409.
 */
export async function saveTarget(
  tx: Tx,
  target: LockedTarget,
  write: TargetWrite,
  ctx: {
    workspaceId: string;
    validationId: string;
    userId: string;
    now: Date;
    currentValue: () => Promise<unknown>;
  },
): Promise<LockedTarget & { row: { lockVersion: number } }> {
  const stamp = { lockVersion: write.lockVersion, updatedById: ctx.userId, updatedAt: ctx.now };
  const fau = write.fau ?? {
    fau: valueStateOf(target).fau,
    confidence: valueStateOf(target).confidence,
  };
  switch (target.type) {
    case "validation_answer": {
      if (target.row) {
        const [row] = await tx
          .update(schema.validationAnswers)
          .set({ ...stamp, fau: fau.fau, confidence: fau.confidence })
          .where(eq(schema.validationAnswers.id, target.row.id))
          .returning();
        return { ...target, row: row as AnswerRow };
      }
      const [created] = await tx
        .insert(schema.validationAnswers)
        .values({
          validationId: ctx.validationId,
          questionKey: target.key,
          text: null,
          fau: fau.fau,
          confidence: fau.confidence,
          ...stamp,
        })
        .onConflictDoNothing()
        .returning();
      if (!created) return raceLost(tx, target, ctx);
      return { ...target, row: created };
    }
    case "economics_input": {
      if (target.row) {
        const [row] = await tx
          .update(schema.economicsInputs)
          .set({ ...stamp, fau: fau.fau, confidence: fau.confidence })
          .where(eq(schema.economicsInputs.id, target.row.id))
          .returning();
        return { ...target, row: row as EconomicsInputRow };
      }
      const [created] = await tx
        .insert(schema.economicsInputs)
        .values({
          validationId: ctx.validationId,
          fieldKey: target.key,
          value: null,
          fau: fau.fau,
          confidence: fau.confidence,
          ...stamp,
        })
        .onConflictDoNothing()
        .returning();
      if (!created) return raceLost(tx, target, ctx);
      return { ...target, row: created };
    }
    case "cost_item": {
      const [row] = await tx
        .update(schema.costItems)
        .set({ ...stamp, fau: fau.fau, confidence: fau.confidence })
        .where(eq(schema.costItems.id, target.row.id))
        .returning();
      return { type: "cost_item", row: row as CostItemRow };
    }
    case "competitor": {
      const [row] = await tx
        .update(schema.competitors)
        .set(stamp)
        .where(eq(schema.competitors.id, target.row.id))
        .returning();
      return { type: "competitor", row: row as CompetitorRow };
    }
    case "assumption": {
      const [row] = await tx
        .update(schema.assumptions)
        .set(stamp)
        .where(eq(schema.assumptions.id, target.row.id))
        .returning();
      return { type: "assumption", row: row as AssumptionRow };
    }
  }
}

async function raceLost(
  tx: Tx,
  target: LockedTarget,
  ctx: { workspaceId: string; validationId: string; currentValue: () => Promise<unknown> },
): Promise<never> {
  const [row] =
    target.type === "validation_answer"
      ? await tx
          .select()
          .from(schema.validationAnswers)
          .where(
            and(
              eq(schema.validationAnswers.validationId, ctx.validationId),
              eq(schema.validationAnswers.questionKey, target.key),
            ),
          )
      : target.type === "economics_input"
        ? await tx
            .select()
            .from(schema.economicsInputs)
            .where(
              and(
                eq(schema.economicsInputs.validationId, ctx.validationId),
                eq(schema.economicsInputs.fieldKey, target.key),
              ),
            )
        : [];
  return lostInsertRace(tx, {
    workspaceId: ctx.workspaceId,
    row: row ?? null,
    currentValue: ctx.currentValue,
  });
}

/**
 * Runs `write`, which saves the target, through `withHistory`, so the target row and its one
 * history row change in the same transaction and cannot be separated (ADR-020). The history lists
 * the evidence links before and after the change (`beforeEvidence`, `afterEvidence`).
 */
export async function changeTarget<T extends LockedTarget>(
  tx: Tx,
  opts: {
    workspaceId: string;
    validationId: string;
    actor: HistoryActor;
    before: LockedTarget;
    beforeEvidence: string[];
    afterEvidence: string[];
    write: () => Promise<T>;
  },
): Promise<T> {
  const ref = targetRefOf(opts.before, opts.validationId);
  return withHistory(
    tx,
    {
      container: { type: "validation", id: opts.validationId },
      workspaceId: opts.workspaceId,
      sectionKey: historySectionOf(opts.before),
      target: { type: ref.type, id: ref.id, key: ref.key },
      actor: opts.actor,
    },
    async () => {
      const after = await opts.write();
      return {
        result: after,
        before: opts.before.row ? snapshotOf(opts.before, opts.beforeEvidence) : null,
        after: snapshotOf(after, opts.afterEvidence),
      };
    },
  );
}
