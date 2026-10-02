import { schema } from "@moonx/db";
import type { KeyMetrics, LinkTarget, MetricValue, UserRef } from "@moonx/schemas";
import { and, eq, inArray } from "drizzle-orm";
import type { Executor } from "./db";
import { loadDecisionSummaries } from "./decision-log";
import { i18n } from "./i18n";
import type { PlanBundle } from "./plan-context";
import { loadTemplateSections } from "./template";
import { loadUserRefs } from "./users";
import { hasText } from "./validation-data";
import { orderRisks } from "./validation-table-dto";

/** SDD 5.9 PlanReference. `data` has the shape of its `kind`, documented on {@link buildReferences}. */
export interface PlanReference {
  kind:
    | "validation_answers"
    | "competitors"
    | "cost_rows"
    | "research_log"
    | "decision_log"
    | "self_analysis"
    | "metrics"
    | "assumptions"
    | "risks"
    | "go_no_go_history"
    | "totals";
  title: string;
  data: unknown;
  link: LinkTarget | null;
}

/** One entry of `template_questions.reference` (SDD 6.3). */
export type ReferenceSpec =
  | { kind: "validation_answers"; section?: string; keys?: string[] }
  | { kind: "competitors"; limit: number }
  | { kind: "cost_rows"; keys: string[] }
  | { kind: "research_log"; tag: "local_price" | "permits" | "demand_signal" }
  | { kind: "self_analysis"; sections: string[] }
  | { kind: "metrics"; keys: string[] }
  | { kind: "decision_log" | "go_no_go_history" | "assumptions" | "risks" | "totals" };

const title = (kind: PlanReference["kind"]) => i18n.t(`plan:reference.${kind}`);

/** References the viewer's role may not see: a Viewer never gets the self analysis (design-spec 6.12). */
const OWNER_MEMBER_ONLY = new Set<PlanReference["kind"]>(["self_analysis"]);

/** The key of a spec: identical specs of several sub-items of one item are shown once. */
const specKey = (spec: ReferenceSpec) => JSON.stringify(spec);

const metricOf = (metrics: KeyMetrics, key: string): MetricValue =>
  metrics[key] ?? { value: null, bound: "exact", reason: "empty" };

/**
 * The references of the given questions, always from the latest validation and self analyses
 * (design-spec 6.12 "参照（常に最新）"). `data` by kind:
 * - `validation_answers`: `{ questionKey, title, text }[]`
 * - `competitors`: `{ id, name, type, typicalPrice, strength, weakness }[]`, at most `limit`
 * - `cost_rows`: `{ id, key, name, category, inputMode, amount, percent }[]`
 * - `research_log`: `{ id, observedOn, topic, sourceType }[]` tagged with the check
 * - `self_analysis`: `{ user: UserRef, sections: { key, title, answers: { questionKey, title, text, amount }[] }[] }[]`
 *   of the Owners and Members who shared theirs with this workspace
 * - `metrics`: `Record<key, MetricValue>`
 * - `assumptions` / `risks`: the rows as in V10
 * - `decision_log` / `go_no_go_history`: `DecisionLogSummary[]`
 * - `totals`: `{ ownership: number; capital: number }`, the sums of the item's ownership table
 */
export async function buildReferences(
  db: Executor,
  bundle: PlanBundle,
  specs: ReferenceSpec[],
  role: "owner" | "member" | "viewer",
): Promise<PlanReference[]> {
  const unique = new Map(specs.map((s) => [specKey(s), s]));
  const { data } = bundle.validation;
  const { workspaceId, idea } = bundle;
  const base = { workspaceId, ideaId: idea.id };
  const out: PlanReference[] = [];
  for (const spec of unique.values()) {
    if (role === "viewer" && OWNER_MEMBER_ONLY.has(spec.kind)) continue;
    switch (spec.kind) {
      case "validation_answers": {
        const keys = data.questions
          .filter(
            (q) =>
              (spec.section ? q.sectionKey === spec.section : false) || spec.keys?.includes(q.key),
          )
          .map((q) => q.key);
        const titles = keys.length
          ? await db
              .select({
                key: schema.templateQuestions.questionKey,
                title: schema.templateQuestions.title,
              })
              .from(schema.templateQuestions)
              .where(
                and(
                  eq(schema.templateQuestions.templateVersionId, data.templateVersionId),
                  inArray(schema.templateQuestions.questionKey, keys),
                ),
              )
          : [];
        const titleOf = new Map(titles.map((t) => [t.key, t.title]));
        const textOf = new Map(data.answers.map((a) => [a.questionKey, a.text]));
        out.push({
          kind: spec.kind,
          title: title(spec.kind),
          data: keys.map((key) => ({
            questionKey: key,
            title: titleOf.get(key) ?? key,
            text: hasText(textOf.get(key)) ? (textOf.get(key) as string) : null,
          })),
          link: { screen: 11, ...base, sectionKey: spec.section ?? keys[0]?.split(".")[1] },
        });
        break;
      }
      case "competitors":
        out.push({
          kind: spec.kind,
          title: title(spec.kind),
          data: data.competitors.slice(0, spec.limit).map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type ?? null,
            typicalPrice: c.typicalPrice ?? null,
            strength: c.strength ?? null,
            weakness: c.weakness ?? null,
          })),
          link: { screen: 15, ...base },
        });
        break;
      case "cost_rows":
        out.push({
          kind: spec.kind,
          title: title(spec.kind),
          data: data.costItems
            .filter((c) => c.templateKey != null && spec.keys.includes(c.templateKey))
            .map((c) => ({
              id: c.id,
              key: c.templateKey,
              name: c.name,
              category: c.category,
              inputMode: c.inputMode,
              amount: c.amount ?? null,
              percent: c.percent ?? null,
            })),
          link: { screen: 17, ...base },
        });
        break;
      case "research_log":
        out.push({
          kind: spec.kind,
          title: title(spec.kind),
          data: data.researchLogs
            .filter((r) => r.supportsChecks.includes(spec.tag))
            .map((r) => ({
              id: r.id,
              observedOn: r.observedOn ?? null,
              topic: r.topic,
              sourceType: r.sourceType ?? null,
            })),
          link: { screen: 14, ...base },
        });
        break;
      case "self_analysis":
        out.push({
          kind: spec.kind,
          title: title(spec.kind),
          data: await sharedSelfAnalyses(db, workspaceId, spec.sections),
          link: { screen: 12, workspaceId },
        });
        break;
      case "metrics":
        out.push({
          kind: spec.kind,
          title: title(spec.kind),
          data: Object.fromEntries(
            spec.keys.map((key) => [key, metricOf(bundle.validation.state.keyMetrics, key)]),
          ),
          link: { screen: 18, ...base },
        });
        break;
      case "assumptions":
        out.push({
          kind: spec.kind,
          title: title(spec.kind),
          data: data.assumptions.map((a) => ({
            id: a.id,
            statement: a.statement,
            whyBelieve: a.whyBelieve ?? null,
            evidenceNote: a.evidenceNote ?? null,
            confidence: a.confidence ?? null,
            disproveCondition: a.disproveCondition ?? null,
          })),
          link: { screen: 16, ...base },
        });
        break;
      case "risks":
        out.push({
          kind: spec.kind,
          title: title(spec.kind),
          data: orderRisks(data.risks).map((r) => ({
            id: r.id,
            statement: r.statement,
            probability: r.probability ?? null,
            impact: r.impact ?? null,
            mitigation: r.mitigation ?? null,
          })),
          link: { screen: 16, ...base },
        });
        break;
      case "decision_log":
        out.push({
          kind: spec.kind,
          title: title(spec.kind),
          data: await loadDecisionSummaries(
            db,
            workspaceId,
            eq(schema.decisionLogEntries.ideaId, idea.id),
            20,
          ),
          link: { screen: 7, workspaceId },
        });
        break;
      case "go_no_go_history":
        out.push({
          kind: spec.kind,
          title: title(spec.kind),
          data: await loadDecisionSummaries(
            db,
            workspaceId,
            and(
              eq(schema.decisionLogEntries.businessPlanId, bundle.plan.id),
              eq(schema.decisionLogEntries.kind, "go_no_go"),
            ),
            20,
          ),
          link: { screen: 7, workspaceId, planId: bundle.plan.id },
        });
        break;
      case "totals":
        out.push({
          kind: spec.kind,
          title: title(spec.kind),
          data: ownershipTotals(bundle),
          link: null,
        });
        break;
    }
  }
  return out;
}

/** Sums of the Ownership and capital table (P.13.1): ownership as a 0-1 fraction, capital in the currency. */
function ownershipTotals(bundle: PlanBundle): { ownership: number; capital: number } {
  const rows =
    (bundle.answers.find((a) => a.questionKey === "P.13.1")?.rows as
      | Record<string, string | number | null>[]
      | null) ?? [];
  const sum = (key: string) =>
    rows.reduce(
      (total, row) => total + (typeof row[key] === "number" ? (row[key] as number) : 0),
      0,
    );
  return { ownership: sum("ownership"), capital: sum("capital") };
}

/** Self analyses of Owners and Members shared with the workspace, limited to the given sections. */
async function sharedSelfAnalyses(db: Executor, workspaceId: string, sectionKeys: string[]) {
  const shared = await db
    .select({ analysis: schema.selfAnalyses })
    .from(schema.selfAnalysisShares)
    .innerJoin(
      schema.selfAnalyses,
      eq(schema.selfAnalyses.id, schema.selfAnalysisShares.selfAnalysisId),
    )
    .innerJoin(
      schema.memberships,
      and(
        eq(schema.memberships.userId, schema.selfAnalyses.userId),
        eq(schema.memberships.workspaceId, workspaceId),
        inArray(schema.memberships.role, ["owner", "member"]),
      ),
    )
    .where(eq(schema.selfAnalysisShares.workspaceId, workspaceId))
    .orderBy(schema.selfAnalysisShares.sharedAt);
  if (shared.length === 0) return [];
  const refs = await loadUserRefs(
    db,
    shared.map((s) => s.analysis.userId),
    workspaceId,
  );
  const answers = await db
    .select()
    .from(schema.selfAnalysisAnswers)
    .where(
      inArray(
        schema.selfAnalysisAnswers.selfAnalysisId,
        shared.map((s) => s.analysis.id),
      ),
    );
  const result: {
    user: UserRef;
    sections: {
      key: string;
      title: string;
      answers: { questionKey: string; title: string; text: string | null; amount: number | null }[];
    }[];
  }[] = [];
  for (const { analysis } of shared) {
    const sections = await loadTemplateSections(db, analysis.templateVersionId, sectionKeys);
    const rowOf = new Map(
      answers.filter((a) => a.selfAnalysisId === analysis.id).map((a) => [a.questionKey, a]),
    );
    result.push({
      user: refs.get(analysis.userId) as UserRef,
      sections: sections.map(({ section }) => ({
        key: section.key,
        title: section.title,
        answers: section.questions.map((q) => ({
          questionKey: q.key,
          title: q.title,
          text: rowOf.get(q.key)?.text ?? null,
          amount: rowOf.get(q.key)?.amount ?? null,
        })),
      })),
    });
  }
  return result;
}
