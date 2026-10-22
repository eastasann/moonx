import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  connectDatabase,
  selfAnalyses,
  templateQuestions,
  templateVersions,
} from "@moonx/db";
import {
  prepareTestDatabase,
  quoteIdentifier,
  testDatabaseName,
} from "@moonx/db/test-database";
import {
  adminTemplateListSchema,
  errorBodySchema,
  type TemplateFile,
  type TemplateVersionDetail,
  templateCheckSchema,
  templateDraftSchema,
  templateImportResultSchema,
  templatePublishResultSchema,
  templateVersionDetailSchema,
} from "@moonx/schemas";
import { SQL } from "bun";
import { eq } from "drizzle-orm";
import { buildTestApp, uniqueIp } from "./test-app";
import { apiRequest, signIn, testFixtures } from "./test-fixtures";

// AD1–AD6 and AD10 (SDD 5.13): templates from an empty service to published versions,
// as 26 and 27 drive them. A database of its own: the tests import, edit and publish
// the only template of each kind, which every other test pins.

const base = process.env.DATABASE_URL_TEST;
if (base === undefined || base === "") {
  throw new Error("DATABASE_URL_TEST is required for make test-api");
}
const scratch = new URL(base);
scratch.pathname = `/${testDatabaseName(base)}_admin_templates_test`;
const url = scratch.toString();
const database = connectDatabase(url);
const { db } = database;
const { app } = buildTestApp(database);
const fixtures = testFixtures(db);

const BCDX = join(import.meta.dir, "../../../data/templates/bcdx");
const bcdxFile = (name: string): TemplateFile =>
  JSON.parse(readFileSync(join(BCDX, name), "utf8"));

let admin: { id: string; cookie: string };
let member: { cookie: string };

beforeAll(async () => {
  await prepareTestDatabase(url);
  const operator = await fixtures.createUser({
    displayName: "Moonx Admin",
    isAdmin: true,
  });
  admin = {
    id: operator.id,
    cookie: await signIn(app, operator.email, uniqueIp()),
  };
  const user = await fixtures.createUser();
  member = { cookie: await signIn(app, user.email, uniqueIp()) };
}, 60_000);

afterAll(async () => {
  await database.close();
  const server = new URL(base);
  server.pathname = "/postgres";
  const sql = new SQL(server.toString());
  try {
    await sql.unsafe(
      `DROP DATABASE IF EXISTS ${quoteIdentifier(testDatabaseName(url))} WITH (FORCE)`,
    );
  } finally {
    await sql.close();
  }
});

const call = (
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  cookie = admin.cookie,
) => app.handle(apiRequest(method, `/api/v1/admin${path}`, { cookie, body }));

const errorOf = async (response: Response) =>
  errorBodySchema.parse(await response.json()).error;

const detailOf = async (response: Response, status = 200) => {
  expect(response.status).toBe(status);
  return templateVersionDetailSchema.parse(await response.json());
};

const importFile = (kind: string, file: unknown) =>
  call("POST", `/templates/import?kind=${kind}`, file);

/** A small self-analysis file: WHY with two long texts. */
const selfAnalysisFile = (): TemplateFile => ({
  format: "moonx-template",
  formatVersion: 1,
  kind: "self_analysis",
  name: "Self analysis",
  aiPrompt: "Ask me one question at a time.",
  sections: [
    {
      key: "WHY",
      part: null,
      title: "Why",
      subtitle: "Why do I want this?",
      guidance: null,
      questions: ["SA.WHY.1", "SA.WHY.2"].map((key) => ({
        key,
        title: key,
        prompt: `${key}?`,
        example: null,
        hint: null,
        answerType: "long_text",
        options: null,
        displayCondition: null,
        hasFau: false,
        copyFrom: null,
        reference: null,
      })),
    },
  ],
  costDefaults: [],
  checkRules: [],
  executionPresets: [],
});

const questionOf = (detail: TemplateVersionDetail, key: string) => {
  const question = detail.sections
    .flatMap((section) => section.questions)
    .find((q) => q.key === key);
  if (question === undefined) throw new Error(`No question ${key}`);
  return question;
};

describe("AD1 GET /api/v1/admin/templates", () => {
  test("lists the three kinds, empty before any file is imported", async () => {
    const response = await call("GET", "/templates");
    expect(response.status).toBe(200);
    expect(adminTemplateListSchema.parse(await response.json())).toEqual({
      items: [
        { kind: "self_analysis", name: null, versions: [] },
        { kind: "validation", name: null, versions: [] },
        { kind: "business_plan", name: null, versions: [] },
      ],
    });
  });

  test("refuses everyone but operators", async () => {
    expect(
      (await call("GET", "/templates", undefined, member.cookie)).status,
    ).toBe(403);
    const anonymous = await app.handle(
      apiRequest("GET", "/api/v1/admin/templates"),
    );
    expect(anonymous.status).toBe(401);
  });
});

describe("a self-analysis template from file to published versions", () => {
  test("AD10, AD3, AD4, AD5, AD6, AD2 and AD1 as 26 and 27 drive them", async () => {
    // AD10: a file of another kind, a broken file, then the file.
    const wrongKind = await importFile("validation", selfAnalysisFile());
    expect(wrongKind.status).toBe(422);
    expect(await errorOf(wrongKind)).toMatchObject({
      code: "VALIDATION_FAILED",
      details: [{ path: "kind" }],
    });
    const broken = await importFile("self_analysis", {
      ...selfAnalysisFile(),
      sections: [{ key: "WHY" }],
    });
    expect(broken.status).toBe(422);
    expect((await errorOf(broken)).details?.[0]?.path).toStartWith(
      "sections.0",
    );
    const imported = await importFile("self_analysis", selfAnalysisFile());
    expect(imported.status).toBe(201);
    const v1 = templateImportResultSchema.parse(await imported.json());
    expect(v1).toMatchObject({ kind: "self_analysis", versionNumber: 1 });
    const again = await importFile("self_analysis", selfAnalysisFile());
    expect(again.status).toBe(409);
    expect((await errorOf(again)).code).toBe("DRAFT_EXISTS");

    // AD3
    let draft = await detailOf(
      await call("GET", `/template-versions/${v1.versionId}`),
    );
    expect(draft).toMatchObject({
      id: v1.versionId,
      kind: "self_analysis",
      versionNumber: 1,
      status: "draft",
      aiPrompt: "Ask me one question at a time.",
      name: "Self analysis",
      sections: [
        {
          key: "WHY",
          subtitle: "Why do I want this?",
          sortOrder: 0,
          questions: [
            {
              key: "SA.WHY.1",
              sectionKey: "WHY",
              copyFrom: null,
              isKeyPublished: false,
            },
            { key: "SA.WHY.2", sortOrder: 1, isKeyPublished: false },
          ],
        },
      ],
      costDefaults: [],
      checkRules: [],
      executionPresets: [],
    });
    draft = await detailOf(
      await call("PATCH", `/template-versions/${v1.versionId}`, {
        aiPrompt: "Ask one question at a time, then summarize.",
      }),
    );
    expect(draft.aiPrompt).toBe("Ask one question at a time, then summarize.");
    // The fields sent change; the name is required (design-spec 6.0.8 for 27).
    draft = await detailOf(
      await call("PATCH", `/template-versions/${v1.versionId}`, {}),
    );
    expect(draft).toMatchObject({
      name: "Self analysis",
      aiPrompt: "Ask one question at a time, then summarize.",
    });
    const blankName = await call(
      "PATCH",
      `/template-versions/${v1.versionId}`,
      {
        name: "  ",
      },
    );
    expect(blankName.status).toBe(422);
    expect((await errorOf(blankName)).details?.[0]?.path).toBe("name");

    // AD4 sections
    const sectionAdded = await call(
      "POST",
      `/template-versions/${v1.versionId}/sections`,
      { key: "INCOME", title: "Personal income" },
    );
    draft = await detailOf(sectionAdded, 201);
    const income = draft.sections[1];
    expect(income).toMatchObject({
      key: "INCOME",
      sortOrder: 1,
      subtitle: null,
      guidance: null,
      part: null,
      questions: [],
    });
    if (income === undefined) throw new Error("No INCOME");
    const repeated = await call(
      "POST",
      `/template-versions/${v1.versionId}/sections`,
      { key: "INCOME", title: "Again" },
    );
    expect(repeated.status).toBe(422);
    expect(await errorOf(repeated)).toMatchObject({
      code: "VALIDATION_FAILED",
      details: [{ path: "key" }],
    });
    draft = await detailOf(
      await call("PATCH", `/template-sections/${income.id}`, {
        subtitle: "How much do I need?",
      }),
    );
    expect(draft.sections[1]).toMatchObject({
      title: "Personal income",
      subtitle: "How much do I need?",
    });

    // AD4 questions
    const badKey = await call(
      "POST",
      `/template-sections/${income.id}/questions`,
      {
        key: "V.01.WHO",
        title: "Who",
        prompt: "Who?",
        answerType: "long_text",
      },
    );
    expect(badKey.status).toBe(422);
    expect((await errorOf(badKey)).code).toBe("INVALID_QUESTION_KEY");
    const fau = await call(
      "POST",
      `/template-sections/${income.id}/questions`,
      {
        key: "SA.INCOME.1",
        title: "Income",
        prompt: "How much?",
        answerType: "amount_with_reason",
        hasFau: true,
      },
    );
    expect(fau.status).toBe(422);
    expect(await errorOf(fau)).toMatchObject({
      code: "VALIDATION_FAILED",
      details: [{ path: "hasFau" }],
    });
    draft = await detailOf(
      await call("POST", `/template-sections/${income.id}/questions`, {
        key: "SA.INCOME.1",
        title: "Income",
        prompt: "How much do you need a month?",
        answerType: "choice",
        options: { kind: "choice", choices: ["Little", "Enough"] },
      }),
      201,
    );
    const choice = questionOf(draft, "SA.INCOME.1");
    expect(choice).toMatchObject({
      sectionKey: "INCOME",
      options: { kind: "choice", choices: ["Little", "Enough"] },
      hasFau: false,
      example: null,
    });
    const twice = await call(
      "POST",
      `/template-sections/${income.id}/questions`,
      {
        key: "SA.WHY.1",
        title: "Why",
        prompt: "Why?",
        answerType: "long_text",
      },
    );
    expect(twice.status).toBe(422);
    expect((await errorOf(twice)).details?.[0]?.path).toBe("key");
    for (const taken of [
      await call("PATCH", `/template-sections/${income.id}`, { key: "WHY" }),
      await call("PATCH", `/template-questions/${choice.id}`, {
        key: "SA.WHY.2",
      }),
    ]) {
      expect(taken.status).toBe(422);
      expect((await errorOf(taken)).details?.[0]?.path).toBe("key");
    }
    // A new answer type drops the options of the old one (design-spec 6.17).
    draft = await detailOf(
      await call("PATCH", `/template-questions/${choice.id}`, {
        answerType: "amount_with_reason",
      }),
    );
    expect(questionOf(draft, "SA.INCOME.1")).toMatchObject({
      answerType: "amount_with_reason",
      options: null,
    });

    // AD5: SA.WHY.2 moves to INCOME, which comes first. A partial list is refused.
    const why = draft.sections[0];
    if (why === undefined) throw new Error("No WHY");
    const [why1, why2] = why.questions;
    if (why1 === undefined || why2 === undefined) throw new Error("No WHY.*");
    const partial = await call(
      "PUT",
      `/template-versions/${v1.versionId}/order`,
      {
        sections: [{ id: income.id, questionIds: [choice.id] }],
      },
    );
    expect(partial.status).toBe(422);
    draft = await detailOf(
      await call("PUT", `/template-versions/${v1.versionId}/order`, {
        sections: [
          { id: income.id, questionIds: [choice.id, why2.id] },
          { id: why.id, questionIds: [why1.id] },
        ],
      }),
    );
    expect(
      draft.sections.map((section) => [
        section.key,
        section.questions.map((q) => q.key),
      ]),
    ).toEqual([
      ["INCOME", ["SA.INCOME.1", "SA.WHY.2"]],
      ["WHY", ["SA.WHY.1"]],
    ]);
    const costs = await call(
      "PUT",
      `/template-versions/${v1.versionId}/cost-defaults`,
      { items: [{ category: "initial", key: "initial.x", name: "X" }] },
    );
    expect(costs.status).toBe(422);
    expect(
      (
        await call("PUT", `/template-versions/${v1.versionId}/cost-defaults`, {
          items: [],
        })
      ).status,
    ).toBe(200);

    // AD6: SA.WHY.2 now sits in INCOME, which blocks publishing.
    const check = await call(
      "POST",
      `/template-versions/${v1.versionId}/validate`,
    );
    expect(check.status).toBe(200);
    expect(templateCheckSchema.parse(await check.json())).toEqual({
      errors: [
        {
          code: "question_key_section_mismatch",
          message: expect.any(String),
          nodeId: why2.id,
        },
      ],
      warnings: [],
    });
    const blocked = await call(
      "POST",
      `/template-versions/${v1.versionId}/publish`,
    );
    expect(blocked.status).toBe(422);
    expect((await errorOf(blocked)).code).toBe("TEMPLATE_INVALID");
    expect(
      (await call("DELETE", `/template-questions/${why2.id}`)).status,
    ).toBe(204);
    const published = await call(
      "POST",
      `/template-versions/${v1.versionId}/publish`,
    );
    expect(published.status).toBe(200);
    expect(templatePublishResultSchema.parse(await published.json())).toEqual({
      versionNumber: 1,
      publishedAt: expect.any(String),
    });

    // A published version is read-only, but may still be checked.
    for (const refused of [
      await call("POST", `/template-versions/${v1.versionId}/publish`),
      await call("PATCH", `/template-versions/${v1.versionId}`, {
        aiPrompt: "",
      }),
      await call("PATCH", `/template-versions/${v1.versionId}`, {
        name: "Renamed",
      }),
      await call("PATCH", `/template-sections/${income.id}`, { title: "X" }),
      await call("DELETE", `/template-questions/${choice.id}`),
      await call("PUT", `/template-versions/${v1.versionId}/check-rules`, {
        items: [],
      }),
    ]) {
      expect(refused.status).toBe(409);
      expect((await errorOf(refused)).code).toBe("PUBLISHED_READ_ONLY");
    }
    expect(
      (await call("POST", `/template-versions/${v1.versionId}/validate`))
        .status,
    ).toBe(200);

    // AD2: a copy of v1 is the v2 draft, with new ids.
    const copied = await call(
      "POST",
      `/template-versions/${v1.versionId}/draft`,
    );
    expect(copied.status).toBe(201);
    const v2 = templateDraftSchema.parse(await copied.json());
    const copy = await detailOf(
      await call("GET", `/template-versions/${v2.id}`),
    );
    const original = await detailOf(
      await call("GET", `/template-versions/${v1.versionId}`),
    );
    const shape = (detail: TemplateVersionDetail) =>
      detail.sections.map((section) => ({
        key: section.key,
        subtitle: section.subtitle,
        questions: section.questions.map((q) => [q.key, q.answerType]),
      }));
    expect(copy).toMatchObject({
      versionNumber: 2,
      status: "draft",
      aiPrompt: original.aiPrompt,
    });
    expect(shape(copy)).toEqual(shape(original));
    expect(copy.sections[0]?.id).not.toBe(original.sections[0]?.id);
    const second = await call(
      "POST",
      `/template-versions/${v1.versionId}/draft`,
    );
    expect(second.status).toBe(409);
    expect((await errorOf(second)).code).toBe("DRAFT_EXISTS");
    // An ID v1 published keeps naming its question (design-spec 6.6); one the draft
    // adds may still change.
    const kept = copy.sections
      .flatMap((section) => section.questions)
      .find((q) => q.key === "SA.WHY.1");
    expect(kept?.isKeyPublished).toBe(true);
    const renamed = await call("PATCH", `/template-questions/${kept?.id}`, {
      key: "SA.WHY.5",
    });
    expect(renamed.status).toBe(422);
    expect((await errorOf(renamed)).details?.[0]?.path).toBe("key");
    const added = await detailOf(
      await call(
        "POST",
        `/template-sections/${copy.sections[1]?.id}/questions`,
        {
          key: "SA.WHY.6",
          title: "Why now",
          prompt: "Why now?",
          answerType: "long_text",
        },
      ),
      201,
    );
    const fresh = questionOf(added, "SA.WHY.6");
    expect(fresh.isKeyPublished).toBe(false);
    expect(
      questionOf(
        await detailOf(
          await call("PATCH", `/template-questions/${fresh.id}`, {
            key: "SA.WHY.7",
          }),
        ),
        "SA.WHY.7",
      ).id,
    ).toBe(fresh.id);
    expect(
      (await call("DELETE", `/template-questions/${fresh.id}`)).status,
    ).toBe(204);
    expect(
      (await call("DELETE", `/template-questions/${fresh.id}`)).status,
    ).toBe(404);
    // The name is the template's: renamed on the draft, every version shows it.
    expect(
      (
        await detailOf(
          await call("PATCH", `/template-versions/${v2.id}`, {
            name: "Self Analysis",
          }),
        )
      ).name,
    ).toBe("Self Analysis");
    expect(
      (await detailOf(await call("GET", `/template-versions/${v1.versionId}`)))
        .name,
    ).toBe("Self Analysis");
    // The question v2 drops is a warning, which does not block.
    const [question] = await db
      .select({ id: templateQuestions.id })
      .from(templateQuestions)
      .where(eq(templateQuestions.templateVersionId, v2.id));
    expect(
      (await call("DELETE", `/template-questions/${question?.id}`)).status,
    ).toBe(204);
    const warned = templateCheckSchema.parse(
      await (await call("POST", `/template-versions/${v2.id}/validate`)).json(),
    );
    expect(warned.errors).toEqual([]);
    expect(warned.warnings).toEqual([
      { code: "removed_keys", keys: ["SA.INCOME.1"] },
    ]);
    expect(
      (await call("POST", `/template-versions/${v2.id}/publish`)).status,
    ).toBe(200);

    // AD1: newest first, who published, and what uses each.
    const owner = await fixtures.createUser();
    await db
      .insert(selfAnalyses)
      .values({ userId: owner.id, templateVersionId: v1.versionId });
    const list = adminTemplateListSchema.parse(
      await (await call("GET", "/templates")).json(),
    );
    expect(list.items[0]).toEqual({
      kind: "self_analysis",
      name: "Self Analysis",
      versions: [
        {
          id: v2.id,
          versionNumber: 2,
          status: "published",
          publishedAt: expect.any(String),
          publishedBy: {
            id: admin.id,
            displayName: "Moonx Admin",
            avatarUrl: null,
            badge: null,
          },
          usageCount: 0,
        },
        {
          id: v1.versionId,
          versionNumber: 1,
          status: "published",
          publishedAt: expect.any(String),
          publishedBy: expect.objectContaining({ id: admin.id }),
          usageCount: 1,
        },
      ],
    });
  });
});

describe("the settings only one kind of template has", () => {
  test("a validation draft takes cost rows and every threshold, and no AI prompt", async () => {
    const imported = templateImportResultSchema.parse(
      await (
        await importFile("validation", bcdxFile("validation.json"))
      ).json(),
    );
    const id = imported.versionId;
    const prompt = await call("PATCH", `/template-versions/${id}`, {
      aiPrompt: "Talk to me",
    });
    expect(prompt.status).toBe(422);
    expect((await errorOf(prompt)).details?.[0]?.path).toBe("aiPrompt");
    const nonUnique = await call(
      "PUT",
      `/template-versions/${id}/cost-defaults`,
      {
        items: [
          { category: "initial", key: "initial.a", name: "A" },
          { category: "variable", key: "initial.a", name: "B" },
        ],
      },
    );
    expect(nonUnique.status).toBe(422);
    let draft = await detailOf(
      await call("PUT", `/template-versions/${id}/cost-defaults`, {
        items: [
          { category: "monthly_fixed", key: "monthly.rent", name: "Rent" },
          { category: "initial", key: "initial.permits", name: "" },
        ],
      }),
    );
    expect(draft.costDefaults).toMatchObject([
      { key: "monthly.rent", sortOrder: 0 },
      { key: "initial.permits", name: "", sortOrder: 1 },
    ]);
    const missing = await call("PUT", `/template-versions/${id}/check-rules`, {
      items: [{ checkKey: "competitors", params: { min: 4 } }],
    });
    expect(missing.status).toBe(422);
    const outOfRange = await call(
      "PUT",
      `/template-versions/${id}/check-rules`,
      {
        items: [{ checkKey: "competitors", params: { min: 100 } }],
      },
    );
    expect(outOfRange.status).toBe(422);
    draft = await detailOf(
      await call("PUT", `/template-versions/${id}/check-rules`, {
        items: [
          { checkKey: "competitors", params: { min: 4 } },
          {
            checkKey: "local_price",
            params: { pricedCompetitors: 2, researchLogs: 1 },
          },
          { checkKey: "permits", params: { researchLogs: 2 } },
          { checkKey: "demand_signal", params: { researchLogs: 1 } },
        ],
      }),
    );
    expect(draft.checkRules).toContainEqual({
      checkKey: "competitors",
      params: { min: 4 },
    });
    const presets = await call(
      "PUT",
      `/template-versions/${id}/execution-presets`,
      { items: [{ type: "milestone", title: "Decide" }] },
    );
    expect(presets.status).toBe(422);
    // copyFrom belongs to plans.
    const section = draft.sections[0];
    const copy = await call(
      "POST",
      `/template-sections/${section?.id}/questions`,
      {
        key: "V.01.REACH",
        title: "Reach",
        prompt: "How will you reach them?",
        answerType: "long_text",
        hasFau: true,
        copyFrom: ["V.01.WHO"],
      },
    );
    expect(copy.status).toBe(422);
    expect((await errorOf(copy)).details?.[0]?.path).toBe("copyFrom");
    draft = await detailOf(
      await call("POST", `/template-sections/${section?.id}/questions`, {
        key: "V.01.REACH",
        title: "Reach",
        prompt: "How will you reach them?",
        answerType: "long_text",
        hasFau: true,
        displayCondition: { "V.02.OCEAN": ["Red"] },
      }),
      201,
    );
    expect(questionOf(draft, "V.01.REACH")).toMatchObject({
      hasFau: true,
      displayCondition: { "V.02.OCEAN": ["Red"] },
      // Last of 01, after its 10 questions.
      sortOrder: 10,
    });
    const condition = await call(
      "PATCH",
      `/template-questions/${questionOf(draft, "V.01.REACH").id}`,
      { displayCondition: { "SA.WHY.1": ["Yes"] } },
    );
    expect(condition.status).toBe(422);
    expect((await errorOf(condition)).details?.[0]?.path).toBe(
      "displayCondition",
    );
    // A condition with no answer would hide its question for good (6.0.8).
    const never = await call(
      "PATCH",
      `/template-questions/${questionOf(draft, "V.01.REACH").id}`,
      { displayCondition: { "V.02.OCEAN": [] } },
    );
    expect(never.status).toBe(422);
    expect((await errorOf(never)).details?.[0]?.path).toStartWith(
      "displayCondition",
    );
    // Deleting a section takes its questions with it.
    expect(
      (await call("DELETE", `/template-sections/${section?.id}`)).status,
    ).toBe(204);
    draft = await detailOf(await call("GET", `/template-versions/${id}`));
    expect(draft.sections.map((s) => s.key)).not.toContain("01");
    expect(
      draft.sections.flatMap((s) => s.questions).map((q) => q.key),
    ).not.toContain("V.01.WHO");
  });

  test("a plan draft takes the starting execution rows", async () => {
    const imported = templateImportResultSchema.parse(
      await (await importFile("business_plan", bcdxFile("plan.json"))).json(),
    );
    const id = imported.versionId;
    const draft = await detailOf(
      await call("PUT", `/template-versions/${id}/execution-presets`, {
        items: [
          { type: "milestone", title: "Business decision" },
          {
            type: "launch",
            title: "30 days before",
            launchTiming: "t_minus_30",
          },
          { type: "kpi", title: "Revenue", area: "Financial" },
        ],
      }),
    );
    expect(draft.executionPresets).toEqual([
      {
        id: expect.any(String),
        type: "milestone",
        title: "Business decision",
        area: null,
        launchTiming: null,
        sortOrder: 0,
      },
      {
        id: expect.any(String),
        type: "launch",
        title: "30 days before",
        area: null,
        launchTiming: "t_minus_30",
        sortOrder: 1,
      },
      {
        id: expect.any(String),
        type: "kpi",
        title: "Revenue",
        area: "Financial",
        launchTiming: null,
        sortOrder: 2,
      },
    ]);
    const noTiming = await call(
      "PUT",
      `/template-versions/${id}/execution-presets`,
      { items: [{ type: "launch", title: "Launch day" }] },
    );
    expect(noTiming.status).toBe(422);
    const [version] = await db
      .select({ status: templateVersions.status })
      .from(templateVersions)
      .where(eq(templateVersions.id, id));
    expect(version?.status).toBe("draft");
  });
});

/** The draft of `kind`, imported from the BCDX file when there is none. */
const draftOf = async (kind: "validation" | "business_plan") => {
  const list = adminTemplateListSchema.parse(
    await (await call("GET", "/templates")).json(),
  );
  const draft = list.items
    .find((template) => template.kind === kind)
    ?.versions.find((version) => version.status === "draft");
  if (draft !== undefined) return draft.id;
  const file = bcdxFile(
    kind === "validation" ? "validation.json" : "plan.json",
  );
  return templateImportResultSchema.parse(
    await (await importFile(kind, file)).json(),
  ).versionId;
};

describe("AD6 and the answer types of each kind", () => {
  test("an amount with a reason blocks publishing a validation or a plan", async () => {
    for (const kind of ["validation", "business_plan"] as const) {
      const id = await draftOf(kind);
      const section = (
        await detailOf(await call("GET", `/template-versions/${id}`))
      ).sections.at(-1);
      if (section === undefined) throw new Error(`No section in ${kind}`);
      const key =
        kind === "validation"
          ? `V.${section.key}.BUDGET`
          : `P.${section.key}.99`;
      const added = questionOf(
        await detailOf(
          await call("POST", `/template-sections/${section.id}/questions`, {
            key,
            title: "Budget",
            prompt: "How much will you spend?",
            answerType: "amount_with_reason",
          }),
          201,
        ),
        key,
      );

      const check = templateCheckSchema.parse(
        await (await call("POST", `/template-versions/${id}/validate`)).json(),
      );
      expect(check.errors.filter((error) => error.nodeId === added.id)).toEqual(
        [
          {
            code: "answer_type_mismatch",
            message: expect.any(String),
            nodeId: added.id,
          },
        ],
      );
      const publish = await call("POST", `/template-versions/${id}/publish`);
      expect(publish.status).toBe(422);
      expect((await errorOf(publish)).code).toBe("TEMPLATE_INVALID");

      expect(
        (await call("DELETE", `/template-questions/${added.id}`)).status,
      ).toBe(204);
      const after = templateCheckSchema.parse(
        await (await call("POST", `/template-versions/${id}/validate`)).json(),
      );
      // The question was the draft's only problem.
      expect(after.errors).toEqual([]);
    }
  });
});

describe("AD6 and the Pitch Deck of a plan template (design-spec 6.14)", () => {
  test("a slide the most material runs past the bottom of blocks publishing, once in each deck", async () => {
    const id = await draftOf("business_plan");
    const detail = await detailOf(
      await call("GET", `/template-versions/${id}`),
    );
    const sectionOf = (key: string) => {
      const section = detail.sections.find(
        (candidate) => candidate.key === key,
      );
      if (section === undefined) throw new Error(`No section ${key}`);
      return section;
    };
    const validate = async () =>
      templateCheckSchema.parse(
        await (await call("POST", `/template-versions/${id}/validate`)).json(),
      ).errors;
    const refused = async () => {
      const publish = await call("POST", `/template-versions/${id}/publish`);
      expect(publish.status).toBe(422);
      expect((await errorOf(publish)).code).toBe("TEMPLATE_INVALID");
    };
    const overflow = (nodeId: string) => ({
      code: "pitch_deck_overflow" as const,
      message: expect.any(String),
      nodeId,
    });
    expect(await validate()).toEqual([]);

    // Four more bullets on the five-minute Funding plan: past its bottom in Japanese.
    const financialPlan = sectionOf("20");
    const added: { id: string }[] = [];
    for (const number of [12, 13, 14, 15]) {
      const key = `P.20.${number}`;
      added.push(
        questionOf(
          await detailOf(
            await call(
              "POST",
              `/template-sections/${financialPlan.id}/questions`,
              {
                key,
                title: `Reserve top-up ${number}`,
                prompt: "How will you top up the reserve?",
                answerType: "long_text",
              },
            ),
            201,
          ),
          key,
        ),
      );
      expect(await validate()).toEqual(
        number < 15 ? [] : [overflow(financialPlan.id)],
      );
    }
    await refused();
    for (const question of added) {
      expect(
        (await call("DELETE", `/template-questions/${question.id}`)).status,
      ).toBe(204);
    }

    // §4's titles at 197 characters, near the 200 a title may take: the Problem slides of
    // both decks.
    const problem = sectionOf("04");
    const rename = async (title: (question: { title: string }) => string) => {
      for (const question of problem.questions) {
        const response = await call(
          "PATCH",
          `/template-questions/${question.id}`,
          { title: title(question) },
        );
        expect(response.status).toBe(200);
      }
    };
    await rename(() => "MMMMM ".repeat(33).trim());
    expect(await validate()).toEqual([
      overflow(problem.id),
      overflow(problem.id),
    ]);
    await refused();
    await rename((question) => question.title);
    expect(await validate()).toEqual([]);
  }, 30_000);
});

describe("what does not exist", () => {
  test("answers 404 for unknown and malformed ids", async () => {
    for (const response of [
      await call("GET", `/template-versions/${crypto.randomUUID()}`),
      await call("GET", "/template-versions/v1"),
      await call("POST", "/template-versions/v1/draft"),
      await call("POST", `/template-versions/${crypto.randomUUID()}/validate`),
      await call("POST", "/template-versions/x/publish"),
      await call("PATCH", "/template-versions/x", { aiPrompt: "" }),
      await call("PATCH", `/template-sections/${crypto.randomUUID()}`, {
        title: "X",
      }),
      await call("DELETE", "/template-questions/nope"),
      await call(
        "POST",
        `/template-sections/${crypto.randomUUID()}/questions`,
        {
          key: "SA.WHY.9",
          title: "X",
          prompt: "X?",
          answerType: "long_text",
        },
      ),
    ]) {
      expect(response.status).toBe(404);
    }
  });
});
