import type {
  AdminTemplateList,
  AdminUser,
  AdminWorkspace,
  Invitation,
} from "@moonx/schemas";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { operator } from "../test/admin";
import { ana, apiError, type Call, renderApp, stubApi } from "../test/api";

// 28 Admin: Users & Workspaces (design-spec 6.17).

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

const user = (
  id: string,
  displayName: string,
  extra: Partial<AdminUser> = {},
): AdminUser => ({
  id,
  displayName,
  email: `${displayName.split(" ")[0]?.toLowerCase()}@bcdx.example`,
  createdAt: "2026-09-01T02:00:00.000Z",
  lastActiveAt: "2026-10-20T02:00:00.000Z",
  workspaceCount: 2,
  status: "active",
  isAdmin: false,
  ...extra,
});

const anaUser = user(ana.id, "Ana Villanueva");
const kenji = user("7d793037-a076-4c2b-9f8e-3a1b2c3d4e5f", "Kenji Mori", {
  status: "suspended",
});
const me = user(operator.id, "Moonx Admin", {
  email: operator.email,
  workspaceCount: 1,
  isAdmin: true,
});
const gone = user("0c2a1b9e-0000-4000-8000-000000000009", "Deleted user", {
  email: "deleted-0c2a1b9e@deleted.invalid",
  status: "deleted",
  lastActiveAt: null,
});

const bcdx: AdminWorkspace = {
  id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  name: "BCDX",
  isPersonal: false,
  owners: [
    { id: ana.id, displayName: "Ana Villanueva", avatarUrl: null, badge: null },
  ],
  memberCount: 4,
  ideaCount: 8,
  lastActiveAt: "2026-10-20T02:00:00.000Z",
};

const pending: Invitation = {
  id: "4b2e8f1a-3333-4333-8333-333333333333",
  email: "new.member@bcdx.example",
  role: "member",
  workspace: { id: bcdx.id, name: "BCDX" },
  status: "pending",
  invitedBy: null,
  createdAt: "2026-10-20T02:00:00.000Z",
  expiresAt: "2026-10-27T02:00:00.000Z",
  acceptedAt: null,
};

const page = <T,>(items: T[]) => Response.json({ items, nextCursor: null });

function usersApi({
  answer,
  me: signedIn = operator,
}: {
  answer?: (call: Call) => Response | undefined;
  me?: typeof operator;
} = {}) {
  return stubApi((call) => {
    const answered = answer?.(call);
    if (answered !== undefined) return answered;
    const { method, path } = call;
    if (method === "GET" && path === "/api/v1/me") {
      return Response.json(signedIn);
    }
    if (method === "GET" && path.startsWith("/api/v1/admin/users?")) {
      return page([anaUser, kenji, me, gone]);
    }
    if (method === "GET" && path.startsWith("/api/v1/admin/workspaces?")) {
      return page([bcdx]);
    }
    if (method === "GET" && path.startsWith("/api/v1/admin/invitations?")) {
      return page([pending]);
    }
    return undefined;
  });
}

const rowNamed = async (grid: string, name: RegExp) =>
  within(await screen.findByRole("grid", { name: grid })).findByRole("row", {
    name,
  });

/** 26's list, for the tab that opens it. */
const noTemplates: AdminTemplateList = {
  items: [
    { kind: "self_analysis", name: null, versions: [] },
    { kind: "validation", name: null, versions: [] },
    { kind: "business_plan", name: null, versions: [] },
  ],
};
const templatesToo = (call: Call) =>
  call.method === "GET" && call.path === "/api/v1/admin/templates"
    ? Response.json(noTemplates)
    : undefined;

/**
 * Opens `path` from another screen (8), as a link would: Back from it has somewhere to
 * go, so leaving it shows.
 */
async function openFromNotifications(path: string) {
  const router = renderApp("/notifications");
  await act(() => router.navigate({ href: path }));
  return router;
}

describe("28 Admin: Users & Workspaces (design-spec 6.17)", () => {
  test("Users: names, use and state, never what they wrote; the first beside the list", async () => {
    usersApi();
    renderApp("/admin/users");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Admin" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: "Users", selected: true }),
    ).toBeTruthy();
    const table = await screen.findByRole("grid", { name: "Users" });
    expect(within(table).getByText("Kenji Mori (suspended)")).toBeTruthy();
    expect(within(table).getByText("Moonx Admin (you)")).toBeTruthy();
    expect(within(table).getByText("Deleted user")).toBeTruthy();
    expect(within(table).queryByText(gone.email)).toBeNull();
    expect(
      await screen.findByRole("heading", { level: 2, name: "Ana Villanueva" }),
    ).toBeTruthy();
    expect(screen.getByText("Sep 1")).toBeTruthy();
    expect(document.title).toBe("Users & Workspaces · moonx");
  });

  test("Suspend: asked first, then AD8; Resume needs no question; the operator never suspends themselves", async () => {
    const actor = userEvent.setup();
    const calls = usersApi({
      answer: (call) =>
        call.method === "POST" && call.path.startsWith("/api/v1/admin/users/")
          ? Response.json(anaUser)
          : undefined,
    });
    renderApp("/admin/users");
    await screen.findByRole("heading", { level: 2, name: "Ana Villanueva" });
    await actor.click(screen.getByRole("button", { name: "Suspend" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Suspend Ana Villanueva?",
    });
    await actor.click(within(dialog).getByRole("button", { name: "Suspend" }));
    expect(await screen.findByText("Ana Villanueva is suspended")).toBeTruthy();
    expect(
      calls.some(
        (call) =>
          call.method === "POST" &&
          call.path === `/api/v1/admin/users/${ana.id}/suspend`,
      ),
    ).toBe(true);

    await actor.click(await rowNamed("Users", /Kenji Mori/));
    await actor.click(await screen.findByRole("button", { name: "Resume" }));
    await waitFor(() =>
      expect(
        calls.some(
          (call) => call.path === `/api/v1/admin/users/${kenji.id}/reactivate`,
        ),
      ).toBe(true),
    );

    await actor.click(await rowNamed("Users", /Moonx Admin/));
    expect(await screen.findByText("You can't suspend yourself")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Suspend" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    await actor.click(await rowNamed("Users", /Deleted user/));
    expect(
      await screen.findByText(
        "This account was deleted. Nothing about it can be changed.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Suspend" })).toBeNull();
  });

  test("the search goes to AD7 once typing pauses; nothing found offers to clear it", async () => {
    const actor = userEvent.setup();
    const calls = usersApi({
      answer: (call) =>
        call.path.startsWith("/api/v1/admin/users?") &&
        call.path.includes("q=zz")
          ? page([])
          : undefined,
    });
    renderApp("/admin/users");
    await screen.findByRole("grid", { name: "Users" });
    await actor.type(
      screen.getByRole("searchbox", { name: "Search users" }),
      "zz",
    );
    expect(
      await screen.findByRole("heading", {
        name: "Nothing matches these filters",
      }),
    ).toBeTruthy();
    expect(calls.some((call) => call.path.includes("q=zz"))).toBe(true);
    await actor.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByRole("grid", { name: "Users" })).toBeTruthy();
    // Past the pause the cleared search stays cleared, and is not asked for again.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(
      (
        screen.getByRole("searchbox", {
          name: "Search users",
        }) as HTMLInputElement
      ).value,
    ).toBe("");
    expect(calls.filter((call) => call.path.includes("q=zz"))).toHaveLength(1);
    expect(screen.getByRole("grid", { name: "Users" })).toBeTruthy();
  });

  test("the state filter and the workspaces' search ask AD7 for what they keep", async () => {
    const actor = userEvent.setup();
    const calls = usersApi();
    renderApp("/admin/users");
    await screen.findByRole("grid", { name: "Users" });
    await actor.click(screen.getByRole("button", { name: /Status/ }));
    await actor.click(await screen.findByRole("option", { name: "Suspended" }));
    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.path.startsWith("/api/v1/admin/users?") &&
            call.path.includes("status=suspended"),
        ),
      ).toBe(true),
    );
    await actor.click(screen.getByRole("tab", { name: "Workspaces" }));
    await actor.keyboard("{Enter}");
    await actor.type(
      await screen.findByRole("searchbox", { name: "Search workspaces" }),
      "bc",
    );
    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.path.startsWith("/api/v1/admin/workspaces?") &&
            call.path.includes("q=bc"),
        ),
      ).toBe(true),
    );
  });

  test("Workspaces: name, Owners, members and ideas, and how recently used", async () => {
    usersApi();
    renderApp("/admin/users?tab=workspaces");
    const table = await screen.findByRole("grid", { name: "Workspaces" });
    expect(within(table).getByText("BCDX")).toBeTruthy();
    expect(
      await screen.findByRole("heading", { level: 2, name: "BCDX" }),
    ).toBeTruthy();
    expect(screen.getByText("Team workspace")).toBeTruthy();
    expect(screen.getAllByText("Ana Villanueva").length).toBeGreaterThan(0);
  });

  test("the tabs: the arrow keys move among them, Enter opens one, and the keyboard stays on it", async () => {
    const actor = userEvent.setup();
    usersApi();
    const router = renderApp("/admin/users");
    await screen.findByRole("grid", { name: "Users" });
    screen.getByRole("tab", { name: "Users" }).focus();
    await actor.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "Workspaces" }),
    );
    expect(router.state.location.search).toEqual({});
    await actor.keyboard("{Enter}");
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ tab: "workspaces" }),
    );
    await screen.findByRole("grid", { name: "Workspaces" });
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "Workspaces", selected: true }),
    );
  });

  test("the tabs: opening 26 from 28 by the keyboard leaves the keyboard on its tab", async () => {
    const actor = userEvent.setup();
    stubApi((call) => {
      if (call.path === "/api/v1/me") return Response.json(operator);
      if (call.path === "/api/v1/admin/templates") {
        return Response.json({
          items: [
            { kind: "self_analysis", name: null, versions: [] },
            { kind: "validation", name: null, versions: [] },
            { kind: "business_plan", name: null, versions: [] },
          ],
        });
      }
      if (call.path.startsWith("/api/v1/admin/users?")) return page([me]);
      return undefined;
    });
    const router = renderApp("/admin/users");
    await screen.findByRole("grid", { name: "Users" });
    screen.getByRole("tab", { name: "Users" }).focus();
    await actor.keyboard("{ArrowLeft}{Enter}");
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/admin/templates"),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("tab", { name: "Templates", selected: true }),
      ),
    );
  });

  test("the tabs: Templates opens 26, a list of 28 replaces its tab", async () => {
    const actor = userEvent.setup();
    usersApi();
    const router = renderApp("/admin/users");
    await screen.findByRole("grid", { name: "Users" });
    await actor.click(screen.getByRole("tab", { name: "Invitations" }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ tab: "invitations" }),
    );
    await actor.click(screen.getByRole("tab", { name: "Templates" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/admin/templates"),
    );
  });

  test("28's tabs add no history entry: Users → Invitations → Workspaces, then Back leaves 28 (6.17)", async () => {
    const actor = userEvent.setup();
    usersApi();
    const router = await openFromNotifications("/admin/users");
    await screen.findByRole("grid", { name: "Users" });
    const entries = router.history.length;
    await actor.click(screen.getByRole("tab", { name: "Invitations" }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ tab: "invitations" }),
    );
    await screen.findByRole("grid", { name: "Invitations" });
    await actor.click(screen.getByRole("tab", { name: "Workspaces" }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ tab: "workspaces" }),
    );
    expect(router.history.length).toBe(entries);
    act(() => router.history.back());
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/notifications"),
    );
  });

  test("moving between 26 and 28 adds an entry: 28 → Templates → Back is 28, and 26 → Users → Back is 26 (6.17)", async () => {
    const actor = userEvent.setup();
    usersApi({ answer: templatesToo });
    const router = renderApp("/admin/users?tab=invitations");
    await screen.findByRole("grid", { name: "Invitations" });
    const entries = router.history.length;
    await actor.click(screen.getByRole("tab", { name: "Templates" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/admin/templates"),
    );
    await screen.findByRole("grid", { name: "Templates" });
    expect(router.history.length).toBe(entries + 1);
    act(() => router.history.back());
    await waitFor(() =>
      expect(router.state.location.href).toBe("/admin/users?tab=invitations"),
    );
    expect(
      await screen.findByRole("grid", { name: "Invitations" }),
    ).toBeTruthy();

    act(() => router.history.forward());
    await screen.findByRole("grid", { name: "Templates" });
    await actor.click(screen.getByRole("tab", { name: "Users" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/admin/users"),
    );
    await screen.findByRole("grid", { name: "Users" });
    expect(router.history.length).toBe(entries + 2);
    act(() => router.history.back());
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/admin/templates"),
    );
    expect(await screen.findByRole("grid", { name: "Templates" })).toBeTruthy();
  });

  test("on a phone, a row opens over the list: Back and ← both return to it, the row held in the entry, not the URL (6.17)", async () => {
    const actor = userEvent.setup();
    setViewport(390);
    usersApi();
    const router = renderApp("/admin/users");
    const kenjiRow = await rowNamed("Users", /Kenji Mori/);
    // One pane: nothing beside the list until a row is opened.
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    const entries = router.history.length;
    await actor.click(kenjiRow);
    expect(
      await screen.findByRole("heading", { level: 2, name: /Kenji Mori/ }),
    ).toBeTruthy();
    expect(screen.queryByRole("grid", { name: "Users" })).toBeNull();
    expect(router.history.length).toBe(entries + 1);
    expect(router.state.location.href).toBe("/admin/users");
    expect(router.state.location.state.adminRow).toBe(kenji.id);

    act(() => router.history.back());
    expect(await screen.findByRole("grid", { name: "Users" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    // Forward again, the entry still holds the row it showed.
    act(() => router.history.forward());
    expect(
      await screen.findByRole("heading", { level: 2, name: /Kenji Mori/ }),
    ).toBeTruthy();

    await actor.click(screen.getByRole("button", { name: "Back to Users" }));
    expect(await screen.findByRole("grid", { name: "Users" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    // ← went back over the entry the row added, as Back does: Forward shows the row
    // again, which an entry put in its place would not.
    expect(router.history.length).toBe(entries + 1);
    expect(router.state.location.state.adminRow).toBeUndefined();
    act(() => router.history.forward());
    expect(
      await screen.findByRole("heading", { level: 2, name: /Kenji Mori/ }),
    ).toBeTruthy();
    act(() => router.history.back());
    await actor.click(await rowNamed("Users", /Ana Villanueva/));
    expect(
      await screen.findByRole("heading", { level: 2, name: "Ana Villanueva" }),
    ).toBeTruthy();
  });

  test("Invitations: the pending one beside the list, with Resend and Cancel", async () => {
    const actor = userEvent.setup();
    const calls = usersApi({
      answer: (call) =>
        call.method === "POST" && call.path.endsWith("/resend")
          ? Response.json({ invitation: pending })
          : call.method === "DELETE"
            ? new Response(null, { status: 204 })
            : undefined,
    });
    renderApp("/admin/users?tab=invitations");
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "new.member@bcdx.example",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText("Member · sent Oct 20 · expires Oct 27"),
    ).toBeTruthy();
    await actor.click(screen.getByRole("button", { name: "Resend" }));
    expect(
      await screen.findByText(
        "Invitation sent again to new.member@bcdx.example",
      ),
    ).toBeTruthy();
    await actor.click(
      screen.getByRole("button", { name: "Cancel invitation" }),
    );
    expect(
      await screen.findByText(
        "Invitation to new.member@bcdx.example cancelled",
      ),
    ).toBeTruthy();
    expect(
      calls.filter((call) => call.path === `/api/v1/invitations/${pending.id}`),
    ).toHaveLength(1);
  });

  test("Invite someone: to no workspace sends no role, and the link shows once sent", async () => {
    const actor = userEvent.setup();
    const link = "http://localhost/invite/abc123";
    const calls = usersApi({
      answer: (call) =>
        call.method === "POST" && call.path === "/api/v1/admin/invitations"
          ? Response.json(
              {
                invitation: { ...pending, role: null, workspace: null },
                link,
              },
              { status: 201 },
            )
          : undefined,
    });
    renderApp("/admin/users?tab=invitations");
    await screen.findByRole("grid", { name: "Invitations" });
    await actor.click(
      screen.getAllByRole("button", {
        name: "Invite someone",
      })[0] as HTMLElement,
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Invite someone",
    });
    const send = within(dialog).getByRole("button", {
      name: "Send invitation",
    });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    expect(within(dialog).queryByRole("button", { name: /Role/ })).toBeNull();
    await actor.type(
      within(dialog).getByRole("textbox", { name: /^Email/ }),
      "solo@e2e.example",
    );
    await actor.click(send);
    const sent = await screen.findByRole("dialog", { name: "Invitation sent" });
    expect(
      (
        within(sent).getByRole("textbox", {
          name: /Invitation link/,
        }) as HTMLInputElement
      ).value,
    ).toBe(link);
    expect(
      calls.find((call) => call.path === "/api/v1/admin/invitations")?.body,
    ).toEqual({ email: "solo@e2e.example" });
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    await actor.click(within(sent).getByRole("button", { name: "Copy link" }));
    expect(await within(sent).findByText("Copied")).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(link);
  });

  test("Show All lists every invitation; none at all says so", async () => {
    const actor = userEvent.setup();
    const calls = usersApi({
      answer: (call) =>
        call.path.startsWith("/api/v1/admin/invitations?") &&
        call.path.includes("status=all")
          ? page([])
          : undefined,
    });
    renderApp("/admin/users?tab=invitations");
    await screen.findByRole("grid", { name: "Invitations" });
    await actor.click(screen.getByRole("button", { name: /Show/ }));
    await actor.click(await screen.findByRole("option", { name: "All" }));
    expect(
      await screen.findByRole("heading", { name: "No invitations yet" }),
    ).toBeTruthy();
    expect(calls.some((call) => call.path.includes("status=all"))).toBe(true);
  });

  test("Invite someone to a workspace: its role goes with it; a pending one offers Resend", async () => {
    const actor = userEvent.setup();
    const calls = usersApi({
      answer: (call) =>
        call.method === "POST" && call.path === "/api/v1/admin/invitations"
          ? apiError(409, "INVITATION_PENDING", { invitationId: pending.id })
          : undefined,
    });
    renderApp("/admin/users?tab=invitations");
    await screen.findByRole("grid", { name: "Invitations" });
    await actor.click(
      screen.getAllByRole("button", {
        name: "Invite someone",
      })[0] as HTMLElement,
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Invite someone",
    });
    await actor.type(
      within(dialog).getByRole("textbox", { name: /^Email/ }),
      "new.member@bcdx.example",
    );
    await actor.click(
      within(dialog).getByRole("button", { name: /Show suggestions/ }),
    );
    await actor.click(await screen.findByRole("option", { name: /BCDX/ }));
    expect(within(dialog).getByRole("button", { name: /Role/ })).toBeTruthy();
    await actor.click(
      within(dialog).getByRole("button", { name: "Send invitation" }),
    );
    expect(
      await within(dialog).findByText(
        "An invitation to new.member@bcdx.example is already pending",
      ),
    ).toBeTruthy();
    // The note keeps the address it was sent to while the field changes.
    await actor.type(
      within(dialog).getByRole("textbox", { name: /^Email/ }),
      "x",
    );
    expect(
      within(dialog).getByText(
        "An invitation to new.member@bcdx.example is already pending",
      ),
    ).toBeTruthy();
    expect(
      calls.find((call) => call.path === "/api/v1/admin/invitations")?.body,
    ).toEqual({
      email: "new.member@bcdx.example",
      workspaceId: bcdx.id,
      role: "member",
    });
  });

  test("Invite someone: an unexpected failure (500) shows the small dialog; Retry sends again, Close closes Invite someone", async () => {
    const actor = userEvent.setup();
    const calls = usersApi({
      answer: (call) =>
        call.method === "POST" && call.path === "/api/v1/admin/invitations"
          ? apiError(500, "INTERNAL")
          : undefined,
    });
    renderApp("/admin/users?tab=invitations");
    await screen.findByRole("grid", { name: "Invitations" });
    await actor.click(
      screen.getAllByRole("button", {
        name: "Invite someone",
      })[0] as HTMLElement,
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Invite someone",
    });
    const email = within(dialog).getByRole("textbox", {
      name: /^Email/,
    }) as HTMLInputElement;
    await actor.type(email, "solo@e2e.example");
    await actor.click(
      within(dialog).getByRole("button", { name: "Send invitation" }),
    );
    const failure = await screen.findByRole("alertdialog", {
      name: /Something went wrong/,
    });
    expect(within(failure).getByText("Ref: 8f14e45f")).toBeTruthy();
    // Not in place, as a fixed reason would be (design-spec 6.0.6).
    expect(within(dialog).queryByText("Something went wrong")).toBeNull();
    expect(email.value).toBe("solo@e2e.example");
    const posts = () =>
      calls.filter(
        (call) =>
          call.method === "POST" && call.path === "/api/v1/admin/invitations",
      );
    await actor.click(within(failure).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(posts()[1]?.body).toEqual({ email: "solo@e2e.example" });
    await actor.click(
      within(
        await screen.findByRole("alertdialog", {
          name: /Something went wrong/,
        }),
      ).getByRole("button", { name: "Close" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Invite someone" }),
      ).toBeNull(),
    );
    expect(
      screen.queryByRole("alertdialog", { name: /Something went wrong/ }),
    ).toBeNull();
  });

  test("Invite someone: the refusals 9 shares stay in place, in their words (errors:<CODE>)", async () => {
    const actor = userEvent.setup();
    let refusal = apiError(409, "ALREADY_MEMBER");
    usersApi({
      answer: (call) =>
        call.method === "POST" && call.path === "/api/v1/admin/invitations"
          ? refusal
          : undefined,
    });
    renderApp("/admin/users?tab=invitations");
    await screen.findByRole("grid", { name: "Invitations" });
    await actor.click(
      screen.getAllByRole("button", {
        name: "Invite someone",
      })[0] as HTMLElement,
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Invite someone",
    });
    await actor.type(
      within(dialog).getByRole("textbox", { name: /^Email/ }),
      "ana@bcdx.example",
    );
    const send = within(dialog).getByRole("button", {
      name: "Send invitation",
    });
    await actor.click(send);
    expect(
      await within(dialog).findByText(
        "ana@bcdx.example is already a member of this workspace",
      ),
    ).toBeTruthy();
    refusal = apiError(404, "NOT_FOUND");
    await actor.click(send);
    expect(
      await within(dialog).findByText("This workspace no longer exists"),
    ).toBeTruthy();
    expect(
      screen.queryByRole("alertdialog", { name: /Something went wrong/ }),
    ).toBeNull();
  });

  test("Resend of a cancelled invitation and Suspend of a deleted account say so (errors:<CODE>)", async () => {
    const actor = userEvent.setup();
    usersApi({
      answer: (call) => {
        if (call.path === `/api/v1/invitations/${pending.id}/resend`) {
          return apiError(410, "INVITATION_INVALID");
        }
        if (call.path === `/api/v1/admin/users/${ana.id}/suspend`) {
          return apiError(404, "NOT_FOUND");
        }
        return undefined;
      },
    });
    renderApp("/admin/users?tab=invitations");
    await screen.findByRole("heading", {
      level: 2,
      name: "new.member@bcdx.example",
    });
    await actor.click(screen.getByRole("button", { name: "Resend" }));
    expect(
      await screen.findByText(
        "The invitation to new.member@bcdx.example was cancelled",
      ),
    ).toBeTruthy();
    await actor.click(screen.getByRole("tab", { name: "Users" }));
    await actor.keyboard("{Enter}");
    await screen.findByRole("heading", { level: 2, name: "Ana Villanueva" });
    await actor.click(screen.getByRole("button", { name: "Suspend" }));
    await actor.click(
      within(
        await screen.findByRole("alertdialog", {
          name: "Suspend Ana Villanueva?",
        }),
      ).getByRole("button", { name: "Suspend" }),
    );
    expect(
      await screen.findByText("This account no longer exists"),
    ).toBeTruthy();
  });

  test("counts group their thousands: 1234 shows as 1,234 (design-spec 1.2)", async () => {
    const actor = userEvent.setup();
    usersApi({
      answer: (call) => {
        if (call.path.startsWith("/api/v1/admin/users?")) {
          return page([{ ...anaUser, workspaceCount: 1234 }]);
        }
        if (call.path.startsWith("/api/v1/admin/workspaces?")) {
          return page([{ ...bcdx, memberCount: 1234, ideaCount: 12345 }]);
        }
        return undefined;
      },
    });
    renderApp("/admin/users");
    const users = await screen.findByRole("grid", { name: "Users" });
    expect(within(users).getByText("1,234")).toBeTruthy();
    // The detail beside the list says it the same way.
    await screen.findByRole("heading", { level: 2, name: "Ana Villanueva" });
    expect(screen.getAllByText("1,234")).toHaveLength(2);
    await actor.click(screen.getByRole("tab", { name: "Workspaces" }));
    await actor.keyboard("{Enter}");
    const workspaces = await screen.findByRole("grid", { name: "Workspaces" });
    expect(within(workspaces).getByText("1,234")).toBeTruthy();
    expect(within(workspaces).getByText("12,345")).toBeTruthy();
    await screen.findByRole("heading", { level: 2, name: "BCDX" });
    expect(screen.getAllByText("1,234")).toHaveLength(2);
    expect(screen.getAllByText("12,345")).toHaveLength(2);
  });

  test("anyone but an operator: no access, nothing read", async () => {
    const calls = usersApi({ me: ana });
    renderApp("/admin/users");
    expect(
      await screen.findByRole("heading", {
        name: "You don't have access to this",
      }),
    ).toBeTruthy();
    expect(calls.some((call) => call.path.startsWith("/api/v1/admin"))).toBe(
      false,
    );
  });
});
