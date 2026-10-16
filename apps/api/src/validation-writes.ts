import { isDeepStrictEqual } from "node:util";
import type {
  assumptions,
  competitors,
  costItems,
  DatabaseTransaction,
  researchLogEntries,
  risks,
} from "@moonx/db";
import {
  type ClassificationInput,
  type Confidence,
  type Fau,
  issueDetails,
  type TargetRef,
  type UserRef,
  uuidSchema,
} from "@moonx/schemas";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { z } from "zod";
import type { ScopeLocator } from "./access";
import { requestContext } from "./entry";
import { ApiError } from "./errors";
import { type HistoryOperation, withHistory } from "./history";
import {
  checkKeyedLockVersion,
  checkLockVersion,
  type LockClaim,
  type LockedItem,
} from "./lock";
import type { Scope } from "./scope";

// What the writes of a validation (V3–V17) share: the history operation they file
// under, the 422s their bodies cannot judge alone, and the list rows of 14–17.

/** The 422 VALIDATION_FAILED of one input the body schema could not judge alone. */
export const invalid = (path: string, code: string, message: string) =>
  new ApiError("VALIDATION_FAILED", message, {
    details: [{ path, code, message }],
  });

/**
 * Checks a number of 17 or 18 against its rule (design-spec 6.0.8). The body schema
 * takes any number, so that a value out of its rule is 422 OUT_OF_RANGE, with the
 * details VALIDATION_FAILED would carry (SDD 5.7 V14・V16, 8.1).
 *
 * @throws {ApiError} OUT_OF_RANGE
 */
export function checkRange(
  path: string,
  rule: z.ZodType<number, number>,
  value: number,
): void {
  const result = rule.safeParse(value);
  if (result.success) return;
  const details = issueDetails(result.error.issues).map((detail) => ({
    ...detail,
    path: detail.path === "" ? path : `${path}.${detail.path}`,
  }));
  throw new ApiError(
    "OUT_OF_RANGE",
    `${path} ${details[0]?.message ?? "is out of range"}`,
    { details },
  );
}

/** One manual save in the validation `validationId`, filed under its screens. */
export const validationOperation = (
  request: Request,
  scope: Scope,
  validationId: string,
  userId: string,
  at: Date,
): HistoryOperation => ({
  container: {
    type: "validation",
    id: validationId,
    workspaceId: scope.workspaceId,
  },
  changedById: userId,
  source: "manual",
  batchId: null,
  client: requestContext(request).client,
  at,
});

/** What a number (a cost row's amount or %, an input of 18) holds of F/A/U. */
export interface NumberClassification {
  fau: Fau | null;
  confidence: Confidence | null;
}

/**
 * The F/A/U rules of a number's save that the request settles alone (design-spec 6.0.3):
 * an Assumption has a confidence and nothing else does, and Unknown comes without a
 * value. Refused rather than dropped, whatever the number holds now.
 *
 * @param valuePath The body path of the value the request sends (not null), or null
 * when it sends none.
 * @throws {ApiError} CONFIDENCE_REQUIRED or VALIDATION_FAILED
 */
export function checkNumberClassification(
  sent: ClassificationInput | undefined,
  valuePath: string | null,
): void {
  if (sent === undefined) return;
  if (sent.fau === "assumption" && sent.confidence == null) {
    throw new ApiError(
      "CONFIDENCE_REQUIRED",
      "An Assumption needs a confidence",
    );
  }
  if (sent.fau !== "assumption" && sent.confidence != null) {
    throw invalid(
      "classification.confidence",
      "invalid_value",
      "Only an Assumption has a confidence",
    );
  }
  if (sent.fau === "unknown" && valuePath !== null) {
    throw invalid(valuePath, "invalid_value", "An Unknown number has no value");
  }
}

/**
 * The F/A/U a number ends up with after a save (design-spec 6.0.3; SDD 5.7 V14 and V16
 * follow V3's rules): Unknown takes the value away, a value typed into an Unknown number
 * makes it Unclassified, and clearing the value clears Fact and Assumption. A Fact or
 * Assumption sent for no value is refused rather than dropped. Whether a new Fact has
 * evidence is the caller's to check, after the lock.
 *
 * @param valueSent Whether the request sends a value (not null) for the number.
 * @param hasValue Whether the number has a value after the save, before Unknown clears it.
 * @param valuePath The body path of the value, for the details.
 * @returns The classification, and whether the value must be cleared (Unknown).
 * @throws {ApiError} CONFIDENCE_REQUIRED or VALIDATION_FAILED
 */
export function classifyNumber(options: {
  current: NumberClassification;
  sent: ClassificationInput | undefined;
  valueSent: boolean;
  hasValue: boolean;
  valuePath: string;
}): NumberClassification & { clearValue: boolean } {
  const { current, sent, valueSent, hasValue, valuePath } = options;
  checkNumberClassification(sent, valueSent ? valuePath : null);
  if (sent === undefined && current.fau === "unknown" && valueSent) {
    return { fau: null, confidence: null, clearValue: false };
  }
  const fau = sent === undefined ? current.fau : sent.fau;
  const confidence =
    sent === undefined ? current.confidence : (sent.confidence ?? null);
  if (fau === "unknown") return { fau, confidence: null, clearValue: true };
  if (!hasValue && (fau === "fact" || fau === "assumption")) {
    if (sent !== undefined) {
      throw invalid(
        "classification.fau",
        "invalid_value",
        "A Fact or Assumption needs a value",
      );
    }
    return { fau: null, confidence: null, clearValue: false };
  }
  return { fau, confidence, clearValue: false };
}

/**
 * Runs `judge`, the checks of a save against what the item holds now, so that a save
 * which read an older version answers 409 CONFLICT, not a 422 that the newer version
 * caused (SDD 5.1「同時編集」; V4 checks the version before judging too). The version is
 * checked only once judging refuses, since a stale save that changes nothing still
 * passes. Run the checks the request settles alone before this, so they keep their 422
 * whatever the version.
 *
 * @param stored The item as stored, or null when it is not saved yet.
 * @param keyed Whether the item is keyed (an answer, a number), whose version 0 claims
 * lose to a stored row even with `force` (`checkKeyedLockVersion`).
 * @throws {ApiError} CONFLICT, or what `judge` throws
 */
export async function judgeAgainstStored<T>(
  tx: DatabaseTransaction,
  options: {
    stored: LockedItem | null;
    claim: LockClaim;
    workspaceId: string;
    keyed: boolean;
  },
  judge: () => T,
): Promise<T> {
  try {
    return judge();
  } catch (error) {
    if (error instanceof ApiError) {
      const check = options.keyed ? checkKeyedLockVersion : checkLockVersion;
      await check(tx, options.stored, options.claim, options.workspaceId);
    }
    throw error;
  }
}

/**
 * Whether a save leaves an item's content as it was, compared as the history keeps it
 * (JSON): a `-0` sent over a stored 0 changes nothing.
 */
export const sameContent = (before: unknown, after: unknown): boolean =>
  isDeepStrictEqual(
    JSON.parse(JSON.stringify(before ?? null)),
    JSON.parse(JSON.stringify(after ?? null)),
  );

/** The list rows of a validation's worksheets, each kept until deleted on its screen. */
export type ListTable =
  | typeof researchLogEntries
  | typeof competitors
  | typeof assumptions
  | typeof risks
  | typeof costItems;

/** What every list row has: its validation, its version and its deletion. */
export interface ListRow {
  id: string;
  validationId: string;
  lockVersion: number;
  updatedAt: Date;
  updatedById: string | null;
  deletedAt: Date | null;
}

// Drizzle's builders do not take a union of tables, so the helpers below speak of one
// of them; every table of ListTable has the columns they use.
const asTable = (table: ListTable) => table as typeof competitors;

/**
 * Finds the validation of the list row named by the path parameter `param` (V7, V9,
 * V11, V14). A deleted row, like an id that is not a UUID, is not found.
 */
export const listRowLocator =
  (table: ListTable, param: string): ScopeLocator =>
  async ({ params, db }) => {
    const id = params[param] ?? "";
    if (!uuidSchema.safeParse(id).success) return null;
    const t = asTable(table);
    const [row] = await db
      .select({ validationId: t.validationId })
      .from(t)
      .where(and(eq(t.id, id), isNull(t.deletedAt)));
    return row === undefined ? null : { validationId: row.validationId };
  };

/**
 * Locks the list row `id` for a change. It was found when the request was let in, but a
 * write that went before may have deleted it since.
 *
 * @throws {ApiError} NOT_FOUND when it is deleted
 */
export async function lockListRow<T extends ListTable>(
  tx: DatabaseTransaction,
  table: T,
  id: string,
): Promise<T["$inferSelect"]> {
  const t = asTable(table);
  const [row] = await tx
    .select()
    .from(t)
    .where(and(eq(t.id, id), isNull(t.deletedAt)))
    .for("update");
  if (row === undefined) throw new ApiError("NOT_FOUND", "No such row");
  return row as T["$inferSelect"];
}

/**
 * The `sort_order` of a row added at the end of its list: after every row not deleted
 * of `validationId` that `where` keeps (one cost table).
 */
export async function nextSortOrder(
  tx: DatabaseTransaction,
  table: Exclude<ListTable, typeof researchLogEntries>,
  validationId: string,
  where?: ReturnType<typeof eq>,
): Promise<number> {
  const t = asTable(table);
  const [row] = await tx
    .select({ last: sql<number | null>`max(${t.sortOrder})` })
    .from(t)
    .where(and(eq(t.validationId, validationId), isNull(t.deletedAt), where));
  return (row?.last ?? -1) + 1;
}

/**
 * Saves a change to a list row under the optimistic lock (ADR-019) with its history
 * row, or nothing when `after` equals `before`: a save that changes nothing raises no
 * version and writes no history (SDD 5.1「同時編集」).
 *
 * @param before The row's content as the history keeps it (history-values.ts).
 * @param values The columns to set besides the version.
 * @param beforeWrite Checks that need the version checked first (a new Fact's evidence).
 * @throws {ApiError} CONFLICT
 */
export async function updateListRow<T extends ListTable>(
  tx: DatabaseTransaction,
  options: {
    table: T;
    row: ListRow;
    target: TargetRef;
    before: unknown;
    after: unknown;
    values: Partial<T["$inferInsert"]>;
    claim: LockClaim;
    operation: HistoryOperation;
    workspaceId: string;
    beforeWrite?: () => Promise<void>;
  },
): Promise<void> {
  const { row, before, after, operation } = options;
  if (sameContent(before, after)) return;
  await checkLockVersion(
    tx,
    {
      value: before,
      lockVersion: row.lockVersion,
      updatedAt: row.updatedAt,
      updatedById: row.updatedById,
    },
    options.claim,
    options.workspaceId,
  );
  await options.beforeWrite?.();
  const t = asTable(options.table);
  await tx
    .update(t)
    .set({
      ...(options.values as Partial<typeof competitors.$inferInsert>),
      lockVersion: row.lockVersion + 1,
      updatedAt: operation.at,
      updatedById: operation.changedById,
    })
    .where(eq(t.id, row.id));
  await withHistory(tx, operation, async () => ({
    target: options.target,
    action: "update",
    before,
    after,
  }));
}

/**
 * Deletes a list row logically, with its history row: the history can restore it (SDD
 * 6.5). Its version and `updated_at` stay, since its content does not change.
 */
export async function deleteListRow(
  tx: DatabaseTransaction,
  options: {
    table: ListTable;
    id: string;
    target: TargetRef;
    before: unknown;
    operation: HistoryOperation;
  },
): Promise<void> {
  const t = asTable(options.table);
  await tx
    .update(t)
    .set({ deletedAt: options.operation.at })
    .where(eq(t.id, options.id));
  await withHistory(tx, options.operation, async () => ({
    target: options.target,
    action: "delete",
    before: options.before,
    after: null,
  }));
}

/** The `Versioned` part of an item's view (SDD 5.2). */
export const versionedView = (
  row: { lockVersion: number; updatedAt: Date; updatedById: string | null },
  users: ReadonlyMap<string, UserRef>,
) => ({
  lockVersion: row.lockVersion,
  updatedAt: row.updatedAt.toISOString(),
  updatedBy:
    row.updatedById === null ? null : (users.get(row.updatedById) ?? null),
});
