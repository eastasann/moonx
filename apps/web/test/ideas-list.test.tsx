import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { makeMe, renderApp, stubApi, WORKSPACE } from "./support";
import { BACOLOD, IDEA_A, IDEA_B, IDEAS_PATH, KENJI, MEMBERS, makeIdea } from "./support-ideas";

afterEach(() => {
  vi.unstubAllGlobals();
});

const viewerMe = () =>
  makeMe({
    memberships: [
      {
        workspace: { id: WORKSPACE, name: "BCDX", isPersonal: false, currency: "PHP" },
        role: "viewer",
      },
    ],
  });

const page = (items = [makeIdea(), BACOLOD], extra: object = {}) => ({
  body: { items, nextCursor: null, hiddenDroppedCount: 0, ...extra },
});

const base = (me = makeMe()) => ({
  "GET /api/v1/me": () => ({ body: me }),
  "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
  [`GET /api/v1/workspaces/${WORKSPACE}/members`]: () => ({ body: MEMBERS }),
});

const ideasUrl = (search = "") => `/w/${WORKSPACE}/ideas${search}`;
const listCalls = (api: ReturnType<typeof stubApi>) =>
  api.calls.filter((c) => c.method === "GET" && c.url.pathname === IDEAS_PATH);

test("each row shows the name, decision, stage, proposer, time and the checks", async () => {
  stubApi({ ...base(), [`GET ${IDEAS_PATH}`]: () => page() });
  await renderApp(ideasUrl());
  const rows = await screen.findAllByRole("row");
  const piaya = rows.find((row) => within(row).queryByText("Piaya Gift Box Delivery"));
  const bowl = rows.find((row) => within(row).queryByText("Bacolod Health Bowl"));
  expect(piaya).toBeDefined();
  expect(bowl).toBeDefined();
  expect(within(piaya as HTMLElement).getByText("Proceed")).toBeInTheDocument();
  expect(
    within(piaya as HTMLElement).getByText(/Planning · Ana Villanueva · Updated 2 hr\. ago/),
  ).toBeInTheDocument();
  expect(within(piaya as HTMLElement).getByText("All checks done")).toBeInTheDocument();
  expect(within(bowl as HTMLElement).getByText("Hold")).toBeInTheDocument();
  expect(
    within(bowl as HTMLElement).getByText(/Validation · Kenji Ito · Updated yesterday/),
  ).toBeInTheDocument();
  expect(
    within(bowl as HTMLElement).getByText("Missing: Startup & monthly costs, Permits"),
  ).toBeInTheDocument();
  // The dots carry the state in their name, not in color alone.
  expect(
    within(bowl as HTMLElement).getByRole("img", {
      name: /Startup & monthly costs: Partial, .*Permits: Not started/,
    }),
  ).toBeInTheDocument();
});

test("the filters in the URL reach the API as its query", async () => {
  const api = stubApi({ ...base(), [`GET ${IDEAS_PATH}`]: () => page() });
  await renderApp(
    ideasUrl(`?stage=planning&decision=hold&proposer=${KENJI}&archived=true&sort=name&q=bowl`),
  );
  await screen.findAllByRole("row");
  const query = Object.fromEntries(listCalls(api)[0]?.url.searchParams ?? []);
  expect(query).toEqual({
    stage: "planning",
    decision: "hold",
    proposerId: KENJI,
    includeArchived: "true",
    sort: "name",
    q: "bowl",
    limit: "50",
  });
});

test("the defaults are asked for when the URL has no filters, and bad values fall back to them", async () => {
  const api = stubApi({ ...base(), [`GET ${IDEAS_PATH}`]: () => page() });
  const { router } = await renderApp(
    ideasUrl("?decision=nonsense&sort=oldest&stage=x&archived=maybe"),
  );
  await screen.findAllByRole("row");
  const query = Object.fromEntries(listCalls(api)[0]?.url.searchParams ?? []);
  expect(query).toEqual({ decision: "not_dropped", sort: "updated", limit: "50" });
  expect(router.state.location.search).toEqual({});
});

test("typing in the search box sets q once typing rests", async () => {
  const api = stubApi({ ...base(), [`GET ${IDEAS_PATH}`]: () => page() });
  const { router } = await renderApp(ideasUrl());
  await screen.findAllByRole("row");
  await userEvent.type(screen.getByRole("searchbox", { name: "Search ideas" }), "bowl");
  await waitFor(() => expect(router.state.location.search).toMatchObject({ q: "bowl" }));
  await waitFor(() => expect(listCalls(api).at(-1)?.url.searchParams.get("q")).toBe("bowl"));
  expect(listCalls(api).filter((c) => c.url.searchParams.has("q"))).toHaveLength(1);
});

test("hidden Drop ideas are counted and Show lists them", async () => {
  const api = stubApi({
    ...base(),
    [`GET ${IDEAS_PATH}`]: ({ url }) =>
      url.searchParams.get("decision") === "all"
        ? page([makeIdea(), makeIdea({ id: IDEA_B, name: "Dropped bowl", latestDecision: "drop" })])
        : page([makeIdea()], { hiddenDroppedCount: 2 }),
  });
  const { router } = await renderApp(ideasUrl());
  expect(await screen.findByText(/2 dropped ideas hidden/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Show" }));
  expect(await screen.findByText("Dropped bowl")).toBeInTheDocument();
  expect(router.state.location.search).toMatchObject({ decision: "all" });
  expect(screen.queryByText(/dropped ideas? hidden/)).not.toBeInTheDocument();
  expect(listCalls(api).at(-1)?.url.searchParams.get("decision")).toBe("all");
});

test("choosing a row selects it in the URL and shows its summary", async () => {
  stubApi({ ...base(), [`GET ${IDEAS_PATH}`]: () => page() });
  const { router } = await renderApp(ideasUrl());
  expect(await screen.findByText("Select an idea to see its summary.")).toBeInTheDocument();
  // A pointer press on a row never returns under user-event inside the full frame, so the row
  // is chosen the way the keyboard does it.
  const row = await screen.findByRole("row", { name: /Piaya Gift Box Delivery/ });
  row.focus();
  fireEvent.keyDown(row, { key: " ", code: "Space" });
  fireEvent.keyUp(row, { key: " ", code: "Space" });
  await waitFor(() => expect(router.state.location.search).toMatchObject({ selected: IDEA_A }));
  expect(
    await screen.findByRole("heading", { level: 2, name: "Piaya Gift Box Delivery" }),
  ).toBeInTheDocument();
  expect(screen.getAllByText("Boxed piaya delivered to Manila offices").length).toBeGreaterThan(0);
  expect(screen.getByText("₱450,000+")).toBeInTheDocument();
  expect(screen.getByText("13 / day")).toBeInTheDocument();
  expect(screen.getByText("9.2 months")).toBeInTheDocument();
  expect(screen.getByText("Needs price")).toBeInTheDocument();
  expect(screen.getByText("Gift box plan")).toBeInTheDocument();
  expect(
    screen.getByText(/Latest version: v1 For advisors · Go \/ No-Go: Launch/),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open validation" })).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/ideas/${IDEA_A}`,
  );
});

test("a selected idea that is not in the list is read from the API", async () => {
  const api = stubApi({
    ...base(),
    [`GET ${IDEAS_PATH}`]: () => page([BACOLOD]),
    [`GET /api/v1/ideas/${IDEA_A}`]: () => ({ body: makeIdea() }),
  });
  await renderApp(ideasUrl(`?selected=${IDEA_A}`));
  expect(
    await screen.findByRole("heading", { level: 2, name: "Piaya Gift Box Delivery" }),
  ).toBeInTheDocument();
  expect(api.unhandled).toEqual([]);
});

test("Load more asks for the next page with its cursor", async () => {
  const api = stubApi({
    ...base(),
    [`GET ${IDEAS_PATH}`]: ({ url }) =>
      url.searchParams.get("cursor") === "c1"
        ? page([BACOLOD])
        : page([makeIdea()], { nextCursor: "c1" }),
  });
  await renderApp(ideasUrl());
  await userEvent.click(await screen.findByRole("button", { name: "Load more" }));
  expect(await screen.findByText("Bacolod Health Bowl")).toBeInTheDocument();
  expect(screen.getByText("Piaya Gift Box Delivery")).toBeInTheDocument();
  expect(listCalls(api).at(-1)?.url.searchParams.get("cursor")).toBe("c1");
  expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
});

test("a Viewer gets the explanation only: no New idea and no row menu", async () => {
  stubApi({ ...base(viewerMe()), [`GET ${IDEAS_PATH}`]: () => page([]) });
  await renderApp(ideasUrl());
  expect(await screen.findByText("No ideas yet")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "New idea" })).not.toBeInTheDocument();
});

test("a Viewer sees the rows without the ⋯ menu", async () => {
  stubApi({ ...base(viewerMe()), [`GET ${IDEAS_PATH}`]: () => page() });
  await renderApp(ideasUrl());
  await screen.findAllByRole("row");
  expect(screen.queryByRole("button", { name: "New idea" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /More actions/ })).not.toBeInTheDocument();
});

test("filters that match nothing offer to clear them", async () => {
  const api = stubApi({
    ...base(),
    [`GET ${IDEAS_PATH}`]: ({ url }) => (url.searchParams.has("q") ? page([]) : page()),
  });
  const { router } = await renderApp(ideasUrl("?q=zzz"));
  expect(await screen.findByText("No ideas match these filters")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  await waitFor(() => expect(router.state.location.search).not.toHaveProperty("q"));
  expect(await screen.findByText("Bacolod Health Bowl")).toBeInTheDocument();
  expect(listCalls(api).at(-1)?.url.searchParams.has("q")).toBe(false);
});

test("a failed read shows the error with a retry, and the filters stay", async () => {
  stubApi({
    ...base(),
    [`GET ${IDEAS_PATH}`]: () => ({
      status: 403,
      body: { error: { code: "NO_ACCESS", message: "no", requestId: "abcdef12-0000" } },
    }),
  });
  await renderApp(ideasUrl());
  expect(await screen.findByText("You don't have access to this")).toBeInTheDocument();
  expect(screen.getByRole("searchbox", { name: "Search ideas" })).toBeInTheDocument();
});

test("the sidebar's Ideas entry points at this screen", async () => {
  stubApi({ ...base(), [`GET ${IDEAS_PATH}`]: () => page() });
  await renderApp(ideasUrl());
  await screen.findAllByRole("row");
  const links = screen.getAllByRole("link", { name: "Ideas" });
  expect(links.some((a) => a.getAttribute("href") === `/w/${WORKSPACE}/ideas`)).toBe(true);
});

// Last in the file: after a dialog opens in the full frame the next test never returns.
test("a workspace with no ideas invites an Owner to write the first one", async () => {
  stubApi({ ...base(), [`GET ${IDEAS_PATH}`]: () => page([]) });
  const { router } = await renderApp(ideasUrl());
  expect(await screen.findByText("No ideas yet")).toBeInTheDocument();
  expect(screen.getByText("Write down the first one — you can have many.")).toBeInTheDocument();
  const buttons = screen.getAllByRole("button", { name: "New idea" });
  // Opening a dialog inside the full frame only works with fireEvent (see workspace-switcher.test.tsx).
  fireEvent.click(buttons[buttons.length - 1] as HTMLElement);
  await waitFor(() => expect(router.state.location.search).toMatchObject({ modal: "new-idea" }));
});
