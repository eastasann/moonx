import { describe, expect, test } from "vitest";
import {
  assumptionsHref,
  competitorsHref,
  decisionsHref,
  hrefOf,
  notificationsHref,
  planHref,
  planItemHref,
  researchHref,
  sectionHref,
} from "./links";

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
    // A section 11 does not ask has its own screen.
    expect(
      hrefOf({ screen: 11, workspaceId, ideaId, sectionKey: "04" }),
    ).toBeUndefined();
  });

  test("10, 11 for a self-analysis question, and 12 on a member", () => {
    const userId = "6f1e2d3c-0000-4000-8000-000000000001";
    expect(hrefOf({ screen: 10, workspaceId })).toBe(
      `/w/${workspaceId}/self-analysis`,
    );
    expect(
      hrefOf({
        screen: 11,
        workspaceId,
        sectionKey: "WHY",
        questionKey: "SA.WHY.1",
      }),
    ).toBe(`/w/${workspaceId}/self-analysis/WHY?q=SA.WHY.1`);
    expect(hrefOf({ screen: 11, workspaceId })).toBeUndefined();
    expect(hrefOf({ screen: 12, workspaceId })).toBe(`/w/${workspaceId}/team`);
    expect(
      hrefOf({
        screen: 12,
        workspaceId,
        userId,
        panel: "comments",
        target: {
          type: "self_analysis_answer",
          id: "5a5a5a5a-0000-4000-8000-000000000001",
          key: "SA.WHY.1",
        },
      }),
    ).toBe(
      `/w/${workspaceId}/team/${userId}?panel=comments&target=self_analysis_answer%3A5a5a5a5a-0000-4000-8000-000000000001%3ASA.WHY.1`,
    );
    // 12 has no history (design-spec 6.11).
    expect(
      hrefOf({
        screen: 12,
        workspaceId,
        userId,
        panel: "history",
        target: {
          type: "self_analysis_answer",
          id: "5a5a5a5a-0000-4000-8000-000000000001",
          key: "SA.WHY.1",
        },
      }),
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

  test("15 on a pattern question or a competitor; 16 on a list's row", () => {
    const rowId = "8a1b2c3d-0000-4000-8000-000000000001";
    expect(
      hrefOf({
        screen: 15,
        workspaceId,
        ideaId,
        questionKey: "V.04.SURVIVOR_PATTERNS",
      }),
    ).toBe(`${idea}/competitors?q=V.04.SURVIVOR_PATTERNS`);
    expect(hrefOf({ screen: 15, workspaceId, ideaId, rowId })).toBe(
      `${idea}/competitors?row=${rowId}`,
    );
    expect(
      hrefOf({ screen: 16, workspaceId, ideaId, tab: "risks", rowId }),
    ).toBe(`${idea}/assumptions?tab=risks&row=${rowId}`);
    // A tab 16 does not have is left out.
    expect(hrefOf({ screen: 16, workspaceId, ideaId, tab: "other" })).toBe(
      `${idea}/assumptions`,
    );
    expect(competitorsHref(workspaceId, ideaId, { view: "table" })).toBe(
      `${idea}/competitors?view=table`,
    );
    expect(assumptionsHref(workspaceId, ideaId, { new: 1 })).toBe(
      `${idea}/assumptions?new=1`,
    );
  });

  test("17 on a cost row, 18 on a number or V.08.WORTH, 19", () => {
    const rowId = "4c1d2e3f-0000-4000-8000-000000000001";
    expect(hrefOf({ screen: 17, workspaceId, ideaId, rowId })).toBe(
      `${idea}/costs?row=${rowId}`,
    );
    expect(
      hrefOf({ screen: 18, workspaceId, ideaId, field: "selling_price" }),
    ).toBe(`${idea}/economics?field=selling_price`);
    expect(
      hrefOf({ screen: 18, workspaceId, ideaId, questionKey: "V.08.WORTH" }),
    ).toBe(`${idea}/economics?q=V.08.WORTH`);
    expect(hrefOf({ screen: 19, workspaceId, ideaId })).toBe(`${idea}/decide`);
  });

  test("20 on a plan or a saved version of it; 21 on an item, focused, with its panel", () => {
    const planId = "2b3c4d5e-0000-4000-8000-000000000001";
    const versionId = "2b3c4d5e-0000-4000-8000-000000000002";
    expect(hrefOf({ screen: 20, workspaceId, ideaId, planId })).toBe(
      `${idea}/plans/${planId}`,
    );
    expect(hrefOf({ screen: 20, workspaceId, ideaId })).toBeUndefined();
    expect(planHref(workspaceId, ideaId, planId, { version: versionId })).toBe(
      `${idea}/plans/${planId}?version=${versionId}`,
    );
    expect(
      hrefOf({
        screen: 21,
        workspaceId,
        ideaId,
        planId,
        itemNo: 1,
        questionKey: "P.01.1",
      }),
    ).toBe(`${idea}/plans/${planId}/items/1?q=P.01.1`);
    expect(hrefOf({ screen: 21, workspaceId, ideaId, planId })).toBeUndefined();
    expect(
      planItemHref(workspaceId, ideaId, planId, 13, { version: versionId }),
    ).toBe(`${idea}/plans/${planId}/items/13?version=${versionId}`);
    expect(
      hrefOf({
        screen: 21,
        workspaceId,
        ideaId,
        planId,
        itemNo: 3,
        questionKey: "P.03.1",
        panel: "comments",
        target: { type: "plan_answer", id: planId, key: "P.03.1" },
      }),
    ).toBe(
      `${idea}/plans/${planId}/items/3?q=P.03.1&panel=comments&target=plan_answer%3A${planId}%3AP.03.1`,
    );
    expect(
      hrefOf({
        screen: 20,
        workspaceId,
        ideaId,
        planId,
        panel: "comments",
        target: { type: "idea", id: ideaId },
      }),
    ).toBe(`${idea}/plans/${planId}?panel=comments&target=idea%3A${ideaId}`);
  });

  test("13's sections: 01, 02 and 10 on 11, 03 on 14, 04 on 15, 05 on 17, 06–08 on 18, 09 on 16", () => {
    expect(sectionHref(workspaceId, ideaId, "10")).toBe(`${idea}/questions/10`);
    expect(sectionHref(workspaceId, ideaId, "03")).toBe(`${idea}/research`);
    expect(sectionHref(workspaceId, ideaId, "04")).toBe(`${idea}/competitors`);
    expect(sectionHref(workspaceId, ideaId, "05")).toBe(`${idea}/costs`);
    expect(sectionHref(workspaceId, ideaId, "06-08")).toBe(`${idea}/economics`);
    expect(sectionHref(workspaceId, ideaId, "09")).toBe(`${idea}/assumptions`);
  });

  test("a link with a panel opens it on the item, on the screens that have it", () => {
    const rowId = "4c1d2e3f-0000-4000-8000-000000000001";
    expect(
      hrefOf({
        screen: 17,
        workspaceId,
        ideaId,
        rowId,
        panel: "comments",
        target: { type: "cost_item", id: rowId },
      }),
    ).toBe(
      `${idea}/costs?row=${rowId}&panel=comments&target=cost_item%3A${rowId}`,
    );
    expect(
      hrefOf({
        screen: 13,
        workspaceId,
        ideaId,
        panel: "comments",
        target: { type: "idea", id: ideaId },
      }),
    ).toBe(`${idea}?panel=comments&target=idea%3A${ideaId}`);
    expect(
      hrefOf({
        screen: 17,
        workspaceId,
        ideaId,
        rowId,
        panel: "history",
        target: { type: "cost_item", id: rowId },
      }),
    ).toBe(
      `${idea}/costs?row=${rowId}&panel=history&target=cost_item%3A${rowId}`,
    );
    // The screens whose panels come later have no way in yet.
    expect(
      hrefOf({
        screen: 19,
        workspaceId,
        ideaId,
        panel: "comments",
        target: { type: "idea", id: ideaId },
      }),
    ).toBeUndefined();
  });

  test("7 with its filters and entry, and 8 with the unread", () => {
    expect(
      decisionsHref(workspaceId, {
        idea: ideaId,
        selected: "d0000000-0000-4000-8000-000000000001",
      }),
    ).toBe(
      `/w/${workspaceId}/decisions?idea=${ideaId}&selected=d0000000-0000-4000-8000-000000000001`,
    );
    expect(decisionsHref(workspaceId)).toBe(`/w/${workspaceId}/decisions`);
    expect(notificationsHref("unread")).toBe("/notifications?filter=unread");
  });
});
