import type { HistoryEntry } from "@moonx/schemas";
import { describe, expect, test } from "vitest";
import {
  type ChangeContext,
  changeKind,
  changeTitle,
  fieldChanges,
} from "./history-format";

// The words PNL-2 shows of a change (design-spec 6.0.5, history-values.ts).

const id = "a0000000-0000-4000-8000-000000000001";

const entry = (extra: Partial<HistoryEntry>): HistoryEntry => ({
  id,
  batchId: null,
  target: { type: "competitor", id, key: null },
  label: "Competitors · Airport kiosk",
  action: "update",
  source: "manual",
  before: null,
  after: null,
  changedBy: { id, displayName: "Ana", avatarUrl: null, badge: null },
  changedAt: "2026-10-20T01:00:00Z",
  revertible: true,
  ...extra,
});

const context: ChangeContext = {
  currency: "PHP",
  timeZone: "Asia/Manila",
  hasFau: (questionKey) => questionKey !== "V.10.NOTES",
  // As 6.0.3 words it: only a Fact counts its sources.
  fauLabel: (state, { confidence, evidenceCount }) =>
    state === "fact"
      ? `${state}:${evidenceCount}`
      : `${state}:${confidence ?? "-"}`,
};

const competitor = {
  name: "Airport kiosk",
  type: "direct",
  targetCustomer: null,
  offering: null,
  typicalPrice: 450,
  priceNote: null,
  strength: "Open early",
  weakness: null,
  whyChosen: null,
  whySurvive: null,
  evidenceIds: [],
};

describe("fieldChanges", () => {
  test("a change lists only the fields whose words differ, named as the form names them", () => {
    expect(
      fieldChanges(
        entry({
          before: competitor,
          after: {
            ...competitor,
            type: "substitute",
            typicalPrice: 480.5,
            evidenceIds: ["e1"],
          },
        }),
        context,
      ),
    ).toEqual([
      {
        label: "Type",
        before: "Direct Competitor",
        after: "Substitute",
      },
      { label: "Typical Price", before: "₱450", after: "₱480.50" },
      { label: "Evidence", before: "No sources", after: "1 source" },
    ]);
  });

  test("an added row lists the fields it set; a deleted one what it had set", () => {
    const added = fieldChanges(
      entry({ action: "create", after: competitor }),
      context,
    );
    expect(added.map(({ label }) => label)).toEqual([
      "Name",
      "Type",
      "Typical Price",
      "Strength",
    ]);
    expect(added.every(({ before }) => before === "")).toBe(true);
    const deleted = fieldChanges(
      entry({ action: "delete", before: competitor }),
      context,
    );
    expect(deleted.every(({ after }) => after === "")).toBe(true);
  });

  test("an answer's text has no name, and its F/A/U counts the evidence it kept", () => {
    expect(
      fieldChanges(
        entry({
          target: { type: "validation_answer", id, key: "V.01.WHO" },
          before: { text: "", fau: null, confidence: null, evidenceIds: [] },
          after: {
            text: "Office workers",
            fau: "fact",
            confidence: null,
            evidenceIds: ["e1", "e2"],
          },
        }),
        context,
      ),
    ).toEqual([
      { label: null, before: "", after: "Office workers" },
      { label: "F/A/U", before: "empty:-", after: "fact:2" },
    ]);
  });

  test("evidence attached to an answer that is no Fact shows as its own count", () => {
    const assumed = {
      text: "Office workers",
      fau: "assumption",
      confidence: "medium",
    };
    expect(
      fieldChanges(
        entry({
          target: { type: "validation_answer", id, key: "V.01.WHO" },
          before: { ...assumed, evidenceIds: [] },
          after: { ...assumed, evidenceIds: ["e1"] },
        }),
        context,
      ),
    ).toEqual([{ label: "Evidence", before: "No sources", after: "1 source" }]);
  });

  test("a revert that changes the confidence and the evidence shows both", () => {
    expect(
      fieldChanges(
        entry({
          target: { type: "validation_answer", id, key: "V.01.WHO" },
          source: "revert",
          before: {
            text: "Office workers",
            fau: "assumption",
            confidence: "low",
            evidenceIds: [],
          },
          after: {
            text: "Office workers",
            fau: "assumption",
            confidence: "high",
            evidenceIds: ["e1"],
          },
        }),
        context,
      ),
    ).toEqual([
      { label: "F/A/U", before: "assumption:low", after: "assumption:high" },
      { label: "Evidence", before: "No sources", after: "1 source" },
    ]);
  });

  test("an added cost row leaves out what every row starts with", () => {
    expect(
      fieldChanges(
        entry({
          target: { type: "cost_item", id, key: null },
          action: "create",
          after: {
            category: "initial",
            templateKey: null,
            name: "Permits",
            inputMode: "amount",
            amount: null,
            percent: null,
            isLumpSum: false,
            whyNeeded: null,
            canReduce: null,
            notes: null,
            fau: null,
            confidence: null,
            evidenceIds: [],
          },
        }),
        context,
      ),
    ).toEqual([{ label: "Item", before: "", after: "Permits" }]);
  });

  test("a question without F/A/U shows its text alone", () => {
    expect(
      fieldChanges(
        entry({
          target: { type: "validation_answer", id, key: "V.10.NOTES" },
          before: { text: null, fau: null, confidence: null, evidenceIds: [] },
          after: {
            text: "Ask the BPOs",
            fau: null,
            confidence: null,
            evidenceIds: [],
          },
        }),
        context,
      ),
    ).toEqual([{ label: null, before: "", after: "Ask the BPOs" }]);
  });

  test("a number reads as 18 shows it; a cost as 17 does", () => {
    expect(
      fieldChanges(
        entry({
          target: { type: "economics_input", id, key: "target_margin" },
          before: {
            value: 0.15,
            fau: "unknown",
            confidence: null,
            evidenceIds: [],
          },
          after: {
            value: 0.2,
            fau: "assumption",
            confidence: "low",
            evidenceIds: [],
          },
        }),
        context,
      ),
    ).toEqual([
      { label: "Value", before: "15%", after: "20%" },
      {
        label: "F/A/U",
        before: "unknown:-",
        after: "assumption:low",
      },
    ]);
    const cost = {
      category: "variable",
      templateKey: null,
      name: "Box",
      inputMode: "amount",
      amount: 12,
      percent: null,
      isLumpSum: false,
      whyNeeded: null,
      canReduce: null,
      notes: null,
      fau: null,
      confidence: null,
      evidenceIds: [],
    };
    expect(
      fieldChanges(
        entry({
          target: { type: "cost_item", id, key: null },
          before: cost,
          after: {
            ...cost,
            inputMode: "percent_of_price",
            amount: null,
            percent: 0.35,
          },
        }),
        context,
      ),
    ).toEqual(
      [
        { label: "Entered as", before: "Amount", after: "% of price" },
        { label: "Amount", before: "₱12.00", after: "" },
        { label: "% of price", before: "", after: "35%" },
        {
          label: "F/A/U",
          before: "unclassified:-:0",
          after: "unclassified:-:0",
        },
      ].filter(({ before, after }) => before !== after),
    );
  });

  test("a research log entry's date, source and checks read as 14 shows them", () => {
    const log = {
      observedOn: "2026-09-12",
      topic: "Store observation",
      observation: null,
      sourceType: null,
      sourceUrl: null,
      supportsChecks: [],
      supportsNote: null,
    };
    expect(
      fieldChanges(
        entry({
          target: { type: "research_log_entry", id, key: null },
          before: log,
          after: {
            ...log,
            sourceType: "price_check",
            supportsChecks: ["local_price", "permits"],
          },
        }),
        context,
      ),
    ).toEqual([
      { label: "Source Type", before: "", after: "Price Check" },
      {
        label: "Supports check",
        before: "",
        after: "Local price, Permits",
      },
    ]);
  });
});

describe("changeKind and changeTitle", () => {
  test("the kind of change beside the kind of operation", () => {
    expect(changeKind(entry({ source: "ai_import", action: "create" }))).toBe(
      "AI import · Added",
    );
    expect(
      changeKind(
        entry({
          target: { type: "business_plan", id, key: null },
          source: "revert",
          action: "delete",
        }),
      ),
    ).toBe("Plan draft undone · Deleted");
  });

  test("a template's version says what it moved to", () => {
    const template = {
      target: { type: "template_version" as const, id, key: null },
      before: { versionId: "v1", versionNumber: 1 },
      after: { versionId: "v2", versionNumber: 2 },
    };
    expect(
      changeTitle(entry({ ...template, source: "template_migration" })),
    ).toBe("Template updated to v2");
    expect(
      changeTitle(
        entry({
          ...template,
          source: "revert",
          before: template.after,
          after: template.before,
        }),
      ),
    ).toBe("Template set back to v1");
    // Undoing the undo moves it on again.
    expect(changeTitle(entry({ ...template, source: "revert" }))).toBe(
      "Template updated to v2",
    );
    expect(fieldChanges(entry(template), context)).toEqual([]);
  });
});
