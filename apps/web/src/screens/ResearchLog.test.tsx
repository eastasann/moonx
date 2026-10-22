import { formatIsoDate } from "@moonx/i18n";
import type { Me, ResearchLogEntry, Role } from "@moonx/schemas";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ana, apiError, type Call, renderApp, stubApi } from "../test/api";
import { workspaceId } from "../test/ideas";
import { entry, home, prices, survey, validationId } from "../test/validation";

// 14 Research log (design-spec 6.10・6.0.3).

afterEach(() => {
  vi.unstubAllGlobals();
});

const base = `/w/${workspaceId}/ideas/${home.idea.id}/research`;
const logPath = `/api/v1/validations/${validationId}/research-log`;

const as = (role: Role): Me => ({
  ...ana,
  memberships: ana.memberships.map((membership) => ({ ...membership, role })),
});

const usage = {
  target: {
    type: "validation_answer" as const,
    id: validationId,
    key: "V.01.WHO",
  },
  label: "01 WHO",
  link: {
    screen: 11,
    workspaceId,
    ideaId: home.idea.id,
    sectionKey: "01",
    questionKey: "V.01.WHO",
  },
  isOnlyEvidenceOfFact: true,
};

/** How many times the research log's lists were read. */
const listReads = (calls: Call[]) =>
  calls.filter(
    ({ method, path }) => method === "GET" && path.startsWith(logPath),
  ).length;

/** The id the fake API gives a new entry. */
const madeId = "5e8c1d2a-0000-4000-8000-000000000009";

/**
 * The API of 14 over `entries`, keeping what Add entry makes; `create` and `remove` may
 * answer later (a promise) or refuse.
 */
function logApi({
  me = ana,
  entries = [survey, prices],
  archived = false,
  create,
  remove,
}: {
  me?: Me;
  entries?: ResearchLogEntry[];
  archived?: boolean;
  create?: (call: Call) => Response | Promise<Response>;
  remove?: () => Promise<Response>;
} = {}) {
  const held = [...entries];
  return stubApi((call) => {
    const { method, path } = call;
    if (method === "GET" && path === "/api/v1/me") return Response.json(me);
    if (method === "PATCH" && path === "/api/v1/me") return Response.json(me);
    if (
      method === "GET" &&
      path === `/api/v1/ideas/${home.idea.id}/validation`
    ) {
      return Response.json({ ...home, idea: { ...home.idea, archived } });
    }
    if (method === "GET" && path.startsWith(logPath)) {
      const query = new URL(path, "http://localhost").searchParams;
      const supports = query.get("supports");
      const source = query.get("sourceType");
      return Response.json({
        items: held.filter(
          (item) =>
            (supports === null ||
              item.supportsChecks.includes(supports as never)) &&
            (source === null || item.sourceType === source),
        ),
        nextCursor: null,
      });
    }
    if (method === "POST" && path === logPath) {
      if (create !== undefined) return create(call);
      const made = entry(madeId, (call.body as { topic: string }).topic);
      held.unshift(made);
      return Response.json(made, { status: 201 });
    }
    const one = path.match(/^\/api\/v1\/research-log\/([\w-]+)$/);
    const found = held.find(({ id }) => id === one?.[1]);
    if (one !== null && found !== undefined) {
      if (method === "GET") {
        return Response.json({
          ...found,
          usages: found.id === survey.id ? [usage] : [],
          hiddenUsageCount: found.id === survey.id ? 2 : 0,
        });
      }
      if (method === "PATCH") {
        const { lockVersion: _, ...fields } = call.body as Record<
          string,
          unknown
        >;
        return Response.json({
          ...found,
          ...fields,
          lockVersion: found.lockVersion + 1,
        });
      }
      if (method === "DELETE") {
        if (remove !== undefined) return remove();
        held.splice(held.indexOf(found), 1);
        return Response.json({ affected: [usage], hiddenAffectedCount: 2 });
      }
    }
    return undefined;
  });
}

describe("14 Research log (design-spec 6.10)", () => {
  test("the entries, the first beside them with what it is evidence for, and its fields saved as typed", async () => {
    const user = userEvent.setup();
    const calls = logApi();
    renderApp(base);
    const list = await screen.findByRole("grid", { name: "Research Log" });
    expect(within(list).getAllByRole("row")).toHaveLength(2);
    expect(list.textContent).toContain("Evidence for 1 item");
    expect(
      await screen.findByRole("heading", { level: 2, name: "Lunch survey" }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(document.title).toBe("03 Research Log · BCDX · moonx"),
    );
    const used = await screen.findByRole("list", { name: "Used as evidence" });
    expect(
      within(used).getByRole("link", { name: "01 WHO" }).getAttribute("href"),
    ).toBe(`/w/${workspaceId}/ideas/${home.idea.id}/questions/01?q=V.01.WHO`);
    const observation = screen.getByRole("textbox", { name: "Observation" });
    await user.type(observation, "Busy at noon");
    await waitFor(
      () =>
        expect(calls.find(({ method }) => method === "PATCH")?.body).toEqual({
          observation: "Busy at noon",
          lockVersion: 1,
        }),
      { timeout: 3000 },
    );
  });

  test("a blank topic is not sent; a tag is saved when ticked", async () => {
    const user = userEvent.setup();
    const calls = logApi();
    renderApp(`${base}?entry=${prices.id}`);
    const topic = await screen.findByRole("textbox", { name: /Topic/ });
    await user.clear(topic);
    expect(screen.getByText("Can't be empty")).toBeTruthy();
    await user.click(screen.getByRole("checkbox", { name: "Local price" }));
    await waitFor(() =>
      expect(
        calls
          .filter(({ method }) => method === "PATCH")
          .map(({ body }) => body),
      ).toEqual([{ supportsChecks: ["local_price"], lockVersion: 1 }]),
    );
  });

  test("Add entry: the date today and the link's tags, then the entry it made is shown", async () => {
    const user = userEvent.setup();
    const calls = logApi();
    renderApp(`${base}?new=1&presetSupports=permits`);
    const topic = await screen.findByRole("textbox", { name: /Topic/ });
    expect(
      (screen.getByRole("checkbox", { name: "Permits" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    const add = screen.getAllByRole("button", { name: "Add entry" }).at(-1);
    expect(add?.hasAttribute("disabled")).toBe(true);
    await user.type(topic, "Asked the city hall");
    await user.click(add as HTMLElement);
    await waitFor(() => {
      const body = calls.find(({ method }) => method === "POST")
        ?.body as Record<string, unknown>;
      expect(body).toMatchObject({
        topic: "Asked the city hall",
        supportsChecks: ["permits"],
        sourceUrl: null,
      });
      expect(body.observedOn).toBe(
        formatIsoDate(new Date(), { timeZone: ana.timezone }),
      );
    });
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Asked the city hall",
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "New entry" })).toBeNull();
  });

  test("Cancel while the new entry is on its way: it is made, and the user is not taken to it", async () => {
    const user = userEvent.setup();
    let release = (_response: Response) => {};
    const calls = logApi({
      create: () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    });
    const router = renderApp(`${base}?new=1`);
    const topic = await screen.findByRole("textbox", { name: /Topic/ });
    await user.type(topic, "Asked the city hall");
    await user.click(
      screen
        .getAllByRole("button", { name: "Add entry" })
        .at(-1) as HTMLElement,
    );
    await waitFor(() =>
      expect(calls.some(({ method }) => method === "POST")).toBe(true),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      await screen.findByRole("heading", { level: 2, name: "Lunch survey" }),
    ).toBeTruthy();
    const lists = listReads(calls);
    release(
      Response.json(entry(madeId, "Asked the city hall"), { status: 201 }),
    );
    // Made: the lists are read again; the user stays where they went.
    await waitFor(() => expect(listReads(calls)).toBeGreaterThan(lists));
    expect(
      screen.queryByRole("heading", { level: 2, name: "Asked the city hall" }),
    ).toBeNull();
    expect(router.state.location.search).not.toHaveProperty("entry");
  });

  test("a new entry refused for good: Couldn't save and why", async () => {
    const user = userEvent.setup();
    logApi({ create: () => apiError(409, "ARCHIVED") });
    renderApp(`${base}?new=1`);
    const topic = await screen.findByRole("textbox", { name: /Topic/ });
    await user.type(topic, "Asked the city hall");
    await user.click(
      screen
        .getAllByRole("button", { name: "Add entry" })
        .at(-1) as HTMLElement,
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't save");
    expect(alert.textContent).toContain("It's archived");
  });

  test("deleting asks with what cites the entry and the hidden answers' number", async () => {
    const user = userEvent.setup();
    const calls = logApi();
    renderApp(`${base}?entry=${survey.id}`);
    await screen.findByRole("list", { name: "Used as evidence" });
    await user.click(
      screen.getByRole("button", { name: "More for Lunch survey" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const ask = await screen.findByRole("alertdialog", {
      name: "Delete this entry?",
    });
    expect(ask.textContent).toContain("01 WHO (its only evidence)");
    expect(ask.textContent).toContain(
      "Also evidence for 2 answers hidden by a template update.",
    );
    expect(ask.textContent).toContain("You can restore it from the history.");
    await user.click(within(ask).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(calls.some(({ method }) => method === "DELETE")).toBe(true),
    );
  });

  test("a deleted entry opened again is not found, not shown from what was cached", async () => {
    const user = userEvent.setup();
    logApi();
    const router = renderApp(`${base}?entry=${prices.id}`);
    await screen.findByRole("heading", { level: 2, name: "Prices downtown" });
    await user.click(
      screen.getByRole("button", { name: "More for Prices downtown" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const ask = await screen.findByRole("alertdialog", {
      name: "Delete this entry?",
    });
    await user.click(within(ask).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(router.state.location.search).not.toHaveProperty("entry"),
    );
    await router.navigate({ to: ".", search: { entry: prices.id } });
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Not found. Check the link.",
      }),
    ).toBeTruthy();
  });

  test("another entry chosen while a deletion is on its way stays chosen", async () => {
    const user = userEvent.setup();
    let release = (_response: Response) => {};
    const calls = logApi({
      remove: () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    });
    const router = renderApp(`${base}?entry=${survey.id}`);
    await screen.findByRole("list", { name: "Used as evidence" });
    await user.click(
      screen.getByRole("button", { name: "More for Lunch survey" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const ask = await screen.findByRole("alertdialog", {
      name: "Delete this entry?",
    });
    await user.click(within(ask).getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("row", { name: /Prices downtown/ }));
    expect(
      await screen.findByRole("heading", { level: 2, name: "Prices downtown" }),
    ).toBeTruthy();
    const lists = listReads(calls);
    release(Response.json({ affected: [usage], hiddenAffectedCount: 2 }));
    await waitFor(() => expect(listReads(calls)).toBeGreaterThan(lists));
    expect(router.state.location.search).toMatchObject({ entry: prices.id });
  });

  test("a Viewer reads only: no Add entry, no fields, no ⋯; the checks as tags", async () => {
    logApi({ me: as("viewer") });
    renderApp(`${base}?entry=${survey.id}`);
    await screen.findByRole("list", { name: "Used as evidence" });
    expect(screen.queryByRole("button", { name: "Add entry" })).toBeNull();
    expect(screen.queryAllByRole("textbox")).toEqual([]);
    expect(screen.queryByRole("button", { name: /More for/ })).toBeNull();
    const tags = screen.getByRole("grid", { name: "Supports check" });
    expect(
      within(tags).getByRole("row", { name: "Demand or problem signal" }),
    ).toBeTruthy();
  });

  test("an archived idea: the notice with Restore, and read only", async () => {
    logApi({ archived: true });
    renderApp(`${base}?entry=${survey.id}`);
    await screen.findByRole("list", { name: "Used as evidence" });
    expect(screen.getByText("This idea is archived")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add entry" })).toBeNull();
    expect(screen.queryAllByRole("textbox")).toEqual([]);
  });

  test("an entry of another idea: Not found, not shown as this idea's", async () => {
    const other = entry("5e8c1d2a-0000-4000-8000-00000000000a", "Elsewhere", {
      validationId: "9a9a9a9a-0000-4000-8000-000000000001",
    });
    logApi({ entries: [survey, prices, other] });
    renderApp(`${base}?entry=${other.id}`);
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Not found. Check the link.",
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Elsewhere" })).toBeNull();
  });

  test("Source filters by the source type, in the URL", async () => {
    const user = userEvent.setup();
    logApi();
    const router = renderApp(base);
    const list = await screen.findByRole("grid", { name: "Research Log" });
    expect(within(list).getAllByRole("row")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: /^Source/ }));
    await user.click(
      await screen.findByRole("option", { name: "Price Check" }),
    );
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        source: "price_check",
      }),
    );
    await waitFor(() =>
      expect(within(list).getAllByRole("row")).toHaveLength(1),
    );
    expect(
      within(list).getByRole("row", { name: /Prices downtown/ }),
    ).toBeTruthy();
  });

  test("no entries: what the screen is for; filtered to none: Clear filters", async () => {
    const user = userEvent.setup();
    logApi({ entries: [prices] });
    renderApp(`${base}?supports=demand_signal`);
    expect(
      await screen.findByRole("heading", {
        name: "Nothing matches these filters",
      }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(
      await screen.findByRole("grid", { name: "Research Log" }),
    ).toBeTruthy();
    vi.unstubAllGlobals();
    logApi({ entries: [] });
    renderApp(base);
    expect(
      await screen.findByRole("heading", {
        name: "Record what you observe, with sources. Others can check it later.",
      }),
    ).toBeTruthy();
  });

  test("an entry's 💬 opens its thread in the comments panel (design-spec 6.0.4)", async () => {
    const user = userEvent.setup();
    logApi();
    const router = renderApp(`${base}?entry=${prices.id}`);
    await user.click(
      await screen.findByRole("button", {
        name: `Comments on Research Log · ${prices.topic}`,
      }),
    );
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        entry: prices.id,
        panel: "comments",
        target: `research_log_entry:${prices.id}`,
      }),
    );
  });
});
