import { describe, expect, test } from "vitest";
import { hrefOf, researchHref, sectionHref } from "./links";

const workspaceId = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const ideaId = "ece58aa6-e77d-4895-b5cf-e8f366bd4e46";
const idea = `/w/${workspaceId}/ideas/${ideaId}`;

describe("the routes of the screens the API names (SDD 4章・5.2 LinkTarget)", () => {
  test("11 for a validation question, focused on it", () => {
    expect(
      hrefOf({
        screen: 11,
        workspaceId,
        ideaId,
        sectionKey: "02",
        questionKey: "V.02.OCEAN",
      }),
    ).toBe(`${idea}/questions/02?q=V.02.OCEAN`);
    // The self-analysis's 11 and a section 11 does not ask have no route yet.
    expect(
      hrefOf({ screen: 11, workspaceId, sectionKey: "WHY" }),
    ).toBeUndefined();
    expect(
      hrefOf({ screen: 11, workspaceId, ideaId, sectionKey: "04" }),
    ).toBeUndefined();
  });

  test("14 with an entry, or a new entry with its tags", () => {
    expect(
      hrefOf({
        screen: 14,
        workspaceId,
        ideaId,
        rowId: "5e8c1d2a-0000-4000-8000-000000000001",
      }),
    ).toBe(`${idea}/research?entry=5e8c1d2a-0000-4000-8000-000000000001`);
    expect(
      hrefOf({
        screen: 14,
        workspaceId,
        ideaId,
        newEntry: true,
        presetSupports: ["permits"],
      }),
    ).toBe(`${idea}/research?new=1&presetSupports=permits`);
    expect(researchHref(workspaceId, ideaId, { supports: "local_price" })).toBe(
      `${idea}/research?supports=local_price`,
    );
  });

  test("13's sections: 01, 02 and 10 on 11, 03 on 14, the others not yet", () => {
    expect(sectionHref(workspaceId, ideaId, "10")).toBe(`${idea}/questions/10`);
    expect(sectionHref(workspaceId, ideaId, "03")).toBe(`${idea}/research`);
    expect(sectionHref(workspaceId, ideaId, "05")).toBeUndefined();
  });
});
