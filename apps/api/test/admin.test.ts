import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { schema } from "@moonx/db";
import { BCDX, seedDemo, userId } from "@moonx/db/seed";
import { and, count, eq, isNull } from "drizzle-orm";
import { RATE_LIMITS } from "../src/lib/rate-limit";
import { LAST_ACTIVE_WRITE_INTERVAL_MS } from "../src/lib/session";
import { call, login, startTestApp, type TestApp } from "./helpers";

let t: TestApp;
let as: Record<"admin" | "ana" | "kenji" | "paolo" | "grace", Record<string, string>>;

beforeAll(async () => {
  t = await startTestApp();
  as = {
    admin: await login(t.app, "admin"),
    ana: await login(t.app, "ana"),
    kenji: await login(t.app, "kenji"),
    paolo: await login(t.app, "paolo"),
    grace: await login(t.app, "grace"),
  };
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await seedDemo(t.db);
  t.mailbox.sent.length = 0;
});

const api = "/api/v1/admin";
const MISSING = "00000000-0000-4000-8000-000000000001";

type Kind = "self_analysis" | "validation" | "business_plan";

async function versionId(kind: Kind, versionNumber: number): Promise<string> {
  const [row] = await t.db
    .select({ id: schema.templateVersions.id })
    .from(schema.templateVersions)
    .innerJoin(schema.templates, eq(schema.templates.id, schema.templateVersions.templateId))
    .where(
      and(
        eq(schema.templates.kind, kind),
        eq(schema.templateVersions.versionNumber, versionNumber),
      ),
    );
  return (row as { id: string }).id;
}

/** A draft of `kind` copied from its v1 (the validation draft v3 is already there). */
async function draftOf(kind: Kind): Promise<string> {
  const res = await call(
    t.app,
    "POST",
    `${api}/template-versions/${await versionId(kind, 1)}/draft`,
    {
      as: as.admin,
    },
  );
  expect(res.status).toBe(201);
  return res.body.id;
}

const detail = (id: string) =>
  call(t.app, "GET", `${api}/template-versions/${id}`, { as: as.admin });

interface Endpoint {
  name: string;
  method: string;
  path: string;
  body?: unknown;
}

const endpoints: Endpoint[] = [
  { name: "AD1", method: "GET", path: `${api}/templates` },
  { name: "AD2", method: "POST", path: `${api}/template-versions/${MISSING}/draft` },
  { name: "AD3 GET", method: "GET", path: `${api}/template-versions/${MISSING}` },
  {
    name: "AD3 PATCH",
    method: "PATCH",
    path: `${api}/template-versions/${MISSING}`,
    body: { aiPrompt: "x" },
  },
  {
    name: "AD4 section POST",
    method: "POST",
    path: `${api}/template-versions/${MISSING}/sections`,
    body: { key: "X", title: "x" },
  },
  {
    name: "AD4 section PATCH",
    method: "PATCH",
    path: `${api}/template-sections/${MISSING}`,
    body: { title: "x" },
  },
  { name: "AD4 section DELETE", method: "DELETE", path: `${api}/template-sections/${MISSING}` },
  {
    name: "AD4 question POST",
    method: "POST",
    path: `${api}/template-sections/${MISSING}/questions`,
    body: { key: "SA.X.1", title: "x", prompt: "x", answerType: "long_text" },
  },
  {
    name: "AD4 question PATCH",
    method: "PATCH",
    path: `${api}/template-questions/${MISSING}`,
    body: { title: "x" },
  },
  { name: "AD4 question DELETE", method: "DELETE", path: `${api}/template-questions/${MISSING}` },
  {
    name: "AD5 order",
    method: "PUT",
    path: `${api}/template-versions/${MISSING}/order`,
    body: { sections: [] },
  },
  {
    name: "AD5 cost-defaults",
    method: "PUT",
    path: `${api}/template-versions/${MISSING}/cost-defaults`,
    body: { items: [] },
  },
  {
    name: "AD5 check-rules",
    method: "PUT",
    path: `${api}/template-versions/${MISSING}/check-rules`,
    body: { items: [] },
  },
  {
    name: "AD5 execution-presets",
    method: "PUT",
    path: `${api}/template-versions/${MISSING}/execution-presets`,
    body: { items: [] },
  },
  { name: "AD6 validate", method: "POST", path: `${api}/template-versions/${MISSING}/validate` },
  { name: "AD6 publish", method: "POST", path: `${api}/template-versions/${MISSING}/publish` },
  { name: "AD7 users", method: "GET", path: `${api}/users` },
  { name: "AD7 workspaces", method: "GET", path: `${api}/workspaces` },
  { name: "AD7 invitations", method: "GET", path: `${api}/invitations` },
  { name: "AD8 suspend", method: "POST", path: `${api}/users/${MISSING}/suspend` },
  { name: "AD8 reactivate", method: "POST", path: `${api}/users/${MISSING}/reactivate` },
  {
    name: "AD9",
    method: "POST",
    path: `${api}/invitations`,
    body: { email: "someone@example.com" },
  },
];

describe("SDD 7.1 operator matrix (AD1-AD9)", () => {
  test("anonymous callers get 401", async () => {
    for (const e of endpoints) {
      const res = await call(t.app, e.method, e.path, { body: e.body });
      expect([e.name, res.status, res.body.error.code]).toEqual([e.name, 401, "UNAUTHENTICATED"]);
    }
  });

  test("Owner, Member and Viewer get 403 FORBIDDEN, before the body or the id is looked at", async () => {
    for (const e of endpoints) {
      for (const who of ["ana", "kenji", "grace"] as const) {
        const res = await call(t.app, e.method, e.path, { as: as[who], body: e.body });
        expect([e.name, who, res.status, res.body.error.code]).toEqual([
          e.name,
          who,
          403,
          "FORBIDDEN",
        ]);
      }
    }
    const invalid = await call(t.app, "POST", `${api}/invitations`, {
      as: as.kenji,
      body: { email: "not-an-email" },
    });
    expect(invalid.status).toBe(403);
  });

  test("an operator passes the guard (404 for the made-up ids, not 403)", async () => {
    for (const e of endpoints) {
      const res = await call(t.app, e.method, e.path, { as: as.admin, body: e.body });
      expect([e.name, res.status === 403 || res.status === 401]).toEqual([e.name, false]);
    }
  });

  test("a suspended operator is refused like anyone suspended", async () => {
    await t.db
      .update(schema.users)
      .set({ status: "suspended" })
      .where(eq(schema.users.id, userId("admin")));
    expect((await call(t.app, "GET", `${api}/templates`, { as: as.admin })).status).toBe(401);
  });
});

describe("AD1 GET /admin/templates", () => {
  test("lists the three templates with versions, newest first, and how many records use each", async () => {
    const res = await call(t.app, "GET", `${api}/templates`, { as: as.admin });
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { kind: string }) => i.kind)).toEqual([
      "self_analysis",
      "validation",
      "business_plan",
    ]);
    const validation = res.body.items[1];
    expect(validation.versions.map((v: { versionNumber: number }) => v.versionNumber)).toEqual([
      3, 2, 1,
    ]);
    expect(validation.versions[0]).toMatchObject({
      status: "draft",
      publishedAt: null,
      publishedBy: null,
      usageCount: 0,
    });
    expect(validation.versions[2].publishedBy).toMatchObject({ displayName: "Moonx Admin" });
    const pinned = async (table: typeof schema.validations, kind: Kind) => {
      const rows = await t.db
        .select({ id: table.templateVersionId, n: count() })
        .from(table)
        .groupBy(table.templateVersionId);
      return { kind, rows };
    };
    const v = await pinned(schema.validations, "validation");
    for (const row of v.rows) {
      const shown = validation.versions.find((x: { id: string }) => x.id === row.id);
      expect(shown.usageCount).toBe(row.n);
    }
    const self = res.body.items[0].versions[0];
    const [selfCount] = await t.db.select({ n: count() }).from(schema.selfAnalyses);
    expect(self.usageCount).toBe(selfCount?.n as number);
    const [planCount] = await t.db.select({ n: count() }).from(schema.businessPlans);
    expect(res.body.items[2].versions[0].usageCount).toBe(planCount?.n as number);
  });
});

describe("AD2 POST /admin/template-versions/{id}/draft", () => {
  test("copies sections, questions, cost defaults, check rules, presets and the AI prompt", async () => {
    const source = await versionId("business_plan", 1);
    const before = (await detail(source)).body;
    const res = await call(t.app, "POST", `${api}/template-versions/${source}/draft`, {
      as: as.admin,
    });
    expect(res.status).toBe(201);
    const copy = (await detail(res.body.id)).body;
    expect(copy).toMatchObject({ kind: "business_plan", versionNumber: 2, status: "draft" });
    const strip = (d: typeof before) => ({
      aiPrompt: d.aiPrompt,
      sections: d.sections.map(
        (s: {
          key: string;
          part: string;
          title: string;
          guidance: string;
          questions: unknown[];
        }) => ({
          key: s.key,
          part: s.part,
          title: s.title,
          guidance: s.guidance,
          questions: s.questions.map((q) => {
            const { id: _id, ...rest } = q as { id: string };
            return rest;
          }),
        }),
      ),
      costDefaults: d.costDefaults.map(({ id: _id, ...rest }: { id: string }) => rest),
      checkRules: d.checkRules,
      executionPresets: d.executionPresets.map(({ id: _id, ...rest }: { id: string }) => rest),
    });
    expect(strip(copy)).toEqual(strip(before));
    expect(copy.sections[0].id).not.toBe(before.sections[0].id);
    expect(copy.executionPresets.length).toBeGreaterThan(0);
    expect(copy.sections[0].questions[0].copyFrom).toEqual(
      before.sections[0].questions[0].copyFrom,
    );
  });

  test("copies validation cost defaults and check rules", async () => {
    const source = await versionId("validation", 2);
    const before = (await detail(source)).body;
    await t.db
      .delete(schema.templateVersions)
      .where(eq(schema.templateVersions.id, await versionId("validation", 3)));
    const res = await call(t.app, "POST", `${api}/template-versions/${source}/draft`, {
      as: as.admin,
    });
    expect(res.status).toBe(201);
    const copy = (await detail(res.body.id)).body;
    expect(copy.versionNumber).toBe(3);
    expect(copy.costDefaults.map((r: { key: string }) => r.key)).toEqual(
      before.costDefaults.map((r: { key: string }) => r.key),
    );
    expect(copy.checkRules).toEqual(before.checkRules);
    expect(copy.checkRules.length).toBe(6);
  });

  test("409 DRAFT_EXISTS when the template already has a draft (from any version)", async () => {
    for (const n of [1, 2, 3]) {
      const res = await call(
        t.app,
        "POST",
        `${api}/template-versions/${await versionId("validation", n)}/draft`,
        { as: as.admin },
      );
      expect([n, res.status, res.body.error.code]).toEqual([n, 409, "DRAFT_EXISTS"]);
    }
    await draftOf("self_analysis");
    const again = await call(
      t.app,
      "POST",
      `${api}/template-versions/${await versionId("self_analysis", 1)}/draft`,
      { as: as.admin },
    );
    expect(again.body.error.code).toBe("DRAFT_EXISTS");
  });

  test("two requests at once make one draft with the next number", async () => {
    const source = await versionId("self_analysis", 1);
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        call(t.app, "POST", `${api}/template-versions/${source}/draft`, { as: as.admin }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    const rows = await t.db
      .select({ n: schema.templateVersions.versionNumber })
      .from(schema.templateVersions)
      .where(eq(schema.templateVersions.id, results.find((r) => r.status === 201)?.body.id));
    expect(rows[0]?.n).toBe(2);
  });

  test("404 for an unknown version", async () => {
    const res = await call(t.app, "POST", `${api}/template-versions/${MISSING}/draft`, {
      as: as.admin,
    });
    expect(res.status).toBe(404);
  });
});

describe("AD3 GET / PATCH /admin/template-versions/{id}", () => {
  test("GET returns the whole version in order, with ids and sort orders", async () => {
    const res = await detail(await versionId("validation", 3));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ kind: "validation", versionNumber: 3, status: "draft" });
    expect(res.body.sections.map((s: { sortOrder: number }) => s.sortOrder)).toEqual([
      0, 1, 2, 3, 4,
    ]);
    const question = res.body.sections[0].questions[0];
    expect(question).toMatchObject({
      key: "V.01.WHO",
      sectionKey: "01",
      sortOrder: 0,
      copyFrom: null,
      reference: null,
    });
    expect(question.id).toEqual(expect.any(String));
    expect(res.body.costDefaults).toHaveLength(24);
    expect(res.body.checkRules[0]).toEqual({
      checkKey: expect.any(String),
      params: expect.any(Object),
    });
  });

  test("PATCH changes the AI prompt of a draft", async () => {
    const id = await versionId("validation", 3);
    const res = await call(t.app, "PATCH", `${api}/template-versions/${id}`, {
      as: as.admin,
      body: { aiPrompt: "Be brief." },
    });
    expect(res.status).toBe(200);
    expect(res.body.aiPrompt).toBe("Be brief.");
    expect((await detail(id)).body.aiPrompt).toBe("Be brief.");
  });

  test("PATCH refuses a published version and a prompt over 20,000 characters", async () => {
    const published = await call(
      t.app,
      "PATCH",
      `${api}/template-versions/${await versionId("validation", 2)}`,
      { as: as.admin, body: { aiPrompt: "x" } },
    );
    expect([published.status, published.body.error.code]).toEqual([409, "PUBLISHED_READ_ONLY"]);
    const long = await call(
      t.app,
      "PATCH",
      `${api}/template-versions/${await versionId("validation", 3)}`,
      { as: as.admin, body: { aiPrompt: "x".repeat(20_001) } },
    );
    expect(long.status).toBe(422);
  });

  test("404 for an unknown version", async () => {
    expect((await detail(MISSING)).status).toBe(404);
    expect((await detail("not-a-uuid")).status).toBe(422);
  });
});

describe("AD4 sections and questions", () => {
  const newQuestion = {
    key: "SA.EXTRA.1",
    title: "Extra",
    prompt: "What else?",
    answerType: "long_text",
  };

  test("create, patch and delete a section and a question in a draft", async () => {
    const id = await draftOf("self_analysis");
    const section = await call(t.app, "POST", `${api}/template-versions/${id}/sections`, {
      as: as.admin,
      body: { key: "EXTRA", title: "Extra", guidance: "More" },
    });
    expect(section.status).toBe(201);
    expect(section.body).toMatchObject({
      key: "EXTRA",
      part: null,
      guidance: "More",
      sortOrder: 11,
    });

    const question = await call(
      t.app,
      "POST",
      `${api}/template-sections/${section.body.id}/questions`,
      { as: as.admin, body: { ...newQuestion, hasFau: true, example: "e" } },
    );
    expect(question.status).toBe(201);
    expect(question.body).toMatchObject({
      key: "SA.EXTRA.1",
      sectionKey: "EXTRA",
      hasFau: true,
      example: "e",
      hint: null,
      options: null,
      sortOrder: 0,
    });

    const patched = await call(t.app, "PATCH", `${api}/template-questions/${question.body.id}`, {
      as: as.admin,
      body: { title: "Renamed", hint: "Think", example: null, key: "SA.EXTRA.2" },
    });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({
      title: "Renamed",
      hint: "Think",
      example: null,
      key: "SA.EXTRA.2",
    });
    const noChange = await call(t.app, "PATCH", `${api}/template-questions/${question.body.id}`, {
      as: as.admin,
      body: {},
    });
    expect(noChange.body.title).toBe("Renamed");

    const sectionPatched = await call(
      t.app,
      "PATCH",
      `${api}/template-sections/${section.body.id}`,
      {
        as: as.admin,
        body: { title: "Extra 2", guidance: null },
      },
    );
    expect(sectionPatched.body).toMatchObject({ title: "Extra 2", guidance: null, key: "EXTRA" });

    expect(
      (
        await call(t.app, "DELETE", `${api}/template-questions/${question.body.id}`, {
          as: as.admin,
        })
      ).status,
    ).toBe(204);
    expect(
      (await call(t.app, "DELETE", `${api}/template-sections/${section.body.id}`, { as: as.admin }))
        .status,
    ).toBe(204);
    const after = (await detail(id)).body;
    expect(after.sections.find((s: { key: string }) => s.key === "EXTRA")).toBeUndefined();
    expect(
      (await call(t.app, "DELETE", `${api}/template-sections/${section.body.id}`, { as: as.admin }))
        .status,
    ).toBe(404);
  });

  test("deleting a section deletes its questions", async () => {
    const id = await draftOf("self_analysis");
    const before = (await detail(id)).body;
    const target = before.sections[0];
    await call(t.app, "DELETE", `${api}/template-sections/${target.id}`, { as: as.admin });
    const rows = await t.db
      .select({ id: schema.templateQuestions.id })
      .from(schema.templateQuestions)
      .where(eq(schema.templateQuestions.templateSectionId, target.id));
    expect(rows).toHaveLength(0);
  });

  test("422 INVALID_QUESTION_KEY for a key that is not a question ID of the template", async () => {
    const id = await draftOf("self_analysis");
    const section = (await detail(id)).body.sections[0];
    for (const key of [
      "EXTRA",
      "SA.EXTRA",
      "sa.WHY.9",
      "SA.WHY.x",
      "SA.WHY.1.2",
      "V.WHY.9",
      "P.01.1",
      " SA.WHY.9",
      "SA.WHY.",
    ]) {
      const res = await call(t.app, "POST", `${api}/template-sections/${section.id}/questions`, {
        as: as.admin,
        body: { ...newQuestion, key },
      });
      expect([key, res.status, res.body.error.code]).toEqual([key, 422, "INVALID_QUESTION_KEY"]);
    }
    const patch = await call(
      t.app,
      "PATCH",
      `${api}/template-questions/${section.questions[0].id}`,
      {
        as: as.admin,
        body: { key: "WHY" },
      },
    );
    expect([patch.status, patch.body.error.code]).toEqual([422, "INVALID_QUESTION_KEY"]);
    const plan = await draftOf("business_plan");
    const planSection = (await detail(plan)).body.sections[0];
    const wrongKind = await call(
      t.app,
      "POST",
      `${api}/template-sections/${planSection.id}/questions`,
      {
        as: as.admin,
        body: { ...newQuestion, key: "SA.01.9" },
      },
    );
    expect(wrongKind.body.error.code).toBe("INVALID_QUESTION_KEY");
    const ok = await call(t.app, "POST", `${api}/template-sections/${planSection.id}/questions`, {
      as: as.admin,
      body: { ...newQuestion, key: "P.01.9" },
    });
    expect(ok.status).toBe(201);
  });

  test("a repeated key is a 422 VALIDATION_FAILED, for sections and questions", async () => {
    const id = await draftOf("self_analysis");
    const sections = (await detail(id)).body.sections;
    const dupSection = await call(t.app, "POST", `${api}/template-versions/${id}/sections`, {
      as: as.admin,
      body: { key: sections[0].key, title: "Again" },
    });
    expect([dupSection.status, dupSection.body.error.code]).toEqual([422, "VALIDATION_FAILED"]);
    const dupQuestion = await call(
      t.app,
      "POST",
      `${api}/template-sections/${sections[1].id}/questions`,
      { as: as.admin, body: { ...newQuestion, key: sections[0].questions[0].key } },
    );
    expect([dupQuestion.status, dupQuestion.body.error.code]).toEqual([422, "VALIDATION_FAILED"]);
    const rename = await call(t.app, "PATCH", `${api}/template-sections/${sections[1].id}`, {
      as: as.admin,
      body: { key: sections[0].key },
    });
    expect(rename.status).toBe(422);
  });

  test("422 for a malformed body", async () => {
    const id = await draftOf("self_analysis");
    const bad = [
      { key: "lower", title: "x" },
      { key: "OK", title: "" },
      { key: "OK", title: "x", part: "c" },
    ];
    for (const body of bad) {
      const res = await call(t.app, "POST", `${api}/template-versions/${id}/sections`, {
        as: as.admin,
        body,
      });
      expect([JSON.stringify(body), res.status]).toEqual([JSON.stringify(body), 422]);
    }
    const section = (await detail(id)).body.sections[0];
    const question = await call(t.app, "POST", `${api}/template-sections/${section.id}/questions`, {
      as: as.admin,
      body: { ...newQuestion, key: "SA.WHY.9", answerType: "essay" },
    });
    expect(question.status).toBe(422);
  });

  test("a published version cannot be changed through any of its nodes", async () => {
    const published = await versionId("validation", 2);
    const section = (await detail(published)).body.sections[0];
    const question = section.questions[0];
    const calls: [string, string, unknown?][] = [
      ["POST", `${api}/template-versions/${published}/sections`, { key: "NEW", title: "x" }],
      ["PATCH", `${api}/template-sections/${section.id}`, { title: "x" }],
      ["DELETE", `${api}/template-sections/${section.id}`],
      [
        "POST",
        `${api}/template-sections/${section.id}/questions`,
        { ...newQuestion, key: "V.01.NEW" },
      ],
      ["PATCH", `${api}/template-questions/${question.id}`, { title: "x" }],
      ["DELETE", `${api}/template-questions/${question.id}`],
      ["PUT", `${api}/template-versions/${published}/order`, { sections: [] }],
      ["PUT", `${api}/template-versions/${published}/cost-defaults`, { items: [] }],
      ["PUT", `${api}/template-versions/${published}/check-rules`, { items: [] }],
      ["PUT", `${api}/template-versions/${published}/execution-presets`, { items: [] }],
      ["POST", `${api}/template-versions/${published}/publish`],
    ];
    for (const [method, path, body] of calls) {
      const res = await call(t.app, method, path, { as: as.admin, body });
      expect([method, path, res.status, res.body?.error?.code]).toEqual([
        method,
        path,
        409,
        "PUBLISHED_READ_ONLY",
      ]);
    }
    const after = (await detail(published)).body;
    expect(after.sections[0].questions).toHaveLength(section.questions.length);
    expect(after.costDefaults).toHaveLength(24);
  });
});

describe("AD5 replace-whole-list endpoints", () => {
  test("order moves sections and questions, also across sections", async () => {
    const id = await draftOf("self_analysis");
    const sections = (await detail(id)).body.sections as {
      id: string;
      questions: { id: string; key: string }[];
    }[];
    const [first, second] = sections as [(typeof sections)[0], (typeof sections)[0]];
    const moved = first.questions[0] as { id: string };
    const body = {
      sections: [
        { id: second.id, questionIds: [moved.id, ...second.questions.map((q) => q.id)] },
        { id: first.id, questionIds: first.questions.slice(1).map((q) => q.id) },
        ...sections.slice(2).map((s) => ({ id: s.id, questionIds: s.questions.map((q) => q.id) })),
      ],
    };
    const res = await call(t.app, "PUT", `${api}/template-versions/${id}/order`, {
      as: as.admin,
      body,
    });
    expect(res.status).toBe(200);
    expect(res.body.sections[0].id).toBe(second.id);
    expect(res.body.sections[0].questions[0].id).toBe(moved.id);
    expect(res.body.sections[0].questions[0].sectionKey).toBe(
      second.questions[0]?.key.split(".")[1],
    );
    expect(res.body.sections.map((s: { sortOrder: number }) => s.sortOrder)).toEqual(
      sections.map((_, i) => i),
    );
    expect(res.body.sections[1].questions.map((q: { sortOrder: number }) => q.sortOrder)).toEqual(
      first.questions.slice(1).map((_, i) => i),
    );
  });

  test("order must list every section and question once", async () => {
    const id = await draftOf("self_analysis");
    const sections = (await detail(id)).body.sections as {
      id: string;
      questions: { id: string }[];
    }[];
    const full = sections.map((s) => ({ id: s.id, questionIds: s.questions.map((q) => q.id) }));
    const missingSection = full.slice(1);
    const missingQuestion = full.map((s, i) =>
      i === 0 ? { ...s, questionIds: s.questionIds.slice(1) } : s,
    );
    const duplicated = full.map((s, i) =>
      i === 0 ? { ...s, questionIds: [...s.questionIds, s.questionIds[0] as string] } : s,
    );
    const foreign = full.map((s, i) =>
      i === 0 ? { ...s, questionIds: [...s.questionIds.slice(1), MISSING] } : s,
    );
    for (const body of [
      { sections: missingSection },
      { sections: missingQuestion },
      { sections: duplicated },
      { sections: foreign },
    ]) {
      const res = await call(t.app, "PUT", `${api}/template-versions/${id}/order`, {
        as: as.admin,
        body,
      });
      expect([res.status, res.body.error.code]).toEqual([422, "VALIDATION_FAILED"]);
    }
  });

  test("cost-defaults replaces the whole list in the given order", async () => {
    const id = await versionId("validation", 3);
    const items = [
      { category: "variable", key: "variable.box", name: "Box" },
      { category: "initial", key: "initial.signage", name: "Signage" },
    ];
    const res = await call(t.app, "PUT", `${api}/template-versions/${id}/cost-defaults`, {
      as: as.admin,
      body: { items },
    });
    expect(res.status).toBe(200);
    expect(
      res.body.costDefaults.map((r: { key: string; sortOrder: number }) => [r.key, r.sortOrder]),
    ).toEqual([
      ["variable.box", 0],
      ["initial.signage", 1],
    ]);
    const dup = await call(t.app, "PUT", `${api}/template-versions/${id}/cost-defaults`, {
      as: as.admin,
      body: { items: [items[0], items[0]] },
    });
    expect(dup.status).toBe(422);
    const bad = await call(t.app, "PUT", `${api}/template-versions/${id}/cost-defaults`, {
      as: as.admin,
      body: { items: [{ category: "other", key: "A b", name: "x" }] },
    });
    expect(bad.status).toBe(422);
    expect((await detail(id)).body.costDefaults).toHaveLength(2);
  });

  test("check-rules replaces the list; one rule per check", async () => {
    const id = await versionId("validation", 3);
    const res = await call(t.app, "PUT", `${api}/template-versions/${id}/check-rules`, {
      as: as.admin,
      body: { items: [{ checkKey: "competitors", params: { min: 4, max: 6 } }] },
    });
    expect(res.status).toBe(200);
    expect(res.body.checkRules).toEqual([{ checkKey: "competitors", params: { min: 4, max: 6 } }]);
    const dup = await call(t.app, "PUT", `${api}/template-versions/${id}/check-rules`, {
      as: as.admin,
      body: {
        items: [
          { checkKey: "competitors", params: {} },
          { checkKey: "competitors", params: {} },
        ],
      },
    });
    expect(dup.status).toBe(422);
    const notNumber = await call(t.app, "PUT", `${api}/template-versions/${id}/check-rules`, {
      as: as.admin,
      body: { items: [{ checkKey: "costs", params: { min: "3" } }] },
    });
    expect(notNumber.status).toBe(422);
  });

  test("execution-presets replaces the list; area is for KPI rows and timing for launch rows", async () => {
    const id = await draftOf("business_plan");
    const res = await call(t.app, "PUT", `${api}/template-versions/${id}/execution-presets`, {
      as: as.admin,
      body: {
        items: [
          { type: "milestone", title: "Decide" },
          { type: "launch", title: "Day one", launchTiming: "launch_day" },
          { type: "kpi", title: "Revenue", area: "Financial" },
        ],
      },
    });
    expect(res.status).toBe(200);
    expect(
      res.body.executionPresets.map(
        (r: {
          type: string;
          area: string | null;
          launchTiming: string | null;
          sortOrder: number;
        }) => [r.type, r.area, r.launchTiming, r.sortOrder],
      ),
    ).toEqual([
      ["milestone", null, null, 0],
      ["launch", null, "launch_day", 1],
      ["kpi", "Financial", null, 2],
    ]);
    for (const item of [
      { type: "milestone", title: "x", area: "Financial" },
      { type: "kpi", title: "x", launchTiming: "launch_day" },
    ]) {
      const bad = await call(t.app, "PUT", `${api}/template-versions/${id}/execution-presets`, {
        as: as.admin,
        body: { items: [item] },
      });
      expect([bad.status, bad.body.error.code]).toEqual([422, "VALIDATION_FAILED"]);
    }
    expect((await detail(id)).body.executionPresets).toHaveLength(3);
  });
});

describe("AD6 validate and publish", () => {
  test("a fresh copy is valid and has nothing removed", async () => {
    for (const kind of ["self_analysis", "business_plan"] as const) {
      const id = await draftOf(kind);
      const res = await call(t.app, "POST", `${api}/template-versions/${id}/validate`, {
        as: as.admin,
      });
      expect([kind, res.status, res.body]).toEqual([kind, 200, { errors: [], warnings: [] }]);
    }
    const seeded = await call(
      t.app,
      "POST",
      `${api}/template-versions/${await versionId("validation", 3)}/validate`,
      { as: as.admin },
    );
    expect(seeded.body).toEqual({ errors: [], warnings: [] });
  });

  test("warns with the IDs that the previous version had and this one lacks", async () => {
    const id = await draftOf("self_analysis");
    const sections = (await detail(id)).body.sections as {
      questions: { id: string; key: string }[];
    }[];
    const gone = [sections[0]?.questions[0], sections[3]?.questions[1]] as {
      id: string;
      key: string;
    }[];
    for (const q of gone) {
      await call(t.app, "DELETE", `${api}/template-questions/${q.id}`, { as: as.admin });
    }
    const res = await call(t.app, "POST", `${api}/template-versions/${id}/validate`, {
      as: as.admin,
    });
    expect(res.status).toBe(200);
    expect(res.body.errors).toEqual([]);
    expect(res.body.warnings).toEqual([
      { code: "removed_keys", keys: gone.map((q) => q.key).sort() },
    ]);
  });

  test("reports ill-formed IDs, IDs in the wrong section, options that do not fit and dangling conditions", async () => {
    const id = await draftOf("self_analysis");
    const sections = (await detail(id)).body.sections as {
      id: string;
      questions: { id: string; key: string }[];
    }[];
    const [first, second] = sections as [(typeof sections)[0], (typeof sections)[0]];
    const illFormed = first.questions[0] as { id: string };
    await t.db
      .update(schema.templateQuestions)
      .set({ questionKey: "why-1" })
      .where(eq(schema.templateQuestions.id, illFormed.id));
    const wrongSection = second.questions[0] as { id: string };
    await call(t.app, "PATCH", `${api}/template-questions/${wrongSection.id}`, {
      as: as.admin,
      body: { key: "SA.WHY.7" },
    });
    const noOptions = second.questions[1] as { id: string };
    await call(t.app, "PATCH", `${api}/template-questions/${noOptions.id}`, {
      as: as.admin,
      body: { answerType: "choice" },
    });
    const dangling = first.questions[1] as { id: string };
    await call(t.app, "PATCH", `${api}/template-questions/${dangling.id}`, {
      as: as.admin,
      body: { displayCondition: { "SA.NOPE.1": ["x"] } },
    });
    const res = await call(t.app, "POST", `${api}/template-versions/${id}/validate`, {
      as: as.admin,
    });
    const byNode = Object.fromEntries(
      res.body.errors.map((e: { nodeId: string; code: string }) => [e.nodeId, e.code]),
    );
    expect(byNode[illFormed.id]).toBe("invalid_question_key");
    expect(byNode[wrongSection.id]).toBe("question_key_section_mismatch");
    expect(byNode[noOptions.id]).toBe("options_mismatch");
    expect(byNode[dangling.id]).toBe("unknown_condition_key");
    expect(res.body.errors).toHaveLength(4);
    expect(res.body.errors[0].message).toEqual(expect.any(String));
  });

  test("reports an empty template and a part where it does not belong", async () => {
    const id = await draftOf("self_analysis");
    await call(t.app, "POST", `${api}/template-versions/${id}/sections`, {
      as: as.admin,
      body: { key: "PARTED", title: "x", part: "a" },
    });
    const sections = (await detail(id)).body.sections as { id: string; key: string }[];
    for (const s of sections.filter((x) => x.key !== "PARTED")) {
      await call(t.app, "DELETE", `${api}/template-sections/${s.id}`, { as: as.admin });
    }
    const res = await call(t.app, "POST", `${api}/template-versions/${id}/validate`, {
      as: as.admin,
    });
    expect(res.body.errors.map((e: { code: string }) => e.code).sort()).toEqual([
      "invalid_part",
      "no_questions",
    ]);
  });

  test("publish refuses a template with errors (422 TEMPLATE_INVALID with the errors)", async () => {
    const id = await draftOf("self_analysis");
    const section = (await detail(id)).body.sections[0];
    await call(t.app, "PATCH", `${api}/template-questions/${section.questions[0].id}`, {
      as: as.admin,
      body: { key: "SA.OTHER.1" },
    });
    const res = await call(t.app, "POST", `${api}/template-versions/${id}/publish`, {
      as: as.admin,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("TEMPLATE_INVALID");
    expect(res.body.error.errors).toEqual([
      expect.objectContaining({
        code: "question_key_section_mismatch",
        nodeId: section.questions[0].id,
      }),
    ]);
    expect((await detail(id)).body.status).toBe("draft");
  });

  test("publish sets the status, time and publisher; answers and pinned versions stay", async () => {
    const id = await draftOf("self_analysis");
    const v1 = await versionId("self_analysis", 1);
    const answersBefore = await t.db.select().from(schema.selfAnalysisAnswers);
    const pinnedBefore = await t.db
      .select({ id: schema.selfAnalyses.id, v: schema.selfAnalyses.templateVersionId })
      .from(schema.selfAnalyses);
    const before = new Date();
    const res = await call(t.app, "POST", `${api}/template-versions/${id}/publish`, {
      as: as.admin,
    });
    expect(res.status).toBe(200);
    expect(res.body.versionNumber).toBe(2);
    expect(new Date(res.body.publishedAt).getTime()).toBeGreaterThanOrEqual(
      before.getTime() - 1000,
    );
    const [row] = await t.db
      .select()
      .from(schema.templateVersions)
      .where(eq(schema.templateVersions.id, id));
    expect(row).toMatchObject({ status: "published", publishedById: userId("admin") });
    expect(row?.publishedAt?.toISOString()).toBe(res.body.publishedAt);

    expect(await t.db.select().from(schema.selfAnalysisAnswers)).toEqual(answersBefore);
    expect(
      await t.db
        .select({ id: schema.selfAnalyses.id, v: schema.selfAnalyses.templateVersionId })
        .from(schema.selfAnalyses),
    ).toEqual(pinnedBefore);
    expect(pinnedBefore.every((p) => p.v === v1)).toBe(true);

    const list = await call(t.app, "GET", `${api}/templates`, { as: as.admin });
    expect(list.body.items[0].versions[0]).toMatchObject({
      versionNumber: 2,
      status: "published",
      publishedBy: { displayName: "Moonx Admin" },
    });
    const again = await call(t.app, "POST", `${api}/template-versions/${id}/publish`, {
      as: as.admin,
    });
    expect(again.body.error.code).toBe("PUBLISHED_READ_ONLY");
    const next = await call(t.app, "POST", `${api}/template-versions/${id}/draft`, {
      as: as.admin,
    });
    expect(next.status).toBe(201);
    expect((await detail(next.body.id)).body.versionNumber).toBe(3);
  });

  test("validating a published version works (it only reads)", async () => {
    const res = await call(
      t.app,
      "POST",
      `${api}/template-versions/${await versionId("validation", 2)}/validate`,
      { as: as.admin },
    );
    expect(res.status).toBe(200);
    expect(res.body.errors).toEqual([]);
    expect(res.body.warnings).toEqual([]);
  });
});

describe("AD7 lists", () => {
  test("users: counts and dates only, newest registration first, deleted last", async () => {
    await t.db
      .update(schema.users)
      .set({ status: "deleted", displayName: "Deleted user", email: "deleted+x@deleted.invalid" })
      .where(eq(schema.users.id, userId("paolo")));
    const res = await call(t.app, "GET", `${api}/users`, { as: as.admin });
    expect(res.status).toBe(200);
    expect(res.body.nextCursor).toBeNull();
    expect(res.body.items).toHaveLength(5);
    const last = res.body.items.at(-1);
    expect(last).toMatchObject({
      id: userId("paolo"),
      displayName: "Deleted user",
      status: "deleted",
    });
    const admin = res.body.items.find((u: { id: string }) => u.id === userId("admin"));
    expect(admin).toMatchObject({
      email: "admin@moonx.example",
      isAdmin: true,
      status: "active",
      workspaceCount: 1,
    });
    const ana = res.body.items.find((u: { id: string }) => u.id === userId("ana"));
    expect(ana.workspaceCount).toBe(2);
    expect(Object.keys(ana).sort()).toEqual([
      "createdAt",
      "displayName",
      "email",
      "id",
      "isAdmin",
      "lastActiveAt",
      "status",
      "workspaceCount",
    ]);
    expect(ana.lastActiveAt).toEqual(expect.any(String));
  });

  test("users: q, status, limit and cursor", async () => {
    const byName = await call(t.app, "GET", `${api}/users?q=villa`, { as: as.admin });
    expect(byName.body.items.map((u: { id: string }) => u.id)).toEqual([userId("ana")]);
    const byMail = await call(t.app, "GET", `${api}/users?q=ADVISOR.example`, { as: as.admin });
    expect(byMail.body.items.map((u: { id: string }) => u.id)).toEqual([userId("grace")]);
    expect((await call(t.app, "GET", `${api}/users?q=%25`, { as: as.admin })).body.items).toEqual(
      [],
    );
    await t.db
      .update(schema.users)
      .set({ status: "suspended" })
      .where(eq(schema.users.id, userId("kenji")));
    const suspended = await call(t.app, "GET", `${api}/users?status=suspended`, { as: as.admin });
    expect(suspended.body.items.map((u: { id: string }) => u.id)).toEqual([userId("kenji")]);

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res: { body: { items: { id: string }[]; nextCursor: string | null } } = await call(
        t.app,
        "GET",
        `${api}/users?limit=2${cursor ? `&cursor=${cursor}` : ""}`,
        { as: as.admin },
      );
      seen.push(...res.body.items.map((u) => u.id));
      cursor = res.body.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(5);
    const bad = await call(t.app, "GET", `${api}/users?cursor=zzz`, { as: as.admin });
    expect([bad.status, bad.body.error.details[0].path]).toEqual([422, "cursor"]);
    expect((await call(t.app, "GET", `${api}/users?status=gone`, { as: as.admin })).status).toBe(
      422,
    );
  });

  test("workspaces: owners and counts, no content", async () => {
    const res = await call(t.app, "GET", `${api}/workspaces`, { as: as.admin });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(6);
    const bcdx = res.body.items.find((w: { id: string }) => w.id === BCDX);
    const [ideas] = await t.db
      .select({ n: count() })
      .from(schema.ideas)
      .where(eq(schema.ideas.workspaceId, BCDX));
    expect(bcdx).toMatchObject({
      name: "BCDX",
      isPersonal: false,
      memberCount: 4,
      ideaCount: ideas?.n,
      owners: [{ id: userId("ana"), displayName: "Ana Villanueva", badge: null }],
      lastActiveAt: expect.any(String),
    });
    expect(Object.keys(bcdx).sort()).toEqual([
      "id",
      "ideaCount",
      "isPersonal",
      "lastActiveAt",
      "memberCount",
      "name",
      "owners",
    ]);
    const personal = res.body.items.find(
      (w: { name: string }) => w.name === "Grace Tan's workspace",
    );
    expect(personal).toMatchObject({ isPersonal: true, memberCount: 1, ideaCount: 0 });
    const q = await call(t.app, "GET", `${api}/workspaces?q=bcd`, { as: as.admin });
    expect(q.body.items.map((w: { name: string }) => w.name)).toEqual(["BCDX"]);
    const page = await call(t.app, "GET", `${api}/workspaces?limit=4`, { as: as.admin });
    expect(page.body.items).toHaveLength(4);
    const rest = await call(
      t.app,
      "GET",
      `${api}/workspaces?limit=4&cursor=${page.body.nextCursor}`,
      {
        as: as.admin,
      },
    );
    expect(rest.body.items).toHaveLength(2);
    expect(rest.body.nextCursor).toBeNull();
  });

  test("invitations: reads like W4's, with status filters and pages", async () => {
    const all = await call(t.app, "GET", `${api}/invitations`, { as: as.admin });
    expect(all.status).toBe(200);
    expect(
      all.body.items.map((i: { email: string; status: string }) => [i.email, i.status]).sort(),
    ).toEqual([
      ["late.joiner@bcdx.example", "expired"],
      ["new.member@bcdx.example", "pending"],
    ]);
    expect(all.body.items[0]).toMatchObject({
      workspace: { id: BCDX, name: "BCDX" },
      invitedBy: expect.objectContaining({ displayName: expect.any(String) }),
    });
    const pending = await call(t.app, "GET", `${api}/invitations?status=pending`, { as: as.admin });
    expect(pending.body.items.map((i: { email: string }) => i.email)).toEqual([
      "new.member@bcdx.example",
    ]);
    const expired = await call(t.app, "GET", `${api}/invitations?status=expired`, { as: as.admin });
    expect(expired.body.items.map((i: { email: string }) => i.email)).toEqual([
      "late.joiner@bcdx.example",
    ]);
    expect(
      (await call(t.app, "GET", `${api}/invitations?status=revoked`, { as: as.admin })).body.items,
    ).toEqual([]);
    const first = await call(t.app, "GET", `${api}/invitations?limit=1`, { as: as.admin });
    expect(first.body.items).toHaveLength(1);
    const second = await call(
      t.app,
      "GET",
      `${api}/invitations?limit=1&cursor=${first.body.nextCursor}`,
      {
        as: as.admin,
      },
    );
    expect(second.body.items[0].id).not.toBe(first.body.items[0].id);
    expect(second.body.nextCursor).toBeNull();
  });
});

describe("AD8 suspend and reactivate", () => {
  async function addSessions(person: "kenji" | "ana", n: number) {
    for (let i = 0; i < n; i++) {
      await t.db.insert(schema.sessions).values({
        userId: userId(person),
        token: `${person}-token-${i}-${Math.random()}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      });
    }
  }
  const sessionsOf = async (person: "kenji" | "ana") =>
    (
      await t.db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, userId(person)))
    ).length;

  test("suspend ends every session, makes no notification and locks the user out", async () => {
    await addSessions("kenji", 3);
    await addSessions("ana", 1);
    const anaSessions = await sessionsOf("ana");
    const notificationsBefore = await t.db.select().from(schema.notifications);
    const res = await call(t.app, "POST", `${api}/users/${userId("kenji")}/suspend`, {
      as: as.admin,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: userId("kenji"), status: "suspended", workspaceCount: 2 });
    expect(await sessionsOf("kenji")).toBe(0);
    expect(await sessionsOf("ana")).toBe(anaSessions);
    expect(await t.db.select().from(schema.notifications)).toEqual(notificationsBefore);
    const asKenji = await call(t.app, "GET", `/api/v1/workspaces/${BCDX}`, { as: as.kenji });
    expect(asKenji.status).toBe(401);
    const members = await call(t.app, "GET", `/api/v1/workspaces/${BCDX}/members`, { as: as.ana });
    expect(
      members.body.items.find((m: { user: { id: string } }) => m.user.id === userId("kenji")),
    ).toMatchObject({ user: { badge: "suspended" }, role: "member" });
    const [membership] = await t.db
      .select()
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.userId, userId("kenji")),
          eq(schema.memberships.workspaceId, BCDX),
        ),
      );
    expect(membership).toBeDefined();
  });

  test("reactivate restores the user as they were", async () => {
    await call(t.app, "POST", `${api}/users/${userId("kenji")}/suspend`, { as: as.admin });
    const res = await call(t.app, "POST", `${api}/users/${userId("kenji")}/reactivate`, {
      as: as.admin,
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("active");
    // Suspending ended his sessions; reactivating lets him sign in again but does not bring them back.
    expect((await call(t.app, "GET", `/api/v1/workspaces/${BCDX}`, { as: as.kenji })).status).toBe(
      401,
    );
    as.kenji = await login(t.app, "kenji");
    expect((await call(t.app, "GET", `/api/v1/workspaces/${BCDX}`, { as: as.kenji })).status).toBe(
      200,
    );
  });

  test("repeating a request is a 200 with the current state; suspending again clears new sessions", async () => {
    await call(t.app, "POST", `${api}/users/${userId("kenji")}/suspend`, { as: as.admin });
    await addSessions("kenji", 1);
    const again = await call(t.app, "POST", `${api}/users/${userId("kenji")}/suspend`, {
      as: as.admin,
    });
    expect([again.status, again.body.status]).toEqual([200, "suspended"]);
    expect(await sessionsOf("kenji")).toBe(0);
    await call(t.app, "POST", `${api}/users/${userId("kenji")}/reactivate`, { as: as.admin });
    const twice = await call(t.app, "POST", `${api}/users/${userId("kenji")}/reactivate`, {
      as: as.admin,
    });
    expect([twice.status, twice.body.status]).toEqual([200, "active"]);
  });

  test("an operator cannot suspend themselves (422), and a missing or deleted user is refused", async () => {
    const self = await call(t.app, "POST", `${api}/users/${userId("admin")}/suspend`, {
      as: as.admin,
    });
    expect([self.status, self.body.error.code]).toEqual([422, "CANNOT_SUSPEND_SELF"]);
    expect(
      (await call(t.app, "GET", `${api}/users?q=moonx`, { as: as.admin })).body.items[0].status,
    ).toBe("active");
    const missing = await call(t.app, "POST", `${api}/users/${MISSING}/suspend`, { as: as.admin });
    expect(missing.status).toBe(404);
    await t.db
      .update(schema.users)
      .set({ status: "deleted" })
      .where(eq(schema.users.id, userId("grace")));
    for (const action of ["suspend", "reactivate"]) {
      const res = await call(t.app, "POST", `${api}/users/${userId("grace")}/${action}`, {
        as: as.admin,
      });
      expect([action, res.status, res.body.error.code]).toEqual([action, 422, "NOT_EDITABLE"]);
    }
    expect((await call(t.app, "POST", `${api}/users/nope/suspend`, { as: as.admin })).status).toBe(
      422,
    );
  });

  test("an operator can suspend another operator", async () => {
    await t.db
      .update(schema.users)
      .set({ isAdmin: true })
      .where(eq(schema.users.id, userId("ana")));
    const res = await call(t.app, "POST", `${api}/users/${userId("ana")}/suspend`, {
      as: as.admin,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isAdmin: true, status: "suspended" });
    // Suspending ended her sessions; the tests after this one need her signed in.
    await seedDemo(t.db);
    as.ana = await login(t.app, "ana");
  });
});

describe("AD9 POST /admin/invitations", () => {
  const post = (body: unknown, who = as.admin) =>
    call(t.app, "POST", `${api}/invitations`, { as: who, body });

  test("without a workspace it has no workspace and no role, and does not make an operator", async () => {
    const res = await post({ email: "New.Operator@Example.com" });
    expect(res.status).toBe(201);
    expect(res.body.invitation).toMatchObject({
      email: "New.Operator@Example.com",
      workspace: null,
      role: null,
      status: "pending",
      invitedBy: { id: userId("admin"), badge: null },
      acceptedAt: null,
    });
    expect(res.body.link).toMatch(/^http:\/\/localhost:5173\/invite\/[\w-]{43}$/);
    const [row] = await t.db
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.id, res.body.invitation.id));
    expect(row).toMatchObject({
      workspaceId: null,
      role: null,
      grantsAdmin: false,
      invitedById: userId("admin"),
    });
    expect(row?.tokenHash).not.toContain(res.body.link.split("/invite/")[1]);
    expect(t.mailbox.sent).toHaveLength(1);
    expect(t.mailbox.sent[0]?.to).toBe("New.Operator@Example.com");
    expect(t.mailbox.sent[0]?.text).toContain(res.body.link);
    const listed = await call(t.app, "GET", `${api}/invitations?status=pending`, { as: as.admin });
    expect(listed.body.items.some((i: { id: string }) => i.id === res.body.invitation.id)).toBe(
      true,
    );
  });

  test("with a workspace and a role, for a workspace the operator is not in", async () => {
    const res = await post({ email: "viewer@example.com", workspaceId: BCDX, role: "viewer" });
    expect(res.status).toBe(201);
    expect(res.body.invitation).toMatchObject({
      workspace: { id: BCDX, name: "BCDX" },
      role: "viewer",
    });
    expect(t.mailbox.sent[0]?.subject).toContain("BCDX");
  });

  test("role goes with workspaceId, both ways", async () => {
    for (const body of [
      { email: "a@example.com", workspaceId: BCDX },
      { email: "a@example.com", role: "member" },
      { email: "a@example.com", workspaceId: BCDX, role: "admin" },
      { email: "nope" },
      {},
    ]) {
      const res = await post(body);
      expect([JSON.stringify(body), res.status, res.body.error.code]).toEqual([
        JSON.stringify(body),
        422,
        "VALIDATION_FAILED",
      ]);
    }
    expect((await t.db.select().from(schema.invitations)).length).toBe(2);
  });

  test("404 for an unknown workspace; 409 for a member and for a pending invitation", async () => {
    const missing = await post({ email: "a@example.com", workspaceId: MISSING, role: "member" });
    expect(missing.status).toBe(404);
    const member = await post({ email: "KENJI@bcdx.example", workspaceId: BCDX, role: "member" });
    expect([member.status, member.body.error.code]).toEqual([409, "ALREADY_MEMBER"]);
    const first = await post({ email: "once@example.com" });
    const second = await post({ email: "ONCE@example.com" });
    expect([second.status, second.body.error.code]).toEqual([409, "INVITATION_PENDING"]);
    expect(second.body.error.invitationId).toBe(first.body.invitation.id);
    const forWorkspace = await post({
      email: "once@example.com",
      workspaceId: BCDX,
      role: "member",
    });
    expect(forWorkspace.status).toBe(201);
    const pendingDemo = await post({
      email: "new.member@bcdx.example",
      workspaceId: BCDX,
      role: "member",
    });
    expect(pendingDemo.body.error.code).toBe("INVITATION_PENDING");
  });

  test("counts against the hourly invitation limit (429 RATE_LIMITED)", async () => {
    const limit = RATE_LIMITS.invitation.limit;
    for (let i = 0; i < limit; i++) {
      expect((await post({ email: `person${i}@example.com` })).status).toBe(201);
    }
    const res = await post({ email: "one.too.many@example.com" });
    expect([res.status, res.body.error.code]).toEqual([429, "RATE_LIMITED"]);
    expect(
      await t.db
        .select({ id: schema.invitations.id })
        .from(schema.invitations)
        .where(isNull(schema.invitations.workspaceId)),
    ).toHaveLength(limit);
  });

  test("an operator manages these invitations through W5 and W7 without being a member", async () => {
    const created = await post({ email: "managed@example.com", workspaceId: BCDX, role: "member" });
    const id = created.body.invitation.id;
    const resend = await call(t.app, "POST", `/api/v1/invitations/${id}/resend`, { as: as.admin });
    expect(resend.status).toBe(200);
    expect(Object.keys(resend.body)).toEqual(["invitation"]);
    expect(t.mailbox.sent).toHaveLength(2);
    expect(
      (await call(t.app, "DELETE", `/api/v1/invitations/${id}`, { as: as.admin })).status,
    ).toBe(204);
    const revoked = await call(t.app, "GET", `${api}/invitations?status=revoked`, { as: as.admin });
    expect(revoked.body.items.map((i: { id: string }) => i.id)).toEqual([id]);

    const operator = await post({ email: "managed-op@example.com" });
    const opId = operator.body.invitation.id;
    expect(
      (await call(t.app, "POST", `/api/v1/invitations/${opId}/resend`, { as: as.admin })).status,
    ).toBe(200);
    expect(
      (await call(t.app, "POST", `/api/v1/invitations/${opId}/resend`, { as: as.ana })).body.error
        .code,
    ).toBe("FORBIDDEN");
    expect(
      (await call(t.app, "DELETE", `/api/v1/invitations/${opId}`, { as: as.admin })).status,
    ).toBe(204);
  });
});

describe("users.last_active_at (SDD 5.13)", () => {
  const lastActive = async () =>
    (
      await t.db
        .select({ at: schema.users.lastActiveAt })
        .from(schema.users)
        .where(eq(schema.users.id, userId("kenji")))
    )[0]?.at ?? null;
  const setLastActive = (at: Date | null) =>
    t.db
      .update(schema.users)
      .set({ lastActiveAt: at })
      .where(eq(schema.users.id, userId("kenji")));
  // A fresh sign-in each time: earlier tests suspend users and reseed, which ends sessions.
  const use = async () => call(t.app, "GET", "/api/v1/me", { as: await login(t.app, "kenji") });

  test("an authenticated request sets it when it is empty", async () => {
    await setLastActive(null);
    const before = Date.now();
    expect((await use()).status).toBe(200);
    const at = await lastActive();
    expect(at).not.toBeNull();
    expect((at as Date).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  test("it is written at most once per interval and again after it", async () => {
    const recent = new Date(Date.now() - 60_000);
    await setLastActive(recent);
    await use();
    expect((await lastActive())?.getTime()).toBe(recent.getTime());

    await setLastActive(new Date(Date.now() - LAST_ACTIVE_WRITE_INTERVAL_MS - 1000));
    const before = Date.now();
    await use();
    expect(((await lastActive()) as Date).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  test("an unauthenticated request writes nothing", async () => {
    await setLastActive(null);
    expect((await call(t.app, "GET", "/api/v1/me")).status).toBe(401);
    expect(await lastActive()).toBeNull();
  });

  test("AD7 shows the written value", async () => {
    await setLastActive(null);
    await use();
    const res = await call(t.app, "GET", `${api}/users?q=kenji`, { as: as.admin });
    const row = res.body.items.find((u: { id: string }) => u.id === userId("kenji"));
    expect(row.lastActiveAt).not.toBeNull();
  });
});
