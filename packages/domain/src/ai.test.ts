import { describe, expect, test } from "bun:test";
import { i18n } from "@moonx/i18n";
import type {
  MetricValue,
  PlanTableRow,
  TemplateQuestion,
  TemplateSection,
} from "@moonx/schemas";
import {
  type AiAnswerInput,
  type AiExportInput,
  buildAiExport,
  isImportable,
  scopeSections,
} from "./ai-export";
import {
  type ImportTarget,
  matchBlocks,
  parseAiReply,
  readAmount,
  readChoice,
  readImportedAnswer,
} from "./ai-import";
import { KEY_METRIC_KEYS } from "./economics";

// The AI round trip's formats (design-spec 6.6・6.7): the examples of the spec as fixed
// tests, then the rules of reading a reply back.

const question = (
  key: string,
  overrides: Partial<TemplateQuestion> = {},
): TemplateQuestion => ({
  key,
  sectionKey: key.split(".")[1] ?? "",
  title: key.split(".")[2] ?? key,
  prompt: `${key}?`,
  example: null,
  hint: null,
  answerType: "long_text",
  options: null,
  displayCondition: null,
  hasFau: false,
  ...overrides,
});

const section = (
  key: string,
  questions: TemplateQuestion[],
  part: "a" | "b" | null = null,
): TemplateSection => ({
  key,
  part,
  title: key,
  subtitle: null,
  guidance: null,
  questions,
});

const exact = (value: number): MetricValue => ({
  value,
  bound: "exact",
  reason: null,
});

/** 01 and 02 of a validation, as design-spec 6.6's example shows them. */
const VALIDATION: TemplateSection[] = [
  section("01", [
    question("V.01.WHO", {
      title: "WHO",
      prompt: "Who exactly is the customer?",
      example: "Office workers in Bacolod who …",
      hasFau: true,
    }),
    question("V.01.WHY_THEM", {
      title: "WHY THEM",
      prompt: "Why them?",
      hasFau: true,
    }),
  ]),
  section("02", [
    question("V.02.OCEAN", {
      title: "OCEAN",
      prompt: "Red, Blue, or Mixed?",
      answerType: "choice",
      options: { kind: "choice", choices: ["Red", "Blue", "Mixed"] },
      hasFau: true,
    }),
    question("V.02.RED_1", {
      hasFau: true,
      displayCondition: { "V.02.OCEAN": ["Red", "Mixed"] },
    }),
    question("V.02.BLUE_1", {
      hasFau: true,
      displayCondition: { "V.02.OCEAN": ["Blue", "Mixed"] },
    }),
  ]),
];

const WHO: AiAnswerInput = {
  text: "HR teams of BPO companies in Bacolod that buy gifts for clients …",
  amount: null,
  fau: { fau: "assumption", confidence: "medium", state: "assumption" },
  evidence: [
    {
      type: "research_log",
      date: "2026-09-12",
      topic: "Store observation: …",
    },
    { type: "url", url: "https://…", note: null },
  ],
};

const validationInput = (
  overrides: Partial<AiExportInput> = {},
): AiExportInput => ({
  kind: "validation",
  sections: VALIDATION,
  scope: { kind: "sections", keys: ["01"] },
  answers: new Map([["V.01.WHO", WHO]]),
  prompt: "",
  templateVersion: 1,
  currency: "PHP",
  ideaName: "Piaya Gift Box Delivery",
  planName: null,
  ownerName: null,
  exportedAt: new Date("2026-10-01T02:00:00.000Z"),
  timeZone: "Asia/Manila",
  includeEmpty: true,
  includeExamples: true,
  reference: null,
  ...overrides,
});

/** Runs `scopeSections` and `buildAiExport` as X1 does, for a scope that must pass. */
const exportOf = (input: AiExportInput) => {
  const scoped = scopeSections(input.kind, input.sections, input.scope);
  if (!("sections" in scoped)) throw new Error("The scope was refused");
  return buildAiExport(input, scoped.sections);
};

const SPEC_MARKDOWN = `<!-- moonx-export v1 | kind: validation | scope: 01 | idea: Piaya Gift Box Delivery | exported: 2026-10-01T10:00+08:00 -->

# Questions

## [V.01.WHO] WHO

**Question:** Who exactly is the customer?

**Example:** Office workers in Bacolod who …

**Current answer:**

> HR teams of BPO companies in Bacolod that buy gifts for clients …

**F/A/U:** Assumption (Medium)

**Evidence:** Research log 2026-09-12 "Store observation: …"; https://…

## [V.01.WHY_THEM] WHY THEM

**Question:** Why them?

**Current answer:**

> (empty)

# How to reply

Reply in Markdown. For each question you want to update, write one block:

## [V.01.WHO]
<the final answer, in the same language I used>

- Use the exact IDs in square brackets.
- Only include questions you are updating.
- Do not translate my answers. Do not add F/A/U labels.
`;

describe("the export (design-spec 6.6)", () => {
  test("writes the Markdown of the spec's example", () => {
    const result = exportOf(validationInput());
    expect(result.markdown).toBe(SPEC_MARKDOWN);
    expect(result.questionCount).toBe(2);
    expect(result.allEmpty).toBe(false);
    expect(result.fileBaseName).toBe(
      "moonx-export-validation-Piaya Gift Box Delivery-2026-10-01",
    );
  });

  test("writes the JSON of the spec's example", () => {
    const { json } = exportOf(validationInput());
    expect(json).toEqual({
      format: "moonx-export",
      version: 1,
      exportedAt: "2026-10-01T10:00:00+08:00",
      kind: "validation",
      scope: { ideaName: "Piaya Gift Box Delivery", sections: ["01"] },
      templateVersion: 1,
      currency: "PHP",
      questions: [
        {
          id: "V.01.WHO",
          section: "01",
          title: "WHO",
          question: "Who exactly is the customer?",
          example: "Office workers in Bacolod who …",
          hint: null,
          answerType: "long_text",
          answer: {
            text: WHO.text,
            fau: "assumption",
            confidence: "medium",
            evidence: [
              {
                type: "research_log",
                date: "2026-09-12",
                topic: "Store observation: …",
              },
              { type: "url", url: "https://…", note: null },
            ],
          },
        },
        {
          id: "V.01.WHY_THEM",
          section: "01",
          title: "WHY THEM",
          question: "Why them?",
          example: null,
          hint: null,
          answerType: "long_text",
          answer: { text: null, fau: null, confidence: null, evidence: [] },
        },
      ],
      reply: {
        instructions: i18n.t("ai:reply.json"),
        example: {
          format: "moonx-reply",
          version: 1,
          answers: [
            {
              id: "V.01.WHO",
              text: "<the final answer, in the same language I used>",
            },
          ],
        },
      },
    });
  });

  test("names every state of F/A/U and a URL's note", () => {
    const { markdown } = exportOf(
      validationInput({
        answers: new Map<string, AiAnswerInput>([
          [
            "V.01.WHO",
            {
              text: "Offices",
              amount: null,
              fau: { fau: "fact", confidence: null, state: "fact_no_evidence" },
              evidence: [
                { type: "research_log", date: null, topic: "Talks" },
                { type: "url", url: "https://example.com", note: "Survey" },
              ],
            },
          ],
          [
            "V.01.WHY_THEM",
            {
              text: null,
              amount: null,
              fau: { fau: "unknown", confidence: null, state: "unknown" },
            },
          ],
        ]),
      }),
    );
    expect(markdown).toContain("**F/A/U:** Fact · No evidence");
    expect(markdown).toContain(
      '**Evidence:** Research log "Talks"; https://example.com (Survey)',
    );
    expect(markdown).toContain("> (empty)\n\n**F/A/U:** Unknown");
  });

  test("leaves out questions OCEAN hides, and lists a choice's choices", () => {
    const { markdown, json } = exportOf(
      validationInput({
        scope: { kind: "sections", keys: ["02"] },
        answers: new Map([
          ["V.02.OCEAN", { text: "Blue", amount: null }],
          ["V.02.RED_1", { text: "Kept, but hidden", amount: null }],
        ]),
      }),
    );
    expect(json.questions.map((q) => q.id)).toEqual([
      "V.02.OCEAN",
      "V.02.BLUE_1",
    ]);
    expect(json.questions[0]?.choices).toEqual(["Red", "Blue", "Mixed"]);
    expect(markdown).toContain(
      "**Choices:** Red / Blue / Mixed\n\n**Current answer:**\n\n> Blue",
    );
    expect(markdown).not.toContain("Kept, but hidden");
  });

  test("leaves out empty questions and examples when asked to", () => {
    const result = exportOf(
      validationInput({ includeEmpty: false, includeExamples: false }),
    );
    expect(result.json.questions.map((q) => q.id)).toEqual(["V.01.WHO"]);
    expect(result.json.questions[0]?.example).toBeNull();
    expect(result.markdown).not.toContain("**Example:**");
    expect(result.markdown).not.toContain("WHY_THEM");
  });

  test("exports no question when all are empty and empty ones are left out", () => {
    const result = exportOf(
      validationInput({ answers: new Map(), includeEmpty: false }),
    );
    expect(result.questionCount).toBe(0);
    expect(result.allEmpty).toBe(true);
    expect(result.json.questions).toEqual([]);
    // How to reply still shows an ID of the scope.
    expect(result.markdown).toContain(
      "# Questions\n\n# How to reply\n\nReply in Markdown. For each question you want to update, write one block:\n\n## [V.01.WHO]",
    );
  });

  test("writes the whole of a quoted answer, a blank line as a bare >", () => {
    const { markdown } = exportOf(
      validationInput({
        answers: new Map([
          ["V.01.WHO", { text: "First line\n\n# Not a heading", amount: null }],
        ]),
      }),
    );
    expect(markdown).toContain("> First line\n>\n> # Not a heading");
  });

  test("escapes template text that would read as a heading or a fence", () => {
    const sections = [
      section("01", [
        question("V.01.WHO", {
          prompt: "Who?\n# Not a section\n## [V.01.X] Not a block",
          example: "```\nnot code\n### kept",
        }),
      ]),
    ];
    const { markdown } = exportOf(validationInput({ sections }));
    expect(markdown).toContain(
      "**Question:** Who?\n\\# Not a section\n\\## [V.01.X] Not a block",
    );
    expect(markdown).toContain("**Example:** \\```\nnot code\n### kept");
    const blocks = parseAiReply(markdown).blocks;
    expect(blocks.map((block) => block.id)).toEqual(["V.01.WHO"]);
  });

  test("writes the Reference of a validation as 13 shows it", () => {
    const metrics = Object.fromEntries(
      KEY_METRIC_KEYS.map((key) => [key, exact(10)]),
    );
    const { markdown, json } = exportOf(
      validationInput({
        reference: {
          kind: "validation",
          keyMetrics: { ...metrics, initial_cost_total: exact(85000) },
          checks: [
            {
              key: "competitors",
              state: "done",
              count: 3,
              params: { min: 3, max: 5 },
              detail: null,
              link: null,
            },
          ],
          competitors: [
            {
              name: "Bongbong's",
              type: "direct",
              typicalPrice: 350,
              priceNote: "per box",
              strength: "Known brand",
              weakness: null,
            },
            {
              name: "Market stalls",
              type: null,
              typicalPrice: null,
              priceNote: "varies by size",
              strength: null,
              weakness: null,
            },
          ],
          researchLog: [
            {
              observedOn: "2026-09-12",
              topic: "Prices on\nLacson St.",
              sourceType: "price_check",
              supportsChecks: ["local_price"],
            },
          ],
          assumptions: [{ statement: "Offices order", confidence: "medium" }],
          risks: [
            { statement: "Prices rise", probability: "low", impact: "high" },
          ],
        },
      }),
    );
    expect(json.reference?.keyNumbers.initial_cost_total).toEqual({
      label: "Startup cost",
      value: "₱85,000",
    });
    expect(markdown).toContain(
      [
        "# Reference (read-only)",
        "## Key numbers",
        "- Startup cost: ₱85,000",
      ].join("\n\n"),
    );
    expect(markdown).toContain("## Checks\n\n- Competitors (3–5): Done");
    expect(markdown).toContain(
      "## Competitors\n\n- Bongbong's · Direct Competitor · ₱350 per box · Strength: Known brand\n- Market stalls · varies by size",
    );
    expect(markdown).toContain(
      "## Research log\n\n- 2026-09-12 · Price Check · Prices on Lacson St. · Local price",
    );
    expect(markdown).toContain(
      "## Assumptions\n\n- Offices order · Confidence: Medium",
    );
    expect(markdown).toContain(
      "## Risks\n\n- Prices rise · Probability: Low · Impact: High",
    );
    expect(markdown.indexOf("# Reference")).toBeLessThan(
      markdown.indexOf("# How to reply"),
    );
  });

  test("writes evidence on one line, whatever its texts hold", () => {
    const { markdown } = exportOf(
      validationInput({
        answers: new Map<string, AiAnswerInput>([
          [
            "V.01.WHO",
            {
              ...WHO,
              evidence: [
                {
                  type: "url",
                  url: "https://example.com",
                  note: "a note\n# Reference (read-only)\nhidden",
                },
              ],
            },
          ],
        ]),
      }),
    );
    expect(markdown).toContain(
      "**Evidence:** https://example.com (a note # Reference (read-only) hidden)",
    );
    expect(parseAiReply(markdown).blocks.map((block) => block.id)).toEqual([
      "V.01.WHO",
      "V.01.WHY_THEM",
    ]);
  });

  test("reads back an answer exactly as it is stored", () => {
    const text = "\nLine one\n\n   \nLine two\n";
    const { markdown, json } = exportOf(
      validationInput({
        answers: new Map([["V.01.WHO", { text, amount: null }]]),
      }),
    );
    expect(markdown).toContain(
      "**Current answer:**\n\n>\n> Line one\n>\n>    \n> Line two\n>\n\n## [V.01.WHY_THEM]",
    );
    for (const pasted of [markdown, JSON.stringify(json)]) {
      const [block] = parseAiReply(pasted).blocks;
      expect(block?.body).toMatchObject({ text });
    }
  });

  test("imports amounts only into a self-analysis, whose answers hold them", () => {
    const amount = question("SA.INCOME.1", {
      answerType: "amount_with_reason",
    });
    expect(isImportable(amount, "self_analysis")).toBe(true);
    expect(isImportable(amount, "validation")).toBe(false);
    expect(isImportable(amount, "business_plan")).toBe(false);
    expect(
      isImportable(
        question("P.11.1", { answerType: "table" }),
        "business_plan",
      ),
    ).toBe(false);
    expect(
      scopeSections("validation", [section("99", [amount])], { kind: "all" }),
    ).toEqual({ problem: { kind: "empty" } });
  });

  test("labels every key metric", () => {
    for (const key of KEY_METRIC_KEYS) {
      expect(i18n.exists(`common:metric.${key}`)).toBe(true);
    }
  });
});

describe("the export of a self-analysis", () => {
  const SECTIONS = [
    section("WHY", [question("SA.WHY.1", { title: "Q1" })]),
    section("INCOME", [
      question("SA.INCOME.1", {
        title: "Q15",
        answerType: "amount_with_reason",
      }),
      question("SA.INCOME.2", {
        title: "Q16",
        answerType: "amount_with_reason",
      }),
      question("SA.INCOME.3", {
        title: "Q17",
        answerType: "amount_with_reason",
      }),
    ]),
  ];
  const input = (overrides: Partial<AiExportInput> = {}): AiExportInput =>
    validationInput({
      kind: "self_analysis",
      sections: SECTIONS,
      scope: { kind: "all" },
      answers: new Map([
        ["SA.WHY.1", { text: "To stay", amount: null }],
        ["SA.INCOME.1", { text: "Rent and food", amount: 30000.5 }],
        ["SA.INCOME.2", { text: null, amount: 60000 }],
      ]),
      prompt: "Guide me.\n### One question at a time",
      ideaName: null,
      ownerName: "Ana Reyes",
      ...overrides,
    });

  test("puts the template's prompt first and names no idea", () => {
    const { markdown, json, fileBaseName } = exportOf(input());
    expect(markdown).toStartWith(
      "<!-- moonx-export v1 | kind: self_analysis | scope: all | exported: 2026-10-01T10:00+08:00 -->\n\n# Prompt\n\nGuide me.\n### One question at a time\n\n# Questions",
    );
    expect(json.prompt).toBe("Guide me.\n### One question at a time");
    expect(json.scope).toEqual({ sections: null });
    expect(fileBaseName).toBe(
      "moonx-export-self_analysis-Ana Reyes-2026-10-01",
    );
  });

  test("has no Prompt when the template's is blank", () => {
    const { markdown, json } = exportOf(input({ prompt: " \n " }));
    expect(markdown).not.toContain("# Prompt");
    expect(json).not.toHaveProperty("prompt");
  });

  test("writes amounts under their two headings, inside the quote", () => {
    const { markdown, json } = exportOf(input());
    expect(markdown).toContain(
      [
        "## [SA.INCOME.1] Q15",
        "",
        "**Question:** SA.INCOME.1?",
        "",
        "**Current answer:**",
        "",
        "> ### Amount",
        ">",
        "> ₱30,000.50",
        ">",
        "> ### Why this amount?",
        ">",
        "> Rent and food",
      ].join("\n"),
    );
    expect(markdown).toContain(
      "> ### Amount\n>\n> ₱60,000\n>\n> ### Why this amount?\n>\n> (empty)",
    );
    expect(markdown).toContain(
      "## [SA.INCOME.3] Q17\n\n**Question:** SA.INCOME.3?\n\n**Current answer:**\n\n> (empty)",
    );
    expect(json.questions[1]?.answer).toEqual({
      amount: 30000.5,
      reason: "Rent and food",
    });
    expect(json.questions[0]?.answer).toEqual({ text: "To stay" });
  });

  test("tells the AI how to answer amounts", () => {
    const { markdown, json } = exportOf(input());
    expect(markdown).toContain(
      '- For amount questions (SA.INCOME.*), use "### Amount" and "### Why this amount?" under the heading.',
    );
    expect(json.reply.example.answers).toEqual([
      {
        id: "SA.WHY.1",
        text: "<the final answer, in the same language I used>",
      },
      {
        id: "SA.INCOME.1",
        amount: 30000.5,
        reason: "<why this amount, in the same language I used>",
      },
    ]);
    expect(json.reply.instructions).toContain("(SA.INCOME.*)");
  });

  test("exports sections in template order whatever order they are asked in", () => {
    const { json, markdown } = exportOf(
      input({ scope: { kind: "sections", keys: ["INCOME", "WHY"] } }),
    );
    expect(json.scope).toEqual({ sections: ["WHY", "INCOME"] });
    expect(markdown).toContain("scope: WHY,INCOME");
  });
});

describe("the export of a plan", () => {
  const SECTIONS = [
    section(
      "01",
      [
        question("P.01.1", { title: "What is the business?" }),
        question("P.01.7", {
          answerType: "linked_metric",
          options: { kind: "linked_metric", metricKeys: ["selling_price"] },
        }),
      ],
      "a",
    ),
    section(
      "11",
      [
        question("P.11.1", {
          title: "Founders",
          answerType: "table",
          options: {
            kind: "table",
            columns: [
              { key: "name", label: "Name", type: "text" },
              { key: "share", label: "Share", type: "percent" },
              { key: "capital", label: "Capital", type: "money" },
            ],
          },
        }),
        question("P.11.2", { title: "Who decides?" }),
      ],
      "b",
    ),
    section(
      "23",
      [
        question("P.23.1", {
          answerType: "execution_view",
          options: { kind: "execution_view", executionType: "milestone" },
        }),
      ],
      "b",
    ),
  ];
  const input = (overrides: Partial<AiExportInput> = {}): AiExportInput =>
    validationInput({
      kind: "business_plan",
      sections: SECTIONS,
      scope: { kind: "items", itemNos: [11, 1] },
      answers: new Map([["P.01.1", { text: "Gift boxes", amount: null }]]),
      ideaName: "Piaya: Gifts",
      planName: "Plan A",
      reference: {
        kind: "business_plan",
        keyMetrics: Object.fromEntries(
          KEY_METRIC_KEYS.map((key) => [key, exact(1)]),
        ),
        tables: new Map<string, PlanTableRow[]>([
          [
            "P.11.1",
            [{ name: "Ana | CEO", share: 0.6, capital: 50000.25 }, {}],
          ],
        ]),
      },
      ...overrides,
    });

  test("exports the text sub-items of the items, the tables only as Reference", () => {
    const { markdown, json, fileBaseName } = exportOf(input());
    expect(json.questions.map((q) => q.id)).toEqual(["P.01.1", "P.11.2"]);
    expect(json.scope).toEqual({
      planName: "Plan A",
      items: [1, 11],
      part: null,
    });
    expect(markdown).toStartWith(
      "<!-- moonx-export v1 | kind: business_plan | scope: 01,11 | idea: Piaya: Gifts / Plan A |",
    );
    expect(json.reference?.tables).toEqual([
      {
        id: "P.11.1",
        title: "Founders",
        columns: ["Name", "Share", "Capital"],
        rows: [
          ["Ana | CEO", "60%", "₱50,000.25"],
          [null, null, null],
        ],
      },
    ]);
    expect(markdown).toContain(
      "## P.11.1 Founders\n\n| Name | Share | Capital |\n| --- | --- | --- |\n| Ana \\| CEO | 60% | ₱50,000.25 |\n|  |  |  |",
    );
    expect(fileBaseName).toBe(
      "moonx-export-business_plan-Piaya- Gifts - Plan A-2026-10-01",
    );
  });

  test("leaves a table without rows out of the Markdown, not out of the JSON", () => {
    const { markdown, json } = exportOf(
      input({
        reference: {
          kind: "business_plan",
          keyMetrics: Object.fromEntries(
            KEY_METRIC_KEYS.map((key) => [key, exact(1)]),
          ),
          tables: new Map(),
        },
      }),
    );
    expect(markdown).not.toContain("## P.11.1");
    expect(json.reference?.tables?.[0]?.rows).toEqual([]);
  });

  test("covers a part, or the whole plan", () => {
    expect(
      exportOf(input({ scope: { kind: "part", part: "a" } })).json.scope,
    ).toEqual({
      planName: "Plan A",
      items: null,
      part: "a",
    });
    const whole = exportOf(input({ scope: { kind: "all" } }));
    expect(whole.markdown).toContain("| scope: all |");
    expect(whole.json.questions.map((q) => q.id)).toEqual(["P.01.1", "P.11.2"]);
  });

  test("refuses a scope the template lacks, or with nothing to import", () => {
    expect(
      scopeSections("business_plan", SECTIONS, { kind: "items", itemNos: [2] }),
    ).toEqual({
      problem: { kind: "unknown", key: "2" },
    });
    expect(
      scopeSections("business_plan", SECTIONS, {
        kind: "items",
        itemNos: [23],
      }),
    ).toEqual({
      problem: { kind: "empty" },
    });
    expect(
      scopeSections("validation", VALIDATION, { kind: "sections", keys: [] }),
    ).toEqual({
      problem: { kind: "empty" },
    });
    expect(
      scopeSections("validation", VALIDATION, {
        kind: "sections",
        keys: ["03"],
      }),
    ).toEqual({ problem: { kind: "unknown", key: "03" } });
  });
});

// ---- Import ----

const TARGET: ImportTarget = {
  currency: "PHP",
  sections: [
    { key: "01", part: null },
    { key: "02", part: null },
  ],
  questions: [
    ...VALIDATION.flatMap((s) => s.questions).map((q) => ({
      questionKey: q.key,
      sectionKey: q.sectionKey,
      answerType: q.answerType,
      options: q.options,
      importable: true,
      hidden: q.key === "V.02.BLUE_1",
    })),
    {
      questionKey: "SA.INCOME.1",
      sectionKey: "INCOME",
      answerType: "amount_with_reason",
      options: null,
      importable: true,
      hidden: false,
    },
    {
      questionKey: "P.11.1",
      sectionKey: "11",
      answerType: "table",
      options: null,
      importable: false,
      hidden: false,
    },
  ],
};

const ALL = { kind: "all" } as const;

describe("reading a reply (design-spec 6.7 ①)", () => {
  test("reads the reply the export asks for", () => {
    const reply = parseAiReply(
      "## [V.01.WHO]\nHR and admin teams of BPO offices.\n\n## [V.01.WHY_THEM]\nThey buy every month.\n",
    );
    expect(reply).toEqual({
      format: "markdown",
      blocks: [
        {
          id: "V.01.WHO",
          body: {
            kind: "markdown",
            text: "HR and admin teams of BPO offices.",
          },
        },
        {
          id: "V.01.WHY_THEM",
          body: { kind: "markdown", text: "They buy every month." },
        },
      ],
    });
  });

  test("keeps text before the first heading, `## []` and other headings apart", () => {
    const reply = parseAiReply(
      [
        "Here is your update.",
        "## [v.01.who] WHO",
        "Offices.",
        "## Details",
        "More about offices.",
        "## [] Segments",
        "Customer segments.",
        "# Summary",
        "All done.",
      ].join("\n"),
    );
    expect(reply.blocks).toEqual([
      { id: null, body: { kind: "markdown", text: "Here is your update." } },
      {
        id: "V.01.WHO",
        body: {
          kind: "markdown",
          text: "Offices.\n## Details\nMore about offices.",
        },
      },
      { id: null, body: { kind: "markdown", text: "Customer segments." } },
      { id: null, body: { kind: "markdown", text: "# Summary\nAll done." } },
    ]);
  });

  test("reads headings inside a code fence as text", () => {
    const reply = parseAiReply(
      "## [V.01.WHO]\n```\n## [V.01.WHY_THEM]\n# Questions\n```\nAfter",
    );
    expect(reply.blocks).toEqual([
      {
        id: "V.01.WHO",
        body: {
          kind: "markdown",
          text: "```\n## [V.01.WHY_THEM]\n# Questions\n```\nAfter",
        },
      },
    ]);
  });

  test("reads an export pasted back as it is: answers only, (empty) as no answer", () => {
    const { markdown } = exportOf(
      validationInput({
        reference: {
          kind: "business_plan",
          keyMetrics: Object.fromEntries(
            KEY_METRIC_KEYS.map((key) => [key, exact(1)]),
          ),
          tables: new Map(),
        },
      }),
    );
    const reply = parseAiReply(`\n  \n${markdown}`);
    expect(reply.blocks).toEqual([
      { id: "V.01.WHO", body: { kind: "markdown", text: WHO.text as string } },
      { id: "V.01.WHY_THEM", body: { kind: "markdown", text: "(empty)" } },
    ]);
    // The spec's example goes through whole: every block with an answer is matched.
    expect(
      matchBlocks(reply, TARGET, { kind: "sections", keys: ["01"] }),
    ).toEqual([
      {
        index: 0,
        id: "V.01.WHO",
        status: "matched",
        questionKey: "V.01.WHO",
        answer: { text: WHO.text },
        body: { kind: "markdown", text: WHO.text as string },
      },
    ]);
  });

  test("reads amounts pasted back from a self-analysis export", () => {
    const sections = [
      section("INCOME", [
        question("SA.INCOME.1", { answerType: "amount_with_reason" }),
      ]),
    ];
    const { markdown, json } = exportOf(
      validationInput({
        kind: "self_analysis",
        sections,
        scope: { kind: "all" },
        answers: new Map([
          ["SA.INCOME.1", { text: "Rent\n\nand food", amount: 30000.5 }],
        ]),
      }),
    );
    for (const pasted of [markdown, JSON.stringify(json)]) {
      const [block] = parseAiReply(pasted).blocks;
      expect(
        readImportedAnswer(
          block?.body ?? { kind: "markdown", text: "" },
          { answerType: "amount_with_reason", options: null },
          "PHP",
        ),
      ).toEqual({
        amount: { kind: "value", value: 30000.5 },
        text: "Rent\n\nand food",
      });
    }
  });

  test("reads JSON replies and exports, and other JSON as Markdown", () => {
    expect(
      parseAiReply(
        JSON.stringify({
          format: "moonx-reply",
          version: 1,
          answers: [
            { id: "V.01.WHO", text: "Offices" },
            { id: "SA.INCOME.1", amount: 30000, reason: "Rent" },
            { text: "No id" },
            "not an item",
          ],
        }),
      ),
    ).toEqual({
      format: "json",
      blocks: [
        { id: "V.01.WHO", body: { kind: "json", text: "Offices" } },
        {
          id: "SA.INCOME.1",
          body: { kind: "json", amount: 30000, reason: "Rent" },
        },
        { id: null, body: { kind: "json", text: "No id" } },
      ],
    });
    expect(parseAiReply('{"answers": []}')).toEqual({
      format: "markdown",
      blocks: [
        { id: null, body: { kind: "markdown", text: '{"answers": []}' } },
      ],
    });
  });

  test("reads an amount with or without its headings", () => {
    const read = (text: string) =>
      readImportedAnswer(
        { kind: "markdown", text },
        { answerType: "amount_with_reason", options: null },
        "PHP",
      );
    expect(read("### Amount\nPHP 45,000\n### Why this amount?\nRent")).toEqual({
      amount: { kind: "value", value: 45000 },
      text: "Rent",
    });
    // One heading changes only its part.
    expect(read("### Why this amount?\nRent")).toEqual({ text: "Rent" });
    expect(read("### Amount\n(empty)")).toEqual({ amount: { kind: "empty" } });
    // No heading: the first line is the amount, the rest the reason.
    expect(read("₱45,000\nRent\nand food")).toEqual({
      amount: { kind: "value", value: 45000 },
      text: "Rent\nand food",
    });
    expect(read("About 45k a month")).toEqual({
      amount: { kind: "unreadable", text: "About 45k a month" },
      text: null,
    });
    expect(
      read("### Amount\n(empty)\n### Why this amount?\n(empty)"),
    ).toBeNull();
    expect(read("(empty)")).toBeNull();
  });

  test("reads an amount's number and nothing else", () => {
    expect(readAmount("₱30,000.50", "PHP")).toEqual({
      kind: "value",
      value: 30000.5,
    });
    expect(readAmount("30000 php", "PHP")).toEqual({
      kind: "value",
      value: 30000,
    });
    expect(readAmount("$1,500", null)).toEqual({ kind: "value", value: 1500 });
    expect(readAmount("−₱500", "PHP")).toEqual({ kind: "value", value: -500 });
    expect(readAmount("1,5", "PHP")).toEqual({
      kind: "unreadable",
      text: "1,5",
    });
    // A symbol after the number, or inside it, is not taken for the currency.
    expect(readAmount("K30", "MMK")).toEqual({ kind: "value", value: 30 });
    expect(readAmount("30K", "MMK")).toEqual({
      kind: "unreadable",
      text: "30K",
    });
    expect(readAmount("3₱0", "PHP")).toEqual({
      kind: "unreadable",
      text: "3₱0",
    });
    expect(readAmount("₱-500", "PHP")).toEqual({ kind: "value", value: -500 });
    expect(readAmount("30k", "PHP")).toEqual({
      kind: "unreadable",
      text: "30k",
    });
  });

  test("reads JSON amounts as numbers or as text", () => {
    const read = (body: Record<string, unknown>) =>
      readImportedAnswer(
        { kind: "json", ...body },
        { answerType: "amount_with_reason", options: null },
        "PHP",
      );
    expect(read({ amount: "₱1,200", reason: "Rent" })).toEqual({
      amount: { kind: "value", value: 1200 },
      text: "Rent",
    });
    expect(read({ amount: null })).toEqual({ amount: { kind: "empty" } });
    expect(read({ amount: null, reason: " " })).toBeNull();
    expect(read({})).toBeNull();
    expect(read({ amount: true })).toEqual({
      amount: { kind: "unreadable", text: "true" },
    });
  });

  test("reads JSON texts as written, null and blanks as nothing", () => {
    const text = (body: Record<string, unknown>) =>
      readImportedAnswer(
        { kind: "json", ...body },
        { answerType: "long_text", options: null },
        null,
      );
    expect(text({ text: "(empty)" })).toEqual({ text: "(empty)" });
    expect(text({ text: 42 })).toEqual({ text: "42" });
    expect(text({ text: " " })).toBeNull();
    expect(text({ text: null })).toBeNull();
  });

  test("reads an amount's reason as written", () => {
    const read = (text: string) =>
      readImportedAnswer(
        { kind: "markdown", text },
        { answerType: "amount_with_reason", options: null },
        "PHP",
      );
    expect(read("### Amount\n\n₱1\n\n### Why this amount?\n\nRent\n")).toEqual({
      amount: { kind: "value", value: 1 },
      text: "Rent\n",
    });
    expect(read("### Why this amount?\nRent\n\n### Amount\n₱1")).toEqual({
      amount: { kind: "value", value: 1 },
      text: "Rent",
    });
  });

  test("reads a choice in any case", () => {
    expect(readChoice(" mixed ", ["Red", "Blue", "Mixed"])).toBe("Mixed");
    expect(readChoice("Purple", ["Red", "Blue", "Mixed"])).toBeNull();
    const ocean = VALIDATION[1]?.questions[0] as TemplateQuestion;
    expect(
      readImportedAnswer({ kind: "markdown", text: "blue" }, ocean, null),
    ).toEqual({ text: "Blue" });
    expect(
      readImportedAnswer({ kind: "json", text: "Purple" }, ocean, null),
    ).toEqual({ text: "Purple" });
  });
});

describe("matching blocks (design-spec 6.7 ②)", () => {
  const blocks = (markdown: string) => parseAiReply(markdown);

  test("names each block's state", () => {
    const matched = matchBlocks(
      blocks(
        [
          "Notes first.",
          "## [V.01.WHO]",
          "Offices.",
          "## [V.09.NOPE]",
          "Unknown.",
          "## [P.11.1]",
          "| Ana | CEO |",
          "## [V.02.BLUE_1]",
          "Blue ocean.",
          "## [V.02.OCEAN]",
          "red",
          "## [V.02.OCEAN]",
          "Mixed",
          "## [V.01.WHY_THEM]",
          "(empty)",
        ].join("\n"),
      ),
      TARGET,
      ALL,
    );
    expect(
      matched.map(({ index, id, status, questionKey, answer }) => ({
        index,
        id,
        status,
        questionKey,
        answer,
      })),
    ).toEqual([
      {
        index: 0,
        id: null,
        status: "unmatched",
        questionKey: null,
        answer: null,
      },
      {
        index: 1,
        id: "V.01.WHO",
        status: "matched",
        questionKey: "V.01.WHO",
        answer: { text: "Offices." },
      },
      {
        index: 2,
        id: "V.09.NOPE",
        status: "unmatched",
        questionKey: null,
        answer: null,
      },
      {
        index: 3,
        id: "P.11.1",
        status: "not_importable",
        questionKey: "P.11.1",
        answer: null,
      },
      {
        index: 4,
        id: "V.02.BLUE_1",
        status: "hidden",
        questionKey: "V.02.BLUE_1",
        answer: { text: "Blue ocean." },
      },
      {
        index: 5,
        id: "V.02.OCEAN",
        status: "duplicate",
        questionKey: "V.02.OCEAN",
        answer: { text: "Red" },
      },
      {
        index: 6,
        id: "V.02.OCEAN",
        status: "duplicate",
        questionKey: "V.02.OCEAN",
        answer: { text: "Mixed" },
      },
    ]);
  });

  test("leaves blocks outside the scope unmatched", () => {
    const reply = blocks("## [V.01.WHO]\nOffices.\n## [V.02.OCEAN]\nRed");
    expect(
      matchBlocks(reply, TARGET, { kind: "sections", keys: ["02"] }).map(
        (block) => block.status,
      ),
    ).toEqual(["unmatched", "matched"]);
    const plan: ImportTarget = {
      currency: null,
      sections: [
        { key: "01", part: "a" },
        { key: "11", part: "b" },
      ],
      questions: [
        {
          questionKey: "P.01.1",
          sectionKey: "01",
          answerType: "long_text",
          options: null,
          importable: true,
          hidden: false,
        },
        {
          questionKey: "P.11.2",
          sectionKey: "11",
          answerType: "long_text",
          options: null,
          importable: true,
          hidden: false,
        },
      ],
    };
    const planReply = blocks("## [P.01.1]\nGifts\n## [P.11.2]\nAna decides");
    expect(
      matchBlocks(planReply, plan, { kind: "part", part: "b" }).map(
        (block) => block.status,
      ),
    ).toEqual(["unmatched", "matched"]);
    expect(
      matchBlocks(planReply, plan, { kind: "items", itemNos: [1] }).map(
        (block) => block.status,
      ),
    ).toEqual(["matched", "unmatched"]);
  });

  test("shows a JSON item whose text is in a field its question does not read", () => {
    const reply = parseAiReply(
      JSON.stringify({
        format: "moonx-reply",
        version: 1,
        answers: [
          { id: "SA.INCOME.1", text: "PHP 30,000 because of rent" },
          { id: "V.01.WHO", reason: "Offices" },
          { id: "SA.INCOME.1", amount: null, reason: null },
        ],
      }),
    );
    expect(
      matchBlocks(reply, TARGET, ALL).map((block) => [block.id, block.status]),
    ).toEqual([
      ["SA.INCOME.1", "unmatched"],
      ["V.01.WHO", "unmatched"],
    ]);
  });

  test("leaves out blocks with nothing to write", () => {
    const reply = parseAiReply(
      JSON.stringify({
        format: "moonx-reply",
        version: 1,
        answers: [
          { id: "V.01.WHO", text: null },
          { id: "V.01.WHY_THEM", text: "   " },
          { id: "SA.INCOME.1", amount: null, reason: null },
          { id: "V.09.NOPE", text: null },
        ],
      }),
    );
    expect(matchBlocks(reply, TARGET, ALL)).toEqual([]);
  });
});
