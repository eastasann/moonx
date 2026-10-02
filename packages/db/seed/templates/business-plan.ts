import data from "./business-plan.json";
import {
  type PlanReferenceSpec,
  type QuestionOptions,
  question,
  type SeedExecutionPreset,
  type SeedQuestion,
  type SeedSection,
  type SeedTemplate,
} from "./types";

const TITLES = [
  "Executive Summary",
  "Vision & Purpose",
  "Customer",
  "Problem",
  "Product / Service",
  "Market & Competition",
  "Positioning & Value Proposition",
  "Business Model",
  "Sales & Marketing",
  "Why Us",
  "Founder Roles",
  "Decision Making & Governance",
  "Ownership & Money Between Founders",
  "Legal & Company Setup",
  "Location / Facilities / Equipment",
  "Suppliers & Inventory",
  "Operations",
  "People & Hiring",
  "Technology & Systems",
  "Financial Plan",
  "Key Assumptions",
  "Key Risks",
  "Pre-launch Milestones",
  "Go / No-Go Conditions",
  "Launch Plan",
  "KPI Scorecard",
  "Review Cadence",
  "Open Questions",
  "Next Actions",
  "Pitch-ready Summary",
];

const metrics = (...keys: string[]): QuestionOptions => ({
  kind: "linked_metric",
  metricKeys: keys,
});

/** Sub-items that show numbers read from the validation (design-spec 6.12). Keyed by `P.{item}.{n}`. */
const LINKED: Record<string, QuestionOptions> = {
  "P.01.7": metrics(
    "initial_cost_total",
    "break_even_units_month",
    "expected_revenue",
    "expected_operating_profit",
    "payback_months",
  ),
  "P.08.3": metrics("selling_price"),
  "P.08.4": metrics("variable_cost_per_unit"),
  "P.08.5": metrics("contribution_margin"),
  "P.08.6": metrics("contribution_margin_rate"),
  "P.08.7": metrics("monthly_fixed_total"),
  "P.08.8": metrics("break_even_units_month", "break_even_units_day"),
  "P.08.9": metrics("scenario:expected"),
  "P.08.10": metrics("scenario:capacity"),
  "P.18.3": metrics("cost_row:monthly.salaries"),
  "P.20.1": metrics("initial_cost_total"),
  "P.20.3": metrics("monthly_fixed_total"),
  "P.20.4": metrics(
    "selling_price",
    "variable_cost_per_unit",
    "contribution_margin",
    "contribution_margin_rate",
  ),
  "P.20.5": metrics("break_even_units_month", "break_even_units_day"),
  "P.20.6": metrics("scenario:conservative"),
  "P.20.7": metrics("scenario:expected"),
  "P.20.8": metrics("scenario:strong"),
  "P.20.9": metrics("scenario:capacity"),
};

/** Sub-items drafted by copying validation answers. Sources are joined in order (design-spec 6.12). */
const COPY_FROM: Record<string, string[]> = {
  "P.01.1": ["IDEA.ONE_LINE_CONCEPT"],
  "P.01.2": ["V.01.WHO"],
  "P.01.3": ["V.01.PROBLEM"],
  "P.01.4": ["IDEA.PROPOSED_SOLUTION"],
  "P.03.1": ["V.01.WHO", "V.01.WHY_THEM"],
  "P.03.3": ["V.01.BEHAVIOR"],
  "P.03.5": ["V.01.NON_CUSTOMER"],
  "P.04.1": ["V.01.PROBLEM"],
  "P.04.2": ["V.01.FREQUENCY"],
  "P.04.3": ["V.01.SEVERITY"],
  "P.04.4": ["V.01.SWITCHING"],
  "P.05.1": ["IDEA.PROPOSED_SOLUTION"],
  "P.06.1": ["V.02.OCEAN"],
  "P.06.2": ["V.02.WHY"],
  "P.06.3": ["V.02.REACHABLE"],
  "P.06.4": ["V.02.SHARE"],
  "P.06.6": ["V.04.SURVIVOR_PATTERNS"],
  "P.21.1": ["LIST.ASSUMPTIONS"],
  "P.22.1": ["LIST.RISKS"],
};

/**
 * What an item shows next to its sub-items, always the latest value. The item's references are the
 * union of its sub-items'; each one sits on the sub-item it informs most.
 */
const REFERENCE: Record<string, PlanReferenceSpec[]> = {
  "P.02.1": [{ kind: "self_analysis", sections: ["WHY", "BE", "NOT", "ONE"] }],
  "P.03.1": [{ kind: "validation_answers", section: "01" }],
  "P.04.1": [{ kind: "validation_answers", section: "01" }],
  "P.06.1": [{ kind: "validation_answers", section: "02" }],
  "P.06.5": [{ kind: "competitors", limit: 5 }],
  "P.07.1": [{ kind: "competitors", limit: 5 }],
  "P.09.6": [{ kind: "cost_rows", keys: ["initial.launch_marketing", "monthly.marketing"] }],
  "P.10.1": [{ kind: "self_analysis", sections: ["NOW", "DO"] }],
  "P.12.1": [{ kind: "decision_log" }],
  "P.13.1": [{ kind: "totals" }],
  "P.14.3": [
    { kind: "cost_rows", keys: ["initial.permits"] },
    { kind: "research_log", tag: "permits" },
  ],
  "P.15.2": [{ kind: "cost_rows", keys: ["monthly.rent"] }],
  "P.15.3": [
    {
      kind: "cost_rows",
      keys: ["initial.equipment", "initial.renovation", "initial.lease_deposit"],
    },
  ],
  "P.15.4": [{ kind: "metrics", keys: ["capacity_units_day"] }],
  "P.16.4": [{ kind: "cost_rows", keys: ["initial.inventory", "variable.materials"] }],
  "P.17.1": [{ kind: "metrics", keys: ["operating_days", "capacity_units_day"] }],
  "P.18.2": [{ kind: "cost_rows", keys: ["variable.labor"] }],
  "P.19.1": [{ kind: "cost_rows", keys: ["initial.tech_setup", "monthly.internet"] }],
  "P.20.2": [
    { kind: "cost_rows", keys: ["initial.working_capital"] },
    { kind: "metrics", keys: ["payback_months", "simple_roi"] },
  ],
  "P.21.1": [{ kind: "assumptions" }],
  "P.22.1": [{ kind: "risks" }],
  "P.24.1": [{ kind: "go_no_go_history" }],
};

const text = (columns: [key: string, label: string][]): QuestionOptions => ({
  kind: "table",
  columns: columns.map(([key, label]) => ({ key, label, type: "text" })),
});

interface Special {
  title: string;
  options: QuestionOptions;
  example?: string | null;
}

/** Items made of one table or one execution list instead of prompts (design-spec 6.12). */
const SPECIAL: Record<number, Special> = {
  21: {
    title: "Key Assumptions",
    options: text([
      ["assumption", "Assumption"],
      ["why_believe", "Why We Believe It"],
      ["evidence", "Evidence"],
      ["disprove", "What Would Disprove It"],
    ]),
  },
  22: {
    title: "Key Risks",
    options: text([
      ["risk", "Risk"],
      ["probability", "Probability"],
      ["impact", "Impact"],
      ["mitigation", "Mitigation"],
      ["trigger_indicator", "Trigger / Indicator"],
    ]),
  },
  23: {
    title: "Pre-launch Milestones",
    options: { kind: "execution_view", executionType: "milestone" },
  },
  25: { title: "Launch Plan", options: { kind: "execution_view", executionType: "launch" } },
  26: { title: "KPI Scorecard", options: { kind: "execution_view", executionType: "kpi" } },
  28: {
    title: "Open Questions",
    options: { kind: "execution_view", executionType: "open_question" },
  },
  29: { title: "Next Actions", options: { kind: "execution_view", executionType: "next_action" } },
};

const pad = (n: number) => String(n).padStart(2, "0");

function buildSection(raw: (typeof data)[number], index: number): SeedSection {
  const no = raw.no;
  const base = (n: number) => `P.${pad(no)}.${n}`;
  const make = (
    n: number,
    label: string,
    example: string | null,
    extra: Partial<SeedQuestion> = {},
  ) =>
    question({
      key: base(n),
      title: label,
      prompt: label,
      example,
      copyFrom: COPY_FROM[base(n)] ?? null,
      reference: REFERENCE[base(n)] ?? null,
      ...extra,
    });

  const questions: SeedQuestion[] = [];
  const special = SPECIAL[no];
  if (special) {
    const answerType = special.options.kind === "table" ? "table" : "execution_view";
    questions.push(make(1, special.title, null, { answerType, options: special.options }));
  } else if (no === 11) {
    const founder = raw.items.find((i) => i.label.startsWith("Founder 1"));
    questions.push(
      make(1, "Founders", founder?.example ?? null, {
        answerType: "table",
        options: text([
          ["name", "Name"],
          ["role", "Role"],
          ["responsibilities", "Responsibilities"],
          ["authority", "Authority"],
          ["time", "Time"],
        ]),
      }),
    );
    for (const item of raw.items.filter((i) => !i.label.startsWith("Founder "))) {
      questions.push(make(questions.length + 1, item.label, item.example));
    }
  } else if (no === 13) {
    questions.push(
      make(1, "Ownership and capital", null, {
        answerType: "table",
        options: {
          kind: "table",
          columns: [
            { key: "name", label: "Name", type: "text" },
            { key: "ownership", label: "Initial ownership (%)", type: "percent" },
            { key: "capital", label: "Initial capital contribution", type: "money" },
          ],
        },
      }),
    );
    const tableRows = new Set(["Initial ownership", "Initial capital contribution"]);
    for (const item of raw.items.filter((i) => !tableRows.has(i.label))) {
      questions.push(make(questions.length + 1, item.label, item.example));
    }
  } else {
    for (const item of raw.items) {
      const n = questions.length + 1;
      const linked = LINKED[base(n)];
      questions.push(
        make(
          n,
          item.label,
          item.example,
          linked ? { answerType: "linked_metric", options: linked } : {},
        ),
      );
    }
  }

  return {
    key: pad(no),
    part: no <= 10 ? "a" : "b",
    title: TITLES[index] ?? raw.heading,
    guidance: raw.guidance,
    questions,
  };
}

/** Initial execution rows (design-spec 6.13). */
const executionPresets: SeedExecutionPreset[] = [
  ...[
    "Business decision",
    "Legal / company setup",
    "Location / supplier readiness",
    "Product / service readiness",
    "Team readiness",
    "Launch readiness",
  ].map((title) => ({ type: "milestone" as const, title, area: null, launchTiming: null })),
  ...(
    [
      ["30 days before launch", "t_minus_30"],
      ["7 days before launch", "t_minus_7"],
      ["Launch day", "launch_day"],
      ["First 30 days", "first_30"],
      ["Days 31–90", "days_31_90"],
    ] as const
  ).map(([title, launchTiming]) => ({ type: "launch" as const, title, area: null, launchTiming })),
  ...(
    [
      ["Financial", ["Revenue", "Operating Profit", "Contribution Margin", "Cash Balance"]],
      [
        "Customer",
        ["Orders / Customers per Day", "Repeat Rate", "Average Order Value", "Complaints"],
      ],
      [
        "Operations",
        ["Capacity Utilization", "Waste / Defect Rate", "Service Time", "Staffing Cost"],
      ],
    ] as const
  ).flatMap(([area, kpis]) =>
    kpis.map((title) => ({ type: "kpi" as const, title, area, launchTiming: null })),
  ),
];

/** Business Plan v1, transcribed from `docs/drive-templates/business-plan.txt` (design-spec 9.3). */
export const businessPlanTemplate: SeedTemplate = {
  kind: "business_plan",
  name: "Business Plan",
  versions: [
    {
      versionNumber: 1,
      status: "published",
      // The Drive document has no AI prompt for the plan; operators write it in 27.
      aiPrompt: "",
      sections: data.map(buildSection),
      costDefaults: [],
      checkRules: [],
      executionPresets,
    },
  ],
};
