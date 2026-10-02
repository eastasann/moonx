import { schema } from "@moonx/db";
import type { Classification, CreateEvidenceBody, Evidence } from "@moonx/schemas";
import { and, eq, isNull } from "drizzle-orm";
import { ApiError, validationFailed } from "../errors";
import type { HistoryActor } from "../history/with-history";
import type { Tx } from "./db";
import {
  changeTarget,
  classificationOfTarget,
  linkIdsOf,
  lockTarget,
  saveTarget,
  targetRefOf,
  valueStateOf,
} from "./evidence-write";
import { evidenceFor, isActiveEvidence, loadValidationData, toEvidence } from "./validation-data";
import { insertResearchLog } from "./validation-research-log";
import { checkLockLazily, touchValidationActivity } from "./validation-write";

interface EvidenceContext {
  workspaceId: string;
  ideaId: string;
  validationId: string;
  actor: HistoryActor;
  now: Date;
}

/** The target's classification and new lock version after evidence was added or removed. */
export interface EvidenceChange {
  classification: Classification;
  lockVersion: number;
}

const blankToNull = (value: string | null | undefined) =>
  value == null || value.trim() === "" ? null : value;

async function reload(tx: Tx, validationId: string) {
  const data = (await loadValidationData(tx, [validationId])).get(validationId);
  if (!data) throw new ApiError("NOT_FOUND", "Resource not found");
  return data;
}

/**
 * V4. Links one piece of evidence to an item and bumps the item's lock. Everything, including a
 * research log entry created on the way, is written in the caller's transaction, and the item gets
 * exactly one history row.
 */
export async function createEvidence(
  tx: Tx,
  ctx: EvidenceContext,
  body: CreateEvidenceBody,
): Promise<EvidenceChange & { evidence: Evidence }> {
  const { validationId } = ctx;
  const target = await lockTarget(tx, validationId, body.target);
  const data = await reload(tx, validationId);
  const state = valueStateOf(target);
  const ref = targetRefOf(target, validationId);
  const beforeIds = linkIdsOf(data, target, validationId);
  const currentValue = async () => ({
    classification: classificationOfTarget(data, target, validationId),
  });

  const lockVersion = await checkLockLazily(tx, {
    workspaceId: ctx.workspaceId,
    row: target.row,
    sent: { lockVersion: body.lockVersion },
    currentValue,
  });

  if (body.setFact) {
    if (!state.hasFau) {
      throw validationFailed([
        { path: "setFact", code: "invalid_value", message: "This item has no F/A/U" },
      ]);
    }
    if (!state.hasValue) {
      throw validationFailed([
        { path: "setFact", code: "invalid_value", message: "A value is required for Fact" },
      ]);
    }
  }

  let researchLogEntryId: string | null = null;
  if (body.researchLogEntryId) {
    const [entry] = await tx
      .select({ id: schema.researchLogEntries.id })
      .from(schema.researchLogEntries)
      .where(
        and(
          eq(schema.researchLogEntries.id, body.researchLogEntryId),
          eq(schema.researchLogEntries.validationId, validationId),
          isNull(schema.researchLogEntries.deletedAt),
        ),
      )
      // Shared lock: a delete of the entry (which takes it FOR UPDATE) waits for this link.
      .for("share");
    if (!entry) throw new ApiError("NOT_FOUND", "Research log entry not found");
    const duplicate = evidenceFor(data, ref).some((l) => l.researchLogEntryId === entry.id);
    if (duplicate) {
      throw validationFailed([
        {
          path: "researchLogEntryId",
          code: "invalid_value",
          message: "This research log entry is already evidence of the item",
        },
      ]);
    }
    researchLogEntryId = entry.id;
  } else if (body.newResearchLog) {
    const created = await insertResearchLog(tx, {
      workspaceId: ctx.workspaceId,
      validationId,
      input: body.newResearchLog,
      actor: ctx.actor,
      now: ctx.now,
    });
    researchLogEntryId = created.id;
  }

  const [link] = await tx
    .insert(schema.evidenceLinks)
    .values({
      workspaceId: ctx.workspaceId,
      validationId,
      targetType: ref.type,
      targetId: ref.id,
      targetKey: ref.key,
      researchLogEntryId,
      url: researchLogEntryId ? null : (body.url ?? null),
      note: blankToNull(body.note),
      createdById: ctx.actor.userId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })
    .returning();
  if (!link) throw new ApiError("INTERNAL", "Evidence was not saved");

  const saved = await changeTarget(tx, {
    workspaceId: ctx.workspaceId,
    validationId,
    actor: ctx.actor,
    before: target,
    beforeEvidence: beforeIds,
    afterEvidence: [...beforeIds, link.id],
    write: () =>
      saveTarget(
        tx,
        target,
        { lockVersion, fau: body.setFact ? { fau: "fact", confidence: null } : undefined },
        {
          workspaceId: ctx.workspaceId,
          validationId,
          userId: ctx.actor.userId,
          now: ctx.now,
          currentValue,
        },
      ),
  });
  await touchValidationActivity(tx, ctx, ctx.now);

  const fresh = await reload(tx, validationId);
  const freshLink = fresh.evidence.find((l) => l.id === link.id) ?? link;
  return {
    evidence: toEvidence(fresh, freshLink),
    classification: classificationOfTarget(fresh, saved, validationId),
    lockVersion: saved.row.lockVersion,
  };
}

/**
 * V5. Takes one evidence link off its item (`deletedAt`; history can bring it back). Removing
 * the last active evidence of a Fact makes the item Unclassified: a Fact without evidence is
 * only ever created by deleting a research log.
 */
export async function removeEvidence(
  tx: Tx,
  ctx: EvidenceContext,
  evidenceId: string,
  lock: { lockVersion: number; force?: boolean },
): Promise<EvidenceChange> {
  const { validationId } = ctx;
  const [found] = await tx
    .select()
    .from(schema.evidenceLinks)
    .where(
      and(
        eq(schema.evidenceLinks.id, evidenceId),
        eq(schema.evidenceLinks.validationId, validationId),
        isNull(schema.evidenceLinks.deletedAt),
      ),
    );
  if (!found) throw new ApiError("NOT_FOUND", "Resource not found");

  const target = await lockTarget(tx, validationId, {
    type: found.targetType,
    id: found.targetId,
    key: found.targetKey,
  });
  const data = await reload(tx, validationId);
  const link = data.evidence.find((l) => l.id === evidenceId);
  if (!link) throw new ApiError("NOT_FOUND", "Resource not found");

  const state = valueStateOf(target);
  const beforeIds = linkIdsOf(data, target, validationId);
  const currentValue = async () => ({
    classification: classificationOfTarget(data, target, validationId),
  });
  const lockVersion = await checkLockLazily(tx, {
    workspaceId: ctx.workspaceId,
    row: target.row,
    sent: lock,
    currentValue,
  });

  await tx
    .update(schema.evidenceLinks)
    .set({ deletedAt: ctx.now, updatedAt: ctx.now })
    .where(eq(schema.evidenceLinks.id, evidenceId));

  const ref = targetRefOf(target, validationId);
  const remaining = evidenceFor(data, ref).filter(
    (l) => l.id !== evidenceId && isActiveEvidence(data, l),
  );
  const dropFact = state.fau === "fact" && remaining.length === 0;

  const saved = await changeTarget(tx, {
    workspaceId: ctx.workspaceId,
    validationId,
    actor: ctx.actor,
    before: target,
    beforeEvidence: beforeIds,
    afterEvidence: beforeIds.filter((id) => id !== evidenceId),
    write: () =>
      saveTarget(
        tx,
        target,
        { lockVersion, fau: dropFact ? { fau: null, confidence: null } : undefined },
        {
          workspaceId: ctx.workspaceId,
          validationId,
          userId: ctx.actor.userId,
          now: ctx.now,
          currentValue,
        },
      ),
  });
  await touchValidationActivity(tx, ctx, ctx.now);

  const fresh = await reload(tx, validationId);
  return {
    classification: classificationOfTarget(fresh, saved, validationId),
    lockVersion: saved.row.lockVersion,
  };
}
