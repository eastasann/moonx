import type { KeyMetrics, MetricValue, ScenarioColumn, TemplateQuestion } from "@moonx/schemas";
import type { PlanAnswer, PlanHome, PlanItem, PlanReference, PlanRow } from "../src/lib/plans";
import { IDEA_ID } from "./question-fixtures";
import type { Handler } from "./support";
import { WORKSPACE } from "./support";
import {
  type ExecutionApiOptions,
  executionApi,
  PLAN,
  PLAN_ID,
  planHome,
  VERSION_ID,
} from "./support-execution";

export { PLAN, PLAN_ID, VERSION_ID };

export const ITEM_PATH = (itemNo: number, search = "") =>
  `/w/${WORKSPACE}/ideas/${IDEA_ID}/plans/${PLAN_ID}/items/${itemNo}${search}`;
export const ANSWER = (key: string) => `PUT ${PLAN}/answers/${key}`;

export function question(
  itemNo: number,
  n: number,
  title: string,
  overrides: Partial<TemplateQuestion> = {},
): TemplateQuestion {
  const section = String(itemNo).padStart(2, "0");
  return {
    key: `P.${section}.${n}`,
    sectionKey: section,
    title,
    prompt: `Prompt of ${title}`,
    example: null,
    hint: null,
    answerType: "long_text",
    options: null,
    displayCondition: null,
    hasFau: false,
    ...overrides,
  };
}

export function answer(key: string, overrides: Partial<PlanAnswer> = {}): PlanAnswer {
  return {
    questionKey: key,
    text: null,
    rows: null,
    copiedFrom: null,
    commentCount: 0,
    lockVersion: 0,
    updatedAt: null,
    updatedBy: null,
    ...overrides,
  };
}

export const metric = (
  value: number | null,
  overrides: Partial<MetricValue> = {},
): MetricValue => ({
  value,
  bound: "exact",
  reason: value === null ? "empty" : null,
  ...overrides,
});

export const METRICS: KeyMetrics = {
  initial_cost_total: metric(169_500),
  break_even_units_month: metric(208),
  expected_revenue: metric(120_000),
  expected_operating_profit: metric(18_490),
  payback_months: metric(9.2),
  selling_price: metric(450),
  monthly_fixed_total: metric(null, { reason: "needs_monthly_costs" }),
  "cost_row:monthly.salaries": metric(30_000),
};

const scenario = (key: ScenarioColumn["key"], units: number): ScenarioColumn => ({
  key,
  unitsPerDay: metric(units),
  unitsPerMonth: metric(units * 26),
  revenue: metric(units * 26 * 450),
  variableCostTotal: metric(units * 26 * 200),
  operatingProfit: metric(18_490),
  operatingMargin: metric(0.31),
  exceedsCapacity: false,
});

export const SCENARIOS: ScenarioColumn[] = [
  scenario("break_even", 8),
  scenario("conservative", 10),
  scenario("expected", 14),
  scenario("strong", 20),
  scenario("capacity", 30),
];

export function planItem(
  itemNo: number,
  title: string,
  prompts: TemplateQuestion[],
  overrides: Partial<PlanItem> = {},
): PlanItem {
  return {
    itemNo,
    title,
    guidance: null,
    readOnly: false,
    prompts,
    answers: prompts
      .filter((p) => p.answerType !== "linked_metric" && p.answerType !== "execution_view")
      .map((p) => answer(p.key)),
    metrics: METRICS,
    scenarios: SCENARIOS,
    execution: [],
    references: [],
    ...overrides,
  };
}

const TABLE_13 = question(13, 1, "Ownership and capital", {
  answerType: "table",
  options: {
    kind: "table",
    columns: [
      { key: "name", label: "Name", type: "text" },
      { key: "ownership", label: "Initial ownership (%)", type: "percent" },
      { key: "capital", label: "Initial capital contribution", type: "money" },
    ],
  },
});

export const ITEM_1 = planItem(
  1,
  "Executive Summary",
  [
    question(1, 1, "What is the business?", { example: "A gift box shop for Bacolod." }),
    question(1, 2, "Who is the primary customer?", { answerType: "short_text" }),
    question(1, 5, "Is it ready?", {
      answerType: "choice",
      options: { kind: "choice", choices: ["Yes", "Not yet"] },
    }),
    question(1, 7, "Key numbers", {
      answerType: "linked_metric",
      options: {
        kind: "linked_metric",
        metricKeys: [
          "initial_cost_total",
          "break_even_units_month",
          "expected_revenue",
          "payback_months",
        ],
      },
    }),
  ],
  {
    guidance: "Summarise the plan in one page.",
    answers: [
      answer("P.01.1", {
        text: "Piaya gift boxes",
        lockVersion: 2,
        copiedFrom: { source: "IDEA.ONE_LINE_CONCEPT", copiedAt: "2026-09-20T02:00:00.000Z" },
        commentCount: 2,
      }),
      answer("P.01.2"),
      answer("P.01.5"),
    ],
  },
);

export const ITEM_13 = planItem(
  13,
  "Ownership & Money Between Founders",
  [TABLE_13, question(13, 2, "Founder compensation at launch")],
  {
    answers: [
      answer("P.13.1", {
        lockVersion: 3,
        rows: [
          { name: "Ana", ownership: 0.4, capital: 100_000 },
          { name: "Paolo", ownership: 0.6, capital: 50_000 },
        ],
      }),
      answer("P.13.2"),
    ],
    references: [
      { kind: "totals", title: "Totals", data: { ownership: 1, capital: 150_000 }, link: null },
    ],
  },
);

export const ITEM_11 = planItem(11, "Founder Roles", [
  question(11, 1, "Founders", {
    answerType: "table",
    options: {
      kind: "table",
      columns: [
        { key: "name", label: "Name", type: "text" },
        { key: "time", label: "Time (days per week)", type: "number" },
      ],
    },
  }),
]);

export const ITEM_8 = planItem(8, "Business Model", [
  question(8, 1, "Primary revenue stream"),
  question(8, 3, "Average selling price", {
    answerType: "linked_metric",
    options: { kind: "linked_metric", metricKeys: ["selling_price"] },
  }),
  question(8, 9, "Expected scenario", {
    answerType: "linked_metric",
    options: { kind: "linked_metric", metricKeys: ["scenario:expected"] },
  }),
  question(8, 7, "Monthly fixed cost", {
    answerType: "linked_metric",
    options: { kind: "linked_metric", metricKeys: ["monthly_fixed_total"] },
  }),
]);

export const ITEM_18 = planItem(18, "People & Hiring", [
  question(18, 3, "Expected monthly payroll", {
    answerType: "linked_metric",
    options: { kind: "linked_metric", metricKeys: ["cost_row:monthly.salaries"] },
  }),
]);

export const ITEM_23 = planItem(23, "Pre-launch Milestones", [
  question(23, 1, "Pre-launch milestones", {
    answerType: "execution_view",
    options: { kind: "execution_view", executionType: "milestone" },
    example: "Business decision: decide to go.",
  }),
]);

const USER_ANA = {
  id: "44444444-4444-4444-8444-444444444444",
  displayName: "Ana Villanueva",
  avatarUrl: null,
  badge: null,
};
const USER_PAOLO = {
  id: "55555555-0000-4000-8000-000000000001",
  displayName: "Paolo Reyes",
  avatarUrl: null,
  badge: null,
};

const reference = (
  kind: PlanReference["kind"],
  title: string,
  data: unknown,
  link: PlanReference["link"] = null,
): PlanReference => ({ kind, title, data, link });

const LINK = { workspaceId: WORKSPACE, ideaId: IDEA_ID };

export const ITEM_2 = planItem(
  2,
  "Vision & Purpose",
  [question(2, 1, "Why should this business exist?")],
  {
    references: [
      reference(
        "self_analysis",
        "Self analysis",
        [
          {
            user: USER_ANA,
            sections: [
              {
                key: "WHY",
                title: "Why",
                answers: [
                  { questionKey: "SA.WHY.1", title: "Why me", text: "Ana's reason", amount: null },
                ],
              },
            ],
          },
          {
            user: USER_PAOLO,
            sections: [
              {
                key: "WHY",
                title: "Why",
                answers: [
                  {
                    questionKey: "SA.WHY.1",
                    title: "Why me",
                    text: "Paolo's reason",
                    amount: null,
                  },
                ],
              },
            ],
          },
        ],
        { screen: 12, workspaceId: WORKSPACE },
      ),
    ],
  },
);

export const ITEM_14 = planItem(
  14,
  "Legal & Company Setup",
  [question(14, 1, "Company structure")],
  {
    references: [
      reference(
        "validation_answers",
        "Validation answers",
        [
          { questionKey: "V.01.WHO", title: "WHO", text: "Offices in Bacolod" },
          { questionKey: "V.01.PROBLEM", title: "PROBLEM", text: null },
        ],
        { screen: 11, ...LINK, sectionKey: "01" },
      ),
      reference(
        "competitors",
        "Competitors",
        [
          {
            id: "c1",
            name: "Gift Hub",
            type: "direct",
            typicalPrice: 500,
            strength: "Brand",
            weakness: null,
          },
        ],
        { screen: 15, ...LINK },
      ),
      reference(
        "cost_rows",
        "Cost rows",
        [
          {
            id: "r1",
            key: "monthly.rent",
            name: "Rent",
            category: "monthly",
            inputMode: "amount",
            amount: 25_000,
            percent: null,
          },
          {
            id: "r2",
            key: "variable.fees",
            name: "Card fees",
            category: "variable",
            inputMode: "percent_of_price",
            amount: null,
            percent: 0.03,
          },
        ],
        { screen: 17, ...LINK },
      ),
      reference(
        "research_log",
        "Research log",
        [
          {
            id: "l1",
            observedOn: "2026-09-10",
            topic: "Permit office visit",
            sourceType: "store_observation",
          },
        ],
        { screen: 14, ...LINK },
      ),
      reference(
        "assumptions",
        "Key assumptions",
        [
          {
            id: "a1",
            statement: "Offices order monthly",
            whyBelieve: "Three said so",
            evidenceNote: null,
            confidence: "medium",
            disproveCondition: null,
          },
        ],
        { screen: 16, ...LINK },
      ),
      reference(
        "risks",
        "Key risks",
        [
          {
            id: "k1",
            statement: "Permit delay",
            probability: "high",
            impact: "medium",
            mitigation: "Apply early",
          },
        ],
        { screen: 16, ...LINK },
      ),
      reference(
        "decision_log",
        "Decision log",
        [
          {
            id: "d1",
            kind: "validation_decision",
            value: "proceed",
            versionName: null,
            idea: { id: IDEA_ID, name: "Piaya" },
            plan: null,
            reasonExcerpt: "Numbers work",
            recordedBy: USER_ANA,
            recordedAt: "2026-09-28T02:00:00.000Z",
          },
        ],
        { screen: 7, workspaceId: WORKSPACE },
      ),
      reference(
        "metrics",
        "Key numbers",
        { payback_months: metric(9.2), capacity_units_day: metric(null) },
        {
          screen: 18,
          ...LINK,
        },
      ),
    ],
  },
);

export const ALL_ITEMS: Record<number, PlanItem> = Object.fromEntries(
  [ITEM_1, ITEM_2, ITEM_8, ITEM_11, ITEM_13, ITEM_14, ITEM_18, ITEM_23].map((item) => [
    item.itemNo,
    item,
  ]),
);

export interface PlanItemApiOptions extends ExecutionApiOptions {
  /** The plan items by number; `items` is the execution rows. */
  planItems?: Record<number, PlanItem>;
  /** The home the plan answers with; `viewingVersion` is set for a `?versionId=` request. */
  home?: Partial<PlanHome>;
  /** What `?versionId=` returns for an item, read only. */
  versionItems?: Record<number, PlanItem>;
}

/** The stub of screen 21: the plan, its items, and a PUT for each answer that echoes it saved. */
export function planItemApi(extra: Record<string, Handler> = {}, options: PlanItemApiOptions = {}) {
  const items = options.planItems ?? ALL_ITEMS;
  const handlers: Record<string, Handler> = {
    [`GET ${PLAN}`]: ({ url }) => {
      const versionId = url.searchParams.get("versionId");
      return {
        body: planHome({
          archived: options.planArchived ?? false,
          ideaArchived: options.archived ?? false,
          ...(versionId
            ? {
                viewingVersion: {
                  id: versionId,
                  name: "v1 For advisors",
                  savedAt: "2026-09-20T02:00:00.000Z",
                },
              }
            : {}),
          ...options.home,
        }),
      };
    },
  };
  for (const [no, item] of Object.entries(items)) {
    handlers[`GET ${PLAN}/items/${no}`] = ({ url }) => {
      const versionId = url.searchParams.get("versionId");
      const fixed = versionId ? options.versionItems?.[Number(no)] : undefined;
      return { body: fixed ?? item };
    };
    for (const prompt of item.prompts) {
      handlers[ANSWER(prompt.key)] = ({ body }) => {
        const sent = body as { text?: string | null; rows?: PlanRow[] | null; lockVersion: number };
        return {
          body: answer(prompt.key, {
            text: sent.text ?? null,
            rows: sent.rows ?? null,
            lockVersion: sent.lockVersion + 1,
          }),
        };
      };
    }
  }
  return executionApi({ ...handlers, ...extra }, options);
}
