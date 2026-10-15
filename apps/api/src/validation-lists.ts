import {
  assumptionContent,
  assumptions,
  competitorContent,
  competitors,
  costItems,
  type Database,
  type DatabaseTransaction,
  riskContent,
  risks,
  templateCheckRules,
} from "@moonx/db";
import { COMPETITORS_GUIDE_MAX } from "@moonx/domain";
import {
  type Assumption,
  assumptionCreateSchema,
  assumptionListSchema,
  assumptionSchema,
  assumptionUpdateSchema,
  type Competitor,
  type Confidence,
  checkRuleSchema,
  competitorCreateSchema,
  competitorListSchema,
  competitorSchema,
  competitorUpdateSchema,
  errorBodySchema,
  listOrderSchema,
  type Risk,
  riskCreateSchema,
  riskListSchema,
  riskSchema,
  riskUpdateSchema,
} from "@moonx/schemas";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import type { AccessPlugin } from "./access";
import { withHistory } from "./history";
import { recordChange, type Scope, writeInScope } from "./scope";
import { loadUserRefs } from "./user-refs";
import { answerViews, findQuestion, validationTemplate } from "./validation";
import {
  attachedEvidenceIds,
  type EvidenceRef,
  loadCommentCounts,
  loadEvidence,
} from "./validation-items";
import {
  deleteListRow,
  invalid,
  listRowLocator,
  lockListRow,
  nextSortOrder,
  updateListRow,
  validationOperation,
  versionedView,
} from "./validation-writes";

type Executor = Database | DatabaseTransaction;
type CompetitorRow = typeof competitors.$inferSelect;
type AssumptionRow = typeof assumptions.$inferSelect;
type RiskRow = typeof risks.$inferSelect;

/** The questions 15 shows below the cards (design-spec 6.10), answered through V3. */
const PATTERN_KEYS = ["V.04.SURVIVOR_PATTERNS", "V.04.FAILURE_PATTERNS"];

const noContent = z.undefined().meta({ description: "No content" });

/**
 * The evidence of rows without F/A/U, and the users and comments their views name. A
 * link to a deleted research log is left out: such a row has no "Fact · No evidence" to
 * keep it by (design-spec 6.0.3).
 */
async function rowExtras(
  db: Executor,
  workspaceId: string,
  validationId: string,
  type: EvidenceRef["type"] | "risk",
  rows: readonly { id: string; updatedById: string | null }[],
) {
  const refs = rows.map((row) => ({ type, id: row.id }));
  const evidence =
    type === "risk"
      ? null
      : await loadEvidence(
          db,
          validationId,
          rows.map((row) => ({ type, id: row.id })),
        );
  const comments = await loadCommentCounts(db, refs);
  const users = await loadUserRefs(
    db,
    rows.flatMap((row) => (row.updatedById === null ? [] : [row.updatedById])),
    workspaceId,
  );
  return {
    users,
    comments: (id: string) => comments({ type, id }),
    evidence: (id: string) =>
      (
        evidence?.({ type: type as EvidenceRef["type"], id }).evidence ?? []
      ).filter(
        (item) => item.researchLog === null || !item.researchLog.deleted,
      ),
  };
}

async function competitorViews(
  db: Executor,
  workspaceId: string,
  validationId: string,
  rows: readonly CompetitorRow[],
): Promise<Competitor[]> {
  const extras = await rowExtras(
    db,
    workspaceId,
    validationId,
    "competitor",
    rows,
  );
  return rows.map((row) => {
    const { evidenceIds: _, ...content } = competitorContent(row, []);
    return {
      id: row.id,
      ...content,
      evidence: extras.evidence(row.id),
      sortOrder: row.sortOrder,
      commentCount: extras.comments(row.id),
      ...versionedView(row, extras.users),
    };
  });
}

async function assumptionViews(
  db: Executor,
  workspaceId: string,
  validationId: string,
  rows: readonly AssumptionRow[],
): Promise<Assumption[]> {
  const extras = await rowExtras(
    db,
    workspaceId,
    validationId,
    "assumption",
    rows,
  );
  return rows.map((row) => {
    const { evidenceIds: _, ...content } = assumptionContent(row, []);
    return {
      id: row.id,
      ...content,
      evidence: extras.evidence(row.id),
      sortOrder: row.sortOrder,
      commentCount: extras.comments(row.id),
      ...versionedView(row, extras.users),
    };
  });
}

async function riskViews(
  db: Executor,
  workspaceId: string,
  validationId: string,
  rows: readonly RiskRow[],
): Promise<Risk[]> {
  const extras = await rowExtras(db, workspaceId, validationId, "risk", rows);
  return rows.map((row) => ({
    id: row.id,
    ...riskContent(row),
    sortOrder: row.sortOrder,
    commentCount: extras.comments(row.id),
    ...versionedView(row, extras.users),
  }));
}

const liveCompetitors = (db: Executor, validationId: string) =>
  db
    .select()
    .from(competitors)
    .where(
      and(
        eq(competitors.validationId, validationId),
        isNull(competitors.deletedAt),
      ),
    )
    .orderBy(
      asc(competitors.sortOrder),
      asc(competitors.createdAt),
      asc(competitors.id),
    );

const liveAssumptions = (db: Executor, validationId: string) =>
  db
    .select()
    .from(assumptions)
    .where(
      and(
        eq(assumptions.validationId, validationId),
        isNull(assumptions.deletedAt),
      ),
    )
    .orderBy(
      asc(assumptions.sortOrder),
      asc(assumptions.createdAt),
      asc(assumptions.id),
    );

/** Low, Medium, High from the bottom; a level not set ranks below Low. */
const RANK: Record<Confidence, number> = { low: 1, medium: 2, high: 3 };
const rank = (level: Confidence | null) => (level === null ? 0 : RANK[level]);

/**
 * The risks of 16 in their order (SDD 5.7 V10): those put in order by hand first, then
 * the others by Impact and Probability, highest first; ties in the order they were made.
 */
export function orderRisks<
  R extends {
    id: string;
    sortOrder: number | null;
    impact: Confidence | null;
    probability: Confidence | null;
    createdAt: Date;
  },
>(rows: readonly R[]): R[] {
  const made = (a: R, b: R) =>
    a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
  return rows.toSorted((a, b) => {
    if (a.sortOrder !== null || b.sortOrder !== null) {
      if (a.sortOrder === null) return 1;
      if (b.sortOrder === null) return -1;
      return a.sortOrder - b.sortOrder || made(a, b);
    }
    return (
      rank(b.impact) - rank(a.impact) ||
      rank(b.probability) - rank(a.probability) ||
      made(a, b)
    );
  });
}

const liveRisks = async (db: Executor, validationId: string) =>
  orderRisks(
    await db
      .select()
      .from(risks)
      .where(
        and(eq(risks.validationId, validationId), isNull(risks.deletedAt)),
      ),
  );

const viewOne = async <R, V>(
  rows: Promise<R[]>,
  views: (rows: readonly R[]) => Promise<V[]>,
): Promise<V> => {
  const [view] = await views(await rows);
  if (view === undefined) throw new Error("The row is gone");
  return view;
};

/** The competitors' guide of 15: the template's threshold and the fixed upper end. */
async function competitorGuidance(db: Executor, templateVersionId: string) {
  const [rule] = await db
    .select({
      checkKey: templateCheckRules.checkKey,
      params: templateCheckRules.params,
    })
    .from(templateCheckRules)
    .where(
      and(
        eq(templateCheckRules.templateVersionId, templateVersionId),
        eq(templateCheckRules.checkKey, "competitors"),
      ),
    );
  if (rule === undefined) {
    throw new Error(
      `Template version ${templateVersionId} lacks a check threshold`,
    );
  }
  const parsed = checkRuleSchema.parse(rule);
  if (parsed.checkKey !== "competitors")
    throw new Error("Not the competitors rule");
  return { min: parsed.params.min, max: COMPETITORS_GUIDE_MAX };
}

const competitorLocator = listRowLocator(competitors, "competitorId");
const assumptionLocator = listRowLocator(assumptions, "id");
const riskLocator = listRowLocator(risks, "id");

/** The lists V17 orders, by their path segment. */
const ORDERED_LISTS = {
  competitors,
  assumptions,
  risks,
  "cost-items": costItems,
} as const;

/** What the list routes need from the app. */
export interface ValidationListRoutesOptions {
  access: AccessPlugin;
  db: Database;
  now: () => number;
}

const readErrors = {
  401: errorBodySchema,
  403: errorBodySchema,
  404: errorBodySchema,
} as const;
const writeErrors = {
  ...readErrors,
  409: errorBodySchema,
  422: errorBodySchema,
} as const;

/**
 * V8–V11 and V17 (SDD 5.7): the competitors of 15, the assumptions and risks of 16,
 * and the order of their lists and of the cost tables.
 */
export function validationListRoutes({
  access,
  db,
  now,
}: ValidationListRoutesOptions) {
  /** Reorders the rows of one list as `ids` says (V17). */
  const reorder = async (
    tx: DatabaseTransaction,
    list: keyof typeof ORDERED_LISTS,
    validationId: string,
    body: z.infer<typeof listOrderSchema>,
  ) => {
    const table = ORDERED_LISTS[list] as typeof competitors;
    if (list === "cost-items" && body.category === undefined) {
      throw invalid("category", "invalid_type", "Name the cost table to order");
    }
    if (list !== "cost-items" && body.category !== undefined) {
      throw invalid(
        "category",
        "unrecognized_keys",
        "Only cost rows have tables",
      );
    }
    const rows = await tx
      .select({ id: table.id, sortOrder: table.sortOrder })
      .from(table)
      .where(
        and(
          eq(table.validationId, validationId),
          isNull(table.deletedAt),
          body.category === undefined
            ? undefined
            : eq(costItems.category, body.category),
        ),
      )
      .for("update");
    const stored = new Map(rows.map((row) => [row.id, row.sortOrder]));
    if (
      body.ids.length !== rows.length ||
      new Set(body.ids).size !== body.ids.length ||
      body.ids.some((id) => !stored.has(id))
    ) {
      throw invalid(
        "ids",
        "invalid_value",
        "Send every row of the list once, and nothing else",
      );
    }
    let changed = false;
    for (const [index, id] of body.ids.entries()) {
      if (stored.get(id) === index) continue;
      changed = true;
      await tx.update(table).set({ sortOrder: index }).where(eq(table.id, id));
    }
    // No history and no version (SDD 5.7 V17), but the list did change.
    if (changed) recordChange(tx);
  };

  const order = async (
    scope: Scope,
    list: keyof typeof ORDERED_LISTS,
    validationId: string,
    body: z.infer<typeof listOrderSchema>,
  ) => {
    await writeInScope(db, scope, new Date(now()), (tx) =>
      reorder(tx, list, validationId, body),
    );
  };
  const orderOptions = (list: keyof typeof ORDERED_LISTS) =>
    ({
      scoped: { to: "validationId", need: "writeUnarchived" },
      body: listOrderSchema,
      parse: "json",
      response: { 204: noContent, ...writeErrors },
      detail: {
        summary: `V17 Order the ${list}`,
        description:
          "ids are every row of the list not deleted (of the table named by category, for cost rows), in the new order. Writes no history and changes no version. Risks keep the order by hand from then on.",
      },
    }) as const;

  return new Elysia()
    .use(access)
    .get(
      "/api/v1/validations/:validationId/competitors",
      async ({ scope, params }) => {
        const { validationId } = params;
        const { templateVersionId, sections } = await validationTemplate(
          db,
          validationId,
        );
        const questions = PATTERN_KEYS.flatMap((key) => {
          const question = findQuestion(sections, key);
          return question === undefined ? [] : [question];
        });
        const answers = await answerViews(
          db,
          scope.workspaceId,
          validationId,
          sections,
          questions.map((question) => question.key),
        );
        return {
          items: await competitorViews(
            db,
            scope.workspaceId,
            validationId,
            await liveCompetitors(db, validationId),
          ),
          patterns: questions.map((question, index) => {
            const answer = answers[index];
            if (answer === undefined) throw new Error("No pattern answer");
            return { question, answer };
          }),
          guidance: await competitorGuidance(db, templateVersionId),
        };
      },
      {
        scoped: { to: "validationId", need: "read" },
        response: { 200: competitorListSchema, ...readErrors },
        detail: {
          summary: "V8 The competitors (15)",
          description:
            "items in their order; patterns are V.04.SURVIVOR_PATTERNS and V.04.FAILURE_PATTERNS with their answers (saved through V3); guidance is the check's 3–5.",
        },
      },
    )
    .post(
      "/api/v1/validations/:validationId/competitors",
      async ({ scope, params, body, caller, request, status }) => {
        const { validationId } = params;
        const at = new Date(now());
        const id = await writeInScope(db, scope, at, async (tx) => {
          const [row] = await tx
            .insert(competitors)
            .values({
              validationId,
              name: body.name,
              type: body.type ?? null,
              targetCustomer: body.targetCustomer ?? null,
              offering: body.offering ?? null,
              typicalPrice: body.typicalPrice ?? null,
              priceNote: body.priceNote ?? null,
              strength: body.strength ?? null,
              weakness: body.weakness ?? null,
              whyChosen: body.whyChosen ?? null,
              whySurvive: body.whySurvive ?? null,
              sortOrder: await nextSortOrder(tx, competitors, validationId),
              updatedById: caller.id,
              createdAt: at,
              updatedAt: at,
            })
            .returning();
          if (row === undefined) throw new Error("competitor insert failed");
          await withHistory(
            tx,
            validationOperation(request, scope, validationId, caller.id, at),
            async () => ({
              target: { type: "competitor", id: row.id },
              action: "create",
              before: null,
              after: competitorContent(row, []),
            }),
          );
          return row.id;
        });
        return status(
          201,
          await viewOne(
            db.select().from(competitors).where(eq(competitors.id, id)),
            (rows) =>
              competitorViews(db, scope.workspaceId, validationId, rows),
          ),
        );
      },
      {
        scoped: { to: "validationId", need: "writeUnarchived" },
        body: competitorCreateSchema,
        parse: "json",
        response: { 201: competitorSchema, ...writeErrors },
        detail: {
          summary: "V8 Add a competitor (15)",
          description: "Added at the end of the list.",
        },
      },
    )
    .patch(
      "/api/v1/competitors/:competitorId",
      async ({ scope, params, body, caller, request }) => {
        const at = new Date(now());
        const validationId = await writeInScope(db, scope, at, async (tx) => {
          const row = await lockListRow(tx, competitors, params.competitorId);
          const target = { type: "competitor" as const, id: row.id };
          const evidenceIds = await attachedEvidenceIds(
            tx,
            row.validationId,
            target,
          );
          const values = {
            name: body.name ?? row.name,
            type: body.type === undefined ? row.type : body.type,
            targetCustomer:
              body.targetCustomer === undefined
                ? row.targetCustomer
                : body.targetCustomer,
            offering:
              body.offering === undefined ? row.offering : body.offering,
            typicalPrice:
              body.typicalPrice === undefined
                ? row.typicalPrice
                : body.typicalPrice,
            priceNote:
              body.priceNote === undefined ? row.priceNote : body.priceNote,
            strength:
              body.strength === undefined ? row.strength : body.strength,
            weakness:
              body.weakness === undefined ? row.weakness : body.weakness,
            whyChosen:
              body.whyChosen === undefined ? row.whyChosen : body.whyChosen,
            whySurvive:
              body.whySurvive === undefined ? row.whySurvive : body.whySurvive,
          };
          await updateListRow(tx, {
            table: competitors,
            row,
            target,
            before: competitorContent(row, evidenceIds),
            after: competitorContent(values, evidenceIds),
            values,
            claim: body,
            operation: validationOperation(
              request,
              scope,
              row.validationId,
              caller.id,
              at,
            ),
            workspaceId: scope.workspaceId,
          });
          return row.validationId;
        });
        return viewOne(
          db
            .select()
            .from(competitors)
            .where(eq(competitors.id, params.competitorId)),
          (rows) => competitorViews(db, scope.workspaceId, validationId, rows),
        );
      },
      {
        scoped: { to: competitorLocator, need: "writeUnarchived" },
        body: competitorUpdateSchema,
        parse: "json",
        response: { 200: competitorSchema, ...writeErrors },
        detail: {
          summary: "V9 Edit a competitor (15)",
          description:
            "Only the fields sent change, under the optimistic lock: 409 CONFLICT with the stored row when lockVersion is stale, unless force.",
        },
      },
    )
    .delete(
      "/api/v1/competitors/:competitorId",
      async ({ scope, params, caller, request, set }) => {
        const at = new Date(now());
        await writeInScope(db, scope, at, async (tx) => {
          const row = await lockListRow(tx, competitors, params.competitorId);
          const target = { type: "competitor" as const, id: row.id };
          await deleteListRow(tx, {
            table: competitors,
            id: row.id,
            target,
            before: competitorContent(
              row,
              await attachedEvidenceIds(tx, row.validationId, target),
            ),
            operation: validationOperation(
              request,
              scope,
              row.validationId,
              caller.id,
              at,
            ),
          });
        });
        set.status = 204;
      },
      {
        scoped: { to: competitorLocator, need: "writeUnarchived" },
        response: { 204: noContent, ...readErrors, 409: errorBodySchema },
        detail: {
          summary: "V9 Delete a competitor (15)",
          description:
            "Deletes it logically, its comments with it; the history can restore it.",
        },
      },
    )
    .get(
      "/api/v1/validations/:validationId/assumptions",
      async ({ scope, params }) => ({
        items: await assumptionViews(
          db,
          scope.workspaceId,
          params.validationId,
          await liveAssumptions(db, params.validationId),
        ),
      }),
      {
        scoped: { to: "validationId", need: "read" },
        response: { 200: assumptionListSchema, ...readErrors },
        detail: { summary: "V10 The assumptions (16)" },
      },
    )
    .post(
      "/api/v1/validations/:validationId/assumptions",
      async ({ scope, params, body, caller, request, status }) => {
        const { validationId } = params;
        const at = new Date(now());
        const id = await writeInScope(db, scope, at, async (tx) => {
          const [row] = await tx
            .insert(assumptions)
            .values({
              validationId,
              statement: body.statement,
              whyBelieve: body.whyBelieve ?? null,
              evidenceNote: body.evidenceNote ?? null,
              confidence: body.confidence ?? null,
              disproveCondition: body.disproveCondition ?? null,
              nextCheck: body.nextCheck ?? null,
              sortOrder: await nextSortOrder(tx, assumptions, validationId),
              updatedById: caller.id,
              createdAt: at,
              updatedAt: at,
            })
            .returning();
          if (row === undefined) throw new Error("assumption insert failed");
          await withHistory(
            tx,
            validationOperation(request, scope, validationId, caller.id, at),
            async () => ({
              target: { type: "assumption", id: row.id },
              action: "create",
              before: null,
              after: assumptionContent(row, []),
            }),
          );
          return row.id;
        });
        return status(
          201,
          await viewOne(
            db.select().from(assumptions).where(eq(assumptions.id, id)),
            (rows) =>
              assumptionViews(db, scope.workspaceId, validationId, rows),
          ),
        );
      },
      {
        scoped: { to: "validationId", need: "writeUnarchived" },
        body: assumptionCreateSchema,
        parse: "json",
        response: { 201: assumptionSchema, ...writeErrors },
        detail: {
          summary: "V10 Add an assumption (16)",
          description: "Added at the end of the list.",
        },
      },
    )
    .get(
      "/api/v1/validations/:validationId/risks",
      async ({ scope, params }) => ({
        items: await riskViews(
          db,
          scope.workspaceId,
          params.validationId,
          await liveRisks(db, params.validationId),
        ),
      }),
      {
        scoped: { to: "validationId", need: "read" },
        response: { 200: riskListSchema, ...readErrors },
        detail: {
          summary: "V10 The risks (16)",
          description:
            "Rows put in order by hand first, then the others by Impact and Probability, highest first (a level not set ranks below Low), ties in the order they were made.",
        },
      },
    )
    .post(
      "/api/v1/validations/:validationId/risks",
      async ({ scope, params, body, caller, request, status }) => {
        const { validationId } = params;
        const at = new Date(now());
        const id = await writeInScope(db, scope, at, async (tx) => {
          // Once the list was put in order by hand, new rows go at its end; until
          // then they take their place in the automatic order.
          const [ordered] = await tx
            .select({ id: risks.id })
            .from(risks)
            .where(
              and(
                eq(risks.validationId, validationId),
                isNull(risks.deletedAt),
                sql`${risks.sortOrder} is not null`,
              ),
            )
            .limit(1);
          const [row] = await tx
            .insert(risks)
            .values({
              validationId,
              statement: body.statement,
              probability: body.probability ?? null,
              impact: body.impact ?? null,
              whyMatters: body.whyMatters ?? null,
              mitigation: body.mitigation ?? null,
              howToValidate: body.howToValidate ?? null,
              sortOrder:
                ordered === undefined
                  ? null
                  : await nextSortOrder(tx, risks, validationId),
              updatedById: caller.id,
              createdAt: at,
              updatedAt: at,
            })
            .returning();
          if (row === undefined) throw new Error("risk insert failed");
          await withHistory(
            tx,
            validationOperation(request, scope, validationId, caller.id, at),
            async () => ({
              target: { type: "risk", id: row.id },
              action: "create",
              before: null,
              after: riskContent(row),
            }),
          );
          return row.id;
        });
        return status(
          201,
          await viewOne(
            db.select().from(risks).where(eq(risks.id, id)),
            (rows) => riskViews(db, scope.workspaceId, validationId, rows),
          ),
        );
      },
      {
        scoped: { to: "validationId", need: "writeUnarchived" },
        body: riskCreateSchema,
        parse: "json",
        response: { 201: riskSchema, ...writeErrors },
        detail: {
          summary: "V10 Add a risk (16)",
          description:
            "At the end of a list put in order by hand; otherwise in the automatic order, with sortOrder null.",
        },
      },
    )
    .patch(
      "/api/v1/assumptions/:id",
      async ({ scope, params, body, caller, request }) => {
        const at = new Date(now());
        const validationId = await writeInScope(db, scope, at, async (tx) => {
          const row = await lockListRow(tx, assumptions, params.id);
          const target = { type: "assumption" as const, id: row.id };
          const evidenceIds = await attachedEvidenceIds(
            tx,
            row.validationId,
            target,
          );
          const values = {
            statement: body.statement ?? row.statement,
            whyBelieve:
              body.whyBelieve === undefined ? row.whyBelieve : body.whyBelieve,
            evidenceNote:
              body.evidenceNote === undefined
                ? row.evidenceNote
                : body.evidenceNote,
            confidence:
              body.confidence === undefined ? row.confidence : body.confidence,
            disproveCondition:
              body.disproveCondition === undefined
                ? row.disproveCondition
                : body.disproveCondition,
            nextCheck:
              body.nextCheck === undefined ? row.nextCheck : body.nextCheck,
          };
          await updateListRow(tx, {
            table: assumptions,
            row,
            target,
            before: assumptionContent(row, evidenceIds),
            after: assumptionContent(values, evidenceIds),
            values,
            claim: body,
            operation: validationOperation(
              request,
              scope,
              row.validationId,
              caller.id,
              at,
            ),
            workspaceId: scope.workspaceId,
          });
          return row.validationId;
        });
        return viewOne(
          db.select().from(assumptions).where(eq(assumptions.id, params.id)),
          (rows) => assumptionViews(db, scope.workspaceId, validationId, rows),
        );
      },
      {
        scoped: { to: assumptionLocator, need: "writeUnarchived" },
        body: assumptionUpdateSchema,
        parse: "json",
        response: { 200: assumptionSchema, ...writeErrors },
        detail: {
          summary: "V11 Edit an assumption (16)",
          description:
            "Only the fields sent change, under the optimistic lock: 409 CONFLICT with the stored row when lockVersion is stale, unless force.",
        },
      },
    )
    .delete(
      "/api/v1/assumptions/:id",
      async ({ scope, params, caller, request, set }) => {
        const at = new Date(now());
        await writeInScope(db, scope, at, async (tx) => {
          const row = await lockListRow(tx, assumptions, params.id);
          const target = { type: "assumption" as const, id: row.id };
          await deleteListRow(tx, {
            table: assumptions,
            id: row.id,
            target,
            before: assumptionContent(
              row,
              await attachedEvidenceIds(tx, row.validationId, target),
            ),
            operation: validationOperation(
              request,
              scope,
              row.validationId,
              caller.id,
              at,
            ),
          });
        });
        set.status = 204;
      },
      {
        scoped: { to: assumptionLocator, need: "writeUnarchived" },
        response: { 204: noContent, ...readErrors, 409: errorBodySchema },
        detail: {
          summary: "V11 Delete an assumption (16)",
          description:
            "Deletes it logically, its comments with it; the history can restore it.",
        },
      },
    )
    .patch(
      "/api/v1/risks/:id",
      async ({ scope, params, body, caller, request }) => {
        const at = new Date(now());
        const validationId = await writeInScope(db, scope, at, async (tx) => {
          const row = await lockListRow(tx, risks, params.id);
          const values = {
            statement: body.statement ?? row.statement,
            probability:
              body.probability === undefined
                ? row.probability
                : body.probability,
            impact: body.impact === undefined ? row.impact : body.impact,
            whyMatters:
              body.whyMatters === undefined ? row.whyMatters : body.whyMatters,
            mitigation:
              body.mitigation === undefined ? row.mitigation : body.mitigation,
            howToValidate:
              body.howToValidate === undefined
                ? row.howToValidate
                : body.howToValidate,
          };
          await updateListRow(tx, {
            table: risks,
            row,
            target: { type: "risk", id: row.id },
            before: riskContent(row),
            after: riskContent(values),
            values,
            claim: body,
            operation: validationOperation(
              request,
              scope,
              row.validationId,
              caller.id,
              at,
            ),
            workspaceId: scope.workspaceId,
          });
          return row.validationId;
        });
        return viewOne(
          db.select().from(risks).where(eq(risks.id, params.id)),
          (rows) => riskViews(db, scope.workspaceId, validationId, rows),
        );
      },
      {
        scoped: { to: riskLocator, need: "writeUnarchived" },
        body: riskUpdateSchema,
        parse: "json",
        response: { 200: riskSchema, ...writeErrors },
        detail: {
          summary: "V11 Edit a risk (16)",
          description:
            "Only the fields sent change, under the optimistic lock: 409 CONFLICT with the stored row when lockVersion is stale, unless force.",
        },
      },
    )
    .delete(
      "/api/v1/risks/:id",
      async ({ scope, params, caller, request, set }) => {
        const at = new Date(now());
        await writeInScope(db, scope, at, async (tx) => {
          const row = await lockListRow(tx, risks, params.id);
          await deleteListRow(tx, {
            table: risks,
            id: row.id,
            target: { type: "risk", id: row.id },
            before: riskContent(row),
            operation: validationOperation(
              request,
              scope,
              row.validationId,
              caller.id,
              at,
            ),
          });
        });
        set.status = 204;
      },
      {
        scoped: { to: riskLocator, need: "writeUnarchived" },
        response: { 204: noContent, ...readErrors, 409: errorBodySchema },
        detail: {
          summary: "V11 Delete a risk (16)",
          description:
            "Deletes it logically, its comments with it; the history can restore it.",
        },
      },
    )
    .put(
      "/api/v1/validations/:validationId/competitors/order",
      async ({ scope, params, body, set }) => {
        await order(scope, "competitors", params.validationId, body);
        set.status = 204;
      },
      orderOptions("competitors"),
    )
    .put(
      "/api/v1/validations/:validationId/assumptions/order",
      async ({ scope, params, body, set }) => {
        await order(scope, "assumptions", params.validationId, body);
        set.status = 204;
      },
      orderOptions("assumptions"),
    )
    .put(
      "/api/v1/validations/:validationId/risks/order",
      async ({ scope, params, body, set }) => {
        await order(scope, "risks", params.validationId, body);
        set.status = 204;
      },
      orderOptions("risks"),
    )
    .put(
      "/api/v1/validations/:validationId/cost-items/order",
      async ({ scope, params, body, set }) => {
        await order(scope, "cost-items", params.validationId, body);
        set.status = 204;
      },
      orderOptions("cost-items"),
    );
}
