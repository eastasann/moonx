import { schema } from "@moonx/db";
import { decideStage } from "@moonx/domain";
import type {
  CheckKey,
  CheckState,
  DecisionValue,
  GoNoGoValue,
  KeyMetrics,
  Stage,
  UserRef,
  Versioned,
} from "@moonx/schemas";
import { inArray } from "drizzle-orm";
import type { Executor } from "./db";
import { iso, versionedOf } from "./dto";
import { loadPlanSummaries } from "./plans";
import { loadUserRefs } from "./users";
import {
  computeValidationState,
  LIST_METRIC_KEYS,
  loadValidationData,
  pickMetrics,
  type ValidationData,
  type ValidationState,
} from "./validation-data";

type IdeaRow = typeof schema.ideas.$inferSelect;

/** SDD 5.6 IdeaSummary. */
export interface IdeaSummary {
  id: string;
  name: string;
  oneLineConcept: string;
  proposer: UserRef;
  stage: Stage;
  latestDecision: DecisionValue | null;
  archived: boolean;
  checks: { key: CheckKey; state: CheckState }[];
  keyMetrics: Pick<KeyMetrics, (typeof LIST_METRIC_KEYS)[number]>;
  plans: {
    id: string;
    name: string;
    latestVersionName: string | null;
    latestGoNoGo: GoNoGoValue | null;
  }[];
  lastActivityAt: string;
  createdAt: string;
}

/** SDD 5.6 IdeaDetail. */
export interface IdeaDetail extends IdeaSummary, Versioned {
  workspaceId: string;
  validationId: string;
  proposedSolution: string | null;
  duplicatedFrom: { id: string; name: string } | null;
}

/** An idea with its validation data and calculated state, so callers can reuse them without a second read. */
export interface LoadedIdea {
  row: IdeaRow;
  validationId: string;
  data: ValidationData;
  state: ValidationState;
  summary: IdeaSummary;
  detail: IdeaDetail;
}

/**
 * Builds the summary and detail of ideas of one workspace, the checks and key metrics included,
 * from `packages/domain` over the stored rows (SDD 6.4). The validation data is read for all ideas
 * at once, so a list of 50 ideas costs a fixed number of queries.
 */
export async function loadIdeas(
  db: Executor,
  workspaceId: string,
  rows: IdeaRow[],
): Promise<LoadedIdea[]> {
  if (rows.length === 0) return [];
  const ideaIds = rows.map((r) => r.id);
  const validations = await db
    .select({ id: schema.validations.id, ideaId: schema.validations.ideaId })
    .from(schema.validations)
    .where(inArray(schema.validations.ideaId, ideaIds));
  const validationOfIdea = new Map(validations.map((v) => [v.ideaId, v.id]));
  const data = await loadValidationData(
    db,
    validations.map((v) => v.id),
  );
  const plans = await loadPlanSummaries(db, workspaceId, ideaIds);
  const refs = await loadUserRefs(
    db,
    rows.flatMap((r) => [r.proposerId, r.updatedById]),
    workspaceId,
  );
  const sources = rows.flatMap((r) => (r.duplicatedFromId ? [r.duplicatedFromId] : []));
  const sourceNames = new Map<string, string>();
  if (sources.length > 0) {
    const named = await db
      .select({ id: schema.ideas.id, name: schema.ideas.name })
      .from(schema.ideas)
      .where(inArray(schema.ideas.id, sources));
    for (const n of named) sourceNames.set(n.id, n.name);
  }

  return rows.map((row) => {
    const validationId = validationOfIdea.get(row.id) as string;
    const validationData = data.get(validationId) as ValidationData;
    const state = computeValidationState(validationData, { workspaceId, ideaId: row.id });
    const ideaPlans = plans.get(row.id) ?? [];
    const summary: IdeaSummary = {
      id: row.id,
      name: row.name,
      oneLineConcept: row.oneLineConcept,
      proposer: refs.get(row.proposerId) as UserRef,
      stage: decideStage(
        ideaPlans.map((p) => ({
          archived: p.archived,
          latestGoNoGo: p.latestGoNoGo?.value ?? null,
        })),
      ),
      latestDecision: row.latestDecision,
      archived: row.archivedAt != null,
      checks: state.checks.map((c) => ({ key: c.key, state: c.state })),
      keyMetrics: pickMetrics(state.keyMetrics, LIST_METRIC_KEYS),
      plans: ideaPlans
        .filter((p) => !p.archived)
        .map((p) => ({
          id: p.id,
          name: p.name,
          latestVersionName: p.latestVersion?.name ?? null,
          latestGoNoGo: p.latestGoNoGo?.value ?? null,
        })),
      lastActivityAt: iso(row.lastActivityAt),
      createdAt: iso(row.createdAt),
    };
    const detail: IdeaDetail = {
      ...summary,
      ...versionedOf(row, refs),
      workspaceId,
      validationId,
      proposedSolution: row.proposedSolution,
      duplicatedFrom: row.duplicatedFromId
        ? { id: row.duplicatedFromId, name: sourceNames.get(row.duplicatedFromId) ?? "" }
        : null,
    };
    return { row, validationId, data: validationData, state, summary, detail };
  });
}
