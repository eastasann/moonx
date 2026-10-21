import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import {
  adminUserStatusSchema,
  answerTypeSchema,
  checkKeySchema,
  checkStateSchema,
  competitorTypeSchema,
  confidenceSchema,
  costCategorySchema,
  decisionValueSchema,
  economicsFieldSchema,
  executionStatusSchema,
  executionTypeSchema,
  fauSchema,
  fauStateSchema,
  goNoGoValueSchema,
  invitationStatusSchema,
  launchTimingSchema,
  metricReasonSchema,
  roleSchema,
  scenarioKeySchema,
  selfAnalysisStatusSchema,
  sourceTypeSchema,
  stageSchema,
  supportsCheckSchema,
  templateCheckSchema,
  templateKindSchema,
  templateVersionStatusSchema,
} from "@moonx/schemas";
import { createI18n, i18n, namespaces, resources } from "./i18n";

test("the shared instance is ready on import", () => {
  expect(i18n.isInitialized).toBe(true);
  expect(i18n.language).toBe("en");
  expect(namespaces).toEqual([
    "admin",
    "ai",
    "app",
    "auth",
    "common",
    "components",
    "dashboard",
    "errors",
    "format",
    "ideas",
    "landing",
    "mail",
    "notifications",
    "pitch",
    "settings",
    "validation",
  ]);
});

test("each instance is separate", () => {
  const other = createI18n();
  expect(other).not.toBe(i18n);
  expect(other.t("common:stage.launch_prep")).toBe("Launch prep");
  other.addResource("en", "format", "months", "{{value}} mo");
  expect(other.t("format:months", { value: "9.2" })).toBe("9.2 mo");
  expect(i18n.t("format:months", { value: "9.2" })).toBe("9.2 months");
  expect(createI18n().t("format:months", { value: "9.2" })).toBe("9.2 months");
  expect(resources.en.format.months).toBe("{{value}} months");
});

test("every catalog file under locales/en is registered", () => {
  const files = readdirSync(new URL("../locales/en", import.meta.url))
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""))
    .sort();
  expect(files).toEqual([...namespaces].sort());
});

test("the default namespace is common", () => {
  expect(i18n.t("decision.undecided")).toBe("Undecided");
});

test("plural forms follow i18next", () => {
  expect(i18n.t("format:wait.minute", { count: 1 })).toBe("1 minute");
  expect(i18n.t("format:wait.minute", { count: 2 })).toBe("2 minutes");
});

test("interpolated values are not HTML-escaped", () => {
  expect(i18n.t("format:months", { value: "<9.2>" })).toBe("<9.2> months");
});

/** The enums shown by name (design-spec 1.4, 6.4, 6.10, 6.13) have a label for every value. */
test.each([
  ["role", roleSchema.options],
  ["fau", fauSchema.options],
  ["fauState", fauStateSchema.options],
  ["confidence", confidenceSchema.options],
  ["decision", decisionValueSchema.options],
  ["goNoGo", goNoGoValueSchema.options],
  ["stage", stageSchema.options],
  ["checkState", checkStateSchema.options],
  ["selfAnalysisStatus", selfAnalysisStatusSchema.options],
  ["supportsCheck", supportsCheckSchema.options],
  ["economicsField", economicsFieldSchema.options],
  ["metricReason", metricReasonSchema.options],
  ["scenario", scenarioKeySchema.options],
  ["competitorType", competitorTypeSchema.options],
  ["executionStatus", executionStatusSchema.options],
  ["launchTiming", launchTimingSchema.options],
  ["sourceType", sourceTypeSchema.options],
] as const)("common:%s labels every value", (group, values) => {
  const labels = resources.en.common[group] as Record<string, string>;
  for (const value of values) expect(labels[value]).toBeString();
});

/** The enums 26–28 show by name (design-spec 6.17) have a label for every value. */
test.each([
  ["kind", templateKindSchema.options],
  ["versionStatus", templateVersionStatusSchema.options],
  ["answerType", answerTypeSchema.options],
  ["executionType", executionTypeSchema.options],
  ["costCategory", costCategorySchema.options],
  ["userStatus", adminUserStatusSchema.options],
  ["invitationStatus", invitationStatusSchema.options],
] as const)("admin:%s labels every value", (group, values) => {
  const labels = resources.en.admin[group] as Record<string, string>;
  for (const value of values) expect(labels[value]).toBeString();
});

test("every problem of the check before publishing has its words (SDD 9章)", () => {
  const words = resources.en.admin.version.check.code as Record<string, string>;
  for (const code of templateCheckSchema.shape.errors.element.shape.code
    .options) {
    // A part is wrong one way for a plan and the other for the rest.
    const keys =
      code === "invalid_part"
        ? ["invalid_part_plan", "invalid_part_other"]
        : [code];
    for (const key of keys) expect(words[key]).toBeString();
  }
});

test("every check has a name", () => {
  const names = resources.en.common.check as Record<string, string>;
  for (const key of checkKeySchema.options) {
    if (key === "competitors") continue;
    expect(names[key]).toBeString();
  }
});
