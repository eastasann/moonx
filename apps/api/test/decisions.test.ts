import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { schema } from "@moonx/db";
import { BCDX, ideaId, personalWorkspaceId, userId } from "@moonx/db/seed";
import { and, eq } from "drizzle-orm";
import { computeValidationState, loadValidationData } from "../src/lib/validation-data";
import { call, login, startTestApp, type TestApp } from "./helpers";

let t: TestApp;
let ana: Record<string, string>;
let kenji: Record<string, string>;
let grace: Record<string, string>;
let admin: Record<string, string>;

beforeAll(async () => {
  t = await startTestApp();
  ana = await login(t.app, "ana");
  kenji = await login(t.app, "kenji");
  grace = await login(t.app, "grace");
  admin = await login(t.app, "admin");
});
afterAll(async () => {
  await t.close();
});

const piaya = ideaId("piaya");
const fresh = ideaId("piaya-corp");
const health = ideaId("health-bowl");
const ctxPath = (id: string) => `/api/v1/ideas/${id}/decision-context`;
const postPath = (id: string) => `/api/v1/ideas/${id}/decisions`;

const entriesOf = (id: string) =>
  t.db
    .select()
    .from(schema.decisionLogEntries)
    .where(
      and(
        eq(schema.decisionLogEntries.ideaId, id),
        eq(schema.decisionLogEntries.kind, "validation_decision"),
      ),
    );

async function stateNow(id: string) {
  const [validation] = await t.db
    .select({ id: schema.validations.id })
    .from(schema.validations)
    .where(eq(schema.validations.ideaId, id));
  const data = (await loadValidationData(t.db, [(validation as { id: string }).id])).get(
    (validation as { id: string }).id,
  );
  return computeValidationState(data as NonNullable<typeof data>, {
    workspaceId: BCDX,
    ideaId: id,
  });
}

describe("V18 decision context", () => {
  test("returns the summary, numbers, missing checks, F/A/U and the last decision", async () => {
    const res = await call(t.app, "GET", ctxPath(health), { as: ana });
    expect(res.status).toBe(200);
    const state = await stateNow(health);
    const b = res.body;
    expect(Object.keys(b).sort()).toEqual(
      ["fau", "keyMetrics", "lastDecision", "missingChecks", "summary"].sort(),
    );
    expect(Object.keys(b.summary).sort()).toEqual(
      [
        "biggestOpportunity",
        "biggestRisk",
        "biggestUnknown",
        "customer",
        "marketType",
        "oneLineConcept",
        "problem",
        "solution",
      ].sort(),
    );
    const [idea] = await t.db.select().from(schema.ideas).where(eq(schema.ideas.id, health));
    expect(b.summary.oneLineConcept).toBe(idea?.oneLineConcept);
    expect(b.summary.solution).toBe(idea?.proposedSolution ?? null);
    expect(Object.keys(b.keyMetrics).sort()).toEqual(
      [
        "break_even_units_day",
        "expected_operating_profit",
        "initial_cost_total",
        "payback_months",
        "simple_roi",
      ].sort(),
    );
    for (const key of Object.keys(b.keyMetrics)) {
      expect(b.keyMetrics[key]).toEqual(JSON.parse(JSON.stringify(state.keyMetrics[key])));
    }
    expect(b.missingChecks).toEqual(
      JSON.parse(JSON.stringify(state.checks.filter((c) => c.state !== "done"))),
    );
    expect(b.missingChecks.length).toBeGreaterThan(0);
    expect(b.fau).toEqual(JSON.parse(JSON.stringify(state.fau)));
    expect(b.lastDecision).toMatchObject({
      kind: "validation_decision",
      value: "hold",
      idea: { id: health },
      recordedBy: { id: userId("kenji") },
    });
    expect(b.lastDecision.reasonExcerpt).toContain("still missing");
  });

  test("answer texts come from the validation answers, null when empty", async () => {
    const res = await call(t.app, "GET", ctxPath(piaya), { as: ana });
    const answers = await t.db.select().from(schema.validationAnswers);
    const [validation] = await t.db
      .select({ id: schema.validations.id })
      .from(schema.validations)
      .where(eq(schema.validations.ideaId, piaya));
    const text = (key: string) =>
      answers.find((a) => a.validationId === validation?.id && a.questionKey === key)?.text ?? null;
    expect(res.body.summary.customer).toBe(text("V.01.WHO"));
    expect(res.body.summary.problem).toBe(text("V.01.PROBLEM"));
    expect(res.body.summary.marketType).toBe(text("V.02.OCEAN"));
    expect(res.body.summary.biggestRisk).toBe(text("V.10.BIGGEST_RISK"));
    expect(res.body.summary.customer).not.toBeNull();
    expect(res.body.lastDecision.value).toBe("proceed");
  });

  test("an idea with no decision has lastDecision null", async () => {
    const res = await call(t.app, "GET", ctxPath(fresh), { as: ana });
    expect(res.status).toBe(200);
    expect(res.body.lastDecision).toBeNull();
  });

  test("Owner and Member read; Viewer 403; outsiders and the Admin 403; unknown 404; no login 401", async () => {
    expect((await call(t.app, "GET", ctxPath(piaya), { as: kenji })).status).toBe(200);
    const viewer = await call(t.app, "GET", ctxPath(piaya), { as: grace });
    expect(viewer.status).toBe(403);
    expect(viewer.body.error.code).toBe("FORBIDDEN");
    const outsider = await call(t.app, "GET", ctxPath(piaya), { as: admin });
    expect(outsider.status).toBe(403);
    expect(outsider.body.error.code).toBe("NO_ACCESS");
    const missing = await call(t.app, "GET", ctxPath(crypto.randomUUID()), { as: ana });
    expect(missing.status).toBe(404);
    expect((await call(t.app, "GET", ctxPath(piaya))).status).toBe(401);
    expect((await call(t.app, "GET", ctxPath("nope"), { as: ana })).status).toBe(422);
  });

  test("works on an archived idea", async () => {
    await t.db
      .update(schema.ideas)
      .set({ archivedAt: new Date() })
      .where(eq(schema.ideas.id, health));
    const res = await call(t.app, "GET", ctxPath(health), { as: ana });
    await t.db.update(schema.ideas).set({ archivedAt: null }).where(eq(schema.ideas.id, health));
    expect(res.status).toBe(200);
  });
});

describe("V19 record a decision", () => {
  test("appends the entry with the snapshot of the screen, updates the idea and notifies", async () => {
    const before = await stateNow(fresh);
    const ctxRes = await call(t.app, "GET", ctxPath(fresh), { as: ana });
    const res = await call(t.app, "POST", postPath(fresh), {
      as: ana,
      body: { value: "proceed", reason: "  Worth planning.  ", basedOnDecisionId: null },
    });
    expect(res.status).toBe(201);
    expect(res.body.latestDecision).toBe("proceed");
    expect(res.body.canCreatePlan).toBe(true);
    const entry = res.body.entry;
    expect(entry).toMatchObject({
      kind: "validation_decision",
      value: "proceed",
      reason: "Worth planning.",
      reasonExcerpt: "Worth planning.",
      versionName: null,
      plan: null,
      idea: { id: fresh },
      recordedBy: { id: userId("ana") },
    });
    expect(new Date(entry.recordedAt).toString()).not.toBe("Invalid Date");
    expect(entry.snapshot).toEqual({
      missingChecks: JSON.parse(JSON.stringify(before.checks.filter((c) => c.state !== "done"))),
      keyMetrics: JSON.parse(JSON.stringify(before.keyMetrics)),
      fau: JSON.parse(JSON.stringify(before.fau)),
    });
    expect(entry.snapshot.missingChecks).toEqual(ctxRes.body.missingChecks);
    expect(entry.snapshot.fau).toEqual(ctxRes.body.fau);

    const rows = await entriesOf(fresh);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: entry.id, workspaceId: BCDX, recordedById: userId("ana") });
    expect(rows[0]?.snapshot).toEqual(entry.snapshot);
    const [idea] = await t.db.select().from(schema.ideas).where(eq(schema.ideas.id, fresh));
    expect(idea?.latestDecision).toBe("proceed");
    expect(Date.now() - (idea?.lastActivityAt.getTime() ?? 0)).toBeLessThan(60_000);
    const [ws] = await t.db.select().from(schema.workspaces).where(eq(schema.workspaces.id, BCDX));
    expect(Date.now() - (ws?.lastActiveAt?.getTime() ?? 0)).toBeLessThan(60_000);

    const history = await t.db
      .select()
      .from(schema.changeHistory)
      .where(eq(schema.changeHistory.containerId, fresh));
    expect(history.filter((h) => h.targetId === entry.id)).toHaveLength(0);

    const notices = await t.db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.decisionLogEntryId, entry.id));
    expect(notices.map((n) => n.userId).sort()).toEqual(
      [userId("kenji"), userId("paolo"), userId("grace")].sort(),
    );
    for (const n of notices) {
      expect(n).toMatchObject({
        kind: "decision",
        workspaceId: BCDX,
        actorId: userId("ana"),
        readAt: null,
        link: { screen: 13, workspaceId: BCDX, ideaId: fresh },
      });
    }

    const context = await call(t.app, "GET", ctxPath(fresh), { as: kenji });
    expect(context.body.lastDecision.id).toBe(entry.id);
  });

  test("a stale basedOnDecisionId is DECISION_CHANGED with the newest entry; confirmNewer records", async () => {
    const [newest] = await entriesOf(fresh);
    const stale = await call(t.app, "POST", postPath(fresh), {
      as: kenji,
      body: { value: "hold", reason: "Need more evidence.", basedOnDecisionId: null },
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("DECISION_CHANGED");
    expect(stale.body.error.latest).toMatchObject({
      id: newest?.id,
      kind: "validation_decision",
      value: "proceed",
      recordedBy: { id: userId("ana") },
    });
    expect(await entriesOf(fresh)).toHaveLength(1);

    const wrongId = await call(t.app, "POST", postPath(fresh), {
      as: kenji,
      body: { value: "hold", reason: "x", basedOnDecisionId: crypto.randomUUID() },
    });
    expect(wrongId.body.error.code).toBe("DECISION_CHANGED");

    const confirmed = await call(t.app, "POST", postPath(fresh), {
      as: kenji,
      body: {
        value: "hold",
        reason: "Need more evidence.",
        basedOnDecisionId: null,
        confirmNewer: true,
      },
    });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.canCreatePlan).toBe(false);
    expect(await entriesOf(fresh)).toHaveLength(2);
  });

  test("basedOn the newest entry records without confirmation; entries are append-only", async () => {
    const context = await call(t.app, "GET", ctxPath(fresh), { as: ana });
    const based = context.body.lastDecision.id;
    const res = await call(t.app, "POST", postPath(fresh), {
      as: ana,
      body: { value: "drop", reason: "Not for us.", basedOnDecisionId: based },
    });
    expect(res.status).toBe(201);
    expect(res.body.canCreatePlan).toBe(false);
    const rows = await entriesOf(fresh);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.value).sort()).toEqual(["drop", "hold", "proceed"]);
    const [idea] = await t.db.select().from(schema.ideas).where(eq(schema.ideas.id, fresh));
    expect(idea?.latestDecision).toBe("drop");
    const earlier = rows.find((r) => r.id === based);
    expect(earlier?.value).toBe("hold");
    expect(earlier?.reason).toBe("Need more evidence.");
  });

  test("Drop leaves plans alone", async () => {
    const plansBefore = await t.db.select().from(schema.businessPlans);
    const ctxRes = await call(t.app, "GET", ctxPath(piaya), { as: ana });
    const res = await call(t.app, "POST", postPath(piaya), {
      as: ana,
      body: {
        value: "drop",
        reason: "Changed our mind.",
        basedOnDecisionId: ctxRes.body.lastDecision.id,
      },
    });
    expect(res.status).toBe(201);
    expect(await t.db.select().from(schema.businessPlans)).toHaveLength(plansBefore.length);
    const [idea] = await t.db.select().from(schema.ideas).where(eq(schema.ideas.id, piaya));
    expect(idea?.latestDecision).toBe("drop");
  });

  test("a suspended member and the recorder get no notification", async () => {
    await t.db
      .update(schema.users)
      .set({ status: "suspended" })
      .where(eq(schema.users.id, userId("paolo")));
    const ctxRes = await call(t.app, "GET", ctxPath(health), { as: ana });
    const res = await call(t.app, "POST", postPath(health), {
      as: ana,
      body: {
        value: "hold",
        reason: "Still waiting.",
        basedOnDecisionId: ctxRes.body.lastDecision.id,
      },
    });
    await t.db
      .update(schema.users)
      .set({ status: "active" })
      .where(eq(schema.users.id, userId("paolo")));
    expect(res.status).toBe(201);
    const notices = await t.db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.decisionLogEntryId, res.body.entry.id));
    expect(notices.map((n) => n.userId).sort()).toEqual([userId("kenji"), userId("grace")].sort());
  });

  test("only members of this workspace are notified, not people of other workspaces", async () => {
    const stray = await t.db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.workspaceId, personalWorkspaceId("admin")));
    expect(stray.filter((n) => n.kind === "decision")).toHaveLength(0);
  });

  test("Viewer 403, non-member 403, Admin 403, unknown idea 404, no login 401", async () => {
    const body = { value: "hold", reason: "x", basedOnDecisionId: null, confirmNewer: true };
    const before = (await t.db.select().from(schema.decisionLogEntries)).length;
    const viewer = await call(t.app, "POST", postPath(health), { as: grace, body });
    expect(viewer.status).toBe(403);
    expect(viewer.body.error.code).toBe("FORBIDDEN");
    const outsider = await call(t.app, "POST", postPath(health), { as: admin, body });
    expect(outsider.body.error.code).toBe("NO_ACCESS");
    expect(
      (await call(t.app, "POST", postPath(crypto.randomUUID()), { as: ana, body })).status,
    ).toBe(404);
    expect((await call(t.app, "POST", postPath(health), { body })).status).toBe(401);
    expect((await t.db.select().from(schema.decisionLogEntries)).length).toBe(before);
  });

  test("an archived idea is 409 ARCHIVED, and a Viewer still gets 403", async () => {
    await t.db
      .update(schema.ideas)
      .set({ archivedAt: new Date() })
      .where(eq(schema.ideas.id, health));
    const body = { value: "hold", reason: "x", basedOnDecisionId: null, confirmNewer: true };
    const owner = await call(t.app, "POST", postPath(health), { as: ana, body });
    const viewer = await call(t.app, "POST", postPath(health), { as: grace, body });
    await t.db.update(schema.ideas).set({ archivedAt: null }).where(eq(schema.ideas.id, health));
    expect(owner.status).toBe(409);
    expect(owner.body.error.code).toBe("ARCHIVED");
    expect(viewer.status).toBe(403);
  });

  test("invalid bodies are 422 VALIDATION_FAILED and record nothing", async () => {
    const before = (await t.db.select().from(schema.decisionLogEntries)).length;
    const bad = [
      { value: "proceed", reason: "", basedOnDecisionId: null },
      { value: "proceed", reason: "   ", basedOnDecisionId: null },
      { value: "proceed", reason: "x".repeat(5001), basedOnDecisionId: null },
      { value: "launch", reason: "x", basedOnDecisionId: null },
      { value: "proceed", reason: "x" },
      { value: "proceed", reason: "x", basedOnDecisionId: "not-a-uuid" },
    ];
    for (const body of bad) {
      const res = await call(t.app, "POST", postPath(health), { as: ana, body });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    }
    const limit = await call(t.app, "POST", postPath(health), {
      as: ana,
      body: {
        value: "hold",
        reason: "x".repeat(5000),
        basedOnDecisionId: null,
        confirmNewer: true,
      },
    });
    expect(limit.status).toBe(201);
    expect((await t.db.select().from(schema.decisionLogEntries)).length).toBe(before + 1);
  });

  test("two decisions at once: one wins, the other is DECISION_CHANGED", async () => {
    const ctxRes = await call(t.app, "GET", ctxPath(health), { as: ana });
    const based = ctxRes.body.lastDecision.id;
    const body = { value: "hold", reason: "Race.", basedOnDecisionId: based };
    const [a, b] = await Promise.all([
      call(t.app, "POST", postPath(health), { as: ana, body }),
      call(t.app, "POST", postPath(health), { as: kenji, body }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });
});
