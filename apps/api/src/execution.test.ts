import { afterAll, describe, expect, test } from "bun:test";
import { changeHistory, executionItems, memberships } from "@moonx/db";
import {
  commentListSchema,
  errorBodySchema,
  executionItemSchema,
  executionListSchema,
  historyPageSchema,
  planHomeSchema,
} from "@moonx/schemas";
import { and, eq } from "drizzle-orm";
import { lockMembers } from "./membership";
import { buildTestApp, connectTestDatabase } from "./test-app";
import {
  apiRequest,
  teamWithProceedIdea,
  testFixtures,
  untilBlockedBy,
} from "./test-fixtures";

const database = connectTestDatabase();
const { db } = database;
afterAll(() => database.close());

const fixtures = testFixtures(db);
// 2026-10-01 11:00 in Manila, the users' time zone.
let clock = Date.UTC(2026, 9, 1, 3, 0);
const { app } = buildTestApp(database, { now: () => clock });

const errorOf = async (response: Response) =>
  errorBodySchema.parse(await response.json()).error;

const call = (
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  cookie: string,
  body?: unknown,
) => app.handle(apiRequest(method, path, { cookie, body }));

/** A team with a Proceed idea and Plan A drafted by its Member. */
async function teamWithPlan() {
  const team = await teamWithProceedIdea(app, fixtures);
  const response = await call(
    "POST",
    `/api/v1/ideas/${team.idea.id}/plans`,
    team.memberCookie,
    { name: "Plan A" },
  );
  expect(response.status).toBe(201);
  const plan = planHomeSchema.parse(await response.json());
  return { ...team, planId: plan.id };
}

type Team = Awaited<ReturnType<typeof teamWithPlan>>;

async function add(team: Team, body: Record<string, unknown>) {
  const response = await call(
    "POST",
    `/api/v1/plans/${team.planId}/execution-items`,
    team.memberCookie,
    body,
  );
  expect(response.status).toBe(201);
  return executionItemSchema.parse(await response.json());
}

async function list(team: Team, query = "", cookie = team.viewerCookie) {
  const response = await call(
    "GET",
    `/api/v1/plans/${team.planId}/execution-items${query}`,
    cookie,
  );
  expect(response.status).toBe(200);
  return executionListSchema.parse(await response.json()).items;
}

const day = (days: number) =>
  new Date(clock + days * 86_400_000).toISOString().slice(0, 10);

describe("P9 /api/v1/plans/{planId}/execution-items", () => {
  test("adds items at the end of their type with their first status, and lists them in order", async () => {
    const team = await teamWithPlan();
    const late = await add(team, {
      type: "next_action",
      title: "Sign the lease",
      dueDate: day(-1),
      assigneeUserId: team.owner.id.toUpperCase(),
    });
    expect(late).toMatchObject({
      type: "next_action",
      status: "todo",
      overdue: true,
      sortOrder: 0,
      fromPreset: false,
      lockVersion: 0,
      assignee: { user: { id: team.owner.id } },
    });
    const undated = await add(team, {
      type: "next_action",
      title: "Find a courier",
    });
    const soon = await add(team, {
      type: "next_action",
      title: "Order boxes",
      dueDate: day(2),
      assigneeName: "Lito",
    });
    const launch = await add(team, { type: "launch", title: "Soft opening" });
    expect(launch).toMatchObject({
      launchTiming: "other",
      status: "todo",
      sortOrder: 5,
    });
    const question = await add(team, {
      type: "open_question",
      title: "Which courier?",
      whyItMatters: "Mornings",
      status: "resolved",
    });
    expect(question).toMatchObject({
      status: "resolved",
      completedAt: new Date(clock).toISOString(),
      dueDate: null,
    });
    const kpi = await add(team, {
      type: "kpi",
      title: "Reorders",
      kpiArea: "Customer",
      kpiActual: "3 of 5",
    });
    expect(kpi).toMatchObject({
      status: null,
      sortOrder: 12,
      kpiActualUpdatedAt: new Date(clock).toISOString(),
    });

    const all = await list(team);
    expect(all.map((item) => item.type)).toEqual([
      ...Array(6).fill("milestone"),
      ...Array(6).fill("launch"),
      ...Array(13).fill("kpi"),
      "open_question",
      "next_action",
      "next_action",
      "next_action",
    ]);
    expect(all.slice(-3).map((item) => item.id)).toEqual([
      late.id,
      soon.id,
      undated.id,
    ]);
    expect(
      (await list(team, "?type=next_action&assignee=me", team.ownerCookie)).map(
        (item) => item.id,
      ),
    ).toEqual([late.id]);
    expect(
      (await list(team, `?assignee=${team.owner.id}&status=done`)).length,
    ).toBe(0);
    // A typed name matches in any case: 22 lists "Lito" and "lito" once (design-spec 6.13).
    expect(
      (await list(team, "?assigneeName=%20lITO%20")).map((item) => item.id),
    ).toEqual([soon.id]);
    expect((await list(team, "?assigneeName=Lit")).length).toBe(0);
    // A name kept as typed, spaces and all, matches without them.
    const spaced = await add(team, {
      type: "next_action",
      title: "Pay the courier",
      assigneeName: "\u3000Mara\u00a0",
    });
    expect(
      (await list(team, "?assigneeName=mara")).map((item) => item.id),
    ).toEqual([spaced.id]);
    const blank = await call(
      "GET",
      `/api/v1/plans/${team.planId}/execution-items?assigneeName=%20`,
      team.viewerCookie,
    );
    expect(blank.status).toBe(422);
    expect(
      (await list(team, "?status=resolved")).map((item) => item.id),
    ).toEqual([question.id]);
    const bad = await call(
      "GET",
      `/api/v1/plans/${team.planId}/execution-items?assignee=someone`,
      team.viewerCookie,
    );
    expect(bad.status).toBe(422);

    const history = await db
      .select()
      .from(changeHistory)
      .where(
        and(
          eq(changeHistory.targetId, late.id),
          eq(changeHistory.containerId, team.planId),
        ),
      );
    expect(history).toMatchObject([
      {
        action: "create",
        source: "manual",
        sectionKey: "execution",
        after: {
          type: "next_action",
          title: "Sign the lease",
          assigneeUserId: team.owner.id,
          dueDate: day(-1),
        },
      },
    ]);
  });

  test("refuses columns, statuses and assignees the type does not take", async () => {
    const team = await teamWithPlan();
    const outsider = await fixtures.createUser();
    for (const [body, code, path] of [
      [
        { type: "next_action", title: "A", goal: "B" },
        "VALIDATION_FAILED",
        "goal",
      ],
      [
        { type: "kpi", title: "A", dueDate: day(1) },
        "VALIDATION_FAILED",
        "dueDate",
      ],
      [
        { type: "milestone", title: "A", launchTiming: "t_minus_7" },
        "VALIDATION_FAILED",
        "launchTiming",
      ],
      [
        { type: "milestone", title: "A", answer: null },
        "VALIDATION_FAILED",
        "answer",
      ],
      [
        { type: "milestone", title: "A", status: "open" },
        "INVALID_STATUS",
        undefined,
      ],
      [
        { type: "milestone", title: "A", status: null },
        "INVALID_STATUS",
        undefined,
      ],
      [
        { type: "kpi", title: "A", status: "todo" },
        "INVALID_STATUS",
        undefined,
      ],
      [
        { type: "milestone", title: "A", assigneeUserId: team.viewer.id },
        "INVALID_ASSIGNEE",
        undefined,
      ],
      [
        { type: "milestone", title: "A", assigneeUserId: outsider.id },
        "INVALID_ASSIGNEE",
        undefined,
      ],
      [
        {
          type: "milestone",
          title: "A",
          assigneeUserId: team.owner.id,
          assigneeName: "Lito",
        },
        "VALIDATION_FAILED",
        "assigneeName",
      ],
      [{ type: "milestone", title: " " }, "VALIDATION_FAILED", "title"],
    ] as const) {
      const response = await call(
        "POST",
        `/api/v1/plans/${team.planId}/execution-items`,
        team.memberCookie,
        body,
      );
      const error = await errorOf(response);
      expect({
        body,
        status: response.status,
        code: error.code,
        path: error.details?.[0]?.path,
      }).toEqual({ body, status: 422, code, path });
    }
    const kpi = await add(team, { type: "kpi", title: "A", status: null });
    expect(kpi.status).toBeNull();
    const viewer = await call(
      "POST",
      `/api/v1/plans/${team.planId}/execution-items`,
      team.viewerCookie,
      { type: "milestone", title: "A" },
    );
    expect(viewer.status).toBe(403);
  });

  test("waits for a member being released, then refuses them as the assignee", async () => {
    const team = await teamWithPlan();
    let response: Promise<Response> | undefined;
    await db.transaction(async (tx) => {
      await lockMembers(tx, team.workspace.id);
      response = call(
        "POST",
        `/api/v1/plans/${team.planId}/execution-items`,
        team.ownerCookie,
        { type: "milestone", title: "A", assigneeUserId: team.member.id },
      );
      await untilBlockedBy(db, tx);
      await tx
        .update(memberships)
        .set({ role: "viewer" })
        .where(
          and(
            eq(memberships.workspaceId, team.workspace.id),
            eq(memberships.userId, team.member.id),
          ),
        );
    });
    if (response === undefined) throw new Error("The request did not start");
    const answered = await response;
    expect(answered.status).toBe(422);
    expect((await errorOf(answered)).code).toBe("INVALID_ASSIGNEE");
  });
});

describe("P10 /api/v1/execution-items/{itemId}", () => {
  test("PATCH saves under the lock, stamping completion and the KPI actual", async () => {
    const team = await teamWithPlan();
    const [kpi] = await list(team, "?type=kpi");
    const [milestone] = await list(team, "?type=milestone");
    if (kpi === undefined || milestone === undefined)
      throw new Error("No rows");
    const path = `/api/v1/execution-items/${milestone.id}`;
    clock += 60_000;
    const done = await call("PATCH", path, team.memberCookie, {
      status: "done",
      assigneeUserId: team.owner.id,
      goal: "Signed lease",
      lockVersion: 0,
    });
    expect(done.status).toBe(200);
    const doneView = executionItemSchema.parse(await done.json());
    expect(doneView).toMatchObject({
      status: "done",
      completedAt: new Date(clock).toISOString(),
      goal: "Signed lease",
      lockVersion: 1,
      assignee: { user: { id: team.owner.id } },
      fromPreset: true,
    });
    const renamed = await call("PATCH", path, team.memberCookie, {
      assigneeName: "Lito",
      lockVersion: 1,
    });
    expect(executionItemSchema.parse(await renamed.json())).toMatchObject({
      assignee: { name: "Lito" },
      completedAt: new Date(clock).toISOString(),
      lockVersion: 2,
    });
    clock += 60_000;
    const reopened = await call("PATCH", path, team.memberCookie, {
      status: "doing",
      lockVersion: 2,
    });
    expect(executionItemSchema.parse(await reopened.json())).toMatchObject({
      status: "doing",
      completedAt: null,
    });
    const same = await call("PATCH", path, team.memberCookie, {
      status: "doing",
      lockVersion: 0,
    });
    expect(executionItemSchema.parse(await same.json()).lockVersion).toBe(3);
    const stale = await call("PATCH", path, team.memberCookie, {
      title: "Other",
      lockVersion: 1,
    });
    expect(stale.status).toBe(409);
    expect(await errorOf(stale)).toMatchObject({
      code: "CONFLICT",
      current: {
        lockVersion: 3,
        value: { status: "doing", assigneeName: "Lito" },
      },
    });
    // The type never changes, so a column it lacks is 422 even on a stale save.
    const foreign = await call("PATCH", path, team.memberCookie, {
      kpiActual: "1",
      lockVersion: 1,
    });
    expect(foreign.status).toBe(422);
    expect((await errorOf(foreign)).code).toBe("VALIDATION_FAILED");

    const actual = await call(
      "PATCH",
      `/api/v1/execution-items/${kpi.id}`,
      team.memberCookie,
      { kpiActual: "₱120,000", kpiTarget: "₱150,000", lockVersion: 0 },
    );
    expect(executionItemSchema.parse(await actual.json())).toMatchObject({
      kpiActual: "₱120,000",
      kpiActualUpdatedAt: new Date(clock).toISOString(),
    });
    clock += 60_000;
    const target = await call(
      "PATCH",
      `/api/v1/execution-items/${kpi.id}`,
      team.memberCookie,
      { kpiTarget: "₱160,000", lockVersion: 1 },
    );
    expect(
      executionItemSchema.parse(await target.json()).kpiActualUpdatedAt,
    ).toBe(new Date(clock - 60_000).toISOString());

    const history = await db
      .select()
      .from(changeHistory)
      .where(eq(changeHistory.targetId, milestone.id))
      .orderBy(changeHistory.changedAt, changeHistory.id);
    // The member's saves, minutes apart, are one row (ADR-020): from the item as the
    // draft made it to the last accepted save, which the refused ones did not touch.
    expect(history.map((row) => [row.source, row.action])).toEqual([
      ["plan_draft", "create"],
      ["manual", "update"],
    ]);
    const [created, merged] = history;
    expect(merged?.before).toEqual(created?.after);
    expect(merged?.after).toMatchObject({
      status: "doing",
      assigneeUserId: null,
      assigneeName: "Lito",
      goal: "Signed lease",
    });
  });

  test("DELETE hides the item, with its history; a deleted item is 404", async () => {
    const team = await teamWithPlan();
    const [item] = await list(team, "?type=launch");
    if (item === undefined) throw new Error("No launch row");
    const path = `/api/v1/execution-items/${item.id}`;
    const viewer = await call("DELETE", path, team.viewerCookie);
    expect(viewer.status).toBe(403);
    const deleted = await call("DELETE", path, team.memberCookie);
    expect(deleted.status).toBe(204);
    expect(
      (await list(team, "?type=launch")).map((row) => row.id),
    ).not.toContain(item.id);
    expect((await call("DELETE", path, team.memberCookie)).status).toBe(404);
    expect(
      (
        await call("PATCH", path, team.memberCookie, {
          title: "A",
          lockVersion: 0,
        })
      ).status,
    ).toBe(404);
    const [row] = await db
      .select()
      .from(changeHistory)
      .where(
        and(
          eq(changeHistory.targetId, item.id),
          eq(changeHistory.action, "delete"),
        ),
      );
    expect(row).toMatchObject({
      before: { title: "30 days before launch" },
      after: null,
    });
    const plan = await call(
      "GET",
      `/api/v1/plans/${team.planId}`,
      team.memberCookie,
    );
    expect(planHomeSchema.parse(await plan.json()).draftOnly).toBe(false);
  });
});

describe("P11 PUT /api/v1/plans/{planId}/execution-items/order", () => {
  test("reorders a type without history or a new version, and refuses Next Actions", async () => {
    const team = await teamWithPlan();
    const path = `/api/v1/plans/${team.planId}/execution-items/order`;
    const milestones = await list(team, "?type=milestone");
    const ids = milestones.map((item) => item.id).reverse();
    const ordered = await call("PUT", path, team.memberCookie, {
      type: "milestone",
      ids,
    });
    expect(ordered.status).toBe(204);
    const after = await list(team, "?type=milestone");
    expect(after.map((item) => item.id)).toEqual(ids);
    expect(after.every((item) => item.lockVersion === 0)).toBe(true);
    const rows = await db
      .select()
      .from(executionItems)
      .where(eq(executionItems.businessPlanId, team.planId));
    expect(
      rows.every(
        (row) => row.updatedAt.getTime() === rows[0]?.updatedAt.getTime(),
      ),
    ).toBe(true);

    for (const body of [
      { type: "next_action", ids: [] },
      { type: "milestone", ids: ids.slice(1) },
      { type: "milestone", ids: [...ids, ids[0]] },
      { type: "launch", ids },
    ]) {
      const response = await call("PUT", path, team.memberCookie, body);
      expect(response.status).toBe(422);
    }
    const history = await db
      .select()
      .from(changeHistory)
      .where(
        and(
          eq(changeHistory.containerId, team.planId),
          eq(changeHistory.source, "manual"),
        ),
      );
    expect(history).toEqual([]);
  });
});

describe("21's execution sub-items in H1 and C1", () => {
  test("execution:{type} lists the plan's execution items of that type, deleted ones included", async () => {
    const team = await teamWithPlan();
    const milestone = await add(team, { type: "milestone", title: "Lease" });
    const gone = await add(team, { type: "milestone", title: "Old" });
    const kpi = await add(team, { type: "kpi", title: "Revenue" });
    expect(
      (
        await call(
          "DELETE",
          `/api/v1/execution-items/${gone.id}`,
          team.memberCookie,
        )
      ).status,
    ).toBe(204);
    for (const item of [milestone, kpi]) {
      const posted = await call("POST", "/api/v1/comments", team.memberCookie, {
        workspaceId: team.workspace.id,
        target: { type: "execution_item", id: item.id, key: null },
        body: `On ${item.title}`,
        mentionUserIds: [],
      });
      expect(posted.status).toBe(201);
    }
    const screen = `containerType=business_plan&containerId=${team.planId}`;

    const history = await call(
      "GET",
      `/api/v1/history?${screen}&sectionKeys=23,execution:milestone`,
      team.viewerCookie,
    );
    expect(history.status).toBe(200);
    const changed = new Set(
      historyPageSchema
        .parse(await history.json())
        .items.map((entry) => entry.target.id),
    );
    expect(changed.has(milestone.id)).toBe(true);
    expect(changed.has(gone.id)).toBe(true);
    expect(changed.has(kpi.id)).toBe(false);

    const threads = await call(
      "GET",
      `/api/v1/comments?workspaceId=${team.workspace.id}&${screen}&sectionKeys=23,execution:milestone`,
      team.viewerCookie,
    );
    expect(threads.status).toBe(200);
    expect(
      commentListSchema
        .parse(await threads.json())
        .threads.map((thread) => thread.root.body),
    ).toEqual(["On Lease"]);

    // The item's own section alone, or a type unknown, lists none of them.
    const plain = await call(
      "GET",
      `/api/v1/history?${screen}&sectionKeys=23,execution:unknown`,
      team.viewerCookie,
    );
    expect(
      historyPageSchema
        .parse(await plain.json())
        .items.filter((entry) => entry.target.type === "execution_item"),
    ).toEqual([]);
  });
});
