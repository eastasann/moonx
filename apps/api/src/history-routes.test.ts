import { afterAll, describe, expect, test } from "bun:test";
import {
  businessPlans,
  changeHistory,
  costItems,
  evidenceLinks,
  executionItems,
  ideas,
  selfAnalyses,
  selfAnalysisAnswers,
  templateVersions,
  validationAnswers,
  validations,
  workspaces,
} from "@moonx/db";
import {
  errorBodySchema,
  historyBatchRevertResultSchema,
  historyPageSchema,
  historyRevertResultSchema,
  ideaDuplicateResultSchema,
  importApplyResultSchema,
  planHomeSchema,
} from "@moonx/schemas";
import { and, eq, isNotNull } from "drizzle-orm";
import { buildTestApp, connectTestDatabase, uniqueIp } from "./test-app";
import {
  apiRequest,
  signIn,
  teamWithNewIdea,
  teamWithProceedIdea,
  testFixtures,
} from "./test-fixtures";

const database = connectTestDatabase();
const { db } = database;
afterAll(() => database.close());

const fixtures = testFixtures(db);
let clock = Date.UTC(2026, 9, 1, 3, 0);
const tick = () => {
  clock += 1000;
};
const { app } = buildTestApp(database, { now: () => clock });

const errorOf = async (response: Response) =>
  errorBodySchema.parse(await response.json()).error;

type Team = Awaited<ReturnType<typeof teamWithNewIdea>>;

const call = (
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  cookie: string,
  body?: unknown,
) => app.handle(apiRequest(method, path, { cookie, body }));

/** Saves a validation answer through V3 and returns its lock version after. */
async function saveAnswer(
  team: Team,
  key: string,
  body: Record<string, unknown>,
  cookie = team.memberCookie,
) {
  tick();
  const [row] = await db
    .select({ lockVersion: validationAnswers.lockVersion })
    .from(validationAnswers)
    .where(
      and(
        eq(validationAnswers.validationId, team.validationId),
        eq(validationAnswers.questionKey, key),
      ),
    );
  const response = await call(
    "PUT",
    `/api/v1/validations/${team.validationId}/answers/${key}`,
    cookie,
    { lockVersion: row?.lockVersion ?? 0, ...body },
  );
  expect(response.status).toBe(200);
}

const answerOf = async (team: Team, key: string) =>
  (
    await db
      .select()
      .from(validationAnswers)
      .where(
        and(
          eq(validationAnswers.validationId, team.validationId),
          eq(validationAnswers.questionKey, key),
        ),
      )
  )[0];

/** The history rows of one item, oldest first. */
const rowsOf = (targetId: string, key: string | null = null) =>
  db
    .select()
    .from(changeHistory)
    .where(
      and(
        eq(changeHistory.targetId, targetId),
        key === null ? undefined : eq(changeHistory.targetKey, key),
      ),
    )
    .orderBy(changeHistory.changedAt, changeHistory.id);

async function history(cookie: string, query: string) {
  const response = await call("GET", `/api/v1/history?${query}`, cookie);
  expect(response.status).toBe(200);
  return historyPageSchema.parse(await response.json());
}

async function revert(entryId: string, cookie: string) {
  tick();
  return call("POST", `/api/v1/history/${entryId}/revert`, cookie);
}

async function revertBatch(batchId: string, cookie: string) {
  tick();
  return call("POST", `/api/v1/history/batches/${batchId}/revert`, cookie);
}

describe("H1 GET /api/v1/history", () => {
  test("lists an item's changes newest first, revertible by Owners and Members", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    await saveAnswer(team, "V.01.WHO", { text: "Offices" });
    await saveAnswer(team, "V.01.WHO", { text: "HR officers" });
    const query = `targetType=validation_answer&targetId=${team.validationId}&targetKey=V.01.WHO`;
    const page = await history(team.memberCookie, query);
    expect(page.items.map((entry) => entry.after)).toEqual([
      { text: "HR officers", fau: null, confidence: null, evidenceIds: [] },
      { text: "Offices", fau: null, confidence: null, evidenceIds: [] },
    ]);
    expect(page.items[0]).toMatchObject({
      target: {
        type: "validation_answer",
        id: team.validationId,
        key: "V.01.WHO",
      },
      label: "01 WHO",
      action: "update",
      source: "manual",
      batchId: null,
      changedBy: { id: team.member.id },
      revertible: true,
    });
    expect(page.items[1]?.action).toBe("create");
    const asViewer = await history(team.viewerCookie, query);
    expect(asViewer.items.every((entry) => !entry.revertible)).toBe(true);
    const paged = await history(team.memberCookie, `${query}&limit=1`);
    expect(paged.items).toHaveLength(1);
    expect(paged.nextCursor).toBe("1");
  });

  test("lists a screen's changes by section, and 13 with its validation's template migrations", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    await saveAnswer(team, "V.01.WHO", { text: "Offices" });
    await saveAnswer(team, "V.02.OCEAN", { text: "Red" });
    tick();
    await call("PATCH", `/api/v1/ideas/${team.idea.id}`, team.ownerCookie, {
      name: "Piaya gift boxes",
      lockVersion: 0,
    });
    const [pinned] = await db
      .select({ versionId: validations.templateVersionId })
      .from(validations)
      .where(eq(validations.id, team.validationId));
    await db.insert(changeHistory).values({
      workspaceId: team.workspace.id,
      containerType: "validation",
      containerId: team.validationId,
      targetType: "template_version",
      targetId: team.validationId,
      targetKey: "validation",
      action: "update",
      before: { versionId: pinned?.versionId, versionNumber: 1 },
      after: { versionId: pinned?.versionId, versionNumber: 1 },
      source: "template_migration",
      batchId: crypto.randomUUID(),
      changedById: team.owner.id,
      changedAt: new Date(clock + 1),
    });
    const screen = (query: string) =>
      history(team.ownerCookie, query).then((page) =>
        page.items.map(
          (entry) =>
            entry.target.type +
            (entry.target.key ? `:${entry.target.key}` : ""),
        ),
      );
    const validation = `containerType=validation&containerId=${team.validationId}`;
    expect(await screen(`${validation}&sectionKeys=01`)).toEqual([
      "validation_answer:V.01.WHO",
    ]);
    expect(await screen(`${validation}&sectionKeys=01,02`)).toEqual([
      "validation_answer:V.02.OCEAN",
      "validation_answer:V.01.WHO",
    ]);
    expect(
      await screen(`containerType=idea&containerId=${team.idea.id}`),
    ).toEqual(["template_version:validation", "idea", "idea"]);
    // An item's history never lists a template version (SDD 5.11 H1).
    expect(
      await screen(
        `targetType=template_version&targetId=${team.validationId}&targetKey=validation`,
      ),
    ).toEqual([]);
  });

  test("lets nobody revert in an archived idea, and offers the creations and migrations to undo whole", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    await saveAnswer(team, "V.01.WHO", { text: "Offices" });
    tick();
    const copied = await call(
      "POST",
      `/api/v1/ideas/${team.idea.id}/duplicate`,
      team.memberCookie,
      {},
    );
    const copy = ideaDuplicateResultSchema.parse(await copied.json());
    await db.insert(changeHistory).values({
      workspaceId: team.workspace.id,
      containerType: "validation",
      containerId: copy.validationId,
      targetType: "template_version",
      targetId: copy.validationId,
      targetKey: "validation",
      action: "update",
      before: null,
      after: null,
      source: "template_migration",
      batchId: crypto.randomUUID(),
      changedById: team.owner.id,
    });
    const onCopy = await history(
      team.memberCookie,
      `containerType=idea&containerId=${copy.id}`,
    );
    expect(
      onCopy.items.map((entry) => [entry.source, entry.revertible]),
    ).toEqual([
      ["template_migration", true],
      ["duplicate", true],
    ]);
    await db
      .update(ideas)
      .set({ archivedAt: new Date() })
      .where(eq(ideas.id, team.idea.id));
    const archived = await history(
      team.ownerCookie,
      `containerType=validation&containerId=${team.validationId}`,
    );
    expect(archived.items.length).toBeGreaterThan(0);
    expect(archived.items.some((entry) => entry.revertible)).toBe(false);
  });

  test("keeps a self-analysis's history to its owner", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    const analysis = await fixtures.createSelfAnalysis(team.owner.id, [
      team.workspace.id,
    ]);
    const response = await call(
      "PUT",
      "/api/v1/me/self-analysis/answers/SA.WHY.1",
      team.ownerCookie,
      { text: "To stay home", lockVersion: 0 },
    );
    expect(response.status).toBe(200);
    const query = `containerType=self_analysis&containerId=${analysis.id}`;
    const own = await history(team.ownerCookie, query);
    expect(own.items.map((entry) => entry.label)).toEqual(["WHY SA.WHY.1"]);
    expect(own.items[0]?.revertible).toBe(true);
    const other = await call(
      "GET",
      `/api/v1/history?${query}`,
      team.memberCookie,
    );
    expect(other.status).toBe(403);
    expect((await errorOf(other)).code).toBe("FORBIDDEN");
    const missing = await call(
      "GET",
      `/api/v1/history?containerType=self_analysis&containerId=${crypto.randomUUID()}`,
      team.ownerCookie,
    );
    expect(missing.status).toBe(404);
  });
});

describe("H2 POST /api/v1/history/{entryId}/revert", () => {
  test("puts an answer back as a change left it, with its evidence, and records the revert", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    await saveAnswer(team, "V.01.WHO", { text: "Offices" });
    tick();
    const attached = await call(
      "POST",
      `/api/v1/validations/${team.validationId}/evidence`,
      team.memberCookie,
      {
        target: {
          type: "validation_answer",
          id: team.validationId,
          key: "V.01.WHO",
        },
        url: "https://example.com/survey",
        setFact: true,
        lockVersion: 1,
      },
    );
    expect(attached.status).toBe(201);
    const [link] = await db
      .select({ id: evidenceLinks.id })
      .from(evidenceLinks)
      .where(eq(evidenceLinks.validationId, team.validationId));
    const factRow = (await rowsOf(team.validationId, "V.01.WHO")).at(-1);
    // A new text resets the F/A/U; then the evidence goes.
    await saveAnswer(team, "V.01.WHO", { text: "Anyone" });
    tick();
    const removed = await call(
      "DELETE",
      `/api/v1/evidence/${link?.id}?lockVersion=3`,
      team.memberCookie,
    );
    expect(removed.status).toBe(200);

    const response = await revert(factRow?.id ?? "", team.ownerCookie);
    expect(response.status).toBe(200);
    const result = historyRevertResultSchema.parse(await response.json());
    const restored = {
      text: "Offices",
      fau: "fact",
      confidence: null,
      evidenceIds: [link?.id],
    };
    expect(result.target).toMatchObject({
      value: restored,
      deleted: false,
      lockVersion: 5,
      updatedBy: { id: team.owner.id },
    });
    expect(result.entry).toMatchObject({
      action: "update",
      source: "revert",
      batchId: null,
      after: restored,
      changedBy: { id: team.owner.id },
    });
    const stored = await answerOf(team, "V.01.WHO");
    expect(stored).toMatchObject({
      text: "Offices",
      fau: "fact",
      lockVersion: 5,
    });
    const [idea] = await db
      .select()
      .from(ideas)
      .where(eq(ideas.id, team.idea.id));
    expect(idea?.lastActivityAt.getTime()).toBe(clock);
    const last = (await rowsOf(team.validationId, "V.01.WHO")).at(-1);
    expect(last?.revertedFromId).toBe(factRow?.id ?? "");
    expect(last?.id).toBe(result.entry?.id ?? "");

    // Reverting to what is there already changes nothing.
    const again = await revert(factRow?.id ?? "", team.ownerCookie);
    expect(
      historyRevertResultSchema.parse(await again.json()).entry,
    ).toBeNull();
    expect((await answerOf(team, "V.01.WHO"))?.lockVersion).toBe(5);
  });

  test("undoes a row's deletion, and brings a deleted row back as a change left it", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    tick();
    const created = await call(
      "POST",
      `/api/v1/validations/${team.validationId}/competitors`,
      team.memberCookie,
      { name: "Bongbong's" },
    );
    const { id } = (await created.json()) as { id: string };
    tick();
    await call("PATCH", `/api/v1/competitors/${id}`, team.memberCookie, {
      name: "Bongbong's Bakeshop",
      lockVersion: 0,
    });
    tick();
    expect(
      (await call("DELETE", `/api/v1/competitors/${id}`, team.memberCookie))
        .status,
    ).toBe(204);
    const [create, update, deletion] = await rowsOf(id);
    expect(deletion?.action).toBe("delete");

    const undone = historyRevertResultSchema.parse(
      await (await revert(deletion?.id ?? "", team.ownerCookie)).json(),
    );
    expect(undone.entry).toMatchObject({ action: "restore", before: null });
    expect(undone.target).toMatchObject({
      deleted: false,
      value: { name: "Bongbong's Bakeshop" },
    });
    expect(
      (await call("DELETE", `/api/v1/competitors/${id}`, team.memberCookie))
        .status,
    ).toBe(204);
    const back = historyRevertResultSchema.parse(
      await (await revert(create?.id ?? "", team.ownerCookie)).json(),
    );
    expect(back.entry).toMatchObject({
      action: "restore",
      after: { name: "Bongbong's" },
    });
    const toUpdate = historyRevertResultSchema.parse(
      await (await revert(update?.id ?? "", team.ownerCookie)).json(),
    );
    expect(toUpdate.entry).toMatchObject({
      action: "update",
      before: { name: "Bongbong's" },
      after: { name: "Bongbong's Bakeshop" },
    });
  });

  test("names an assignee who is no longer an Owner or Member, as leaving does", async () => {
    const team = await teamWithProceedIdea(app, fixtures);
    tick();
    const drafted = await call(
      "POST",
      `/api/v1/ideas/${team.idea.id}/plans`,
      team.ownerCookie,
      { name: "Plan A" },
    );
    const plan = planHomeSchema.parse(await drafted.json());
    const item = await fixtures.createExecutionItem(plan.id);
    tick();
    const assigned = await call(
      "PATCH",
      `/api/v1/execution-items/${item.id}`,
      team.ownerCookie,
      {
        assigneeUserId: team.member.id,
        lockVersion: 0,
      },
    );
    expect(assigned.status).toBe(200);
    const assignment = (await rowsOf(item.id)).at(-1);
    tick();
    await call(
      "PATCH",
      `/api/v1/workspaces/${team.workspace.id}/members/${team.member.id}`,
      team.ownerCookie,
      {
        role: "viewer",
      },
    );
    const response = await revert(assignment?.id ?? "", team.ownerCookie);
    expect(response.status).toBe(200);
    const [stored] = await db
      .select()
      .from(executionItems)
      .where(eq(executionItems.id, item.id));
    expect(stored).toMatchObject({
      assigneeUserId: null,
      assigneeName: "Member",
    });
  });

  test("answers 409 NAME_TAKEN for a plan name taken since", async () => {
    const team = await teamWithProceedIdea(app, fixtures);
    tick();
    const drafted = await call(
      "POST",
      `/api/v1/ideas/${team.idea.id}/plans`,
      team.ownerCookie,
      {
        name: "Plan A",
      },
    );
    const plan = planHomeSchema.parse(await drafted.json());
    tick();
    await call("PATCH", `/api/v1/plans/${plan.id}`, team.ownerCookie, {
      name: "Plan C",
      lockVersion: plan.lockVersion,
    });
    tick();
    await call(
      "POST",
      `/api/v1/ideas/${team.idea.id}/plans`,
      team.ownerCookie,
      {
        name: "Plan A",
      },
    );
    const [created] = await db
      .select()
      .from(changeHistory)
      .where(
        and(
          eq(changeHistory.targetType, "business_plan"),
          eq(changeHistory.targetId, plan.id),
          eq(changeHistory.action, "create"),
        ),
      );
    const response = await revert(created?.id ?? "", team.ownerCookie);
    expect(response.status).toBe(409);
    expect((await errorOf(response)).code).toBe("NAME_TAKEN");
  });

  test("puts a self-analysis answer back and starts the self-analysis", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    const analysis = await fixtures.createSelfAnalysis(team.owner.id);
    await call(
      "PUT",
      "/api/v1/me/self-analysis/answers/SA.WHY.1",
      team.ownerCookie,
      {
        text: "To stay home",
        lockVersion: 0,
      },
    );
    const [created] = await rowsOf(analysis.id, "SA.WHY.1");
    await db
      .update(selfAnalysisAnswers)
      .set({ text: null })
      .where(eq(selfAnalysisAnswers.selfAnalysisId, analysis.id));
    await db
      .update(selfAnalyses)
      .set({ status: "not_started" })
      .where(eq(selfAnalyses.id, analysis.id));
    const response = await revert(created?.id ?? "", team.ownerCookie);
    expect(response.status).toBe(200);
    const [after] = await db
      .select()
      .from(selfAnalyses)
      .where(eq(selfAnalyses.id, analysis.id));
    expect(after?.status).toBe("in_progress");
    const other = await revert(created?.id ?? "", team.memberCookie);
    expect(other.status).toBe(403);
  });

  test("refuses template migrations, Viewers, archived ideas and unknown rows", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    await saveAnswer(team, "V.01.WHO", { text: "Offices" });
    const [row] = await rowsOf(team.validationId, "V.01.WHO");
    const [migration] = await db
      .insert(changeHistory)
      .values({
        workspaceId: team.workspace.id,
        containerType: "validation",
        containerId: team.validationId,
        targetType: "template_version",
        targetId: team.validationId,
        targetKey: "validation",
        action: "update",
        before: null,
        after: null,
        source: "template_migration",
        batchId: crypto.randomUUID(),
        changedById: team.owner.id,
      })
      .returning();
    const refused = await revert(migration?.id ?? "", team.ownerCookie);
    expect(refused.status).toBe(422);
    expect((await errorOf(refused)).code).toBe("VALIDATION_FAILED");
    expect((await revert(row?.id ?? "", team.viewerCookie)).status).toBe(403);
    for (const id of [crypto.randomUUID(), "nope"]) {
      expect((await revert(id, team.ownerCookie)).status).toBe(404);
    }
    await db
      .update(ideas)
      .set({ archivedAt: new Date() })
      .where(eq(ideas.id, team.idea.id));
    const archived = await revert(row?.id ?? "", team.viewerCookie);
    expect(archived.status).toBe(409);
    expect((await errorOf(archived)).code).toBe("ARCHIVED");
  });
});

describe("H3 POST /api/v1/history/batches/{batchId}/revert", () => {
  async function imported(team: Team) {
    await saveAnswer(team, "V.01.WHO", { text: "Offices" });
    tick();
    const response = await call(
      "POST",
      "/api/v1/ai/import/apply",
      team.memberCookie,
      {
        target: { type: "validation", id: team.validationId },
        changes: [
          { questionKey: "V.01.WHO", text: "HR officers", baseLockVersion: 1 },
          {
            questionKey: "V.01.WHY_THEM",
            text: "They buy monthly",
            baseLockVersion: 0,
          },
        ],
      },
    );
    expect(response.status).toBe(200);
    return importApplyResultSchema.parse(await response.json()).batchId;
  }

  test("reverts an AI import as one operation, until that revert is undone", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    const batchId = await imported(team);
    const response = await revertBatch(batchId, team.ownerCookie);
    expect(response.status).toBe(200);
    const result = historyBatchRevertResultSchema.parse(await response.json());
    expect(result.reverted).toBe(2);
    expect((await answerOf(team, "V.01.WHO"))?.text).toBe("Offices");
    expect((await answerOf(team, "V.01.WHY_THEM"))?.text).toBeNull();
    const rows = await db
      .select()
      .from(changeHistory)
      .where(eq(changeHistory.batchId, result.batchId));
    expect(rows.map((row) => [row.source, row.action]).sort()).toEqual([
      ["revert", "update"],
      ["revert", "update"],
    ]);
    expect(rows.every((row) => row.revertedFromId !== null)).toBe(true);

    const twice = await revertBatch(batchId, team.memberCookie);
    expect(twice.status).toBe(409);
    expect((await errorOf(twice)).code).toBe("ALREADY_REVERTED");
    // Undoing the revert brings the import back, and frees it to be reverted again.
    const redo = await revertBatch(result.batchId, team.memberCookie);
    expect(redo.status).toBe(200);
    expect((await answerOf(team, "V.01.WHO"))?.text).toBe("HR officers");
    expect((await revertBatch(result.batchId, team.memberCookie)).status).toBe(
      409,
    );
    expect((await revertBatch(batchId, team.memberCookie)).status).toBe(200);
    expect((await answerOf(team, "V.01.WHY_THEM"))?.text).toBeNull();
  });

  test("puts back the pinned version and removes the cost rows of a template migration", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    const [validation] = await db
      .select()
      .from(validations)
      .where(eq(validations.id, team.validationId));
    const [v1] = await db
      .select()
      .from(templateVersions)
      .where(eq(templateVersions.id, validation?.templateVersionId ?? ""));
    // A draft, so no other test's new validation pins it as the latest published.
    const [v2] = await db
      .insert(templateVersions)
      .values({
        templateId: v1?.templateId ?? "",
        versionNumber: 1000 + Math.floor(Math.random() * 1_000_000),
        status: "draft",
      })
      .returning();
    const [added] = await db
      .insert(costItems)
      .values({
        validationId: team.validationId,
        category: "initial",
        templateKey: "initial.new_row",
        name: "New row",
        sortOrder: 99,
      })
      .returning();
    await db
      .update(validations)
      .set({ templateVersionId: v2?.id ?? "" })
      .where(eq(validations.id, team.validationId));
    // What T2 writes (SDD 5.12): the version, then the starting rows it added.
    const batchId = crypto.randomUUID();
    const row = {
      workspaceId: team.workspace.id,
      containerType: "validation" as const,
      containerId: team.validationId,
      source: "template_migration" as const,
      batchId,
      changedById: team.owner.id,
    };
    await db.insert(changeHistory).values([
      {
        ...row,
        targetType: "template_version",
        targetId: team.validationId,
        targetKey: "validation",
        action: "update",
        before: { versionId: v1?.id, versionNumber: v1?.versionNumber },
        after: { versionId: v2?.id, versionNumber: v2?.versionNumber },
      },
      {
        ...row,
        sectionKey: "costs",
        targetType: "cost_item",
        targetId: added?.id ?? "",
        action: "create",
        before: null,
        after: {},
      },
    ]);
    const response = await revertBatch(batchId, team.memberCookie);
    expect(response.status).toBe(200);
    expect(
      historyBatchRevertResultSchema.parse(await response.json()).reverted,
    ).toBe(2);
    const [pinned] = await db
      .select()
      .from(validations)
      .where(eq(validations.id, team.validationId));
    expect(pinned?.templateVersionId).toBe(v1?.id ?? "");
    const [cost] = await db
      .select()
      .from(costItems)
      .where(eq(costItems.id, added?.id ?? ""));
    expect(cost?.deletedAt).not.toBeNull();
    // Once reverted, the migration's row offers no undo (SDD 5.11 HistoryEntry).
    const page = await history(
      team.memberCookie,
      `containerType=idea&containerId=${team.idea.id}`,
    );
    expect(
      page.items.find((entry) => entry.target.type === "template_version")
        ?.revertible,
    ).toBe(false);
    await db
      .delete(templateVersions)
      .where(eq(templateVersions.id, v2?.id ?? ""));
  });

  test("undoes a duplicate: the copy goes, the history stays, and the source's 13 says so", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    await saveAnswer(team, "V.01.WHO", { text: "Offices" });
    tick();
    const copied = await call(
      "POST",
      `/api/v1/ideas/${team.idea.id}/duplicate`,
      team.memberCookie,
      {},
    );
    const copy = ideaDuplicateResultSchema.parse(await copied.json());
    const batchRows = await db
      .select()
      .from(changeHistory)
      .where(eq(changeHistory.batchId, copy.batchId));
    expect((await revertBatch(copy.batchId, team.viewerCookie)).status).toBe(
      403,
    );

    const response = await revertBatch(copy.batchId, team.ownerCookie);
    expect(response.status).toBe(200);
    expect(historyBatchRevertResultSchema.parse(await response.json())).toEqual(
      {
        reverted: batchRows.length,
        batchId: copy.batchId,
      },
    );
    const [gone] = await db.select().from(ideas).where(eq(ideas.id, copy.id));
    expect(gone?.deletedAt?.getTime()).toBe(clock);
    // The undo is written to the source's history, so the source moves (SDD 7.1).
    const [source] = await db
      .select()
      .from(ideas)
      .where(eq(ideas.id, team.idea.id));
    expect(source?.lastActivityAt.getTime()).toBe(clock);
    expect(
      (await call("GET", `/api/v1/ideas/${copy.id}`, team.ownerCookie)).status,
    ).toBe(404);
    expect(
      await db
        .select()
        .from(changeHistory)
        .where(eq(changeHistory.batchId, copy.batchId)),
    ).toHaveLength(batchRows.length);
    const onSource = await history(
      team.ownerCookie,
      `containerType=idea&containerId=${team.idea.id}`,
    );
    expect(onSource.items[0]).toMatchObject({
      target: { type: "idea", id: copy.id },
      action: "delete",
      source: "revert",
      batchId: null,
      revertible: false,
    });
    const refused = await revert(onSource.items[0]?.id ?? "", team.ownerCookie);
    expect(refused.status).toBe(422);
    const twice = await revertBatch(copy.batchId, team.memberCookie);
    expect(twice.status).toBe(409);
    expect((await errorOf(twice)).code).toBe("ALREADY_REVERTED");
  });

  test("answers BUSY at once while a write holds the copy or its source", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    tick();
    const copied = await call(
      "POST",
      `/api/v1/ideas/${team.idea.id}/duplicate`,
      team.memberCookie,
      {},
    );
    const copy = ideaDuplicateResultSchema.parse(await copied.json());
    for (const held of [copy.id, team.idea.id]) {
      await db.transaction(async (tx) => {
        await tx
          .select({ id: ideas.id })
          .from(ideas)
          .where(eq(ideas.id, held))
          .for("no key update");
        const response = await revertBatch(copy.batchId, team.ownerCookie);
        expect(response.status).toBe(409);
        expect((await errorOf(response)).code).toBe("BUSY");
      });
    }
    const [kept] = await db.select().from(ideas).where(eq(ideas.id, copy.id));
    expect(kept?.deletedAt).toBeNull();
  });

  test("reverts an import into a self-analysis after locking it, and moves it on", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    const analysis = await fixtures.createSelfAnalysis(team.owner.id);
    tick();
    const applied = await call(
      "POST",
      "/api/v1/ai/import/apply",
      team.ownerCookie,
      {
        target: { type: "self_analysis" },
        changes: [
          { questionKey: "SA.WHY.1", text: "To stay home", baseLockVersion: 0 },
        ],
      },
    );
    const { batchId } = importApplyResultSchema.parse(await applied.json());
    const undone = await revertBatch(batchId, team.ownerCookie);
    expect(undone.status).toBe(200);
    const revert = historyBatchRevertResultSchema.parse(await undone.json());
    const status = async () =>
      (
        await db
          .select({ status: selfAnalyses.status })
          .from(selfAnalyses)
          .where(eq(selfAnalyses.id, analysis.id))
      )[0]?.status;
    // Emptying every answer never moves it back to not started (SDD 5.8).
    expect(await status()).toBe("in_progress");
    await db
      .update(selfAnalyses)
      .set({ status: "not_started" })
      .where(eq(selfAnalyses.id, analysis.id));
    expect((await revertBatch(revert.batchId, team.ownerCookie)).status).toBe(
      200,
    );
    expect(await status()).toBe("in_progress");
    expect((await revertBatch(batchId, team.memberCookie)).status).toBe(403);
  });

  test("refuses to undo a duplicate once anything was added to it", async () => {
    const team = await teamWithProceedIdea(app, fixtures);
    const duplicate = async () => {
      tick();
      const response = await call(
        "POST",
        `/api/v1/ideas/${team.idea.id}/duplicate`,
        team.memberCookie,
        {},
      );
      return ideaDuplicateResultSchema.parse(await response.json());
    };
    const additions: [
      string,
      (copy: { id: string; validationId: string }) => Promise<unknown>,
    ][] = [
      [
        "a change",
        (copy) =>
          call(
            "PUT",
            `/api/v1/validations/${copy.validationId}/answers/V.01.WHO`,
            team.memberCookie,
            {
              text: "Changed",
              lockVersion: 0,
            },
          ),
      ],
      [
        "an AI import",
        (copy) =>
          call("POST", "/api/v1/ai/import/apply", team.memberCookie, {
            target: { type: "validation", id: copy.validationId },
            changes: [
              { questionKey: "V.01.WHY_THEM", text: "AI", baseLockVersion: 0 },
            ],
          }),
      ],
      [
        "a deleted comment",
        async (copy) => {
          const response = await call(
            "POST",
            "/api/v1/comments",
            team.viewerCookie,
            {
              workspaceId: team.workspace.id,
              target: { type: "idea", id: copy.id },
              body: "Nice",
              mentionUserIds: [],
            },
          );
          const { id } = (await response.json()) as { id: string };
          await call("DELETE", `/api/v1/comments/${id}`, team.viewerCookie);
        },
      ],
      [
        "a decision",
        (copy) =>
          fixtures.createDecision(
            { id: copy.id, workspaceId: team.workspace.id },
            team.owner.id,
          ),
      ],
      ["a plan", (copy) => fixtures.createPlan(copy.id, team.owner.id)],
      [
        "a copy of the copy",
        (copy) =>
          call(
            "POST",
            `/api/v1/ideas/${copy.id}/duplicate`,
            team.memberCookie,
            {},
          ),
      ],
    ];
    for (const [what, add] of additions) {
      const copy = await duplicate();
      await add(copy);
      const response = await revertBatch(copy.batchId, team.ownerCookie);
      expect({
        what,
        status: response.status,
        code: (await errorOf(response)).code,
      }).toEqual({
        what,
        status: 409,
        code: "UNDO_BLOCKED",
      });
      const [kept] = await db.select().from(ideas).where(eq(ideas.id, copy.id));
      expect(kept?.deletedAt).toBeNull();
    }
    const archivedCopy = await duplicate();
    await db
      .update(ideas)
      .set({ archivedAt: new Date() })
      .where(eq(ideas.id, archivedCopy.id));
    const archived = await revertBatch(archivedCopy.batchId, team.ownerCookie);
    expect(archived.status).toBe(409);
    expect((await errorOf(archived)).code).toBe("ARCHIVED");
  });

  test("undoes a plan draft unless anything was added, and is BUSY while a write holds it", async () => {
    const team = await teamWithProceedIdea(app, fixtures);
    const draft = async (name: string) => {
      tick();
      const response = await call(
        "POST",
        `/api/v1/ideas/${team.idea.id}/plans`,
        team.ownerCookie,
        {
          name,
        },
      );
      const plan = planHomeSchema.parse(await response.json());
      const [row] = await db
        .select({ batchId: changeHistory.batchId })
        .from(changeHistory)
        .where(
          and(
            eq(changeHistory.containerId, plan.id),
            eq(changeHistory.source, "plan_draft"),
            isNotNull(changeHistory.batchId),
          ),
        );
      return { plan, batchId: row?.batchId ?? "" };
    };
    const additions: [string, (planId: string) => Promise<Response>][] = [
      [
        "an answer",
        (planId) =>
          call(
            "PUT",
            `/api/v1/plans/${planId}/answers/P.01.5`,
            team.memberCookie,
            {
              text: "Offices",
              lockVersion: 0,
            },
          ),
      ],
      [
        "a comment",
        (planId) =>
          call("POST", "/api/v1/comments", team.memberCookie, {
            workspaceId: team.workspace.id,
            target: { type: "pitch_slide", id: planId, key: "one.title" },
            body: "Nice",
            mentionUserIds: [],
          }),
      ],
      [
        "a comment on an execution item",
        async (planId) => {
          const [item] = await db
            .select({ id: executionItems.id })
            .from(executionItems)
            .where(eq(executionItems.businessPlanId, planId));
          return call("POST", "/api/v1/comments", team.memberCookie, {
            workspaceId: team.workspace.id,
            target: { type: "execution_item", id: item?.id },
            body: "Who?",
            mentionUserIds: [],
          });
        },
      ],
      [
        "a version",
        (planId) =>
          call("POST", `/api/v1/plans/${planId}/versions`, team.memberCookie, {
            name: "v1",
          }),
      ],
      [
        "a Go / No-Go",
        (planId) =>
          call("POST", `/api/v1/plans/${planId}/go-no-go`, team.memberCookie, {
            value: "delay",
            reason: "Pilot first",
          }),
      ],
    ];
    for (const [index, [what, add]] of additions.entries()) {
      const { plan, batchId } = await draft(`Blocked ${index}`);
      expect((await add(plan.id)).status).toBeLessThan(300);
      const response = await revertBatch(batchId, team.ownerCookie);
      expect({ what, code: (await errorOf(response)).code }).toEqual({
        what,
        code: "UNDO_BLOCKED",
      });
    }

    const busy = await draft("Busy");
    await db.transaction(async (tx) => {
      await tx
        .select({ id: ideas.id })
        .from(ideas)
        .where(eq(ideas.id, team.idea.id))
        .for("no key update");
      const response = await revertBatch(busy.batchId, team.ownerCookie);
      expect(response.status).toBe(409);
      expect((await errorOf(response)).code).toBe("BUSY");
    });

    await db.transaction(async (tx) => {
      await tx
        .select({ id: businessPlans.id })
        .from(businessPlans)
        .where(eq(businessPlans.id, busy.plan.id))
        .for("no key update");
      const response = await revertBatch(busy.batchId, team.ownerCookie);
      expect((await errorOf(response)).code).toBe("BUSY");
    });

    const response = await revertBatch(busy.batchId, team.memberCookie);
    expect(response.status).toBe(200);
    // The idea it was drafted in and the workspace show the undo as their last activity.
    const [idea] = await db
      .select()
      .from(ideas)
      .where(eq(ideas.id, team.idea.id));
    expect(idea?.lastActivityAt.getTime()).toBe(clock);
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, team.workspace.id));
    expect(workspace?.lastActiveAt?.getTime()).toBe(clock);
    const [gone] = await db
      .select()
      .from(businessPlans)
      .where(eq(businessPlans.id, busy.plan.id));
    expect(gone?.deletedAt).not.toBeNull();
    expect(
      (await call("GET", `/api/v1/plans/${busy.plan.id}`, team.ownerCookie))
        .status,
    ).toBe(404);
    const onIdea = await history(
      team.ownerCookie,
      `containerType=idea&containerId=${team.idea.id}`,
    );
    expect(onIdea.items[0]).toMatchObject({
      target: { type: "business_plan", id: busy.plan.id },
      label: "Busy",
      action: "delete",
      source: "revert",
      revertible: false,
    });
    // The name is free again (P1 POST does not count undone plans).
    expect((await draft("Busy")).plan.name).toBe("Busy");
    const twice = await revertBatch(busy.batchId, team.memberCookie);
    expect(twice.status).toBe(409);
    expect((await errorOf(twice)).code).toBe("ALREADY_REVERTED");
  });

  test("answers 404 for an operation that does not exist", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    for (const id of [crypto.randomUUID(), "nope"]) {
      expect((await revertBatch(id, team.ownerCookie)).status).toBe(404);
    }
    const stranger = await fixtures.createUser();
    const batchId = await (async () => {
      await saveAnswer(team, "V.01.WHO", { text: "Offices" });
      const response = await call(
        "POST",
        "/api/v1/ai/import/apply",
        team.memberCookie,
        {
          target: { type: "validation", id: team.validationId },
          changes: [
            { questionKey: "V.01.WHO", text: "HR", baseLockVersion: 1 },
          ],
        },
      );
      return importApplyResultSchema.parse(await response.json()).batchId;
    })();
    const outsider = await revertBatch(
      batchId,
      await signIn(app, stranger.email, uniqueIp()),
    );
    expect(outsider.status).toBe(403);
    expect((await errorOf(outsider)).code).toBe("NO_ACCESS");
  });
});
