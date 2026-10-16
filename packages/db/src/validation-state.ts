import type {
  CheckThresholds,
  EconomicsInputState,
  ValidationState,
  ViewContext,
} from "@moonx/domain";
import {
  checkRuleSchema,
  type TemplateSection,
  templateSectionSchema,
} from "@moonx/schemas";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Database, DatabaseTransaction } from "./client";
import {
  assumptions,
  competitors,
  costItems,
  economicsInputs,
  evidenceLinks,
  ideas,
  researchLogEntries,
  risks,
  templateCheckRules,
  templateQuestions,
  templateSections,
  validationAnswers,
  validations,
} from "./schema";

type Executor = Database | DatabaseTransaction;

const groupBy = <T>(rows: readonly T[], key: (row: T) => string) => {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(key(row));
    if (group === undefined) groups.set(key(row), [row]);
    else group.push(row);
  }
  return groups;
};

/**
 * The sections and questions of each template version in `templateVersionIds`, in
 * template order, as screens and the domain read them (SDD 5.2 TemplateSection).
 */
export async function loadTemplateSections(
  db: Executor,
  templateVersionIds: readonly string[],
): Promise<Map<string, TemplateSection[]>> {
  const ids = [...new Set(templateVersionIds)];
  if (ids.length === 0) return new Map();
  const sections = await db
    .select()
    .from(templateSections)
    .where(inArray(templateSections.templateVersionId, ids))
    .orderBy(asc(templateSections.sortOrder), asc(templateSections.id));
  const questions = groupBy(
    await db
      .select()
      .from(templateQuestions)
      .where(inArray(templateQuestions.templateVersionId, ids))
      .orderBy(asc(templateQuestions.sortOrder), asc(templateQuestions.id)),
    (question) => question.templateSectionId,
  );
  const byVersion = groupBy(sections, (section) => section.templateVersionId);
  return new Map(
    ids.map((id) => [
      id,
      (byVersion.get(id) ?? []).map((section) =>
        templateSectionSchema.parse({
          key: section.key,
          part: section.part,
          title: section.title,
          subtitle: section.subtitle,
          guidance: section.guidance,
          questions: (questions.get(section.id) ?? []).map((question) => ({
            key: question.questionKey,
            sectionKey: section.key,
            title: question.title,
            prompt: question.prompt,
            example: question.example,
            hint: question.hint,
            answerType: question.answerType,
            options: question.options,
            displayCondition: question.displayCondition,
            hasFau: question.hasFau,
          })),
        }),
      ),
    ]),
  );
}

async function loadThresholds(
  db: Executor,
  templateVersionIds: readonly string[],
): Promise<Map<string, CheckThresholds>> {
  const rules = await db
    .select({
      templateVersionId: templateCheckRules.templateVersionId,
      checkKey: templateCheckRules.checkKey,
      params: templateCheckRules.params,
    })
    .from(templateCheckRules)
    .where(
      inArray(templateCheckRules.templateVersionId, [...templateVersionIds]),
    );
  const byVersion = groupBy(rules, (rule) => rule.templateVersionId);
  return new Map(
    templateVersionIds.map((versionId) => {
      const thresholds: Partial<CheckThresholds> = {};
      for (const row of byVersion.get(versionId) ?? []) {
        const rule = checkRuleSchema.parse({
          checkKey: row.checkKey,
          params: row.params,
        });
        if (rule.checkKey === "competitors")
          thresholds.competitors = rule.params;
        else if (rule.checkKey === "local_price")
          thresholds.local_price = rule.params;
        else if (rule.checkKey === "permits") thresholds.permits = rule.params;
        else if (rule.checkKey === "demand_signal")
          thresholds.demand_signal = rule.params;
      }
      const { competitors, local_price, permits, demand_signal } = thresholds;
      if (!competitors || !local_price || !permits || !demand_signal)
        throw new Error(
          `Template version ${versionId} lacks a check threshold`,
        );
      return [versionId, { competitors, local_price, permits, demand_signal }];
    }),
  );
}

/**
 * The evidence that counts (design-spec 6.0.3), for the validations in `validationIds`:
 * links not detached whose research log is not deleted, and every URL link.
 */
async function loadActiveEvidenceCounts(
  db: Executor,
  validationIds: readonly string[],
) {
  const rows = await db
    .select({
      validationId: evidenceLinks.validationId,
      targetType: evidenceLinks.targetType,
      targetId: evidenceLinks.targetId,
      targetKey: evidenceLinks.targetKey,
      count: sql<number>`count(*)::int`,
    })
    .from(evidenceLinks)
    .leftJoin(
      researchLogEntries,
      eq(researchLogEntries.id, evidenceLinks.researchLogEntryId),
    )
    .where(
      and(
        inArray(evidenceLinks.validationId, [...validationIds]),
        isNull(evidenceLinks.deletedAt),
        or(
          isNull(evidenceLinks.researchLogEntryId),
          isNull(researchLogEntries.deletedAt),
        ),
      ),
    )
    .groupBy(
      evidenceLinks.validationId,
      evidenceLinks.targetType,
      evidenceLinks.targetId,
      evidenceLinks.targetKey,
    );
  const counts = new Map(
    rows.map((row) => [
      `${row.targetType}/${row.targetId}/${row.targetKey ?? ""}`,
      row.count,
    ]),
  );
  return (type: string, id: string, key: string | null = null) =>
    counts.get(`${type}/${id}/${key ?? ""}`) ?? 0;
}

/** One validation as the domain evaluates it, with who it belongs to. */
export interface LoadedValidation {
  validationId: string;
  state: ValidationState;
  ideaId: string;
  workspaceId: string;
  templateVersionId: string;
  archived: boolean;
}

/**
 * Reads the validations in `validationIds` into the `ValidationState` of
 * `packages/domain`, leaving out logically deleted rows (SDD 6.5). A fixed number of
 * queries reads any number of them, so a list of ideas does not query per idea (SDD
 * 7.3). Validations that do not exist are left out of the result.
 */
export async function loadValidations(
  db: Executor,
  validationIds: readonly string[],
): Promise<Map<string, LoadedValidation>> {
  const ids = [...new Set(validationIds)];
  if (ids.length === 0) return new Map();
  const heads = await db
    .select({
      validationId: validations.id,
      templateVersionId: validations.templateVersionId,
      ideaId: ideas.id,
      workspaceId: ideas.workspaceId,
      archivedAt: ideas.archivedAt,
    })
    .from(validations)
    .innerJoin(ideas, eq(ideas.id, validations.ideaId))
    .where(inArray(validations.id, ids));
  if (heads.length === 0) return new Map();
  const versionIds = [...new Set(heads.map((head) => head.templateVersionId))];
  const sections = await loadTemplateSections(db, versionIds);
  const thresholds = await loadThresholds(db, versionIds);
  const evidence = await loadActiveEvidenceCounts(db, ids);

  const answers = groupBy(
    await db
      .select()
      .from(validationAnswers)
      .where(inArray(validationAnswers.validationId, ids)),
    (row) => row.validationId,
  );
  const logs = groupBy(
    await db
      .select({
        validationId: researchLogEntries.validationId,
        supportsChecks: researchLogEntries.supportsChecks,
      })
      .from(researchLogEntries)
      .where(
        and(
          inArray(researchLogEntries.validationId, ids),
          isNull(researchLogEntries.deletedAt),
        ),
      ),
    (row) => row.validationId,
  );
  const competitorRows = groupBy(
    await db
      .select({
        validationId: competitors.validationId,
        typicalPrice: competitors.typicalPrice,
      })
      .from(competitors)
      .where(
        and(
          inArray(competitors.validationId, ids),
          isNull(competitors.deletedAt),
        ),
      ),
    (row) => row.validationId,
  );
  const countLive = async (
    table: typeof assumptions | typeof risks,
  ): Promise<Map<string, number>> => {
    const rows = await db
      .select({
        validationId: table.validationId,
        count: sql<number>`count(*)::int`,
      })
      .from(table)
      .where(and(inArray(table.validationId, ids), isNull(table.deletedAt)))
      .groupBy(table.validationId);
    return new Map(rows.map((row) => [row.validationId, row.count]));
  };
  const assumptionCounts = await countLive(assumptions);
  const riskCounts = await countLive(risks);
  const costRows = groupBy(
    await db
      .select()
      .from(costItems)
      .where(
        and(inArray(costItems.validationId, ids), isNull(costItems.deletedAt)),
      ),
    (row) => row.validationId,
  );
  const inputs = groupBy(
    await db
      .select()
      .from(economicsInputs)
      .where(inArray(economicsInputs.validationId, ids)),
    (row) => row.validationId,
  );

  return new Map(
    heads.map((head) => {
      const id = head.validationId;
      const templateSections = sections.get(head.templateVersionId);
      const templateThresholds = thresholds.get(head.templateVersionId);
      if (templateSections === undefined || templateThresholds === undefined)
        throw new Error(`Template version ${head.templateVersionId} not read`);
      const loaded: LoadedValidation = {
        validationId: id,
        ideaId: head.ideaId,
        workspaceId: head.workspaceId,
        templateVersionId: head.templateVersionId,
        archived: head.archivedAt !== null,
        state: {
          sections: templateSections,
          thresholds: templateThresholds,
          answers: (answers.get(id) ?? []).map((answer) => ({
            questionKey: answer.questionKey,
            text: answer.text,
            fau: answer.fau,
            confidence: answer.confidence,
            activeEvidenceCount: evidence(
              "validation_answer",
              id,
              answer.questionKey,
            ),
          })),
          researchLogs: (logs.get(id) ?? []).map((log) => ({
            supportsChecks: log.supportsChecks,
          })),
          competitors: (competitorRows.get(id) ?? []).map((row) => ({
            typicalPrice: row.typicalPrice,
          })),
          assumptionCount: assumptionCounts.get(id) ?? 0,
          riskCount: riskCounts.get(id) ?? 0,
          costRows: (costRows.get(id) ?? []).map((row) => ({
            id: row.id,
            sortOrder: row.sortOrder,
            category: row.category,
            templateKey: row.templateKey,
            inputMode: row.inputMode,
            amount: row.amount,
            percent: row.percent,
            fau: row.fau,
            confidence: row.confidence,
            activeEvidenceCount: evidence("cost_item", row.id),
          })),
          economicsInputs: (inputs.get(id) ?? []).map(
            (input): EconomicsInputState => ({
              fieldKey: input.fieldKey,
              value: input.value,
              fau: input.fau,
              confidence: input.confidence,
              activeEvidenceCount: evidence(
                "economics_input",
                id,
                input.fieldKey,
              ),
            }),
          ),
        },
      };
      return [id, loaded];
    }),
  );
}

/** {@link loadValidations} for one validation, which must exist. */
export async function loadValidation(
  db: Executor,
  validationId: string,
): Promise<LoadedValidation> {
  const loaded = (await loadValidations(db, [validationId])).get(validationId);
  if (loaded === undefined) throw new Error(`No validation ${validationId}`);
  return loaded;
}

/**
 * How a caller with `role` sees a loaded validation: links into writing (19, a new
 * research log entry) only for an Owner or Member of an idea that is not archived
 * (design-spec 6.1).
 */
export const validationView = (
  loaded: LoadedValidation,
  role: "owner" | "member" | "viewer",
): ViewContext => ({
  workspaceId: loaded.workspaceId,
  ideaId: loaded.ideaId,
  canWrite: role !== "viewer" && !loaded.archived,
});

/**
 * How the snapshot of a decision log entry sees a validation: with no link into writing
 * (19, a new research log entry), since anyone who reads the log later, a Viewer
 * included, gets the links it keeps (SDD 5.11).
 */
export const snapshotView = (loaded: LoadedValidation): ViewContext => ({
  workspaceId: loaded.workspaceId,
  ideaId: loaded.ideaId,
  canWrite: false,
});
