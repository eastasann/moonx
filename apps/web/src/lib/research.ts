import {
  type Assumption,
  type Competitor,
  type Confidence,
  confidenceSchema,
  type EvidenceUsage,
  type OrderList,
  type ResearchLogEntry,
  type Risk,
  type SourceType,
  type SupportsCheck,
  sourceTypeSchema,
  supportsCheckSchema,
  type ValidationAnswer,
} from "@moonx/schemas";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { z } from "zod";
import { sendJson } from "./api";
import type { FieldSpec } from "./row-fields";
import {
  assumptionsKey,
  competitorsKey,
  researchEntryKey,
  researchLogKey,
  risksKey,
} from "./validation-keys";

// These screens read and write with `sendJson`, not Treaty: Treaty turns a text that looks like a
// date into a `Date`, which would change a research log's `observedOn` ("2026-09-12") and any
// note a person typed that happens to look like one.

const validationUrl = (validationId: string) => `/api/v1/validations/${validationId}`;

// ---- 14: research log ----

/** Entries per request; "Load more" asks for the next page of this size. */
export const RESEARCH_PAGE_SIZE = 50;

export interface ResearchFilters {
  supports?: SupportsCheck;
  source?: SourceType;
}

/**
 * Screen 14's search parameters (SDD 4). A value that does not parse (an old or typed link) is
 * dropped. `new=1` opens the form for a new entry.
 */
export const researchSearchSchema = z.object({
  supports: supportsCheckSchema.optional().catch(undefined),
  source: sourceTypeSchema.optional().catch(undefined),
  entry: z.uuid().optional().catch(undefined),
  new: z
    .union([z.literal(1), z.literal("1"), z.literal(true)])
    .optional()
    .catch(undefined),
});
export type ResearchSearch = z.infer<typeof researchSearchSchema>;

export interface ResearchPage {
  items: ResearchLogEntry[];
  nextCursor: string | null;
}

/** V7 GET: the entry with the items that use it as evidence. */
export type ResearchLogDetail = ResearchLogEntry & { usages: EvidenceUsage[] };

export const researchListQuery = (validationId: string, filters: ResearchFilters) =>
  infiniteQueryOptions({
    queryKey: researchLogKey(validationId, { list: true, ...filters }),
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ limit: String(RESEARCH_PAGE_SIZE) });
      if (filters.supports) query.set("supports", filters.supports);
      if (filters.source) query.set("sourceType", filters.source);
      if (pageParam) query.set("cursor", pageParam);
      return sendJson<ResearchPage>("GET", `${validationUrl(validationId)}/research-log?${query}`);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

export const researchEntryQuery = (validationId: string, entryId: string) =>
  queryOptions({
    queryKey: researchEntryKey(validationId, entryId),
    queryFn: () => sendJson<ResearchLogDetail>("GET", `/api/v1/research-log/${entryId}`),
  });

export const createResearchEntry = (validationId: string, body: Record<string, unknown>) =>
  sendJson<ResearchLogEntry>("POST", `${validationUrl(validationId)}/research-log`, body);

/** V7 DELETE: the items whose evidence the entry was. */
export const deleteResearchEntry = (entryId: string) =>
  sendJson<{ affected: EvidenceUsage[] }>("DELETE", `/api/v1/research-log/${entryId}`);

export const SOURCE_TYPES = sourceTypeSchema.options;
export const SUPPORTS_CHECKS = supportsCheckSchema.options;

/** The catalog text of a source type, as the evidence sheet shows it. */
export const sourceTypeLabel = (t: TFunction, type: SourceType) =>
  t(`form:evidence.sourceTypes.${type}`);

/** The catalog text of a check an entry can support. */
export const supportsLabel = (t: TFunction, check: SupportsCheck) =>
  t(`validation:checks.${check}.label`);

/** The fields of a research log entry (design-spec 6.10), labelled as the evidence sheet labels them. */
export function researchLogSpecs(t: TFunction): FieldSpec[] {
  return [
    { kind: "date", key: "observedOn", label: t("form:evidence.log.date") },
    { kind: "text", key: "topic", required: true, label: t("form:evidence.log.topic") },
    { kind: "longText", key: "observation", label: t("form:evidence.log.observation") },
    {
      kind: "choice",
      control: "picker",
      key: "sourceType",
      label: t("form:evidence.log.sourceType"),
      options: SOURCE_TYPES.map((type) => ({ id: type, label: sourceTypeLabel(t, type) })),
    },
    { kind: "url", key: "sourceUrl", label: t("form:evidence.log.sourceUrl") },
    {
      kind: "checks",
      key: "supportsChecks",
      label: t("form:evidence.log.supports"),
      options: SUPPORTS_CHECKS.map((check) => ({ id: check, label: supportsLabel(t, check) })),
    },
    { kind: "longText", key: "supportsNote", label: t("form:evidence.log.supportsNote") },
  ];
}

// ---- 15: competitors ----

/** V8 GET with the two pattern answers under the name the answer cards read them by. */
export interface CompetitorsData {
  items: Competitor[];
  /** `V.04.SURVIVOR_PATTERNS` and `V.04.FAILURE_PATTERNS`. */
  answers: ValidationAnswer[];
  guidance: { min: number; max: number };
}

export const SURVIVOR_PATTERNS_KEY = "V.04.SURVIVOR_PATTERNS";
export const FAILURE_PATTERNS_KEY = "V.04.FAILURE_PATTERNS";

export const competitorsQuery = (validationId: string) =>
  queryOptions({
    queryKey: competitorsKey(validationId),
    queryFn: async (): Promise<CompetitorsData> => {
      const data = await sendJson<{
        items: Competitor[];
        patterns: ValidationAnswer[];
        guidance: CompetitorsData["guidance"];
      }>("GET", `${validationUrl(validationId)}/competitors`);
      return { items: data.items, answers: data.patterns, guidance: data.guidance };
    },
  });

export const createCompetitor = (validationId: string, body: Record<string, unknown>) =>
  sendJson<Competitor>("POST", `${validationUrl(validationId)}/competitors`, body);

export const deleteCompetitor = (competitorId: string) =>
  sendJson<null>("DELETE", `/api/v1/competitors/${competitorId}`);

export const COMPETITOR_TYPES = ["direct", "indirect", "substitute"] as const;

/** The fields of a competitor card (design-spec 6.10); the evidence is a part of its own. */
export function competitorSpecs(t: TFunction): FieldSpec[] {
  const typeLabels = {
    direct: t("research:competitors.types.direct"),
    indirect: t("research:competitors.types.indirect"),
    substitute: t("research:competitors.types.substitute"),
  };
  return [
    { kind: "text", key: "name", required: true, label: t("research:competitors.fields.name") },
    {
      kind: "choice",
      control: "picker",
      key: "type",
      label: t("research:competitors.fields.type"),
      options: COMPETITOR_TYPES.map((type) => ({ id: type, label: typeLabels[type] })),
    },
    {
      kind: "longText",
      key: "targetCustomer",
      label: t("research:competitors.fields.targetCustomer"),
    },
    { kind: "longText", key: "offering", label: t("research:competitors.fields.offering") },
    { kind: "money", key: "typicalPrice", label: t("research:competitors.fields.typicalPrice") },
    { kind: "longText", key: "priceNote", label: t("research:competitors.fields.priceNote") },
    { kind: "longText", key: "strength", label: t("research:competitors.fields.strength") },
    { kind: "longText", key: "weakness", label: t("research:competitors.fields.weakness") },
    { kind: "longText", key: "whyChosen", label: t("research:competitors.fields.whyChosen") },
    { kind: "longText", key: "whySurvive", label: t("research:competitors.fields.whySurvive") },
  ];
}

// ---- 16: assumptions and risks ----

export const assumptionsQuery = (validationId: string) =>
  queryOptions({
    queryKey: assumptionsKey(validationId),
    queryFn: () =>
      sendJson<{ items: Assumption[] }>("GET", `${validationUrl(validationId)}/assumptions`),
  });

/** The risks as the server orders them: placed rows first, then Impact and Probability, high first. */
export const risksQuery = (validationId: string) =>
  queryOptions({
    queryKey: risksKey(validationId),
    queryFn: () => sendJson<{ items: Risk[] }>("GET", `${validationUrl(validationId)}/risks`),
  });

export const createAssumption = (validationId: string, body: Record<string, unknown>) =>
  sendJson<Assumption>("POST", `${validationUrl(validationId)}/assumptions`, body);

export const createRisk = (validationId: string, body: Record<string, unknown>) =>
  sendJson<Risk>("POST", `${validationUrl(validationId)}/risks`, body);

export const deleteAssumption = (id: string) =>
  sendJson<null>("DELETE", `/api/v1/assumptions/${id}`);

export const deleteRisk = (id: string) => sendJson<null>("DELETE", `/api/v1/risks/${id}`);

/** V17: places the rows in this order (a risk list leaves the automatic order for good). */
export const putOrder = (validationId: string, list: OrderList, ids: string[]) =>
  sendJson<null>("PUT", `${validationUrl(validationId)}/${list}/order`, { ids });

/** The ids with `id` one place earlier or later, or null at either end. */
export function movedIds(ids: readonly string[], id: string, direction: "up" | "down") {
  const from = ids.indexOf(id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

export const LEVELS = confidenceSchema.options;

/** The catalog text of a Low / Medium / High level. */
export const levelLabel = (t: TFunction, level: Confidence) =>
  t(`validation:fau.confidence.${level}`);

/** The fields of an assumption (design-spec 6.10). The evidence is a part of its own. */
export function assumptionSpecs(t: TFunction): FieldSpec[] {
  return [
    {
      kind: "text",
      key: "statement",
      required: true,
      label: t("research:assumptions.fields.statement"),
    },
    { kind: "longText", key: "whyBelieve", label: t("research:assumptions.fields.whyBelieve") },
    { kind: "longText", key: "evidenceNote", label: t("research:assumptions.fields.evidenceNote") },
    {
      kind: "choice",
      control: "segmented",
      key: "confidence",
      label: t("research:assumptions.fields.confidence"),
      options: LEVELS.map((level) => ({ id: level, label: levelLabel(t, level) })),
    },
    {
      kind: "longText",
      key: "disproveCondition",
      label: t("research:assumptions.fields.disproveCondition"),
    },
    { kind: "longText", key: "nextCheck", label: t("research:assumptions.fields.nextCheck") },
  ];
}

/** The fields of a risk (design-spec 6.10). */
export function riskSpecs(t: TFunction): FieldSpec[] {
  const levels = LEVELS.map((level) => ({ id: level, label: levelLabel(t, level) }));
  return [
    { kind: "text", key: "statement", required: true, label: t("research:risks.fields.statement") },
    {
      kind: "choice",
      control: "picker",
      key: "probability",
      label: t("research:risks.fields.probability"),
      options: levels,
    },
    {
      kind: "choice",
      control: "picker",
      key: "impact",
      label: t("research:risks.fields.impact"),
      options: levels,
    },
    { kind: "longText", key: "whyMatters", label: t("research:risks.fields.whyMatters") },
    { kind: "longText", key: "mitigation", label: t("research:risks.fields.mitigation") },
    { kind: "longText", key: "howToValidate", label: t("research:risks.fields.howToValidate") },
  ];
}

/** The 16 search parameters (SDD 4). `row` may name an assumption or a risk, and picks the tab. */
export const assumptionsSearchSchema = z.object({
  tab: z.enum(["assumptions", "risks"]).optional().catch(undefined),
  row: z.uuid().optional().catch(undefined),
});
export type AssumptionsSearch = z.infer<typeof assumptionsSearchSchema>;

/** The 15 search parameters (SDD 4). */
export const competitorsSearchSchema = z.object({
  view: z.enum(["cards", "table"]).optional().catch(undefined),
  q: z.enum([SURVIVOR_PATTERNS_KEY, FAILURE_PATTERNS_KEY]).optional().catch(undefined),
  row: z.uuid().optional().catch(undefined),
});
export type CompetitorsSearch = z.infer<typeof competitorsSearchSchema>;
