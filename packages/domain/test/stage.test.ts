import { describe, expect, test } from "bun:test";
import { decideStage } from "../src";

describe("decideStage", () => {
  test("no plan is validation", () => {
    expect(decideStage([])).toBe("validation");
  });
  test("a plan is planning", () => {
    expect(decideStage([{ archived: false, latestGoNoGo: null }])).toBe("planning");
    expect(decideStage([{ archived: false, latestGoNoGo: "delay" }])).toBe("planning");
    expect(decideStage([{ archived: false, latestGoNoGo: "stop" }])).toBe("planning");
  });
  test("any plan whose latest Go / No-Go is launch is launch prep", () => {
    expect(
      decideStage([
        { archived: false, latestGoNoGo: "delay" },
        { archived: false, latestGoNoGo: "launch" },
      ]),
    ).toBe("launch_prep");
  });
  test("archived plans are ignored", () => {
    expect(decideStage([{ archived: true, latestGoNoGo: "launch" }])).toBe("validation");
    expect(
      decideStage([
        { archived: true, latestGoNoGo: "launch" },
        { archived: false, latestGoNoGo: null },
      ]),
    ).toBe("planning");
  });
});
