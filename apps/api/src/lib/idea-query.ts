import { schema } from "@moonx/db";
import { decideStage } from "@moonx/domain";
import type { IdeaDecisionFilter, Stage } from "@moonx/schemas";
import { and, asc, desc, eq, ilike, inArray, isNull, ne, or, type SQL, sql } from "drizzle-orm";
import type { Executor } from "./db";
import { type IdeaSummary, loadIdeas } from "./ideas";
import { toPage } from "./page";
import { loadPlanSummaries } from "./plans";

/** The query of I1 as the list function reads it. */
export interface IdeaListFilter {
  stage?: Stage;
  decision: IdeaDecisionFilter;
  proposerId?: string;
  includeArchived: boolean;
  sort: "updated" | "created" | "name";
  q?: string;
}

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

function decisionMatches(filter: IdeaDecisionFilter, latest: string | null): boolean {
  if (filter === "all") return true;
  if (filter === "not_dropped") return latest !== "drop";
  if (filter === "undecided") return latest == null;
  return latest === filter;
}

function orderOf(sort: IdeaListFilter["sort"]): SQL[] {
  if (sort === "created") return [desc(schema.ideas.createdAt), asc(schema.ideas.id)];
  if (sort === "name") return [asc(sql`lower(${schema.ideas.name})`), asc(schema.ideas.id)];
  return [desc(schema.ideas.lastActivityAt), asc(schema.ideas.id)];
}

/**
 * I1 GET. The stage is computed from the plans, never stored, so the SQL side narrows by the
 * stored columns and the stage filter runs on the candidates afterwards. Paging is an offset into
 * that result. `hiddenDroppedCount` is how many ideas only the default Drop filter keeps out of
 * the list, given the other filters (design-spec 6.8).
 */
export async function listIdeas(
  db: Executor,
  workspaceId: string,
  filter: IdeaListFilter,
  offset: number,
  limit: number,
): Promise<{ items: IdeaSummary[]; nextCursor: string | null; hiddenDroppedCount: number }> {
  const needle = filter.q?.trim();
  const where = and(
    eq(schema.ideas.workspaceId, workspaceId),
    filter.includeArchived ? undefined : isNull(schema.ideas.archivedAt),
    filter.proposerId ? eq(schema.ideas.proposerId, filter.proposerId) : undefined,
    needle
      ? or(
          ilike(schema.ideas.name, `%${escapeLike(needle)}%`),
          ilike(schema.ideas.oneLineConcept, `%${escapeLike(needle)}%`),
        )
      : undefined,
  );
  let candidates = await db
    .select({ id: schema.ideas.id, latestDecision: schema.ideas.latestDecision })
    .from(schema.ideas)
    .where(where)
    .orderBy(...orderOf(filter.sort));

  if (filter.stage) {
    const plans = await loadPlanSummaries(
      db,
      workspaceId,
      candidates.map((c) => c.id),
    );
    candidates = candidates.filter(
      (c) =>
        decideStage(
          (plans.get(c.id) ?? []).map((p) => ({
            archived: p.archived,
            latestGoNoGo: p.latestGoNoGo?.value ?? null,
          })),
        ) === filter.stage,
    );
  }

  const hiddenDroppedCount =
    filter.decision === "not_dropped"
      ? candidates.filter((c) => c.latestDecision === "drop").length
      : 0;
  const visible = candidates.filter((c) => decisionMatches(filter.decision, c.latestDecision));
  const page = toPage(
    visible.slice(offset, offset + limit + 1).map((c) => c.id),
    offset,
    limit,
  );

  if (page.items.length === 0)
    return { items: [], nextCursor: page.nextCursor, hiddenDroppedCount };
  const rows = await db.select().from(schema.ideas).where(inArray(schema.ideas.id, page.items));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const loaded = await loadIdeas(
    db,
    workspaceId,
    page.items.map((id) => byId.get(id) as (typeof rows)[number]),
  );
  return {
    items: loaded.map((l) => l.summary),
    nextCursor: page.nextCursor,
    hiddenDroppedCount,
  };
}

/** D1: the ideas the dashboard lists (not archived, not Drop), newest activity first. */
export async function listDashboardIdeas(
  db: Executor,
  workspaceId: string,
): Promise<{ items: IdeaSummary[]; droppedCount: number }> {
  const rows = await db
    .select()
    .from(schema.ideas)
    .where(
      and(
        eq(schema.ideas.workspaceId, workspaceId),
        isNull(schema.ideas.archivedAt),
        or(isNull(schema.ideas.latestDecision), ne(schema.ideas.latestDecision, "drop")),
      ),
    )
    .orderBy(...orderOf("updated"));
  const [dropped] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.ideas)
    .where(
      and(
        eq(schema.ideas.workspaceId, workspaceId),
        isNull(schema.ideas.archivedAt),
        eq(schema.ideas.latestDecision, "drop"),
      ),
    );
  const loaded = await loadIdeas(db, workspaceId, rows);
  return { items: loaded.map((l) => l.summary), droppedCount: dropped?.n ?? 0 };
}
