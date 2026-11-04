import type { AdminTemplateList, Me } from "@moonx/schemas";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { operator } from "../test/admin";
import { ana, apiError, type Call, renderApp, stubApi } from "../test/api";

// 26 Admin: Templates (design-spec 6.17).

/** happy-dom's window, whose viewport a test sets. */
const setViewport = (width: number) =>
  act(() =>
    (
      window as unknown as {
        happyDOM: {
          setViewport: (size: { width: number; height: number }) => void;
        };
      }
    ).happyDOM.setViewport({ width, height: 900 }),
  );

afterEach(() => {
  vi.unstubAllGlobals();
  setViewport(1024);
});

const by = {
  id: operator.id,
  displayName: operator.displayName,
  avatarUrl: null,
  badge: null,
} as const;

const ids = {
  self1: "5ed19db2-463e-4dca-9846-e7c108e26179",
  validation1: "30ff1813-45b2-4411-bcf7-dac675012e19",
  validation2: "b840518b-1aa8-4700-b5c7-2931f54d2236",
  plan1: "a6f820b0-c6f1-458e-a9fe-df1fdb96a996",
};

const templates: AdminTemplateList = {
  items: [
    {
      kind: "self_analysis",
      name: "Self Analysis",
      versions: [
        {
          id: ids.self1,
          versionNumber: 1,
          status: "published",
          publishedAt: "2026-10-01T02:00:00.000Z",
          publishedBy: by,
          usageCount: 4,
        },
      ],
    },
    {
      kind: "validation",
      name: "Business Idea & Validation",
      versions: [
        {
          id: ids.validation2,
          versionNumber: 2,
          status: "draft",
          publishedAt: null,
          publishedBy: null,
          usageCount: 0,
        },
        {
          id: ids.validation1,
          versionNumber: 1,
          status: "published",
          publishedAt: "2026-10-01T02:00:00.000Z",
          publishedBy: null,
          usageCount: 8,
        },
      ],
    },
    { kind: "business_plan", name: null, versions: [] },
  ],
};

function templatesApi({
  me = operator,
  list = templates,
  answer,
}: {
  me?: Me;
  list?: AdminTemplateList;
  answer?: (call: Call) => Response | Promise<Response> | undefined;
} = {}) {
  return stubApi((call) => {
    const answered = answer?.(call);
    if (answered !== undefined) return answered;
    if (call.method === "GET" && call.path === "/api/v1/me") {
      return Response.json(me);
    }
    if (call.method === "GET" && call.path === "/api/v1/admin/templates") {
      return Response.json(list);
    }
    // 27, once opened: its own tests read it.
    if (call.method === "GET" && call.path.startsWith("/api/v1/admin/")) {
      return new Promise<Response>(() => {});
    }
    return undefined;
  });
}

const templateList = async () => {
  await screen.findByText("v1 published");
  return screen.getByRole("grid", { name: "Templates" });
};

const fileInput = () => {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error("no file input");
  return input;
};

const jsonFile = (body: unknown, name = "template.json") =>
  new File([JSON.stringify(body)], name, { type: "application/json" });

/**
 * Opens `path` from another screen (8), as a link would: Back from it has somewhere to
 * go, so leaving it shows.
 */
async function openFromNotifications(path: string) {
  const router = renderApp("/notifications");
  await act(() => router.navigate({ href: path }));
  return router;
}

/**
 * `find`'s answer once the waits between a read's tries (SDD 8.2: a failure that may pass
 * is read again) have gone by on the fake clock, moved in steps: the waits pass however
 * slow the run. For a test under `vi.useFakeTimers({ shouldAdvanceTime: true })`.
 */
async function afterRetries<T>(find: () => T): Promise<T> {
  for (let waited = 0; ; waited += 100) {
    try {
      return find();
    } catch (error) {
      if (waited >= 30_000) throw error;
      await act(() => vi.advanceTimersByTimeAsync(100));
    }
  }
}

/** Makes the browser say it is offline, or online again (6.0.6). */
function goOffline() {
  const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  act(() => {
    window.dispatchEvent(new Event("offline"));
  });
  return () => {
    onLine.mockRestore();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
  };
}

describe("26 Admin: Templates (design-spec 6.17)", () => {
  test("the three templates, the first beside them with its versions; the nav's Admin is current", async () => {
    templatesApi();
    renderApp("/admin/templates");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Admin" }),
    ).toBeTruthy();
    const list = await templateList();
    expect(within(list).getAllByRole("row")).toHaveLength(3);
    expect(within(list).getByText("v1 published · Draft v2")).toBeTruthy();
    expect(within(list).getByText("No versions yet")).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: "Self Analysis" }),
    ).toBeTruthy();
    const versions = screen.getByRole("grid", {
      name: "Versions of Self Analysis",
    });
    expect(
      within(versions).getByText("Published Oct 1 by Moonx Admin · 4 in use"),
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole("link", { name: "Admin" })
        .some((link) => link.getAttribute("aria-current") === "page"),
    ).toBe(true);
    expect(document.title).toBe("Templates · moonx");
  });

  test("a template with a draft: Import and New draft are unavailable, and the draft is pointed to", async () => {
    const user = userEvent.setup();
    templatesApi();
    renderApp("/admin/templates?kind=validation");
    expect(
      await screen.findByText(
        "Draft v2 is open. Publish it before importing a file or starting another draft.",
      ),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Import from file",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Actions for v1" }));
    expect(
      (
        await screen.findByRole("menuitem", {
          name: "New draft from this version",
        })
      ).getAttribute("aria-disabled"),
    ).toBe("true");
    expect(screen.getByRole("menuitem", { name: "View" })).toBeTruthy();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Open draft v2" }));
    await waitFor(() =>
      expect(window.location.pathname).not.toBe("/admin/templates"),
    );
  });

  test("a template with no version: the empty state and its Import from file", async () => {
    templatesApi();
    renderApp("/admin/templates?kind=business_plan");
    expect(
      await screen.findByRole("heading", {
        name: "No versions yet. Import a template file to start.",
      }),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Import from file",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  test("Import from file: the file goes to AD10 for the template chosen, and its draft opens", async () => {
    const user = userEvent.setup();
    const body = { format: "moonx-template", kind: "business_plan" };
    const calls = templatesApi({
      answer: (call) =>
        call.method === "POST" &&
        call.path === "/api/v1/admin/templates/import?kind=business_plan"
          ? Response.json(
              {
                versionId: "9b2c1a77-0000-4000-8000-000000000001",
                kind: "business_plan",
                versionNumber: 1,
              },
              { status: 201 },
            )
          : undefined,
    });
    const router = renderApp("/admin/templates?kind=business_plan");
    await screen.findByRole("button", { name: "Import from file" });
    await user.upload(fileInput(), jsonFile(body));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        "/admin/templates/versions/9b2c1a77-0000-4000-8000-000000000001",
      ),
    );
    expect(
      calls.find(
        (call) =>
          call.method === "POST" &&
          call.path.startsWith("/api/v1/admin/templates/import"),
      )?.body,
    ).toEqual(body);
    expect(await screen.findByText("Imported as draft v1")).toBeTruthy();
  });

  test("a file that is not a template, too large, of another kind or broken makes no draft and says why", async () => {
    const user = userEvent.setup();
    let answer: Response | undefined;
    const calls = templatesApi({
      answer: (call) =>
        call.method === "POST" &&
        call.path.startsWith("/api/v1/admin/templates/import")
          ? answer
          : undefined,
    });
    renderApp("/admin/templates?kind=business_plan");
    await screen.findByRole("button", { name: "Import from file" });

    await user.upload(
      fileInput(),
      new File(["not json"], "template.json", { type: "application/json" }),
    );
    expect(
      await screen.findByText(
        "This file can't be read. Choose a moonx template file (JSON).",
      ),
    ).toBeTruthy();
    await user.upload(
      fileInput(),
      new File([new Uint8Array(1_000_001)], "template.json", {
        type: "application/json",
      }),
    );
    expect(
      await screen.findByText("This file is too large. Use one under 1 MB."),
    ).toBeTruthy();
    expect(calls.some((call) => call.method === "POST")).toBe(false);

    answer = apiError(422, "VALIDATION_FAILED", {
      details: [
        {
          path: "kind",
          code: "invalid_value",
          message: "Expected business_plan",
        },
      ],
    });
    await user.upload(fileInput(), jsonFile({ kind: "self_analysis" }));
    expect(
      await screen.findByText(
        "This is a Self Analysis template file. Import it into Self Analysis instead.",
      ),
    ).toBeTruthy();

    answer = apiError(422, "VALIDATION_FAILED", {
      details: [
        {
          path: "sections.0.questions.1.title",
          code: "too_small",
          message: "Required",
        },
      ],
    });
    await user.upload(fileInput(), jsonFile({ kind: "business_plan" }));
    expect(
      await screen.findByText(
        "This file doesn't follow the template file format",
      ),
    ).toBeTruthy();
    // The places, never the API's own words for developers (SDD 9章).
    expect(screen.getByText("At sections.0.questions.1.title")).toBeTruthy();
    expect(screen.queryByText(/Required/)).toBeNull();

    answer = apiError(422, "VALIDATION_FAILED", {
      details: [{ path: "kind", code: "invalid_value", message: "Expected" }],
    });
    await user.upload(fileInput(), jsonFile({ kind: "plan" }));
    expect(
      await screen.findByText("This isn't a Business Plan template file"),
    ).toBeTruthy();

    await user.upload(fileInput(), jsonFile(["not", "an", "object"]));
    expect(
      await screen.findByText(
        "This file can't be read. Choose a moonx template file (JSON).",
      ),
    ).toBeTruthy();

    answer = apiError(409, "DRAFT_EXISTS");
    await user.upload(fileInput(), jsonFile({ kind: "business_plan" }));
    expect(
      await screen.findByText(
        "This template already has a draft. Publish it first.",
      ),
    ).toBeTruthy();
  });

  test("New draft from this version: AD2, then the draft opens", async () => {
    const user = userEvent.setup();
    const calls = templatesApi({
      answer: (call) =>
        call.method === "POST" &&
        call.path === `/api/v1/admin/template-versions/${ids.self1}/draft`
          ? Response.json(
              { id: "9b2c1a77-0000-4000-8000-000000000002" },
              { status: 201 },
            )
          : undefined,
    });
    const router = renderApp("/admin/templates");
    await templateList();
    await user.click(screen.getByRole("button", { name: "Actions for v1" }));
    await user.click(
      await screen.findByRole("menuitem", {
        name: "New draft from this version",
      }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        "/admin/templates/versions/9b2c1a77-0000-4000-8000-000000000002",
      ),
    );
    expect(
      calls.some(
        (call) =>
          call.method === "POST" && call.path.endsWith(`${ids.self1}/draft`),
      ),
    ).toBe(true);
  });

  test("a broken file's places: the top of the file, the first 5, and how many more (6.17)", async () => {
    const user = userEvent.setup();
    let paths: string[] = [];
    templatesApi({
      answer: (call) =>
        call.method === "POST" &&
        call.path.startsWith("/api/v1/admin/templates/import")
          ? apiError(422, "VALIDATION_FAILED", {
              details: paths.map((path) => ({
                path,
                code: "invalid_type",
                message: "Invalid input",
              })),
            })
          : undefined,
    });
    renderApp("/admin/templates?kind=business_plan");
    await screen.findByRole("button", { name: "Import from file" });
    const placesShown = () =>
      screen.queryAllByText(/^At /).map((place) => place.textContent);

    paths = ["", ...Array.from({ length: 7 }, (_, n) => `sections.${n}`)];
    await user.upload(fileInput(), jsonFile({ kind: "business_plan" }));
    expect(
      await screen.findByText(
        "This file doesn't follow the template file format",
      ),
    ).toBeTruthy();
    expect(placesShown()).toEqual([
      "At the top of the file",
      "At sections.0",
      "At sections.1",
      "At sections.2",
      "At sections.3",
    ]);
    expect(screen.getByText("And 3 more")).toBeTruthy();

    // Five fit: none is left to count.
    paths = Array.from({ length: 5 }, (_, n) => `items.${n}`);
    await user.upload(fileInput(), jsonFile({ kind: "business_plan" }));
    await screen.findByText("At items.4");
    expect(placesShown()).toHaveLength(5);
    expect(screen.queryByText(/^And \d+ more$/)).toBeNull();
  });

  test("a file that is not UTF-8 is not sent, and says why (6.17)", async () => {
    const user = userEvent.setup();
    const calls = templatesApi();
    renderApp("/admin/templates?kind=business_plan");
    await screen.findByRole("button", { name: "Import from file" });
    // {"kind":"é"} in Latin-1: a JSON object, but its é is no UTF-8.
    const latin1 = new Uint8Array([
      0x7b, 0x22, 0x6b, 0x69, 0x6e, 0x64, 0x22, 0x3a, 0x22, 0xe9, 0x22, 0x7d,
    ]);
    await user.upload(
      fileInput(),
      new File([latin1], "template.json", { type: "application/json" }),
    );
    expect(
      await screen.findByText(
        "This file can't be read. Choose a moonx template file (JSON).",
      ),
    ).toBeTruthy();
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  test("on a phone, a template opened from its URL: ← puts the list in its entry, and the next Back leaves 26 (6.17)", async () => {
    const user = userEvent.setup();
    setViewport(390);
    templatesApi();
    const router = await openFromNotifications(
      "/admin/templates?kind=validation",
    );
    expect(
      await screen.findByRole("heading", { level: 2, name: "Validation" }),
    ).toBeTruthy();
    // One pane: the versions in place of the list.
    expect(screen.queryByRole("grid", { name: "Templates" })).toBeNull();
    const entries = router.history.length;
    await user.click(screen.getByRole("button", { name: "Back to Templates" }));
    expect(await templateList()).toBeTruthy();
    expect(router.state.location.href).toBe("/admin/templates");
    expect(router.history.length).toBe(entries);
    act(() => router.history.back());
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/notifications"),
    );
  });

  test("on a phone, a template opened from the list adds an entry: Back returns to the list (6.17)", async () => {
    const user = userEvent.setup();
    setViewport(390);
    templatesApi();
    const router = renderApp("/admin/templates");
    const list = await templateList();
    const entries = router.history.length;
    await user.click(within(list).getByText("Validation"));
    expect(
      await screen.findByRole("heading", { level: 2, name: "Validation" }),
    ).toBeTruthy();
    expect(router.history.length).toBe(entries + 1);
    act(() => router.history.back());
    expect(await templateList()).toBeTruthy();
    expect(router.state.location.href).toBe("/admin/templates");
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  test("beside the list, choosing two templates adds no entry: Back leaves 26 (6.17)", async () => {
    const user = userEvent.setup();
    setViewport(1440);
    templatesApi();
    const router = await openFromNotifications("/admin/templates");
    const list = await templateList();
    const entries = router.history.length;
    await user.click(within(list).getByText("Validation"));
    expect(
      await screen.findByRole("heading", { level: 2, name: "Validation" }),
    ).toBeTruthy();
    await user.click(within(list).getByText("Business Plan"));
    expect(
      await screen.findByRole("heading", { level: 2, name: "Business Plan" }),
    ).toBeTruthy();
    expect(router.state.location.search).toEqual({ kind: "business_plan" });
    expect(router.history.length).toBe(entries);
    act(() => router.history.back());
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/notifications"),
    );
  });

  test("a list that can't be read: Couldn't load this page and Retry, the nav still there (6.0.6)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      let fails = true;
      templatesApi({
        answer: (call) =>
          call.path === "/api/v1/admin/templates" && fails
            ? new Response(null, { status: 503 })
            : undefined,
      });
      renderApp("/admin/templates");
      expect(
        await afterRetries(() =>
          screen.getByRole("heading", { name: "Couldn't load this page" }),
        ),
      ).toBeTruthy();
      expect(screen.getAllByRole("link", { name: "Admin" })).not.toHaveLength(
        0,
      );
      fails = false;
      await user.click(screen.getByRole("button", { name: "Retry" }));
      expect(await templateList()).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  }, 15_000);

  test("offline: opening 26 says so; once read, Import from file and New draft can't be pressed until back online (6.0.6)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      templatesApi({
        answer: (call) => {
          if (call.path === "/api/v1/admin/templates" && !navigator.onLine) {
            throw new TypeError("Failed to fetch");
          }
          return undefined;
        },
      });
      let online = goOffline();
      try {
        renderApp("/admin/templates");
        expect(
          await afterRetries(() =>
            screen.getByRole("heading", {
              name: "You're offline. Connect to the internet to open this page.",
            }),
          ),
        ).toBeTruthy();
      } finally {
        online();
      }
      // Back online, Retry reads it (the state has none offline).
      await user.click(await screen.findByRole("button", { name: "Retry" }));
      await templateList();
      const importButton = screen.getByRole("button", {
        name: "Import from file",
      }) as HTMLButtonElement;
      expect(importButton.disabled).toBe(false);

      online = goOffline();
      try {
        await waitFor(() => expect(importButton.disabled).toBe(true));
        await user.click(
          screen.getByRole("button", { name: "Actions for v1" }),
        );
        expect(
          (
            await screen.findByRole("menuitem", {
              name: "New draft from this version",
            })
          ).getAttribute("aria-disabled"),
        ).toBe("true");
        await user.keyboard("{Escape}");
      } finally {
        online();
      }
      await waitFor(() => expect(importButton.disabled).toBe(false));
      await user.click(screen.getByRole("button", { name: "Actions for v1" }));
      expect(
        (
          await screen.findByRole("menuitem", {
            name: "New draft from this version",
          })
        ).getAttribute("aria-disabled"),
      ).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  }, 15_000);

  test("anyone but an operator: no access, no way in, and nothing read from AD1", async () => {
    const calls = templatesApi({ me: ana });
    renderApp("/admin/templates");
    expect(
      await screen.findByRole("heading", {
        name: "You don't have access to this",
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
    expect(calls.some((call) => call.path.startsWith("/api/v1/admin"))).toBe(
      false,
    );
    expect(document.title).toBe("moonx");
  });
});
