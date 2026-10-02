import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { schema } from "@moonx/db";
import { BCDX, personalWorkspaceId, userId } from "@moonx/db/seed";
import { and, eq } from "drizzle-orm";
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

const home = "/api/v1/me/self-analysis";
const answerPath = (key: string) => `${home}/answers/${key}`;
const MISSING = "6f1f3f3a-1111-4111-8111-111111111111";

describe("S1 home", () => {
  test("a finished analysis shows its progress, shares and shareable workspaces", async () => {
    const res = await call(t.app, "GET", home, { as: who.ana });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "done",
      currency: "PHP",
      answered: 36,
      total: 36,
      firstUnanswered: null,
      template: { versionNumber: 1, newerVersion: null },
      shares: [{ workspace: { id: BCDX, name: "BCDX" } }],
      shareableWorkspaces: [{ id: BCDX, name: "BCDX" }],
    });
    expect(res.body.sections).toHaveLength(11);
    expect(
      res.body.sections.every((s: { answered: number; total: number }) => s.answered === s.total),
    ).toBe(true);
  });

  test("an unfinished analysis points at the first unanswered question", async () => {
    const res = await call(t.app, "GET", home, { as: who.kenji });
    expect(res.body).toMatchObject({ status: "in_progress", answered: 21, total: 36 });
    expect(res.body.firstUnanswered).toEqual({ sectionKey: "NOT", questionKey: "SA.NOT.1" });
    expect(res.body.shares).toEqual([]);
  });

  test("the first visit creates the analysis on the newest template", async () => {
    const before = await t.db
      .select()
      .from(schema.selfAnalyses)
      .where(eq(schema.selfAnalyses.userId, userId("admin")));
    expect(before).toHaveLength(0);
    const res = await call(t.app, "GET", home, { as: who.admin });
    expect(res.body).toMatchObject({ status: "not_started", answered: 0, total: 36 });
    const again = await call(t.app, "GET", home, { as: who.admin });
    expect(again.body.id).toBe(res.body.id);
  });

  test("PATCH changes the currency only", async () => {
    const res = await call(t.app, "PATCH", home, { as: who.paolo, body: { currency: "USD" } });
    expect(res.status).toBe(200);
    expect(res.body.currency).toBe("USD");
    const bad = await call(t.app, "PATCH", home, { as: who.paolo, body: { currency: "usd" } });
    expect(bad.status).toBe(422);
    const extra = await call(t.app, "PATCH", home, {
      as: who.paolo,
      body: { currency: "USD", status: "done" },
    });
    expect(extra.status).toBe(422);
  });

  test("requires a signed-in user", async () => {
    const res = await call(t.app, "GET", home);
    expect(res.status).toBe(401);
  });
});

describe("S2 section", () => {
  test("returns the section with answers, unanswered ones at version 0", async () => {
    const res = await call(t.app, "GET", `${home}/sections/NOW`, { as: who.kenji });
    expect(res.status).toBe(200);
    expect(res.body.section.key).toBe("NOW");
    expect(res.body.section.questions.map((q: { key: string }) => q.key)).toEqual([
      "SA.NOW.1",
      "SA.NOW.2",
      "SA.NOW.3",
      "SA.NOW.4",
      "SA.NOW.5",
    ]);
    expect(res.body.answers.every((a: { lockVersion: number }) => a.lockVersion === 0)).toBe(true);
  });

  test("an unknown section is 404", async () => {
    const res = await call(t.app, "GET", `${home}/sections/NOPE`, { as: who.kenji });
    expect(res.status).toBe(404);
  });

  test("comment counts per share workspace appear for the owner", async () => {
    const analysis = (await call(t.app, "GET", home, { as: who.ana })).body;
    const countOf = async () => {
      const res = await call(t.app, "GET", `${home}/sections/WHY`, { as: who.ana });
      return res.body.answers.find((a: { questionKey: string }) => a.questionKey === "SA.WHY.1")
        .commentCounts;
    };
    const seeded = (await countOf())[0].count;
    await t.db.insert(schema.comments).values({
      workspaceId: BCDX,
      targetType: "self_analysis_answer",
      targetId: analysis.id,
      targetKey: "SA.WHY.1",
      authorId: userId("kenji"),
      body: "Nice",
    });
    expect(await countOf()).toEqual([
      { workspaceId: BCDX, workspaceName: "BCDX", count: seeded + 1 },
    ]);
  });
});

describe("S3 answers", () => {
  test("the first answer starts the analysis, an update bumps the version and writes owner-only history", async () => {
    const first = await call(t.app, "PUT", answerPath("SA.WHY.1"), {
      as: who.grace,
      body: { text: "Because it matters", lockVersion: 0 },
    });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      questionKey: "SA.WHY.1",
      text: "Because it matters",
      lockVersion: 1,
    });
    expect((await call(t.app, "GET", home, { as: who.grace })).body.status).toBe("in_progress");

    const second = await call(t.app, "PUT", answerPath("SA.WHY.1"), {
      as: who.grace,
      body: { text: "Because it really matters", lockVersion: 1 },
    });
    expect(second.body.lockVersion).toBe(2);

    const rows = await t.db
      .select()
      .from(schema.changeHistory)
      .where(
        and(
          eq(schema.changeHistory.targetKey, "SA.WHY.1"),
          eq(schema.changeHistory.changedById, userId("grace")),
        ),
      );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({
        workspaceId: null,
        ownerUserId: userId("grace"),
        containerType: "self_analysis",
        targetType: "self_analysis_answer",
        source: "manual",
        sectionKey: "WHY",
      });
    }
  });

  test("an unchanged answer keeps its version and writes no history", async () => {
    const res = await call(t.app, "PUT", answerPath("SA.WHY.1"), {
      as: who.grace,
      body: { text: "Because it really matters", lockVersion: 2 },
    });
    expect(res.body.lockVersion).toBe(2);
    const rows = await t.db
      .select()
      .from(schema.changeHistory)
      .where(eq(schema.changeHistory.targetKey, "SA.WHY.1"));
    expect(rows.filter((r) => r.changedById === userId("grace"))).toHaveLength(2);
  });

  test("a stale version is a conflict that carries the current content; force overwrites", async () => {
    const stale = await call(t.app, "PUT", answerPath("SA.WHY.1"), {
      as: who.grace,
      body: { text: "Mine", lockVersion: 1 },
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("CONFLICT");
    expect(stale.body.error.current).toMatchObject({ lockVersion: 2 });
    expect(stale.body.error.current.value.text).toBe("Because it really matters");
    const forced = await call(t.app, "PUT", answerPath("SA.WHY.1"), {
      as: who.grace,
      body: { text: "Mine", lockVersion: 1, force: true },
    });
    expect(forced.status).toBe(200);
    expect(forced.body).toMatchObject({ text: "Mine", lockVersion: 3 });
  });

  test("amount questions take an amount and a reason; other questions refuse an amount", async () => {
    const ok = await call(t.app, "PUT", answerPath("SA.INCOME.1"), {
      as: who.grace,
      body: { amount: 45000, text: "Rent and food", lockVersion: 0 },
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ amount: 45000, text: "Rent and food" });
    const bad = await call(t.app, "PUT", answerPath("SA.WHY.2"), {
      as: who.grace,
      body: { amount: 10, lockVersion: 0 },
    });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe("VALIDATION_FAILED");
    const negative = await call(t.app, "PUT", answerPath("SA.INCOME.2"), {
      as: who.grace,
      body: { amount: -1, lockVersion: 0 },
    });
    expect(negative.status).toBe(422);
  });

  test("an unknown question is QUESTION_NOT_FOUND", async () => {
    const res = await call(t.app, "PUT", answerPath("SA.NOPE.1"), {
      as: who.grace,
      body: { text: "x", lockVersion: 0 },
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("QUESTION_NOT_FOUND");
  });

  test("nobody writes to someone else's analysis through /me", async () => {
    await call(t.app, "PUT", answerPath("SA.BE.1"), {
      as: who.kenji,
      body: { text: "kenji", lockVersion: 0 },
    });
    const anas = await call(t.app, "GET", `${home}/sections/BE`, { as: who.ana });
    const answer = anas.body.answers.find(
      (a: { questionKey: string }) => a.questionKey === "SA.BE.1",
    );
    expect(answer.text).not.toBe("kenji");
  });
});

describe("S4 complete and reopen", () => {
  test("empty questions need a confirmation, then the analysis is done; reopen keeps shares", async () => {
    const refused = await call(t.app, "POST", `${home}/complete`, { as: who.kenji });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("HAS_EMPTY_QUESTIONS");
    expect(refused.body.error.emptyCount).toBeGreaterThan(0);
    expect((await call(t.app, "GET", home, { as: who.kenji })).body.status).not.toBe("done");

    const done = await call(t.app, "POST", `${home}/complete`, {
      as: who.kenji,
      body: { confirmEmpty: true },
    });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe("done");
    expect(typeof done.body.completedAt).toBe("string");

    const reopened = await call(t.app, "POST", `${home}/reopen`, { as: who.paolo });
    expect(reopened.body.status).toBe("in_progress");
    expect(reopened.body.completedAt).toBeNull();
    expect(reopened.body.shares).toHaveLength(1);
  });
});

describe("S5 shares", () => {
  test("a share can only be added while done", async () => {
    const res = await call(t.app, "PUT", `${home}/shares`, {
      as: who.grace,
      body: { workspaceIds: [BCDX] },
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("MUST_BE_DONE_TO_SHARE");
  });

  test("Kenji, done now, shares with BCDX; the personal workspace and strangers are refused", async () => {
    const personal = await call(t.app, "PUT", `${home}/shares`, {
      as: who.kenji,
      body: { workspaceIds: [personalWorkspaceId("kenji")] },
    });
    expect(personal.status).toBe(422);
    expect(personal.body.error.code).toBe("NOT_SHAREABLE");
    const stranger = await call(t.app, "PUT", `${home}/shares`, {
      as: who.kenji,
      body: { workspaceIds: [MISSING] },
    });
    expect(stranger.body.error.code).toBe("NOT_SHAREABLE");
    const other = await call(t.app, "PUT", `${home}/shares`, {
      as: who.kenji,
      body: { workspaceIds: [personalWorkspaceId("ana")] },
    });
    expect(other.body.error.code).toBe("NOT_SHAREABLE");

    const ok = await call(t.app, "PUT", `${home}/shares`, {
      as: who.kenji,
      body: { workspaceIds: [BCDX, BCDX] },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.shares.map((s: { workspace: { id: string } }) => s.workspace.id)).toEqual([
      BCDX,
    ]);
  });

  test("a share can be dropped at any time, also after reopening", async () => {
    await call(t.app, "POST", `${home}/reopen`, { as: who.kenji });
    const kept = await call(t.app, "PUT", `${home}/shares`, {
      as: who.kenji,
      body: { workspaceIds: [BCDX] },
    });
    expect(kept.status).toBe(200);
    const dropped = await call(t.app, "PUT", `${home}/shares`, {
      as: who.kenji,
      body: { workspaceIds: [] },
    });
    expect(dropped.status).toBe(200);
    expect(dropped.body.shares).toEqual([]);
  });
});

describe("S6 / S7 members' analyses", () => {
  test("S6 lists Owners and Members and whether theirs is shared", async () => {
    const res = await call(t.app, "GET", `/api/v1/workspaces/${BCDX}/self-analyses`, {
      as: who.paolo,
    });
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(
      res.body.items.map((i: { user: { displayName: string }; shared: boolean }) => [
        i.user.displayName,
        i.shared,
      ]),
    );
    expect(byName).toMatchObject({
      "Ana Villanueva": true,
      "Paolo Gonzaga": true,
      "Kenji Mori": false,
    });
    expect(byName["Grace Tan"]).toBeUndefined();
  });

  test("S7 reads a shared analysis as sections with answers and comment counts", async () => {
    const res = await call(
      t.app,
      "GET",
      `/api/v1/workspaces/${BCDX}/self-analyses/${userId("ana")}`,
      { as: who.paolo },
    );
    expect(res.status).toBe(200);
    expect(res.body.user.displayName).toBe("Ana Villanueva");
    expect(res.body.status).toBe("done");
    expect(res.body.sections).toHaveLength(11);
    const why = res.body.sections.find((s: { key: string }) => s.key === "WHY");
    expect(
      why.answers.find((a: { questionKey: string }) => a.questionKey === "SA.WHY.1"),
    ).toMatchObject({ commentCount: 2 });
    const income = res.body.sections.find((s: { key: string }) => s.key === "INCOME");
    expect(income.answers[0].amount).toBe(80000);
  });

  test("S7 refuses one that is not shared here, and Viewers entirely", async () => {
    const notShared = await call(
      t.app,
      "GET",
      `/api/v1/workspaces/${BCDX}/self-analyses/${userId("grace")}`,
      { as: who.paolo },
    );
    expect(notShared.status).toBe(403);
    expect(notShared.body.error.code).toBe("NOT_SHARED");
    const viewer = await call(
      t.app,
      "GET",
      `/api/v1/workspaces/${BCDX}/self-analyses/${userId("ana")}`,
      { as: who.grace },
    );
    expect(viewer.status).toBe(403);
    expect(viewer.body.error.code).toBe("FORBIDDEN");
    const viewerList = await call(t.app, "GET", `/api/v1/workspaces/${BCDX}/self-analyses`, {
      as: who.grace,
    });
    expect(viewerList.body.error.code).toBe("FORBIDDEN");
  });

  test("a stranger to the workspace gets NO_ACCESS", async () => {
    const res = await call(t.app, "GET", `/api/v1/workspaces/${BCDX}/self-analyses`, {
      as: who.admin,
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NO_ACCESS");
  });
});
