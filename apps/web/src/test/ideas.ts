import type {
  CheckResult,
  IdeaDetail,
  IdeaSummary,
  ValidationHome,
} from "@moonx/schemas";
import { ana } from "./api";

/** BCDX, the workspace of `ana`. */
export const workspaceId = ana.lastWorkspaceId ?? "";

const anaRef = {
  id: ana.id,
  displayName: ana.displayName,
  avatarUrl: null,
  badge: null,
};

const empty = {
  value: null,
  bound: "exact" as const,
  reason: "empty" as const,
};

export const checks: CheckResult[] = [
  {
    key: "competitors",
    state: "done",
    count: 4,
    params: { min: 3, max: 5 },
    detail: null,
    link: null,
  },
  {
    key: "local_price",
    state: "done",
    count: null,
    params: { pricedCompetitors: 2, researchLogs: 1 },
    detail: null,
    link: null,
  },
  {
    key: "costs",
    state: "partial",
    count: null,
    params: {},
    detail: { emptyRows: 1, missing: [] },
    link: null,
  },
  {
    key: "break_even",
    state: "done",
    count: null,
    params: {},
    detail: { missing: [] },
    link: null,
  },
  {
    key: "permits",
    state: "not_started",
    count: null,
    params: { researchLogs: 1 },
    detail: null,
    link: {
      screen: 17,
      workspaceId,
      ideaId: "ece58aa6-e77d-4895-b5cf-e8f366bd4e46",
    },
  },
  {
    key: "demand_signal",
    state: "done",
    count: 2,
    params: { researchLogs: 1 },
    detail: null,
    link: null,
  },
];

/** An idea of BCDX as I1 lists it (SDD 5.6). */
export function ideaSummary(
  id: string,
  name: string,
  extra: Partial<IdeaSummary> = {},
): IdeaSummary {
  return {
    id,
    name,
    oneLineConcept: `${name}, in one line.`,
    proposer: anaRef,
    stage: "validation",
    latestDecision: null,
    archived: false,
    checks: checks.map(({ key, state, params }) => ({ key, state, params })),
    keyMetrics: {
      initial_cost_total: empty,
      break_even_units_day: empty,
      expected_operating_profit: empty,
      payback_months: empty,
    },
    plans: [],
    lastActivityAt: "2026-10-17T01:00:00.000Z",
    createdAt: "2026-10-01T01:00:00.000Z",
    ...extra,
  };
}

/** Bacolod Health Bowl's 13 (SDD 5.7 V1), shaped after the seed. */
export function validationHome(
  extra: Partial<IdeaDetail> = {},
): ValidationHome {
  const id = "ece58aa6-e77d-4895-b5cf-e8f366bd4e46";
  const idea: IdeaDetail = {
    ...ideaSummary(id, "Bacolod Health Bowl", { latestDecision: "hold" }),
    workspaceId,
    validationId: "1b4e28ba-2fa1-41d2-883f-0016d3cca427",
    proposedSolution: null,
    duplicatedFrom: null,
    lockVersion: 3,
    updatedAt: "2026-10-17T01:00:00.000Z",
    updatedBy: anaRef,
    ...extra,
  };
  return {
    validationId: idea.validationId,
    idea,
    template: {
      versionId: "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
      versionNumber: 1,
      newerVersion: null,
    },
    summary: {
      customer: "Office workers near Lacson St.",
      problem: null,
      solution: idea.proposedSolution,
      marketType: "Red",
    },
    keyMetrics: {
      initial_cost_total: { value: 114000, bound: "lower", reason: null },
      break_even_units_day: { value: 19.8, bound: "exact", reason: null },
      expected_operating_profit: {
        value: null,
        bound: "exact",
        reason: "needs_expected_sales",
      },
      payback_months: { value: 2.31, bound: "lower", reason: null },
    },
    economicsWarnings: [],
    nextSteps: [
      {
        kind: "add_evidence",
        count: 1,
        checkKey: null,
        sectionKey: "01",
        link: null,
      },
      {
        kind: "classify",
        count: 3,
        checkKey: null,
        sectionKey: "01",
        link: null,
      },
      {
        kind: "check",
        count: 1,
        checkKey: "costs",
        sectionKey: null,
        link: null,
      },
    ],
    checks,
    fau: {
      fact: 5,
      factNoEvidence: 1,
      assumption: { total: 37, low: 6, medium: 17, high: 14 },
      unknown: 4,
      unclassified: 3,
      empty: 13,
    },
    sections: [
      {
        key: "01",
        title: "01 Customer & Problem",
        answered: 10,
        total: 10,
        count: null,
        fau: null,
      },
      {
        key: "03",
        title: "03 Research Log",
        answered: null,
        total: null,
        count: 5,
        fau: null,
      },
      {
        key: "04",
        title: "04 Competitors",
        answered: null,
        total: null,
        count: 4,
        fau: null,
      },
      {
        key: "05",
        title: "05 Costs",
        answered: 20,
        total: 24,
        count: null,
        fau: null,
      },
      {
        key: "06-08",
        title: "06–08 Unit Economics",
        answered: 5,
        total: 7,
        count: null,
        fau: null,
      },
      {
        key: "09",
        title: "09 Assumptions & Risks",
        answered: null,
        total: null,
        count: 2,
        countB: 3,
        fau: null,
      },
    ],
    decisions: [
      {
        id: "9b2c1e5a-1111-4111-8111-111111111111",
        kind: "validation_decision",
        value: "hold",
        versionName: null,
        idea: { id, name: idea.name },
        plan: null,
        reasonExcerpt: "Permits are not checked yet.",
        recordedBy: anaRef,
        recordedAt: "2026-10-10T01:00:00.000Z",
      },
    ],
    plans: [],
    archivedPlanCount: 0,
    canAddPlan: false,
  };
}
