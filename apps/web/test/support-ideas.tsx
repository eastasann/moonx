import type { IdeaSummary } from "../src/lib/ideas";
import { WORKSPACE } from "./support";

export const ANA = "44444444-4444-4444-8444-444444444444";
export const KENJI = "66666666-6666-4666-8666-666666666666";

export const IDEA_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const IDEA_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

/** An IdeaSummary as I1 returns it, with every check done unless `checks` says otherwise. */
export function makeIdea(overrides: Partial<IdeaSummary> = {}): IdeaSummary {
  return {
    id: IDEA_A,
    name: "Piaya Gift Box Delivery",
    oneLineConcept: "Boxed piaya delivered to Manila offices",
    proposer: { id: ANA, displayName: "Ana Villanueva", avatarUrl: null, badge: null },
    stage: "planning",
    latestDecision: "proceed",
    archived: false,
    checks: [
      { key: "competitors", state: "done", params: { min: 3, max: 5 } },
      { key: "local_price", state: "done", params: { pricedCompetitors: 2, researchLogs: 1 } },
      { key: "costs", state: "done", params: {} },
      { key: "break_even", state: "done", params: {} },
      { key: "permits", state: "done", params: { researchLogs: 1 } },
      { key: "demand_signal", state: "done", params: { researchLogs: 1 } },
    ],
    keyMetrics: {
      initial_cost_total: { value: 450000, bound: "lower", reason: null },
      break_even_units_day: { value: 13, bound: "exact", reason: null },
      expected_operating_profit: { value: null, bound: "exact", reason: "needs_price" },
      payback_months: { value: 9.2, bound: "exact", reason: null },
    },
    plans: [
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        name: "Gift box plan",
        latestVersionName: "v1 For advisors",
        latestGoNoGo: "launch",
      },
    ],
    lastActivityAt: hoursAgo(2),
    createdAt: hoursAgo(48),
    ...overrides,
  };
}

export const BACOLOD = makeIdea({
  id: IDEA_B,
  name: "Bacolod Health Bowl",
  oneLineConcept: "Healthy rice bowls for office lunch",
  proposer: { id: KENJI, displayName: "Kenji Ito", avatarUrl: null, badge: null },
  stage: "validation",
  latestDecision: "hold",
  checks: [
    { key: "competitors", state: "partial", params: { min: 3, max: 5 } },
    { key: "local_price", state: "done", params: { pricedCompetitors: 2, researchLogs: 1 } },
    { key: "costs", state: "partial", params: {} },
    { key: "break_even", state: "done", params: {} },
    { key: "permits", state: "not_started", params: { researchLogs: 1 } },
    { key: "demand_signal", state: "done", params: { researchLogs: 1 } },
  ],
  plans: [],
  lastActivityAt: hoursAgo(26),
});

export const IDEAS_PATH = `/api/v1/workspaces/${WORKSPACE}/ideas`;

export const MEMBERS = {
  items: [
    {
      user: { id: ANA, displayName: "Ana Villanueva", avatarUrl: null, badge: null },
      email: null,
      role: "owner",
      joinedAt: "2026-01-01T00:00:00.000Z",
      isPersonalOwner: false,
    },
    {
      user: { id: KENJI, displayName: "Kenji Ito", avatarUrl: null, badge: null },
      email: null,
      role: "member",
      joinedAt: "2026-01-02T00:00:00.000Z",
      isPersonalOwner: false,
    },
  ],
};
