import type {
  ExecutionItem,
  ExecutionType,
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
