import {
  assumptionContent,
  assumptions,
  businessPlanContent,
  businessPlans,
  competitorContent,
  competitors,
  costItemContent,
  costItems,
  type DatabaseTransaction,
  economicsInputContent,
  economicsInputs,
  evidenceLinks,
  executionItemContent,
  executionItems,
  ideaContent,
  ideas,
  memberships,
  planAnswerContent,
  planAnswers,
  researchLogContent,
  researchLogEntries,
  riskContent,
  risks,
  selfAnalyses,
  selfAnalysisAnswerContent,
  selfAnalysisAnswers,
  templateVersionContent,
  templateVersions,
  users,
  validationAnswerContent,
  validationAnswers,
  validations,
} from "@moonx/db";
import type { TargetRef } from "@moonx/schemas";
import { and, eq, inArray, isNull, ne, type SQL } from "drizzle-orm";
import { ApiError } from "./errors";
import type { HistoryChange } from "./history";
import { attachedEvidenceIds, type EvidenceRef } from "./validation-items";
import { sameContent } from "./validation-writes";

// How H2 and H3 put an item back (SDD 5.11): from the content its history keeps
// (packages/db history-values.ts) to its columns, its evidence links and its deletion.
// No version is compared: reverting is a deliberate overwrite.

/** What H2 or H3 sets an item to. */
export type Restoration =
  /** The content a history row kept: what a change left (H2), or found (H3). */
  | { kind: "content"; content: unknown }
  /** H2 of a deletion: the row comes back as it was deleted. */
  | { kind: "undelete" }
  /** H3 of a creation: a row is deleted again, a keyed item emptied. */
  | { kind: "absent" };

/** An item as stored, for H2's answer. */
export interface StoredItem {
  /** Its content as the history keeps it; null for a deleted row. */
  value: unknown;
  deleted: boolean;
  lockVersion: number;
  updatedAt: Date | null;
  updatedById: string | null;
}

/** Where and as whom items are restored. */
export interface RestoreContext {
  tx: DatabaseTransaction;
  /** For a plan, the time `planContentTime` gives (SDD 6.3「+ changes」). */
  at: Date;
  userId: string;
  /** The container the history rows are filed under: every item must be in it. */
  containerId: string;
  /** The workspace whose members an execution item may be assigned to; null for a self-analysis. */
  workspaceId: string | null;
}

interface Stored extends StoredItem {
  /** The content, or for a keyed item never saved, its empty content. */
  content: unknown;
  /** Whether a row exists: a keyed item has none until its first save. */
  exists: boolean;
}

interface Store {
  /**
   * What the item is when absent: a keyed item's empty content, null for a row (which
   * is deleted), undefined for what only undoing its creation removes.
   */
  empty: unknown;
  read(): Promise<Stored>;
  /** Stores `content`, bringing a deleted row back; the content as stored after. */
  write(stored: Stored, content: unknown): Promise<unknown>;
  /** Deletes a row logically, as its screen does; its version stays. */
  remove(): Promise<void>;
}

const notInContainer = (target: TargetRef) =>
  new Error(
    `${target.type} ${target.id} is not in the container it is filed under`,
  );

/**
 * Attaches the evidence links `ids` name to the item and detaches the others, as M2
 * would one by one. A link of another item, or gone, is left alone.
 *
 * @returns The ids attached after, oldest first.
 */
async function setEvidence(
  tx: DatabaseTransaction,
  validationId: string,
  ref: EvidenceRef,
  ids: readonly string[],
  at: Date,
): Promise<string[]> {
  const links = await tx
    .select({ id: evidenceLinks.id, deletedAt: evidenceLinks.deletedAt })
    .from(evidenceLinks)
    .where(
      and(
        eq(evidenceLinks.validationId, validationId),
        eq(evidenceLinks.targetType, ref.type),
        eq(evidenceLinks.targetId, ref.id),
        ref.key == null
          ? isNull(evidenceLinks.targetKey)
          : eq(evidenceLinks.targetKey, ref.key),
      ),
    )
    .for("update");
  const wanted = new Set(ids);
  const attach = links.filter(
    (link) => wanted.has(link.id) && link.deletedAt !== null,
  );
  const detach = links.filter(
    (link) => !wanted.has(link.id) && link.deletedAt === null,
  );
  if (attach.length > 0) {
    await tx
      .update(evidenceLinks)
      .set({ deletedAt: null, updatedAt: at })
      .where(
        inArray(
          evidenceLinks.id,
          attach.map((link) => link.id),
        ),
      );
  }
  if (detach.length > 0) {
    await tx
      .update(evidenceLinks)
      .set({ deletedAt: at, updatedAt: at })
      .where(
        inArray(
          evidenceLinks.id,
          detach.map((link) => link.id),
        ),
      );
  }
  return attachedEvidenceIds(tx, validationId, ref);
}

const evidenceIdsOf = (content: unknown): string[] =>
  ((content as { evidenceIds?: string[] } | null)?.evidenceIds ?? []).filter(
    (id) => typeof id === "string",
  );

/** The columns a content sets: every field but the evidence, kept in its links. */
const columnsOf = (content: object): Record<string, unknown> => {
  const { evidenceIds: _, ...columns } = content as Record<string, unknown>;
  return columns;
};

/**
 * The store of a keyed item of `table` (an answer, a number): one row per container and
 * key, made by the first save.
 */
function keyedStore(
  ctx: RestoreContext,
  options: {
    table:
      | typeof validationAnswers
      | typeof economicsInputs
      | typeof selfAnalysisAnswers
      | typeof planAnswers;
    where: SQL;
    /** The container and key columns of a new row. */
    key: Record<string, unknown>;
    /** The content, normalized, with the evidence ids given. */
    content: (values: Record<string, unknown>, evidenceIds: string[]) => object;
    empty: object;
    evidence?: { validationId: string; ref: EvidenceRef };
  },
): Store {
  const { tx, at, userId } = ctx;
  const table = options.table as typeof validationAnswers;
  let row:
    | (typeof validationAnswers.$inferSelect & Record<string, unknown>)
    | undefined;
  return {
    empty: options.empty,
    async read() {
      [row] = (await tx
        .select()
        .from(table)
        .where(options.where)
        .for("update")) as (typeof row)[];
      const ids =
        row === undefined || options.evidence === undefined
          ? []
          : await attachedEvidenceIds(
              tx,
              options.evidence.validationId,
              options.evidence.ref,
            );
      const content =
        row === undefined ? options.empty : options.content(row, ids);
      return {
        content,
        value: content,
        exists: row !== undefined,
        deleted: false,
        lockVersion: row?.lockVersion ?? 0,
        updatedAt: row?.updatedAt ?? null,
        updatedById: row?.updatedById ?? null,
      };
    },
    async write(stored, content) {
      const values = columnsOf(
        options.content(content as Record<string, unknown>, []),
      );
      if (row === undefined) {
        await tx.insert(table).values({
          ...options.key,
          ...values,
          lockVersion: 1,
          updatedById: userId,
          createdAt: at,
          updatedAt: at,
        } as typeof validationAnswers.$inferInsert);
      } else {
        await tx
          .update(table)
          .set({
            ...values,
            lockVersion: stored.lockVersion + 1,
            updatedAt: at,
            updatedById: userId,
          })
          .where(options.where);
      }
      const ids =
        options.evidence === undefined
          ? []
          : await setEvidence(
              tx,
              options.evidence.validationId,
              options.evidence.ref,
              evidenceIdsOf(content),
              at,
            );
      return options.content(values, ids);
    },
    async remove() {
      throw new Error("A keyed item is never deleted");
    },
  };
}

type RowTable =
  | typeof researchLogEntries
  | typeof competitors
  | typeof assumptions
  | typeof risks
  | typeof costItems
  | typeof executionItems;

/** The store of a row of a list (14–17, 22): made, edited and deleted one by one. */
function rowStore(
  ctx: RestoreContext,
  target: TargetRef,
  options: {
    table: RowTable;
    /** The validation or plan the row is in. */
    containerOf: (row: Record<string, unknown>) => unknown;
    content: (values: Record<string, unknown>, evidenceIds: string[]) => object;
    /** Columns a change sets besides the content's (an execution item's stamps). */
    extra?: (
      row: Record<string, unknown>,
      values: Record<string, unknown>,
    ) => Promise<Record<string, unknown>> | Record<string, unknown>;
    /** Turns a content into the one the row may hold now (an assignee who left). */
    fit?: (values: Record<string, unknown>) => Promise<Record<string, unknown>>;
    evidence?: (row: Record<string, unknown>) => {
      validationId: string;
      ref: EvidenceRef;
    };
  },
): Store {
  const { tx, at, userId } = ctx;
  const table = options.table as typeof competitors;
  let row:
    | (typeof competitors.$inferSelect & Record<string, unknown>)
    | undefined;
  const evidence = () =>
    options.evidence === undefined || row === undefined
      ? undefined
      : options.evidence(row);
  return {
    empty: null,
    async read() {
      [row] = (await tx
        .select()
        .from(table)
        .where(eq(table.id, target.id))
        .for("update")) as (typeof row)[];
      if (row === undefined) {
        throw new ApiError("NOT_FOUND", "The item no longer exists");
      }
      if (options.containerOf(row) !== ctx.containerId) {
        throw notInContainer(target);
      }
      const linked = evidence();
      const ids =
        linked === undefined
          ? []
          : await attachedEvidenceIds(tx, linked.validationId, linked.ref);
      const content = options.content(row, ids);
      const deleted = row.deletedAt !== null;
      return {
        content,
        value: deleted ? null : content,
        exists: true,
        deleted,
        lockVersion: row.lockVersion,
        updatedAt: row.updatedAt,
        updatedById: row.updatedById,
      };
    },
    async write(stored, content) {
      if (row === undefined) throw new Error("Read the row first");
      let values = columnsOf(
        options.content(content as Record<string, unknown>, []),
      );
      if (options.fit !== undefined) values = await options.fit(values);
      await tx
        .update(table)
        .set({
          ...values,
          ...(await options.extra?.(row, values)),
          deletedAt: null,
          lockVersion: stored.lockVersion + 1,
          updatedAt: at,
          updatedById: userId,
        })
        .where(eq(table.id, target.id));
      const linked = evidence();
      const ids =
        linked === undefined
          ? []
          : await setEvidence(
              tx,
              linked.validationId,
              linked.ref,
              evidenceIdsOf(content),
              at,
            );
      return options.content(values, ids);
    },
    async remove() {
      await tx
        .update(table)
        .set({ deletedAt: at })
        .where(eq(table.id, target.id));
    },
  };
}

/** When a status stamps `completed_at` (SDD 5.9 P10). */
const completes = (status: unknown) =>
  status === "done" || status === "resolved";

/**
 * The assignee an execution item may have now: a member who is no longer an Owner or
 * Member is named instead, as W3 names them when they leave (design-spec 6.16), so a
 * revert never assigns someone P10 would refuse.
 */
async function fitAssignee(
  ctx: RestoreContext,
  values: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const assigneeUserId = values.assigneeUserId as string | null;
  if (assigneeUserId === null || ctx.workspaceId === null) return values;
  const [member] = await ctx.tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.workspaceId, ctx.workspaceId),
        eq(memberships.userId, assigneeUserId),
        inArray(memberships.role, ["owner", "member"]),
      ),
    );
  if (member !== undefined) return values;
  const [user] = await ctx.tx
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, assigneeUserId));
  return {
    ...values,
    assigneeUserId: null,
    assigneeName: user?.displayName ?? null,
  };
}

/** The store of `target`, an item of the container `ctx` restores in. */
function storeOf(ctx: RestoreContext, target: TargetRef): Store {
  const { tx, at } = ctx;
  const key = target.key ?? "";
  const inContainer = () => {
    if (target.id !== ctx.containerId) throw notInContainer(target);
  };
  const validationOf = (row: Record<string, unknown>) => row.validationId;
  const evidenceOn = (row: Record<string, unknown>) => ({
    validationId: row.validationId as string,
    ref: { type: target.type, id: target.id } as EvidenceRef,
  });
  switch (target.type) {
    case "validation_answer":
      inContainer();
      return keyedStore(ctx, {
        table: validationAnswers,
        where: and(
          eq(validationAnswers.validationId, target.id),
          eq(validationAnswers.questionKey, key),
        ) as SQL,
        key: { validationId: target.id, questionKey: key },
        content: (values, ids) =>
          validationAnswerContent(
            values as Parameters<typeof validationAnswerContent>[0],
            ids,
          ),
        empty: validationAnswerContent(
          { text: null, fau: null, confidence: null },
          [],
        ),
        evidence: {
          validationId: target.id,
          ref: { type: "validation_answer", id: target.id, key },
        },
      });
    case "economics_input":
      inContainer();
      return keyedStore(ctx, {
        table: economicsInputs,
        where: and(
          eq(economicsInputs.validationId, target.id),
          eq(
            economicsInputs.fieldKey,
            key as typeof economicsInputs.$inferSelect.fieldKey,
          ),
        ) as SQL,
        key: { validationId: target.id, fieldKey: key },
        content: (values, ids) =>
          economicsInputContent(
            values as Parameters<typeof economicsInputContent>[0],
            ids,
          ),
        empty: economicsInputContent(
          { value: null, fau: null, confidence: null },
          [],
        ),
        evidence: {
          validationId: target.id,
          ref: { type: "economics_input", id: target.id, key },
        },
      });
    case "self_analysis_answer":
      inContainer();
      return keyedStore(ctx, {
        table: selfAnalysisAnswers,
        where: and(
          eq(selfAnalysisAnswers.selfAnalysisId, target.id),
          eq(selfAnalysisAnswers.questionKey, key),
        ) as SQL,
        key: { selfAnalysisId: target.id, questionKey: key },
        content: (values) =>
          selfAnalysisAnswerContent(
            values as Parameters<typeof selfAnalysisAnswerContent>[0],
          ),
        empty: selfAnalysisAnswerContent({ text: null, amount: null }),
      });
    case "plan_answer":
      inContainer();
      return keyedStore(ctx, {
        table: planAnswers,
        where: and(
          eq(planAnswers.businessPlanId, target.id),
          eq(planAnswers.questionKey, key),
        ) as SQL,
        key: { businessPlanId: target.id, questionKey: key },
        content: (values) =>
          planAnswerContent(values as Parameters<typeof planAnswerContent>[0]),
        empty: planAnswerContent({ text: null, rows: null }),
      });
    case "research_log_entry":
      return rowStore(ctx, target, {
        table: researchLogEntries,
        containerOf: validationOf,
        content: (values) =>
          researchLogContent(
            values as Parameters<typeof researchLogContent>[0],
          ),
      });
    case "competitor":
      return rowStore(ctx, target, {
        table: competitors,
        containerOf: validationOf,
        content: (values, ids) =>
          competitorContent(
            values as Parameters<typeof competitorContent>[0],
            ids,
          ),
        evidence: evidenceOn,
      });
    case "assumption":
      return rowStore(ctx, target, {
        table: assumptions,
        containerOf: validationOf,
        content: (values, ids) =>
          assumptionContent(
            values as Parameters<typeof assumptionContent>[0],
            ids,
          ),
        evidence: evidenceOn,
      });
    case "risk":
      return rowStore(ctx, target, {
        table: risks,
        containerOf: validationOf,
        content: (values) =>
          riskContent(values as Parameters<typeof riskContent>[0]),
      });
    case "cost_item":
      return rowStore(ctx, target, {
        table: costItems,
        containerOf: validationOf,
        content: (values, ids) =>
          costItemContent(values as Parameters<typeof costItemContent>[0], ids),
        evidence: evidenceOn,
      });
    case "execution_item":
      return rowStore(ctx, target, {
        table: executionItems,
        containerOf: (row) => row.businessPlanId,
        content: (values) =>
          executionItemContent(
            values as Parameters<typeof executionItemContent>[0],
          ),
        fit: (values) => fitAssignee(ctx, values),
        // As P10 stamps them: a status that completes, a new KPI actual (SDD 5.9).
        extra: (row, values) => ({
          completedAt:
            values.status === row.status
              ? row.completedAt
              : completes(values.status)
                ? at
                : null,
          kpiActualUpdatedAt:
            values.kpiActual === row.kpiActual ? row.kpiActualUpdatedAt : at,
        }),
      });
    case "idea":
      return headerStore(ctx, target, ideas, (values) =>
        ideaContent(values as Parameters<typeof ideaContent>[0]),
      );
    case "business_plan":
      return headerStore(
        ctx,
        target,
        businessPlans,
        (values) =>
          businessPlanContent(
            values as Parameters<typeof businessPlanContent>[0],
          ),
        async (values) => {
          // Plan names are unique in their idea (P2 PATCH), archived plans included.
          const [plan] = await tx
            .select({ ideaId: businessPlans.ideaId })
            .from(businessPlans)
            .where(eq(businessPlans.id, target.id));
          const [taken] = await tx
            .select({ id: businessPlans.id })
            .from(businessPlans)
            .where(
              and(
                eq(businessPlans.ideaId, plan?.ideaId ?? ""),
                eq(businessPlans.name, values.name as string),
                isNull(businessPlans.deletedAt),
                ne(businessPlans.id, target.id),
              ),
            );
          if (taken !== undefined) {
            throw new ApiError(
              "NAME_TAKEN",
              "Another plan of the idea has this name",
            );
          }
        },
      );
    case "template_version":
      return pinnedVersionStore(ctx, target);
    case "pitch_slide":
      throw new Error("The Pitch Deck keeps no history");
  }
}

/** The store of an idea's overview or a plan's header: always there, edited in place. */
function headerStore(
  ctx: RestoreContext,
  target: TargetRef,
  table: typeof ideas | typeof businessPlans,
  content: (values: Record<string, unknown>) => object,
  check?: (values: Record<string, unknown>) => Promise<void>,
): Store {
  const { tx, at, userId } = ctx;
  const t = table as typeof ideas;
  let row: (typeof ideas.$inferSelect & Record<string, unknown>) | undefined;
  return {
    empty: undefined,
    async read() {
      if (target.id !== ctx.containerId) throw notInContainer(target);
      [row] = (await tx
        .select()
        .from(t)
        .where(eq(t.id, target.id))) as (typeof row)[];
      if (row === undefined) throw new Error(`No ${target.type} ${target.id}`);
      const stored = content(row);
      return {
        content: stored,
        value: stored,
        exists: true,
        deleted: false,
        lockVersion: row.lockVersion,
        updatedAt: row.updatedAt,
        updatedById: row.updatedById,
      };
    },
    async write(stored, wanted) {
      const values = content(wanted as Record<string, unknown>);
      await check?.(values as Record<string, unknown>);
      await tx
        .update(t)
        .set({
          ...values,
          lockVersion: stored.lockVersion + 1,
          updatedAt: at,
          updatedById: userId,
        })
        .where(eq(t.id, target.id));
      return values;
    },
    async remove() {
      throw new Error("Undoing a creation removes ideas and plans (H3)");
    },
  };
}

/** The store of the template version a container is pinned to (H3 of a migration). */
function pinnedVersionStore(ctx: RestoreContext, target: TargetRef): Store {
  const { tx } = ctx;
  const tables = {
    self_analysis: selfAnalyses,
    validation: validations,
    business_plan: businessPlans,
  } as const;
  const kind = target.key as keyof typeof tables;
  const table = tables[kind] as typeof validations | undefined;
  if (table === undefined) throw new Error(`No template kind ${target.key}`);
  return {
    empty: undefined,
    async read() {
      if (target.id !== ctx.containerId) throw notInContainer(target);
      const [row] = await tx
        .select({
          versionId: templateVersions.id,
          versionNumber: templateVersions.versionNumber,
        })
        .from(table)
        .innerJoin(
          templateVersions,
          eq(templateVersions.id, table.templateVersionId),
        )
        .where(eq(table.id, target.id));
      if (row === undefined) throw new Error(`No ${kind} ${target.id}`);
      const content = templateVersionContent(row);
      return {
        content,
        value: content,
        exists: true,
        deleted: false,
        lockVersion: 0,
        updatedAt: null,
        updatedById: null,
      };
    },
    async write(_stored, wanted) {
      const { versionId } = wanted as { versionId: string };
      const [version] = await tx
        .select({
          versionId: templateVersions.id,
          versionNumber: templateVersions.versionNumber,
        })
        .from(templateVersions)
        .where(eq(templateVersions.id, versionId));
      if (version === undefined) {
        throw new Error(`No template version ${versionId}`);
      }
      await tx
        .update(table)
        .set({ templateVersionId: version.versionId })
        .where(eq(table.id, target.id));
      return templateVersionContent(version);
    },
    async remove() {
      throw new Error("A pinned version is never removed");
    },
  };
}

/**
 * Puts `target` as `restoration` says, in the container `ctx` names. A deleted row comes
 * back as `restore`, a row made absent is deleted as on its screen, and anything else
 * is an update (a create for a keyed item never saved).
 *
 * @returns The change for the history, or null when the item already is so, and the
 * item as stored after.
 * @throws {ApiError} NAME_TAKEN when a plan's old name is taken now, NOT_FOUND when a
 * row no longer exists
 */
export async function restoreItem(
  ctx: RestoreContext,
  target: TargetRef,
  restoration: Restoration,
): Promise<{ change: HistoryChange | null; item: StoredItem }> {
  const store = storeOf(ctx, target);
  const stored = await store.read();
  const unchanged = { change: null, item: stored };
  const wanted =
    restoration.kind === "undelete"
      ? stored.content
      : restoration.kind === "content" && restoration.content !== null
        ? restoration.content
        : store.empty;
  if (wanted === undefined) {
    throw new Error(
      `A ${target.type} is never made absent but by undoing a creation`,
    );
  }
  if (wanted === null) {
    if (stored.deleted) return unchanged;
    await store.remove();
    return {
      change: { target, action: "delete", before: stored.content, after: null },
      item: { ...stored, value: null, deleted: true },
    };
  }
  if (!stored.deleted && sameContent(stored.content, wanted)) return unchanged;
  const after = await store.write(stored, wanted);
  const item: StoredItem = {
    value: after,
    deleted: false,
    lockVersion: stored.lockVersion + 1,
    updatedAt: ctx.at,
    updatedById: ctx.userId,
  };
  if (stored.deleted) {
    return { change: { target, action: "restore", before: null, after }, item };
  }
  return {
    change: stored.exists
      ? { target, action: "update", before: stored.content, after }
      : { target, action: "create", before: null, after },
    item,
  };
}
