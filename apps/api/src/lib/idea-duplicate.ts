import { schema } from "@moonx/db";
import type { TargetType } from "@moonx/schemas";
import { eq } from "drizzle-orm";
import { ApiError } from "../errors";
import { answerHistorySection, HISTORY_SECTION } from "../history/sections";
import {
  answerSnapshot,
  assumptionSnapshot,
  competitorSnapshot,
  costItemSnapshot,
  economicsSnapshot,
  ideaSnapshot,
  researchLogSnapshot,
  riskSnapshot,
} from "../history/snapshots";
import { type HistoryActor, withHistory } from "../history/with-history";
import type { Db } from "./db";
import { touchWorkspace } from "./idea-write";
import { loadValidationData } from "./validation-data";

/** The name a copy gets when the caller gives none; the whole name stays within the 100 characters of I1. */
function defaultCopyName(name: string): string {
  const suffix = " (copy)";
  return `${name.slice(0, 100 - suffix.length)}${suffix}`;
}

type EvidenceTarget = (typeof schema.evidenceLinks.$inferSelect)["targetType"];

/**
 * I3. Copies the validation contents of `sourceId` into a new idea of the same workspace in one
 * transaction (design-spec 6.8): answers with F/A/U, research log, competitors, assumptions,
 * risks, cost items, economics inputs and the evidence links, which move to the copied research
 * log rows. Evidence that points at a deleted research log or a deleted row is left out.
 *
 * Every tracked item that was copied gets a `duplicate` history row (action create) with the one
 * `batchId` of the operation, so that H3 can undo the copy as a unit; the idea's own row comes first.
 */
export async function duplicateIdea(
  db: Db,
  p: {
    sourceId: string;
    workspaceId: string;
    actor: HistoryActor;
    now: Date;
    name?: string;
  },
): Promise<string> {
  const batchId = crypto.randomUUID();
  const actor: HistoryActor = { ...p.actor, source: "duplicate", batchId };
  return db.transaction(async (tx) => {
    const [source] = await tx
      .select()
      .from(schema.ideas)
      .where(eq(schema.ideas.id, p.sourceId))
      .for("share");
    if (!source || source.workspaceId !== p.workspaceId) {
      throw new ApiError("NOT_FOUND", "Resource not found");
    }
    const [sourceValidation] = await tx
      .select()
      .from(schema.validations)
      .where(eq(schema.validations.ideaId, source.id));
    const validation = sourceValidation as typeof schema.validations.$inferSelect;
    const data = (await loadValidationData(tx, [validation.id])).get(validation.id);
    if (!data) throw new ApiError("INTERNAL", "Validation data is missing");

    const [created] = await tx
      .insert(schema.ideas)
      .values({
        workspaceId: p.workspaceId,
        name: p.name ?? defaultCopyName(source.name),
        oneLineConcept: source.oneLineConcept,
        proposedSolution: source.proposedSolution,
        proposerId: actor.userId,
        duplicatedFromId: source.id,
        lastActivityAt: p.now,
        updatedById: actor.userId,
      })
      .returning();
    const idea = created as typeof schema.ideas.$inferSelect;
    const [newValidation] = await tx
      .insert(schema.validations)
      .values({ ideaId: idea.id, templateVersionId: validation.templateVersionId })
      .returning({ id: schema.validations.id });
    const validationId = (newValidation as { id: string }).id;

    const fresh = new Map<string, string>();
    const idOf = (oldId: string) => {
      const id = crypto.randomUUID();
      fresh.set(oldId, id);
      return id;
    };
    const audit = {
      lockVersion: 0,
      updatedById: actor.userId,
      createdAt: p.now,
      updatedAt: p.now,
    };

    const logs = data.researchLogs.map((r) => ({
      ...r,
      id: idOf(r.id),
      validationId,
      createdById: actor.userId,
      ...audit,
    }));
    const competitors = data.competitors.map((r) => ({
      ...r,
      id: idOf(r.id),
      validationId,
      ...audit,
    }));
    const assumptions = data.assumptions.map((r) => ({
      ...r,
      id: idOf(r.id),
      validationId,
      ...audit,
    }));
    const risks = data.risks.map((r) => ({ ...r, id: idOf(r.id), validationId, ...audit }));
    const costItems = data.costItems.map((r) => ({ ...r, id: idOf(r.id), validationId, ...audit }));
    // Keyed items start at version 1: version 0 means "no row yet" to the optimistic lock.
    const answers = data.answers.map((r) => ({
      ...r,
      id: crypto.randomUUID(),
      validationId,
      ...audit,
      lockVersion: 1,
    }));
    const economics = data.economicsInputs.map((r) => ({
      ...r,
      id: crypto.randomUUID(),
      validationId,
      ...audit,
      lockVersion: 1,
    }));

    const fixed = (type: EvidenceTarget, oldId: string): string | null =>
      type === "validation_answer" || type === "economics_input"
        ? validationId
        : (fresh.get(oldId) ?? null);
    const evidence = data.evidence.flatMap((e) => {
      const targetId = fixed(e.targetType, e.targetId);
      const researchLogEntryId = e.researchLogEntryId ? fresh.get(e.researchLogEntryId) : null;
      if (!targetId || (e.researchLogEntryId && !researchLogEntryId)) return [];
      return [
        {
          id: crypto.randomUUID(),
          workspaceId: p.workspaceId,
          validationId,
          targetType: e.targetType,
          targetId,
          targetKey: e.targetKey,
          researchLogEntryId: researchLogEntryId ?? null,
          url: e.url,
          note: e.note,
          createdById: actor.userId,
          createdAt: p.now,
          updatedAt: p.now,
        },
      ];
    });

    const insertAll = async <T extends object>(
      table: Parameters<typeof tx.insert>[0],
      rows: T[],
    ) => {
      if (rows.length > 0) await tx.insert(table).values(rows as never);
    };
    await insertAll(schema.researchLogEntries, logs);
    await insertAll(schema.competitors, competitors);
    await insertAll(schema.assumptions, assumptions);
    await insertAll(schema.risks, risks);
    await insertAll(schema.costItems, costItems);
    await insertAll(schema.validationAnswers, answers);
    await insertAll(schema.economicsInputs, economics);
    await insertAll(schema.evidenceLinks, evidence);

    const evidenceOf = (type: EvidenceTarget, id: string, key: string | null = null) =>
      evidence
        .filter((e) => e.targetType === type && e.targetId === id && (e.targetKey ?? null) === key)
        .map((e) => e.id);

    const record = (
      container: { type: "idea" | "validation"; id: string },
      target: { type: TargetType; id: string; key?: string },
      after: unknown,
      sectionKey: string | null = null,
    ) =>
      withHistory(
        tx,
        { container, workspaceId: p.workspaceId, sectionKey, target, actor },
        async () => ({
          result: undefined,
          before: null,
          after,
        }),
      );
    const inValidation = { type: "validation", id: validationId } as const;

    await record({ type: "idea", id: idea.id }, { type: "idea", id: idea.id }, ideaSnapshot(idea));
    for (const r of answers) {
      await record(
        inValidation,
        { type: "validation_answer", id: validationId, key: r.questionKey },
        answerSnapshot(r, evidenceOf("validation_answer", validationId, r.questionKey)),
        answerHistorySection(r.questionKey),
      );
    }
    for (const r of economics) {
      await record(
        inValidation,
        { type: "economics_input", id: validationId, key: r.fieldKey },
        economicsSnapshot(r, evidenceOf("economics_input", validationId, r.fieldKey)),
        HISTORY_SECTION.economics,
      );
    }
    for (const r of logs) {
      await record(
        inValidation,
        { type: "research_log_entry", id: r.id },
        researchLogSnapshot(r),
        HISTORY_SECTION.researchLog,
      );
    }
    for (const r of competitors) {
      await record(
        inValidation,
        { type: "competitor", id: r.id },
        competitorSnapshot(r, evidenceOf("competitor", r.id)),
        HISTORY_SECTION.competitors,
      );
    }
    for (const r of assumptions) {
      await record(
        inValidation,
        { type: "assumption", id: r.id },
        assumptionSnapshot(r, evidenceOf("assumption", r.id)),
        HISTORY_SECTION.assumptionsRisks,
      );
    }
    for (const r of risks) {
      await record(
        inValidation,
        { type: "risk", id: r.id },
        riskSnapshot(r),
        HISTORY_SECTION.assumptionsRisks,
      );
    }
    for (const r of costItems) {
      await record(
        inValidation,
        { type: "cost_item", id: r.id },
        costItemSnapshot(r, evidenceOf("cost_item", r.id)),
        HISTORY_SECTION.costs,
      );
    }
    await touchWorkspace(tx, p.workspaceId, p.now);
    return idea.id;
  });
}
