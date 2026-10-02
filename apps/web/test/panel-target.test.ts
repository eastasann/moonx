import { expect, test } from "vitest";
import {
  commentTargetOf,
  formatContainerTarget,
  formatItemTarget,
  parsePanelTarget,
} from "../src/lib/panel-target";

test("an item target round-trips, and a key may contain colons", () => {
  const raw = formatItemTarget("validation_answer", "id-1", "V.01:WHO");
  expect(raw).toBe("validation_answer:id-1:V.01:WHO");
  expect(parsePanelTarget(raw)).toEqual({
    kind: "item",
    type: "validation_answer",
    id: "id-1",
    key: "V.01:WHO",
  });
  expect(parsePanelTarget("competitor:id-2")).toEqual({
    kind: "item",
    type: "competitor",
    id: "id-2",
    key: null,
  });
});

test("a container target round-trips with and without a section", () => {
  expect(formatContainerTarget("business_plan", "p1")).toBe("container:business_plan:p1");
  expect(parsePanelTarget("container:business_plan:p1")).toEqual({
    kind: "container",
    containerType: "business_plan",
    id: "p1",
    sectionKey: null,
  });
  expect(parsePanelTarget(formatContainerTarget("validation", "v1", "costs"))).toEqual({
    kind: "container",
    containerType: "validation",
    id: "v1",
    sectionKey: "costs",
  });
});

test("a value that names no target is null", () => {
  for (const raw of [
    undefined,
    "",
    "nonsense:1",
    "container:nowhere:1",
    "container:idea",
    "idea",
  ]) {
    expect(parsePanelTarget(raw)).toBeNull();
  }
});

test("comment targets: commentable items and ideas only", () => {
  expect(commentTargetOf(parsePanelTarget("risk:r1"))).toBe("risk:r1");
  expect(commentTargetOf(parsePanelTarget("business_plan:p1"))).toBeNull();
  expect(commentTargetOf(parsePanelTarget("container:idea:i1"))).toBe("idea:i1");
  expect(commentTargetOf(parsePanelTarget("container:validation:v1"))).toBeNull();
  expect(commentTargetOf(null)).toBeNull();
});
