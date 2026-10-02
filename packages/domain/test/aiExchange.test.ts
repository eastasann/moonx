import { describe, expect, test } from "bun:test";
import {
  type BuildExportInput,
  buildExport,
  type ExportQuestion,
  exportFileBaseName,
  type MatchTarget,
  matchBlocks,
  parseAiReply,
  parseAmount,
  parseChoice,
  type ReplyBlock,
} from "../src";

const base: Omit<BuildExportInput, "kind" | "questions"> = {
  scopeLabel: "01",
  scope: { ideaName: "Piaya Gift Box Delivery", sections: ["01"] },
  subjectName: "Piaya Gift Box Delivery",
  exportedAt: "2026-10-01T10:00:00+08:00",
  templateVersion: 1,
  currency: "PHP",
  prompt: "Let's talk.",
  includeExamples: true,
  reference: null,
};

const who: ExportQuestion = {
  id: "V.01.WHO",
  section: "01",
  sectionTitle: "Customer & Problem",
  title: "WHO",
  question: "Who exactly is the customer?",
  example: "Office workers in Bacolod",
  hint: "Be specific",
  answerType: "long_text",
  answer: {
    text: "HR teams of BPO companies\n\nin Bacolod",
    fau: "assumption",
    confidence: "medium",
    evidence: [
      { type: "research_log", date: "2026-09-12", topic: "Store observation" },
      { type: "url", url: "https://example.com" },
    ],
  },
};
const empty: ExportQuestion = {
  ...who,
  id: "V.01.PROBLEM",
  title: "PROBLEM",
  answer: { text: null },
};
const ocean: ExportQuestion = {
  ...who,
  id: "V.02.OCEAN",
  title: "OCEAN",
  answerType: "choice",
  options: { kind: "choice", choices: ["Red", "Blue", "Mixed"] },
  answer: { text: "Mixed", fau: null },
};
const income: ExportQuestion = {
  ...who,
  id: "SA.INCOME.1",
  title: "Income",
  answerType: "amount_with_reason",
  answer: { text: "Enough to live", amount: 30000 },
};

describe("buildExport markdown", () => {
  test("validation: header, F/A/U, evidence, empty, how to reply", () => {
    const r = buildExport({ ...base, kind: "validation", questions: [who, empty] });
    const md = r.markdown;
    expect(
      md.startsWith(
        "<!-- moonx-export v1 | kind: validation | scope: 01 | idea: Piaya Gift Box Delivery | exported: 2026-10-01T10:00:00+08:00 -->",
      ),
    ).toBe(true);
    expect(md).toContain("# Prompt\n\nLet's talk.");
    expect(md).toContain("## [V.01.WHO] WHO");
    expect(md).toContain("**Example:** Office workers in Bacolod");
    expect(md).toContain("> HR teams of BPO companies\n>\n> in Bacolod");
    expect(md).toContain("**F/A/U:** Assumption (Medium)");
    expect(md).toContain(
      '**Evidence:** Research log 2026-09-12 "Store observation"; https://example.com',
    );
    expect(md).toContain("**Current answer:**\n\n> (empty)");
    expect(md).toContain("# How to reply");
    expect(md).toContain("## [V.01.WHO]\n<the final answer");
    expect(md).not.toContain("### Amount");
    expect(r.questionCount).toBe(2);
    expect(r.allEmpty).toBe(false);
  });

  test("self analysis and plan omit F/A/U and evidence; examples can be left out", () => {
    for (const kind of ["self_analysis", "business_plan"] as const) {
      const r = buildExport({ ...base, kind, includeExamples: false, questions: [who] });
      expect(r.markdown).not.toContain("F/A/U:**");
      expect(r.markdown).not.toContain("**Evidence:**");
      expect(r.markdown).not.toContain("**Example:**");
      const q = (r.json.questions as Record<string, unknown>[])[0] as Record<string, unknown>;
      expect(q.example).toBeNull();
      expect(q.answer).toEqual({ text: who.answer.text });
    }
  });

  test("amount questions print amount and reason and mention the amount headings", () => {
    const r = buildExport({ ...base, kind: "self_analysis", questions: [income] });
    expect(r.markdown).toContain("> Amount: 30,000 PHP\n>\n> Reason: Enough to live");
    expect(r.markdown).toContain('"### Amount" and "### Why this amount?"');
    expect(r.markdown).toContain("SA.INCOME.1");
  });

  test("choices, reference and header sanitising", () => {
    const r = buildExport({
      ...base,
      kind: "validation",
      subjectName: "a --> b",
      reference: { markdown: "## Key numbers\n- x", json: { keyNumbers: {} } },
      questions: [ocean],
    });
    expect(r.markdown).toContain("**Choices:** Red / Blue / Mixed");
    expect(r.markdown).toContain("idea: a -> b");
    expect(r.markdown).toContain("# Reference (read-only)\n\n## Key numbers");
    expect(r.json.reference).toEqual({ keyNumbers: {} });
  });

  test("all empty and no questions", () => {
    expect(buildExport({ ...base, kind: "validation", questions: [empty] }).allEmpty).toBe(true);
    expect(buildExport({ ...base, kind: "validation", questions: [] }).allEmpty).toBe(false);
  });
});

describe("buildExport json", () => {
  test("validation structure", () => {
    const r = buildExport({ ...base, kind: "validation", questions: [who, income] });
    const j = r.json as Record<string, unknown> & { questions: Record<string, unknown>[] };
    expect(j.format).toBe("moonx-export");
    expect(j.version).toBe(1);
    expect(j.kind).toBe("validation");
    expect(j.scope).toEqual(base.scope);
    expect(j.questions[0]?.answer).toEqual({
      text: who.answer.text,
      fau: "assumption",
      confidence: "medium",
      evidence: who.answer.evidence,
    });
    expect(j.questions[1]?.answer).toMatchObject({ amount: 30000 });
    const reply = j.reply as {
      instructions: string;
      example: { format: string; answers: unknown[] };
    };
    expect(reply.example.format).toBe("moonx-reply");
    expect(reply.example.answers).toHaveLength(2);
    expect(reply.instructions).toContain("SA.INCOME.1");
    expect(JSON.parse(JSON.stringify(j))).toEqual(j);
  });
});

describe("exportFileBaseName", () => {
  test("slug and date", () => {
    expect(exportFileBaseName("validation", "Piaya Gift Box", "2026-10-01T10:00:00+08:00")).toBe(
      "moonx-export-validation-piaya-gift-box-2026-10-01",
    );
    expect(exportFileBaseName("business_plan", "Café Ñandú!", "2026-10-01T23:00:00-05:00")).toBe(
      "moonx-export-business-plan-cafe-nandu-2026-10-01",
    );
  });
  test("falls back to the kind", () => {
    expect(exportFileBaseName("self_analysis", null, "2026-10-01T10:00:00+08:00")).toBe(
      "moonx-export-self-analysis-2026-10-01",
    );
    expect(exportFileBaseName("validation", "ピアヤ", "2026-10-01T10:00:00+08:00")).toBe(
      "moonx-export-validation-2026-10-01",
    );
  });
});

const view = (blocks: ReplyBlock[]) =>
  blocks.map((b) => ({ id: b.id, text: b.text, reason: b.reason, amount: b.amount }));

describe("parseAiReply markdown", () => {
  test("splits blocks, keeps the preamble and `# ` headings as unmatched", () => {
    const r = parseAiReply(
      "Sure, here you go.\n\n## [V.01.WHO] WHO\nHR teams\n\n# Customer segments\nBPO\n\n# Other\nx\n## [v.01.problem]\nLate",
    );
    expect(r.format).toBe("markdown");
    expect(r.blocks.map((b) => [b.index, b.id, b.heading, b.text])).toEqual([
      [0, null, null, "Sure, here you go."],
      [1, "V.01.WHO", "WHO", "HR teams"],
      [2, null, "Customer segments", "BPO"],
      [3, null, "Other", "x"],
      [4, "v.01.problem", null, "Late"],
    ]);
  });

  test("a `##` sub-heading inside an answer does not split the block", () => {
    const r = parseAiReply(
      "## [V.01.WHO] WHO\nHR teams\n\n## Why them\nThey buy gifts\n\n### Detail\nmore\n\n## [V.01.PROBLEM] PROBLEM\nLate",
    );
    expect(r.blocks.map((b) => [b.id, b.text])).toEqual([
      ["V.01.WHO", "HR teams\n\n## Why them\nThey buy gifts\n\n### Detail\nmore"],
      ["V.01.PROBLEM", "Late"],
    ]);
  });

  test("a `##` heading before any ID heading stays in the preamble block", () => {
    const r = parseAiReply("## Notes\nhello\n## [V.01.WHO]\na");
    expect(r.blocks.map((b) => [b.id, b.text])).toEqual([
      [null, "## Notes\nhello"],
      ["V.01.WHO", "a"],
    ]);
  });

  test("a `# ` heading still ends an ID block, and a malformed `## [` heading ends it too", () => {
    const r = parseAiReply("## [V.01.WHO]\na\n## Sub\nb\n# Next\nc\n## [V.01.PROBLEM\nd");
    expect(r.blocks.map((b) => [b.id, b.heading, b.text])).toEqual([
      ["V.01.WHO", null, "a\n## Sub\nb"],
      [null, "Next", "c"],
      [null, null, "d"],
    ]);
  });

  test("a sub-heading in the reference section of a pasted export is skipped with the section", () => {
    const r = parseAiReply(
      "# Questions\n\n## [V.01.WHO] WHO\n\n**Current answer:**\n\n> HR\n> ## Why\n> teams\n\n# Reference (read-only)\n\n## Key numbers\n- x\n\n# How to reply\n\n## [V.01.WHO]\n<x>",
    );
    expect(r.blocks.map((b) => [b.id, b.text])).toEqual([["V.01.WHO", "HR\n## Why\nteams"]]);
  });

  test("CRLF and BOM", () => {
    const r = parseAiReply("﻿## [A.B.C] t\r\nline1\r\nline2\r\n");
    expect(r.blocks[0]?.text).toBe("line1\nline2");
  });

  test("code fences hide headings inside answers", () => {
    const r = parseAiReply("## [V.01.WHO]\nExample:\n```md\n## [V.01.PROBLEM]\nx\n```\nend");
    expect(r.blocks).toHaveLength(1);
    expect(r.blocks[0]?.text).toContain("## [V.01.PROBLEM]");
    expect(r.blocks[0]?.text?.endsWith("end")).toBe(true);
  });

  test("duplicate ids are kept as separate blocks; empty body gives null text", () => {
    const r = parseAiReply("## [V.01.WHO]\na\n## [V.01.WHO]\n");
    expect(view(r.blocks).map((b) => [b.id, b.text])).toEqual([
      ["V.01.WHO", "a"],
      ["V.01.WHO", null],
    ]);
  });

  test("amount sections", () => {
    const r = parseAiReply(
      "## [SA.INCOME.1]\n### Amount\n₱30,000\n### Why this amount?\nRent\nand food",
    );
    expect(view(r.blocks)).toEqual([
      { id: "SA.INCOME.1", text: null, amount: "₱30,000", reason: "Rent\nand food" },
    ]);
  });

  test("plain bodies keep blockquote marks", () => {
    const r = parseAiReply("## [V.01.WHO]\n> quoted by the user");
    expect(r.blocks[0]?.text).toBe("> quoted by the user");
  });

  test("nothing readable", () => {
    expect(parseAiReply("").blocks).toEqual([]);
    expect(parseAiReply("   \n\n").blocks).toEqual([]);
  });

  test("never throws on broken JSON", () => {
    const r = parseAiReply('{"format":"moonx-reply","answers":[');
    expect(r.format).toBe("markdown");
  });
});

describe("parseAiReply json", () => {
  test("moonx-reply", () => {
    const r = parseAiReply(
      JSON.stringify({
        format: "moonx-reply",
        version: 1,
        answers: [
          { id: "V.01.WHO", text: " HR " },
          { id: "SA.INCOME.1", amount: 30000, reason: "Rent" },
          { text: "no id" },
          "junk",
          { id: "V.02.OCEAN", text: "" },
        ],
      }),
    );
    expect(r.format).toBe("json");
    expect(view(r.blocks)).toEqual([
      { id: "V.01.WHO", text: "HR", reason: null, amount: null },
      { id: "SA.INCOME.1", text: null, reason: "Rent", amount: 30000 },
      { id: null, text: "no id", reason: null, amount: null },
      { id: "V.02.OCEAN", text: null, reason: null, amount: null },
    ]);
    expect(r.blocks.map((b) => b.index)).toEqual([0, 1, 2, 3]);
  });

  test("fenced JSON and other JSON", () => {
    const doc = JSON.stringify({ format: "moonx-reply", answers: [{ id: "A", text: "x" }] });
    expect(parseAiReply(`\`\`\`json\n${doc}\n\`\`\``).format).toBe("json");
    const other = parseAiReply('{"hello":1}');
    expect(other.format).toBe("markdown");
    expect(other.blocks).toHaveLength(1);
    expect(other.blocks[0]?.id).toBeNull();
  });
});

describe("round trips", () => {
  const questions = [who, empty, ocean, income];
  const exp = buildExport({ ...base, kind: "validation", questions });
  const reply = parseAiReply(
    JSON.stringify({
      format: "moonx-reply",
      version: 1,
      answers: [
        { id: "V.01.WHO", text: who.answer.text },
        { id: "V.02.OCEAN", text: "Mixed" },
        { id: "SA.INCOME.1", amount: 30000, reason: "Enough to live" },
      ],
    }),
  );

  test("moonx-export JSON equals the equivalent moonx-reply", () => {
    const fromExport = parseAiReply(JSON.stringify(exp.json));
    expect(fromExport.format).toBe("json");
    expect(view(fromExport.blocks)).toEqual(view(reply.blocks));
  });

  test("the exported Markdown pasted back reads the current answers", () => {
    const fromMd = parseAiReply(exp.markdown);
    expect(fromMd.blocks.map((b) => b.id)).toEqual([
      "V.01.WHO",
      "V.01.PROBLEM",
      "V.02.OCEAN",
      "SA.INCOME.1",
    ]);
    const [w, p, o, i] = fromMd.blocks;
    expect(w?.text).toBe(who.answer.text);
    expect(p?.text).toBeNull();
    expect(o?.text).toBe("Mixed");
    expect(parseAmount(i?.amount)).toBe(30000);
    expect(i?.reason).toBe("Enough to live");
    expect(fromMd.blocks.some((b) => b.text?.includes("How to reply"))).toBe(false);
  });

  test("answers rewritten into reply blocks match the moonx-reply", () => {
    const md = [
      "## [V.01.WHO] WHO",
      who.answer.text,
      "## [V.02.OCEAN] OCEAN",
      "Mixed",
      "## [SA.INCOME.1] Income",
      "### Amount",
      "30,000 PHP",
      "### Why this amount?",
      "Enough to live",
    ].join("\n");
    const blocks = parseAiReply(md).blocks;
    expect(blocks.map((b) => b.id)).toEqual(reply.blocks.map((b) => b.id));
    expect(blocks.map((b) => b.text)).toEqual(reply.blocks.map((b) => b.text));
    expect(blocks.map((b) => b.reason)).toEqual(reply.blocks.map((b) => b.reason));
    expect(blocks.map((b) => parseAmount(b.amount))).toEqual(
      reply.blocks.map((b) => parseAmount(b.amount)),
    );
  });
});

describe("matchBlocks", () => {
  const t = (key: string, o: Partial<MatchTarget> = {}): MatchTarget => ({
    key,
    title: key,
    sectionKey: "01",
    answerType: "long_text",
    importable: true,
    hidden: false,
    inScope: true,
    ...o,
  });
  const targets = [
    t("V.01.WHO"),
    t("V.01.PROBLEM"),
    t("P.11.1", { importable: false }),
    t("V.02.RED_1", { hidden: true }),
    t("V.10.WHY_WORK", { inScope: false }),
    t("V.01.PROOF", { importable: false, hidden: true }),
  ];
  const blk = (index: number, id: string | null): ReplyBlock => ({
    index,
    id,
    heading: null,
    text: "x",
    amount: null,
    reason: null,
  });

  test("each state", () => {
    const r = matchBlocks(
      [
        blk(0, "v.01.who"),
        blk(1, null),
        blk(2, "NOPE.1"),
        blk(3, "P.11.1"),
        blk(4, "V.02.RED_1"),
        blk(5, "V.10.WHY_WORK"),
        blk(6, "V.01.PROOF"),
      ],
      targets,
    );
    expect(r.map((m) => [m.state, m.questionKey])).toEqual([
      ["matched", "V.01.WHO"],
      ["unmatched", null],
      ["unmatched", null],
      ["not_importable", "P.11.1"],
      ["hidden", "V.02.RED_1"],
      ["unmatched", null],
      ["not_importable", "V.01.PROOF"],
    ]);
  });

  test("duplicates win over not importable and hidden", () => {
    const r = matchBlocks(
      [
        blk(0, "V.01.PROBLEM"),
        blk(1, "v.01.problem"),
        blk(2, "P.11.1"),
        blk(3, "p.11.1"),
        blk(4, "V.01.WHO"),
      ],
      targets,
    );
    expect(r.map((m) => m.state)).toEqual([
      "duplicate",
      "duplicate",
      "duplicate",
      "duplicate",
      "matched",
    ]);
    expect(r[0]?.duplicateOf).toEqual([1]);
    expect(r[1]?.duplicateOf).toEqual([0]);
    expect(r[4]?.duplicateOf).toBeUndefined();
  });

  test("duplicate unknown ids stay unmatched", () => {
    const r = matchBlocks([blk(0, "X"), blk(1, "X")], targets);
    expect(r.map((m) => m.state)).toEqual(["unmatched", "unmatched"]);
  });
});

describe("parseAmount", () => {
  test.each([
    ["₱30,000", 30000],
    ["PHP 30000", 30000],
    ["30,000.50", 30000.5],
    ["¥ 1,200", 1200],
    ["30,000 PHP", 30000],
    [" 0 ", 0],
    [".5", 0.5],
    [25000, 25000],
  ])("%p -> %p", (input, out) => {
    expect(parseAmount(input)).toBe(out);
  });
  test.each([
    ["-500"],
    ["−500"],
    ["(500)"],
    [""],
    ["   "],
    ["abc"],
    ["1.200,50"],
    ["10 to 20"],
    ["(empty)"],
    [null],
    [undefined],
    [-1],
    [Number.NaN],
  ])("%p -> null", (input) => {
    expect(parseAmount(input as string | null | undefined)).toBeNull();
  });
});

describe("parseChoice", () => {
  const choices = ["Red", "Blue", "Mixed"];
  test("matches case-insensitively and returns the canonical choice", () => {
    expect(parseChoice("red", choices)).toBe("Red");
    expect(parseChoice("  BLUE ", choices)).toBe("Blue");
    expect(parseChoice("**Mixed**.", choices)).toBe("Mixed");
  });
  test("rejects others", () => {
    expect(parseChoice("Green", choices)).toBeNull();
    expect(parseChoice("Red Blue", choices)).toBeNull();
    expect(parseChoice("", choices)).toBeNull();
    expect(parseChoice(null, choices)).toBeNull();
  });
});
