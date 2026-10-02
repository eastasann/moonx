import type { TemplateQuestion, TemplateSection } from "@moonx/schemas";
import { onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, vi } from "vitest";
import { autosave } from "../src/lib/autosave";
import type {
  SelfAnalysisAnswer,
  SelfAnalysisHome,
  SharedSelfAnalysis,
  TeamMember,
} from "../src/lib/self-analysis";
import { type Handler, makeMe, OTHER, stubApi, WORKSPACE } from "./support";

export const ANALYSIS = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
export const ME = "/api/v1/me/self-analysis";
export const HOME_PATH = `/w/${WORKSPACE}/self-analysis`;

export const ANA = {
  id: "44444444-4444-4444-8444-444444444444",
  displayName: "Ana Villanueva",
  avatarUrl: null,
  badge: null,
};
export const KENJI = {
  id: "66666666-6666-4666-8666-666666666666",
  displayName: "Kenji Mori",
  avatarUrl: null,
  badge: null,
};
export const PAOLO = {
  id: "77777777-7777-4777-8777-777777777777",
  displayName: "Paolo Gonzaga",
  avatarUrl: null,
  badge: null,
};

/** Registers the hooks every self analysis test file needs: the pending queue is emptied after each test. */
export function registerSelfAnalysisHooks() {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(async () => {
    await autosave.idle();
    await autosave.clear();
    onlineManager.setOnline(true);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
}

const question = (
  key: string,
  sectionKey: string,
  title: string,
  patch: Partial<TemplateQuestion> = {},
): TemplateQuestion => ({
  key,
  sectionKey,
  title,
  prompt: `Prompt of ${title}`,
  example: null,
  hint: null,
  answerType: "long_text",
  options: null,
  displayCondition: null,
  hasFau: false,
  ...patch,
});

export const SECTION_WHY: TemplateSection = {
  key: "WHY",
  part: null,
  title: "WHY",
  guidance: "Start with motivation.",
  questions: [
    question("SA.WHY.1", "WHY", "WHY 1", { example: "I want more time with family." }),
    question("SA.WHY.2", "WHY", "WHY 2", { hint: "Think about the last year." }),
  ],
};
export const SECTION_INCOME: TemplateSection = {
  key: "INCOME",
  part: null,
  title: "PERSONAL INCOME",
  guidance: "Choose amounts based on the life they enable.",
  questions: [
    question("SA.INCOME.1", "INCOME", "MINIMUM", { answerType: "amount_with_reason" }),
    question("SA.INCOME.2", "INCOME", "COMFORTABLE", { answerType: "amount_with_reason" }),
  ],
};
export const SECTION_ONE: TemplateSection = {
  key: "ONE",
  part: null,
  title: "ONE-SENTENCE SUMMARY",
  guidance: null,
  questions: [question("SA.ONE.1", "ONE", "SENTENCE", { answerType: "short_text" })],
};
export const SECTIONS = [SECTION_WHY, SECTION_INCOME, SECTION_ONE];

export function home(overrides: Partial<SelfAnalysisHome> = {}): SelfAnalysisHome {
  return {
    id: ANALYSIS,
    status: "in_progress",
    completedAt: null,
    currency: "PHP",
    template: {
      versionId: "b0000000-0000-4000-8000-000000000001",
      versionNumber: 1,
      newerVersion: null,
    },
    answered: 3,
    total: 5,
    sections: [
      { key: "WHY", title: "WHY", answered: 2, total: 2 },
      { key: "INCOME", title: "PERSONAL INCOME", answered: 1, total: 2 },
      { key: "ONE", title: "ONE-SENTENCE SUMMARY", answered: 0, total: 1 },
    ],
    firstUnanswered: { sectionKey: "INCOME", questionKey: "SA.INCOME.2" },
    shares: [],
    shareableWorkspaces: [{ id: WORKSPACE, name: "BCDX" }],
    ...overrides,
  };
}

export const answer = (
  key: string,
  patch: Partial<SelfAnalysisAnswer> = {},
): SelfAnalysisAnswer => ({
  questionKey: key,
  text: null,
  amount: null,
  lockVersion: 0,
  updatedAt: "2026-09-30T02:00:00.000Z",
  updatedBy: null,
  commentCounts: [],
  ...patch,
});

export const sectionAnswers = (
  section: TemplateSection,
  patches: Record<string, Partial<SelfAnalysisAnswer>> = {},
) => section.questions.map((q) => answer(q.key, patches[q.key]));

export interface SelfAnalysisApiOptions {
  me?: ReturnType<typeof makeMe>;
  home?: SelfAnalysisHome;
  answers?: Record<string, SelfAnalysisAnswer[]>;
}

/** The stub of every request screens 10 and 11 make. */
export function selfAnalysisApi(
  extra: Record<string, Handler> = {},
  options: SelfAnalysisApiOptions = {},
) {
  const sections = Object.fromEntries(SECTIONS.map((section) => [section.key, section]));
  return stubApi({
    "GET /api/v1/me": () => ({ body: options.me ?? makeMe() }),
    "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
    [`GET ${ME}`]: () => ({ body: options.home ?? home() }),
    ...Object.fromEntries(
      SECTIONS.map((section): [string, Handler] => [
        `GET ${ME}/sections/${section.key}`,
        () => ({
          body: {
            section,
            answers:
              options.answers?.[section.key] ??
              sectionAnswers(sections[section.key] as TemplateSection),
          },
        }),
      ]),
    ),
    ...extra,
  });
}

export const teamMembers = (): TeamMember[] => [
  { user: ANA, shared: true, status: "done" },
  { user: KENJI, shared: false, status: null },
  { user: PAOLO, shared: true, status: "in_progress" },
];

export function shared(overrides: Partial<SharedSelfAnalysis> = {}): SharedSelfAnalysis {
  return {
    id: ANALYSIS,
    user: PAOLO,
    status: "done",
    currency: "PHP",
    sections: [
      {
        ...SECTION_WHY,
        answers: [
          {
            questionKey: "SA.WHY.1",
            text: "To spend weekends with my kids.",
            amount: null,
            commentCount: 2,
          },
          { questionKey: "SA.WHY.2", text: null, amount: null, commentCount: 0 },
        ],
      },
      {
        ...SECTION_INCOME,
        answers: [
          { questionKey: "SA.INCOME.1", text: "Rent and food.", amount: 40000, commentCount: 0 },
          { questionKey: "SA.INCOME.2", text: null, amount: null, commentCount: 0 },
        ],
      },
    ],
    ...overrides,
  };
}

export { OTHER, WORKSPACE };
