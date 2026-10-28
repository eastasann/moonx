import { describe, expect, test } from "vitest";
import { formatPanelTarget, parsePanelTarget } from "./panel-target";

const id = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("the panels' `target` (SDD 4章)", () => {
  test("an item, with a key that may hold a colon", () => {
    expect(parsePanelTarget(`competitor:${id}`)).toEqual({
      kind: "item",
      item: { type: "competitor", id, key: null },
    });
    expect(parsePanelTarget(`pitch_slide:${id}:five:title`)).toEqual({
      kind: "item",
      item: { type: "pitch_slide", id, key: "five:title" },
    });
  });

  test("a screen, with its sections or none", () => {
    expect(
      parsePanelTarget(`container:validation:${id}:04,competitors`),
    ).toEqual({
      kind: "screen",
      screen: {
        containerType: "validation",
        containerId: id,
        sectionKeys: ["04", "competitors"],
      },
    });
    expect(parsePanelTarget(`container:idea:${id}`)).toEqual({
      kind: "screen",
      screen: { containerType: "idea", containerId: id, sectionKeys: [] },
    });
    // 21's execution items of a type (SDD 6.3「画面と節の対応」).
    expect(
      parsePanelTarget(`container:business_plan:${id}:23,execution:milestone`),
    ).toEqual({
      kind: "screen",
      screen: {
        containerType: "business_plan",
        containerId: id,
        sectionKeys: ["23", "execution:milestone"],
      },
    });
  });

  test("anything else names nothing", () => {
    for (const value of [
      undefined,
      3,
      "",
      `nothing:${id}`,
      "competitor:not-a-uuid",
      `competitor:${id}:`,
      `container:plan:${id}`,
      `container:validation:${id}:04,`,
      `container:validation:${id}:,04`,
      `container:validation:${id}:`,
    ]) {
      expect(parsePanelTarget(value)).toBeUndefined();
    }
  });

  test("writes back what it reads", () => {
    for (const value of [
      `validation_answer:${id}:V.01.WHO`,
      `cost_item:${id}`,
      `container:validation:${id}:08,economics`,
      `container:business_plan:${id}:29,execution:next_action`,
      `container:idea:${id}`,
    ]) {
      const target = parsePanelTarget(value);
      expect(target).toBeDefined();
      if (target !== undefined) expect(formatPanelTarget(target)).toBe(value);
    }
  });
});
