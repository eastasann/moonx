import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { schema } from "@moonx/db";
import { BCDX, ideaId, personalWorkspaceId, userId } from "@moonx/db/seed";
import { eq } from "drizzle-orm";
import { addDays, todayIn } from "../src/lib/dashboard-data";
import { call, login, startTestApp, type TestApp } from "./helpers";

let t: TestApp;
let ana: Record<string, string>;
let kenji: Record<string, string>;
let paolo: Record<string, string>;
let grace: Record<string, string>;
let admin: Record<string, string>;

beforeAll(async () => {
  t = await startTestApp();
  ana = await login(t.app, "ana");
  kenji = await login(t.app, "kenji");
  paolo = await login(t.app, "paolo");
  grace = await login(t.app, "grace");
  admin = await login(t.app, "admin");
});
afterAll(async () => {
  await t.close();
});

const dash = (part: string, workspace = BCDX) =>
  `/api/v1/workspaces/${workspace}/dashboard/${part}`;
const PARTS = ["ideas", "self-analyses", "due-soon", "activity"] as const;

describe("access", () => {
  test("anonymous 401, stranger 403 NO_ACCESS, unknown workspace 404", async () => {
    for (const part of PARTS) {
      expect((await call(t.app, "GET", dash(part))).status, part).toBe(401);
      const stranger = await call(t.app, "GET", dash(part), { as: admin });
      expect(stranger.status, part).toBe(403);
      expect(stranger.body.error.code).toBe("NO_ACCESS");
      const missing = await call(t.app, "GET", dash(part, "6f1f3f3a-1111-4111-8111-111111111111"), {
        as: ana,
      });
      expect(missing.status, part).toBe(404);
      expect((await call(t.app, "GET", dash(part, "nope"), { as: ana })).status).toBe(422);
    }
  });

  test("D1, D3 and D4 are open to every role; D2 is closed to Viewers", async () => {
    for (const part of ["ideas", "due-soon", "activity"]) {
      for (const who of [ana, kenji, paolo, grace]) {
        expect((await call(t.app, "GET", dash(part), { as: who })).status, part).toBe(200);
      }
    }
    for (const who of [ana, kenji, paolo]) {
      expect((await call(t.app, "GET", dash("self-analyses"), { as: who })).status).toBe(200);
    }
    const viewer = await call(t.app, "GET", dash("self-analyses"), { as: grace });
    expect(viewer.status).toBe(403);
    expect(viewer.body.error.code).toBe("FORBIDDEN");
  });

  test("another workspace's dashboard holds none of BCDX's data", async () => {
    const own = personalWorkspaceId("kenji");
    expect((await call(t.app, "GET", dash("ideas", own), { as: kenji })).body).toEqual({
      items: [],
      droppedCount: 0,
    });
    expect((await call(t.app, "GET", dash("due-soon", own), { as: kenji })).body).toEqual({
      items: [],
    });
    expect((await call(t.app, "GET", dash("activity", own), { as: kenji })).body).toEqual({
      items: [],
    });
    expect((await call(t.app, "GET", dash("ideas", own), { as: ana })).status).toBe(403);
  });
});

describe("D1 ideas", () => {
  test("lists ideas that are neither archived nor Drop, newest activity first", async () => {
    const res = await call(t.app, "GET", dash("ideas"), { as: grace });
    expect(res.body.droppedCount).toBe(1);
    expect(res.body.items.map((i: { name: string }) => i.name)).toEqual([
      "Piaya Gift Box Delivery",
      "Bacolod Health Bowl",
      "Piaya Gift Box (Corporate)",
      "Mobile Bike Repair",
      "Student Study Café",
    ]);
    const piaya = res.body.items[0];
    expect(piaya).toMatchObject({
      id: ideaId("piaya"),
      stage: "planning",
      latestDecision: "proceed",
      proposer: { displayName: "Ana Villanueva" },
    });
    expect(piaya.keyMetrics.initial_cost_total.value).toBe(169500);
    expect(piaya.checks).toHaveLength(6);
    expect(piaya.plans.map((p: { name: string }) => p.name)).toEqual(["Plan A", "Plan B"]);
    const times = res.body.items.map((i: { lastActivityAt: string }) => i.lastActivityAt);
    expect(times).toEqual([...times].sort().reverse());
  });

  test("archiving removes an idea; archived Drop ideas are not counted", async () => {
    await call(t.app, "POST", `/api/v1/ideas/${ideaId("bike-repair")}/archive`, { as: ana });
    await call(t.app, "POST", `/api/v1/ideas/${ideaId("laundry")}/archive`, { as: ana });
    const res = await call(t.app, "GET", dash("ideas"), { as: ana });
    expect(res.body.items.map((i: { name: string }) => i.name)).not.toContain("Mobile Bike Repair");
    expect(res.body.droppedCount).toBe(0);
    await call(t.app, "POST", `/api/v1/ideas/${ideaId("bike-repair")}/restore`, { as: ana });
    await call(t.app, "POST", `/api/v1/ideas/${ideaId("laundry")}/restore`, { as: ana });
    const back = await call(t.app, "GET", dash("ideas"), { as: ana });
    expect(back.body.items).toHaveLength(5);
    expect(back.body.droppedCount).toBe(1);
  });
});

describe("D2 self analyses", () => {
  test("Owners and Members with their sharing state; progress only when shared", async () => {
    const res = await call(t.app, "GET", dash("self-analyses"), { as: kenji });
    expect(res.body.items).toHaveLength(3);
    expect(
      res.body.items.map((i: { user: { displayName: string } }) => i.user.displayName),
    ).toEqual(["Ana Villanueva", "Kenji Mori", "Paolo Gonzaga"]);
    expect(res.body.items[0]).toMatchObject({
      user: { id: userId("ana") },
      shared: true,
      status: "done",
    });
    expect(res.body.items[1]).toMatchObject({
      user: { id: userId("kenji") },
      shared: false,
      status: null,
    });
    expect(res.body.items[2]).toMatchObject({
      user: { id: userId("paolo") },
      shared: true,
      status: "done",
    });
    expect(JSON.stringify(res.body)).not.toContain("Grace");
  });

  test("sharing is per workspace and follows the share row", async () => {
    const [kenjiAnalysis] = await t.db
      .select()
      .from(schema.selfAnalyses)
      .where(eq(schema.selfAnalyses.userId, userId("kenji")));
    await t.db.insert(schema.selfAnalysisShares).values({
      selfAnalysisId: kenjiAnalysis?.id as string,
      workspaceId: personalWorkspaceId("kenji"),
    });
    const elsewhere = await call(t.app, "GET", dash("self-analyses"), { as: ana });
    expect(elsewhere.body.items[1]).toMatchObject({ shared: false, status: null });
    await t.db
      .insert(schema.selfAnalysisShares)
      .values({ selfAnalysisId: kenjiAnalysis?.id as string, workspaceId: BCDX });
    const shared = await call(t.app, "GET", dash("self-analyses"), { as: ana });
    expect(shared.body.items[1]).toMatchObject({ shared: true, status: kenjiAnalysis?.status });
    expect(kenjiAnalysis?.status).toBe("in_progress");
    await t.db
      .delete(schema.selfAnalysisShares)
      .where(eq(schema.selfAnalysisShares.selfAnalysisId, kenjiAnalysis?.id as string));
  });
});

describe("D3 due soon", () => {
  const dueOf = async (who: Record<string, string>) =>
    (await call(t.app, "GET", dash("due-soon"), { as: who })).body.items as {
      id: string;
      title: string;
      dueDate: string;
      overdue: boolean;
      isMine: boolean;
      type: string;
      assignee: { user?: { id: string }; name?: string } | null;
      idea: { id: string; name: string };
      plan: { id: string; name: string };
    }[];

  test("overdue and within seven days, the caller's own first, then by date", async () => {
    const items = await dueOf(ana);
    expect(items.map((i) => i.title)).toEqual([
      "Get the written supply quote from the bakery",
      "Confirm permit requirements with City Hall",
      "First 30 days",
      "Test delivery slots with five offices",
    ]);
    expect(items[0]).toMatchObject({
      type: "next_action",
      overdue: true,
      isMine: true,
      assignee: { user: { id: userId("ana"), displayName: "Ana Villanueva" } },
      idea: { id: ideaId("piaya"), name: "Piaya Gift Box Delivery" },
      plan: { name: "Plan A" },
    });
    expect(items.slice(1).every((i) => !i.isMine && !i.overdue)).toBe(true);
    // The API takes "today" in the caller's time zone (ana: Asia/Manila), which is ahead of UTC.
    const today = todayIn("Asia/Manila", new Date());
    const limit = addDays(today, 7);
    for (const item of items) {
      expect(item.dueDate <= limit).toBe(true);
      expect(item.overdue).toBe(item.dueDate < today);
    }
    expect(items[2]?.idea.name).toBe("Student Study Café");

    const kenjiItems = await dueOf(kenji);
    expect(kenjiItems[0]).toMatchObject({
      title: "Confirm permit requirements with City Hall",
      isMine: true,
    });
    expect(kenjiItems.slice(1).map((i) => i.dueDate)).toEqual(
      [...kenjiItems.slice(1).map((i) => i.dueDate)].sort(),
    );
    expect((await dueOf(grace)).every((i) => !i.isMine)).toBe(true);
  });

  test("done, deleted, undated, far-off items and archived plans or ideas are left out", async () => {
    const baseline = await dueOf(ana);
    const [plan] = await t.db
      .select()
      .from(schema.businessPlans)
      .where(eq(schema.businessPlans.id, baseline[0]?.plan.id as string));
    const [template] = await t.db
      .select()
      .from(schema.executionItems)
      .where(eq(schema.executionItems.id, baseline[0]?.id as string));
    const day = (offset: number) => addDays(todayIn("Asia/Manila", new Date()), offset);
    const make = async (
      title: string,
      over: Partial<typeof schema.executionItems.$inferInsert>,
    ) => {
      const [row] = await t.db
        .insert(schema.executionItems)
        .values({
          businessPlanId: plan?.id as string,
          type: "next_action",
          title,
          sortOrder: 900,
          dueDate: day(1),
          status: "todo",
          ...over,
        })
        .returning({ id: schema.executionItems.id });
      return row?.id as string;
    };
    expect(template).toBeDefined();
    await make("Edge: in seven days", { dueDate: day(7), assigneeName: "A supplier" });
    await make("Edge: in eight days", { dueDate: day(8) });
    await make("Edge: done", { status: "done" });
    await make("Edge: resolved", { type: "open_question", status: "resolved" });
    await make("Edge: deleted", { deletedAt: new Date() });
    await make("Edge: no date", { dueDate: null });
    await make("Edge: open question", { type: "open_question", status: "open", dueDate: day(-1) });
    const titles = (await dueOf(ana)).map((i) => i.title).filter((n) => n.startsWith("Edge"));
    expect(titles).toEqual(["Edge: open question", "Edge: in seven days"]);
    const free = (await dueOf(ana)).find((i) => i.title === "Edge: in seven days");
    expect(free?.assignee).toEqual({ name: "A supplier" });
    expect(free?.isMine).toBe(false);
    expect((await dueOf(ana)).find((i) => i.title === "Edge: open question")?.assignee).toBeNull();

    await t.db
      .update(schema.businessPlans)
      .set({ archivedAt: new Date() })
      .where(eq(schema.businessPlans.id, plan?.id as string));
    const withoutPlan = await dueOf(ana);
    expect(withoutPlan.some((i) => i.plan.id === plan?.id)).toBe(false);
    expect(withoutPlan.length).toBeGreaterThan(0);
    await t.db
      .update(schema.businessPlans)
      .set({ archivedAt: null })
      .where(eq(schema.businessPlans.id, plan?.id as string));

    await call(t.app, "POST", `/api/v1/ideas/${ideaId("piaya")}/archive`, { as: ana });
    expect((await dueOf(ana)).some((i) => i.idea.id === ideaId("piaya"))).toBe(false);
    await call(t.app, "POST", `/api/v1/ideas/${ideaId("piaya")}/restore`, { as: ana });
    expect((await dueOf(ana)).some((i) => i.idea.id === ideaId("piaya"))).toBe(true);
    await t.db.delete(schema.executionItems).where(eq(schema.executionItems.sortOrder, 900));
  });
});

describe("D4 activity", () => {
  type Entry = {
    kind: string;
    at: string;
    summary: string;
    actor: { id: string; displayName: string };
    idea: { id: string; name: string } | null;
    plan: { id: string; name: string } | null;
    link: Record<string, unknown> & { screen: number; panel?: string };
  };
  const activity = async (who = ana) =>
    (await call(t.app, "GET", dash("activity"), { as: who })).body.items as Entry[];

  test("newest 20 first, all five kinds, self analysis left out", async () => {
    const items = await activity(grace);
    expect(items.length).toBeLessThanOrEqual(20);
    expect(items.length).toBeGreaterThan(10);
    const times = items.map((i) => i.at);
    expect(times).toEqual([...times].sort().reverse());
    expect(new Set(items.map((i) => i.kind))).toEqual(
      new Set(["change", "comment", "decision", "go_no_go", "version_saved"]),
    );
    for (const item of items) {
      expect(item.link.screen).not.toBe(12);
      expect(item.link.screen).not.toBe(10);
      expect(item.summary).not.toContain("SA.");
      expect(item.actor.displayName.length).toBeGreaterThan(0);
      expect(item.link.workspaceId).toBe(BCDX);
    }
    expect(JSON.stringify(items)).not.toContain("self_analysis");
  });

  test("entries carry their label, idea, plan and a link to the item", async () => {
    const items = await activity();
    const goNoGo = items.find((i) => i.kind === "go_no_go");
    expect(goNoGo).toMatchObject({
      summary: "delay",
      actor: { id: userId("ana") },
      idea: { id: ideaId("piaya"), name: "Piaya Gift Box Delivery" },
      plan: { name: "Plan A" },
      link: { screen: 20, ideaId: ideaId("piaya") },
    });
    const versions = items.filter((i) => i.kind === "version_saved").map((i) => i.summary);
    expect(versions.every((v) => v.startsWith("v1 "))).toBe(true);
    const decision = items.find((i) => i.kind === "decision");
    expect(["proceed", "hold", "drop"]).toContain(decision?.summary as string);
    expect(decision?.link.screen).toBe(13);

    const rent = items.find((i) => i.kind === "comment" && i.summary === "Costs · Rent");
    expect(rent).toMatchObject({
      actor: { id: userId("ana") },
      idea: { id: ideaId("piaya") },
      plan: null,
      link: { screen: 17, panel: "comments", ideaId: ideaId("piaya") },
    });
    const planComment = items.find((i) => i.kind === "comment" && i.summary === "Plan 24.2");
    expect(planComment?.link).toMatchObject({
      screen: 21,
      panel: "comments",
      itemNo: 24,
      questionKey: "P.24.2",
    });
    const answer = items.find((i) => i.kind === "change" && i.summary === "02 DRIVERS");
    expect(answer?.link).toMatchObject({
      screen: 11,
      sectionKey: "02",
      questionKey: "V.02.DRIVERS",
    });
    expect(answer?.link.panel).toBeUndefined();
  });

  test("one entry per batched operation; a copy shows as the new idea", async () => {
    const batchRows = await t.db
      .select()
      .from(schema.changeHistory)
      .where(eq(schema.changeHistory.source, "plan_draft"));
    expect(batchRows.length).toBeGreaterThan(20);

    const copy = await call(t.app, "POST", `/api/v1/ideas/${ideaId("piaya")}/duplicate`, {
      as: paolo,
      body: {},
    });
    const items = await activity();
    const mine = items.filter((i) => i.idea?.id === copy.body.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      kind: "change",
      summary: "Piaya Gift Box Delivery (copy)",
      actor: { id: userId("paolo") },
      link: { screen: 13, ideaId: copy.body.id },
    });
    expect(items[0]).toEqual(mine[0] as Entry);
    const drafts = items.filter((i) => i.plan !== null && i.kind === "change");
    expect(new Set(drafts.map((d) => d.plan?.id)).size).toBe(drafts.length);
  });

  test("comments appear, deleted ones and self-analysis ones do not", async () => {
    const [validation] = await t.db
      .select()
      .from(schema.validations)
      .where(eq(schema.validations.ideaId, ideaId("health-bowl")));
    const insert = (over: Partial<typeof schema.comments.$inferInsert>) =>
      t.db
        .insert(schema.comments)
        .values({
          workspaceId: BCDX,
          targetType: "validation_answer",
          targetId: validation?.id as string,
          targetKey: "V.01.WHO",
          authorId: userId("kenji"),
          body: "Fresh comment",
          ...over,
        })
        .returning({ id: schema.comments.id });
    await insert({ body: "Shown" });
    await insert({ body: "Hidden", deletedAt: new Date(), targetKey: "V.01.WHY_THEM" });
    await insert({
      body: "Private",
      targetType: "self_analysis_answer",
      targetId: userId("ana"),
      targetKey: "SA.WHY.1",
    });
    const items = await activity();
    expect(items[0]).toMatchObject({
      kind: "comment",
      summary: "01 WHO",
      actor: { id: userId("kenji") },
      idea: { id: ideaId("health-bowl") },
      link: { screen: 11, panel: "comments", questionKey: "V.01.WHO" },
    });
    expect(items.filter((i) => i.kind === "comment" && i.summary === "01 WHY THEM")).toHaveLength(
      0,
    );
    expect(items.filter((i) => i.link.screen === 12)).toHaveLength(0);
  });

  test("changes of an idea show the idea's name; self-analysis history never shows", async () => {
    await call(t.app, "PATCH", `/api/v1/ideas/${ideaId("bike-repair")}`, {
      as: kenji,
      body: { oneLineConcept: "Bike repair that comes to you", lockVersion: 0 },
    });
    const items = await activity();
    expect(items[0]).toMatchObject({
      kind: "change",
      summary: "Mobile Bike Repair",
      actor: { id: userId("kenji") },
      idea: { id: ideaId("bike-repair") },
      link: { screen: 13, target: { type: "idea", id: ideaId("bike-repair") } },
    });
    const selfRows = await t.db
      .select()
      .from(schema.changeHistory)
      .where(eq(schema.changeHistory.targetType, "self_analysis_answer"));
    expect(selfRows.length).toBeGreaterThan(0);
    expect(items.every((i) => i.summary !== "SA.WHY.1")).toBe(true);
  });
});
