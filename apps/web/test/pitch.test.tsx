import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { renderApp, stubApi } from "./support";
import {
  DECK_PATH,
  IDEA,
  IDEA_PATH,
  makeDeck,
  makePlanHome,
  openPitch,
  PITCH_URL,
  PLAN,
  PLAN_PATH,
  signedIn,
  VERSION,
  WORKSPACE,
} from "./support-pitch";
import { makeDetail } from "./support-validation-home";

afterEach(() => {
  vi.unstubAllGlobals();
});

const frames = () => [...document.querySelectorAll<HTMLElement>("[data-slide-type]")];

test("a one-minute deck renders each slide with its type", async () => {
  await openPitch();
  await waitFor(() => expect(frames()).toHaveLength(3));
  expect(frames().map((f) => f.dataset.slideType)).toEqual(["title", "text", "number"]);
  expect(screen.getByRole("heading", { level: 2, name: "Piaya Box" })).toBeInTheDocument();
  expect(screen.getByText("Corporate gift boxes of Bacolod piaya")).toBeInTheDocument();
  expect(screen.getByText("₱450")).toBeInTheDocument();
  expect(screen.getByText("6.9")).toBeInTheDocument();
});

test("a five-minute deck renders all four slide types", async () => {
  await openPitch({ path: `${PITCH_URL}?variant=five` });
  await waitFor(() => expect(frames()).toHaveLength(5));
  expect(new Set(frames().map((f) => f.dataset.slideType))).toEqual(
    new Set(["title", "text", "number", "table"]),
  );
  expect(screen.getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
  expect(screen.getByText("Boxes sold to offices")).toBeInTheDocument();
});

test("empty sources and numbers show Not written yet; an overflow shows its notice", async () => {
  await openPitch({ path: `${PITCH_URL}?variant=five` });
  await waitFor(() => expect(frames()).toHaveLength(5));
  // An empty bullet, an uncomputable number and an empty table cell.
  expect(screen.getAllByText("Not written yet").length).toBeGreaterThanOrEqual(3);
  expect(screen.getAllByText("Too long for this slide — shorten it in the plan")).toHaveLength(1);
});

test("the thumbnails list every slide by title and select on action", async () => {
  const { user } = await openPitch();
  const list = await screen.findByRole("grid", { name: "Slides" });
  const rows = within(list).getAllByRole("row");
  expect(rows.map((r) => r.textContent)).toEqual([
    "1. Piaya Box",
    "2. Problem",
    "3. Business model",
  ]);
  const scroll = vi.fn();
  const target = document.getElementById("pitch-slide-problem");
  expect(target).not.toBeNull();
  (target as HTMLElement).scrollIntoView = scroll;
  await user.click(rows[1] as HTMLElement);
  expect(scroll).toHaveBeenCalled();
});

test("speaker notes show under the slides, and Not written yet when null", async () => {
  await openPitch();
  expect(await screen.findByRole("heading", { level: 2, name: "What to say" })).toBeInTheDocument();
  expect(screen.getByText("We sell piaya boxes.")).toBeInTheDocument();
  expect(
    screen.getByText("Shown in the app only. The PDF does not include it."),
  ).toBeInTheDocument();
});

test("null speaker notes show an empty state", async () => {
  await openPitch({ path: `${PITCH_URL}?variant=five` });
  await screen.findByRole("heading", { level: 2, name: "What to say" });
  const section = screen.getByRole("heading", { level: 2, name: "What to say" }).parentElement;
  expect(within(section as HTMLElement).getByText("Not written yet")).toBeInTheDocument();
});

test("the deck length switch changes the variant search param and reloads", async () => {
  const { user, router, api } = await openPitch();
  await waitFor(() => expect(frames()).toHaveLength(3));
  await user.click(screen.getByRole("radio", { name: "Five-minute" }));
  await waitFor(() => expect(router.state.location.search).toMatchObject({ variant: "five" }));
  await waitFor(() => expect(frames()).toHaveLength(5));
  expect(
    api.calls.some(
      (c) => c.url.pathname === DECK_PATH && c.url.searchParams.get("variant") === "five",
    ),
  ).toBe(true);
});

test("choosing a saved version sets ?version= and asks P12 for it; Latest clears it", async () => {
  const { user, router, api } = await openPitch();
  await waitFor(() => expect(frames()).toHaveLength(3));
  await user.click(screen.getByRole("button", { name: /Generated from/ }));
  await user.click(await screen.findByRole("option", { name: "v1 For advisors" }));
  await waitFor(() => expect(router.state.location.search).toMatchObject({ version: VERSION }));
  await waitFor(() =>
    expect(
      api.calls.some(
        (c) => c.url.pathname === DECK_PATH && c.url.searchParams.get("versionId") === VERSION,
      ),
    ).toBe(true),
  );
  await user.click(screen.getByRole("button", { name: /Generated from/ }));
  await user.click(await screen.findByRole("option", { name: "Latest" }));
  await waitFor(() => expect(router.state.location.search).not.toHaveProperty("version"));
});

test("an Owner sees Edit source and Edit in validation links per slide", async () => {
  await openPitch({ path: `${PITCH_URL}?variant=five` });
  await waitFor(() => expect(frames()).toHaveLength(5));
  const base = `/w/${WORKSPACE}/ideas/${IDEA}`;
  const sources = await screen.findAllByRole("link", { name: "Edit source" });
  expect(sources.map((l) => l.getAttribute("href"))).toEqual([
    `${base}/plans/${PLAN}/items/1`,
    `${base}/plans/${PLAN}/items/4`,
    `${base}/plans/${PLAN}/items/8`,
    `${base}/plans/${PLAN}/items/6`,
    `${base}/plans/${PLAN}/items/20`,
  ]);
  const validation = screen.getAllByRole("link", { name: "Edit in validation" });
  expect(validation.map((l) => l.getAttribute("href"))).toEqual([
    `${base}/economics`,
    `${base}/costs`,
  ]);
  expect(screen.getByRole("link", { name: "Back to plan" })).toHaveAttribute(
    "href",
    `${base}/plans/${PLAN}`,
  );
});

test("a Viewer sees no edit links but can still read and comment", async () => {
  await openPitch({ role: "viewer" });
  await waitFor(() => expect(frames()).toHaveLength(3));
  expect(screen.queryByRole("link", { name: "Edit source" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Edit in validation" })).toBeNull();
  expect(screen.getAllByRole("button", { name: "Comments" })).toHaveLength(3);
  expect(screen.queryByRole("button", { name: "History" })).toBeNull();
  expect(screen.getByText("2")).toBeInTheDocument();
});

test("edit links are hidden for a saved version, an archived plan and an archived idea", async () => {
  await openPitch({ path: `${PITCH_URL}?version=${VERSION}` });
  await waitFor(() => expect(frames()).toHaveLength(3));
  expect(screen.getByText(/Showing the saved version “v1 For advisors”/)).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Edit source" })).toBeNull();
});

test("an archived plan shows the deck without edit links", async () => {
  await openPitch({ home: makePlanHome({ archived: true }) });
  await waitFor(() => expect(frames()).toHaveLength(3));
  expect(screen.queryByRole("link", { name: "Edit source" })).toBeNull();
});

test("an archived idea shows the deck without edit links", async () => {
  await openPitch({ ideaArchived: true });
  await waitFor(() => expect(frames()).toHaveLength(3));
  expect(screen.queryByRole("link", { name: "Edit source" })).toBeNull();
});

test("a plan of another workspace shows no access and loads no deck", async () => {
  const { api } = await openPitch({
    home: makePlanHome({ workspaceId: "99999999-9999-4999-8999-999999999999" }),
    waitForHeading: false,
  });
  expect(await screen.findByText("You don't have access to this")).toBeInTheDocument();
  expect(api.calls.some((c) => c.url.pathname === DECK_PATH)).toBe(false);
});

test("a version that does not exist shows the API error and keeps the header", async () => {
  await openPitch({
    path: `${PITCH_URL}?version=${VERSION}`,
    extra: {
      [`GET ${DECK_PATH}`]: () => ({
        status: 404,
        body: { error: { code: "NOT_FOUND", message: "no", requestId: "abcdef12-0000" } },
      }),
    },
  });
  expect(await screen.findByText("Not found. Check the link.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeInTheDocument();
});

test("a failed deck load shows the error state and Retry loads it again", async () => {
  let fail = true;
  const { user } = await openPitch({
    extra: {
      [`GET ${DECK_PATH}`]: () =>
        fail
          ? {
              status: 503,
              body: {
                error: { code: "UPSTREAM_UNAVAILABLE", message: "x", requestId: "abcdef12-0000" },
              },
            }
          : { body: makeDeck("one") },
    },
  });
  const retry = await screen.findByRole("button", { name: "Retry" }, { timeout: 10_000 });
  fail = false;
  await user.click(retry);
  await waitFor(() => expect(frames()).toHaveLength(3));
}, 20_000);

test("while the plan loads, a skeleton of slide frames shows", async () => {
  stubApi({
    ...signedIn(),
    [`GET ${PLAN_PATH}`]: () => ({ body: makePlanHome() }),
    [`GET ${IDEA_PATH}`]: () => ({ body: makeDetail() }),
    [`GET ${DECK_PATH}`]: () => ({ body: makeDeck("one") }),
  });
  const gate = Promise.withResolvers<void>();
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).startsWith(PLAN_PATH) && !String(input).includes("pitch")) await gate.promise;
    return inner(input, init);
  });
  await renderApp(PITCH_URL);
  expect(await screen.findByRole("status", { name: "Loading" })).toHaveAttribute(
    "aria-busy",
    "true",
  );
  expect(frames()).toHaveLength(0);
  gate.resolve();
  await screen.findByRole("heading", { level: 1, name: "Pitch Deck" });
  await waitFor(() => expect(frames()).toHaveLength(3));
});
