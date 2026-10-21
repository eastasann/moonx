import { describe, expect, test } from "vitest";
import {
  aiExportHref,
  aiImportHref,
  parseScope,
  safeReturnTo,
  scopeParam,
  searchText,
} from "./ai";

// 24's and 25's URL (SDD 4章): the scope as the export's header writes it.

const workspaceId = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const validation = ["01", "02", "04", "08", "10"].map((key) => ({ key }));
const plan = ["01", "02", "11", "16"].map((key) => ({ key }));

describe("scopeParam and parseScope", () => {
  test("write and read back the whole, sections, a part and items", () => {
    expect(scopeParam({ kind: "all" })).toBe("all");
    expect(scopeParam({ kind: "sections", keys: ["01", "10"] })).toBe("01,10");
    expect(scopeParam({ kind: "part", part: "b" })).toBe("part:b");
    expect(scopeParam({ kind: "items", itemNos: [1, 11] })).toBe("01,11");
    expect(parseScope("validation", "01,10", validation)).toEqual({
      kind: "sections",
      keys: ["01", "10"],
    });
    expect(parseScope("business_plan", "part:b", plan)).toEqual({
      kind: "part",
      part: "b",
    });
    expect(parseScope("business_plan", "11,01", plan)).toEqual({
      kind: "items",
      itemNos: [1, 11],
    });
  });

  test("keys the template lacks are dropped; nothing left is the whole", () => {
    expect(parseScope("validation", undefined, validation)).toEqual({
      kind: "all",
    });
    expect(parseScope("validation", "10,99", validation)).toEqual({
      kind: "sections",
      keys: ["10"],
    });
    expect(parseScope("validation", "99", validation)).toEqual({
      kind: "all",
    });
    // A part is a plan's alone.
    expect(parseScope("validation", "part:a", validation)).toEqual({
      kind: "all",
    });
  });
});

describe("safeReturnTo", () => {
  test("follows a screen of the workspace only", () => {
    const base = `/w/${workspaceId}`;
    expect(safeReturnTo(workspaceId, `${base}/ideas/x`)).toBe(
      `${base}/ideas/x`,
    );
    expect(safeReturnTo(workspaceId, base)).toBe(base);
    expect(
      safeReturnTo(workspaceId, `${base}/ideas/x/questions/01?q=V.01.WHO`),
    ).toBe(`${base}/ideas/x/questions/01?q=V.01.WHO`);
    for (const outside of [
      "https://example.com/",
      "//example.com/w",
      `/w/${workspaceId}x/ideas`,
      `/w/other/ideas`,
      `${base}/../../login`,
      `${base}//example.com`,
      `${base}/ideas\\x`,
      undefined,
    ]) {
      expect(safeReturnTo(workspaceId, outside)).toBeUndefined();
    }
  });
});

test("searchText takes back a number the router read from the URL", () => {
  expect(searchText("01,02")).toBe("01,02");
  expect(searchText(10)).toBe("10");
  expect(searchText(["01"])).toBeUndefined();
});

test("the links to 24 and 25 carry the target, the scope and where to return", () => {
  expect(
    aiExportHref(workspaceId, {
      kind: "validation",
      id: "v1",
      scope: "01",
      returnTo: `/w/${workspaceId}/ideas/i1`,
    }),
  ).toBe(
    `/w/${workspaceId}/ai/export?source=validation&id=v1&scope=01&returnTo=%2Fw%2F${workspaceId}%2Fideas%2Fi1`,
  );
  expect(aiImportHref(workspaceId, { kind: "self_analysis" })).toBe(
    `/w/${workspaceId}/ai/import?target=self_analysis`,
  );
});
