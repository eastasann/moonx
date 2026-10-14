import { buildKeyMetrics, evaluateValidation } from "@moonx/domain";
import type { ExecutionStatus, ExecutionType } from "@moonx/schemas";
import { asc, eq } from "drizzle-orm";
import {
  businessPlans,
  executionItems,
  planAnswers,
  planVersions,
  templateExecutionPresets,
  templateQuestions,
} from "../schema";
import {
  BCDX_WORKSPACE_ID,
  type HistoryContainer,
  type SeedContext,
  type UserKey,
  userId,
} from "./context";
import {
  type EvidenceSpec,
  validationStateAt,
  type WrittenIdea,
} from "./ideas";
import { seedId } from "./ids";
import { SEED_USERS } from "./people";
import {
  type Edit,
  firstAndLast,
  recordRevisions,
  type When,
} from "./revisions";
import { loadValidation, writerView } from "./validation-state";

type Rows = Record<string, string | number | null>[];

interface PlanAnswerState {
  text: string | null;
  rows: Rows | null;
}

/** A sub-item written on 21 after the draft. */
export interface PlanAnswerSpec {
  text?: string;
  rows?: Rows;
  /** Defaults to the plan's creator on the plan's `editedDaysAgo`. */
  edit?: When;
  /** Saves before the current one, oldest first (after the draft's copy, if any). */
  earlier?: (Partial<PlanAnswerState> & When)[];
}

/** The columns of an execution item (22) a save can set. */
export interface ExecutionFields {
  /** A workspace member, or a name written in freely. */
  assignee?: UserKey | { name: string };
  /** Due this many days after today (negative: before). */
  dueInDays?: number;
  /** Done or Resolved also stamps `completed_at` with the save's time (SDD 5.9 P10). */
  status?: ExecutionStatus;
  goal?: string;
  exitCondition?: string;
  actions?: string;
  completionCriteria?: string;
  kpiTarget?: string;
  kpiReviewFrequency?: string;
  /** Also stamps `kpi_actual_updated_at` with the save's time (SDD 5.9 P10). */
  kpiActual?: string;
  whyItMatters?: string;
  answer?: string;
}

/** One save of an execution item on 22. */
export interface ExecutionChange extends ExecutionFields {
  /** Defaults to the plan's `editedDaysAgo`. */
  daysAgo?: number;
  /** Defaults to the plan's creator. */
  by?: UserKey;
}

/** An item added on 22, saved again by each of `later`. */
export interface ExecutionSpec extends ExecutionChange {
  type: ExecutionType;
  title: string;
  later?: ExecutionChange[];
}

/** A plan (option) of an idea: drafted by M5, then written on 20–22. */
export interface PlanSpec {
  key: string;
  name: string;
  /** Renamed on 20 from the idea name M5 gives it, at `editedDaysAgo`. */
  businessName?: string;
  creator: UserKey;
  createdDaysAgo: number;
  /** When the edits without a time of their own were made. */
  editedDaysAgo: number;
  archived?: { daysAgo: number };
  answers?: Record<string, PlanAnswerSpec>;
  /** Saves of the template's starting rows on 22, by the row's title. */
  presets?: Record<string, ExecutionChange[]>;
  execution?: ExecutionSpec[];
  version?: { name: string; savedDaysAgo: number; by: UserKey };
}

/** §24, as a Go / No-Go records it. */
export interface Conditions {
  launchIf: string | null;
  delayIf: string | null;
  stopIf: string | null;
}

export interface WrittenPlan {
  planId: string;
  name: string;
  /** The saved version, for the decision log. */
  version: { id: string; name: string; savedAt: Date; by: UserKey } | null;
  /** §24 as it stood at `moment`. */
  conditionsAt: (moment: Date) => Conditions;
}

const PROBABILITY_LABELS = {
  low: "Low",
  medium: "Medium",
  high: "High",
} as const;

/** One save of anything with a history, in order. */
interface Save<State> {
  state: State;
  at: Date;
  by: UserKey;
}

/** The state `saves` had at `moment`; undefined before the first save. */
const stateAt = <State>(
  saves: readonly { state: State; at: Date }[],
  moment: Date,
) => saves.filter((save) => save.at <= moment).at(-1)?.state;

/** How M5 turns 16's evidence into the Evidence column of §21 (design-spec 6.12). */
const evidenceText = (
  idea: WrittenIdea,
  evidence: EvidenceSpec[] | undefined,
  note: string | undefined,
) =>
  [
    ...(evidence ?? []).map((piece) => {
      if (piece.url !== undefined) return piece.url;
      const log = idea.researchLogs.get(piece.log);
      return log === undefined ? null : `${log.observedOn} ${log.topic}`;
    }),
    note ?? null,
  ]
    .filter((part): part is string => part !== null && part !== "")
    .join("; ") || null;

/**
 * What M5 copies into one sub-item from the validation as it stood at `moment` (SDD 6.3
 * `copy_from`): the texts joined by a blank line, or the rows of 16's lists. Empty
 * answers are skipped; nothing copied is null.
 */
const draftCopy = (
  idea: WrittenIdea,
  copyFrom: string[],
  moment: Date,
): PlanAnswerState | null => {
  const { spec } = idea;
  if (copyFrom.includes("LIST.ASSUMPTIONS")) {
    const rows = spec.assumptions.map((assumption) => ({
      assumption: assumption.statement,
      why_we_believe_it: assumption.whyBelieve ?? null,
      evidence: evidenceText(
        idea,
        assumption.evidence,
        assumption.evidenceNote,
      ),
      what_would_disprove_it: assumption.disproveCondition ?? null,
    }));
    return rows.length === 0 ? null : { text: null, rows };
  }
  if (copyFrom.includes("LIST.RISKS")) {
    const rows = spec.risks.map((risk) => ({
      risk: risk.statement,
      probability: risk.probability
        ? PROBABILITY_LABELS[risk.probability]
        : null,
      impact: risk.impact ? PROBABILITY_LABELS[risk.impact] : null,
      mitigation: risk.mitigation ?? null,
      trigger_indicator: null,
    }));
    return rows.length === 0 ? null : { text: null, rows };
  }
  const texts = copyFrom
    .map((source) => {
      if (source === "IDEA.ONE_LINE_CONCEPT") return spec.oneLineConcept;
      if (source === "IDEA.PROPOSED_SOLUTION") return spec.proposedSolution;
      return stateAt(idea.answerSaves.get(source) ?? [], moment)?.text ?? null;
    })
    .filter((text): text is string => text !== null && text.trim() !== "");
  return texts.length === 0 ? null : { text: texts.join("\n\n"), rows: null };
};

type ExecutionRow = Omit<
  typeof executionItems.$inferInsert,
  "id" | "businessPlanId" | "sortOrder" | "fromPreset"
> & {
  type: ExecutionType;
  completedAt: Date | null;
  kpiActualUpdatedAt: Date | null;
};

/** What the history and the version snapshot hold of an execution item. */
const executionContent = (item: ExecutionRow) => ({
  type: item.type,
  title: item.title,
  assigneeUserId: item.assigneeUserId ?? null,
  assigneeName: item.assigneeName ?? null,
  dueDate: item.dueDate ?? null,
  status: item.status ?? null,
  goal: item.goal ?? null,
  exitCondition: item.exitCondition ?? null,
  launchTiming: item.launchTiming ?? null,
  actions: item.actions ?? null,
  completionCriteria: item.completionCriteria ?? null,
  kpiArea: item.kpiArea ?? null,
  kpiTarget: item.kpiTarget ?? null,
  kpiReviewFrequency: item.kpiReviewFrequency ?? null,
  kpiActual: item.kpiActual ?? null,
  whyItMatters: item.whyItMatters ?? null,
  answer: item.answer ?? null,
});

/**
 * Writes a plan as M5 drafts it (the latest plan template, the sub-items copied from the
 * validation, the starting execution rows, all in one `plan_draft` operation), then the
 * saves of the spec, then the saved version with its snapshot (SDD 6.3 末尾). Every save
 * writes its history row, and the version holds each part as it stood when saved.
 */
export async function writePlan(
  { tx, clock, templates, history, activity }: SeedContext,
  idea: WrittenIdea,
  spec: PlanSpec,
  createdFromDecisionId: string,
): Promise<WrittenPlan> {
  const planId = seedId("plan", idea.spec.key, spec.key);
  const at = (when: { daysAgo: number; hoursAgo?: number }) =>
    clock.ago(when.daysAgo, when.hoursAgo);
  const createdAt = clock.ago(spec.createdDaysAgo);
  const editedAt = clock.ago(spec.editedDaysAgo);
  const draft: Edit = {
    daysAgo: spec.createdDaysAgo,
    by: spec.creator,
    source: "plan_draft",
    batch: `plan-draft/${idea.spec.key}/${spec.key}`,
  };
  const edited: When = { daysAgo: spec.editedDaysAgo, by: spec.creator };
  const container: HistoryContainer = {
    type: "business_plan",
    id: planId,
    workspaceId: BCDX_WORKSPACE_ID,
    ownerUserId: null,
  };
  let lastActivity = createdAt;
  const touch = (moment: Date) => {
    if (moment > lastActivity) lastActivity = moment;
    activity.touch(BCDX_WORKSPACE_ID, idea.ideaId, moment);
  };
  touch(createdAt);
  /** Writes `saves` as one create row and an update row each, and returns them. */
  const record = <State>(
    sectionKey: string | null,
    target: { type: string; id: string; key?: string },
    saves: Save<State>[],
    payload: (state: State) => unknown,
    firstSource: "plan_draft" | "manual",
  ) => {
    saves.forEach((save, index) => {
      const previous = saves[index - 1];
      if (previous !== undefined && save.at <= previous.at)
        throw new Error(`${target.type} ${target.id}: saves out of order`);
      history.add({
        container,
        sectionKey,
        target,
        action: previous === undefined ? "create" : "update",
        before: previous === undefined ? null : payload(previous.state),
        after: payload(save.state),
        source: index === 0 ? firstSource : "manual",
        batch:
          index === 0 && firstSource === "plan_draft" ? draft.batch : undefined,
        by: save.by,
        at: save.at,
      });
      touch(save.at);
    });
    return saves;
  };

  // M5 names the business after the idea; the spec's own name is a later edit on 20.
  const draftHeader = {
    name: spec.name,
    businessName: idea.spec.name,
    preparedBy: SEED_USERS[spec.creator].displayName,
  };
  const headerSaves = record(
    null,
    { type: "business_plan", id: planId },
    [
      { state: draftHeader, at: createdAt, by: spec.creator },
      ...(spec.businessName === undefined ||
      spec.businessName === draftHeader.businessName
        ? []
        : [
            {
              state: { ...draftHeader, businessName: spec.businessName },
              at: editedAt,
              by: spec.creator,
            },
          ]),
    ],
    (header) => header,
    "plan_draft",
  );
  const header = headerSaves.at(-1) ?? headerSaves[0];
  if (header === undefined) throw new Error("No header");
  await tx.insert(businessPlans).values({
    id: planId,
    ideaId: idea.ideaId,
    ...header.state,
    templateVersionId: templates.plan,
    createdFromDecisionId,
    archivedAt: spec.archived === undefined ? null : at(spec.archived),
    createdById: userId(spec.creator),
    lockVersion: headerSaves.length - 1,
    updatedById: userId(header.by),
    createdAt,
    updatedAt: header.at,
  });

  const questions = await tx
    .select({
      key: templateQuestions.questionKey,
      copyFrom: templateQuestions.copyFrom,
    })
    .from(templateQuestions)
    .where(eq(templateQuestions.templateVersionId, templates.plan));
  const questionKeys = new Set(questions.map((q) => q.key));
  const copied = new Map<string, PlanAnswerState & { sources: string[] }>();
  for (const question of questions) {
    if (!Array.isArray(question.copyFrom)) continue;
    const sources = question.copyFrom as string[];
    const state = draftCopy(idea, sources, createdAt);
    if (state !== null) copied.set(question.key, { ...state, sources });
  }

  const answerSaves = new Map<string, Save<PlanAnswerState>[]>();
  const answerRows: (typeof planAnswers.$inferInsert)[] = [];
  const keys = new Set([...copied.keys(), ...Object.keys(spec.answers ?? {})]);
  for (const key of keys) {
    if (!questionKeys.has(key))
      throw new Error(`${idea.spec.key} ${spec.key}: no plan question ${key}`);
    const copy = copied.get(key);
    const written = spec.answers?.[key];
    const copyState =
      copy === undefined ? undefined : { text: copy.text, rows: copy.rows };
    const current =
      written === undefined
        ? copyState && { state: copyState, edit: draft }
        : {
            state: { text: written.text ?? null, rows: written.rows ?? null },
            edit: written.edit ?? edited,
          };
    if (current === undefined) continue;
    const earlier =
      written === undefined
        ? []
        : [
            ...(copyState === undefined ? [] : [{ ...copyState, ...draft }]),
            ...(written.earlier ?? []),
          ];
    const saves = recordRevisions(
      history,
      at,
      {
        container,
        sectionKey: key.split(".")[1] ?? null,
        target: { type: "plan_answer", id: planId, key },
      },
      current,
      earlier,
      (state) => ({ text: state.text, rows: state.rows }),
    );
    answerSaves.set(key, saves);
    const { first, last } = firstAndLast(saves);
    touch(last);
    answerRows.push({
      id: seedId("plan_answer", idea.spec.key, spec.key, key),
      businessPlanId: planId,
      questionKey: key,
      text: current.state.text,
      rows: current.state.rows,
      copiedFrom:
        copy === undefined
          ? null
          : {
              source: copy.sources.join(", "),
              copiedAt: createdAt.toISOString(),
            },
      lockVersion: saves.length,
      updatedById: userId(current.edit.by),
      createdAt: first,
      updatedAt: last,
    });
  }
  if (answerRows.length > 0) await tx.insert(planAnswers).values(answerRows);

  // The starting rows of 22 (design-spec 6.13), then the items added on 22.
  const presets = await tx
    .select()
    .from(templateExecutionPresets)
    .where(eq(templateExecutionPresets.templateVersionId, templates.plan))
    .orderBy(asc(templateExecutionPresets.sortOrder));
  for (const title of Object.keys(spec.presets ?? {}))
    if (!presets.some((preset) => preset.title === title))
      throw new Error(`${idea.spec.key} ${spec.key}: no preset ${title}`);
  /** The row after `change` is saved at `moment` onto `row`. */
  const applied = (
    row: ExecutionRow,
    change: ExecutionFields,
    moment: Date,
  ): ExecutionRow => {
    const next = { ...row };
    const { assignee, dueInDays, status, kpiActual } = change;
    for (const field of [
      "goal",
      "exitCondition",
      "actions",
      "completionCriteria",
      "kpiTarget",
      "kpiReviewFrequency",
      "whyItMatters",
      "answer",
    ] as const) {
      const value = change[field];
      if (value !== undefined) next[field] = value;
    }
    if (assignee !== undefined) {
      next.assigneeUserId =
        typeof assignee === "string" ? userId(assignee) : null;
      next.assigneeName = typeof assignee === "object" ? assignee.name : null;
    }
    if (dueInDays !== undefined) next.dueDate = clock.date(dueInDays);
    if (status !== undefined) {
      next.status = status;
      next.completedAt =
        status === "done" || status === "resolved" ? moment : null;
    }
    if (kpiActual !== undefined) {
      next.kpiActual = kpiActual;
      next.kpiActualUpdatedAt = moment;
    }
    return next;
  };
  /** The saves of an item: its first state, then each change in turn. */
  const timeline = (
    first: Save<ExecutionRow>,
    changes: readonly ExecutionChange[],
  ) => {
    const saves = [first];
    for (const change of changes) {
      const previous = saves.at(-1) ?? first;
      const moment =
        change.daysAgo === undefined ? editedAt : clock.ago(change.daysAgo);
      saves.push({
        state: applied(previous.state, change, moment),
        at: moment,
        by: change.by ?? spec.creator,
      });
    }
    return saves;
  };
  // Each type has its own statuses; a new item starts at the first (SDD 5.9 P9).
  const startStatus = (type: ExecutionType): ExecutionStatus | null =>
    type === "kpi" ? null : type === "open_question" ? "open" : "todo";
  const blank = (type: ExecutionType, title: string): ExecutionRow => ({
    type,
    title,
    assigneeUserId: null,
    assigneeName: null,
    dueDate: null,
    status: startStatus(type),
    goal: null,
    exitCondition: null,
    launchTiming: null,
    actions: null,
    completionCriteria: null,
    kpiArea: null,
    kpiTarget: null,
    kpiReviewFrequency: null,
    kpiActual: null,
    kpiActualUpdatedAt: null,
    whyItMatters: null,
    answer: null,
    completedAt: null,
  });
  const sortOrders = new Map<ExecutionType, number>();
  const nextSortOrder = (type: ExecutionType) => {
    const next = sortOrders.get(type) ?? 0;
    sortOrders.set(type, next + 1);
    return next;
  };
  const items = [
    ...presets.map((preset, index) => ({
      id: seedId("execution", idea.spec.key, spec.key, "preset", index),
      fromPreset: true,
      firstSource: "plan_draft" as const,
      saves: timeline(
        {
          state: {
            ...blank(preset.type, preset.title),
            kpiArea: preset.area,
            launchTiming: preset.launchTiming,
          },
          at: createdAt,
          by: spec.creator,
        },
        spec.presets?.[preset.title] ?? [],
      ),
    })),
    ...(spec.execution ?? []).map((item, index) => {
      const moment =
        item.daysAgo === undefined ? editedAt : clock.ago(item.daysAgo);
      return {
        id: seedId("execution", idea.spec.key, spec.key, "item", index),
        fromPreset: false,
        firstSource: "manual" as const,
        saves: timeline(
          {
            state: applied(blank(item.type, item.title), item, moment),
            at: moment,
            by: item.by ?? spec.creator,
          },
          item.later ?? [],
        ),
      };
    }),
  ].map((item) => ({
    ...item,
    sortOrder: nextSortOrder(item.saves[0]?.state.type ?? "milestone"),
  }));
  const executionSaves = items.map((item) => ({
    ...item,
    saves: record(
      "execution",
      { type: "execution_item", id: item.id },
      item.saves,
      executionContent,
      item.firstSource,
    ),
  }));
  await tx.insert(executionItems).values(
    executionSaves.map((item) => {
      const { first, last } = firstAndLast(item.saves);
      const current = item.saves.at(-1)?.state ?? blank("milestone", "");
      return {
        ...current,
        id: item.id,
        businessPlanId: planId,
        fromPreset: item.fromPreset,
        sortOrder: item.sortOrder,
        lockVersion: item.saves.length - 1,
        updatedById: userId(item.saves.at(-1)?.by ?? spec.creator),
        createdAt: first,
        updatedAt: last,
      };
    }),
  );

  const textAt = (key: string, moment: Date) =>
    stateAt(answerSaves.get(key) ?? [], moment)?.text ?? null;

  let version: WrittenPlan["version"] = null;
  if (spec.version !== undefined) {
    const savedAt = clock.ago(spec.version.savedDaysAgo);
    const loaded = await loadValidation(tx, idea.validationId);
    const state = validationStateAt(loaded.state, idea, savedAt);
    const evaluation = evaluateValidation(state, writerView(loaded));
    const snapshot = {
      header: stateAt(headerSaves, savedAt),
      answers: [...answerSaves.entries()].flatMap(([key, saves]) => {
        const saved = stateAt(saves, savedAt);
        return saved === undefined
          ? []
          : [{ questionKey: key, text: saved.text, rows: saved.rows }];
      }),
      keyMetrics: buildKeyMetrics(
        {
          costRows: state.costRows,
          inputs: Object.fromEntries(
            state.economicsInputs.map((input) => [
              input.fieldKey,
              { value: input.value, fau: input.fau },
            ]),
          ),
        },
        evaluation.economics,
      ),
      scenarios: evaluation.economics.scenarios,
      execution: executionSaves.flatMap((item) => {
        const saved = stateAt(item.saves, savedAt);
        return saved === undefined
          ? []
          : [
              {
                ...executionContent(saved),
                completedAt: saved.completedAt?.toISOString() ?? null,
                sortOrder: item.sortOrder,
              },
            ];
      }),
      competitors: idea.spec.competitors.slice(0, 5).map((competitor) => ({
        name: competitor.name,
        type: competitor.type ?? null,
        typicalPrice: competitor.typicalPrice ?? null,
        strength: competitor.strength ?? null,
        weakness: competitor.weakness ?? null,
      })),
    };
    const id = seedId("plan_version", idea.spec.key, spec.key, 1);
    await tx.insert(planVersions).values({
      id,
      businessPlanId: planId,
      versionNumber: 1,
      name: spec.version.name,
      snapshot,
      savedById: userId(spec.version.by),
      savedAt,
      createdAt: savedAt,
      updatedAt: savedAt,
    });
    touch(savedAt);
    version = { id, name: spec.version.name, savedAt, by: spec.version.by };
  }

  await tx
    .update(businessPlans)
    .set({ lastActivityAt: lastActivity })
    .where(eq(businessPlans.id, planId));

  return {
    planId,
    name: spec.name,
    version,
    conditionsAt: (moment) => ({
      launchIf: textAt("P.24.1", moment),
      delayIf: textAt("P.24.2", moment),
      stopIf: textAt("P.24.3", moment),
    }),
  };
}
