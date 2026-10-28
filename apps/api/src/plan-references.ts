import {
  assumptions,
  costItems,
  type Database,
  type DatabaseTransaction,
  decisionLogEntries,
  evidenceLinks,
  loadTemplateSections,
  researchLogEntries,
  risks,
  selfAnalyses,
  selfAnalysisAnswers,
  selfAnalysisShares,
  templateCostDefaults,
  templates,
  templateVersions,
  users,
} from "@moonx/db";
import {
  assumptionEvidenceText,
  type DraftAssumption,
  type DraftRisk,
  hasText,
  isQuestionShown,
  keyMetricOf,
  orderRisks,
  type PlanAnswerContent,
  type PlanQuestion,
  tableTotals,
} from "@moonx/domain";
import { i18n } from "@moonx/i18n";
import type {
  LinkTarget,
  PlanReference,
  PlanReferenceSpec,
  Role,
} from "@moonx/schemas";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import {
  decisionSummaries,
  type IdeaContext,
  newestDecisionFirst,
} from "./idea-views";
import { loadTopCompetitors } from "./plan-views";
import { loadUserRefs } from "./user-refs";

// What a plan item shows beside its sub-items (SDD 5.9 PlanReference, 6.3 `reference`),
// always from the validation as it is now (design-spec 6.12), and the lists of 16 the
// draft copies into §21 and §22.

type Executor = Database | DatabaseTransaction;

type CostRowReference = Extract<
  PlanReference,
  { kind: "cost_rows" }
>["data"][number];

/**
 * The name and category the validation template gives each of `keys`, from its newest
 * published version that has the key: what a cost row the validation does not have is
 * called on 21 (design-spec 6.0.7「Not in validation」).
 */
async function costDefaultsOf(db: Executor, keys: readonly string[]) {
  if (keys.length === 0) return new Map<string, never>();
  const rows = await db
    .select({
      key: templateCostDefaults.key,
      name: templateCostDefaults.name,
      category: templateCostDefaults.category,
    })
    .from(templateCostDefaults)
    .innerJoin(
      templateVersions,
      eq(templateVersions.id, templateCostDefaults.templateVersionId),
    )
    .innerJoin(templates, eq(templates.id, templateVersions.templateId))
    .where(
      and(
        eq(templates.kind, "validation"),
        isNotNull(templateVersions.publishedAt),
        inArray(templateCostDefaults.key, [...keys]),
      ),
    )
    .orderBy(desc(templateVersions.versionNumber));
  const byKey = new Map<string, (typeof rows)[number]>();
  for (const row of rows) if (!byKey.has(row.key)) byKey.set(row.key, row);
  return byKey;
}

/**
 * The names of the cost rows `keys` (template keys) name, for 21's number sub-items: the
 * validation's row's, else, for a row it does not have, the template's as the cost_rows
 * reference gives it (design-spec 6.0.7「Not in validation」); null where neither has one.
 */
export async function loadCostRowNames(
  db: Executor,
  validationId: string,
  keys: readonly string[],
): Promise<Map<string, string | null>> {
  if (keys.length === 0) return new Map();
  const rows = await db
    .select({ key: costItems.templateKey, name: costItems.name })
    .from(costItems)
    .where(
      and(
        eq(costItems.validationId, validationId),
        isNull(costItems.deletedAt),
        inArray(costItems.templateKey, [...keys]),
      ),
    )
    .orderBy(asc(costItems.sortOrder));
  const names = new Map<string, string | null>();
  for (const row of rows) {
    if (row.key !== null && !names.has(row.key)) names.set(row.key, row.name);
  }
  const defaults = await costDefaultsOf(
    db,
    keys.filter((key) => !names.has(key)),
  );
  for (const key of keys) {
    if (!names.has(key)) names.set(key, defaults.get(key)?.name ?? null);
  }
  return names;
}

/** An assumption of 16 with its evidence, as §21 copies and shows it. */
export interface ListedAssumption extends DraftAssumption {
  id: string;
  confidence: "low" | "medium" | "high" | null;
}

/** A risk of 16, as §22 copies and shows it. */
export interface ListedRisk extends DraftRisk {
  id: string;
}

/**
 * The assumptions and risks of 16 not deleted, in their order there, with each
 * assumption's evidence: URLs, and research log entries that are not deleted.
 */
export async function loadAssumptionsAndRisks(
  db: Executor,
  validationId: string,
): Promise<{ assumptions: ListedAssumption[]; risks: ListedRisk[] }> {
  const assumptionRows = await db
    .select()
    .from(assumptions)
    .where(
      and(
        eq(assumptions.validationId, validationId),
        isNull(assumptions.deletedAt),
      ),
    )
    .orderBy(
      asc(assumptions.sortOrder),
      asc(assumptions.createdAt),
      asc(assumptions.id),
    );
  const links =
    assumptionRows.length === 0
      ? []
      : await db
          .select({
            targetId: evidenceLinks.targetId,
            url: evidenceLinks.url,
            note: evidenceLinks.note,
            observedOn: researchLogEntries.observedOn,
            topic: researchLogEntries.topic,
            logDeleted: sql<boolean>`${researchLogEntries.deletedAt} is not null`,
          })
          .from(evidenceLinks)
          .leftJoin(
            researchLogEntries,
            eq(researchLogEntries.id, evidenceLinks.researchLogEntryId),
          )
          .where(
            and(
              eq(evidenceLinks.validationId, validationId),
              eq(evidenceLinks.targetType, "assumption"),
              inArray(
                evidenceLinks.targetId,
                assumptionRows.map((row) => row.id),
              ),
              isNull(evidenceLinks.deletedAt),
            ),
          )
          .orderBy(asc(evidenceLinks.createdAt), asc(evidenceLinks.id));
  const riskRows = await db
    .select()
    .from(risks)
    .where(and(eq(risks.validationId, validationId), isNull(risks.deletedAt)));
  return {
    assumptions: assumptionRows.map((row) => ({
      id: row.id,
      statement: row.statement,
      whyBelieve: row.whyBelieve,
      evidence: links
        .filter((link) => link.targetId === row.id)
        .map((link) => ({
          url: link.url,
          note: link.note,
          log:
            link.topic === null || link.logDeleted
              ? null
              : { observedOn: link.observedOn, topic: link.topic },
        })),
      evidenceNote: row.evidenceNote,
      confidence: row.confidence,
      disproveCondition: row.disproveCondition,
    })),
    risks: orderRisks(riskRows).map((row) => ({
      id: row.id,
      statement: row.statement,
      probability: row.probability,
      impact: row.impact,
      mitigation: row.mitigation,
    })),
  };
}

/** The screens of the validation questions of each section (design-spec 6.1 操作). */
const validationScreen = (section: string) =>
  section === "04" ? 15 : section === "08" ? 18 : 11;

/** Where a plan item is and who looks at it. */
export interface ReferencePlace {
  workspaceId: string;
  ideaId: string;
  planId: string;
  role: Role;
  /** The idea's validation, evaluated as it is now. */
  context: IdeaContext;
  /** The answers the item shows (a viewed version's), for `totals`. */
  answers: ReadonlyMap<string, PlanAnswerContent>;
}

/**
 * The references of a plan item: those of its sub-items in order, each once (SDD 6.3:
 * the item's are the union of its sub-items'). The shared self-analyses only for
 * Owners and Members (design-spec 6.12).
 */
export async function loadPlanReferences(
  db: Executor,
  questions: readonly PlanQuestion[],
  place: ReferencePlace,
): Promise<PlanReference[]> {
  const seen = new Set<string>();
  const specs: { spec: PlanReferenceSpec; question: PlanQuestion }[] = [];
  for (const question of questions) {
    for (const spec of question.reference ?? []) {
      const key = JSON.stringify(spec);
      if (seen.has(key)) continue;
      seen.add(key);
      if (spec.kind === "self_analysis" && place.role === "viewer") continue;
      specs.push({ spec, question });
    }
  }
  const references: PlanReference[] = [];
  for (const { spec, question } of specs) {
    references.push(await referenceOf(db, spec, question, place));
  }
  return references;
}

async function referenceOf(
  db: Executor,
  spec: PlanReferenceSpec,
  question: PlanQuestion,
  place: ReferencePlace,
): Promise<PlanReference> {
  const { workspaceId, ideaId, planId, context } = place;
  const base = { workspaceId, ideaId };
  const validationId = context.loaded.validationId;
  switch (spec.kind) {
    case "validation_answers": {
      const { state } = context.loaded;
      const shown = new Map(
        state.answers.map((answer) => [answer.questionKey, answer]),
      );
      const questionsShown = state.sections
        .flatMap((section) => section.questions)
        .filter((candidate) => isQuestionShown(candidate, shown));
      const picked =
        "section" in spec
          ? questionsShown.filter(
              (candidate) => candidate.sectionKey === spec.section,
            )
          : spec.keys.flatMap((key) =>
              questionsShown.filter((candidate) => candidate.key === key),
            );
      const sectionKey =
        "section" in spec ? spec.section : (spec.keys[0]?.split(".")[1] ?? "");
      const title =
        "section" in spec
          ? i18n.t("common:planReference.validationSection", {
              section: [
                spec.section,
                state.sections.find((section) => section.key === spec.section)
                  ?.title,
              ]
                .filter((part) => part !== undefined)
                .join(" "),
            })
          : i18n.t("common:planReference.validationAnswers");
      return {
        kind: "validation_answers",
        title,
        data: picked.map((candidate) => {
          const text = shown.get(candidate.key)?.text ?? null;
          return {
            questionKey: candidate.key,
            title: candidate.title,
            text: hasText(text) ? text : null,
          };
        }),
        link: {
          screen: validationScreen(sectionKey),
          ...base,
          sectionKey,
        },
      };
    }
    case "competitors": {
      const rows = await loadTopCompetitors(db, validationId, spec.limit);
      return {
        kind: "competitors",
        title: i18n.t("common:planReference.competitors"),
        data: rows.map((row) => ({
          id: row.id,
          name: row.name,
          type: row.type,
          typicalPrice: row.typicalPrice,
          strength: row.strength,
          weakness: row.weakness,
        })),
        link: { screen: 15, ...base },
      };
    }
    case "cost_rows": {
      const rows = await db
        .select()
        .from(costItems)
        .where(
          and(
            eq(costItems.validationId, validationId),
            isNull(costItems.deletedAt),
            inArray(costItems.templateKey, [...spec.keys]),
          ),
        );
      const metrics = context.evaluation.keyMetrics;
      const missing = spec.keys.filter(
        (key) => !rows.some((row) => row.templateKey === key),
      );
      const defaults = await costDefaultsOf(db, missing);
      return {
        kind: "cost_rows",
        title: i18n.t("common:planReference.cost_rows"),
        data: spec.keys.flatMap((key): CostRowReference[] => {
          const value = keyMetricOf(metrics, `cost_row:${key}`);
          const found = rows.filter((row) => row.templateKey === key);
          if (found.length === 0) {
            // Not in validation (design-spec 6.0.7): deleted, or a key its template lacks.
            const preset = defaults.get(key);
            return [
              {
                id: null,
                category: preset?.category ?? null,
                templateKey: key,
                name: preset?.name ?? null,
                inputMode: null,
                amount: null,
                percent: null,
                value,
              },
            ];
          }
          return found.map((row) => ({
            id: row.id,
            category: row.category,
            templateKey: key,
            name: row.name,
            inputMode: row.inputMode,
            amount: row.amount,
            percent: row.percent,
            value,
          }));
        }),
        link: { screen: 17, ...base },
      };
    }
    case "research_log": {
      const rows = await db
        .select()
        .from(researchLogEntries)
        .where(
          and(
            eq(researchLogEntries.validationId, validationId),
            isNull(researchLogEntries.deletedAt),
            sql`${spec.tag} = any(${researchLogEntries.supportsChecks})`,
          ),
        )
        .orderBy(
          sql`${researchLogEntries.observedOn} desc nulls last`,
          desc(researchLogEntries.createdAt),
          asc(researchLogEntries.id),
        );
      return {
        kind: "research_log",
        title: i18n.t("common:planReference.research_log", {
          tag: i18n.t(`common:supportsCheck.${spec.tag}`),
        }),
        data: rows.map((row) => ({
          id: row.id,
          observedOn: row.observedOn,
          topic: row.topic,
          observation: row.observation,
          sourceType: row.sourceType,
          sourceUrl: row.sourceUrl,
        })),
        link: { screen: 14, ...base },
      };
    }
    case "self_analysis":
      return {
        kind: "self_analysis",
        title: i18n.t("common:planReference.self_analysis"),
        data: await sharedSections(db, workspaceId, spec.sections),
        // Each member's opens 12 with their id; no one screen holds them all.
        link: null,
      };
    case "metrics":
      return {
        kind: "metrics",
        title: i18n.t("common:planReference.metrics"),
        data: spec.keys.map((key) => ({
          key,
          value: keyMetricOf(context.evaluation.keyMetrics, key),
        })),
        link: { screen: 18, ...base },
      };
    case "decision_log":
    case "go_no_go_history": {
      const rows = await db
        .select()
        .from(decisionLogEntries)
        .where(
          spec.kind === "decision_log"
            ? eq(decisionLogEntries.ideaId, ideaId)
            : and(
                eq(decisionLogEntries.businessPlanId, planId),
                eq(decisionLogEntries.kind, "go_no_go"),
              ),
        )
        .orderBy(...newestDecisionFirst);
      const data = await decisionSummaries(db, workspaceId, rows);
      const link: LinkTarget = { screen: 7, ...base };
      return spec.kind === "decision_log"
        ? {
            kind: "decision_log",
            title: i18n.t("common:planReference.decision_log"),
            data,
            link,
          }
        : {
            kind: "go_no_go_history",
            title: i18n.t("common:planReference.go_no_go_history"),
            data,
            link: { ...link, planId },
          };
    }
    case "assumptions":
    case "risks": {
      const lists = await loadAssumptionsAndRisks(db, validationId);
      return spec.kind === "assumptions"
        ? {
            kind: "assumptions",
            title: i18n.t("common:planReference.assumptions"),
            data: lists.assumptions.map((row) => ({
              id: row.id,
              statement: row.statement,
              whyBelieve: row.whyBelieve,
              evidence: assumptionEvidenceText(row.evidence, row.evidenceNote),
              confidence: row.confidence,
              disproveCondition: row.disproveCondition,
            })),
            link: { screen: 16, ...base, tab: "assumptions" },
          }
        : {
            kind: "risks",
            title: i18n.t("common:planReference.risks"),
            data: lists.risks.map((row) => ({
              id: row.id,
              statement: row.statement,
              probability: row.probability,
              impact: row.impact,
              mitigation: row.mitigation,
            })),
            link: { screen: 16, ...base, tab: "risks" },
          };
    }
    case "totals":
      return {
        kind: "totals",
        title: i18n.t("common:planReference.totals"),
        data: tableTotals(
          question.options,
          place.answers.get(question.key)?.rows ?? null,
        ),
        link: null,
      };
  }
}

/**
 * The sections `sectionKeys` of every self-analysis shared with `workspaceId`, by the
 * owner's name: what Owners and Members read on 12 (S7), for the item to set beside.
 */
async function sharedSections(
  db: Executor,
  workspaceId: string,
  sectionKeys: readonly string[],
) {
  const shared = await db
    .select({ analysis: selfAnalyses, name: users.displayName })
    .from(selfAnalysisShares)
    .innerJoin(
      selfAnalyses,
      eq(selfAnalyses.id, selfAnalysisShares.selfAnalysisId),
    )
    .innerJoin(users, eq(users.id, selfAnalyses.userId))
    .where(eq(selfAnalysisShares.workspaceId, workspaceId));
  if (shared.length === 0) return [];
  const ordered = shared.toSorted(
    (a, b) =>
      a.name.localeCompare(b.name, "en", { sensitivity: "base" }) ||
      a.analysis.id.localeCompare(b.analysis.id),
  );
  const templates = await loadTemplateSections(
    db,
    ordered.map(({ analysis }) => analysis.templateVersionId),
  );
  const answers = await db
    .select()
    .from(selfAnalysisAnswers)
    .where(
      inArray(
        selfAnalysisAnswers.selfAnalysisId,
        ordered.map(({ analysis }) => analysis.id),
      ),
    );
  const refs = await loadUserRefs(
    db,
    ordered.map(({ analysis }) => analysis.userId),
    workspaceId,
  );
  return ordered.map(({ analysis }) => {
    const user = refs.get(analysis.userId);
    if (user === undefined) throw new Error(`No user ${analysis.userId}`);
    const mine = new Map(
      answers
        .filter((row) => row.selfAnalysisId === analysis.id)
        .map((row) => [row.questionKey, row]),
    );
    return {
      selfAnalysisId: analysis.id,
      user,
      currency: analysis.currency,
      sections: (templates.get(analysis.templateVersionId) ?? [])
        .filter((section) => sectionKeys.includes(section.key))
        .map(({ questions, ...section }) => ({
          ...section,
          answers: questions.map((candidate) => ({
            questionKey: candidate.key,
            title: candidate.title,
            text: mine.get(candidate.key)?.text ?? null,
            amount: mine.get(candidate.key)?.amount ?? null,
          })),
        })),
    };
  });
}
