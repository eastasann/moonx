import { afterAll, describe, expect, test } from "bun:test";
import {
  businessPlans,
  changeHistory,
  type DatabaseTransaction,
  economicsInputs,
  ideas,
  selfAnalyses,
  users,
  workspaces,
} from "@moonx/db";
import { errorBodySchema, type TargetRef } from "@moonx/schemas";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import { ApiError, isUniqueViolation } from "./errors";
import { type HistoryChange, historySectionKey, withHistory } from "./history";
import { checkLockVersion, conflictError, createKeyedItem } from "./lock";
import {
  admitScope,
  finishWrite,
  type Need,
  recordChange,
  resolveScope,
  type Scope,
  writeInScope,
} from "./scope";
import {
  buildTestAccess,
  buildTestApp,
  connectTestDatabase,
  uniqueIp,
} from "./test-app";
import { signIn, testFixtures } from "./test-fixtures";
import { loadUserRefs } from "./user-refs";

const database = connectTestDatabase();
const { db } = database;
afterAll(() => database.close());

const fixtures = testFixtures(db);

async function scopeOf(
  ref: Parameters<typeof resolveScope>[1],
  userId: string,
  need: Need,
): Promise<Scope> {
  const resolved = await resolveScope(db, ref, userId);
  if (resolved === null) throw new Error("no scope");
  return admitScope(resolved, need);
}

async function setUp() {
  const team = await fixtures.createTeam();
  const { idea, validation } = await fixtures.createIdea(
    team.workspace.id,
    team.member.id,
  );
  const plan = await fixtures.createPlan(idea.id, team.member.id);
  return { ...team, idea, validation, plan };
}

const historyOf = (targetId: string) =>
  db.select().from(changeHistory).where(eq(changeHistory.targetId, targetId));

const ideaRow = async (id: string) =>
  (await db.select().from(ideas).where(eq(ideas.id, id)))[0];

/**
 * Saves an idea's name the way an item save goes (ADR-019, ADR-020): read under a row
 * lock, check the version, change and record only what changed, then the final check.
 */
function saveIdeaName(
  scope: Scope,
  userId: string,
  name: string,
  claim: { lockVersion: number; force?: boolean },
  at = new Date(),
) {
  const ideaId = scope.ideaId ?? "";
  return writeInScope(db, scope, at, async (tx) => {
    const [row] = await tx
      .select()
      .from(ideas)
      .where(eq(ideas.id, ideaId))
      .for("update");
    if (row === undefined) throw new ApiError("NOT_FOUND", "No idea");
    await checkLockVersion(
      tx,
      {
        value: { name: row.name },
        lockVersion: row.lockVersion,
        updatedAt: row.updatedAt,
        updatedById: row.updatedById,
      },
      claim,
      scope.workspaceId,
    );
    return withHistory(
      tx,
      {
        container: { type: "idea", id: ideaId, workspaceId: scope.workspaceId },
        changedById: userId,
        source: "manual",
        batchId: null,
        client: "web_mobile",
        at,
      },
      async () => {
        if (row.name === name) return null;
        await tx
          .update(ideas)
          .set({
            name,
            lockVersion: row.lockVersion + 1,
            updatedById: userId,
            updatedAt: at,
          })
          .where(eq(ideas.id, ideaId));
        return {
          target: { type: "idea", id: ideaId },
          action: "update",
          before: { name: row.name },
          after: { name },
        };
      },
    );
  });
}

describe("change history (ADR-020)", () => {
  test("each save adds one row, with the columns of SDD 6.3", async () => {
    const t = await setUp();
    const scope = await scopeOf(
      { ideaId: t.idea.id },
      t.member.id,
      "writeUnarchived",
    );
    const at = new Date("2026-10-15T01:02:03.456Z");

    await saveIdeaName(scope, t.member.id, "First", { lockVersion: 0 }, at);
    expect(await historyOf(t.idea.id)).toEqual([
      {
        id: expect.any(String),
        workspaceId: t.workspace.id,
        ownerUserId: null,
        containerType: "idea",
        containerId: t.idea.id,
        sectionKey: null,
        targetType: "idea",
        targetId: t.idea.id,
        targetKey: null,
        action: "update",
        before: { name: "Test idea" },
        after: { name: "First" },
        source: "manual",
        batchId: null,
        client: "web_mobile",
        revertedFromId: null,
        changedById: t.member.id,
        changedAt: at,
      },
    ]);

    await saveIdeaName(scope, t.member.id, "Second", { lockVersion: 1 });
    await saveIdeaName(scope, t.owner.id, "Third", { lockVersion: 2 });
    const rows = await historyOf(t.idea.id);
    expect(rows).toHaveLength(3);
    expect((await ideaRow(t.idea.id))?.lockVersion).toBe(3);
  });

  test("a save that changes nothing writes no row and raises no version", async () => {
    const t = await setUp();
    const scope = await scopeOf(
      { ideaId: t.idea.id },
      t.member.id,
      "writeUnarchived",
    );

    await saveIdeaName(scope, t.member.id, "Test idea", { lockVersion: 0 });

    expect(await historyOf(t.idea.id)).toEqual([]);
    expect((await ideaRow(t.idea.id))?.lockVersion).toBe(0);
  });

  test("drops an update whose values are equal, but keeps creations and deletions", async () => {
    const t = await setUp();
    const target: TargetRef = { type: "competitor", id: crypto.randomUUID() };

    const written = await db.transaction((tx) =>
      withHistory(
        tx,
        {
          container: {
            type: "validation",
            id: t.validation.id,
            workspaceId: t.workspace.id,
          },
          changedById: t.member.id,
          source: "manual",
          batchId: null,
          client: "web",
          at: new Date(),
        },
        async () => [
          { target, action: "update", before: { a: [1] }, after: { a: [1] } },
          { target, action: "create", before: null, after: null },
          { target, action: "delete", before: { a: 1 }, after: { a: 1 } },
        ],
      ),
    );

    expect(written.map((row) => row.action)).toEqual(["create", "delete"]);
    expect(written[0]?.sectionKey).toBe("competitors");
  });

  test("keeps one batch id across the changes of one operation", async () => {
    const t = await setUp();
    const batchId = crypto.randomUUID();
    const operation = (container: "idea" | "validation") => ({
      container:
        container === "idea"
          ? {
              type: "idea" as const,
              id: t.idea.id,
              workspaceId: t.workspace.id,
            }
          : {
              type: "validation" as const,
              id: t.validation.id,
              workspaceId: t.workspace.id,
            },
      changedById: t.member.id,
      source: "ai_import" as const,
      batchId,
      client: "web" as const,
      at: new Date(),
    });

    await db.transaction(async (tx: DatabaseTransaction) => {
      await withHistory(tx, operation("idea"), async () => ({
        target: { type: "idea", id: t.idea.id },
        action: "update",
        before: { name: "a" },
        after: { name: "b" },
      }));
      await withHistory(tx, operation("validation"), async () => [
        {
          target: {
            type: "validation_answer",
            id: t.validation.id,
            key: "V.04.SURVIVOR_PATTERNS",
          },
          action: "create",
          before: null,
          after: { text: "x" },
        },
        {
          target: {
            type: "economics_input",
            id: t.validation.id,
            key: "selling_price",
          },
          action: "update",
          before: { value: 1 },
          after: { value: 2 },
        },
      ]);
    });

    const rows = await db
      .select()
      .from(changeHistory)
      .where(eq(changeHistory.batchId, batchId));
    expect(
      rows.map((row) => [row.containerType, row.sectionKey, row.source]).sort(),
    ).toEqual([
      ["idea", null, "ai_import"],
      ["validation", "04", "ai_import"],
      ["validation", "economics", "ai_import"],
    ]);
  });

  test("writes a self-analysis's history to its owner, with no workspace", async () => {
    const owner = await fixtures.createUser();
    const [analysis] = await db
      .insert(selfAnalyses)
      .values({
        userId: owner.id,
        templateVersionId: (await fixtures.templateVersion("self_analysis")).id,
      })
      .returning();
    if (analysis === undefined) throw new Error("no self-analysis");

    const [row] = await db.transaction((tx) =>
      withHistory(
        tx,
        {
          container: {
            type: "self_analysis",
            id: analysis.id,
            ownerUserId: owner.id,
          },
          changedById: owner.id,
          source: "manual",
          batchId: null,
          client: "unknown",
          at: new Date(),
        },
        async () => ({
          target: {
            type: "self_analysis_answer",
            id: analysis.id,
            key: "SA.WHY.1",
          },
          action: "create",
          before: null,
          after: { text: "Because" },
        }),
      ),
    );

    expect(row).toMatchObject({
      workspaceId: null,
      ownerUserId: owner.id,
      containerType: "self_analysis",
      sectionKey: "WHY",
    });
  });

  test("refuses a change listed under a screen that cannot show it", async () => {
    const t = await setUp();

    await expect(
      db.transaction((tx) =>
        withHistory(
          tx,
          {
            container: {
              type: "idea",
              id: t.idea.id,
              workspaceId: t.workspace.id,
            },
            changedById: t.member.id,
            source: "manual",
            batchId: null,
            client: "web",
            at: new Date(),
          },
          async () => ({
            target: { type: "cost_item", id: crypto.randomUUID() },
            action: "create",
            before: null,
            after: {},
          }),
        ),
      ),
    ).rejects.toThrow("A cost_item change cannot be listed under idea");
  });

  test("refuses a keyed item, a header or a Pitch Deck slide under another screen's id", async () => {
    const t = await setUp();
    const write = (
      container: Parameters<typeof withHistory>[1]["container"],
      change: Partial<HistoryChange> & { target: TargetRef },
    ) =>
      db.transaction((tx) =>
        withHistory(
          tx,
          {
            container,
            changedById: t.member.id,
            source: "revert",
            batchId: null,
            client: "web",
            at: new Date(),
          },
          async () => ({
            action: "delete",
            before: { name: "x" },
            after: null,
            ...change,
          }),
        ),
      );
    const validation = {
      type: "validation" as const,
      id: t.validation.id,
      workspaceId: t.workspace.id,
    };
    const idea = {
      type: "idea" as const,
      id: t.idea.id,
      workspaceId: t.workspace.id,
    };
    const plan = {
      type: "business_plan" as const,
      id: t.plan.id,
      workspaceId: t.workspace.id,
    };

    await expect(
      write(validation, {
        target: {
          type: "validation_answer",
          id: crypto.randomUUID(),
          key: "V.01.WHO",
        },
      }),
    ).rejects.toThrow("cannot be listed under validation");
    await expect(
      write(idea, { target: { type: "idea", id: crypto.randomUUID() } }),
    ).rejects.toThrow("cannot be listed under idea");
    await expect(
      write(plan, {
        target: { type: "pitch_slide", id: t.plan.id, key: "five.market" },
      }),
    ).rejects.toThrow("A pitch_slide change cannot be listed");
    await expect(
      write(idea, { target: { type: "business_plan", id: t.plan.id } }),
    ).rejects.toThrow("cannot be listed under idea");

    // Undoing a duplicate or a plan draft files its row under the idea it came from.
    const [created] = await db
      .insert(changeHistory)
      .values({
        workspaceId: t.workspace.id,
        containerType: "business_plan",
        containerId: t.plan.id,
        targetType: "business_plan",
        targetId: t.plan.id,
        action: "create",
        source: "plan_draft",
        changedById: t.member.id,
      })
      .returning();
    const undone = await write(idea, {
      target: { type: "business_plan", id: t.plan.id },
      revertedFromId: created?.id,
    });
    expect(undone[0]).toMatchObject({
      containerType: "idea",
      containerId: t.idea.id,
      targetType: "business_plan",
      revertedFromId: created?.id,
    });
  });

  test("names the section of each target as the screens filter by (SDD 6.3)", () => {
    const id = crypto.randomUUID();
    const section = (type: TargetRef["type"], key?: string) =>
      historySectionKey({ type, id, key });

    expect(section("validation_answer", "V.01.WHO")).toBe("01");
    expect(section("validation_answer", "V.08.WORTH")).toBe("08");
    expect(section("self_analysis_answer", "SA.INCOME.2")).toBe("INCOME");
    expect(section("plan_answer", "P.12.1")).toBe("12");
    expect(section("economics_input", "selling_price")).toBe("economics");
    expect(section("research_log_entry")).toBe("research_log");
    expect(section("competitor")).toBe("competitors");
    expect(section("assumption")).toBe("assumptions_risks");
    expect(section("risk")).toBe("assumptions_risks");
    expect(section("cost_item")).toBe("costs");
    expect(section("execution_item")).toBe("execution");
    expect(section("pitch_slide", "five.market")).toBe("pitch");
    expect(section("idea")).toBeNull();
    expect(section("business_plan")).toBeNull();
    expect(section("template_version", "validation")).toBeNull();
    expect(() => section("validation_answer")).toThrow();
  });
});

describe("optimistic lock (ADR-019)", () => {
  test("refuses a save from an old version with the stored one, and changes nothing", async () => {
    const t = await setUp();
    const scope = await scopeOf(
      { ideaId: t.idea.id },
      t.member.id,
      "writeUnarchived",
    );
    const ownerScope = await scopeOf(
      { ideaId: t.idea.id },
      t.owner.id,
      "writeUnarchived",
    );
    const at = new Date("2026-10-15T03:00:00.000Z");
    await saveIdeaName(
      ownerScope,
      t.owner.id,
      "Owner's",
      { lockVersion: 0 },
      at,
    );

    const conflict = await saveIdeaName(scope, t.member.id, "Member's", {
      lockVersion: 0,
    }).catch((error: unknown) => error);

    expect(conflict).toBeInstanceOf(ApiError);
    expect((conflict as ApiError).code).toBe("CONFLICT");
    expect((conflict as ApiError).status).toBe(409);
    expect((conflict as ApiError).extra).toEqual({
      current: {
        value: { name: "Owner's" },
        lockVersion: 1,
        updatedAt: "2026-10-15T03:00:00.000Z",
        updatedBy: {
          id: t.owner.id,
          displayName: "Owner",
          avatarUrl: null,
          badge: null,
        },
      },
    });
    expect((await ideaRow(t.idea.id))?.name).toBe("Owner's");
    expect(await historyOf(t.idea.id)).toHaveLength(1);
  });

  test("overwrites with force, and the history keeps the overwritten value", async () => {
    const t = await setUp();
    const scope = await scopeOf(
      { ideaId: t.idea.id },
      t.member.id,
      "writeUnarchived",
    );
    await saveIdeaName(scope, t.owner.id, "Owner's", { lockVersion: 0 });

    await saveIdeaName(scope, t.member.id, "Member's", {
      lockVersion: 0,
      force: true,
    });

    const rows = await historyOf(t.idea.id);
    expect(rows.map((row) => [row.before, row.after])).toHaveLength(2);
    expect(rows.map((row) => [row.before, row.after])).toEqual(
      expect.arrayContaining([
        [{ name: "Test idea" }, { name: "Owner's" }],
        [{ name: "Owner's" }, { name: "Member's" }],
      ]),
    );
    expect((await ideaRow(t.idea.id))?.lockVersion).toBe(2);
  });

  test("creates a keyed item once, and answers the save that lost the race with CONFLICT", async () => {
    const t = await setUp();
    const at = new Date("2026-10-15T04:00:00.000Z");
    const firstSave = (
      userId: string,
      value: number,
      hold: () => Promise<void>,
    ) =>
      db.transaction(async (tx) =>
        createKeyedItem(
          tx,
          async () => {
            const [row] = await tx
              .insert(economicsInputs)
              .values({
                validationId: t.validation.id,
                fieldKey: "units_expected",
                value,
                lockVersion: 1,
                updatedById: userId,
                updatedAt: at,
              })
              .onConflictDoNothing()
              .returning();
            await hold();
            return row;
          },
          async () => {
            const [row] = await tx
              .select()
              .from(economicsInputs)
              .where(eq(economicsInputs.validationId, t.validation.id));
            if (row === undefined) throw new Error("no row");
            return {
              value: { value: row.value },
              lockVersion: row.lockVersion,
              updatedAt: row.updatedAt,
              updatedById: row.updatedById,
            };
          },
          t.workspace.id,
        ),
      );

    // The owner's insert waits on the member's until it commits, then finds the key taken.
    const results = await Promise.allSettled([
      firstSave(t.member.id, 10, () => Bun.sleep(200)),
      Bun.sleep(50).then(() => firstSave(t.owner.id, 20, async () => {})),
    ]);

    expect(results[0]?.status).toBe("fulfilled");
    const lost = results[1];
    expect(lost?.status).toBe("rejected");
    const error = (lost as PromiseRejectedResult).reason as ApiError;
    expect(error.code).toBe("CONFLICT");
    expect(error.extra.current).toMatchObject({
      value: { value: 10 },
      lockVersion: 1,
      updatedBy: { id: t.member.id },
    });
  });

  test("tells the loser of two first saves of a keyed item by its unique violation", async () => {
    const t = await setUp();
    const save = () =>
      db.insert(economicsInputs).values({
        validationId: t.validation.id,
        fieldKey: "selling_price",
        value: 100,
        lockVersion: 1,
      });
    await save();

    const lost = await save().catch((error: unknown) => error);

    expect(
      isUniqueViolation(lost, "economics_inputs_validation_id_field_key_index"),
    ).toBe(true);
    expect(isUniqueViolation(lost, "users_email_lower_uq")).toBe(false);
    expect(isUniqueViolation(new Error("other"), "any")).toBe(false);
  });

  test("lets every save through for an item not stored yet", async () => {
    await expect(
      checkLockVersion(db, null, { lockVersion: 3 }, null),
    ).resolves.toBeUndefined();
  });

  test("answers 409 CONFLICT in the SDD 8.1 shape over HTTP", async () => {
    const t = await setUp();
    const access = buildTestAccess(database);
    const { app } = buildTestApp(database);
    app.use(
      new Elysia().use(access).patch(
        "/api/v1/test/ideas/:ideaId",
        ({ caller, scope, body }) =>
          saveIdeaName(scope, caller.id, body.name, body).then(() => ({
            ok: true,
          })),
        {
          scoped: { to: "ideaId", need: "writeUnarchived" },
          body: z.object({
            name: z.string(),
            lockVersion: z.int(),
            force: z.boolean().optional(),
          }),
        },
      ),
    );
    const cookie = await signIn(app, t.member.email, uniqueIp());
    const patch = (body: unknown) =>
      app.handle(
        new Request(`http://localhost/api/v1/test/ideas/${t.idea.id}`, {
          method: "PATCH",
          headers: {
            cookie,
            "content-type": "application/json",
            "x-forwarded-for": uniqueIp(),
          },
          body: JSON.stringify(body),
        }),
      );

    expect((await patch({ name: "One", lockVersion: 0 })).status).toBe(200);
    const conflict = await patch({ name: "Two", lockVersion: 0 });

    expect(conflict.status).toBe(409);
    const body = errorBodySchema.parse(await conflict.json());
    expect(body.error).toMatchObject({
      code: "CONFLICT",
      current: {
        value: { name: "One" },
        lockVersion: 1,
        updatedBy: { id: t.member.id, badge: null },
      },
    });
  });
});

describe("resolveScope (SDD 7.1「実装」)", () => {
  test("answers the stored ids, whatever case the request wrote the UUID in", async () => {
    const t = await setUp();
    const upper = (id: string) => id.toUpperCase();
    expect(
      await resolveScope(
        db,
        { workspaceId: upper(t.workspace.id) },
        t.member.id,
      ),
    ).toMatchObject({ workspaceId: t.workspace.id, role: "member" });
    expect(
      await resolveScope(db, { planId: upper(t.plan.id) }, t.member.id),
    ).toMatchObject({
      workspaceId: t.workspace.id,
      ideaId: t.idea.id,
      planId: t.plan.id,
    });
  });
});

describe("the write path (SDD 7.1「アーカイブ」)", () => {
  const lastActivity = async (t: Awaited<ReturnType<typeof setUp>>) => {
    const [plan] = await db
      .select()
      .from(businessPlans)
      .where(eq(businessPlans.id, t.plan.id));
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, t.workspace.id));
    return {
      idea: (await ideaRow(t.idea.id))?.lastActivityAt,
      plan: plan?.lastActivityAt,
      workspace: workspace?.lastActiveAt,
    };
  };

  test("moves the last activity of the idea, the plan and the workspace on a change", async () => {
    const t = await setUp();
    const scope = await scopeOf(
      { planId: t.plan.id },
      t.member.id,
      "writeUnarchived",
    );
    const at = new Date("2026-10-15T05:00:00.000Z");

    await writeInScope(db, scope, at, async (tx) => recordChange(tx));

    expect(await lastActivity(t)).toEqual({
      idea: at,
      plan: at,
      workspace: at,
    });
  });

  test("leaves the last activity alone when a save changes nothing", async () => {
    const t = await setUp();
    const scope = await scopeOf(
      { ideaId: t.idea.id },
      t.member.id,
      "writeUnarchived",
    );
    const before = await lastActivity(t);

    await saveIdeaName(scope, t.member.id, "Test idea", { lockVersion: 0 });

    expect(await lastActivity(t)).toEqual(before);
    await saveIdeaName(scope, t.member.id, "Renamed", { lockVersion: 0 });
    expect((await lastActivity(t)).idea).not.toEqual(before.idea);
  });

  test("leaves nothing behind when the idea was archived after the check", async () => {
    const t = await setUp();
    const scope = await scopeOf(
      { ideaId: t.idea.id },
      t.member.id,
      "writeUnarchived",
    );
    // Another request archives the idea between the plugin's check and the write.
    await db
      .update(ideas)
      .set({ archivedAt: new Date() })
      .where(eq(ideas.id, t.idea.id));

    const result = await saveIdeaName(scope, t.member.id, "Changed", {
      lockVersion: 0,
    }).catch((error: unknown) => error);

    expect((result as ApiError).code).toBe("ARCHIVED");
    expect((await ideaRow(t.idea.id))?.name).toBe("Test idea");
    expect(await historyOf(t.idea.id)).toEqual([]);
  });

  test("makes an archive started during a write wait for it", async () => {
    const t = await setUp();
    const scope = await scopeOf(
      { ideaId: t.idea.id },
      t.member.id,
      "writeUnarchived",
    );
    let archived = false;
    let archive: Promise<unknown> = Promise.resolve();

    await writeInScope(db, scope, new Date(), async (tx) => {
      archive = db
        .update(ideas)
        .set({ archivedAt: new Date() })
        .where(eq(ideas.id, t.idea.id))
        .then(() => {
          archived = true;
        });
      await Bun.sleep(200);
      // The write holds the idea, so the archive cannot have gone through.
      expect(archived).toBe(false);
      recordChange(tx);
    });
    await archive;

    expect(archived).toBe(true);
  });

  test("never deadlocks a write that locks its plan with the plan's other writes", async () => {
    const t = await setUp();
    const scope = await scopeOf(
      { planId: t.plan.id },
      t.member.id,
      "writeUnarchived",
    );
    // Like the plan header (P2): the work locks the plan row it saves.
    const header = writeInScope(db, scope, new Date(), async (tx) => {
      await tx
        .select()
        .from(businessPlans)
        .where(eq(businessPlans.id, t.plan.id))
        .for("update");
      await Bun.sleep(200);
      await tx
        .update(businessPlans)
        .set({ businessName: "Renamed" })
        .where(eq(businessPlans.id, t.plan.id));
      recordChange(tx);
    });
    const other = (async () => {
      await Bun.sleep(50);
      return writeInScope(db, scope, new Date(), async (tx) =>
        recordChange(tx),
      );
    })();

    await expect(Promise.all([header, other])).resolves.toBeDefined();
  });

  test("answers 404 NOT_FOUND when the creation was undone meanwhile", async () => {
    const t = await setUp();
    const scope = await scopeOf(
      { planId: t.plan.id },
      t.member.id,
      "writeUnarchived",
    );
    await db
      .update(businessPlans)
      .set({ deletedAt: new Date() })
      .where(eq(businessPlans.id, t.plan.id));

    for (const change of [false, true]) {
      const error = await writeInScope(db, scope, new Date(), async (tx) => {
        if (change) recordChange(tx);
      }).catch((caught: unknown) => caught);
      expect((error as ApiError).code).toBe("NOT_FOUND");
    }
  });

  test("checks archiving as each need does", async () => {
    const t = await setUp();
    const scopes = {
      write: await scopeOf({ ideaId: t.idea.id }, t.member.id, "write"),
      comment: await scopeOf({ planId: t.plan.id }, t.viewer.id, "comment"),
      planState: await scopeOf(
        { planId: t.plan.id },
        t.member.id,
        "writeIdeaUnarchived",
      ),
    };
    const outcome = (scope: Scope) =>
      db
        .transaction((tx) => finishWrite(tx, scope, new Date()))
        .then(
          () => "ok",
          (error: ApiError) => error.code,
        );

    await db
      .update(businessPlans)
      .set({ archivedAt: new Date() })
      .where(eq(businessPlans.id, t.plan.id));
    expect(await outcome(scopes.comment)).toBe("ARCHIVED");
    expect(await outcome(scopes.planState)).toBe("ok");

    await db
      .update(ideas)
      .set({ archivedAt: new Date() })
      .where(eq(ideas.id, t.idea.id));
    expect(await outcome(scopes.write)).toBe("ok");
    expect(await outcome(scopes.planState)).toBe("ARCHIVED");
  });
});

describe("user references (SDD 5.2 UserRef)", () => {
  test("marks deleted, former and suspended members", async () => {
    const t = await setUp();
    const gone = await fixtures.createUser({ displayName: "Gone" });
    const suspended = await fixtures.createUser({ displayName: "Paused" });
    await fixtures.addMember(t.workspace.id, suspended.id, "member");
    await db
      .update(users)
      .set({ status: "suspended" })
      .where(eq(users.id, suspended.id));
    const deleted = await fixtures.createUser({
      displayName: "Deleted user",
      status: "deleted",
    });

    const refs = await loadUserRefs(
      db,
      [t.member.id, gone.id, suspended.id, deleted.id, t.member.id],
      t.workspace.id,
    );

    expect(refs.get(t.member.id)?.badge).toBeNull();
    expect(refs.get(gone.id)?.badge).toBe("former_member");
    expect(refs.get(suspended.id)?.badge).toBe("suspended");
    expect(refs.get(deleted.id)).toEqual({
      id: deleted.id,
      displayName: "Deleted user",
      avatarUrl: null,
      badge: "deleted",
    });
    expect(refs.size).toBe(4);

    const outside = await loadUserRefs(db, [gone.id], null);
    expect(outside.get(gone.id)?.badge).toBeNull();
  });

  test("shows the author of a conflicting version as a former member once they left", async () => {
    const t = await setUp();
    const gone = await fixtures.createUser({ displayName: "Gone" });

    const error = await conflictError(
      db,
      {
        value: null,
        lockVersion: 4,
        updatedAt: new Date(),
        updatedById: gone.id,
      },
      t.workspace.id,
    );

    expect(
      (error.extra.current as { updatedBy: { badge: string } }).updatedBy.badge,
    ).toBe("former_member");
  });
});
