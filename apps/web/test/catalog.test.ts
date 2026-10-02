import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createI18n, NAMESPACES } from "@moonx/i18n";
import { expect, test } from "vitest";

const i18n = createI18n();
const SRC = join(__dirname, "../src");

function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.tsx?$/.test(path) && !path.endsWith(".gen.ts")) yield path;
  }
}

/**
 * Every `t("...")` in the app must name a catalog entry that is a string. A key with `${...}` is
 * checked against the values its screen can give it, listed here.
 */
const DYNAMIC: Record<string, string[]> = {
  "validation:stage.${stage}": ["validation", "planning", "launch_prep"].map(
    (s) => `validation:stage.${s}`,
  ),
  "validation:checks.state.${state}": ["not_started", "partial", "done"].map(
    (s) => `validation:checks.state.${s}`,
  ),
  "validation:economics.reason.${reason}": [
    "needs_price",
    "needs_monthly_costs",
    "needs_expected_sales",
    "needs_startup_costs",
    "margin_not_positive",
    "target_margin_unreachable",
    "not_recovered",
    "empty",
  ].map((r) => `validation:economics.reason.${r}`),
  "plan:metric.${key}": [
    "initial_cost_total",
    "break_even_units_day",
    "expected_operating_profit",
    "payback_months",
  ].map((k) => `plan:metric.${k}`),
  "ideas:decision.${decision}": ["undecided", "proceed", "hold", "drop"].map(
    (d) => `ideas:decision.${d}`,
  ),
  "ideas:decisionFilter.${decision}": [
    "not_dropped",
    "all",
    "undecided",
    "proceed",
    "hold",
    "drop",
  ].map((d) => `ideas:decisionFilter.${d}`),
  "ideas:sort.${sort}": ["updated", "created", "name"].map((x) => `ideas:sort.${x}`),
  "ideas:goNoGo.${value}": ["launch", "delay", "stop"].map((v) => `ideas:goNoGo.${v}`),
  "landing.stages.${stage}.title": ["selfAnalysis", "validation", "plan"].map(
    (s) => `landing.stages.${s}.title`,
  ),
  "landing.stages.${stage}.body": ["selfAnalysis", "validation", "plan"].map(
    (s) => `landing.stages.${s}.body`,
  ),
  "nav.${entry.id}": [
    "dashboard",
    "ideas",
    "self-analysis",
    "notifications",
    "decisions",
    "settings",
    "admin",
  ].map((id) => `nav.${id}`),
  "fau.confidence.${confidence}": ["low", "medium", "high"].map(
    (level) => `validation:fau.confidence.${level}`,
  ),
  "validation:fau.confidence.${level}": ["low", "medium", "high"].map(
    (level) => `validation:fau.confidence.${level}`,
  ),
  "fau.state.${state}": [
    "empty",
    "unclassified",
    "fact",
    "fact_no_evidence",
    "assumption",
    "unknown",
  ].map((state) => `validation:fau.state.${state}`),
  "form:evidence.sourceTypes.${type}": [
    "google_maps_reviews",
    "website",
    "social_media",
    "public_data",
    "news_report",
    "store_observation",
    "price_check",
    "other",
  ].map((type) => `form:evidence.sourceTypes.${type}`),
  "validation:checks.${check}.label": ["local_price", "permits", "demand_signal"].map(
    (check) => `validation:checks.${check}.label`,
  ),
  "validation:sections.${key}": ["01", "02", "03", "04", "05", "06-08", "09", "10"].map(
    (key) => `validation:sections.${key}`,
  ),
  "validation:sections.${params.sectionKey}": ["01", "02", "10"].map(
    (key) => `validation:sections.${key}`,
  ),
  "history.fields.${field}": Object.keys(i18n.getResource("en", "panels", "history.fields")).map(
    (field) => `panels:history.fields.${field}`,
  ),
  "history.values.${value}": Object.keys(i18n.getResource("en", "panels", "history.values")).map(
    (value) => `panels:history.values.${value}`,
  ),
  "account:role.${role}": ["owner", "member", "viewer"].map((r) => `account:role.${r}`),
  "account:role.${invitation.role}": ["owner", "member", "viewer"].map((r) => `account:role.${r}`),
  "account:role.${member.role}": ["owner", "member", "viewer"].map((r) => `account:role.${r}`),
  "workspaceSettings:invitations.empty.${filter}": ["pending", "all"].map(
    (f) => `workspaceSettings:invitations.empty.${f}`,
  ),
  "workspaceSettings:invitations.status.${invitation.status}": [
    "pending",
    "accepted",
    "expired",
    "revoked",
  ].map((s) => `workspaceSettings:invitations.status.${s}`),
  "workspaceSettings:invitations.date.${invitation.status}": [
    "pending",
    "accepted",
    "expired",
    "revoked",
  ].map((s) => `workspaceSettings:invitations.date.${s}`),
  "account:preferences.themes.${theme}": ["system", "light", "dark"].map(
    (x) => `account:preferences.themes.${x}`,
  ),
  "export.steps.${stepId}": ["scope", "review", "export"].map((s) => `ai:export.steps.${s}`),
  "import.steps.${stepId}": ["paste", "match", "review", "apply"].map(
    (s) => `ai:import.steps.${s}`,
  ),
  "validation:stage.${idea.stage}": ["validation", "planning", "launch_prep"].map(
    (s) => `validation:stage.${s}`,
  ),
  "dashboard:activity.${entry.kind}": [
    "change",
    "comment",
    "decision",
    "go_no_go",
    "version_saved",
  ].map((kind) => `dashboard:activity.${kind}`),
  "dashboard:selfAnalyses.status.${status}": ["not_started", "in_progress", "done"].map(
    (s) => `dashboard:selfAnalyses.status.${s}`,
  ),
  "selfAnalysis:status.${home.status}": ["not_started", "in_progress", "done"].map(
    (s) => `selfAnalysis:status.${s}`,
  ),
  "selfAnalysis:status.${status}": ["not_started", "in_progress", "done"].map(
    (s) => `selfAnalysis:status.${s}`,
  ),
  "selfAnalysis:status.${analysis.status}": ["not_started", "in_progress", "done"].map(
    (s) => `selfAnalysis:status.${s}`,
  ),
  "decisionLog:kind.${entry.kind}": ["validation_decision", "go_no_go", "version_saved"].map(
    (k) => `decisionLog:kind.${k}`,
  ),
  "kind.${kind}": ["validation_decision", "go_no_go", "version_saved"].map(
    (k) => `decisionLog:kind.${k}`,
  ),
  "filters.${bound}": ["from", "to"].map((b) => `decisionLog:filters.${b}`),
  "detail.${row.key}": ["launchIf", "delayIf", "stopIf"].map((k) => `decisionLog:detail.${k}`),
  "columns.${id}": ["name", "amount", "fau", "whyNeeded", "canReduce", "notes", "actions"].map(
    (c) => `costs:columns.${c}`,
  ),
};

test("every translation key used in the app exists", () => {
  const missing: string[] = [];
  for (const file of sources(SRC)) {
    const text = readFileSync(file, "utf8");
    const namespaces = /useTranslation\(\s*(\[[^\]]*\]|"[^"]*")/.exec(text)?.[1];
    const defaultNs = namespaces ? (/"([^"]+)"/.exec(namespaces)?.[1] ?? "common") : "common";
    for (const match of text.matchAll(/\bt\(\s*[`"]([^`"]+)[`"]/g)) {
      const raw = match[1] as string;
      const keys = raw.includes("${")
        ? (DYNAMIC[raw] ?? (raw.startsWith("errors:${") ? [] : [`UNLISTED ${raw}`]))
        : [raw];
      for (const key of keys) {
        const full = key.includes(":") ? key : `${defaultNs}:${key}`;
        // A plural entry is stored as `key_one` / `key_other` and read with a `count`.
        const value = i18n.exists(`${full}_other`) ? "plural" : i18n.t(full);
        const [ns] = full.split(":");
        if (
          key.startsWith("UNLISTED") ||
          !NAMESPACES.includes(ns as never) ||
          !(i18n.exists(full) || i18n.exists(`${full}_other`)) ||
          typeof value !== "string"
        ) {
          missing.push(`${file.replace(SRC, "src")}: ${key}`);
        }
      }
    }
  }
  expect(missing).toEqual([]);
});

test("the Retry, Cancel and Save texts are plain strings, not groups", () => {
  for (const key of ["app:save", "app:cancel", "app:states.retry", "app:saveState.saved"]) {
    expect(typeof i18n.t(key)).toBe("string");
  }
});
