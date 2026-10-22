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
      `container:validation:${id}:04:05`,
    ]) {
      expect(parsePanelTarget(value)).toBeUndefined();
    }
  });

  test("writes back what it reads", () => {
    for (const value of [
      `validation_answer:${id}:V.01.WHO`,
      `cost_item:${id}`,
      `container:validation:${id}:08,economics`,
      `container:idea:${id}`,
    ]) {
      const target = parsePanelTarget(value);
      expect(target).toBeDefined();
      if (target !== undefined) expect(formatPanelTarget(target)).toBe(value);
    }
  });
});
