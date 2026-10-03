import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderApp } from "./support";
import { PLAN, PLAN_ID, registerPlanHooks, viewerMe, writes } from "./support-execution";
import { ITEM_1, ITEM_PATH, planItemApi, VERSION_ID } from "./support-plan-item";

registerPlanHooks();

const ITEM_BASE = `/w/11111111-1111-4111-8111-111111111111/ideas/55555555-5555-4555-8555-555555555555/plans/${PLAN_ID}/items`;

test("the section menu lists the plan's items by number and title", async () => {
  planItemApi();
  const user = userEvent.setup();
  await renderApp(ITEM_PATH(1));
  await user.click(await screen.findByRole("button", { name: "Switch section" }));
  const items = await screen.findAllByRole("menuitem");
  expect(items.map((item) => item.textContent)).toEqual([
    "1. Executive Summary",
    "2. Vision & Purpose",
    "11. Founder Roles",
  ]);
  expect(items[2]).toHaveAttribute("href", `${ITEM_BASE}/11`);
});

test("Next and Previous move between items, and the first item has no Previous", async () => {
  planItemApi();
  const user = userEvent.setup();
  const { router } = await renderApp(ITEM_PATH(1));
  expect(await screen.findByRole("button", { name: "← Previous section" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Next section →" }));
  await waitFor(() => expect(router.state.location.pathname).toBe(`${ITEM_BASE}/2`));
  expect(
    await screen.findByRole("heading", { level: 1, name: "2. Vision & Purpose" }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "← Previous section" }));
  await waitFor(() => expect(router.state.location.pathname).toBe(`${ITEM_BASE}/1`));
});

test("the AI menu exports and imports this item of the plan", async () => {
  planItemApi();
  const user = userEvent.setup();
  await renderApp(ITEM_PATH(1));
  await user.click(await screen.findByRole("button", { name: "AI" }));
  const returnTo = encodeURIComponent(ITEM_PATH(1));
  expect(await screen.findByRole("menuitem", { name: "Export for AI" })).toHaveAttribute(
    "href",
    `/w/11111111-1111-4111-8111-111111111111/ai/export?source=business_plan&id=${PLAN_ID}&scope=1&returnTo=${returnTo}`,
  );
  // An import covers the whole plan, so it carries no scope (design-spec 6.7).
  expect(screen.getByRole("menuitem", { name: "Import from AI" })).toHaveAttribute(
    "href",
    `/w/11111111-1111-4111-8111-111111111111/ai/import?target=business_plan&id=${PLAN_ID}&returnTo=${returnTo}`,
  );
});

test("a Viewer reads every sub-item with no input, no focus mode and no AI menu", async () => {
  const { calls } = planItemApi({}, { me: viewerMe() });
  await renderApp(ITEM_PATH(1));
  const field = await screen.findByRole("textbox", { name: "Prompt of What is the business?" });
  expect(field).toHaveAttribute("readonly");
  expect(
    screen.getByRole("textbox", { name: "Prompt of Who is the primary customer?" }),
  ).toHaveAttribute("readonly");
  expect(screen.queryByRole("switch", { name: "Focus" })).toBeNull();
  expect(screen.queryByRole("button", { name: "AI" })).toBeNull();
  expect(writes(calls)).toHaveLength(0);
});

test("the API's readOnly makes the item read only, whoever the person is", async () => {
  planItemApi({}, { planItems: { 1: { ...ITEM_1, readOnly: true } } });
  await renderApp(ITEM_PATH(1));
  const field = await screen.findByRole("textbox", { name: "Prompt of What is the business?" });
  expect(field).toHaveAttribute("readonly");
  expect(screen.queryByRole("button", { name: "AI" })).toBeNull();
});

test("an archived plan and an archived idea each say so", async () => {
  planItemApi(
    {},
    { planItems: { 1: { ...ITEM_1, readOnly: true } }, planArchived: true, archived: true },
  );
  await renderApp(ITEM_PATH(1));
  expect(await screen.findByText("This plan is archived")).toBeInTheDocument();
  expect(screen.getByText("This idea is archived")).toBeInTheDocument();
});

test("a saved version is announced as read only and its number is carried through the links", async () => {
  planItemApi(
    {},
    {
      planItems: { 1: ITEM_1, 2: { ...ITEM_1, itemNo: 2, title: "Vision & Purpose" } },
      versionItems: { 1: { ...ITEM_1, readOnly: true } },
    },
  );
  const user = userEvent.setup();
  const { router } = await renderApp(ITEM_PATH(1, `?version=${VERSION_ID}`));
  expect(await screen.findByText("Viewing v1 For advisors (read only)")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Prompt of What is the business?" })).toHaveAttribute(
    "readonly",
  );
  expect(screen.queryByRole("button", { name: "Comments" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Next section →" }));
  await waitFor(() => expect(router.state.location.pathname).toBe(`${ITEM_BASE}/2`));
  expect(router.state.location.search).toMatchObject({ version: VERSION_ID });
});

test("while the item loads a skeleton shows", async () => {
  planItemApi();
  const answer = globalThis.fetch;
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
    new URL(String(input instanceof Request ? input.url : input), "http://localhost").pathname ===
    `${PLAN}/items/1`
      ? new Promise<Response>(() => {})
      : answer(input, init),
  );
  await renderApp(ITEM_PATH(1));
  expect(await screen.findByRole("status", { name: "Loading" })).toBeInTheDocument();
});

test("a failed read shows the retry state and Retry loads the item", async () => {
  let failing = true;
  planItemApi({
    [`GET ${PLAN}/items/1`]: () =>
      failing
        ? { status: 429, body: { error: { code: "RATE_LIMITED", message: "x", requestId: "r" } } }
        : { body: ITEM_1 },
  });
  const user = userEvent.setup();
  await renderApp(ITEM_PATH(1));
  const retry = await screen.findByRole("button", { name: "Retry" });
  failing = false;
  await user.click(retry);
  expect(
    await screen.findByRole("heading", { level: 1, name: "1. Executive Summary" }),
  ).toBeInTheDocument();
});

test("a plan of another workspace shows no access", async () => {
  planItemApi({
    [`GET ${PLAN}`]: () => ({
      status: 403,
      body: { error: { code: "NO_ACCESS", message: "x", requestId: "r" } },
    }),
  });
  await renderApp(ITEM_PATH(1));
  expect(await screen.findByText(/don't have access/i)).toBeInTheDocument();
});

test("a save writes the answer back and does not read the item again, but marks the plan home stale", async () => {
  const { calls } = planItemApi();
  const user = userEvent.setup();
  await renderApp(ITEM_PATH(1));
  const field = await screen.findByRole("textbox", {
    name: "Prompt of Who is the primary customer?",
  });
  const itemReads = () =>
    calls.filter((c) => c.method === "GET" && c.url.pathname === `${PLAN}/items/1`);
  const homeReads = () => calls.filter((c) => c.method === "GET" && c.url.pathname === PLAN);
  expect(itemReads()).toHaveLength(1);
  const before = homeReads().length;
  await user.type(field, "Offices");
  await user.tab();
  await waitFor(() => expect(writes(calls).filter((c) => c.method === "PUT")).toHaveLength(1));
  await waitFor(() => expect(homeReads().length).toBeGreaterThan(before));
  expect(itemReads()).toHaveLength(1);
  expect(within(screen.getByRole("main")).getByText("Offices")).toBeInTheDocument();
});
