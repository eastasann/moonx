import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { AUTH_HOOK_ERROR_CODES, ERROR_CODES } from "@moonx/schemas";
import { createI18n, errorMessageKey, NAMESPACES, resources } from "../src";

const t = createI18n().t;

describe("catalog", () => {
  test("the namespaces are the files in locales/en, and SDD chapter 9 lists them all", () => {
    const files = readdirSync(new URL("../locales/en", import.meta.url))
      .map((name) => name.replace(/\.json$/, ""))
      .sort();
    expect([...NAMESPACES].sort()).toEqual(files);
    expect(Object.keys(resources.en).sort()).toEqual(files);
    const doc = readFileSync(
      new URL("../../../docs/02-01_system-design-doc.md", import.meta.url),
      "utf8",
    );
    const row = doc.split("\n").find((line) => line.startsWith("| カタログ |")) ?? "";
    for (const name of files) expect(row).toContain(`\`${name}\``);
  });

  test("every API error code and auth hook code has a message", () => {
    const i18n = createI18n();
    for (const code of [...ERROR_CODES, ...AUTH_HOOK_ERROR_CODES]) {
      expect(i18n.exists(errorMessageKey(code))).toBe(true);
    }
    expect(Object.keys(resources.en.errors).length).toBe(
      ERROR_CODES.length + AUTH_HOOK_ERROR_CODES.length,
    );
  });

  test("interpolation and plurals", () => {
    expect(t("errors:RATE_LIMITED")).toBe("Too many attempts. Try again in a minute.");
    expect(t("validation:home.nextSteps.check.costs_missing")).toBe(
      "Add startup and monthly costs",
    );
    expect(t("validation:home.marginNegative")).toBe("Contribution margin is negative");
    expect(t("validation:home.nextSteps.check.costs", { count: 1 })).toBe(
      "Fill or mark 1 empty cost row",
    );
    expect(t("validation:home.nextSteps.check.costs", { count: 2 })).toBe(
      "Fill or mark 2 empty cost rows",
    );
    expect(t("validation:home.nextSteps.check.competitors", { count: 3 })).toBe(
      "Find 3 competitors",
    );
    expect(t("validation:checks.competitors.label", { min: 3, max: 5 })).toBe("Competitors (3–5)");
    expect(t("common:format.months", { count: 9.2, value: "9.2" })).toBe("9.2 months");
    expect(t("common:format.months", { count: 1, value: "1" })).toBe("1 month");
  });

  test("economics reasons and warnings cover every domain value", () => {
    const reasons = [
      "needs_price",
      "needs_monthly_costs",
      "needs_expected_sales",
      "needs_startup_costs",
      "margin_not_positive",
      "target_margin_unreachable",
      "not_recovered",
      "empty",
    ];
    const warnings = [
      "margin_not_positive",
      "target_margin_unreachable",
      "break_even_above_capacity",
      "conservative_exceeds_capacity",
      "expected_exceeds_capacity",
      "strong_exceeds_capacity",
      "costs_incomplete",
    ];
    const i18n = createI18n();
    for (const r of reasons) expect(i18n.exists(`validation:economics.reason.${r}`)).toBe(true);
    for (const w of warnings) expect(i18n.exists(`validation:economics.warning.${w}`)).toBe(true);
  });

  test("labels for states, stages, checks and sections", () => {
    const i18n = createI18n();
    for (const k of [
      "empty",
      "unclassified",
      "fact",
      "fact_no_evidence",
      "assumption",
      "unknown",
    ]) {
      expect(i18n.exists(`validation:fau.state.${k}`)).toBe(true);
    }
    for (const k of ["validation", "planning", "launch_prep"]) {
      expect(i18n.exists(`validation:stage.${k}`)).toBe(true);
    }
    for (const k of ["local_price", "costs", "break_even", "permits", "demand_signal"]) {
      expect(i18n.exists(`validation:checks.${k}.label`)).toBe(true);
      expect(i18n.exists(`validation:home.nextSteps.check.${k}`, { count: 2 })).toBe(true);
    }
    expect(
      t("validation:home.nextSteps.startSection", { section: t("validation:sections.02") }),
    ).toBe("Start 02 Market");
  });

  test("instances are independent and fall back to English", () => {
    const a = createI18n("tl");
    expect(a.t("validation:stage.planning")).toBe("Planning");
    expect(a).not.toBe(createI18n());
  });
});
