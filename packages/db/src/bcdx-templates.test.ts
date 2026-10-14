import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type TemplateFile, templateFileSchema } from "@moonx/schemas";

// The BCDX template files are transcribed from the Drive originals in docs/drive-templates/
// (design-spec 9.3). These tests read the originals and compare the text, ignoring only
// the line breaks, page breaks and zero-width spaces the PDF export added.

const ROOT = join(import.meta.dir, "../../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const bcdx = (name: string): TemplateFile =>
  templateFileSchema.parse(JSON.parse(read(`data/templates/bcdx/${name}`)));

/** Text with every run of whitespace (and zero-width space) as one space. */
const flat = (text: string) => text.replace(/[\s​]+/g, " ").trim();

const lines = (path: string) =>
  read(path)
    .split("\n")
    .map((line) => ({
      pageBreak: line.startsWith("\f"),
      text: line.replaceAll("\f", "").replaceAll("​", ""),
    }));

const questionsOf = (file: TemplateFile) =>
  file.sections.flatMap((section) => section.questions);

describe("self-analysis.json", () => {
  const file = bcdx("self-analysis.json");
  const original = lines("docs/drive-templates/self-analysis.txt");

  /** The numbered questions with their EXAMPLE, in order. */
  const originalQuestions = (() => {
    const found: { number: number; prompt: string; example: string }[] = [];
    for (const [index, line] of original.entries()) {
      const question = line.text.match(/^(\d+)\. (.+)$/);
      if (question !== null) {
        found.push({
          number: Number(question[1]),
          prompt: question[2] ?? "",
          example: "",
        });
        continue;
      }
      if (line.text.trim() !== "EXAMPLE") continue;
      const example: string[] = [];
      for (const next of original.slice(index + 1)) {
        if (next.text.trim() === "") {
          if (example.length > 0) break;
          continue;
        }
        if (next.pageBreak && example.length > 0) break;
        example.push(next.text);
      }
      const last = found.at(-1);
      if (last !== undefined) last.example = flat(example.join(" "));
    }
    return found;
  })();

  test("has the 36 questions of the original, in its order (design-spec 6.6)", () => {
    expect(
      original.filter((l) => l.text.trim() === "YOUR ANSWER"),
    ).toHaveLength(36);
    expect(originalQuestions.map((q) => q.number)).toEqual(
      Array.from({ length: 36 }, (_, i) => i + 1),
    );
    expect(
      questionsOf(file).map((q) => ({
        title: q.title,
        prompt: q.prompt,
        example: q.example,
      })),
    ).toEqual(
      originalQuestions.map((q) => ({
        title: `Q${q.number}`,
        prompt: q.prompt,
        example: q.example,
      })),
    );
  });

  test("keys its questions as design-spec 6.6 lists them", () => {
    const spec = read("docs/design-spec.md");
    const row = spec.split("\n").find((l) => l.startsWith("| 自己分析 | `SA."));
    const expected = [
      ...(row ?? "").matchAll(/`SA\.([A-Z]+)\.1(?:–(\d+))?`/g),
    ].flatMap(([, section, last]) =>
      Array.from(
        { length: Number(last ?? 1) },
        (_, i) => `SA.${section}.${i + 1}`,
      ),
    );
    expect(expected).toHaveLength(36);
    expect(questionsOf(file).map((q) => q.key)).toEqual(expected);
  });

  test("asks the PERSONAL INCOME questions as amount and reason", () => {
    for (const question of questionsOf(file))
      expect(question.answerType).toBe(
        question.key.startsWith("SA.INCOME.")
          ? "amount_with_reason"
          : "long_text",
      );
  });

  test("has the original's section headings, subtitles and guidance", () => {
    const sections: { title: string; subtitle: string; guidance: string }[] =
      [];
    for (const [index, line] of original.entries()) {
      const heading = line.text.match(/^ ([A-Z][A-Z -]*[A-Z]) \| (.+)$/);
      if (heading === null) continue;
      const guidance = original
        .slice(index + 1)
        .find((next) => next.text.trim() !== "");
      sections.push({
        title: heading[1] ?? "",
        subtitle: heading[2] ?? "",
        guidance: flat(guidance?.text ?? ""),
      });
    }
    expect(sections).toHaveLength(11);
    expect(
      file.sections.map((s) => ({
        title: s.title,
        subtitle: s.subtitle,
        guidance: s.guidance,
      })),
    ).toEqual(sections);
  });

  test("has the AI prompt of initialize-prompt.txt", () => {
    const prompt = read("docs/drive-templates/initialize-prompt.txt");
    const body = prompt.slice(
      prompt.indexOf("\n", prompt.indexOf("```")) + 1,
      prompt.lastIndexOf("```"),
    );
    expect(flat(file.aiPrompt)).toBe(flat(body));
    // Paragraphs and list items stay on their own lines.
    expect(file.aiPrompt).toContain(
      "For EVERY question, follow this process:\n\n1. Ask me",
    );
    expect(file.aiPrompt).not.toContain("\f");
  });
});

describe("plan.json", () => {
  const file = bcdx("plan.json");
  const original = lines("docs/drive-templates/business-plan.txt");
  const isHeader = (text: string) => /^\s*Prompt\s+Response\s*$/.test(text);

  /**
   * The prompt rows: a label in the left column (wrapped over several lines) beside
   * "[Write here]", then its Example. Table rows have no Example.
   */
  const promptRows = (() => {
    const rows: { label: string; example: string }[] = [];
    for (const [index, line] of original.entries()) {
      const at = line.text.indexOf("[Write here]");
      const left = at < 0 ? "" : line.text.slice(0, at).trim();
      if (left === "") continue;
      const label = [left];
      let example: string[] | null = null;
      for (const next of original.slice(index + 1)) {
        if (next.text.includes("[Write here]")) break;
        if (example !== null) {
          if (next.text.trim() === "" || next.pageBreak) break;
          example.push(next.text);
          continue;
        }
        if (next.text.trim() === "" || isHeader(next.text)) continue;
        const exampleAt = next.text.indexOf("Example:");
        const leftOf =
          exampleAt < 0 ? next.text : next.text.slice(0, exampleAt);
        if (leftOf.trim() !== "") label.push(leftOf.trim());
        if (exampleAt >= 0)
          example = [next.text.slice(exampleAt + "Example:".length)];
      }
      if (example !== null)
        rows.push({
          label: flat(label.join(" ")),
          example: flat(example.join(" ")),
        });
    }
    return rows;
  })();

  // design-spec 6.12 puts one table in place of the original's three Founder rows (§11)
  // and of its two rows of ownership and capital (§13).
  const founderRows = promptRows.filter((row) => /^Founder \d/.test(row.label));
  const ownershipRows = promptRows.filter((row) =>
    ["Initial ownership", "Initial capital contribution"].includes(row.label),
  );

  test("has every prompt row of the original, in its order", () => {
    expect(original.filter((l) => l.text.includes("Example:"))).toHaveLength(
      130,
    );
    expect(promptRows).toHaveLength(130);
    expect(founderRows).toHaveLength(3);
    expect(ownershipRows).toHaveLength(2);
    const prompts = questionsOf(file).filter(
      (q) => q.answerType === "long_text" || q.answerType === "linked_metric",
    );
    expect(
      prompts.map((q) => ({ label: q.prompt, example: q.example })),
    ).toEqual(
      promptRows.filter(
        (row) => !founderRows.includes(row) && !ownershipRows.includes(row),
      ),
    );
    for (const q of prompts) expect(q.title).toBe(q.prompt);
  });

  test("carries the replaced rows' examples into the §11 and §13 tables", () => {
    const [founders, ownership] = ["P.11.1", "P.13.1"].map((key) =>
      questionsOf(file).find((q) => q.key === key),
    );
    expect(new Set(founderRows.map((row) => row.example))).toEqual(
      new Set([founders?.example ?? ""]),
    );
    expect(ownership?.example).toBe(
      ownershipRows.map((row) => row.example).join("\n"),
    );
  });

  test("has the 30 items of the original with their guidance", () => {
    const items: { title: string; guidance: string | null }[] = [];
    for (const [index, line] of original.entries()) {
      const heading = line.text.match(/^(\d+)\. (.+)$/);
      if (heading === null) continue;
      const next = original[index + 1]?.text ?? "";
      // A guidance line starts at the margin; a table's column names are indented.
      items.push({
        title: heading[2] ?? "",
        guidance: /^\S/.test(next) && !isHeader(next) ? flat(next) : null,
      });
    }
    expect(items).toHaveLength(30);
    // The item names are design-spec 6.12's, which capitalizes the headings the
    // original sets in capitals (KEY ASSUMPTIONS) like the others.
    expect(
      file.sections.map((s) => ({
        title: s.title.toLowerCase(),
        guidance: s.guidance,
      })),
    ).toEqual(items.map((i) => ({ ...i, title: i.title.toLowerCase() })));
    expect(file.sections.map((s) => s.part)).toEqual([
      ...Array<"a">(10).fill("a"),
      ...Array<"b">(20).fill("b"),
    ]);
  });

  test("numbers sub-items P.{item}.{n} in order (design-spec 6.6)", () => {
    for (const [index, section] of file.sections.entries()) {
      const item = String(index + 1).padStart(2, "0");
      expect(section.key).toBe(item);
      expect(section.questions.map((q) => q.key)).toEqual(
        section.questions.map((_, n) => `P.${item}.${n + 1}`),
      );
    }
  });

  test("names only metrics of design-spec 6.4 and cost rows of 6.3", () => {
    const spec = read("docs/design-spec.md");
    const costKeys = [
      ...(spec
        .split("\n")
        .find((l) => l.startsWith("- テンプレートの初期行のキー:"))
        ?.matchAll(/`((?:initial|monthly|variable)\.[a-z_]+)`/g) ?? []),
    ].map((match) => match[1] ?? "");
    expect(costKeys).toHaveLength(24);
    const table = spec.slice(
      spec.indexOf("#### 主要指標"),
      spec.indexOf("- 計算できない主要指標"),
    );
    const metricKeys = table
      .split("\n")
      .filter((l) => l.startsWith("| `"))
      .flatMap((l) => [...(l.split("|")[1] ?? "").matchAll(/`([^`]+)`/g)])
      .flatMap(([, key = ""]) => {
        const scenarios = key.match(/^scenario:\{(.+)\}$/);
        if (scenarios !== null)
          return (scenarios[1] ?? "").split("/").map((s) => `scenario:${s}`);
        if (key.startsWith("cost_row:"))
          return costKeys.map((row) => `cost_row:${row}`);
        return [key];
      });
    const selfAnalysis = bcdx("self-analysis.json").sections.map((s) => s.key);

    const questions = questionsOf(file);
    const linked = questions.flatMap((q) =>
      q.options?.kind === "linked_metric" ? q.options.metricKeys : [],
    );
    expect(linked.length).toBeGreaterThan(0);
    for (const key of linked) expect(metricKeys).toContain(key);
    const references = questions.flatMap((q) => q.reference ?? []);
    for (const reference of references) {
      if (reference.kind === "cost_rows")
        for (const key of reference.keys) expect(costKeys).toContain(key);
      if (reference.kind === "metrics")
        for (const key of reference.keys) expect(metricKeys).toContain(key);
      if (reference.kind === "self_analysis")
        for (const key of reference.sections)
          expect(selfAnalysis).toContain(key);
    }
  });

  test("has the initial execution rows of design-spec 6.13", () => {
    const spec = read("docs/design-spec.md");
    const table = spec.slice(
      spec.indexOf("### 6.13 "),
      spec.indexOf("### 6.14 "),
    );
    const quoted = (label: string) => {
      const row =
        table.split("\n").find((l) => l.startsWith(`| ${label}`)) ?? "";
      const presets = row.split("|")[4] ?? "";
      return [...presets.matchAll(/「([^」]+)」/g)].map(
        (match) => match[1] ?? "",
      );
    };
    const titles = (type: string) =>
      file.executionPresets.filter((p) => p.type === type).map((p) => p.title);
    expect(titles("milestone")).toEqual(quoted("マイルストーン"));
    expect(titles("launch")).toEqual(quoted("ローンチ"));
    expect(titles("kpi")).toEqual(quoted("KPI"));
    expect(titles("kpi")).toHaveLength(12);
    expect(
      file.executionPresets
        .filter((p) => p.type === "launch")
        .map((p) => p.launchTiming),
    ).toEqual([
      "t_minus_30",
      "t_minus_7",
      "launch_day",
      "first_30",
      "days_31_90",
    ]);
    expect(
      file.executionPresets.filter((p) => p.type === "kpi").map((p) => p.area),
    ).toEqual(
      ["Financial", "Customer", "Operations"].flatMap((area) =>
        Array<string>(4).fill(area),
      ),
    );
  });
});
