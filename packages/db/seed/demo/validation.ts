import {
  type CostRowInput,
  deriveFauState,
  type EconomicsInputValues,
  type FauItem,
} from "@moonx/domain";
import type { FauState } from "@moonx/schemas";
import { uid } from "../lib/ids";
import type { World } from "../lib/rows";
import type { Clock } from "../lib/time";
import { templateVersionId as templateVersionIdOf } from "../templates/load";
import { versionOf } from "../templates/types";
import { validationTemplate } from "../templates/validation";
import type { PersonKey } from "./ids";
import { userId } from "./ids";

export type Fau = "fact" | "assumption" | "unknown" | null;
export type Level = "low" | "medium" | "high";
export type EvidenceRef = { log: string; note?: string } | { url: string; note?: string };
export type EconField =
  | "selling_price"
  | "operating_days"
  | "target_margin"
  | "units_conservative"
  | "units_expected"
  | "units_strong"
  | "units_capacity";
type SupportsCheck = "local_price" | "permits" | "demand_signal";
type SourceType =
  | "google_maps_reviews"
  | "website"
  | "social_media"
  | "public_data"
  | "news_report"
  | "store_observation"
  | "price_check"
  | "other";

interface Classification {
  fau?: Fau;
  confidence?: Level;
  evidence?: EvidenceRef[];
}

export interface AnswerSpec extends Classification {
  key: string;
  text: string | null;
  by?: PersonKey;
}
export interface ResearchSpec {
  id: string;
  daysAgo: number;
  topic: string;
  observation: string;
  sourceType: SourceType;
  sourceUrl?: string;
  supports: SupportsCheck[];
  supportsNote?: string;
  by: PersonKey;
}
export interface CompetitorSpec {
  name: string;
  type: "direct" | "indirect" | "substitute";
  targetCustomer: string;
  offering: string;
  typicalPrice: number | null;
  priceNote?: string;
  strength: string;
  weakness: string;
  whyChosen: string;
  whySurvive: string;
}
export interface CostSpec extends Classification {
  amount?: number | null;
  percent?: number;
  whyNeeded?: string;
  canReduce?: "yes" | "partly" | "no";
  notes?: string;
  lumpSum?: boolean;
  name?: string;
}
export interface EconSpec extends Classification {
  value: number | null;
}
export interface AssumptionSpec {
  statement: string;
  whyBelieve: string;
  evidenceNote: string;
  confidence: Level;
  disproveCondition: string;
  nextCheck: string;
}
export interface RiskSpec {
  statement: string;
  probability: Level;
  impact: Level;
  whyMatters: string;
  mitigation: string;
  howToValidate: string;
}

export interface ValidationSpec {
  /** Stable name that seeds every row id of this validation. */
  key: string;
  ideaId: string;
  workspaceId: string;
  templateVersion: 1 | 2;
  /** Who fills in rows that name no author. */
  by: PersonKey;
  /** Days ago the validation was created. */
  createdDaysAgo: number;
  answers: AnswerSpec[];
  research: ResearchSpec[];
  competitors: CompetitorSpec[];
  costs: Record<string, CostSpec>;
  econ: Partial<Record<EconField, EconSpec>>;
  assumptions: AssumptionSpec[];
  risks: RiskSpec[];
}

/** What a built validation looks like to packages/domain, for decision snapshots and the tests. */
export interface ValidationData {
  spec: ValidationSpec;
  validationId: string;
  costRows: CostRowInput[];
  economics: EconomicsInputValues;
  fauItems: FauItem[];
  competitors: { typicalPrice: number | null }[];
  researchLogs: { supportsChecks: SupportsCheck[] }[];
}

export const validationIdOf = (key: string) => uid("validation", key);
export const costRowId = (key: string, templateKey: string) => uid("cost", key, templateKey);

const ECON_FIELDS: EconField[] = [
  "selling_price",
  "operating_days",
  "target_margin",
  "units_conservative",
  "units_expected",
  "units_strong",
  "units_capacity",
];

/**
 * Inserts one validation with its answers, research log, competitors, costs, economics inputs,
 * assumptions, risks and evidence links. Every template cost row exists, Empty unless the spec
 * fills it (design-spec 6.3 "作ったばかり").
 */
export function addValidation(world: World, clock: Clock, spec: ValidationSpec): ValidationData {
  const validationId = validationIdOf(spec.key);
  const created = clock.ago(spec.createdDaysAgo);
  const author = userId(spec.by);
  const version = versionOf(validationTemplate, spec.templateVersion);
  const templateVersionId = templateVersionIdOf("validation", spec.templateVersion);

  world.validations.push({
    id: validationId,
    ideaId: spec.ideaId,
    templateVersionId,
    createdAt: created,
    updatedAt: created,
  });

  const logId = (id: string) => uid("research", spec.key, id);
  const addEvidence = (
    targetType: "validation_answer" | "cost_item" | "economics_input" | "competitor" | "assumption",
    targetId: string,
    targetKey: string | null,
    refs: EvidenceRef[],
  ) => {
    refs.forEach((ref, index) => {
      world.evidenceLinks.push({
        id: uid("evidence", spec.key, targetType, targetId, targetKey ?? "", String(index)),
        workspaceId: spec.workspaceId,
        validationId,
        targetType,
        targetId,
        targetKey,
        researchLogEntryId: "log" in ref ? logId(ref.log) : null,
        url: "url" in ref ? ref.url : null,
        note: ref.note ?? null,
        createdById: author,
        createdAt: created,
        updatedAt: created,
      });
    });
  };
  const classify = (c: Classification, hasValue: boolean) => {
    const fau = c.fau ?? null;
    const confidence = fau === "assumption" ? (c.confidence ?? "medium") : null;
    const evidence = fau === "fact" ? (c.evidence ?? []) : [];
    const state: FauState = deriveFauState({
      hasValue,
      fau,
      confidence,
      activeEvidenceCount: evidence.length,
    });
    return { fau, confidence, evidence, state };
  };

  // Answers. A question hidden by OCEAN (design-spec 6.2) is not part of the breakdown.
  const ocean = spec.answers.find((a) => a.key === "V.02.OCEAN")?.text ?? null;
  const visible = (displayCondition: Record<string, string[]> | null) =>
    displayCondition == null ||
    Object.entries(displayCondition).every(
      ([, allowed]) => ocean != null && allowed.includes(ocean),
    );
  const fauItems: FauItem[] = [];
  const questionKeys = new Set(version.sections.flatMap((s) => s.questions.map((q) => q.key)));
  for (const section of version.sections) {
    for (const q of section.questions) {
      if (!visible(q.displayCondition)) continue;
      const a = spec.answers.find((x) => x.key === q.key);
      const c = classify(a ?? {}, a?.text != null && a.text !== "");
      fauItems.push({
        state: c.state,
        confidence: c.confidence,
        link: {
          screen: 11,
          workspaceId: spec.workspaceId,
          ideaId: spec.ideaId,
          sectionKey: section.key,
          questionKey: q.key,
        },
      });
    }
  }
  for (const a of spec.answers) {
    if (!questionKeys.has(a.key)) throw new Error(`${spec.key}: unknown question ${a.key}`);
    const c = classify(a, a.text != null && a.text !== "");
    const updated = clock.ago(Math.max(spec.createdDaysAgo - 3, 1));
    world.validationAnswers.push({
      id: uid("answer", spec.key, a.key),
      validationId,
      questionKey: a.key,
      text: a.text,
      fau: c.fau,
      confidence: c.confidence,
      updatedById: userId(a.by ?? spec.by),
      createdAt: created,
      updatedAt: updated,
    });
    addEvidence("validation_answer", validationId, a.key, c.evidence);
  }

  for (const r of spec.research) {
    const at = clock.ago(r.daysAgo);
    world.researchLogEntries.push({
      id: logId(r.id),
      validationId,
      observedOn: clock.date(-r.daysAgo),
      topic: r.topic,
      observation: r.observation,
      sourceType: r.sourceType,
      sourceUrl: r.sourceUrl ?? null,
      supportsChecks: r.supports,
      supportsNote: r.supportsNote ?? null,
      createdById: userId(r.by),
      updatedById: userId(r.by),
      createdAt: at,
      updatedAt: at,
    });
  }

  spec.competitors.forEach((c, index) => {
    world.competitors.push({
      id: uid("competitor", spec.key, String(index)),
      validationId,
      name: c.name,
      type: c.type,
      targetCustomer: c.targetCustomer,
      offering: c.offering,
      typicalPrice: c.typicalPrice,
      priceNote: c.priceNote ?? null,
      strength: c.strength,
      weakness: c.weakness,
      whyChosen: c.whyChosen,
      whySurvive: c.whySurvive,
      sortOrder: index,
      updatedById: author,
      createdAt: created,
      updatedAt: created,
    });
  });

  // Costs: one row per template default
  const costRows: CostRowInput[] = [];
  const orderInCategory = { initial: 0, monthly_fixed: 0, variable: 0 };
  const knownKeys = new Set(version.costDefaults.map((d) => d.key));
  for (const key of Object.keys(spec.costs)) {
    if (!knownKeys.has(key)) throw new Error(`${spec.key}: unknown cost row ${key}`);
  }
  for (const def of version.costDefaults) {
    const c = spec.costs[def.key] ?? {};
    const percent = c.percent ?? null;
    const amount = percent != null ? null : (c.amount ?? null);
    const inputMode = percent != null ? "percent_of_price" : "amount";
    const hasValue = amount != null || percent != null;
    const cls = classify(c, hasValue);
    const id = costRowId(spec.key, def.key);
    world.costItems.push({
      id,
      validationId,
      category: def.category,
      templateKey: def.key,
      name: c.name ?? def.name,
      inputMode,
      amount,
      percent,
      isLumpSum: c.lumpSum ?? false,
      whyNeeded: def.category === "initial" ? (c.whyNeeded ?? null) : null,
      canReduce: def.category === "initial" ? (c.canReduce ?? null) : null,
      notes: c.notes ?? null,
      fau: cls.fau,
      confidence: cls.confidence,
      sortOrder: orderInCategory[def.category]++,
      updatedById: author,
      createdAt: created,
      updatedAt: created,
    });
    addEvidence("cost_item", id, null, cls.evidence);
    costRows.push({
      id,
      category: def.category,
      templateKey: def.key,
      inputMode,
      amount,
      percent,
      fauState: cls.state,
    });
    fauItems.push({
      state: cls.state,
      confidence: cls.confidence,
      link: { screen: 17, workspaceId: spec.workspaceId, ideaId: spec.ideaId, rowId: id },
    });
  }

  const economics: EconomicsInputValues = {
    sellingPrice: null,
    operatingDays: null,
    targetMargin: null,
    unitsConservative: null,
    unitsExpected: null,
    unitsStrong: null,
    unitsCapacity: null,
  };
  const econKey: Record<EconField, keyof EconomicsInputValues> = {
    selling_price: "sellingPrice",
    operating_days: "operatingDays",
    target_margin: "targetMargin",
    units_conservative: "unitsConservative",
    units_expected: "unitsExpected",
    units_strong: "unitsStrong",
    units_capacity: "unitsCapacity",
  };
  for (const field of ECON_FIELDS) {
    const e = spec.econ[field];
    const cls = classify(e ?? {}, e?.value != null);
    if (e) {
      const id = uid("economics", spec.key, field);
      world.economicsInputs.push({
        id,
        validationId,
        fieldKey: field,
        value: e.value,
        fau: cls.fau,
        confidence: cls.confidence,
        updatedById: author,
        createdAt: created,
        updatedAt: created,
      });
      addEvidence("economics_input", validationId, field, cls.evidence);
      economics[econKey[field]] = e.value;
    }
    fauItems.push({
      state: cls.state,
      confidence: cls.confidence,
      link: { screen: 18, workspaceId: spec.workspaceId, ideaId: spec.ideaId, field },
    });
  }

  spec.assumptions.forEach((a, index) => {
    world.assumptions.push({
      id: uid("assumption", spec.key, String(index)),
      validationId,
      ...a,
      sortOrder: index,
      updatedById: author,
      createdAt: created,
      updatedAt: created,
    });
  });
  spec.risks.forEach((r, index) => {
    world.risks.push({
      id: uid("risk", spec.key, String(index)),
      validationId,
      ...r,
      sortOrder: null,
      updatedById: author,
      createdAt: created,
      updatedAt: created,
    });
  });

  return {
    spec,
    validationId,
    costRows,
    economics,
    fauItems,
    competitors: spec.competitors.map((c) => ({ typicalPrice: c.typicalPrice })),
    researchLogs: spec.research.map((r) => ({ supportsChecks: r.supports })),
  };
}
