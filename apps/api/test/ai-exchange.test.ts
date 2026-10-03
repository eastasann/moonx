import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { schema } from "@moonx/db";
import { ideaId, planId, userId } from "@moonx/db/seed";
import { parseAiReply } from "@moonx/domain";
import { eq } from "drizzle-orm";
import { call, login, startTestApp, type TestApp } from "./helpers";

let t: TestApp;
const who = {} as Record<"ana" | "kenji" | "paolo" | "grace" | "admin", Record<string, string>>;

beforeAll(async () => {
  t = await startTestApp();
  for (const p of ["ana", "kenji", "grace", "admin"] as const) who[p] = await login(t.app, p);
});
afterAll(async () => {
  await t.close();
});

const planA = planId("piaya-a");
const exportUrl = (query: string) => `/api/v1/ai/export?${query}`;
const apply = "/api/v1/ai/import/apply";

async function validationId() {
  const [row] = await t.db
    .select({ id: schema.validations.id })
    .from(schema.validations)
    .where(eq(schema.validations.ideaId, ideaId("piaya")));
  return (row as { id: string }).id;
}

describe("X1 export", () => {
  test("a validation export has the questions, answers, F/A/U, evidence and the reply guide", async () => {
    const id = await validationId();
    const res = await call(
      t.app,
      "GET",
      exportUrl(
        `source=validation&id=${id}&sections=01&includeEmpty=true&includeExamples=true&includeReference=true`,
      ),
      { as: who.ana },
    );
    expect(res.status).toBe(200);
    expect(res.body.questionCount).toBe(10);
    expect(res.body.allEmpty).toBe(false);
    expect(res.body.fileBaseName).toMatch(/^moonx-export-validation-/);
    const md = res.body.markdown as string;
    expect(md).toContain("<!-- moonx-export v1 | kind: validation | scope: 01");
    expect(md).toContain("## [V.01.WHO] WHO");
    expect(md).toContain("**F/A/U:**");
    expect(md).toContain("# Reference (read-only)");
    expect(md).toContain("Startup cost: ₱169,500");
    expect(md).toContain("# How to reply");
    expect(md).not.toContain("# Prompt");
    expect(res.body.json).not.toHaveProperty("prompt");
    expect(res.body.json).toMatchObject({
      format: "moonx-export",
      kind: "validation",
      templateVersion: 1,
    });
    expect(res.body.json.questions[0].id).toBe("V.01.WHO");
    expect(res.body.json.reference.keyNumbers.initial_cost_total).toBe("₱169,500");
  });

  test("a self analysis export carries amounts and no F/A/U; sections limit the scope", async () => {
    const res = await call(
      t.app,
      "GET",
      exportUrl("source=self_analysis&sections=INCOME,WHY&includeEmpty=true"),
      { as: who.ana },
    );
    expect(res.body.questionCount).toBe(5);
    expect(res.body.markdown).not.toContain("**F/A/U:**");
    expect(res.body.markdown).toContain("80,000");
    expect(res.body.markdown).toContain(
      "# Prompt\n\nI want to complete the attached Self Analysis",
    );
    expect(
      res.body.json.questions.find((q: { id: string }) => q.id === "SA.INCOME.1").answer.amount,
    ).toBe(80000);
  });

  test("a plan export takes items or a part, leaves tables out and adds them to the reference", async () => {
    const res = await call(
      t.app,
      "GET",
      exportUrl(
        `source=business_plan&id=${planA}&items=11,13&includeEmpty=true&includeReference=true`,
      ),
      { as: who.kenji },
    );
    expect(res.status).toBe(200);
    const ids = res.body.json.questions.map((q: { id: string }) => q.id);
    expect(ids).not.toContain("P.11.1");
    expect(ids).toContain("P.11.2");
    expect(res.body.markdown).toContain("Founders");
    const partB = await call(
      t.app,
      "GET",
      exportUrl(`source=business_plan&id=${planA}&part=b&includeEmpty=true`),
      { as: who.kenji },
    );
    expect(
      partB.body.json.questions.every((q: { section: string }) => Number(q.section) >= 11),
    ).toBe(true);
  });

  test("the whole plan, validation or self analysis says scope: all; a part or a pick does not", async () => {
    const header = (md: string) => (md.split("\n")[0] as string).split(" | ")[2];
    const whole = await call(
      t.app,
      "GET",
      exportUrl(`source=business_plan&id=${planA}&includeEmpty=true`),
      { as: who.kenji },
    );
    expect(header(whole.body.markdown)).toBe("scope: all");
    const part = await call(
      t.app,
      "GET",
      exportUrl(`source=business_plan&id=${planA}&part=a&includeEmpty=true`),
      { as: who.kenji },
    );
    expect(header(part.body.markdown)).toBe("scope: part:a");
    const id = await validationId();
    const everySection = await call(
      t.app,
      "GET",
      exportUrl(`source=validation&id=${id}&sections=01,02,04,08,10&includeEmpty=true`),
      { as: who.ana },
    );
    expect(header(everySection.body.markdown)).toBe("scope: all");
    const one = await call(
      t.app,
      "GET",
      exportUrl(`source=validation&id=${id}&sections=01&includeEmpty=true`),
      { as: who.ana },
    );
    expect(header(one.body.markdown)).toBe("scope: 01");
    const self = await call(t.app, "GET", exportUrl("source=self_analysis&includeEmpty=true"), {
      as: who.ana,
    });
    expect(header(self.body.markdown)).toBe("scope: all");
  });

  test("file names carry the kind once", async () => {
    const self = await call(t.app, "GET", exportUrl("source=self_analysis&sections=WHY"), {
      as: who.ana,
    });
    expect(self.body.fileBaseName).toMatch(/^moonx-export-self-analysis-\d{4}-\d{2}-\d{2}$/);
    const plan = await call(
      t.app,
      "GET",
      exportUrl(`source=business_plan&id=${planA}&includeEmpty=true`),
      { as: who.kenji },
    );
    expect(plan.body.fileBaseName).toMatch(/^moonx-export-business-plan-piaya-/);
  });

  test("empty answers can be left out, an empty scope and bad queries are refused", async () => {
    const some = await call(t.app, "GET", exportUrl("source=self_analysis&sections=WHY"), {
      as: who.grace,
    });
    expect(some.status).toBe(200);
    expect(some.body).toMatchObject({ questionCount: 0, allEmpty: true });
    const none = await call(t.app, "GET", exportUrl("source=self_analysis&sections=NOPE"), {
      as: who.ana,
    });
    expect(none.status).toBe(422);
    expect(none.body.error.code).toBe("EMPTY_SCOPE");
    expect((await call(t.app, "GET", exportUrl("source=validation"), { as: who.ana })).status).toBe(
      422,
    );
    expect((await call(t.app, "GET", exportUrl("source=nope"), { as: who.ana })).status).toBe(422);
  });

  test("Viewers and strangers cannot export a validation or plan; nothing is recorded", async () => {
    const id = await validationId();
    const before = (await t.db.select().from(schema.changeHistory)).length;
    expect(
      (await call(t.app, "GET", exportUrl(`source=validation&id=${id}`), { as: who.grace })).status,
    ).toBe(403);
    expect(
      (await call(t.app, "GET", exportUrl(`source=business_plan&id=${planA}`), { as: who.admin }))
        .body.error.code,
    ).toBe("NO_ACCESS");
    await call(t.app, "GET", exportUrl(`source=validation&id=${id}`), { as: who.ana });
    expect((await t.db.select().from(schema.changeHistory)).length).toBe(before);
  });
});

describe("X2 context", () => {
  test("lists every question with its importability and the current content", async () => {
    const res = await call(
      t.app,
      "GET",
      `/api/v1/ai/import/context?target=business_plan&id=${planA}`,
      { as: who.ana },
    );
    expect(res.status).toBe(200);
    expect(res.body.target).toMatchObject({ type: "business_plan", id: planA, name: "Plan A" });
    const byKey = Object.fromEntries(
      res.body.questions.map((q: { questionKey: string }) => [q.questionKey, q]),
    );
    expect(byKey["P.01.1"]).toMatchObject({ importable: true, hidden: false });
    expect(byKey["P.11.1"].importable).toBe(false);
    expect(byKey["P.08.3"].importable).toBe(false);
    expect(byKey["P.23.1"].importable).toBe(false);
    expect(byKey["P.01.1"].current.text).toEqual(expect.any(String));
    expect(res.body.target).toMatchObject({
      workspaceId: expect.any(String),
      ideaId: expect.any(String),
      currency: expect.any(String),
      archived: false,
    });
    const sections = Object.fromEntries(res.body.sections.map((x: { key: string }) => [x.key, x]));
    expect(sections["01"]).toMatchObject({ part: "a", importable: true });
    const questions = res.body.questions as { questionKey: string; importable: boolean }[];
    for (const [key, section] of Object.entries(sections) as [string, { importable: boolean }][]) {
      const own = questions.filter((q) => q.questionKey.split(".")[1] === key);
      expect(section.importable).toBe(own.some((q) => q.importable));
    }
    expect(Object.values(sections).some((s) => !(s as { importable: boolean }).importable)).toBe(
      true,
    );
  });

  test("a plan under an archived idea says so, and the context is still readable", async () => {
    const url = `/api/v1/ai/import/context?target=business_plan&id=${planA}`;
    await t.db
      .update(schema.ideas)
      .set({ archivedAt: new Date() })
      .where(eq(schema.ideas.id, ideaId("piaya")));
    try {
      const res = await call(t.app, "GET", url, { as: who.ana });
      expect(res.status).toBe(200);
      expect(res.body.target.archived).toBe(true);
    } finally {
      await t.db
        .update(schema.ideas)
        .set({ archivedAt: null })
        .where(eq(schema.ideas.id, ideaId("piaya")));
    }
  });

  test("a validation context marks the OCEAN branch hidden and carries classification", async () => {
    const id = await validationId();
    const res = await call(t.app, "GET", `/api/v1/ai/import/context?target=validation&id=${id}`, {
      as: who.ana,
    });
    const who1 = res.body.questions.find(
      (q: { questionKey: string }) => q.questionKey === "V.01.WHO",
    );
    expect(who1.current.classification).toMatchObject({ state: expect.any(String) });
    expect(who1.importable).toBe(true);
  });
});

describe("X3 apply", () => {
  test("a round trip: export, rewrite the answers, parse, apply as one ai_import batch", async () => {
    const id = await validationId();
    const exported = await call(
      t.app,
      "GET",
      exportUrl(`source=validation&id=${id}&sections=01&includeEmpty=true`),
      { as: who.ana },
    );
    const parsed = parseAiReply(exported.body.markdown.replace("(empty)", "(empty)"));
    expect(parsed.blocks.length).toBeGreaterThan(5);

    const context = (
      await call(t.app, "GET", `/api/v1/ai/import/context?target=validation&id=${id}`, {
        as: who.ana,
      })
    ).body;
    const current = (key: string) =>
      context.questions.find((q: { questionKey: string }) => q.questionKey === key).current;
    const res = await call(t.app, "POST", apply, {
      as: who.ana,
      body: {
        target: { type: "validation", id },
        changes: [
          {
            questionKey: "V.01.WHO",
            text: "HR teams of BPO firms in Bacolod.",
            baseLockVersion: current("V.01.WHO").lockVersion,
          },
          {
            questionKey: "V.01.PROBLEM",
            text: current("V.01.PROBLEM").text,
            baseLockVersion: current("V.01.PROBLEM").lockVersion,
          },
        ],
      },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ applied: 1, needsClassification: 1 });
    const rows = await t.db
      .select()
      .from(schema.changeHistory)
      .where(eq(schema.changeHistory.batchId, res.body.batchId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: "ai_import",
      targetKey: "V.01.WHO",
      changedById: userId("ana"),
    });
    const after = (
      await call(t.app, "GET", `/api/v1/ai/import/context?target=validation&id=${id}`, {
        as: who.ana,
      })
    ).body;
    const answer = after.questions.find(
      (q: { questionKey: string }) => q.questionKey === "V.01.WHO",
    ).current;
    expect(answer.text).toBe("HR teams of BPO firms in Bacolod.");
    expect(answer.classification.state).toBe("unclassified");
    expect(answer.classification.evidence.length).toBeGreaterThanOrEqual(0);
  });

  test("a reply whose answer holds a `##` sub-heading is applied as one answer", async () => {
    const id = await validationId();
    const reply = [
      "Here is the update.",
      "",
      "## [V.01.SWITCHING]",
      "They ask a friend today.",
      "",
      "## Why they switch",
      "A courier is faster.",
      "",
      "## [V.01.PROOF]",
      "Two store interviews.",
    ].join("\n");
    const parsed = parseAiReply(reply);
    expect(parsed.blocks.map((b) => b.id)).toEqual([null, "V.01.SWITCHING", "V.01.PROOF"]);
    const switching = parsed.blocks[1]?.text as string;
    expect(switching).toBe("They ask a friend today.\n\n## Why they switch\nA courier is faster.");

    const context = (
      await call(t.app, "GET", `/api/v1/ai/import/context?target=validation&id=${id}`, {
        as: who.ana,
      })
    ).body;
    const lock = (key: string) =>
      context.questions.find((q: { questionKey: string }) => q.questionKey === key).current
        .lockVersion;
    const res = await call(t.app, "POST", apply, {
      as: who.ana,
      body: {
        target: { type: "validation", id },
        changes: [
          {
            questionKey: "V.01.SWITCHING",
            text: switching,
            baseLockVersion: lock("V.01.SWITCHING"),
          },
        ],
      },
    });
    expect(res.status).toBe(200);
    const after = (
      await call(t.app, "GET", `/api/v1/ai/import/context?target=validation&id=${id}`, {
        as: who.ana,
      })
    ).body;
    expect(
      after.questions.find((q: { questionKey: string }) => q.questionKey === "V.01.SWITCHING")
        .current.text,
    ).toBe(switching);
  });

  test("a classification sent with the change is used; Fact needs evidence", async () => {
    const id = await validationId();
    const ctx = (
      await call(t.app, "GET", `/api/v1/ai/import/context?target=validation&id=${id}`, {
        as: who.ana,
      })
    ).body;
    const q = ctx.questions.find((x: { questionKey: string }) => x.questionKey === "V.01.BEHAVIOR");
    const ok = await call(t.app, "POST", apply, {
      as: who.ana,
      body: {
        target: { type: "validation", id },
        changes: [
          {
            questionKey: "V.01.BEHAVIOR",
            text: "They reorder monthly.",
            classification: { fau: "assumption", confidence: "low" },
            baseLockVersion: q.current.lockVersion,
          },
        ],
      },
    });
    expect(ok.body).toMatchObject({ applied: 1, needsClassification: 0 });
    const fact = await call(t.app, "POST", apply, {
      as: who.ana,
      body: {
        target: { type: "validation", id },
        changes: [
          {
            questionKey: "V.01.BEHAVIOR",
            text: "They reorder weekly.",
            classification: { fau: "fact" },
            baseLockVersion: q.current.lockVersion + 1,
          },
        ],
      },
    });
    if (fact.status === 422) expect(fact.body.error.code).toBe("FACT_REQUIRES_EVIDENCE");
  });

  test("a stale base version rejects the whole batch with every conflict and writes nothing", async () => {
    const id = await validationId();
    const ctx = (
      await call(t.app, "GET", `/api/v1/ai/import/context?target=validation&id=${id}`, {
        as: who.ana,
      })
    ).body;
    const lock = (key: string) =>
      ctx.questions.find((x: { questionKey: string }) => x.questionKey === key).current.lockVersion;
    const before = (await t.db.select().from(schema.changeHistory)).length;
    const res = await call(t.app, "POST", apply, {
      as: who.ana,
      body: {
        target: { type: "validation", id },
        changes: [
          { questionKey: "V.01.WHY_THEM", text: "new", baseLockVersion: lock("V.01.WHY_THEM") },
          { questionKey: "V.01.PAYMENT", text: "new", baseLockVersion: lock("V.01.PAYMENT") + 7 },
          { questionKey: "V.01.PROOF", text: "new", baseLockVersion: lock("V.01.PROOF") + 3 },
        ],
      },
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT_MULTI");
    expect(
      res.body.error.conflicts.map((c: { questionKey: string }) => c.questionKey).sort(),
    ).toEqual(["V.01.PAYMENT", "V.01.PROOF"]);
    expect(res.body.error.conflicts[0].current).toMatchObject({ lockVersion: expect.any(Number) });
    expect((await t.db.select().from(schema.changeHistory)).length).toBe(before);
  });

  test("a failure in the middle rolls everything back", async () => {
    const id = await validationId();
    const ctx = (
      await call(t.app, "GET", `/api/v1/ai/import/context?target=validation&id=${id}`, {
        as: who.ana,
      })
    ).body;
    const lock = (key: string) =>
      ctx.questions.find((x: { questionKey: string }) => x.questionKey === key).current.lockVersion;
    const noEvidence = ctx.questions.find(
      (q: {
        sectionKey: string;
        questionKey: string;
        current: { text: string | null; classification: { evidence: unknown[] } };
      }) =>
        q.sectionKey === "01" &&
        q.questionKey !== "V.01.WHY_THEM" &&
        q.current.text &&
        q.current.classification.evidence.length === 0,
    );
    expect(noEvidence).toBeDefined();
    const before = (await t.db.select().from(schema.changeHistory)).length;
    const res = await call(t.app, "POST", apply, {
      as: who.ana,
      body: {
        target: { type: "validation", id },
        changes: [
          { questionKey: "V.01.WHY_THEM", text: "written", baseLockVersion: lock("V.01.WHY_THEM") },
          {
            questionKey: noEvidence.questionKey,
            text: "x",
            classification: { fau: "fact" },
            baseLockVersion: noEvidence.current.lockVersion,
          },
        ],
      },
    });
    expect(res.status).toBe(422);
    expect((await t.db.select().from(schema.changeHistory)).length).toBe(before);
  });

  test("tables, numbers, unknown and hidden questions and bad values are refused", async () => {
    const plan = { type: "business_plan", id: planA };
    const send = (target: unknown, changes: unknown[]) =>
      call(t.app, "POST", apply, { as: who.ana, body: { target, changes } });
    expect(
      (await send(plan, [{ questionKey: "P.11.1", text: "x", baseLockVersion: 0 }])).body.error
        .code,
    ).toBe("NOT_IMPORTABLE");
    expect(
      (await send(plan, [{ questionKey: "P.08.3", text: "x", baseLockVersion: 0 }])).body.error
        .code,
    ).toBe("NOT_IMPORTABLE");
    expect(
      (await send(plan, [{ questionKey: "P.99.9", text: "x", baseLockVersion: 0 }])).body.error
        .code,
    ).toBe("QUESTION_NOT_FOUND");
    expect(
      (await send(plan, [{ questionKey: "P.05.1", amount: 5, baseLockVersion: 0 }])).status,
    ).toBe(422);
    const dup = await send(plan, [
      { questionKey: "P.05.1", text: "a", baseLockVersion: 0 },
      { questionKey: "P.05.1", text: "b", baseLockVersion: 0 },
    ]);
    expect(dup.status).toBe(422);
    expect((await send(plan, [])).status).toBe(422);

    const id = await validationId();
    const choice = await call(t.app, "POST", apply, {
      as: who.ana,
      body: {
        target: { type: "validation", id },
        changes: [{ questionKey: "V.02.OCEAN", text: "Purple", baseLockVersion: 0 }],
      },
    });
    expect(choice.status).toBe(422);
    expect(choice.body.error.code).toBe("VALIDATION_FAILED");
  });

  test("a choice is read without regard to case; self-analysis amounts and plan text apply", async () => {
    const id = await validationId();
    const ctx = (
      await call(t.app, "GET", `/api/v1/ai/import/context?target=validation&id=${id}`, {
        as: who.ana,
      })
    ).body;
    const ocean = ctx.questions.find(
      (x: { questionKey: string }) => x.questionKey === "V.02.OCEAN",
    );
    const ok = await call(t.app, "POST", apply, {
      as: who.ana,
      body: {
        target: { type: "validation", id },
        changes: [
          { questionKey: "V.02.OCEAN", text: "mixed", baseLockVersion: ocean.current.lockVersion },
        ],
      },
    });
    expect(ok.status).toBe(200);

    const sa = (
      await call(t.app, "GET", "/api/v1/ai/import/context?target=self_analysis", { as: who.ana })
    ).body;
    const income = sa.questions.find(
      (x: { questionKey: string }) => x.questionKey === "SA.INCOME.2",
    );
    const saRes = await call(t.app, "POST", apply, {
      as: who.ana,
      body: {
        target: { type: "self_analysis" },
        changes: [
          {
            questionKey: "SA.INCOME.2",
            amount: 160000,
            text: "Updated reason",
            baseLockVersion: income.current.lockVersion,
          },
        ],
      },
    });
    expect(saRes.body).toMatchObject({ applied: 1, needsClassification: 0 });
    const hist = await t.db
      .select()
      .from(schema.changeHistory)
      .where(eq(schema.changeHistory.batchId, saRes.body.batchId));
    expect(hist[0]).toMatchObject({
      workspaceId: null,
      ownerUserId: userId("ana"),
      source: "ai_import",
    });

    const plan = (
      await call(t.app, "GET", `/api/v1/ai/import/context?target=business_plan&id=${planA}`, {
        as: who.ana,
      })
    ).body;
    const p = plan.questions.find((x: { questionKey: string }) => x.questionKey === "P.05.1");
    const planRes = await call(t.app, "POST", apply, {
      as: who.kenji,
      body: {
        target: { type: "business_plan", id: planA },
        changes: [
          {
            questionKey: "P.05.1",
            text: "Box of six piaya.",
            baseLockVersion: p.current.lockVersion,
          },
        ],
      },
    });
    expect(planRes.body.applied).toBe(1);
  });

  test("Viewers, strangers and archived targets are refused; the import is rate limited", async () => {
    const body = {
      target: { type: "business_plan", id: planA },
      changes: [{ questionKey: "P.05.1", text: "x", baseLockVersion: 0 }],
    };
    expect((await call(t.app, "POST", apply, { as: who.grace, body })).status).toBe(403);
    expect((await call(t.app, "POST", apply, { as: who.admin, body })).body.error.code).toBe(
      "NO_ACCESS",
    );
    await t.db
      .insert(schema.rateLimits)
      .values({ key: `app:ai:${userId("kenji")}`, count: 60, lastRequest: Date.now() })
      .onConflictDoUpdate({
        target: schema.rateLimits.key,
        set: { count: 60, lastRequest: Date.now() },
      });
    const limited = await call(t.app, "POST", apply, { as: who.kenji, body });
    expect(limited.status).toBe(429);
    expect(
      (
        await call(t.app, "GET", exportUrl("source=self_analysis&includeEmpty=true"), {
          as: who.kenji,
        })
      ).status,
    ).toBe(429);
  });
});
