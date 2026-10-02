import { buildKeyMetrics, computeEconomics } from "@moonx/domain";
import { uid } from "../lib/ids";
import type { World } from "../lib/rows";
import type { Clock } from "../lib/time";
import { businessPlanTemplate } from "../templates/business-plan";
import { templateVersionId } from "../templates/load";
import { versionOf } from "../templates/types";
import type { IdeaKey, IdeaRecord } from "./ideas";
import { type PersonKey, userId } from "./ids";
import { piayaPlanAnswers, studyCafePlanAnswers } from "./plans-content";

export type PlanKey = "piaya-a" | "piaya-b" | "study-cafe-a";

export const planId = (key: PlanKey) => uid("plan", key);
export const planVersionId = (key: PlanKey, versionNumber: number) =>
  uid("plan-version", key, String(versionNumber));
export const executionItemId = (key: PlanKey, type: string, index: number) =>
  uid("execution", key, type, String(index));

type Row = Record<string, string | number | null>;
export interface PlanAnswerSpec {
  text?: string;
  rows?: Row[];
  /** Days ago the answer was last edited; defaults to the plan's creation. */
  editedDaysAgo?: number;
  /** What the answer said before an edit made after the plan's version and Go / No-Go were recorded. */
  previousText?: string;
}

interface PlanRow {
  key: PlanKey;
  idea: IdeaKey;
  name: string;
  businessName: string;
  preparedBy: PersonKey;
  createdDaysAgo: number;
  /** Hand-written answers on top of the draft's copies. */
  written: Record<string, PlanAnswerSpec>;
}

const PLANS: PlanRow[] = [
  {
    key: "piaya-a",
    idea: "piaya",
    name: "Plan A",
    businessName: "Piaya Gift Box Co.",
    preparedBy: "ana",
    createdDaysAgo: 24,
    written: piayaPlanAnswers,
  },
  {
    key: "piaya-b",
    idea: "piaya",
    name: "Plan B",
    businessName: "Piaya Gift Box Co.",
    preparedBy: "ana",
    createdDaysAgo: 6,
    written: {},
  },
  {
    key: "study-cafe-a",
    idea: "study-cafe",
    name: "Plan A",
    businessName: "Student Study Café",
    preparedBy: "paolo",
    createdDaysAgo: 60,
    written: studyCafePlanAnswers,
  },
];

const level = (v: string | null) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : null);

/** The value a "copy from" source gives a draft (design-spec 6.12). */
function copySource(source: string, idea: IdeaRecord): { text?: string; rows?: Row[] } | null {
  const spec = idea.validation.spec;
  if (source === "IDEA.ONE_LINE_CONCEPT") return { text: idea.oneLineConcept };
  if (source === "IDEA.PROPOSED_SOLUTION") return { text: idea.proposedSolution };
  if (source === "LIST.ASSUMPTIONS") {
    return {
      rows: spec.assumptions.map((a) => ({
        assumption: a.statement,
        why_believe: a.whyBelieve,
        evidence: a.evidenceNote,
        disprove: a.disproveCondition,
      })),
    };
  }
  if (source === "LIST.RISKS") {
    return {
      rows: spec.risks.map((r) => ({
        risk: r.statement,
        probability: level(r.probability),
        impact: level(r.impact),
        mitigation: r.mitigation,
        trigger_indicator: null,
      })),
    };
  }
  const answer = spec.answers.find((a) => a.key === source);
  return answer?.text ? { text: answer.text } : null;
}

/** What a draft copies from the validation, by sub-item (a draft's answers before any editing). */
function draftAnswers(idea: IdeaRecord): Record<string, PlanAnswerSpec & { source: string }> {
  const out: Record<string, PlanAnswerSpec & { source: string }> = {};
  for (const section of versionOf(businessPlanTemplate, 1).sections) {
    for (const q of section.questions) {
      if (!q.copyFrom) continue;
      const parts = q.copyFrom.map((s) => copySource(s, idea)).filter((p) => p != null);
      if (parts.length === 0) continue;
      const rows = parts.flatMap((p) => p.rows ?? []);
      const texts = parts.flatMap((p) => (p.text ? [p.text] : []));
      out[q.key] = {
        source: q.copyFrom.join("+"),
        ...(rows.length > 0 ? { rows } : { text: texts.join("\n\n") }),
      };
    }
  }
  return out;
}

export interface PlanRecord {
  key: PlanKey;
  id: string;
  idea: IdeaKey;
  answers: Record<string, PlanAnswerSpec>;
  executionItemIds: string[];
}

export interface ExecutionOverride {
  title?: string;
  assignee?: PersonKey | { name: string } | null;
  dueInDays?: number | null;
  status?: "todo" | "doing" | "done" | "open" | "resolved" | null;
  goal?: string;
  exitCondition?: string;
  actions?: string;
  completionCriteria?: string;
  kpiTarget?: string;
  kpiReviewFrequency?: string;
  kpiActual?: string;
  whyItMatters?: string;
  answer?: string;
}

/** Overrides by `${type}:${index}` for preset rows, and extra rows to add. */
export interface ExecutionPlanSpec {
  preset: Record<string, ExecutionOverride>;
  extra: (ExecutionOverride & {
    type: "milestone" | "launch" | "kpi" | "open_question" | "next_action";
    title: string;
  })[];
}

export function addPlans(
  world: World,
  clock: Clock,
  ideas: Record<IdeaKey, IdeaRecord>,
  execution: Record<PlanKey, ExecutionPlanSpec>,
): Record<PlanKey, PlanRecord> {
  const records = {} as Record<PlanKey, PlanRecord>;
  const planVersion = versionOf(businessPlanTemplate, 1);

  for (const row of PLANS) {
    const idea = ideas[row.idea];
    const id = planId(row.key);
    const created = clock.ago(row.createdDaysAgo);
    world.businessPlans.push({
      id,
      ideaId: idea.id,
      name: row.name,
      businessName: row.businessName,
      preparedBy: row.preparedBy === "ana" ? "Ana Villanueva" : "Paolo Gonzaga",
      templateVersionId: templateVersionId("business_plan", 1),
      createdById: userId(row.preparedBy),
      lastActivityAt: created,
      updatedById: userId(row.preparedBy),
      createdAt: created,
      updatedAt: created,
    });

    const answers: Record<string, PlanAnswerSpec> = {};
    for (const [key, a] of Object.entries(draftAnswers(idea))) {
      answers[key] = { text: a.text, rows: a.rows };
      world.planAnswers.push({
        id: uid("plan-answer", row.key, key),
        businessPlanId: id,
        questionKey: key,
        text: a.text ?? null,
        rows: a.rows ?? null,
        copiedFrom: { source: a.source, copiedAt: created.toISOString() },
        updatedById: userId(row.preparedBy),
        createdAt: created,
        updatedAt: created,
      });
    }
    const questionKeys = new Set(
      planVersion.sections.flatMap((s) => s.questions.map((q) => q.key)),
    );
    for (const [key, a] of Object.entries(row.written)) {
      if (!questionKeys.has(key)) throw new Error(`${row.key}: unknown plan question ${key}`);
      const edited = clock.ago(a.editedDaysAgo ?? row.createdDaysAgo - 1);
      const existing = world.planAnswers.find((p) => p.id === uid("plan-answer", row.key, key));
      if (existing) {
        existing.text = a.text ?? existing.text;
        existing.rows = a.rows ?? existing.rows;
        existing.updatedAt = edited;
        existing.lockVersion = 1;
      } else {
        world.planAnswers.push({
          id: uid("plan-answer", row.key, key),
          businessPlanId: id,
          questionKey: key,
          text: a.text ?? null,
          rows: a.rows ?? null,
          updatedById: userId(row.preparedBy),
          createdAt: edited,
          updatedAt: edited,
        });
      }
      answers[key] = { ...answers[key], ...a };
    }

    const itemIds = addExecutionItems(world, clock, row, id, execution[row.key]);
    records[row.key] = { key: row.key, id, idea: row.idea, answers, executionItemIds: itemIds };
  }
  return records;
}

const STATUS_DEFAULT: Record<string, "todo" | "open" | null> = {
  milestone: "todo",
  launch: "todo",
  kpi: null,
  open_question: "open",
  next_action: "todo",
};

function addExecutionItems(
  world: World,
  clock: Clock,
  row: PlanRow,
  planId: string,
  spec: ExecutionPlanSpec,
): string[] {
  const presets = versionOf(businessPlanTemplate, 1).executionPresets;
  const ids: string[] = [];
  const counters: Record<string, number> = {};
  const created = clock.ago(row.createdDaysAgo);

  const push = (
    type: "milestone" | "launch" | "kpi" | "open_question" | "next_action",
    title: string,
    fromPreset: boolean,
    base: { area?: string | null; launchTiming?: string | null },
    o: ExecutionOverride,
  ) => {
    const index = counters[type] ?? 0;
    counters[type] = index + 1;
    const id = executionItemId(row.key, type, index);
    ids.push(id);
    const status = o.status === undefined ? STATUS_DEFAULT[type] : o.status;
    const done = status === "done" || status === "resolved";
    const assignee = o.assignee ?? null;
    world.executionItems.push({
      id,
      businessPlanId: planId,
      type,
      title: o.title ?? title,
      assigneeUserId: typeof assignee === "string" ? userId(assignee) : null,
      assigneeName: assignee && typeof assignee === "object" ? assignee.name : null,
      dueDate: o.dueInDays == null ? null : clock.date(o.dueInDays),
      status: status ?? null,
      goal: o.goal ?? null,
      exitCondition: o.exitCondition ?? null,
      launchTiming: type === "launch" ? ((base.launchTiming as never) ?? "other") : null,
      actions: o.actions ?? null,
      completionCriteria: o.completionCriteria ?? null,
      kpiArea: type === "kpi" ? (base.area ?? null) : null,
      kpiTarget: o.kpiTarget ?? null,
      kpiReviewFrequency: o.kpiReviewFrequency ?? null,
      kpiActual: o.kpiActual ?? null,
      kpiActualUpdatedAt: o.kpiActual ? clock.ago(2) : null,
      whyItMatters: o.whyItMatters ?? null,
      answer: o.answer ?? null,
      fromPreset,
      completedAt: done ? clock.ago(3) : null,
      sortOrder: index,
      updatedById: userId(row.preparedBy),
      createdAt: created,
      updatedAt: created,
    });
  };

  const perType: Record<string, number> = {};
  for (const preset of presets) {
    const i = perType[preset.type] ?? 0;
    perType[preset.type] = i + 1;
    push(
      preset.type,
      preset.title,
      true,
      { area: preset.area, launchTiming: preset.launchTiming },
      spec.preset[`${preset.type}:${i}`] ?? {},
    );
  }
  for (const extra of spec.extra) {
    push(extra.type, extra.title, false, { launchTiming: "other" }, extra);
  }
  return ids;
}

/**
 * The text of an answer when a version or Go / No-Go was recorded. Edits listed in `previousText`
 * came later, so the record keeps the earlier wording and the plan shows "+ changes".
 */
export function answerAtRecord(plan: PlanRecord, questionKey: string, current: string | null) {
  return plan.answers[questionKey]?.previousText ?? current;
}

/** `plan_versions.snapshot` (SDD 6.3): answers, key metrics, scenarios, execution items, top 5 competitors. */
export function versionSnapshot(world: World, plan: PlanRecord, idea: IdeaRecord) {
  const data = idea.validation;
  const economics = computeEconomics(data.costRows, data.economics);
  const planRow = world.businessPlans.find((p) => p.id === plan.id);
  return {
    header: {
      name: planRow?.name,
      businessName: planRow?.businessName,
      preparedBy: planRow?.preparedBy,
    },
    answers: world.planAnswers
      .filter((a) => a.businessPlanId === plan.id)
      .map((a) => ({
        questionKey: a.questionKey,
        text: answerAtRecord(plan, a.questionKey, a.text ?? null),
        rows: a.rows ?? null,
      })),
    keyMetrics: buildKeyMetrics(economics, data.economics, data.costRows),
    scenarios: economics.scenarios,
    execution: world.executionItems
      .filter((e) => e.businessPlanId === plan.id)
      .map((e) => ({
        type: e.type,
        title: e.title,
        status: e.status ?? null,
        dueDate: e.dueDate ?? null,
        assigneeName: e.assigneeName ?? null,
        assigneeUserId: e.assigneeUserId ?? null,
        goal: e.goal ?? null,
        exitCondition: e.exitCondition ?? null,
        launchTiming: e.launchTiming ?? null,
        actions: e.actions ?? null,
        completionCriteria: e.completionCriteria ?? null,
        kpiArea: e.kpiArea ?? null,
        kpiTarget: e.kpiTarget ?? null,
        kpiActual: e.kpiActual ?? null,
      })),
    competitors: idea.validation.spec.competitors.slice(0, 5).map((c) => ({
      name: c.name,
      type: c.type,
      typicalPrice: c.typicalPrice,
      strength: c.strength,
      weakness: c.weakness,
    })),
  };
}
