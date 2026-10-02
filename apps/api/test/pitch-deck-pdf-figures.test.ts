import { describe, expect, test } from "bun:test";
import type { PitchDeck, PitchSlide } from "@moonx/schemas";
import { getDocumentProxy } from "unpdf";
import { renderPitchDeckPdf } from "../src/pdf/pitch-deck-pdf";

const DIGIT_RUNS = ["0000000", "1111111", "4444444", "7777777", "8888888", "9999999"];

const slide = (partial: Partial<PitchSlide> & Pick<PitchSlide, "key" | "type" | "title">) =>
  ({
    emptySources: [],
    overflow: false,
    editSource: null,
    editInValidation: null,
    commentCount: 0,
    ...partial,
  }) satisfies PitchSlide;

const exact = (value: number) => ({ value, bound: "exact" as const, reason: null });

const deck: PitchDeck = {
  variant: "five",
  source: { kind: "latest" },
  businessName: "Figures Co.",
  generatedAt: "2026-10-02T00:00:00Z",
  footer: { businessName: "Figures Co.", versionLabel: "Draft", date: "2026-10-02" },
  speakerNotes: null,
  slides: [
    // Table cells: digit runs in the "cell" token style.
    slide({
      key: "economics",
      type: "table",
      title: "Cells",
      table: { columns: ["Run"], rows: DIGIT_RUNS.map((run) => [run]) },
    }),
    // Metric figures: the "figure" token style.
    slide({
      key: "business_model",
      type: "number",
      title: "Figures",
      numbers: [
        { label: "Zeros", metricKey: "selling_price", value: exact(0) },
        { label: "Ones", metricKey: "selling_price", value: exact(1111111) },
        { label: "Eights", metricKey: "selling_price", value: exact(8888888) },
      ],
    }),
    // Control: the Fraunces heading has proportional digits, so the check can fail.
    ...DIGIT_RUNS.slice(0, 2).map((run, i) =>
      slide({ key: `control${i}`, type: "text", title: run, bullets: [] }),
    ),
  ],
};

interface Run {
  text: string;
  width: number;
  fontName: string;
}

async function runsOf(page: number, pdf: Awaited<ReturnType<typeof getDocumentProxy>>) {
  const content = await (await pdf.getPage(page)).getTextContent();
  return content.items
    .filter((item): item is typeof item & { str: string } => "str" in item)
    .map((item) => ({
      text: item.str.trim(),
      width: (item as { width: number }).width,
      fontName: (item as { fontName: string }).fontName,
    })) as Run[];
}

describe("PDF figures are tabular (design-spec: numbers are monospaced digits)", () => {
  test("digits of equal count have equal advance widths in cells and figures", async () => {
    const pdf = await getDocumentProxy(await renderPitchDeckPdf(deck, "PHP"));

    const cells = (await runsOf(1, pdf)).filter((r) => DIGIT_RUNS.includes(r.text));
    expect(cells.map((r) => r.text)).toEqual(DIGIT_RUNS);
    const cellWidth = cells[0]?.width ?? 0;
    expect(cellWidth).toBeGreaterThan(0);
    for (const run of cells) expect(Math.abs(run.width - cellWidth)).toBeLessThan(0.01);

    const figures = (await runsOf(2, pdf)).filter((r) => /^[₱\d,]+$/.test(r.text));
    const byText = new Map(figures.map((r) => [r.text, r.width]));
    const zeros = byText.get("₱0");
    expect(zeros).toBeDefined();
    const ones = byText.get("₱1,111,111");
    const eights = byText.get("₱8,888,888");
    expect(ones).toBeDefined();
    expect(Math.abs((ones ?? 0) - (eights ?? 1))).toBeLessThan(0.01);
  });

  test("the control (proportional Fraunces digits) is detected as unequal", async () => {
    const pdf = await getDocumentProxy(await renderPitchDeckPdf(deck, "PHP"));
    const zeros = (await runsOf(3, pdf)).find((r) => r.text === DIGIT_RUNS[0]);
    const ones = (await runsOf(4, pdf)).find((r) => r.text === DIGIT_RUNS[1]);
    expect(zeros).toBeDefined();
    expect(Math.abs((zeros?.width ?? 0) - (ones?.width ?? 0))).toBeGreaterThan(1);
  });
});
