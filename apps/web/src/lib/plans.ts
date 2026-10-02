import type {
  DecisionValue,
  ExecutionStatus,
  ExecutionType,
  GoNoGoValue,
  KeyMetrics,
  LaunchTiming,
  LinkTarget,
  PitchDeck,
  PitchVariant,
  ScenarioColumn,
  Stage,
  TemplateQuestion,
  TemplateRef,
  UserRef,
  Versioned,
} from "@moonx/schemas";
import { queryOptions, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { planKey } from "./ai-exchange";
import { sendJson } from "./api";
import { DASHBOARD_KEY } from "./dashboard";
import { DECISION_LOG_KEY } from "./decision";
import { IDEAS_KEY } from "./idea-actions";

// The plan screens read and write with `sendJson`, not Treaty: Treaty turns a text that looks like
// a date into a `Date`, which would change an answer or a table cell a person typed.

/** SDD 5.9 PlanSummary. */
export interface PlanSummary {
  id: string;
  name: string;
  archived: boolean;
  latestVersion: { id: string; name: string; savedAt: string } | null;
  hasChangesSinceVersion: boolean;
  latestGoNoGo: { value: GoNoGoValue; recordedAt: string; recordedBy: UserRef } | null;
}

/** SDD 5.9 PlanVersionSummary. */
export interface PlanVersionSummary {
  id: string;
  versionNumber: number;
  name: string;
  savedBy: UserRef;
  savedAt: string;
}

/** The numbers the plan home shows (design-spec 6.12). */
export type PlanHomeMetricKey =
  | "initial_cost_total"
  | "break_even_units_day"
  | "expected_operating_profit"
  | "payback_months";

/** SDD 5.9 PlanHome. */
export interface PlanHome extends PlanSummary, Versioned {
  ideaId: string;
  workspaceId: string;
  template: TemplateRef;
  businessName: string;
  preparedBy: string;
  date: string;
  latestDecision: DecisionValue | null;
  ideaArchived: boolean;
  draftOnly: boolean;
  viewingVersion: { id: string; name: string; savedAt: string } | null;
  keyMetrics: Pick<KeyMetrics, PlanHomeMetricKey>;
  versions: PlanVersionSummary[];
  execution: { dueSoon: number; overdue: number };
  parts: {
    part: "a" | "b";
    completeItems: number;
    totalItems: number;
    items: {
      itemNo: number;
      title: string;
      marks: ("V" | "S")[];
      filled: number;
      total: number;
      commentCount: number;
    }[];
  }[];
}

export type PlanRow = Record<string, string | number | null>;

/** SDD 5.9 PlanAnswer. */
export interface PlanAnswer extends Versioned {
  questionKey: string;
  text: string | null;
  rows: PlanRow[] | null;
  copiedFrom: { source: string; copiedAt: string } | null;
  commentCount: number;
}

/** SDD 5.9 ExecutionItem. */
export interface ExecutionItem extends Versioned {
  id: string;
  type: ExecutionType;
  title: string;
  assignee: { user: UserRef } | { name: string } | null;
  dueDate: string | null;
  status: ExecutionStatus | null;
  overdue: boolean;
  goal: string | null;
  exitCondition: string | null;
  launchTiming: LaunchTiming | null;
  actions: string | null;
  completionCriteria: string | null;
  kpiArea: string | null;
  kpiTarget: string | null;
  kpiReviewFrequency: string | null;
  kpiActual: string | null;
  kpiActualUpdatedAt: string | null;
  whyItMatters: string | null;
  answer: string | null;
  fromPreset: boolean;
  completedAt: string | null;
  sortOrder: number;
  commentCount: number;
}

/** A row the references of an item show; `data` has the shape of its `kind` (SDD 5.9). */
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

/** SDD 5.9 PlanItem. */
export interface PlanItem {
  itemNo: number;
  title: string;
  guidance: string | null;
  readOnly: boolean;
  prompts: TemplateQuestion[];
  answers: PlanAnswer[];
  metrics: KeyMetrics;
  scenarios: ScenarioColumn[];
  execution: ExecutionItem[];
  references: PlanReference[];
}

/** SDD 5.11 DecisionLogSummary. */
export interface DecisionLogSummary {
  id: string;
  kind: "validation_decision" | "go_no_go" | "version_saved";
  value: DecisionValue | GoNoGoValue | null;
  versionName: string | null;
  idea: { id: string; name: string };
  plan: { id: string; name: string } | null;
  reasonExcerpt: string | null;
  recordedBy: UserRef;
  recordedAt: string;
}

/** P7: what the Go / No-Go sheet shows. */
export interface GoNoGoContext {
  conditions: { launchIf: string | null; delayIf: string | null; stopIf: string | null };
  keyMetrics: KeyMetrics;
  currentVersion: PlanVersionSummary | null;
  hasChangesSinceVersion: boolean;
  history: DecisionLogSummary[];
}

/** Screen 20's search (SDD 4): `version` is a saved version shown read only. */
export const planHomeSearchSchema = z.object({
  version: z.uuid().optional().catch(undefined),
});
export type PlanHomeSearch = z.infer<typeof planHomeSearchSchema>;

/** Screen 21's search: `q` is the sub-item to open on, `version` as on screen 20. */
export const planItemSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
  version: z.uuid().optional().catch(undefined),
});
export type PlanItemSearch = z.infer<typeof planItemSearchSchema>;

/** The five tabs of screen 22, in the order they show. */
export const EXECUTION_TABS = ["milestones", "launch", "kpis", "questions", "actions"] as const;
export type ExecutionTab = (typeof EXECUTION_TABS)[number];

/** The execution type each tab lists. */
export const EXECUTION_TYPE_OF_TAB: Record<ExecutionTab, ExecutionType> = {
  milestones: "milestone",
  launch: "launch",
  kpis: "kpi",
  questions: "open_question",
  actions: "next_action",
};

/** Screen 22's search (SDD 4): the tab, the item open on the right, and Next Actions' filters. */
export const executionSearchSchema = z.object({
  tab: z.enum(EXECUTION_TABS).optional().catch(undefined),
  item: z.uuid().optional().catch(undefined),
  assignee: z
    .union([z.literal("me"), z.uuid()])
    .optional()
    .catch(undefined),
  status: z.enum(["todo", "doing", "done"]).optional().catch(undefined),
});
export type ExecutionSearch = z.infer<typeof executionSearchSchema>;

/** Screen 23's search (SDD 4): the length of the deck and the version it is made from. */
export const pitchSearchSchema = z.object({
  variant: z.enum(["one", "five"]).optional().catch(undefined),
  version: z.uuid().optional().catch(undefined),
});
export type PitchSearch = z.infer<typeof pitchSearchSchema>;

const planUrl = (planId: string) => `/api/v1/plans/${planId}`;

/** Where the plans of one idea are listed; under the ideas key, so idea actions refresh them. */
export const ideaPlansKey = (ideaId: string) => [...IDEAS_KEY, "plans", ideaId] as const;

/** `?version=` of the plan screens names a saved version to show read only. */
export const planHomeKey = (planId: string, versionId?: string) =>
  [...planKey(planId), "home", versionId ?? null] as const;

/** P1 GET, archived plans included: the plan switcher groups them under "Archived". */
export const ideaPlansQuery = (ideaId: string) =>
  queryOptions({
    queryKey: ideaPlansKey(ideaId),
    queryFn: () =>
      sendJson<{ items: PlanSummary[] }>(
        "GET",
        `/api/v1/ideas/${ideaId}/plans?includeArchived=true`,
      ),
  });

export const planHomeQuery = (planId: string, versionId?: string) =>
  queryOptions({
    queryKey: planHomeKey(planId, versionId),
    queryFn: () =>
      sendJson<PlanHome>(
        "GET",
        `${planUrl(planId)}${versionId ? `?${new URLSearchParams({ versionId })}` : ""}`,
      ),
  });

export const planItemQuery = (planId: string, itemNo: number, versionId?: string) =>
  queryOptions({
    queryKey: [...planKey(planId), "item", itemNo, versionId ?? null] as const,
    queryFn: () =>
      sendJson<PlanItem>(
        "GET",
        `${planUrl(planId)}/items/${itemNo}${versionId ? `?${new URLSearchParams({ versionId })}` : ""}`,
      ),
  });

/** P9 GET: every item of one type, in the order the server returns (Next Actions by due date). */
export const executionItemsKey = (planId: string, type: ExecutionType) =>
  [...planKey(planId), "execution", type] as const;

export const executionItemsQuery = (planId: string, type: ExecutionType) =>
  queryOptions({
    queryKey: executionItemsKey(planId, type),
    queryFn: () =>
      sendJson<{ items: ExecutionItem[] }>(
        "GET",
        `${planUrl(planId)}/execution-items?${new URLSearchParams({ type })}`,
      ),
  });

/** P7 GET. Always read again on open: a version saved a moment ago changes what is shown. */
export const goNoGoContextQuery = (planId: string) =>
  queryOptions({
    queryKey: [...planKey(planId), "go-no-go-context"] as const,
    queryFn: () => sendJson<GoNoGoContext>("GET", `${planUrl(planId)}/go-no-go-context`),
    staleTime: 0,
    gcTime: 0,
  });

export const pitchDeckQuery = (planId: string, variant: PitchVariant, versionId?: string) =>
  queryOptions({
    queryKey: [...planKey(planId), "pitch-deck", variant, versionId ?? null] as const,
    queryFn: () =>
      sendJson<PitchDeck>(
        "GET",
        `${planUrl(planId)}/pitch-deck?${new URLSearchParams({
          variant,
          ...(versionId ? { versionId } : {}),
        })}`,
      ),
  });

/** The query string shared by P12 and P13. */
export const pitchDeckPdfUrl = (planId: string, variant: PitchVariant, versionId?: string) =>
  `${planUrl(planId)}/pitch-deck.pdf?${new URLSearchParams({
    variant,
    ...(versionId ? { versionId } : {}),
  })}`;

/** The Web paths of the plan screens (SDD 4). */
export const planPaths = (workspaceId: string, ideaId: string, planId: string) => {
  const base = `/w/${workspaceId}/ideas/${ideaId}/plans/${planId}`;
  return {
    home: base,
    item: (itemNo: number) => `${base}/items/${itemNo}`,
    execution: `${base}/execution`,
    pitch: `${base}/pitch`,
  };
};

/**
 * Everything a change to a plan can touch, refreshed with one call: the plan's own queries, the
 * idea's lists (the home's plan rows, the stage), the decision log, notifications and the
 * dashboard (due soon, activity).
 */
export function usePlanRefresh() {
  const queryClient = useQueryClient();
  return (planId: string) =>
    Promise.all(
      [planKey(planId), IDEAS_KEY, DECISION_LOG_KEY, ["notifications"], DASHBOARD_KEY].map(
        (queryKey) => queryClient.invalidateQueries({ queryKey }),
      ),
    );
}

export type { Stage };
