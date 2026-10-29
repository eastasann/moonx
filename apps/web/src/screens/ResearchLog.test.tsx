import { formatIsoDate } from "@moonx/i18n";
import type { Me, ResearchLogEntry, Role } from "@moonx/schemas";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ana,
  apiError,
  type Call,
  renderApp,
  stubApi,
  toastAfter,
} from "../test/api";
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
  hiddenUsageCount = 2,
  holdReads,
}: {
  /** A function is asked at each call: the user may change behind the screen. */
  me?: Me | (() => Me);
  entries?: ResearchLogEntry[];
  /** A function is asked at each call: the idea may be archived behind the screen. */
  archived?: boolean | (() => boolean);
  /** Answers Add entry; undefined makes the entry and keeps it. */
  create?: (call: Call) => Response | Promise<Response> | undefined;
  remove?: () => Response | Promise<Response>;
  /** The answers hidden by a template update that cite the survey. */
  hiddenUsageCount?: number;
  /** While it returns true, every read waits for good: the screen is not read again. */
  holdReads?: () => boolean;
} = {}) {
  const held = [...entries];
  const meNow = () => (typeof me === "function" ? me() : me);
  const archivedNow = () =>
    typeof archived === "function" ? archived() : archived;
  return stubApi((call) => {
    const { method, path } = call;
    if (method === "GET" && holdReads?.() === true) {
      return new Promise<Response>(() => {});
    }
    if (method === "GET" && path === "/api/v1/me")
      return Response.json(meNow());
    if (method === "PATCH" && path === "/api/v1/me") {
      return Response.json(meNow());
    }
    if (
      method === "GET" &&
      path === `/api/v1/ideas/${home.idea.id}/validation`
    ) {
      return Response.json({
        ...home,
        idea: { ...home.idea, archived: archivedNow() },
      });
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
      const answered = create?.(call);
      if (answered !== undefined) return answered;
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
          hiddenUsageCount: found.id === survey.id ? hiddenUsageCount : 0,
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
    const router = renderApp(`${base}?new=1&presetSupports=permits`);
    const topic = await screen.findByRole("textbox", { name: /Topic/ });
    expect(
      (screen.getByRole("checkbox", { name: "Permits" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    // The address keeps the tags as SDD 4章 writes them.
    expect(router.state.location.searchStr).toBe(
      "?new=1&presetSupports=permits",
    );
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

  test("an entry's 🕘 opens its changes in the history panel (design-spec 6.0.5)", async () => {
    const user = userEvent.setup();
    logApi();
    const router = renderApp(`${base}?entry=${prices.id}`);
    await user.click(
      await screen.findByRole("button", {
        name: `History of Research Log · ${prices.topic}`,
      }),
    );
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        entry: prices.id,
        panel: "history",
        target: `research_log_entry:${prices.id}`,
      }),
    );
  });
  /**
   * The new entry once the screen read again after a refusal for good (6.10): still
   * there, read only, with what was typed and Couldn't save with `reason`; nothing sends.
   */
  const expectKeptReadOnly = async (reason: string) => {
    await waitFor(() =>
      expect(
        screen.queryAllByRole("button", { name: "Add entry" }).length,
      ).toBe(1),
    );
    await expectLocked(reason);
  };

  /**
   * The new entry refused for good (6.10): read only, with what was typed and Couldn't
   * save with `reason`; its Add entry and Retry cannot send again.
   */
  const expectLocked = async (reason: string) => {
    expect(screen.getByRole("heading", { name: "New entry" })).toBeTruthy();
    const topic = screen.getByRole("textbox", { name: /Topic/ });
    expect((topic as HTMLInputElement).value).toBe("Asked the city hall");
    expect(topic.hasAttribute("readonly")).toBe(true);
    // The archived notice and a toast left from an earlier test are alerts too: the
    // form's has its Retry.
    const alert = screen
      .getAllByRole("alert")
      .find(
        (each) =>
          each.textContent?.includes("Couldn't save") === true &&
          within(each).queryByRole("button", { name: "Retry" }) !== null,
      );
    if (alert === undefined) throw new Error("no Couldn't save");
    expect(alert.textContent).toContain(reason);
    expect(
      within(alert)
        .getByRole("button", { name: "Retry" })
        .hasAttribute("disabled"),
    ).toBe(true);
    // The form's own, after the list's + Add entry while the screen still shows it.
    expect(
      screen
        .getAllByRole("button", { name: "Add entry" })
        .at(-1)
        ?.hasAttribute("disabled"),
    ).toBe(true);
  };

  /** Types a topic into the new entry and presses Add entry. */
  const addEntry = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(
      await screen.findByRole("textbox", { name: /Topic/ }),
      "Asked the city hall",
    );
    await user.click(
      screen
        .getAllByRole("button", { name: "Add entry" })
        .at(-1) as HTMLElement,
    );
  };

  test("a new entry and the network: Couldn't save and Retry, which sends what is typed again", async () => {
    const user = userEvent.setup();
    let tries = 0;
    const calls = logApi({
      create: () => {
        tries += 1;
        if (tries === 1) throw new TypeError("Failed to fetch");
        return undefined;
      },
    });
    renderApp(`${base}?new=1`);
    await addEntry(user);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't save");
    expect(alert.textContent).not.toContain("Something went wrong");
    expect(alert.textContent).not.toContain("Ref:");
    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Asked the city hall",
      }),
    ).toBeTruthy();
    const [first, again] = calls.filter(({ method }) => method === "POST");
    expect(first?.body).toMatchObject({ topic: "Asked the city hall" });
    expect(again?.body).toEqual(first?.body);
  });

  test("a new entry over the rate limit: the wait, and what is typed stays", async () => {
    const user = userEvent.setup();
    logApi({
      create: () => apiError(429, "RATE_LIMITED", { retryAfterSeconds: 120 }),
    });
    renderApp(`${base}?new=1`);
    await addEntry(user);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "Too many attempts. Try again in 2 minutes.",
    );
    expect(
      (screen.getByRole("textbox", { name: /Topic/ }) as HTMLInputElement)
        .value,
    ).toBe("Asked the city hall");
  });

  test("a new entry and an unexpected failure: Something went wrong with its Ref, and Retry in place", async () => {
    const user = userEvent.setup();
    let tries = 0;
    const calls = logApi({
      create: () => {
        tries += 1;
        return tries === 1 ? apiError(500, "INTERNAL") : undefined;
      },
    });
    renderApp(`${base}?new=1`);
    await addEntry(user);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Something went wrong");
    // The request id's first 8 characters (SDD 8.2), not the whole id.
    expect(alert.textContent).toContain("Ref: 8f14e45f");
    expect(alert.textContent).not.toContain("8f14e45f-");
    // In place, not in a small dialog: 14 is a screen (6.10).
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(calls.filter(({ method }) => method === "POST")).toHaveLength(2),
    );
    const [first, again] = calls.filter(({ method }) => method === "POST");
    expect(again?.body).toEqual(first?.body);
  });

  test("a new entry the API refused for a field: Couldn't save with the reason, and Check the format under the field", async () => {
    const user = userEvent.setup();
    logApi({
      create: () =>
        apiError(422, "VALIDATION_FAILED", {
          details: [{ path: "sourceUrl", message: "Invalid url" }],
        }),
    });
    renderApp(`${base}?new=1`);
    await addEntry(user);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't save");
    expect(alert.textContent).toContain("Check the format");
    const url = screen.getByRole("textbox", { name: "Source URL" });
    const described = (url.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent);
    expect(described).toContain("Check the format");
  });

  test("a new entry refused as the idea is archived meanwhile: 14 reads again, archived", async () => {
    const user = userEvent.setup();
    let archived = false;
    logApi({
      archived: () => archived,
      create: () => {
        archived = true;
        return apiError(409, "ARCHIVED");
      },
    });
    const router = renderApp(`${base}?new=1`);
    await addEntry(user);
    expect(await screen.findByText("This idea is archived")).toBeTruthy();
    await expectKeptReadOnly("It's archived");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "New entry" })).toBeNull(),
    );
    expect(router.state.location.search).not.toHaveProperty("new");
    expect(screen.queryAllByRole("textbox")).toEqual([]);
  });

  test("a new entry refused once the user is a Viewer: 14 reads again, read only", async () => {
    const user = userEvent.setup();
    let me = ana;
    logApi({
      me: () => me,
      create: () => {
        me = as("viewer");
        return apiError(403, "FORBIDDEN");
      },
    });
    renderApp(`${base}?new=1`);
    await addEntry(user);
    // Read again as a Viewer: the list's + Add entry goes, the form stays to read.
    await expectKeptReadOnly("You don't have access to this");
    expect(screen.queryByText("This idea is archived")).toBeNull();
  });

  test("a delete refused as the idea is archived: the reason without Retry, then 14 reads as archived (6.0.6)", async () => {
    const user = userEvent.setup();
    let archived = false;
    logApi({
      archived: () => archived,
      remove: () => {
        archived = true;
        return apiError(409, "ARCHIVED");
      },
    });
    renderApp(`${base}?entry=${prices.id}`);
    await screen.findByRole("heading", { level: 2, name: "Prices downtown" });
    await user.click(
      screen.getByRole("button", { name: "More for Prices downtown" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const ask = await screen.findByRole("alertdialog", {
      name: "Delete this entry?",
    });
    const toast = await toastAfter("Couldn't save. It's archived.", () =>
      user.click(within(ask).getByRole("button", { name: "Delete" })),
    );
    expect(within(toast).queryByRole("button", { name: "Retry" })).toBeNull();
    expect(await screen.findByText("This idea is archived")).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /More for/ })).toBeNull(),
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Prices downtown" }),
    ).toBeTruthy();
  });

  test("counts of a thousand and more are grouped (SDD 9章 書式)", async () => {
    const user = userEvent.setup();
    logApi({
      entries: [{ ...survey, usedAsEvidenceCount: 1234 }, prices],
      hiddenUsageCount: 1234,
    });
    renderApp(`${base}?entry=${survey.id}`);
    const list = await screen.findByRole("grid", { name: "Research Log" });
    expect(list.textContent).toContain("Evidence for 1,234 items");
    await screen.findByRole("list", { name: "Used as evidence" });
    await user.click(
      screen.getByRole("button", { name: "More for Lunch survey" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const ask = await screen.findByRole("alertdialog", {
      name: "Delete this entry?",
    });
    expect(ask.textContent).toContain(
      "Also evidence for 1,234 answers hidden by a template update.",
    );
  });
  test("a new entry refused as gone (404): locked at once, with what was typed and why; nothing more is sent", async () => {
    const user = userEvent.setup();
    const calls = logApi({ create: () => apiError(404, "NOT_FOUND") });
    renderApp(`${base}?new=1`);
    await addEntry(user);
    expect(await screen.findByText("It no longer exists")).toBeTruthy();
    // Read again, the screen still lets the user add: the refusal itself locks the form.
    await expectLocked("It no longer exists");
    await user.click(
      screen
        .getAllByRole("button", { name: "Add entry" })
        .at(-1) as HTMLElement,
    );
    expect(calls.filter(({ method }) => method === "POST")).toHaveLength(1);
  });

  test("a new entry refused as archived: locked at once, before the screen read again answers", async () => {
    const user = userEvent.setup();
    let refused = false;
    const calls = logApi({
      holdReads: () => refused,
      create: () => {
        refused = true;
        return apiError(409, "ARCHIVED");
      },
    });
    renderApp(`${base}?new=1`);
    await addEntry(user);
    expect(await screen.findByText("It's archived")).toBeTruthy();
    await expectLocked("It's archived");
    // The read again has not answered: the screen does not show it archived yet.
    expect(screen.queryByText("This idea is archived")).toBeNull();
    expect(
      calls.filter(
        ({ method, path }) =>
          method === "GET" &&
          path === `/api/v1/ideas/${home.idea.id}/validation`,
      ).length,
    ).toBeGreaterThan(1);
    expect(calls.filter(({ method }) => method === "POST")).toHaveLength(1);
  });
});
