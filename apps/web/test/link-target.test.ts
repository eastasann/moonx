import type { LinkTarget } from "@moonx/schemas";
import { expect, test } from "vitest";
import { linkTargetPath } from "../src/lib/link-target";

const WS = "11111111-1111-4111-8111-111111111111";
const IDEA = "22222222-2222-4222-8222-222222222222";
const PLAN = "33333333-3333-4333-8333-333333333333";
const ROW = "44444444-4444-4444-8444-444444444444";
const base = { workspaceId: WS, ideaId: IDEA };

const path = (target: LinkTarget) => linkTargetPath(target);

test("questions of a validation open the section with the question focused", () => {
  expect(path({ ...base, screen: 11, sectionKey: "01", questionKey: "V.01.WHO" })).toBe(
    `/w/${WS}/ideas/${IDEA}/questions/01?q=V.01.WHO`,
  );
  expect(path({ ...base, screen: 11, sectionKey: "10" })).toBe(
    `/w/${WS}/ideas/${IDEA}/questions/10`,
  );
});

test("questions without an idea are the self analysis form", () => {
  expect(path({ workspaceId: WS, screen: 11, sectionKey: "WHY", questionKey: "SA.WHY.1" })).toBe(
    `/w/${WS}/self-analysis/WHY?q=SA.WHY.1`,
  );
});

test("the validation screens map to their routes", () => {
  expect(path({ ...base, screen: 13 })).toBe(`/w/${WS}/ideas/${IDEA}`);
  expect(path({ ...base, screen: 14 })).toBe(`/w/${WS}/ideas/${IDEA}/research`);
  expect(path({ ...base, screen: 14, tab: "new" })).toBe(`/w/${WS}/ideas/${IDEA}/research?new=1`);
  expect(path({ ...base, screen: 14, rowId: ROW })).toBe(
    `/w/${WS}/ideas/${IDEA}/research?entry=${ROW}`,
  );
  expect(path({ ...base, screen: 15 })).toBe(`/w/${WS}/ideas/${IDEA}/competitors`);
  expect(path({ ...base, screen: 15, questionKey: "V.04.SURVIVOR_PATTERNS" })).toBe(
    `/w/${WS}/ideas/${IDEA}/competitors?q=V.04.SURVIVOR_PATTERNS`,
  );
  expect(path({ ...base, screen: 16, tab: "risks", rowId: ROW })).toBe(
    `/w/${WS}/ideas/${IDEA}/assumptions?tab=risks&row=${ROW}`,
  );
  expect(path({ ...base, screen: 17 })).toBe(`/w/${WS}/ideas/${IDEA}/costs`);
  expect(path({ ...base, screen: 17, rowId: ROW })).toBe(`/w/${WS}/ideas/${IDEA}/costs?row=${ROW}`);
  expect(path({ ...base, screen: 17, tab: "monthly_fixed" })).toBe(
    `/w/${WS}/ideas/${IDEA}/costs?tab=monthly_fixed`,
  );
  expect(path({ ...base, screen: 18, field: "selling_price" })).toBe(
    `/w/${WS}/ideas/${IDEA}/economics?field=selling_price`,
  );
  expect(path({ ...base, screen: 19 })).toBe(`/w/${WS}/ideas/${IDEA}/decide`);
});

test("the decision log filters to the idea", () => {
  expect(path({ ...base, screen: 7 })).toBe(`/w/${WS}/decisions?idea=${IDEA}`);
  expect(path({ workspaceId: WS, screen: 7 })).toBe(`/w/${WS}/decisions`);
});

test("plan screens need a plan", () => {
  expect(path({ ...base, planId: PLAN, screen: 20 })).toBe(`/w/${WS}/ideas/${IDEA}/plans/${PLAN}`);
  expect(path({ ...base, planId: PLAN, screen: 21, itemNo: 3, questionKey: "P.03.1" })).toBe(
    `/w/${WS}/ideas/${IDEA}/plans/${PLAN}/items/3?q=P.03.1`,
  );
  expect(path({ ...base, planId: PLAN, screen: 22, tab: "kpis" })).toBe(
    `/w/${WS}/ideas/${IDEA}/plans/${PLAN}/execution?tab=kpis`,
  );
  expect(path({ ...base, screen: 20 })).toBeNull();
});

test("workspace screens map to their routes", () => {
  expect(path({ workspaceId: WS, screen: 5 })).toBe(`/w/${WS}`);
  expect(path({ workspaceId: WS, screen: 6 })).toBe(`/w/${WS}/ideas`);
  expect(path({ workspaceId: WS, screen: 9 })).toBe(`/w/${WS}/settings`);
  expect(path({ workspaceId: WS, screen: 10 })).toBe(`/w/${WS}/self-analysis`);
  expect(path({ workspaceId: WS, screen: 12, userId: ROW })).toBe(`/w/${WS}/team/${ROW}`);
  expect(path({ screen: 8 })).toBe("/notifications");
});

test("a panel and its target become search parameters", () => {
  expect(
    path({
      ...base,
      screen: 11,
      sectionKey: "01",
      panel: "comments",
      target: { type: "validation_answer", id: ROW, key: "V.01.WHO" },
    }),
  ).toBe(
    `/w/${WS}/ideas/${IDEA}/questions/01?panel=comments&target=validation_answer%3A${ROW}%3AV.01.WHO`,
  );
});

test("the context workspace fills in a target without one", () => {
  expect(linkTargetPath({ screen: 13, ideaId: IDEA }, { workspaceId: WS })).toBe(
    `/w/${WS}/ideas/${IDEA}`,
  );
  expect(linkTargetPath({ screen: 13, ideaId: IDEA })).toBeNull();
});

test("a screen without a Web route has no path", () => {
  expect(path({ ...base, screen: 99 })).toBeNull();
});
