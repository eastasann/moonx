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
  "account:role.${role}": ["owner", "member", "viewer"].map((r) => `account:role.${r}`),
  "account:role.${invitation.role}": ["owner", "member", "viewer"].map((r) => `account:role.${r}`),
  "account:preferences.themes.${theme}": ["system", "light", "dark"].map(
    (x) => `account:preferences.themes.${x}`,
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
