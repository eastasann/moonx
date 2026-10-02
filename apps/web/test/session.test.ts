import { expect, test } from "vitest";
import { homePath, safeNext } from "../src/lib/session";
import { makeMe, OTHER, PERSONAL, WORKSPACE } from "./support";

test("a signed-in person lands in the last opened workspace", () => {
  expect(homePath(makeMe())).toBe(`/w/${WORKSPACE}`);
});

test("without a last workspace the personal one is used", () => {
  expect(homePath(makeMe({ lastWorkspaceId: null }))).toBe(`/w/${PERSONAL}`);
  expect(homePath(makeMe({ lastWorkspaceId: OTHER }))).toBe(`/w/${PERSONAL}`);
});

test("an account with no workspace goes to the account screen", () => {
  expect(homePath(makeMe({ lastWorkspaceId: null, memberships: [] }))).toBe("/account");
});

test("next only follows paths inside the app", () => {
  expect(safeNext("/account", "/")).toBe("/account");
  expect(safeNext("/w/1/ideas?stage=validate", "/")).toBe("/w/1/ideas?stage=validate");
  for (const bad of [
    undefined,
    "",
    "https://evil.example",
    "//evil.example",
    "/\\evil",
    "javascript:1",
    "/\t/evil.example",
    "/\n/evil.example",
  ]) {
    expect(safeNext(bad, "/home")).toBe("/home");
  }
});
