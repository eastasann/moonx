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
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import type { Database, DatabaseTransaction } from "../client";
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
} from "../schema";

type Executor = Database | DatabaseTransaction;

/** The sections and questions of a template version, as screens and the domain read them. */
async function loadTemplateSections(
  db: Executor,
  templateVersionId: string,
): Promise<TemplateSection[]> {
  const sections = await db
    .select()
    .from(templateSections)
    .where(eq(templateSections.templateVersionId, templateVersionId))
    .orderBy(asc(templateSections.sortOrder));
  const questions = await db
    .select()
    .from(templateQuestions)
    .where(eq(templateQuestions.templateVersionId, templateVersionId))
    .orderBy(asc(templateQuestions.sortOrder));
  return sections.map((section) =>
    templateSectionSchema.parse({
      key: section.key,
      part: section.part,
      title: section.title,
      subtitle: section.subtitle,
      guidance: section.guidance,
      questions: questions
        .filter((question) => question.templateSectionId === section.id)
        .map((question) => ({
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
  );
}

async function loadThresholds(
  db: Executor,
  templateVersionId: string,
): Promise<CheckThresholds> {
  const rules = (
    await db
      .select({
        checkKey: templateCheckRules.checkKey,
        params: templateCheckRules.params,
      })
      .from(templateCheckRules)
      .where(eq(templateCheckRules.templateVersionId, templateVersionId))
  ).map((rule) => checkRuleSchema.parse(rule));
  const thresholds: Partial<CheckThresholds> = {};
  for (const rule of rules) {
    if (rule.checkKey === "competitors") thresholds.competitors = rule.params;
    else if (rule.checkKey === "local_price")
      thresholds.local_price = rule.params;
    else if (rule.checkKey === "permits") thresholds.permits = rule.params;
    else if (rule.checkKey === "demand_signal")
      thresholds.demand_signal = rule.params;
  }
  const { competitors, local_price, permits, demand_signal } = thresholds;
  if (!competitors || !local_price || !permits || !demand_signal)
    throw new Error(
      `Template version ${templateVersionId} lacks a check threshold`,
    );
  return { competitors, local_price, permits, demand_signal };
}

/**
 * The evidence of a validation that counts (design-spec 6.0.3): links not detached whose
 * research log is not deleted, and every URL link. Keyed by target type, id and key.
 */
async function loadActiveEvidenceCounts(db: Executor, validationId: string) {
  const rows = await db
    .select({
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
        eq(evidenceLinks.validationId, validationId),
        isNull(evidenceLinks.deletedAt),
        or(
          isNull(evidenceLinks.researchLogEntryId),
          isNull(researchLogEntries.deletedAt),
        ),
      ),
    )
    .groupBy(
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
  state: ValidationState;
  ideaId: string;
  workspaceId: string;
  templateVersionId: string;
  archived: boolean;
}

/**
 * Reads one validation into the `ValidationState` of `packages/domain`, leaving out
 * logically deleted rows (SDD 6.5). The seed evaluates it for the snapshots of the
 * decision log and plan versions, and its test for the states of design-spec 8.2.
 */
export async function loadValidation(
  db: Executor,
  validationId: string,
): Promise<LoadedValidation> {
  const [validation] = await db
    .select({
      templateVersionId: validations.templateVersionId,
      ideaId: ideas.id,
      workspaceId: ideas.workspaceId,
      archivedAt: ideas.archivedAt,
    })
    .from(validations)
    .innerJoin(ideas, eq(ideas.id, validations.ideaId))
    .where(eq(validations.id, validationId));
  if (validation === undefined)
    throw new Error(`No validation ${validationId}`);
  const evidence = await loadActiveEvidenceCounts(db, validationId);

  const answers = await db
    .select()
    .from(validationAnswers)
    .where(eq(validationAnswers.validationId, validationId));
  const logs = await db
    .select({ supportsChecks: researchLogEntries.supportsChecks })
    .from(researchLogEntries)
    .where(
      and(
        eq(researchLogEntries.validationId, validationId),
        isNull(researchLogEntries.deletedAt),
      ),
    );
  const competitorRows = await db
    .select({ typicalPrice: competitors.typicalPrice })
    .from(competitors)
    .where(
      and(
        eq(competitors.validationId, validationId),
        isNull(competitors.deletedAt),
      ),
    );
  const assumptionCount = await db.$count(
    assumptions,
    and(
      eq(assumptions.validationId, validationId),
      isNull(assumptions.deletedAt),
    ),
  );
  const riskCount = await db.$count(
    risks,
    and(eq(risks.validationId, validationId), isNull(risks.deletedAt)),
  );
  const costRows = await db
    .select()
    .from(costItems)
    .where(
      and(
        eq(costItems.validationId, validationId),
        isNull(costItems.deletedAt),
      ),
    );
  const inputs = await db
    .select()
    .from(economicsInputs)
    .where(eq(economicsInputs.validationId, validationId));

  return {
    ideaId: validation.ideaId,
    workspaceId: validation.workspaceId,
    templateVersionId: validation.templateVersionId,
    archived: validation.archivedAt !== null,
    state: {
      sections: await loadTemplateSections(db, validation.templateVersionId),
      thresholds: await loadThresholds(db, validation.templateVersionId),
      answers: answers.map((answer) => ({
        questionKey: answer.questionKey,
        text: answer.text,
        fau: answer.fau,
        confidence: answer.confidence,
        activeEvidenceCount: evidence(
          "validation_answer",
          validationId,
          answer.questionKey,
        ),
      })),
      researchLogs: logs,
      competitors: competitorRows,
      assumptionCount,
      riskCount,
      costRows: costRows.map((row) => ({
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
      economicsInputs: inputs.map(
        (input): EconomicsInputState => ({
          fieldKey: input.fieldKey,
          value: input.value,
          fau: input.fau,
          confidence: input.confidence,
          activeEvidenceCount: evidence(
            "economics_input",
            validationId,
            input.fieldKey,
          ),
        }),
      ),
    },
  };
}

/** The view of an Owner or Member who can write, as the one recording a decision. */
export const writerView = (loaded: LoadedValidation): ViewContext => ({
  workspaceId: loaded.workspaceId,
  ideaId: loaded.ideaId,
  canWrite: !loaded.archived,
});
