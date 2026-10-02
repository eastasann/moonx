import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { collectTokens, type JsonObject } from "../scripts/dtcg";
import { emitNative, emitPrint, emitWeb } from "../scripts/emit";

const tokens = collectTokens(
  JSON.parse(
    readFileSync(resolve(import.meta.dir, "../../../docs/06_design-tokens.json"), "utf8"),
  ) as JsonObject,
);
const committed = (name: string) =>
  readFileSync(resolve(import.meta.dir, "../src/generated", name), "utf8");

test("generated files match docs/06_design-tokens.json (run make tokens)", () => {
  expect(committed("web.css.ts")).toBe(emitWeb(tokens));
  expect(committed("native.ts")).toBe(emitNative(tokens));
  expect(committed("print.ts")).toBe(emitPrint(tokens));
});

test("emitting twice gives the same text", () => {
  expect(emitWeb(tokens)).toBe(emitWeb(tokens));
  expect(emitNative(tokens)).toBe(emitNative(tokens));
  expect(emitPrint(tokens)).toBe(emitPrint(tokens));
});
