import type { AiExport, ImportContext } from "@moonx/schemas";
import { ana } from "./api";
import { workspaceId } from "./ideas";
import { home, prices, survey, validationId } from "./validation";

type Question = ImportContext["questions"][number];
type Current = Question["current"];

const kenji = {
  id: "7d793037-a076-4c2b-9f8e-3a1b2c3d4e5f",
  displayName: "Kenji Mori",
  avatarUrl: null,
  badge: null,
};

/** An answer as X2 gives it: none saved unless told. */
export const current = (extra: Partial<Current> = {}): Current => ({
  text: null,
  amount: null,
  classification: {
    fau: null,
    confidence: null,
    state: extra.text ? "unclassified" : "empty",
    evidence: [],
  },
  lockVersion: 0,
  updatedAt: null,
  updatedBy: null,
  ...extra,
});

/** A question of X2. */
export const contextQuestion = (
  questionKey: string,
  title: string,
  prompt: string,
  extra: Partial<Question> = {},
): Question => ({
  questionKey,
  title,
  prompt,
  sectionKey: questionKey.split(".")[1] ?? "",
  answerType: "long_text",
  options: null,
  importable: true,
  hasFau: true,
  hidden: false,
  current: current(),
  ...extra,
});

/** Evidence of a research log that still counts. */
const evidence = (id: string, log: typeof survey) => ({
  id,
  kind: "research_log" as const,
  researchLog: {
    id: log.id,
    observedOn: log.observedOn,
    topic: log.topic,
    sourceType: log.sourceType,
    deleted: false,
  },
  url: null,
  note: null,
});

/** X2 for the validation of `home` (Bacolod Health Bowl): 01 and 02. */
export const validationContext = (
  extra: Partial<ImportContext["target"]> = {},
): ImportContext => ({
  target: {
    type: "validation",
    id: validationId,
    name: home.idea.name,
    workspaceId,
    ideaId: home.idea.id,
    currency: "PHP",
    archived: false,
    ...extra,
  },
  sections: [
    { key: "01", title: "Customer & Problem", part: null, importable: true },
    { key: "02", title: "Market", part: null, importable: true },
    { key: "10", title: "Final Assessment", part: null, importable: true },
  ],
  questions: [
    contextQuestion("V.01.WHO", "WHO", "Who is the primary paying customer?", {
      current: current({
        text: "Office workers aged 25–40 near Lacson St.",
        classification: {
          fau: "assumption",
          confidence: "medium",
          state: "assumption",
          evidence: [],
        },
        lockVersion: 3,
        updatedAt: "2026-10-20T01:00:00.000Z",
        updatedBy: kenji,
      }),
    }),
    contextQuestion("V.01.PROBLEM", "PROBLEM", "What problem are we solving?"),
    contextQuestion(
      "V.01.PROOF",
      "PROOF",
      "What evidence suggests this exists?",
      {
        current: current({
          text: "A survey of 20 office workers.",
          classification: {
            fau: "fact",
            confidence: null,
            state: "fact",
            evidence: [
              evidence("6a1f0c3b-0000-4000-8000-000000000001", survey),
            ],
          },
          lockVersion: 2,
          updatedAt: "2026-10-19T01:00:00.000Z",
          updatedBy: kenji,
        }),
      },
    ),
    contextQuestion("V.01.FREQUENCY", "FREQUENCY", "How often does it occur?", {
      current: current({
        text: "Every working day.",
        lockVersion: 1,
        updatedAt: "2026-10-18T01:00:00.000Z",
        updatedBy: kenji,
      }),
    }),
    contextQuestion("V.02.OCEAN", "OCEAN", "Red, Blue, or Mixed?", {
      answerType: "choice",
      options: { kind: "choice", choices: ["Red", "Blue", "Mixed"] },
    }),
    contextQuestion(
      "V.02.RED_1",
      "RED: SURVIVORS",
      "Which competitors survive?",
      {
        hidden: true,
      },
    ),
  ],
});

/** X2 for the user's own self-analysis: WHY and the amounts of INCOME. */
export const selfAnalysisContext = (): ImportContext => ({
  target: {
    type: "self_analysis",
    id: "3c2b1a00-0000-4000-8000-000000000001",
    name: ana.displayName,
    workspaceId: null,
    ideaId: null,
    currency: "PHP",
    archived: false,
  },
  sections: [
    { key: "WHY", title: "WHY", part: null, importable: true },
    { key: "INCOME", title: "PERSONAL INCOME", part: null, importable: true },
  ],
  questions: [
    contextQuestion("SA.WHY.1", "Q1", "Why do I want to build a business?", {
      hasFau: false,
      current: { ...current(), classification: null },
    }),
    contextQuestion(
      "SA.INCOME.1",
      "Q15",
      "What is my minimum monthly personal income?",
      {
        answerType: "amount_with_reason",
        hasFau: false,
        current: {
          ...current({
            text: "Rent and food.",
            amount: 30000,
            lockVersion: 1,
          }),
          classification: null,
        },
      },
    ),
  ],
});

/** A plan of `home`'s idea: items 01 and 02 of Part A, 11 (a table) and 16 of Part B. */
export const planContext = (archived = false): ImportContext => ({
  target: {
    type: "business_plan",
    id: "8f0e7d6c-0000-4000-8000-000000000001",
    name: "Plan A",
    workspaceId,
    ideaId: home.idea.id,
    currency: "PHP",
    archived,
  },
  sections: [
    { key: "01", title: "Executive Summary", part: "a", importable: true },
    { key: "02", title: "Vision & Purpose", part: "a", importable: true },
    { key: "11", title: "Founders", part: "b", importable: false },
    { key: "16", title: "Go-to-Market", part: "b", importable: true },
  ],
  questions: [
    contextQuestion(
      "P.01.1",
      "What is the business?",
      "What is the business?",
      {
        hasFau: false,
        current: { ...current(), classification: null },
      },
    ),
  ],
});

/** X1's answer for an export of `home`'s validation. */
export const exported = (extra: Partial<AiExport> = {}): AiExport => ({
  markdown:
    "<!-- moonx-export v1 | kind: validation | scope: 01 -->\n\n# Questions\n\n## [V.01.WHO] WHO\n",
  json: {
    format: "moonx-export",
    version: 1,
    exportedAt: "2026-10-22T10:00:00+08:00",
    kind: "validation",
    scope: { ideaName: home.idea.name, sections: ["01"] },
    templateVersion: 1,
    currency: "PHP",
    questions: [],
    reply: {
      instructions: "Reply in JSON.",
      example: { format: "moonx-reply", version: 1, answers: [] },
    },
  },
  fileBaseName: "moonx-export-validation-Bacolod Health Bowl-2026-10-22",
  questionCount: 1,
  allEmpty: false,
  ...extra,
});

export { prices, survey };
