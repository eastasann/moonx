import {
  assumptions,
  businessPlans,
  type comments,
  competitors,
  costItems,
  type Database,
  type DatabaseTransaction,
  executionItems,
  ideas,
  researchLogEntries,
  risks,
  selfAnalyses,
  selfAnalysisShares,
  templateQuestions,
  validations,
} from "@moonx/db";
import { pitchSlideKeys } from "@moonx/domain";
import {
  economicsFieldSchema,
  pitchVariantSchema,
  type TargetRef,
  type TargetType,
  uuidSchema,
} from "@moonx/schemas";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { ApiError } from "./errors";
import type { HistoryContainerType } from "./history";
import { invalid } from "./validation-writes";

type Executor = Database | DatabaseTransaction;

/** Where an item is filed and how its workspace is found (SDD 5.1 TargetRef, 6.3). */
export interface TargetPlace {
  /** The screen its history and comments are filed under. */
  container: { type: HistoryContainerType; id: string };
  /** For `resolveScope`; null for a self-analysis, which has no workspace. */
  scope:
    | { validationId: string }
    | { planId: string }
    | { ideaId: string }
    | null;
  /** A row deleted on its screen: its comments hide with it (design-spec 6.0.4). */
  deleted: boolean;
}

/** The lists of a validation whose rows are deleted one by one on 14–17. */
const VALIDATION_ROWS = {
  research_log_entry: researchLogEntries,
  competitor: competitors,
  assumption: assumptions,
  risk: risks,
  cost_item: costItems,
} as const;
type ValidationRowType = keyof typeof VALIDATION_ROWS;

const isValidationRow = (type: TargetType): type is ValidationRowType =>
  type in VALIDATION_ROWS;

const containerOf = (
  type: "validation" | "business_plan" | "idea",
  id: string,
): Pick<TargetPlace, "container" | "scope"> => ({
  container: { type, id },
  scope:
    type === "validation"
      ? { validationId: id }
      : type === "business_plan"
        ? { planId: id }
        : { ideaId: id },
});

const present = (row: unknown) => row !== undefined;

/**
 * Where `target` is filed, or null when nothing it names exists. A row deleted on its
 * screen is found, with `deleted`; an idea or plan whose creation was undone is found
 * too, and `resolveScope` then answers it as missing (SDD 5.11).
 */
export async function locateTarget(
  db: Executor,
  target: Pick<TargetRef, "type" | "id" | "key">,
): Promise<TargetPlace | null> {
  const { type, id } = target;
  if (!uuidSchema.safeParse(id).success) return null;
  const place = (
    found: boolean,
    filed: Pick<TargetPlace, "container" | "scope">,
    extra: Partial<TargetPlace> = {},
  ): TargetPlace | null =>
    found ? { deleted: false, ...filed, ...extra } : null;

  if (isValidationRow(type)) {
    const table = VALIDATION_ROWS[type] as typeof competitors;
    const [row] = await db
      .select({ validationId: table.validationId, deletedAt: table.deletedAt })
      .from(table)
      .where(eq(table.id, id));
    return row === undefined
      ? null
      : place(true, containerOf("validation", row.validationId), {
          deleted: row.deletedAt !== null,
        });
  }
  switch (type) {
    case "validation_answer":
    case "economics_input": {
      const [row] = await db
        .select({ id: validations.id })
        .from(validations)
        .where(eq(validations.id, id));
      return place(present(row), containerOf("validation", id));
    }
    case "plan_answer":
    case "pitch_slide":
    case "business_plan": {
      const [row] = await db
        .select({ id: businessPlans.id })
        .from(businessPlans)
        .where(eq(businessPlans.id, id));
      return place(present(row), containerOf("business_plan", id));
    }
    case "execution_item": {
      const [row] = await db
        .select({
          planId: executionItems.businessPlanId,
          deletedAt: executionItems.deletedAt,
        })
        .from(executionItems)
        .where(eq(executionItems.id, id));
      return row === undefined
        ? null
        : place(true, containerOf("business_plan", row.planId), {
            deleted: row.deletedAt !== null,
          });
    }
    case "idea": {
      const [row] = await db
        .select({ id: ideas.id })
        .from(ideas)
        .where(eq(ideas.id, id));
      return place(present(row), containerOf("idea", id));
    }
    case "self_analysis_answer": {
      const owner = await selfAnalysisOwner(db, id);
      return owner === null
        ? null
        : {
            container: { type: "self_analysis", id },
            scope: null,
            deleted: false,
          };
    }
    case "template_version": {
      // The key names what is pinned (SDD 5.1 TargetRef).
      if (target.key === "self_analysis") {
        return locateTarget(db, { type: "self_analysis_answer", id });
      }
      if (target.key === "validation") {
        return locateTarget(db, { type: "validation_answer", id });
      }
      if (target.key === "business_plan") {
        return locateTarget(db, { type: "business_plan", id });
      }
      return null;
    }
  }
  throw new Error(`Unhandled target type ${type}`);
}

/** The owner of the self-analysis `id`, or null when there is none. */
export async function selfAnalysisOwner(
  db: Executor,
  id: string,
): Promise<string | null> {
  if (!uuidSchema.safeParse(id).success) return null;
  const [row] = await db
    .select({ userId: selfAnalyses.userId })
    .from(selfAnalyses)
    .where(eq(selfAnalyses.id, id));
  return row?.userId ?? null;
}

/** The question keys of the version each of `ids` is pinned to, by container id. */
async function pinnedQuestionKeys(
  db: Executor,
  table: typeof validations | typeof businessPlans | typeof selfAnalyses,
  ids: readonly string[],
): Promise<Map<string, Set<string>>> {
  const keys = new Map<string, Set<string>>();
  if (ids.length === 0) return keys;
  const t = table as typeof validations;
  const rows = await db
    .select({ id: t.id, key: templateQuestions.questionKey })
    .from(t)
    .innerJoin(
      templateQuestions,
      eq(templateQuestions.templateVersionId, t.templateVersionId),
    )
    .where(inArray(t.id, [...new Set(ids)]));
  for (const id of ids) keys.set(id, new Set());
  for (const row of rows) keys.get(row.id)?.add(row.key);
  return keys;
}

const ANSWER_TABLES = {
  validation_answer: validations,
  plan_answer: businessPlans,
  self_analysis_answer: selfAnalyses,
} as const;

/**
 * Checks the key of a comment's target (SDD 5.1 TargetRef): a question of the version
 * the answers are pinned to, a number of 18, a slide of the deck (`five.market`). Rows
 * and the idea take none. A question a template migration hid takes no comments, as its
 * comments are hidden with it (design-spec 6.0.7).
 *
 * @param path The input path of the key, for the details of a 422.
 * @throws {ApiError} VALIDATION_FAILED when the key is missing or has no place,
 * NOT_FOUND when it names nothing
 */
export async function checkCommentKey(
  db: Executor,
  target: Pick<TargetRef, "type" | "id" | "key">,
  path: string,
): Promise<void> {
  const key = target.key ?? null;
  const keyed =
    target.type in ANSWER_TABLES ||
    target.type === "economics_input" ||
    target.type === "pitch_slide";
  if (!keyed) {
    if (key !== null) {
      throw invalid(path, "unrecognized_keys", "This item takes no key");
    }
    return;
  }
  if (key === null) throw invalid(path, "invalid_type", "Required");
  const missing = () => new ApiError("NOT_FOUND", "No such item");
  if (target.type === "economics_input") {
    if (!economicsFieldSchema.safeParse(key).success) throw missing();
    return;
  }
  if (target.type === "pitch_slide") {
    const [variant, slide, ...rest] = key.split(".");
    const deck = pitchVariantSchema.safeParse(variant);
    if (
      !deck.success ||
      rest.length > 0 ||
      !pitchSlideKeys(deck.data).some((known) => known === slide)
    ) {
      throw missing();
    }
    return;
  }
  const table = ANSWER_TABLES[target.type as keyof typeof ANSWER_TABLES];
  const keys = await pinnedQuestionKeys(db, table, [target.id]);
  if (!keys.get(target.id)?.has(key)) throw missing();
}

type CommentRow = typeof comments.$inferSelect;

/**
 * The comments of `rows` whose item can be seen now (design-spec 6.0.4・6.0.7): not on
 * a row deleted on its screen, not on a question the pinned version no longer has, and
 * on a self-analysis only in a workspace it is shared with now. Order is kept.
 */
export async function visibleComments(
  db: Executor,
  rows: readonly CommentRow[],
): Promise<CommentRow[]> {
  const idsOf = (type: TargetType) => [
    ...new Set(
      rows.filter((row) => row.targetType === type).map((row) => row.targetId),
    ),
  ];
  const deleted = new Set<string>();
  const deletedRows = async (
    table: typeof competitors | typeof executionItems,
    ids: string[],
  ) => {
    if (ids.length === 0) return;
    const found = await db
      .select({ id: table.id })
      .from(table)
      .where(and(inArray(table.id, ids), isNotNull(table.deletedAt)));
    for (const row of found) deleted.add(row.id);
  };
  for (const [type, table] of Object.entries(VALIDATION_ROWS)) {
    await deletedRows(table as typeof competitors, idsOf(type as TargetType));
  }
  await deletedRows(executionItems, idsOf("execution_item"));

  const questions = new Map<string, Map<string, Set<string>>>();
  for (const [type, table] of Object.entries(ANSWER_TABLES)) {
    questions.set(
      type,
      await pinnedQuestionKeys(db, table, idsOf(type as TargetType)),
    );
  }

  const analysisIds = idsOf("self_analysis_answer");
  const shares = new Set(
    analysisIds.length === 0
      ? []
      : (
          await db
            .select({
              analysisId: selfAnalysisShares.selfAnalysisId,
              workspaceId: selfAnalysisShares.workspaceId,
            })
            .from(selfAnalysisShares)
            .where(inArray(selfAnalysisShares.selfAnalysisId, analysisIds))
        ).map((share) => `${share.analysisId}/${share.workspaceId}`),
  );

  return rows.filter((row) => {
    if (deleted.has(row.targetId)) return false;
    const pinned = questions.get(row.targetType)?.get(row.targetId);
    if (pinned !== undefined && !pinned.has(row.targetKey ?? "")) return false;
    return (
      row.targetType !== "self_analysis_answer" ||
      shares.has(`${row.targetId}/${row.workspaceId}`)
    );
  });
}
