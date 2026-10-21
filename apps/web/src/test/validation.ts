import type {
  Assumption,
  Competitor,
  Evidence,
  ResearchLogEntry,
  Risk,
  TemplateQuestion,
  TemplateSection,
  ValidationAnswer,
} from "@moonx/schemas";
import { ana } from "./api";
import { validationHome } from "./ideas";

export const home = validationHome();
export const validationId = home.validationId;

const anaRef = {
  id: ana.id,
  displayName: ana.displayName,
  avatarUrl: null,
  badge: null,
};

export const question = (
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
  hasFau: true,
  ...extra,
});

/** Three of 01's questions (data/templates/bcdx/validation.json). */
export const section01: TemplateSection = {
  key: "01",
  part: null,
  title: "Customer & Problem",
  subtitle: null,
  guidance: "Define exactly who pays.",
  questions: [
    question("V.01.WHO", "WHO", "Who is the primary paying customer?", {
      example: "Office workers near Lacson St.",
      hint: "Name who pays, not who uses.",
    }),
    question("V.01.PROBLEM", "PROBLEM", "What problem are we solving?"),
    question("V.01.PROOF", "PROOF", "What evidence suggests this exists?"),
  ],
};

/** 02's OCEAN and the questions it shows (6.2). */
export const section02: TemplateSection = {
  key: "02",
  part: null,
  title: "Market",
  subtitle: null,
  guidance: null,
  questions: [
    question(
      "V.02.CATEGORY",
      "CATEGORY",
      "How would you classify the market?",
      {
        answerType: "short_text",
      },
    ),
    question("V.02.OCEAN", "OCEAN", "Red, Blue, or Mixed?", {
      answerType: "choice",
      options: { kind: "choice", choices: ["Red", "Blue", "Mixed"] },
    }),
    question("V.02.RED_1", "RED: SURVIVORS", "Which competitors survive?", {
      displayCondition: { "V.02.OCEAN": ["Red", "Mixed"] },
    }),
    question("V.02.BLUE_1", "BLUE: GAP", "What is underserved?", {
      displayCondition: { "V.02.OCEAN": ["Blue", "Mixed"] },
    }),
  ],
};

/** A research log entry of the idea. */
export const entry = (
  id: string,
  topic: string,
  extra: Partial<ResearchLogEntry> = {},
): ResearchLogEntry => ({
  id,
  validationId,
  observedOn: "2026-09-20",
  topic,
  observation: null,
  sourceType: "store_observation",
  sourceUrl: null,
  supportsChecks: [],
  supportsNote: null,
  createdBy: anaRef,
  usedAsEvidenceCount: 0,
  commentCount: 0,
  lockVersion: 1,
  updatedAt: "2026-09-20T01:00:00.000Z",
  updatedBy: anaRef,
  ...extra,
});

export const survey = entry(
  "5e8c1d2a-0000-4000-8000-000000000001",
  "Lunch survey",
  { supportsChecks: ["demand_signal"], usedAsEvidenceCount: 1 },
);
export const prices = entry(
  "5e8c1d2a-0000-4000-8000-000000000002",
  "Prices downtown",
  { observedOn: "2026-09-18", sourceType: "price_check" },
);

/** Evidence citing `log`, as V2 returns it. */
export const evidenceOf = (
  id: string,
  log: ResearchLogEntry,
  deleted = false,
): Evidence => ({
  id,
  kind: "research_log",
  researchLog: {
    id: log.id,
    observedOn: log.observedOn,
    topic: log.topic,
    sourceType: log.sourceType,
    deleted,
  },
  url: null,
  note: null,
});

/** An answer as V2 returns it. */
export const answer = (
  questionKey: string,
  extra: Partial<ValidationAnswer> = {},
): ValidationAnswer => ({
  questionKey,
  text: null,
  classification: { fau: null, confidence: null, state: "empty", evidence: [] },
  hidden: false,
  commentCount: 0,
  lockVersion: 0,
  updatedAt: null,
  updatedBy: null,
  ...extra,
});

/** A competitor as V8 returns it. */
export const competitor = (
  id: string,
  name: string,
  extra: Partial<Competitor> = {},
): Competitor => ({
  id,
  name,
  type: null,
  targetCustomer: null,
  offering: null,
  typicalPrice: null,
  priceNote: null,
  strength: null,
  weakness: null,
  whyChosen: null,
  whySurvive: null,
  evidence: [],
  sortOrder: 0,
  commentCount: 0,
  unresolvedThreadCount: 0,
  lockVersion: 1,
  updatedAt: "2026-09-20T01:00:00.000Z",
  updatedBy: anaRef,
  ...extra,
});

/** An assumption as V10 returns it. */
export const assumption = (
  id: string,
  statement: string,
  extra: Partial<Assumption> = {},
): Assumption => ({
  id,
  statement,
  whyBelieve: null,
  evidence: [],
  evidenceNote: null,
  confidence: null,
  disproveCondition: null,
  nextCheck: null,
  sortOrder: 0,
  commentCount: 0,
  lockVersion: 1,
  updatedAt: "2026-09-20T01:00:00.000Z",
  updatedBy: anaRef,
  ...extra,
});

/** A risk as V10 returns it. */
export const risk = (
  id: string,
  statement: string,
  extra: Partial<Risk> = {},
): Risk => ({
  id,
  statement,
  probability: null,
  impact: null,
  whyMatters: null,
  mitigation: null,
  howToValidate: null,
  sortOrder: null,
  commentCount: 0,
  lockVersion: 1,
  updatedAt: "2026-09-20T01:00:00.000Z",
  updatedBy: anaRef,
  ...extra,
});
