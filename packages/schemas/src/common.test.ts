import { describe, expect, test } from "bun:test";
import {
  checkResultSchema,
  classificationInputSchema,
  dateTimeSchema,
  economicsResultSchema,
  linkTargetSchema,
  metricValueSchema,
  nextStepSchema,
  pageSchema,
  questionOptionsSchema,
  targetRefSchema,
  userRefSchema,
} from "./common";

const id = "0192f0d8-6c2e-7a3c-9b1d-2f4e5a6b7c8d";

describe("SDD 5.1 / 5.2 shapes", () => {
  test("date-times are UTC with milliseconds", () => {
    expect(dateTimeSchema.safeParse("2026-10-01T02:00:00.000Z").success).toBe(
      true,
    );
    expect(dateTimeSchema.safeParse("2026-10-01T02:00:00Z").success).toBe(
      false,
    );
    expect(
      dateTimeSchema.safeParse("2026-10-01T10:00:00.000+08:00").success,
    ).toBe(false);
  });

  test("a target ref with and without a key", () => {
    expect(
      targetRefSchema.parse({ type: "validation_answer", id, key: "V.01.WHO" }),
    ).toEqual({ type: "validation_answer", id, key: "V.01.WHO" });
    expect(targetRefSchema.safeParse({ type: "idea", id }).success).toBe(true);
    expect(targetRefSchema.safeParse({ type: "plan", id }).success).toBe(false);
    expect(targetRefSchema.safeParse({ type: "idea", id: "1" }).success).toBe(
      false,
    );
  });

  test("a page of items", () => {
    const page = pageSchema(userRefSchema);
    expect(
      page.safeParse({
        items: [
          {
            id,
            displayName: "Deleted user",
            avatarUrl: null,
            badge: "deleted",
          },
        ],
        nextCursor: null,
      }).success,
    ).toBe(true);
    expect(page.safeParse({ items: [] }).success).toBe(false);
  });

  test("a link target", () => {
    expect(
      linkTargetSchema.safeParse({
        screen: 14,
        workspaceId: id,
        ideaId: id,
        newEntry: true,
        presetSupports: ["permits"],
      }).success,
    ).toBe(true);
    expect(
      linkTargetSchema.safeParse({ screen: 18, field: "price" }).success,
    ).toBe(false);
  });

  test("a classification input leaves CONFIDENCE_REQUIRED to the API", () => {
    expect(
      classificationInputSchema.safeParse({ fau: "assumption" }).success,
    ).toBe(true);
    expect(classificationInputSchema.safeParse({ fau: "maybe" }).success).toBe(
      false,
    );
  });

  test("question options by kind", () => {
    expect(
      questionOptionsSchema.safeParse({
        kind: "table",
        columns: [{ key: "share", label: "Share", type: "percent" }],
      }).success,
    ).toBe(true);
    expect(
      questionOptionsSchema.safeParse({ kind: "choice", metricKeys: [] })
        .success,
    ).toBe(false);
  });

  test("metric values, checks and Next steps", () => {
    expect(
      metricValueSchema.safeParse({
        value: null,
        bound: "exact",
        reason: "unknown",
      }).success,
    ).toBe(true);
    expect(
      metricValueSchema.safeParse({
        value: -0.24,
        bound: "approximate",
        reason: null,
      }).success,
    ).toBe(true);
    expect(
      metricValueSchema.safeParse({ value: 1, bound: "maybe", reason: null })
        .success,
    ).toBe(false);
    expect(
      checkResultSchema.safeParse({
        key: "competitors",
        state: "partial",
        count: 2,
        params: { min: 3, max: 5 },
        detail: null,
        link: { screen: 15 },
      }).success,
    ).toBe(true);
    expect(
      nextStepSchema.safeParse({
        kind: "check",
        count: null,
        checkKey: "permits",
        sectionKey: null,
        link: null,
      }).success,
    ).toBe(true);
  });

  test("an economics result needs every part and five scenario columns", () => {
    expect(economicsResultSchema.safeParse({}).success).toBe(false);
    expect(economicsResultSchema.shape.scenarios.safeParse([]).success).toBe(
      false,
    );
  });
});
