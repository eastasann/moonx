import type {
  Me,
  SelfAnalysisAnswer,
  SelfAnalysisHome,
  SharedSelfAnalysis,
  TemplateQuestion,
  TemplateSection,
} from "@moonx/schemas";
import { ana } from "./api";
import { workspaceId } from "./ideas";

/** Ana's self-analysis. */
export const selfAnalysisId = "5a5a5a5a-0000-4000-8000-000000000001";

/** A team workspace of Ana's besides BCDX, and her personal one. */
export const otherTeam = {
  id: "3b3b3b3b-0000-4000-8000-000000000002",
  name: "Bacolod Makers",
};
export const personal = {
  id: "1d2c3b4a-0000-4000-8000-00000000000a",
  name: "Ana's workspace",
  isPersonal: true,
  currency: "PHP",
};

const question = (
  key: string,
  title: string,
  prompt: string,
  extra: Partial<TemplateQuestion> = {},
): TemplateQuestion => ({
  key,
  sectionKey: key.split(".")[1] ?? "",
  title,
  prompt,
  example: null,
  hint: null,
  answerType: "long_text",
  options: null,
  displayCondition: null,
  hasFau: false,
  ...extra,
});

/** WHY's two questions (data/templates/bcdx/self-analysis.json). */
export const whySection: TemplateSection = {
  key: "WHY",
  part: null,
  title: "WHY",
  subtitle: "Why do I want this?",
  guidance: "Start with motivation.",
  questions: [
    question("SA.WHY.1", "Q1", "Why do you want to start something?", {
      example: "I want more time with my family.",
    }),
    question("SA.WHY.2", "Q2", "What would change if you did?"),
  ],
};

/** INCOME's first amount question. */
export const incomeSection: TemplateSection = {
  key: "INCOME",
  part: null,
  title: "PERSONAL INCOME",
  subtitle: "What do I need money to enable?",
  guidance: null,
  questions: [
    question("SA.INCOME.1", "Q15", "How much do you need each month?", {
      answerType: "amount_with_reason",
    }),
  ],
};

export const answer = (
  questionKey: string,
  extra: Partial<SelfAnalysisAnswer> = {},
): SelfAnalysisAnswer => ({
  questionKey,
  text: null,
  amount: null,
  lockVersion: 0,
  updatedAt: null,
  updatedBy: null,
  commentCounts: [],
  ...extra,
});

/** S1 for Ana: in progress, 1 of 3 answered, shared with BCDX. */
export const selfHome = (
  extra: Partial<SelfAnalysisHome> = {},
): SelfAnalysisHome => ({
  id: selfAnalysisId,
  status: "in_progress",
  completedAt: null,
  currency: "PHP",
  template: {
    versionId: "7d7d7d7d-0000-4000-8000-000000000001",
    versionNumber: 1,
    newerVersion: null,
  },
  answered: 1,
  total: 3,
  sections: [
    { key: "WHY", title: "WHY", answered: 1, total: 2 },
    { key: "INCOME", title: "PERSONAL INCOME", answered: 0, total: 1 },
  ],
  firstUnanswered: { sectionKey: "WHY", questionKey: "SA.WHY.2" },
  shares: [
    {
      workspace: { id: workspaceId, name: "BCDX" },
      sharedAt: "2026-10-01T01:00:00Z",
    },
  ],
  shareableWorkspaces: [{ id: workspaceId, name: "BCDX" }, otherTeam],
  ...extra,
});

const paolo = {
  id: "6f1c2b3a-0000-4000-8000-000000000002",
  displayName: "Paolo Gonzaga",
  avatarUrl: null,
  badge: null,
};
const kenji = {
  id: "6f1c2b3a-0000-4000-8000-000000000003",
  displayName: "Kenji Mori",
  avatarUrl: null,
  badge: null,
};
export const people = { paolo, kenji };

/** S6 in BCDX: Paolo shared and done, Kenji not shared. */
export const members = {
  items: [
    { user: kenji, shared: false, status: null },
    { user: paolo, shared: true, status: "done" as const },
  ],
};

/** S7 of Paolo's in BCDX. */
export const paolosShared: SharedSelfAnalysis = {
  id: "5a5a5a5a-0000-4000-8000-000000000002",
  user: paolo,
  status: "done",
  currency: "PHP",
  sections: [
    {
      ...whySection,
      answers: [
        {
          questionKey: "SA.WHY.1",
          text: "To run a café students can afford.",
          amount: null,
          commentCount: 2,
        },
        { questionKey: "SA.WHY.2", text: null, amount: null, commentCount: 0 },
      ],
    },
    {
      ...incomeSection,
      answers: [
        {
          questionKey: "SA.INCOME.1",
          text: "Rent and my sister's tuition.",
          amount: 45000,
          commentCount: 0,
        },
      ],
    },
  ],
};

/** Ana as a Viewer of BCDX, with her personal workspace (SDD 4章: 10 and 11 move there). */
export const viewerOfBcdx: Me = {
  ...ana,
  memberships: [
    ...ana.memberships.map(({ workspace }) => ({
      workspace,
      role: "viewer" as const,
    })),
    { workspace: personal, role: "owner" },
  ],
};
