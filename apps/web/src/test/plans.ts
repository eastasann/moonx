import type {
  ExecutionItem,
  ExecutionType,
  PitchDeck,
  PitchSlide,
  PitchVariant,
  PlanHome,
  PlanItem,
  PlanSummary,
  TemplateQuestion,
} from "@moonx/schemas";
import { ana } from "./api";
import { workspaceId } from "./ideas";
import { home as ideaHome } from "./validation";

// A plan of Bacolod Health Bowl as P1–P4 answer (SDD 5.9), shaped after the seed's
// Piaya Plan A: a version saved and changed since, a Go / No-Go of Delay.

export const ideaId = ideaHome.idea.id;
export const planId = "3d6f0a2c-5b1e-4c8d-9a7f-2e4b6c8d0a1f";
export const versionId = "3d6f0a2c-5b1e-4c8d-9a7f-2e4b6c8d0a20";

export const anaRef = {
  id: ana.id,
  displayName: ana.displayName,
  avatarUrl: null,
  badge: null,
};

/** 20's path, and of a saved version of the plan. */
export const planPath = (search = "") =>
  `/w/${workspaceId}/ideas/${ideaId}/plans/${planId}${search}`;

const item = (
  itemNo: number,
  title: string,
  filled: number,
  total: number,
  extra: Partial<PlanHome["parts"][number]["items"][number]> = {},
) => ({
  itemNo,
  title,
  marks: [],
  filled,
  total,
  commentCount: 0,
  ...extra,
});

/** P2 GET: Plan A as it is now. */
export function planHome(extra: Partial<PlanHome> = {}): PlanHome {
  return {
    id: planId,
    name: "Plan A",
    archived: false,
    latestVersion: {
      id: versionId,
      name: "v1 For advisors",
      savedAt: "2026-09-20T02:00:00.000Z",
    },
    hasChangesSinceVersion: true,
    latestGoNoGo: {
      value: "delay",
      recordedAt: "2026-09-28T02:00:00.000Z",
      recordedBy: anaRef,
    },
    lockVersion: 4,
    updatedAt: "2026-10-01T02:00:00.000Z",
    updatedBy: anaRef,
    ideaId,
    workspaceId,
    template: {
      versionId: "6ba7b810-9dad-41d1-80b4-00c04fd430c9",
      versionNumber: 1,
      newerVersion: null,
    },
    businessName: "Health Bowl Co.",
    preparedBy: "Ana",
    date: "2026-10-01T02:00:00.000Z",
    latestDecision: "proceed",
    ideaArchived: false,
    draftOnly: false,
    viewingVersion: null,
    keyMetrics: ideaHome.keyMetrics,
    versions: [
      {
        id: versionId,
        versionNumber: 1,
        name: "v1 For advisors",
        savedBy: anaRef,
        savedAt: "2026-09-20T02:00:00.000Z",
      },
    ],
    execution: { dueSoon: 2, overdue: 1 },
    parts: [
      {
        part: "a",
        completeItems: 1,
        totalItems: 2,
        items: [
          item(1, "Executive Summary", 5, 6, {
            marks: ["V"],
            commentCount: 2,
          }),
          item(2, "Vision & Purpose", 4, 4, { marks: ["S"] }),
        ],
      },
      {
        part: "b",
        completeItems: 0,
        totalItems: 1,
        items: [item(13, "Ownership & Money Between Founders", 1, 6)],
      },
    ],
    ...extra,
  };
}

/** P1 GET with the archived plans: Plan A, Plan B archived. */
export const plans: PlanSummary[] = [
  {
    id: planId,
    name: "Plan A",
    archived: false,
    latestVersion: planHome().latestVersion,
    hasChangesSinceVersion: true,
    latestGoNoGo: planHome().latestGoNoGo,
  },
  {
    id: "3d6f0a2c-5b1e-4c8d-9a7f-2e4b6c8d0a30",
    name: "Plan B",
    archived: true,
    latestVersion: null,
    hasChangesSinceVersion: false,
    latestGoNoGo: null,
  },
];

const prompt = (
  key: string,
  title: string,
  extra: Partial<TemplateQuestion> = {},
): TemplateQuestion => ({
  key,
  sectionKey: key.split(".")[1] ?? "",
  title,
  prompt: title,
  example: null,
  hint: null,
  answerType: "long_text",
  options: null,
  displayCondition: null,
  hasFau: false,
  ...extra,
});

/** P4 of an item, as far as 20's panels read it: its prompts. */
export function planItem(itemNo: number): PlanItem {
  const prompts =
    itemNo === 13
      ? [
          prompt("P.13.1", "Ownership and capital", {
            answerType: "table",
            options: {
              kind: "table",
              columns: [
                { key: "name", label: "Name", type: "text" },
                {
                  key: "initial_ownership",
                  label: "Initial ownership (%)",
                  type: "percent",
                },
                {
                  key: "initial_capital",
                  label: "Initial capital contribution",
                  type: "money",
                },
              ],
            },
          }),
        ]
      : [prompt("P.01.1", "What is the business?")];
  return {
    itemNo,
    title: itemNo === 13 ? "Ownership & Money Between Founders" : "Item",
    guidance: null,
    readOnly: false,
    prompts,
    answers: [],
    metrics: {},
    scenarios: [],
    execution: [],
    references: [],
  };
}

/** An execution item of the plan as P9 answers it: nothing filled in but its title. */
export const executionItem = (
  type: ExecutionType,
  id: string,
  title: string,
  extra: Partial<ExecutionItem> = {},
): ExecutionItem => ({
  id,
  type,
  title,
  assignee: null,
  dueDate: null,
  status: type === "kpi" ? null : type === "open_question" ? "open" : "todo",
  overdue: false,
  goal: null,
  exitCondition: null,
  launchTiming: type === "launch" ? "other" : null,
  actions: null,
  completionCriteria: null,
  kpiArea: null,
  kpiTarget: null,
  kpiReviewFrequency: null,
  kpiActual: null,
  kpiActualUpdatedAt: null,
  whyItMatters: null,
  answer: null,
  fromPreset: false,
  completedAt: null,
  sortOrder: 0,
  commentCount: 0,
  lockVersion: 1,
  updatedAt: "2026-10-01T02:00:00.000Z",
  updatedBy: anaRef,
  ...extra,
});

const exact = (value: number) => ({
  value,
  bound: "exact" as const,
  reason: null,
});

const bullet = (label: string, text: string | null) => ({
  label,
  text: text ?? "Not written yet",
  empty: text === null,
});

/** A slide of P12 (SDD 5.9): unfitted, without links, comments or cut text. */
export const pitchSlide = (
  key: PitchSlide["key"],
  type: PitchSlide["type"],
  title: string,
  extra: Partial<PitchSlide> = {},
): PitchSlide => ({
  key,
  type,
  title: { text: title, empty: false },
  subtitle: null,
  bullets: [],
  numbers: [],
  figureColumns: null,
  table: null,
  emptySources: [],
  shrink: 0,
  overflow: false,
  editSource: null,
  editInValidation: null,
  commentCount: 0,
  ...extra,
});

/**
 * P12: Plan A's deck of `variant` (design-spec 6.14), from the plan now, as an Owner gets
 * it: the four types of slide, links to the sources, one slide cut short.
 */
export function pitchDeck(
  variant: PitchVariant,
  extra: Partial<PitchDeck> = {},
): PitchDeck {
  const title = pitchSlide("title", "title", "Health Bowl Co.", {
    subtitle: { text: "Fresh grain bowls for office lunches.", empty: false },
    bullets: [
      bullet("Prepared by", "Ana"),
      bullet("Date", "Oct 1, 2026"),
      bullet("Version", "Draft"),
    ],
    editSource: { itemNo: 1 },
  });
  const problem = pitchSlide("problem", "text", "Problem", {
    bullets: [
      bullet("Primary problem", "Office workers skip lunch or eat fast food."),
      bullet("Frequency", null),
      bullet("Severity", "Every working day."),
    ],
    emptySources: ["Frequency"],
    editSource: { itemNo: 4 },
    commentCount: 2,
  });
  const text = (key: PitchSlide["key"], name: string, itemNo: number) =>
    pitchSlide(key, "text", name, {
      bullets: [bullet(name, `About ${name.toLowerCase()}.`)],
      editSource: { itemNo },
    });
  const model = pitchSlide("business_model", "number", "Business model", {
    bullets: [bullet("Primary revenue stream", "Bowls sold at lunch.")],
    numbers: [
      { label: "Price", metricKey: "selling_price", value: exact(220) },
      {
        label: "Contribution / sale",
        metricKey: "contribution_margin",
        value: exact(118),
      },
      {
        label: "Break-even / day",
        metricKey: "break_even_units_day",
        value: exact(6.9),
      },
    ],
    figureColumns: { widths: [240, 260, 240], fits: true },
    editSource: { itemNo: 8 },
    editInValidation: "economics",
  });
  const whyUs = pitchSlide("why_us", "text", "Why us", {
    bullets: [
      bullet(
        "Founder advantages",
        "Ten years running a canteen, with suppliers who know us and the offices that…",
      ),
    ],
    shrink: 2,
    overflow: true,
    editSource: { itemNo: 10 },
  });
  const slides =
    variant === "one"
      ? [
          title,
          problem,
          text("customer", "Customer", 3),
          text("solution", "Solution", 5),
          text("why_now", "Why now", 1),
          model,
          whyUs,
          text("next_step", "Next step", 29),
        ]
      : [
          title,
          problem,
          text("customer", "Customer", 3),
          text("solution", "Solution", 5),
          text("market", "Market", 6),
          pitchSlide("competition", "table", "Competition", {
            table: {
              columns: [
                { label: "Name", numeric: false, width: 0.25 },
                { label: "Type", numeric: false, width: 0.18 },
                { label: "Price", numeric: true, width: 0.15 },
                { label: "Strength", numeric: false, width: 0.42 },
              ],
              rows: [["Lacson Eats", "Direct", "₱180", "Cheap and near"]],
            },
            editSource: { itemNo: 6 },
          }),
          model,
          pitchSlide("economics", "table", "Economics", {
            editSource: { itemNo: 20 },
            editInValidation: "costs",
          }),
          text("funding", "Funding plan", 20),
          whyUs,
          text("execution", "Execution plan", 23),
          text("launch", "Launch plan", 25),
          text("risks", "Risks", 22),
          text("ask", "Ask / next step", 24),
        ];
  return {
    variant,
    source: { kind: "latest" },
    businessName: "Health Bowl Co.",
    generatedAt: "2026-10-02T02:00:00.000Z",
    footer: {
      businessName: "Health Bowl Co.",
      versionLabel: "Draft",
      date: "2026-10-01",
    },
    speakerNotes:
      variant === "one"
        ? "We sell healthy bowls to office workers at lunch."
        : "Five minutes on why offices will buy our bowls.",
    slides,
    ...extra,
  };
}
