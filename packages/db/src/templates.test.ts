import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type AnswerType,
  PLAN_LIST_COLUMNS,
  type TemplateFile,
  type TemplateKind,
  templateFileSchema,
} from "@moonx/schemas";
import { SQL } from "bun";
import { asc, eq } from "drizzle-orm";
import { connectDatabase } from "./client";
import {
  templateCheckRules,
  templateCostDefaults,
  templateExecutionPresets,
  templateQuestions,
  templateSections,
  templates,
  templateVersions,
} from "./schema";
import {
  checkTemplateContent,
  importTemplateFile,
  publishTemplateVersion,
  type TemplateContent,
  TemplateError,
  validateTemplateVersion,
} from "./templates";
import {
  prepareTestDatabase,
  quoteIdentifier,
  testDatabaseName,
} from "./test-database";

const base = process.env.DATABASE_URL_TEST;
if (base === undefined || base === "") {
  throw new Error("DATABASE_URL_TEST is required for make test-api");
}
// A database of its own: every test empties the template tables, which rows other tests
// keep in DATABASE_URL_TEST would refer to.
const scratch = new URL(base);
scratch.pathname = `/${testDatabaseName(base)}_templates_test`;
const url = scratch.toString();
const { db, close } = connectDatabase(url);

beforeAll(() => prepareTestDatabase(url));

afterAll(async () => {
  await close();
  const admin = new URL(base);
  admin.pathname = "/postgres";
  const sql = new SQL(admin.toString());
  try {
    await sql.unsafe(
      `DROP DATABASE IF EXISTS ${quoteIdentifier(testDatabaseName(url))} WITH (FORCE)`,
    );
  } finally {
    await sql.close();
  }
});

const BCDX = join(import.meta.dir, "../../../data/templates/bcdx");
/** A BCDX file as the seed reads it: raw JSON, which the import checks. */
const bcdxFile = (name: string): TemplateFile =>
  JSON.parse(readFileSync(join(BCDX, name), "utf8"));

beforeEach(async () => {
  // Versions cascade to their sections, questions and settings.
  await db.delete(templateVersions);
  await db.delete(templates);
});

/** A small valid file of `kind`, to change one thing at a time. */
function sampleFile(kind: TemplateKind) {
  const question = (key: string) => ({
    key,
    title: "TITLE",
    prompt: "A question?",
    example: null,
    hint: null,
    answerType: "long_text",
    options: null,
    displayCondition: null,
    hasFau: kind === "validation",
    copyFrom: null,
    reference: null,
  });
  const base = {
    format: "moonx-template",
    formatVersion: 1,
    kind,
    name: "Sample",
    aiPrompt: "",
    costDefaults: [] as unknown[],
    checkRules: [] as unknown[],
    executionPresets: [] as unknown[],
  };
  if (kind === "self_analysis")
    return {
      ...base,
      aiPrompt: "Ask me one question at a time.",
      sections: [
        {
          key: "WHY",
          part: null,
          title: "WHY",
          subtitle: "Why do I want this?",
          guidance: null,
          questions: [question("SA.WHY.1"), question("SA.WHY.2")],
        },
      ],
    };
  if (kind === "validation")
    return {
      ...base,
      sections: [
        {
          key: "01",
          part: null,
          title: "Customer & Problem",
          subtitle: null,
          guidance: null,
          questions: [question("V.01.WHO"), question("V.01.WHY_THEM")],
        },
      ],
      costDefaults: [
        { category: "initial", key: "initial.permits", name: "Permits" },
        { category: "monthly_fixed", key: "monthly.rent", name: "Rent" },
      ],
      checkRules: [
        { checkKey: "competitors", params: { min: 3 } },
        {
          checkKey: "local_price",
          params: { pricedCompetitors: 2, researchLogs: 1 },
        },
        { checkKey: "permits", params: { researchLogs: 1 } },
        { checkKey: "demand_signal", params: { researchLogs: 1 } },
      ],
    };
  return {
    ...base,
    sections: [
      {
        key: "01",
        part: "a",
        title: "Executive Summary",
        subtitle: null,
        guidance: null,
        questions: [question("P.01.1")],
      },
      {
        key: "11",
        part: "b",
        title: "Founder Roles",
        subtitle: null,
        guidance: null,
        questions: [question("P.11.1")],
      },
    ],
    executionPresets: [
      {
        type: "launch",
        title: "Launch day",
        area: null,
        launchTiming: "launch_day",
      },
    ],
  };
}

/** The TemplateError `run` throws. Fails the test when it throws nothing else. */
async function templateError(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    if (error instanceof TemplateError) return error;
    throw error;
  }
  throw new Error("Expected a TemplateError");
}

const versionRows = () =>
  db
    .select({
      kind: templates.kind,
      name: templates.name,
      versionNumber: templateVersions.versionNumber,
      status: templateVersions.status,
    })
    .from(templateVersions)
    .innerJoin(templates, eq(templates.id, templateVersions.templateId))
    .orderBy(asc(templates.kind), asc(templateVersions.versionNumber));

// Check rules have no order of their own.
const byCheckKey = (a: { checkKey: string }, b: { checkKey: string }) =>
  a.checkKey.localeCompare(b.checkKey);

/** A file as `storedFile` reads it back after the import. */
const asStored = (file: unknown) => {
  const parsed = templateFileSchema.parse(file);
  return { ...parsed, checkRules: parsed.checkRules.toSorted(byCheckKey) };
};

/** A stored version written back in the template file's shape. */
async function storedFile(versionId: string) {
  const [version] = await db
    .select({
      kind: templates.kind,
      name: templates.name,
      aiPrompt: templateVersions.aiPrompt,
    })
    .from(templateVersions)
    .innerJoin(templates, eq(templates.id, templateVersions.templateId))
    .where(eq(templateVersions.id, versionId));
  const sections = await db
    .select()
    .from(templateSections)
    .where(eq(templateSections.templateVersionId, versionId))
    .orderBy(asc(templateSections.sortOrder));
  const questions = await db
    .select()
    .from(templateQuestions)
    .where(eq(templateQuestions.templateVersionId, versionId))
    .orderBy(asc(templateQuestions.sortOrder));
  const costs = await db
    .select()
    .from(templateCostDefaults)
    .where(eq(templateCostDefaults.templateVersionId, versionId))
    .orderBy(asc(templateCostDefaults.sortOrder));
  const rules = await db
    .select()
    .from(templateCheckRules)
    .where(eq(templateCheckRules.templateVersionId, versionId));
  const presets = await db
    .select()
    .from(templateExecutionPresets)
    .where(eq(templateExecutionPresets.templateVersionId, versionId))
    .orderBy(asc(templateExecutionPresets.sortOrder));
  return {
    format: "moonx-template",
    formatVersion: 1,
    kind: version?.kind,
    name: version?.name,
    aiPrompt: version?.aiPrompt,
    sections: sections.map((section) => ({
      key: section.key,
      part: section.part,
      title: section.title,
      subtitle: section.subtitle,
      guidance: section.guidance,
      questions: questions
        .filter((question) => question.templateSectionId === section.id)
        .map((question) => ({
          key: question.questionKey,
          title: question.title,
          prompt: question.prompt,
          example: question.example,
          hint: question.hint,
          answerType: question.answerType,
          options: question.options,
          displayCondition: question.displayCondition,
          hasFau: question.hasFau,
          copyFrom: question.copyFrom,
          reference: question.reference,
        })),
    })),
    costDefaults: costs.map((row) => ({
      category: row.category,
      key: row.key,
      name: row.name,
    })),
    checkRules: rules
      .map((rule) => ({ checkKey: rule.checkKey, params: rule.params }))
      .toSorted(byCheckKey),
    executionPresets: presets.map((preset) => ({
      type: preset.type,
      title: preset.title,
      area: preset.area,
      launchTiming: preset.launchTiming,
    })),
  };
}

describe("the BCDX template files", () => {
  const files = [
    ["self_analysis", "self-analysis.json"],
    ["validation", "validation.json"],
    ["business_plan", "plan.json"],
  ] as const;

  for (const [kind, name] of files) {
    test(`${name} imports as v1, passes AD6 and publishes`, async () => {
      const file = bcdxFile(name);
      const imported = await importTemplateFile(db, kind, file);
      expect(imported).toEqual({
        versionId: expect.any(String),
        kind,
        versionNumber: 1,
      });
      expect(await validateTemplateVersion(db, imported.versionId)).toEqual({
        errors: [],
        warnings: [],
      });
      const published = await publishTemplateVersion(
        db,
        imported.versionId,
        null,
      );
      expect(published.versionNumber).toBe(1);
      expect(published.publishedAt).toBeInstanceOf(Date);
      expect(await versionRows()).toEqual([
        { kind, name: file.name, versionNumber: 1, status: "published" },
      ]);
    });
  }

  for (const [kind, name] of files) {
    test(`${name} is stored field for field, in its order`, async () => {
      const file = bcdxFile(name);
      const { versionId } = await importTemplateFile(db, kind, file);
      expect(await storedFile(versionId)).toEqual(asStored(file));
    });
  }
});

describe("importTemplateFile", () => {
  test("stores a validation file's cost rows and check rules", async () => {
    const file = sampleFile("validation");
    const { versionId } = await importTemplateFile(db, "validation", file);
    expect(await storedFile(versionId)).toEqual(asStored(file));
  });

  test("stores a file larger than one insert statement can carry", async () => {
    const file = sampleFile("validation");
    const count = 5000;
    const section = file.sections[0];
    const question = section?.questions[0];
    if (section === undefined || question === undefined)
      throw new Error("The sample has no question");
    section.questions = Array.from({ length: count }, (_, i) => ({
      ...question,
      key: `V.01.Q${i}`,
    }));
    const { versionId } = await importTemplateFile(db, "validation", file);
    const stored = await db
      .select({ key: templateQuestions.questionKey })
      .from(templateQuestions)
      .where(eq(templateQuestions.templateVersionId, versionId));
    expect(stored).toHaveLength(count);
  });

  test("numbers a new draft after the published versions, from the file only", async () => {
    const first = sampleFile("self_analysis");
    const v1 = await importTemplateFile(db, "self_analysis", first);
    await publishTemplateVersion(db, v1.versionId, null);
    const second = {
      ...first,
      name: "Renamed",
      sections: [
        {
          ...first.sections[0],
          questions: first.sections[0]?.questions.slice(0, 1) ?? [],
        },
      ],
    };
    const v2 = await importTemplateFile(db, "self_analysis", second);
    expect(v2.versionNumber).toBe(2);
    // The template keeps the name it was created with.
    expect(await versionRows()).toEqual([
      {
        kind: "self_analysis",
        name: "Sample",
        versionNumber: 1,
        status: "published",
      },
      {
        kind: "self_analysis",
        name: "Sample",
        versionNumber: 2,
        status: "draft",
      },
    ]);
    const questions = await db
      .select({ key: templateQuestions.questionKey })
      .from(templateQuestions)
      .where(eq(templateQuestions.templateVersionId, v2.versionId));
    expect(questions).toEqual([{ key: "SA.WHY.1" }]);
    expect(await validateTemplateVersion(db, v2.versionId)).toEqual({
      errors: [],
      warnings: [{ code: "removed_keys", keys: ["SA.WHY.2"] }],
    });
    // Warnings do not block publishing.
    expect(
      (await publishTemplateVersion(db, v2.versionId, null)).versionNumber,
    ).toBe(2);
  });

  test("refuses a second draft with DRAFT_EXISTS", async () => {
    const file = sampleFile("business_plan");
    await importTemplateFile(db, "business_plan", file);
    const error = await templateError(() =>
      importTemplateFile(db, "business_plan", file),
    );
    expect(error.code).toBe("DRAFT_EXISTS");
    expect(await versionRows()).toHaveLength(1);
  });

  test("lets only one of two concurrent imports create the draft", async () => {
    const file = sampleFile("validation");
    const results = await Promise.allSettled([
      importTemplateFile(db, "validation", file),
      importTemplateFile(db, "validation", file),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const reasons = results.flatMap((r) =>
      r.status === "rejected" ? [r.reason] : [],
    );
    expect(reasons).toEqual([expect.any(TemplateError)]);
    expect(reasons[0]).toMatchObject({ code: "DRAFT_EXISTS" });
    expect(await versionRows()).toHaveLength(1);
  });

  test("lets only one of two concurrent imports make the next draft", async () => {
    const file = sampleFile("validation");
    const v1 = await importTemplateFile(db, "validation", file);
    await publishTemplateVersion(db, v1.versionId, null);
    const results = await Promise.allSettled([
      importTemplateFile(db, "validation", file),
      importTemplateFile(db, "validation", file),
    ]);
    const reasons = results.flatMap((r) =>
      r.status === "rejected" ? [r.reason] : [],
    );
    expect(reasons).toEqual([expect.any(TemplateError)]);
    expect(reasons[0]).toMatchObject({ code: "DRAFT_EXISTS" });
    expect((await versionRows()).map((row) => row.status)).toEqual([
      "published",
      "draft",
    ]);
  });

  test("refuses a file of another kind on kind alone (design-spec 6.17)", async () => {
    const error = await templateError(() =>
      importTemplateFile(db, "validation", bcdxFile("plan.json")),
    );
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.details).toEqual([
      {
        path: "kind",
        code: "invalid_value",
        message: "Expected validation",
      },
    ]);
    expect(await versionRows()).toEqual([]);
  });

  const unreadable: [string, unknown, string][] = [
    ["a string", "moonx-template", ""],
    ["an array", [], ""],
    [
      "another format",
      { ...sampleFile("validation"), format: "csv" },
      "format",
    ],
    [
      "a later format version",
      { ...sampleFile("validation"), formatVersion: 2 },
      "formatVersion",
    ],
    [
      "a file without sections",
      (() => {
        const { sections: _, ...rest } = sampleFile("validation");
        return rest;
      })(),
      "sections",
    ],
    ["a misspelt field", { ...sampleFile("validation"), costDefault: [] }, ""],
    [
      "a NUL in a display condition",
      (() => {
        const file = sampleFile("validation");
        const question = file.sections[0]?.questions[1];
        if (question !== undefined)
          Object.assign(question, {
            displayCondition: { "V.01.WHO": ["Red\u0000"] },
          });
        return file;
      })(),
      "sections.0.questions.1.displayCondition.V.01.WHO.0",
    ],
    [
      "an AI prompt in a validation file",
      { ...sampleFile("validation"), aiPrompt: "Discuss with me." },
      "aiPrompt",
    ],
  ];
  for (const [what, input, path] of unreadable) {
    test(`refuses ${what} with VALIDATION_FAILED and writes nothing`, async () => {
      const error = await templateError(() =>
        importTemplateFile(db, "validation", input),
      );
      expect(error.code).toBe("VALIDATION_FAILED");
      expect(error.details.map((detail) => detail.path)).toContain(path);
      expect(await db.select().from(templates)).toEqual([]);
    });
  }

  test("writes the ids newId gives, in the documented order", async () => {
    let n = 0;
    const newId = () =>
      `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
    const { versionId } = await importTemplateFile(
      db,
      "self_analysis",
      sampleFile("self_analysis"),
      { newId },
    );
    expect(await db.select({ id: templates.id }).from(templates)).toEqual([
      { id: "00000000-0000-4000-8000-000000000001" },
    ]);
    expect(versionId).toBe("00000000-0000-4000-8000-000000000002");
    const [section] = await db
      .select({ id: templateSections.id })
      .from(templateSections);
    expect(section?.id).toBe("00000000-0000-4000-8000-000000000003");
    const questions = await db
      .select({ id: templateQuestions.id })
      .from(templateQuestions)
      .orderBy(asc(templateQuestions.sortOrder));
    expect(questions.map((q) => q.id)).toEqual([
      "00000000-0000-4000-8000-000000000004",
      "00000000-0000-4000-8000-000000000005",
    ]);
  });
});

describe("validateTemplateVersion and publishTemplateVersion", () => {
  test("block publishing a draft AD6 finds errors in", async () => {
    const { versionId } = await importTemplateFile(
      db,
      "validation",
      sampleFile("validation"),
    );
    // Rows as an operator's edits in 27 could leave them.
    await db
      .update(templateQuestions)
      .set({ displayCondition: { "V.02.OCEAN": ["Red"] } })
      .where(eq(templateQuestions.questionKey, "V.01.WHO"));
    const check = await validateTemplateVersion(db, versionId);
    expect(check.errors.map((error) => error.code)).toEqual([
      "unknown_condition_key",
    ]);
    const [who] = await db
      .select({ id: templateQuestions.id })
      .from(templateQuestions)
      .where(eq(templateQuestions.questionKey, "V.01.WHO"));
    expect(check.errors[0]?.nodeId).toBe(who?.id ?? "");

    const error = await templateError(() =>
      publishTemplateVersion(db, versionId, null),
    );
    expect(error.code).toBe("TEMPLATE_INVALID");
    expect(await versionRows()).toEqual([
      {
        kind: "validation",
        name: "Sample",
        versionNumber: 1,
        status: "draft",
      },
    ]);
  });

  test("refuse a published version with PUBLISHED_READ_ONLY, but still validate it", async () => {
    const { versionId } = await importTemplateFile(
      db,
      "business_plan",
      sampleFile("business_plan"),
    );
    await publishTemplateVersion(db, versionId, null);
    const error = await templateError(() =>
      publishTemplateVersion(db, versionId, null),
    );
    expect(error.code).toBe("PUBLISHED_READ_ONLY");
    expect(await validateTemplateVersion(db, versionId)).toEqual({
      errors: [],
      warnings: [],
    });
  });

  test("answer an unknown version with NOT_FOUND", async () => {
    for (const missing of ["00000000-0000-4000-8000-000000000000", "v1"]) {
      for (const run of [
        () => validateTemplateVersion(db, missing),
        () => publishTemplateVersion(db, missing, null),
      ]) {
        expect((await templateError(run)).code).toBe("NOT_FOUND");
      }
    }
  });
});

describe("checkTemplateContent", () => {
  type Question = TemplateContent["sections"][number]["questions"][number];
  const q = (questionKey: string, extra: Partial<Question> = {}): Question => ({
    id: `q:${questionKey}`,
    questionKey,
    answerType: "long_text",
    options: null,
    displayCondition: null,
    ...extra,
  });
  const content = (
    kind: TemplateKind,
    sections: TemplateContent["sections"],
    previousQuestionKeys: string[] | null = null,
  ): TemplateContent => ({ kind, sections, previousQuestionKeys });
  const codes = (input: TemplateContent) =>
    checkTemplateContent(input).errors.map((error) => [
      error.code,
      error.nodeId,
    ]);

  test("finds no problem in a sound version", () => {
    expect(
      checkTemplateContent(
        content("validation", [
          {
            id: "s1",
            key: "02",
            part: null,
            questions: [
              q("V.02.OCEAN", {
                answerType: "choice",
                options: { kind: "choice", choices: ["Red", "Blue", "Mixed"] },
              }),
              q("V.02.RED_1", {
                displayCondition: { "V.02.OCEAN": ["Red", "Mixed"] },
              }),
            ],
          },
        ]),
      ),
    ).toEqual({ errors: [], warnings: [] });
  });

  test("no_questions", () => {
    expect(
      codes(
        content("self_analysis", [
          { id: "s1", key: "WHY", part: null, questions: [] },
        ]),
      ),
    ).toEqual([["no_questions", null]]);
  });

  test("invalid_part: a plan needs A or B, other kinds have none", () => {
    expect(
      codes(
        content("business_plan", [
          { id: "s1", key: "01", part: null, questions: [q("P.01.1")] },
        ]),
      ),
    ).toEqual([["invalid_part", "s1"]]);
    expect(
      codes(
        content("validation", [
          { id: "s1", key: "01", part: "a", questions: [q("V.01.WHO")] },
        ]),
      ),
    ).toEqual([["invalid_part", "s1"]]);
  });

  test("invalid_question_key, question_key_section_mismatch, duplicate_question_key", () => {
    expect(
      codes(
        content("business_plan", [
          {
            id: "s1",
            key: "01",
            part: "a",
            questions: [
              q("P.1.1", { id: "bad" }),
              q("P.02.1", { id: "elsewhere" }),
              q("P.01.1", { id: "first" }),
              q("P.01.1", { id: "again" }),
            ],
          },
        ]),
      ),
    ).toEqual([
      ["invalid_question_key", "bad"],
      ["question_key_section_mismatch", "elsewhere"],
      ["duplicate_question_key", "again"],
    ]);
  });

  test("options_mismatch: options must give what the answer type needs", () => {
    const mismatched: Partial<Question>[] = [
      { answerType: "long_text", options: { kind: "choice", choices: ["A"] } },
      { answerType: "choice", options: null },
      { answerType: "choice", options: { kind: "choice", choices: [] } },
      {
        answerType: "table",
        options: { kind: "linked_metric", metricKeys: ["selling_price"] },
      },
      { answerType: "table", options: { kind: "table", columns: [] } },
      {
        answerType: "linked_metric",
        options: { kind: "linked_metric", metricKeys: [] },
      },
      { answerType: "execution_view", options: { kind: "execution_view" } },
    ];
    for (const extra of mismatched) {
      expect(
        codes(
          content("business_plan", [
            {
              id: "s1",
              key: "01",
              part: "a",
              questions: [q("P.01.1", extra)],
            },
          ]),
        ),
      ).toEqual([["options_mismatch", "q:P.01.1"]]);
    }
  });

  test("answer_type_mismatch: each kind takes only the answer types its answers hold", () => {
    const fitting: Record<AnswerType, unknown> = {
      long_text: null,
      short_text: null,
      choice: { kind: "choice", choices: ["Yes", "No"] },
      amount_with_reason: null,
      table: {
        kind: "table",
        columns: [{ key: "name", label: "Name", type: "text" }],
      },
      linked_metric: { kind: "linked_metric", metricKeys: ["selling_price"] },
      execution_view: { kind: "execution_view", executionType: "milestone" },
    };
    const refused: Record<TemplateKind, AnswerType[]> = {
      self_analysis: ["table", "linked_metric", "execution_view"],
      validation: [
        "amount_with_reason",
        "table",
        "linked_metric",
        "execution_view",
      ],
      business_plan: ["amount_with_reason"],
    };
    const sectionOf = {
      self_analysis: { key: "WHY", part: null, questionKey: "SA.WHY.1" },
      validation: { key: "01", part: null, questionKey: "V.01.WHO" },
      business_plan: { key: "01", part: "a", questionKey: "P.01.1" },
    } as const;
    for (const kind of Object.keys(refused) as TemplateKind[]) {
      const { key, part, questionKey } = sectionOf[kind];
      for (const answerType of Object.keys(fitting) as AnswerType[]) {
        const found = codes(
          content(kind, [
            {
              id: "s1",
              key,
              part,
              questions: [
                q(questionKey, { answerType, options: fitting[answerType] }),
              ],
            },
          ]),
        );
        expect({ kind, answerType, found }).toEqual({
          kind,
          answerType,
          found: refused[kind].includes(answerType)
            ? [["answer_type_mismatch", `q:${questionKey}`]]
            : [],
        });
      }
    }
  });

  test("unknown_condition_key", () => {
    expect(
      codes(
        content("validation", [
          {
            id: "s1",
            key: "02",
            part: null,
            questions: [
              q("V.02.RED_1", {
                displayCondition: { "V.02.OCEAN": ["Red"] },
              }),
            ],
          },
        ]),
      ),
    ).toEqual([["unknown_condition_key", "q:V.02.RED_1"]]);
  });

  test("copy_from_mismatch: a plan sub-item must hold what the draft copies", () => {
    const table = (keys: readonly string[]) => ({
      answerType: "table" as const,
      options: {
        kind: "table",
        columns: keys.map((key) => ({ key, label: key, type: "text" })),
      },
    });
    const fits: Partial<Question>[] = [
      { copyFrom: ["V.01.WHO", "IDEA.ONE_LINE_CONCEPT"] },
      {
        ...table(PLAN_LIST_COLUMNS["LIST.ASSUMPTIONS"]),
        copyFrom: ["LIST.ASSUMPTIONS"],
      },
      {
        ...table([...PLAN_LIST_COLUMNS["LIST.RISKS"], "owner"]),
        copyFrom: ["LIST.RISKS"],
      },
    ];
    const mismatched: Partial<Question>[] = [
      { ...table(["name"]), copyFrom: ["V.01.WHO"] },
      { copyFrom: ["LIST.RISKS"] },
      { ...table(["risk", "probability"]), copyFrom: ["LIST.RISKS"] },
      {
        ...table(PLAN_LIST_COLUMNS["LIST.RISKS"]),
        copyFrom: ["LIST.RISKS", "V.01.WHO"],
      },
      {
        answerType: "choice",
        options: { kind: "choice", choices: ["A"] },
        copyFrom: ["V.02.OCEAN"],
      },
      { copyFrom: [] },
    ];
    const check = (extra: Partial<Question>) =>
      codes(
        content("business_plan", [
          { id: "s1", key: "01", part: "a", questions: [q("P.01.1", extra)] },
        ]),
      );
    for (const extra of fits) expect(check(extra)).toEqual([]);
    for (const extra of mismatched)
      expect(check(extra)).toEqual([["copy_from_mismatch", "q:P.01.1"]]);
  });

  test("removed_keys warns about the previous version's IDs only", () => {
    const sections = [
      {
        id: "s1",
        key: "WHY",
        part: null,
        questions: [q("SA.WHY.1"), q("SA.WHY.3")],
      },
    ];
    expect(
      checkTemplateContent(
        content("self_analysis", sections, ["SA.WHY.1", "SA.WHY.2"]),
      ).warnings,
    ).toEqual([{ code: "removed_keys", keys: ["SA.WHY.2"] }]);
    expect(
      checkTemplateContent(content("self_analysis", sections, ["SA.WHY.1"]))
        .warnings,
    ).toEqual([]);
  });
});
