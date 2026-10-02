import { schema } from "@moonx/db";
import { createI18n } from "@moonx/i18n";
import type {
  CheckResult,
  EconomicsWarning,
  FauBreakdown,
  KeyMetrics,
  NextStep,
  TemplateRef,
} from "@moonx/schemas";
import { and, desc, eq, gt } from "drizzle-orm";
import { ApiError } from "../errors";
import type { Executor } from "./db";
import { type DecisionLogSummary, loadDecisionSummaries } from "./decision-log";
import { type IdeaDetail, loadIdeas } from "./ideas";
import { loadPlanSummaries, type PlanSummary } from "./plans";
import { hasText, LIST_METRIC_KEYS, pickMetrics, type SectionSummary } from "./validation-data";

const t = createI18n().t;

/** SDD 5.7 ValidationHome. */
export interface ValidationHome {
  validationId: string;
  idea: IdeaDetail;
  template: TemplateRef;
  summary: {
    customer: string | null;
    problem: string | null;
    solution: string | null;
    marketType: string | null;
  };
  keyMetrics: Pick<KeyMetrics, (typeof LIST_METRIC_KEYS)[number]>;
  economicsWarnings: EconomicsWarning[];
  nextSteps: NextStep[];
  checks: CheckResult[];
  fau: FauBreakdown;
  sections: (SectionSummary & { title: string })[];
  decisions: DecisionLogSummary[];
  plans: PlanSummary[];
  canAddPlan: boolean;
}

async function templateRefOf(db: Executor, validationId: string): Promise<TemplateRef> {
  const [pinned] = await db
    .select({
      versionId: schema.templateVersions.id,
      versionNumber: schema.templateVersions.versionNumber,
      templateId: schema.templateVersions.templateId,
    })
    .from(schema.validations)
    .innerJoin(
      schema.templateVersions,
      eq(schema.templateVersions.id, schema.validations.templateVersionId),
    )
    .where(eq(schema.validations.id, validationId));
  if (!pinned) throw new ApiError("NOT_FOUND", "Resource not found");
  const [newer] = await db
    .select({
      versionId: schema.templateVersions.id,
      versionNumber: schema.templateVersions.versionNumber,
    })
    .from(schema.templateVersions)
    .where(
      and(
        eq(schema.templateVersions.templateId, pinned.templateId),
        eq(schema.templateVersions.status, "published"),
        gt(schema.templateVersions.versionNumber, pinned.versionNumber),
      ),
    )
    .orderBy(desc(schema.templateVersions.versionNumber))
    .limit(1);
  return {
    versionId: pinned.versionId,
    versionNumber: pinned.versionNumber,
    newerVersion: newer ?? null,
  };
}

/**
 * The screen 13 payload (SDD 5.7 V1). Checks, F/A/U, key metrics, next steps and section progress
 * come from `computeValidationState`, so the home never disagrees with the screens it links to.
 */
export async function loadValidationHome(
  db: Executor,
  scope: { workspaceId: string; ideaId: string },
): Promise<ValidationHome> {
  const [ideaRow] = await db
    .select()
    .from(schema.ideas)
    .where(and(eq(schema.ideas.id, scope.ideaId), eq(schema.ideas.workspaceId, scope.workspaceId)));
  if (!ideaRow) throw new ApiError("NOT_FOUND", "Resource not found");
  const [loaded] = await loadIdeas(db, scope.workspaceId, [ideaRow]);
  if (!loaded) throw new ApiError("NOT_FOUND", "Resource not found");
  const { data, state, detail, validationId } = loaded;

  const [template, decisions, plans] = await Promise.all([
    templateRefOf(db, validationId),
    loadDecisionSummaries(
      db,
      scope.workspaceId,
      eq(schema.decisionLogEntries.ideaId, ideaRow.id),
      5,
    ),
    loadPlanSummaries(db, scope.workspaceId, [ideaRow.id]),
  ]);

  const answerText = (key: string) => {
    if (!data.questions.some((q) => q.key === key)) return null;
    const text = data.answers.find((a) => a.questionKey === key)?.text;
    return hasText(text) ? (text as string) : null;
  };

  return {
    validationId,
    idea: detail,
    template,
    summary: {
      customer: answerText("V.01.WHO"),
      problem: answerText("V.01.PROBLEM"),
      solution: ideaRow.proposedSolution,
      marketType: answerText("V.02.OCEAN"),
    },
    keyMetrics: pickMetrics(state.keyMetrics, LIST_METRIC_KEYS),
    economicsWarnings: state.economics.warnings,
    nextSteps: state.nextSteps,
    checks: state.checks,
    fau: state.fau,
    sections: state.sections.map((section) => ({
      ...section,
      title: t(`validation:sections.${section.key}`),
    })),
    decisions,
    plans: (plans.get(ideaRow.id) ?? []).filter((p) => !p.archived),
    canAddPlan: ideaRow.latestDecision === "proceed" && ideaRow.archivedAt == null,
  };
}
