import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type CostCategory,
  type TemplateFile,
  templateFileSchema,
} from "@moonx/schemas";

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

describe("validation.json", () => {
  const file = bcdx("validation.json");
  const spec = read("docs/design-spec.md");

  /**
   * The sheets of the original spreadsheet: each cell's value by address, and the
   * choice lists of its data validation.
   */
  const sheets = (() => {
    type Sheet = {
      cells: Map<string, string>;
      lists: { ranges: string[]; choices: string[] }[];
    };
    const found = new Map<string, Sheet>();
    let current: Sheet | undefined;
    for (const line of read(
      "docs/drive-templates/business-idea-validation.txt",
    ).split("\n")) {
      const sheet = line.match(/^=== Sheet: (.+) \(range /);
      if (sheet !== null) {
        current = { cells: new Map(), lists: [] };
        found.set(sheet[1] ?? "", current);
        continue;
      }
      const cell = line.match(/^([A-Z]+[0-9]+): (.*)$/);
      if (cell !== null) current?.cells.set(cell[1] ?? "", cell[2] ?? "");
      const list = line.match(/^validation (.+): type=list formula1="(.*)"$/);
      if (list !== null)
        current?.lists.push({
          ranges: (list[1] ?? "").split(" "),
          choices: (list[2] ?? "").split(","),
        });
    }
    return found;
  })();

  const sheetOf = (key: string) => {
    const entry = [...sheets].find(([name]) => name.startsWith(`${key} `));
    if (entry === undefined) throw new Error(`No sheet ${key} in the original`);
    return entry[1];
  };

  /**
   * The rows of column `column` below row `below`, in order. Rows 1 to 4 of every sheet
   * hold its name, its guidance and its table's header.
   */
  const columnRows = (key: string, column: string, below = 4) =>
    [...sheetOf(key).cells]
      .map(([address, value]) => ({
        column: address.replace(/[0-9]+$/, ""),
        row: Number(address.replace(/^[A-Z]+/, "")),
        value,
      }))
      .filter((cell) => cell.column === column && cell.row > below)
      .toSorted((a, b) => a.row - b.row);

  /**
   * The questions of a sheet as design-spec 9.3 reads them. 01 and 02 have a Focus
   * label beside each Question. The other sheets have one text per row: the column A
   * rows with nothing to calculate in column B, above the Proceed / Hold / Drop row
   * that 19 replaces.
   */
  const originalQuestions = (key: string) => {
    const { cells, lists } = sheetOf(key);
    if (cells.get("B4") === "Question")
      return columnRows(key, "A").map(({ row, value }) => ({
        title: value,
        prompt: cells.get(`B${row}`) ?? "",
      }));
    const decisionRow = lists
      .filter((list) => list.choices.join(",") === "Proceed,Hold,Drop")
      .map((list) => Number((list.ranges[0] ?? "").replace(/^[A-Z]+/, "")))
      .at(0);
    return columnRows(key, "A")
      .filter(
        ({ row }) =>
          !cells.has(`B${row}`) &&
          (decisionRow === undefined || row < decisionRow),
      )
      .map(({ value }) => ({ title: value, prompt: value }));
  };

  const sectionKeys = ["01", "02", "04", "08", "10"];

  test("has the questions of the original's sheets 01, 02, 04, 08 and 10, in their order", () => {
    expect(file.sections.map((s) => s.key)).toEqual(sectionKeys);
    expect(sectionKeys.map((key) => originalQuestions(key).length)).toEqual([
      10, 15, 2, 1, 6,
    ]);
    expect(
      file.sections.map((s) =>
        s.questions.map((q) => ({ title: q.title, prompt: q.prompt })),
      ),
    ).toEqual(sectionKeys.map(originalQuestions));
  });

  test("names its sections by the sheets' first row and guides by their second", () => {
    expect(
      file.sections.map((s) => ({
        part: s.part,
        title: s.title,
        subtitle: s.subtitle,
        guidance: s.guidance,
      })),
    ).toEqual(
      sectionKeys.map((key) => ({
        part: null,
        title: sheetOf(key).cells.get("A1") ?? "",
        subtitle: null,
        guidance: sheetOf(key).cells.get("A2") ?? "",
      })),
    );
  });

  test("keys its questions as design-spec 6.6 lists them", () => {
    const expected = spec
      .split("\n")
      .filter((l) => /^\| 検証 [0-9]{2} \|/.test(l))
      .flatMap((row) => {
        const [, , format = "", keys = ""] = row.split("|");
        const id = format.match(/`(V\.[0-9]{2})\.([A-Z_]+|\{キー\})`/);
        if (id?.[2] !== "{キー}") return [`${id?.[1]}.${id?.[2]}`];
        return [...keys.matchAll(/`([A-Z_]+?)(?:_1–(\d+))?`/g)].flatMap(
          ([, key, last]) =>
            last === undefined
              ? [`${id[1]}.${key}`]
              : Array.from(
                  { length: Number(last) },
                  (_, i) => `${id[1]}.${key}_${i + 1}`,
                ),
        );
      });
    expect(expected).toHaveLength(34);
    expect(questionsOf(file).map((q) => q.key)).toEqual(expected);
  });

  test("answers and shows its questions as design-spec 6.2 asks, all with F/A/U", () => {
    const oceanChoices = sheetOf("02").lists.find((list) =>
      list.ranges.includes("C6"),
    )?.choices;
    expect(oceanChoices).toEqual(["Red", "Blue", "Mixed"]);
    for (const q of questionsOf(file)) {
      expect({
        answerType: q.answerType,
        options: q.options,
        displayCondition: q.displayCondition,
      }).toEqual(
        q.key === "V.02.CATEGORY"
          ? { answerType: "short_text", options: null, displayCondition: null }
          : q.key === "V.02.OCEAN"
            ? {
                answerType: "choice",
                options: { kind: "choice", choices: oceanChoices ?? [] },
                displayCondition: null,
              }
            : {
                answerType: "long_text",
                options: null,
                displayCondition: q.key.startsWith("V.02.RED_")
                  ? { "V.02.OCEAN": ["Red", "Mixed"] }
                  : q.key.startsWith("V.02.BLUE_")
                    ? { "V.02.OCEAN": ["Blue", "Mixed"] }
                    : null,
              },
      );
      expect(q.hasFau).toBe(true);
      // The original has no EXAMPLE (docs/drive-templates/README.md) and no hints.
      expect(q.example).toBeNull();
      expect(q.hint).toBeNull();
    }
    // 13 counts 8 questions of 02 before OCEAN is answered, 12 for Red, 11 for Blue
    // and 15 for Mixed (design-spec 6.1).
    const market = file.sections.find((s) => s.key === "02")?.questions ?? [];
    const shown = (ocean: string | null) =>
      market.filter((q) => {
        const values = q.displayCondition?.["V.02.OCEAN"];
        return (
          values === undefined || (ocean !== null && values.includes(ocean))
        );
      }).length;
    expect([null, "Red", "Blue", "Mixed"].map(shown)).toEqual([8, 12, 11, 15]);
  });

  test("has the initial cost rows of design-spec 6.3, named as in the original's 05 Costs", () => {
    const keys = [
      ...(spec
        .split("\n")
        .find((l) => l.startsWith("- テンプレートの初期行のキー:"))
        ?.matchAll(/`((?:initial|monthly|variable)\.[a-z_]+)`/g) ?? []),
    ].map((match) => match[1] ?? "");
    const table = spec.slice(
      spec.indexOf("### 6.3 "),
      spec.indexOf("#### 合計の出し方"),
    );
    const specNames = (label: string) =>
      (
        table
          .split("\n")
          .find((l) => l.startsWith(`| ${label} |`))
          ?.split("|")[2] ?? ""
      )
        .trim()
        .split("・");

    // The original lists each table's rows under its heading, down to its TOTAL row.
    const headings: Record<string, CostCategory> = {
      "STARTUP COSTS": "initial",
      "MONTHLY FIXED COSTS": "monthly_fixed",
      "VARIABLE COST PER SALE": "variable",
    };
    const originalRows: { category: CostCategory; name: string }[] = [];
    let category: CostCategory | null = null;
    for (const { value } of columnRows("05", "A", 2)) {
      if (value in headings) category = headings[value] ?? null;
      else if (value.startsWith("TOTAL ")) category = null;
      else if (category !== null) originalRows.push({ category, name: value });
    }

    expect(keys).toHaveLength(24);
    expect(originalRows).toHaveLength(24);
    expect(file.costDefaults.map((row) => row.key)).toEqual(keys);
    expect(
      file.costDefaults.map(({ category, name }) => ({ category, name })),
    ).toEqual(originalRows);
    expect(
      (["initial", "monthly_fixed", "variable"] as const).map((c) =>
        file.costDefaults
          .filter((row) => row.category === c)
          .map((row) => row.name),
      ),
    ).toEqual(
      ["初期費用", "月額固定費", "変動費（1販売あたり）"].map(specNames),
    );
  });

  test("gives the default check thresholds of design-spec 6.1", () => {
    expect(file.checkRules).toEqual([
      { checkKey: "competitors", params: { min: 3 } },
      {
        checkKey: "local_price",
        params: { pricedCompetitors: 2, researchLogs: 1 },
      },
      { checkKey: "permits", params: { researchLogs: 1 } },
      { checkKey: "demand_signal", params: { researchLogs: 1 } },
    ]);
  });

  test("is named after the original without its prefix, with no AI prompt", () => {
    const readme = read("docs/drive-templates/README.md");
    const original = readme.match(
      /\| `business-idea-validation\.txt` \| `TEMPLATE - ([^`]+)`/,
    );
    expect(file.name).toBe(original?.[1] ?? "");
    // Only self-analysis has an AI prompt (design-spec 9.3).
    expect(file.aiPrompt).toBe("");
    expect(file.executionPresets).toEqual([]);
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
