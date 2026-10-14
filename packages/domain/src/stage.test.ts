import { expect, test } from "bun:test";
import { ideaStage } from "./stage";

test("no plan is Validation", () => {
  expect(ideaStage([])).toBe("validation");
});

test("a plan is Planning, whatever its Go / No-Go other than Launch", () => {
  expect(ideaStage([{ archived: false, latestGoNoGo: null }])).toBe("planning");
  expect(
    ideaStage([
      { archived: false, latestGoNoGo: "delay" },
      { archived: false, latestGoNoGo: "stop" },
    ]),
  ).toBe("planning");
});

test("any plan whose latest Go / No-Go is Launch is Launch prep", () => {
  expect(
    ideaStage([
      { archived: false, latestGoNoGo: "delay" },
      { archived: false, latestGoNoGo: "launch" },
    ]),
  ).toBe("launch_prep");
});

test("archived plans do not count", () => {
  expect(ideaStage([{ archived: true, latestGoNoGo: "launch" }])).toBe(
    "validation",
  );
  expect(
    ideaStage([
      { archived: true, latestGoNoGo: "launch" },
      { archived: false, latestGoNoGo: null },
    ]),
  ).toBe("planning");
});
