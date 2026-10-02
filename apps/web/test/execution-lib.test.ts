import { createI18n } from "@moonx/i18n";
import { expect, test } from "vitest";
import {
  assigneeBody,
  assigneeChoiceOf,
  EXECUTION_KEYS,
  executionLayout,
  executionSpecs,
  filterActions,
  groupExecutionItems,
  isOrderable,
  movedExecutionIds,
} from "../src/lib/execution";
import { PLAN_ITEM_KEYS } from "../src/lib/plan-item";
import { ACTIONS, ANA, execItem, KPIS, LAUNCH, PAOLO } from "./support-execution";

const i18n = createI18n();
const t = i18n.t.bind(i18n);

const leaves = (value: unknown): string[] =>
  typeof value === "string" ? [value] : Object.values(value as object).flatMap(leaves);

test("every catalog key the plan screens look up through a table exists", () => {
  const missing = [...leaves(EXECUTION_KEYS), ...leaves(PLAN_ITEM_KEYS)].filter(
    (key) => typeof i18n.t(key) !== "string" || i18n.t(key) === key,
  );
  expect(missing).toEqual([]);
});

test("the assignee goes as one kind, the other sent as null", () => {
  expect(assigneeBody({ kind: "member", userId: PAOLO.id })).toEqual({
    assigneeUserId: PAOLO.id,
    assigneeName: null,
  });
  expect(assigneeBody({ kind: "name", name: "  Uncle Ben " })).toEqual({
    assigneeUserId: null,
    assigneeName: "Uncle Ben",
  });
  expect(assigneeBody({ kind: "name", name: "   " })).toEqual({
    assigneeUserId: null,
    assigneeName: null,
  });
  expect(assigneeBody({ kind: "none" })).toEqual({ assigneeUserId: null, assigneeName: null });
  expect(assigneeChoiceOf({ user: ANA })).toEqual({ kind: "member", userId: ANA.id });
  expect(assigneeChoiceOf({ name: "Ben" })).toEqual({ kind: "name", name: "Ben" });
  expect(assigneeChoiceOf(null)).toEqual({ kind: "none" });
});

test("a type's form holds exactly the columns of its original table", () => {
  const keys = (type: Parameters<typeof executionSpecs>[1]) =>
    executionLayout(type).flatMap((part) => (part.part === "fields" ? part.keys : [part.part]));
  expect(keys("milestone")).toEqual([
    "title",
    "goal",
    "assignee",
    "dueDate",
    "exitCondition",
    "status",
  ]);
  expect(keys("launch")).toEqual([
    "title",
    "timing",
    "actions",
    "assignee",
    "completionCriteria",
    "dueDate",
    "status",
  ]);
  expect(keys("kpi")).toEqual([
    "kpiArea",
    "title",
    "kpiTarget",
    "kpiReviewFrequency",
    "assignee",
    "kpiActual",
  ]);
  expect(keys("open_question")).toEqual([
    "title",
    "whyItMatters",
    "assignee",
    "dueDate",
    "status",
    "answer",
  ]);
  expect(keys("next_action")).toEqual(["title", "assignee", "dueDate", "status"]);
  for (const type of ["milestone", "launch", "kpi", "open_question", "next_action"] as const) {
    const specKeys = executionSpecs(t, type).map((spec) => spec.key);
    const laid = keys(type).filter((key) => key !== "assignee" && key !== "timing");
    expect(specKeys.filter((key) => key !== "launchTiming").sort()).toEqual(laid.sort());
  }
});

test("statuses are the type's own: open and resolved for questions, none for a KPI", () => {
  const status = (type: Parameters<typeof executionSpecs>[1]) => {
    const spec = executionSpecs(t, type).find((s) => s.key === "status");
    return spec?.kind === "choice" ? spec.options.map((o) => o.label) : null;
  };
  expect(status("open_question")).toEqual(["Open", "Resolved"]);
  expect(status("next_action")).toEqual(["To do", "Doing", "Done"]);
  expect(status("kpi")).toBeNull();
});

test("launch rows group by bucket in order and KPIs by Area in the order they come", () => {
  expect(groupExecutionItems(t, "launch", LAUNCH).map((g) => [g.label, g.items.length])).toEqual([
    ["T-30", 2],
    ["Launch day", 1],
    ["Other", 1],
  ]);
  expect(groupExecutionItems(t, "kpi", KPIS).map((g) => [g.label, g.items.length])).toEqual([
    ["Financial", 2],
    ["Customer", 1],
  ]);
  expect(groupExecutionItems(t, "kpi", [execItem("kpi", "No area")]).map((g) => g.label)).toEqual([
    "No area",
  ]);
  expect(groupExecutionItems(t, "milestone", [])).toEqual([]);
});

test("moving swaps with the neighbour in the group and keeps the other groups' places", () => {
  const first = LAUNCH[0];
  const third = LAUNCH[2];
  if (!first || !third) throw new Error("fixture");
  const group = LAUNCH.filter((row) => row.launchTiming === "t_minus_30");
  expect(movedExecutionIds(LAUNCH, group, third.id, "up")).toEqual([
    third.id,
    LAUNCH[1]?.id,
    first.id,
    LAUNCH[3]?.id,
  ]);
  expect(movedExecutionIds(LAUNCH, group, first.id, "up")).toBeNull();
  expect(movedExecutionIds(LAUNCH, group, third.id, "down")).toBeNull();
  expect(isOrderable("next_action")).toBe(false);
  expect(isOrderable("milestone")).toBe(true);
});

test("next actions filter by assignee, status and overdue, keeping their order", () => {
  const none = { assignee: undefined, status: undefined, overdueOnly: false };
  const titles = (rows: typeof ACTIONS) => rows.map((row) => row.title);
  expect(titles(filterActions(ACTIONS, none, ANA.id))).toHaveLength(4);
  expect(titles(filterActions(ACTIONS, { ...none, assignee: "me" }, ANA.id))).toEqual([
    "Call the landlord",
  ]);
  expect(titles(filterActions(ACTIONS, { ...none, assignee: PAOLO.id }, ANA.id))).toEqual([
    "Order boxes",
  ]);
  expect(titles(filterActions(ACTIONS, { ...none, status: "done" }, ANA.id))).toEqual([
    "Pick a logo",
  ]);
  expect(titles(filterActions(ACTIONS, { ...none, overdueOnly: true }, ANA.id))).toEqual([
    "File permit",
  ]);
});
