import type {
  Assumption,
  Competitor,
  Evidence,
  EvidenceUsage,
  ResearchLogEntry,
  Risk,
  ValidationAnswer,
} from "@moonx/schemas";
import { answer, IDEA_ID } from "./question-fixtures";
import { WORKSPACE } from "./support";

const ID = (n: string) => `00000000-0000-4000-8000-${n.padStart(12, "0")}`;

export const ENTRY_PRICE = ID("1");
export const ENTRY_PERMIT = ID("2");
export const ENTRY_OLD = ID("3");
export const COMPETITOR_A = ID("4");
export const COMPETITOR_B = ID("5");
export const COMPETITOR_C = ID("6");
export const COMPETITOR_NEW = ID("c");
export const ASSUMPTION_A = ID("7");
export const ASSUMPTION_B = ID("8");
export const RISK_A = ID("9");
export const RISK_B = ID("a");
export const RISK_C = ID("b");

const person = {
  id: "44444444-4444-4444-8444-444444444444",
  displayName: "Ana Villanueva",
  avatarUrl: null,
};

const versioned = { lockVersion: 1, updatedAt: "2026-09-30T02:00:00.000Z", updatedBy: person };

export function logEntry(overrides: Partial<ResearchLogEntry> = {}): ResearchLogEntry {
  return {
    id: ENTRY_PRICE,
    observedOn: "2026-09-14",
    topic: "Price check: Lacson St.",
    observation: "Boxes sell at 320 pesos.",
    sourceType: "price_check",
    sourceUrl: null,
    supportsChecks: ["local_price"],
    supportsNote: "Typical price of a box",
    createdBy: person,
    usedAsEvidenceCount: 0,
    commentCount: 0,
    ...versioned,
    ...overrides,
  } as ResearchLogEntry;
}

/** Newest first, as V6 returns them; the last one has no date and so comes last. */
export const LOG_ENTRIES: ResearchLogEntry[] = [
  logEntry(),
  logEntry({
    id: ENTRY_PERMIT,
    observedOn: "2026-09-10",
    topic: "City hall: business permit",
    observation: null,
    sourceType: "public_data",
    supportsChecks: ["permits", "demand_signal"],
    supportsNote: null,
    usedAsEvidenceCount: 2,
  }),
  logEntry({
    id: ENTRY_OLD,
    observedOn: null,
    topic: "Neighbour interview",
    observation: null,
    sourceType: null,
    supportsChecks: [],
    supportsNote: null,
  }),
];

export const usage = (overrides: Partial<EvidenceUsage> = {}): EvidenceUsage => ({
  target: {
    type: "validation_answer",
    id: "66666666-6666-4666-8666-666666666666",
    key: "V.01.WHO",
  },
  label: "01 WHO",
  link: {
    screen: 11,
    workspaceId: WORKSPACE,
    ideaId: IDEA_ID,
    sectionKey: "01",
    questionKey: "V.01.WHO",
  },
  isOnlyEvidenceOfFact: false,
  ...overrides,
});

export const evidenceOf = (id: string, topic: string): Evidence => ({
  id: `e-${id}`,
  kind: "research_log",
  researchLog: { id, observedOn: "2026-09-14", topic, sourceType: null, deleted: false },
  url: null,
  note: null,
});

export function competitor(overrides: Partial<Competitor> = {}): Competitor {
  return {
    id: COMPETITOR_A,
    name: "Bacolod Piaya House",
    type: "direct",
    targetCustomer: "Tourists",
    offering: "Boxed piaya",
    typicalPrice: 320,
    priceNote: "per box",
    strength: "Brand",
    weakness: "No delivery",
    whyChosen: "Famous",
    whySurvive: "Location",
    evidence: [],
    sortOrder: 0,
    commentCount: 0,
    ...versioned,
    ...overrides,
  } as Competitor;
}

export const COMPETITORS: Competitor[] = [
  competitor(),
  competitor({
    id: COMPETITOR_B,
    name: "Supermarket shelf",
    type: "substitute",
    typicalPrice: 150,
    priceNote: null,
    targetCustomer: "Shoppers",
    offering: null,
    strength: null,
    weakness: null,
    whyChosen: null,
    whySurvive: null,
    sortOrder: 1,
  }),
  competitor({
    id: COMPETITOR_C,
    name: "Courier gift service",
    type: null,
    typicalPrice: null,
    priceNote: null,
    targetCustomer: null,
    offering: null,
    strength: null,
    weakness: null,
    whyChosen: null,
    whySurvive: null,
    sortOrder: 2,
  }),
];

export const patternAnswers = (): ValidationAnswer[] => [
  answer("V.04.SURVIVOR_PATTERNS", { text: "Gift-ready packaging", lockVersion: 1 }),
  answer("V.04.FAILURE_PATTERNS", { text: null, lockVersion: 0 }),
];

export function assumption(overrides: Partial<Assumption> = {}): Assumption {
  return {
    id: ASSUMPTION_A,
    statement: "Offices order gifts monthly",
    whyBelieve: "HR told us",
    evidence: [],
    evidenceNote: null,
    confidence: "medium",
    disproveCondition: "Fewer than 5 orders in a month",
    nextCheck: "Call 10 offices",
    sortOrder: 0,
    commentCount: 0,
    ...versioned,
    ...overrides,
  } as Assumption;
}

export const ASSUMPTIONS: Assumption[] = [
  assumption(),
  assumption({
    id: ASSUMPTION_B,
    statement: "Riders are easy to hire",
    confidence: null,
    whyBelieve: null,
    disproveCondition: null,
    nextCheck: null,
    sortOrder: 1,
  }),
];

export function risk(overrides: Partial<Risk> = {}): Risk {
  return {
    id: RISK_A,
    statement: "Permit takes months",
    probability: "medium",
    impact: "high",
    whyMatters: "No sales until approved",
    mitigation: "Start the application first",
    howToValidate: "Ask city hall",
    sortOrder: null,
    commentCount: 0,
    ...versioned,
    ...overrides,
  } as Risk;
}

/** In the server's automatic order: Impact high to low, then Probability. */
export const RISKS: Risk[] = [
  risk(),
  risk({ id: RISK_B, statement: "Piaya spoils in transit", impact: "medium", probability: "high" }),
  risk({ id: RISK_C, statement: "Rent rises", impact: "low", probability: "low" }),
];
