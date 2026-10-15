import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import {
  checkKeySchema,
  checkStateSchema,
  confidenceSchema,
  decisionValueSchema,
  economicsFieldSchema,
  fauSchema,
  fauStateSchema,
  goNoGoValueSchema,
  roleSchema,
  stageSchema,
  supportsCheckSchema,
} from "@moonx/schemas";
import { createI18n, i18n, namespaces, resources } from "./i18n";

test("the shared instance is ready on import", () => {
  expect(i18n.isInitialized).toBe(true);
  expect(i18n.language).toBe("en");
  expect(namespaces).toEqual(["common", "format", "mail", "validation"]);
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

/** The enums named in the terms of design-spec 1.4 have a label for every value. */
test.each([
  ["role", roleSchema.options],
  ["fau", fauSchema.options],
  ["fauState", fauStateSchema.options],
  ["confidence", confidenceSchema.options],
  ["decision", decisionValueSchema.options],
  ["goNoGo", goNoGoValueSchema.options],
  ["stage", stageSchema.options],
  ["checkState", checkStateSchema.options],
  ["supportsCheck", supportsCheckSchema.options],
  ["economicsField", economicsFieldSchema.options],
] as const)("common:%s labels every value", (group, values) => {
  const labels = resources.en.common[group] as Record<string, string>;
  for (const value of values) expect(labels[value]).toBeString();
});

test("every check has a name", () => {
  const names = resources.en.common.check as Record<string, string>;
  for (const key of checkKeySchema.options) {
    if (key === "competitors") continue;
    expect(names[key]).toBeString();
  }
});
