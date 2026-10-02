// The pickers and menus of screen 6, in their own file: an overlay opened in one test makes the
// next test in the same jsdom hang once the full app frame renders again, so these tests render
// the screen without the frame (`renderIdeasScreen`) and no frame test follows them.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { makeMe, stubApi, WORKSPACE } from "./support";
import {
  BACOLOD,
  IDEA_A,
  IDEA_B,
  IDEAS_PATH,
  MEMBERS,
  makeIdea,
  renderIdeasScreen,
} from "./support-ideas";

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

const _ideasUrl = (search = "") => `/w/${WORKSPACE}/ideas${search}`;
const listCalls = (api: ReturnType<typeof stubApi>) =>
  api.calls.filter((c) => c.method === "GET" && c.url.pathname === IDEAS_PATH);

test("choosing a decision in the picker asks the URL for it", async () => {
  stubApi({ ...base(), [`GET ${IDEAS_PATH}`]: () => page() });
  const onSearchChange = vi.fn();
  renderIdeasScreen({ onSearchChange });
  await screen.findAllByRole("row");
  await userEvent.click(screen.getByRole("button", { name: /Decision/ }));
  await userEvent.click(await screen.findByRole("option", { name: "Proceed" }));
  expect(onSearchChange).toHaveBeenCalledWith({ decision: "proceed" });
});

test("the stage picker offers All and the three stages, and All clears the stage", async () => {
  stubApi({ ...base(), [`GET ${IDEAS_PATH}`]: () => page() });
  const onSearchChange = vi.fn();
  renderIdeasScreen({ onSearchChange, search: { stage: "planning" } });
  await screen.findAllByRole("row");
  await userEvent.click(screen.getByRole("button", { name: /Stage/ }));
  const options = await screen.findAllByRole("option");
  expect(options.map((o) => o.textContent)).toEqual([
    "All",
    "Validation",
    "Planning",
    "Launch prep",
  ]);
  await userEvent.click(options[0] as HTMLElement);
  expect(onSearchChange).toHaveBeenCalledWith({ stage: undefined });
});

test("the sort picker has no decision sort", async () => {
  stubApi({ ...base(), [`GET ${IDEAS_PATH}`]: () => page() });
  renderIdeasScreen();
  await screen.findAllByRole("row");
  await userEvent.click(screen.getByRole("button", { name: /Sort/ }));
  const options = await screen.findAllByRole("option");
  expect(options.map((o) => o.textContent)).toEqual(["Updated", "Created", "Name"]);
  // An overlay left open makes the next test in this jsdom hang.
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
});

test("an Owner duplicates from the row menu and lands on the copy", async () => {
  const COPY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const api = stubApi({
    ...base(),
    [`GET ${IDEAS_PATH}`]: () => page(),
    [`POST /api/v1/ideas/${IDEA_A}/duplicate`]: () => ({
      status: 201,
      body: makeIdea({ id: COPY, name: "Piaya Gift Box Delivery (copy)" }),
    }),
  });
  const { router } = renderIdeasScreen();
  await userEvent.click(
    await screen.findByRole("button", { name: "More actions for Piaya Gift Box Delivery" }),
  );
  await userEvent.click(await screen.findByRole("menuitem", { name: "Duplicate" }));
  await waitFor(() => expect(router.state.location.pathname).toBe(`/w/${WORKSPACE}/ideas/${COPY}`));
  expect(api.calls.some((c) => c.method === "POST" && c.url.pathname.endsWith("/duplicate"))).toBe(
    true,
  );
});

test("an Owner archives from the row menu and the list is read again", async () => {
  const api = stubApi({
    ...base(),
    [`GET ${IDEAS_PATH}`]: () => page(),
    [`POST /api/v1/ideas/${IDEA_B}/archive`]: () => ({ body: { ...BACOLOD, archived: true } }),
  });
  renderIdeasScreen();
  await userEvent.click(
    await screen.findByRole("button", { name: "More actions for Bacolod Health Bowl" }),
  );
  await userEvent.click(await screen.findByRole("menuitem", { name: "Archive" }));
  await waitFor(() => expect(listCalls(api).length).toBeGreaterThan(1));
});

test("an archived idea offers Restore instead of Archive", async () => {
  const api = stubApi({
    ...base(),
    [`GET ${IDEAS_PATH}`]: () => page([{ ...BACOLOD, archived: true }]),
    [`POST /api/v1/ideas/${IDEA_B}/restore`]: () => ({ body: BACOLOD }),
  });
  renderIdeasScreen({ search: { archived: true } });
  expect(await screen.findByText("Archived")).toBeInTheDocument();
  await userEvent.click(
    await screen.findByRole("button", { name: "More actions for Bacolod Health Bowl" }),
  );
  expect(screen.queryByRole("menuitem", { name: "Archive" })).not.toBeInTheDocument();
  await userEvent.click(await screen.findByRole("menuitem", { name: "Restore" }));
  await waitFor(() =>
    expect(api.calls.some((c) => c.method === "POST" && c.url.pathname.endsWith("/restore"))).toBe(
      true,
    ),
  );
});

test("a Viewer in the same screen gets no menu on any row", async () => {
  stubApi({ ...base(viewerMe()), [`GET ${IDEAS_PATH}`]: () => page() });
  renderIdeasScreen({ me: viewerMe() });
  await screen.findAllByRole("row");
  expect(screen.queryByRole("button", { name: /More actions/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "New idea" })).not.toBeInTheDocument();
});
