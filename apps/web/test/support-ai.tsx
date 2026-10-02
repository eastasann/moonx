import { buildExport, type ExportQuestion } from "@moonx/domain";
import type { Classification } from "@moonx/schemas";
import { onlineManager } from "@tanstack/react-query";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, vi } from "vitest";
import type { ContextQuestion, ImportContext } from "../src/lib/ai-exchange";
import { type Handler, makeMe, stubApi, WORKSPACE } from "./support";

export const VALIDATION = "66666666-6666-4666-8666-666666666666";
export const IDEA = "55555555-5555-4555-8555-555555555555";
export const KENJI = {
  id: "88888888-8888-4888-8888-888888888888",
  displayName: "Kenji Reyes",
  avatarUrl: null,
  badge: null,
} as const;

export const ME = makeMe();
export const viewerMe = () =>
  makeMe({
    memberships: [
      {
        workspace: { id: WORKSPACE, name: "BCDX", isPersonal: false, currency: "PHP" },
        role: "viewer",
      },
    ],
  });

export const CONTEXT_URL = "GET /api/v1/ai/import/context";
export const EXPORT_URL = "GET /api/v1/ai/export";
export const APPLY_URL = "POST /api/v1/ai/import/apply";

export const exportPath = (search: string) => `/w/${WORKSPACE}/ai/export?${search}`;
export const importPath = (search: string) => `/w/${WORKSPACE}/ai/import?${search}`;

const noEvidence = (): Classification => ({
  fau: null,
  confidence: null,
  state: "unclassified",
  evidence: [],
});

const withEvidence = (): Classification["evidence"] => [
  {
    id: "99999999-9999-4999-8999-999999999991",
    kind: "research_log",
    researchLog: {
      id: "99999999-9999-4999-8999-999999999992",
      observedOn: "2026-09-12",
      topic: "Store observation",
      sourceType: "store_observation",
      deleted: false,
    },
    url: null,
    note: null,
  },
];

export const assumption = (confidence: "low" | "medium" | "high" = "medium"): Classification => ({
  fau: "assumption",
  confidence,
  state: "assumption",
  evidence: [],
});

export const factWithEvidence = (): Classification => ({
  fau: "fact",
  confidence: null,
  state: "fact",
  evidence: withEvidence(),
});

export const unclassifiedWithEvidence = (): Classification => ({
  ...noEvidence(),
  evidence: withEvidence(),
});

/** A question of an import context; the answer is empty and unclassified unless said otherwise. */
export function contextQuestion(
  questionKey: string,
  title: string,
  sectionKey: string,
  overrides: Partial<Omit<ContextQuestion, "current">> & {
    current?: Partial<ContextQuestion["current"]>;
  } = {},
): ContextQuestion {
  const { current, ...rest } = overrides;
  return {
    questionKey,
    title,
    sectionKey,
    answerType: "long_text",
    options: null,
    importable: true,
    hidden: false,
    ...rest,
    current: {
      text: null,
      amount: null,
      classification: noEvidence(),
      lockVersion: 0,
      updatedAt: null,
      updatedBy: null,
      ...current,
    },
  };
}

export const target = (
  overrides: Partial<ImportContext["target"]> = {},
): ImportContext["target"] => ({
  type: "validation",
  id: VALIDATION,
  name: "Piaya Gift Box Delivery",
  workspaceId: WORKSPACE,
  ideaId: IDEA,
  currency: "PHP",
  archived: false,
  ...overrides,
});

/** The validation of the Piaya idea: sections 01, 02, 04, 08 and 10, and a cost table that cannot be imported. */
export function validationContext(overrides: Partial<ImportContext> = {}): ImportContext {
  return {
    target: target(),
    sections: [
      { key: "01", title: "Customer & Problem", part: null, importable: true },
      { key: "02", title: "Market", part: null, importable: true },
      { key: "04", title: "Competitors & Substitutes", part: null, importable: true },
      { key: "05", title: "Costs", part: null, importable: false },
      { key: "08", title: "Investment Return", part: null, importable: true },
      { key: "10", title: "Final Assessment", part: null, importable: true },
    ],
    questions: [
      contextQuestion("V.01.WHO", "WHO", "01", {
        current: {
          text: "HR teams of BPO companies in Bacolod",
          classification: assumption(),
          lockVersion: 2,
          updatedAt: "2026-10-01T02:00:00.000Z",
        },
      }),
      contextQuestion("V.01.PROBLEM", "PROBLEM", "01", {
        current: {
          text: "Gifts for clients are hard to source",
          classification: { ...factWithEvidence() },
          lockVersion: 3,
          updatedAt: "2026-10-01T02:00:00.000Z",
        },
      }),
      contextQuestion("V.01.BEHAVIOR", "BEHAVIOR", "01", {
        current: { text: "They buy at the airport", classification: unclassifiedWithEvidence() },
      }),
      contextQuestion("V.02.OCEAN", "OCEAN", "02", {
        answerType: "choice",
        options: { kind: "choice", choices: ["Red", "Blue", "Mixed"] },
        current: { text: "Red", classification: assumption("low"), lockVersion: 1 },
      }),
      contextQuestion("V.02.RED_1", "RED: SURVIVORS", "02", {
        hidden: true,
        current: { text: null },
      }),
      contextQuestion("V.02.CATEGORY", "CATEGORY", "02", { answerType: "short_text" }),
      contextQuestion("V.04.SURVIVOR_PATTERNS", "Survivor Patterns", "04"),
      contextQuestion("V.05.COST_1", "Equipment", "05", {
        answerType: "table",
        importable: false,
      }),
      contextQuestion("V.08.WORTH", "WORTH", "08"),
      contextQuestion("V.10.WHY_WORK", "WHY WORK", "10"),
    ],
    ...overrides,
  };
}

/** The signed-in person's own self analysis, with an amount question. */
export function selfAnalysisContext(): ImportContext {
  return {
    target: target({
      type: "self_analysis",
      id: "77777777-7777-4777-8777-777777777777",
      name: "Self analysis",
      ideaId: null,
    }),
    sections: [
      { key: "WHY", title: "WHY", part: null, importable: true },
      { key: "INCOME", title: "INCOME", part: null, importable: true },
    ],
    questions: [
      contextQuestion("SA.WHY.1", "Why this business?", "WHY", {
        current: { text: "I want to stay near family", classification: null, lockVersion: 4 },
      }),
      contextQuestion("SA.INCOME.1", "Income needed", "INCOME", {
        answerType: "amount_with_reason",
        current: {
          text: "Enough to cover rent",
          amount: 30000,
          classification: null,
          lockVersion: 1,
        },
      }),
    ],
  };
}

/** A business plan with items 01 (Part A) and 11 (Part B, a table that cannot be imported). */
export function planContext(): ImportContext {
  const planId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  return {
    target: target({ type: "business_plan", id: planId, name: "Plan A" }),
    sections: [
      { key: "01", title: "Business Overview", part: "a", importable: true },
      { key: "02", title: "Customer", part: "a", importable: true },
      { key: "11", title: "Revenue Table", part: "b", importable: false },
      { key: "24", title: "Conditions", part: "b", importable: true },
    ],
    questions: [
      contextQuestion("P.01.1", "What is the business?", "01", {
        current: { text: "Corporate piaya boxes", classification: null, lockVersion: 5 },
      }),
      contextQuestion("P.02.1", "Who is the customer?", "02", {
        current: { classification: null },
      }),
      contextQuestion("P.11.1", "Revenue by month", "11", {
        importable: false,
        current: { classification: null },
      }),
      contextQuestion("P.24.1", "We proceed to launch if", "24", {
        current: { classification: null },
      }),
    ],
  };
}

const exportQuestion = (q: ContextQuestion): ExportQuestion => ({
  id: q.questionKey,
  section: q.sectionKey,
  sectionTitle: q.sectionKey,
  title: q.title,
  question: `Prompt of ${q.title}`,
  example: null,
  hint: null,
  answerType: q.answerType,
  options: q.options,
  answer: {
    text: q.current.text,
    amount: q.current.amount,
    fau: q.current.classification?.fau ?? null,
    confidence: q.current.classification?.confidence ?? null,
    evidence: [],
  },
});

/**
 * What X1 returns for the given questions, built by the real `buildExport` so the pasted text of
 * the import tests is text the app itself exports.
 */
export function exportedFor(
  context: ImportContext,
  keys: string[],
  options: { includeEmpty?: boolean } = {},
) {
  const questions = context.questions
    .filter((q) => keys.includes(q.questionKey))
    .map(exportQuestion)
    .filter((q) => options.includeEmpty !== false || q.answer.text !== null);
  const built = buildExport({
    kind: context.target.type,
    scopeLabel: "01",
    scope: { sections: ["01"] },
    subjectName: context.target.name,
    exportedAt: "2026-10-01T10:00:00+08:00",
    templateVersion: 1,
    currency: "PHP",
    prompt: "Let's talk.",
    questions,
    includeExamples: true,
    reference: null,
  });
  return {
    markdown: built.markdown,
    json: built.json,
    fileBaseName: "moonx-export-validation-piaya-gift-box-delivery-2026-10-01",
    questionCount: built.questionCount,
    allEmpty: built.allEmpty,
  };
}

/** Registers the clean-up every AI exchange test file needs. */
export function registerAiHooks() {
  afterEach(() => {
    onlineManager.setOnline(true);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
}

/** Stubs the API for the AI screens: the account, the counter of the header and X2. */
export function api(
  extra: Record<string, Handler> = {},
  options: { me?: typeof ME; context?: ImportContext | (() => ImportContext) } = {},
) {
  const context = options.context ?? validationContext();
  return stubApi({
    "GET /api/v1/me": () => ({ body: options.me ?? ME }),
    "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
    [CONTEXT_URL]: () => ({ body: typeof context === "function" ? context() : context }),
    ...extra,
  });
}

/** Puts `text` into the paste field of screen 25. */
export async function paste(text: string) {
  const field = await screen.findByRole("textbox", { name: "AI reply" });
  await userEvent.clear(field);
  await userEvent.paste(text);
}

export const pressNext = () => userEvent.click(screen.getByRole("button", { name: "Next" }));

/** The lines of the Match step, as "state text" strings in paste order. */
export function matchRows(): HTMLElement[] {
  return within(screen.getByRole("list", { name: "Match" })).getAllByRole("listitem");
}

/** The exported Markdown of `keys`, with `from` replaced by `to` as an AI's rewrite would. */
export function rewrittenMarkdown(
  context: ImportContext,
  keys: string[],
  edits: [from: string, to: string][],
): string {
  let { markdown } = exportedFor(context, keys);
  for (const [from, to] of edits) {
    if (!markdown.includes(from)) throw new Error(`export has no "${from}"`);
    markdown = markdown.replace(from, to);
  }
  return markdown;
}
