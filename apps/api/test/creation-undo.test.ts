import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { schema } from "@moonx/db";
import { BCDX, ideaId, seedDemo, userId } from "@moonx/db/seed";
import { and, eq, inArray } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";
import type { PgTable } from "drizzle-orm/pg-core";
import { parentRowGone } from "../src/lib/error-report";
import { call, login, startTestApp, type TestApp } from "./helpers";

let t: TestApp;
const who = {} as Record<"ana" | "kenji" | "paolo" | "grace" | "admin", Record<string, string>>;

beforeAll(async () => {
  t = await startTestApp();
  for (const p of ["ana", "kenji", "paolo", "grace", "admin"] as const) {
    who[p] = await login(t.app, p);
  }
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await seedDemo(t.db);
});

const piaya = ideaId("piaya");
const MISSING = "6f1f3f3a-1111-4111-8111-111111111111";
const h = schema.changeHistory;

const undo = (batchId: string, as = who.kenji) =>
  call(t.app, "POST", `/api/v1/history/batches/${batchId}/revert`, { as });

async function duplicate(source = piaya, as = who.kenji) {
  const res = await call(t.app, "POST", `/api/v1/ideas/${source}/duplicate`, { as, body: {} });
  expect(res.status).toBe(201);
  const id = res.body.id as string;
  const [row] = await t.db
    .select({ batchId: h.batchId })
    .from(h)
    .where(and(eq(h.targetType, "idea"), eq(h.targetId, id)));
  const [validation] = await t.db
    .select({ id: schema.validations.id })
    .from(schema.validations)
    .where(eq(schema.validations.ideaId, id));
  return { id, batchId: row?.batchId as string, validationId: validation?.id as string };
}

async function draft(name = "Plan C", as = who.kenji) {
  const res = await call(t.app, "POST", `/api/v1/ideas/${piaya}/plans`, { as, body: { name } });
  expect(res.status).toBe(201);
  const id = res.body.id as string;
  const [row] = await t.db
    .select({ batchId: h.batchId })
    .from(h)
    .where(and(eq(h.targetType, "business_plan"), eq(h.targetId, id)));
  return { id, batchId: row?.batchId as string, answers: res.body };
}

type Tx = Parameters<Parameters<typeof t.db.transaction>[0]>[0];

/**
 * Runs `during` while another transaction holds the locks `lock` takes and then runs `after`
 * (what a write in progress does next); the transaction commits when `during` is done.
 */
async function holding(
  lock: (tx: Tx) => PromiseLike<unknown>,
  during: () => Promise<void>,
  after: (tx: Tx) => Promise<void> = async () => {},
) {
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let locked = () => {};
  const ready = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const transaction = t.db.transaction(async (tx) => {
    await lock(tx);
    locked();
    await released;
    await after(tx);
  });
  await ready;
  try {
    await during();
  } finally {
    release();
    await transaction;
  }
}

const count = async (table: PgTable) => (await t.db.select().from(table)).length;

describe("H3 on a duplicate", () => {
  test("deletes the copy with its validation, rows and history, and leaves the source alone", async () => {
    const before = {
      ideas: await count(schema.ideas),
      validations: await count(schema.validations),
      answers: await count(schema.validationAnswers),
      history: await count(schema.changeHistory),
    };
    const copy = await duplicate();
    expect(await count(schema.ideas)).toBe(before.ideas + 1);
    const batchRows = await t.db.select().from(h).where(eq(h.batchId, copy.batchId));
    expect(batchRows.length).toBeGreaterThan(5);

    const res = await undo(copy.batchId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reverted: batchRows.length, batchId: copy.batchId });

    expect({
      ideas: await count(schema.ideas),
      validations: await count(schema.validations),
      answers: await count(schema.validationAnswers),
      history: await count(schema.changeHistory),
    }).toEqual(before);
    expect((await call(t.app, "GET", `/api/v1/ideas/${copy.id}`, { as: who.kenji })).status).toBe(
      404,
    );
    expect((await call(t.app, "GET", `/api/v1/ideas/${piaya}`, { as: who.kenji })).status).toBe(
      200,
    );
    const [workspace] = await t.db
      .select({ lastActiveAt: schema.workspaces.lastActiveAt })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, BCDX));
    expect(workspace?.lastActiveAt?.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  test("a second request finds nothing", async () => {
    const copy = await duplicate();
    expect((await undo(copy.batchId)).status).toBe(200);
    expect((await undo(copy.batchId)).status).toBe(404);
  });

  test("concurrent requests delete it once", async () => {
    const copy = await duplicate();
    const results = await Promise.all([undo(copy.batchId), undo(copy.batchId, who.ana)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 404]);
  });

  test("an edit after the copy was made blocks the undo, and nothing is deleted", async () => {
    const copy = await duplicate();
    const [answer] = await t.db
      .select({ lockVersion: schema.validationAnswers.lockVersion })
      .from(schema.validationAnswers)
      .where(
        and(
          eq(schema.validationAnswers.validationId, copy.validationId),
          eq(schema.validationAnswers.questionKey, "V.01.WHY_THEM"),
        ),
      );
    const edited = await call(
      t.app,
      "PUT",
      `/api/v1/validations/${copy.validationId}/answers/V.01.WHY_THEM`,
      {
        as: who.kenji,
        body: { text: "Edited after the copy.", lockVersion: answer?.lockVersion ?? 0 },
      },
    );
    expect(edited.status).toBe(200);
    const res = await undo(copy.batchId);
    expect([res.status, res.body.error.code]).toEqual([409, "CONFLICT"]);
    expect(res.body.error.message).toContain("Something was added");
    expect(await t.db.select().from(schema.ideas).where(eq(schema.ideas.id, copy.id))).toHaveLength(
      1,
    );
    expect(await t.db.select().from(h).where(eq(h.batchId, copy.batchId))).not.toHaveLength(0);
  });

  test("a comment on the copy blocks the undo, a deleted one too", async () => {
    const copy = await duplicate();
    const [comment] = await t.db
      .insert(schema.comments)
      .values({
        workspaceId: BCDX,
        targetType: "idea",
        targetId: copy.id,
        authorId: userId("paolo"),
        body: "Looks good",
        deletedAt: new Date(),
      })
      .returning({ id: schema.comments.id });
    const res = await undo(copy.batchId);
    expect([res.status, res.body.error.code]).toEqual([409, "CONFLICT"]);
    await t.db.delete(schema.comments).where(eq(schema.comments.id, comment?.id as string));
    expect((await undo(copy.batchId)).status).toBe(200);
  });

  test("a copy of the copy blocks the undo", async () => {
    const copy = await duplicate();
    await duplicate(copy.id);
    const res = await undo(copy.batchId);
    expect([res.status, res.body.error.code]).toEqual([409, "CONFLICT"]);
  });

  test("a decision on the copy blocks the undo", async () => {
    const copy = await duplicate();
    await t.db.insert(schema.decisionLogEntries).values({
      workspaceId: BCDX,
      ideaId: copy.id,
      kind: "validation_decision",
      value: "hold",
      reason: "Not yet",
      snapshot: {},
      recordedById: userId("kenji"),
    });
    const res = await undo(copy.batchId);
    expect([res.status, res.body.error.code]).toEqual([409, "CONFLICT"]);
  });

  test("a plan on the copy blocks the undo", async () => {
    const copy = await duplicate();
    const [template] = await t.db
      .select({ id: schema.businessPlans.templateVersionId })
      .from(schema.businessPlans)
      .limit(1);
    await t.db.insert(schema.businessPlans).values({
      ideaId: copy.id,
      name: "Plan A",
      businessName: "Copy",
      preparedBy: "Kenji Mori",
      templateVersionId: template?.id as string,
      createdById: userId("kenji"),
      updatedById: userId("kenji"),
    });
    const res = await undo(copy.batchId);
    expect([res.status, res.body.error.code]).toEqual([409, "CONFLICT"]);
  });

  test("Viewers get 403, outsiders 403 NO_ACCESS, an archived copy 409, unknown batches 404", async () => {
    const copy = await duplicate();
    const viewer = await undo(copy.batchId, who.grace);
    expect([viewer.status, viewer.body.error.code]).toEqual([403, "FORBIDDEN"]);
    const outsider = await undo(copy.batchId, who.admin);
    expect([outsider.status, outsider.body.error.code]).toEqual([403, "NO_ACCESS"]);
    expect((await undo(MISSING)).status).toBe(404);
    await t.db
      .update(schema.ideas)
      .set({ archivedAt: new Date() })
      .where(eq(schema.ideas.id, copy.id));
    const archived = await undo(copy.batchId);
    expect([archived.status, archived.body.error.code]).toEqual([409, "ARCHIVED"]);
    expect(await t.db.select().from(schema.ideas).where(eq(schema.ideas.id, copy.id))).toHaveLength(
      1,
    );
  });
});

describe("H3 on a plan draft", () => {
  test("deletes the plan with its answers and execution items and history", async () => {
    const plan = await draft();
    const batchRows = await t.db.select().from(h).where(eq(h.batchId, plan.batchId));
    expect(batchRows.length).toBeGreaterThan(20);
    const plans = await count(schema.businessPlans);
    const items = await count(schema.executionItems);

    const res = await undo(plan.batchId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reverted: batchRows.length, batchId: plan.batchId });
    expect(await count(schema.businessPlans)).toBe(plans - 1);
    expect(await count(schema.executionItems)).toBeLessThan(items);
    expect(
      await t.db
        .select()
        .from(schema.planAnswers)
        .where(eq(schema.planAnswers.businessPlanId, plan.id)),
    ).toHaveLength(0);
    expect(await t.db.select().from(h).where(eq(h.batchId, plan.batchId))).toHaveLength(0);
    expect((await call(t.app, "GET", `/api/v1/plans/${plan.id}`, { as: who.kenji })).status).toBe(
      404,
    );
    // The name is free again.
    expect((await draft()).id).not.toBe(plan.id);
  });

  test("an edit, a comment or a saved version blocks the undo", async () => {
    const edited = await draft("Plan D");
    const [answer] = await t.db
      .select({ lockVersion: schema.planAnswers.lockVersion })
      .from(schema.planAnswers)
      .where(
        and(
          eq(schema.planAnswers.businessPlanId, edited.id),
          eq(schema.planAnswers.questionKey, "P.01.1"),
        ),
      );
    const put = await call(t.app, "PUT", `/api/v1/plans/${edited.id}/answers/P.01.1`, {
      as: who.kenji,
      body: { text: "Changed after the draft.", lockVersion: answer?.lockVersion },
    });
    expect(put.status).toBe(200);
    const blocked = await undo(edited.batchId);
    expect([blocked.status, blocked.body.error.code]).toEqual([409, "CONFLICT"]);

    const commented = await draft("Plan E");
    await t.db.insert(schema.comments).values({
      workspaceId: BCDX,
      targetType: "plan_answer",
      targetId: commented.id,
      targetKey: "P.01.1",
      authorId: userId("paolo"),
      body: "Check this",
    });
    expect((await undo(commented.batchId)).status).toBe(409);

    const versioned = await draft("Plan F");
    await t.db.insert(schema.planVersions).values({
      businessPlanId: versioned.id,
      versionNumber: 1,
      name: "v1",
      snapshot: {},
      savedById: userId("kenji"),
    });
    expect((await undo(versioned.batchId)).status).toBe(409);
    expect(
      await t.db
        .select({ id: schema.businessPlans.id })
        .from(schema.businessPlans)
        .where(inArray(schema.businessPlans.id, [edited.id, commented.id, versioned.id])),
    ).toHaveLength(3);
  });

  test("a Go / No-Go recorded on the draft blocks the undo", async () => {
    const plan = await draft("Plan H");
    await t.db.insert(schema.decisionLogEntries).values({
      workspaceId: BCDX,
      ideaId: piaya,
      businessPlanId: plan.id,
      kind: "go_no_go",
      value: "delay",
      reason: "Not ready",
      snapshot: {},
      recordedById: userId("kenji"),
    });
    const res = await undo(plan.batchId);
    expect([res.status, res.body.error.code]).toEqual([409, "CONFLICT"]);
  });

  test("an edit racing the undo ends as one of the two, never as a deadlock", async () => {
    for (const name of ["Plan I", "Plan J", "Plan K", "Plan L"]) {
      const plan = await draft(name);
      const [answer] = await t.db
        .select({ lockVersion: schema.planAnswers.lockVersion })
        .from(schema.planAnswers)
        .where(
          and(
            eq(schema.planAnswers.businessPlanId, plan.id),
            eq(schema.planAnswers.questionKey, "P.01.1"),
          ),
        );
      const [undone, edited] = await Promise.all([
        undo(plan.batchId),
        call(t.app, "PUT", `/api/v1/plans/${plan.id}/answers/P.01.1`, {
          as: who.ana,
          body: { text: "Racing edit", lockVersion: answer?.lockVersion },
        }),
      ]);
      expect([undone.status, edited.status].some((status) => status >= 500)).toBe(false);
      // Either the edit landed first and the undo refused, or the undo won and the edit found nothing.
      expect(
        (undone.status === 200 && edited.status !== 200) ||
          (undone.status !== 200 && edited.status === 200),
      ).toBe(true);
    }
  });

  test("an edit racing the undo of a duplicate ends as one of the two", async () => {
    for (let i = 0; i < 4; i++) {
      const copy = await duplicate();
      const [answer] = await t.db
        .select({ lockVersion: schema.validationAnswers.lockVersion })
        .from(schema.validationAnswers)
        .where(
          and(
            eq(schema.validationAnswers.validationId, copy.validationId),
            eq(schema.validationAnswers.questionKey, "V.01.WHY_THEM"),
          ),
        );
      const [undone, edited] = await Promise.all([
        undo(copy.batchId),
        call(t.app, "PUT", `/api/v1/validations/${copy.validationId}/answers/V.01.WHY_THEM`, {
          as: who.ana,
          body: { text: "Racing edit", lockVersion: answer?.lockVersion ?? 0 },
        }),
      ]);
      expect([undone.status, edited.status].some((status) => status >= 500)).toBe(false);
      expect(
        (undone.status === 200 && edited.status !== 200) ||
          (undone.status !== 200 && edited.status === 200),
      ).toBe(true);
    }
  });

  test("a write holding an item row makes the undo answer 409 at once, and the write is untouched", async () => {
    const plan = await draft("Plan M");
    await holding(
      (tx) =>
        tx
          .select()
          .from(schema.planAnswers)
          .where(eq(schema.planAnswers.businessPlanId, plan.id))
          .for("update"),
      async () => {
        const started = Date.now();
        const res = await undo(plan.batchId);
        expect([res.status, res.body.error.code]).toEqual([409, "CONFLICT"]);
        expect(res.body.error.message).toContain("being changed right now");
        expect(Date.now() - started).toBeLessThan(400);
      },
      async (tx) => {
        await tx
          .update(schema.ideas)
          .set({ lastActivityAt: new Date() })
          .where(eq(schema.ideas.id, piaya));
      },
    );
    expect((await undo(plan.batchId)).status).toBe(200);
  });

  test("a comment being written (a share lock on the idea) makes the undo of a copy answer 409", async () => {
    const copy = await duplicate();
    await holding(
      (tx) => tx.select().from(schema.ideas).where(eq(schema.ideas.id, copy.id)).for("share"),
      async () => {
        const res = await undo(copy.batchId);
        expect([res.status, res.body.error.code]).toEqual([409, "CONFLICT"]);
        expect(res.body.error.message).toContain("being changed right now");
      },
    );
    expect(await t.db.select().from(schema.ideas).where(eq(schema.ideas.id, copy.id))).toHaveLength(
      1,
    );
    expect((await undo(copy.batchId)).status).toBe(200);
  });

  test("Viewers get 403, an archived plan 409", async () => {
    const plan = await draft("Plan G");
    expect((await undo(plan.batchId, who.grace)).status).toBe(403);
    await t.db
      .update(schema.businessPlans)
      .set({ archivedAt: new Date() })
      .where(eq(schema.businessPlans.id, plan.id));
    const res = await undo(plan.batchId);
    expect([res.status, res.body.error.code]).toEqual([409, "ARCHIVED"]);
  });
});

describe("a write whose parent was deleted while it waited", () => {
  const violation = (constraint: string, code = "23503") =>
    new DrizzleQueryError(
      "insert",
      [],
      Object.assign(new Error("db"), { code, constraint_name: constraint }),
    );

  test("a foreign key violation on the idea, validation or plan is recognised", () => {
    for (const name of [
      "plan_answers_business_plan_id_business_plans_id_fk",
      "research_log_entries_validation_id_validations_id_fk",
      "validations_idea_id_ideas_id_fk",
    ]) {
      expect(parentRowGone(violation(name))).toBe(true);
    }
  });

  test("other database errors stay unexpected", () => {
    expect(parentRowGone(violation("execution_items_assignee_user_id_users_id_fk"))).toBe(false);
    expect(
      parentRowGone(violation("plan_answers_business_plan_id_business_plans_id_fk", "23505")),
    ).toBe(false);
    expect(parentRowGone(new Error("boom"))).toBe(false);
  });
});
