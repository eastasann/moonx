import {
  type CheckKey,
  question,
  type SeedCostDefault,
  type SeedQuestion,
  type SeedSection,
  type SeedTemplate,
  type SeedTemplateVersion,
} from "./types";

type QA = [key: string, title: string, prompt: string];

const q = (sectionKey: string, [key, title, prompt]: QA, extra: Partial<SeedQuestion> = {}) =>
  question({ key: `V.${sectionKey}.${key}`, title, prompt, hasFau: true, ...extra });

const RED = { "V.02.OCEAN": ["Red", "Mixed"] };
const BLUE = { "V.02.OCEAN": ["Blue", "Mixed"] };

/** Added in v2 and v3: neither exists in the Drive workbook (design-spec 8.4). */
const V2_QUESTION = q("01", ["REACH", "REACH", "How will you reach this customer?"]);
const V3_QUESTION = q("10", [
  "NEXT_STEP",
  "NEXT STEP",
  "What is the next step to reduce the biggest unknown?",
]);

const v1Sections = (): SeedSection[] => [
  {
    key: "01",
    part: null,
    title: "Customer & Problem",
    guidance:
      "Define exactly who pays, what problem recurs, and why they would change behavior. Use evidence where possible.",
    questions: [
      q("01", ["WHO", "WHO", "Who is the primary paying customer?"]),
      q("01", ["WHY_THEM", "WHY THEM", "Why is this customer attractive?"]),
      q("01", ["BEHAVIOR", "BEHAVIOR", "What do they do today instead?"]),
      q("01", ["PROBLEM", "PROBLEM", "What problem are we solving?"]),
      q("01", ["FREQUENCY", "FREQUENCY", "How often does the problem occur?"]),
      q("01", ["SEVERITY", "SEVERITY", "How painful or costly is it?"]),
      q("01", ["PAYMENT", "PAYMENT", "Why would the customer pay?"]),
      q("01", ["SWITCHING", "SWITCHING", "What would make them switch from current alternatives?"]),
      q("01", ["NON_CUSTOMER", "NON-CUSTOMER", "Who is probably NOT the customer?"]),
      q("01", ["PROOF", "PROOF", "What evidence suggests this customer and problem exist?"]),
    ],
  },
  {
    key: "02",
    part: null,
    title: "Market",
    guidance:
      "Judge whether this is Red, Blue, or Mixed—and explain why. Competition is evidence to study, not automatically a negative.",
    questions: [
      q("02", ["CATEGORY", "CATEGORY", "How would you classify the market?"], {
        answerType: "short_text",
      }),
      q("02", ["OCEAN", "OCEAN", "Red, Blue, or Mixed?"], {
        answerType: "choice",
        options: { kind: "choice", choices: ["Red", "Blue", "Mixed"] },
      }),
      q("02", ["WHY", "WHY", "Why did you choose that classification?"]),
      q("02", ["DRIVERS", "DRIVERS", "What trends could increase demand?"]),
      q("02", ["BARRIERS", "BARRIERS", "What could limit growth or entry?"]),
      q("02", ["RED_1", "RED: SURVIVORS", "Which competitors appear to be surviving?"], {
        displayCondition: RED,
      }),
      q("02", ["RED_2", "RED: WHY", "Why are they still alive?"], { displayCondition: RED }),
      q("02", ["RED_3", "RED: ECONOMICS", "What appears to be their economic engine?"], {
        displayCondition: RED,
      }),
      q("02", ["RED_4", "RED: FAILURE", "Why do competitors fail?"], { displayCondition: RED }),
      q("02", ["BLUE_1", "BLUE: GAP", "If Blue/Mixed, what is underserved?"], {
        displayCondition: BLUE,
      }),
      q("02", ["BLUE_2", "BLUE: WHY EMPTY", "Why has nobody already captured this?"], {
        displayCondition: BLUE,
      }),
      q("02", ["BLUE_3", "BLUE: PROOF", "Why is this an opportunity rather than no demand?"], {
        displayCondition: BLUE,
      }),
      q("02", ["MARKET_SIZE", "MARKET SIZE", "How many potential customers might exist?"]),
      q("02", ["REACHABLE", "REACHABLE", "How many can we realistically reach at launch?"]),
      q("02", ["SHARE", "SHARE", "What share / active-customer count is required for break-even?"]),
    ],
  },
  {
    key: "04",
    part: null,
    title: "Competitors & Substitutes",
    guidance:
      "Study not only direct competitors, but also substitutes customers already use. Focus on why surviving businesses continue to work.",
    questions: [
      q("04", ["SURVIVOR_PATTERNS", "Survivor Patterns", "Survivor Patterns"]),
      q("04", ["FAILURE_PATTERNS", "Failure Patterns", "Failure Patterns"]),
    ],
  },
  {
    key: "08",
    part: null,
    title: "Investment Return",
    guidance:
      "Return is only attractive if the assumptions behind Expected volume and profit are credible. Treat this as simple screening, not formal valuation.",
    questions: [q("08", ["WORTH", "WORTH", "Is the return worth the capital and effort?"])],
  },
  {
    key: "10",
    part: null,
    title: "Final Assessment",
    guidance:
      "Answer these after the rest of the workbook. Proceed means 'worth deeper planning', not approval to launch.",
    questions: [
      q("10", ["WHY_WORK", "WHY WORK", "Why might this work?"]),
      q("10", ["WHY_FAIL", "WHY FAIL", "Why might this fail?"]),
      q("10", ["MUST_BE_TRUE", "MUST BE TRUE", "What must be true?"]),
      q("10", ["BIGGEST_UNKNOWN", "BIGGEST UNKNOWN", "Biggest unknown"]),
      q("10", ["BIGGEST_RISK", "BIGGEST RISK", "Biggest risk"]),
      q("10", ["BIGGEST_OPPORTUNITY", "BIGGEST OPPORTUNITY", "Biggest opportunity"]),
    ],
  },
];

/** Initial cost rows (design-spec 6.3). The keys are what check 5 and the plan's references read. */
const costDefaults: SeedCostDefault[] = (
  [
    ["initial", "equipment", "Equipment"],
    ["initial", "renovation", "Renovation"],
    ["initial", "lease_deposit", "Lease Deposit"],
    ["initial", "permits", "Permits"],
    ["initial", "inventory", "Initial Inventory"],
    ["initial", "branding", "Branding"],
    ["initial", "launch_marketing", "Launch Marketing"],
    ["initial", "tech_setup", "Tech Setup"],
    ["initial", "working_capital", "Working Capital Buffer"],
    ["initial", "other", "Other"],
    ["monthly", "rent", "Rent"],
    ["monthly", "salaries", "Salaries"],
    ["monthly", "utilities", "Utilities"],
    ["monthly", "internet", "Internet-Software"],
    ["monthly", "accounting", "Accounting"],
    ["monthly", "marketing", "Base Marketing"],
    ["monthly", "insurance", "Insurance-Compliance"],
    ["monthly", "other", "Other"],
    ["variable", "materials", "Materials"],
    ["variable", "packaging", "Packaging"],
    ["variable", "payment_fee", "Payment Fee"],
    ["variable", "delivery", "Delivery"],
    ["variable", "labor", "Variable Labor"],
    ["variable", "other", "Other"],
  ] satisfies [string, string, string][]
).map(([group, key, name]) => ({
  category: group === "monthly" ? "monthly_fixed" : (group as "initial" | "variable"),
  key: `${group}.${key}`,
  name,
}));

/** Check thresholds (design-spec 6.1). Mirrors `DEFAULT_CHECK_RULES` in packages/domain. */
const checkRules: { checkKey: CheckKey; params: Record<string, unknown> }[] = [
  { checkKey: "competitors", params: { min: 3, max: 5 } },
  { checkKey: "local_price", params: { pricedCompetitors: 2, researchLogs: 1 } },
  { checkKey: "costs", params: {} },
  { checkKey: "break_even", params: {} },
  { checkKey: "permits", params: { researchLogs: 1 } },
  { checkKey: "demand_signal", params: { researchLogs: 1 } },
];

function version(
  versionNumber: number,
  status: "draft" | "published",
  extra: Partial<Record<"01" | "10", SeedQuestion>>,
): SeedTemplateVersion {
  const sections = v1Sections();
  for (const key of ["01", "10"] as const) {
    const added = extra[key];
    if (added) sections.find((s) => s.key === key)?.questions.push(added);
  }
  return {
    versionNumber,
    status,
    // The Drive workbook has no AI prompt for validation; operators write it in 27.
    aiPrompt: "",
    sections,
    costDefaults,
    checkRules,
    executionPresets: [],
  };
}

export const validationTemplate: SeedTemplate = {
  kind: "validation",
  name: "Business Idea & Validation",
  versions: [
    version(1, "published", {}),
    version(2, "published", { "01": V2_QUESTION }),
    version(3, "draft", { "01": V2_QUESTION, "10": V3_QUESTION }),
  ],
};
