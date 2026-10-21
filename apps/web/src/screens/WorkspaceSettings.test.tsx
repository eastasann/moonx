import { formatDate } from "@moonx/i18n";
import type { Invitation, Me, Member, Role } from "@moonx/schemas";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ana, apiError, type Call, renderApp, stubApi } from "../test/api";
import { workspaceId } from "../test/ideas";

// 9 Workspace Settings (design-spec 6.16).

afterEach(() => {
  vi.unstubAllGlobals();
});

const base = `/w/${workspaceId}/settings`;
const membersPath = `/api/v1/workspaces/${workspaceId}/members`;
const invitationsPath = `/api/v1/workspaces/${workspaceId}/invitations`;

const as = (role: Role): Me => ({
  ...ana,
  memberships: ana.memberships.map((membership) => ({ ...membership, role })),
});

const member = (
  id: string,
  displayName: string,
  role: Role,
  email: string,
): Member => ({
  user: { id, displayName, avatarUrl: null, badge: null },
  email,
  role,
  joinedAt: "2026-09-01T00:00:00.000Z",
  isPersonalOwner: false,
});

const anaMember = member(ana.id, ana.displayName, "owner", ana.email);
const kenji = member(
  "7d793037-a076-4c2b-9f8e-3a1b2c3d4e5f",
  "Kenji Mori",
  "member",
  "kenji@bcdx.example",
);

const pending: Invitation = {
  id: "4b2e8f1a-3333-4333-8333-333333333333",
  email: "new.member@bcdx.example",
  role: "member",
  workspace: { id: workspaceId, name: "BCDX" },
  status: "pending",
  invitedBy: {
    id: ana.id,
    displayName: ana.displayName,
    avatarUrl: null,
    badge: null,
  },
  createdAt: "2026-10-20T02:00:00.000Z",
  expiresAt: "2026-10-27T02:00:00.000Z",
  acceptedAt: null,
};

/** The API of 9; `answer` takes a call first, for the case a test is about. */
function settingsApi({
  me = ana,
  members = [anaMember, kenji],
  invitations = [pending],
  answer,
}: {
  me?: Me;
  members?: Member[];
  invitations?: Invitation[];
  answer?: (call: Call) => Response | undefined;
} = {}) {
  return stubApi((call: Call) => {
    const answered = answer?.(call);
    if (answered !== undefined) return answered;
    const { method, path } = call;
    if (method === "GET" && path === "/api/v1/me") return Response.json(me);
    if (method === "PATCH" && path === "/api/v1/me") return Response.json(me);
    if (method === "GET" && path === membersPath) {
      return Response.json({ items: members });
    }
    if (method === "GET" && path.startsWith(`${invitationsPath}?`)) {
      return Response.json({ items: invitations });
    }
    return undefined;
  });
}

/** The members once read: the skeleton before them has rows of the same name. */
const membersList = async () => {
  await screen.findByText("(you)");
  return screen.getByRole("list", { name: "Members" });
};

describe("9 Workspace Settings (design-spec 6.16)", () => {
  test("an Owner: the workspace, the members with the only Owner held, and the pending invitations", async () => {
    settingsApi();
    renderApp(base);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Workspace Settings",
      }),
    ).toBeTruthy();
    expect(
      (screen.getByRole("textbox", { name: /^Name/ }) as HTMLInputElement)
        .value,
    ).toBe("BCDX");
    expect(
      screen.getByText(
        "Changing the currency does not convert amounts you already entered.",
      ),
    ).toBeTruthy();
    const list = await membersList();
    expect(within(list).getByText("(you)")).toBeTruthy();
    expect(
      within(list).getByText("This workspace needs at least one Owner"),
    ).toBeTruthy();
    expect(
      within(list)
        .getByRole("button", { name: /Role of Ana Villanueva/ })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      within(list)
        .getByRole("button", { name: /Role of Kenji Mori/ })
        .hasAttribute("disabled"),
    ).toBe(false);
    expect(
      screen.getByText("2 people. Owners can invite and change roles."),
    ).toBeTruthy();
    const date = (value: string) =>
      formatDate(value, { timeZone: ana.timezone });
    expect(
      await screen.findByText(
        `Member · sent ${date(pending.createdAt)} · expires ${date(pending.expiresAt)}`,
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Resend invitation to new.member@bcdx.example",
      }),
    ).toBeTruthy();
    expect(document.title).toBe("Workspace Settings · BCDX · moonx");
  });

  test.each(["member", "viewer"] as const)(
    "a %s: no access, and no way in from the navigation",
    async (role) => {
      const calls = settingsApi({ me: as(role) });
      renderApp(base);
      expect(
        await screen.findByRole("heading", {
          name: "You don't have access to this",
        }),
      ).toBeTruthy();
      expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
      expect(calls.some(({ path }) => path === membersPath)).toBe(false);
    },
  );

  test("an Owner has Settings in the navigation", async () => {
    settingsApi();
    renderApp(`/w/${workspaceId}`);
    const link = await screen.findByRole("link", { name: "Settings" });
    expect(link.getAttribute("href")).toBe(base);
  });

  test("the name saves when the field is left", async () => {
    const user = userEvent.setup();
    const calls = settingsApi({
      answer: ({ method, path, body }) =>
        method === "PATCH" && path === `/api/v1/workspaces/${workspaceId}`
          ? Response.json({
              id: workspaceId,
              name: (body as { name: string }).name,
              currency: "PHP",
              isPersonal: false,
              myRole: "owner",
              memberCount: 2,
            })
          : undefined,
    });
    renderApp(base);
    const name = await screen.findByRole("textbox", { name: /^Name/ });
    await user.clear(name);
    expect(screen.getByText("Can't be empty")).toBeTruthy();
    await user.type(name, "BCDX Bacolod");
    await user.tab();
    await waitFor(() =>
      expect(
        calls.find(
          ({ method, path }) =>
            method === "PATCH" && path === `/api/v1/workspaces/${workspaceId}`,
        )?.body,
      ).toEqual({ name: "BCDX Bacolod" }),
    );
  });

  test("Send invitation sends the email as a Member; one pending already offers its Resend", async () => {
    const user = userEvent.setup();
    const calls = settingsApi({
      answer: ({ method, path }) =>
        method === "POST" && path === invitationsPath
          ? apiError(409, "INVITATION_PENDING", { invitationId: pending.id })
          : method === "POST" &&
              path === `/api/v1/invitations/${pending.id}/resend`
            ? Response.json({ invitation: pending })
            : undefined,
    });
    renderApp(base);
    const send = await screen.findByRole("button", { name: "Send invitation" });
    expect(send.hasAttribute("disabled")).toBe(true);
    await user.type(
      screen.getByRole("textbox", { name: "Email to invite" }),
      "new.member@bcdx.example",
    );
    await user.click(send);
    await waitFor(() =>
      expect(
        calls.find(
          ({ method, path }) => method === "POST" && path === invitationsPath,
        )?.body,
      ).toEqual({ email: "new.member@bcdx.example", role: "member" }),
    );
    const alert = await screen.findByText(
      "An invitation to new.member@bcdx.example is already pending",
    );
    await user.click(
      within(alert.closest("[role=alert]") as HTMLElement).getByRole("button", {
        name: "Resend",
      }),
    );
    await waitFor(() =>
      expect(
        calls.some(
          ({ method, path }) =>
            method === "POST" &&
            path === `/api/v1/invitations/${pending.id}/resend`,
        ),
      ).toBe(true),
    );
  });

  test("an address of a member says so", async () => {
    const user = userEvent.setup();
    settingsApi({
      answer: ({ method, path }) =>
        method === "POST" && path === invitationsPath
          ? apiError(409, "ALREADY_MEMBER")
          : undefined,
    });
    renderApp(base);
    await user.type(
      await screen.findByRole("textbox", { name: "Email to invite" }),
      "kenji@bcdx.example",
    );
    await user.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(
      await screen.findByText(
        "kenji@bcdx.example is already a member of this workspace",
      ),
    ).toBeTruthy();
  });

  test("making someone a Viewer asks first, then saves the role", async () => {
    const user = userEvent.setup();
    const calls = settingsApi({
      answer: ({ method, path }) =>
        method === "PATCH" && path === `${membersPath}/${kenji.user.id}`
          ? Response.json({ ...kenji, role: "viewer" })
          : undefined,
    });
    renderApp(base);
    const list = await membersList();
    await user.click(
      within(list).getByRole("button", { name: /Role of Kenji Mori/ }),
    );
    await user.click(await screen.findByRole("option", { name: "Viewer" }));
    const question = await screen.findByRole("alertdialog", {
      name: "Make Kenji Mori a Viewer?",
    });
    expect(calls.some(({ method }) => method === "PATCH")).toBe(false);
    await user.click(
      within(question).getByRole("button", { name: "Make Viewer" }),
    );
    await waitFor(() =>
      expect(calls.find(({ method }) => method === "PATCH")?.body).toEqual({
        role: "viewer",
      }),
    );
    await waitFor(() =>
      expect(
        within(list).getByRole("button", { name: /Role of Kenji Mori/ })
          .textContent,
      ).toContain("Viewer"),
    );
  });

  test("Remove asks first, then removes the member", async () => {
    const user = userEvent.setup();
    const calls = settingsApi({
      answer: ({ method, path }) =>
        method === "DELETE" && path === `${membersPath}/${kenji.user.id}`
          ? new Response(null, { status: 204 })
          : undefined,
    });
    renderApp(base);
    const list = await membersList();
    await user.click(
      within(list).getByRole("button", {
        name: "Member actions of Kenji Mori",
      }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Remove" }));
    const question = await screen.findByRole("alertdialog", {
      name: "Remove Kenji Mori?",
    });
    await user.click(within(question).getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(
        calls.some(
          ({ method, path }) =>
            method === "DELETE" && path === `${membersPath}/${kenji.user.id}`,
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(within(list).queryByText("Kenji Mori")).toBeNull(),
    );
  });

  test("the owner of a personal workspace keeps the role, with why", async () => {
    settingsApi({
      members: [anaMember, { ...kenji, role: "owner", isPersonalOwner: true }],
    });
    renderApp(base);
    const list = await membersList();
    expect(
      within(list).getByText("Owner of this personal workspace"),
    ).toBeTruthy();
    expect(
      within(list)
        .getByRole("button", { name: "Member actions of Kenji Mori" })
        .hasAttribute("disabled"),
    ).toBe(true);
    // Two Owners: Ana may change her own role and leave.
    expect(
      within(list)
        .getByRole("button", { name: /Role of Ana Villanueva/ })
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  test("Cancel cancels a pending invitation and reads the list again; an expired one has Resend only", async () => {
    const user = userEvent.setup();
    const expired: Invitation = {
      ...pending,
      id: "4b2e8f1a-6666-4666-8666-666666666666",
      email: "late@bcdx.example",
      status: "expired",
    };
    const calls = settingsApi({
      invitations: [pending, expired],
      answer: ({ method, path }) =>
        method === "DELETE" && path === `/api/v1/invitations/${pending.id}`
          ? new Response(null, { status: 204 })
          : undefined,
    });
    renderApp(base);
    await screen.findByText("late@bcdx.example");
    expect(
      screen.getByRole("button", {
        name: "Resend invitation to late@bcdx.example",
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "Cancel invitation to late@bcdx.example",
      }),
    ).toBeNull();
    const reads = () =>
      calls.filter(
        ({ method, path }) =>
          method === "GET" && path.startsWith(`${invitationsPath}?`),
      ).length;
    const before = reads();
    await user.click(
      screen.getByRole("button", {
        name: "Cancel invitation to new.member@bcdx.example",
      }),
    );
    expect(
      await screen.findByText(
        "Invitation to new.member@bcdx.example cancelled",
      ),
    ).toBeTruthy();
    expect(
      calls.some(
        ({ method, path }) =>
          method === "DELETE" && path === `/api/v1/invitations/${pending.id}`,
      ),
    ).toBe(true);
    expect(reads()).toBeGreaterThan(before);
  });

  test("Resend of an invitation cancelled meanwhile says so", async () => {
    const user = userEvent.setup();
    settingsApi({
      answer: ({ method, path }) =>
        method === "POST" && path === `/api/v1/invitations/${pending.id}/resend`
          ? apiError(410, "INVITATION_INVALID")
          : undefined,
    });
    renderApp(base);
    await user.click(
      await screen.findByRole("button", {
        name: "Resend invitation to new.member@bcdx.example",
      }),
    );
    expect(
      await screen.findByText(
        "The invitation to new.member@bcdx.example was cancelled",
      ),
    ).toBeTruthy();
  });

  test("making oneself a Member asks first, then leaves 9 for 5", async () => {
    const user = userEvent.setup();
    const otherOwner = { ...kenji, role: "owner" as const };
    const calls = settingsApi({
      members: [anaMember, otherOwner],
      answer: ({ method, path }) =>
        method === "PATCH" && path === `${membersPath}/${ana.id}`
          ? Response.json({ ...anaMember, role: "member" })
          : undefined,
    });
    const router = renderApp(base);
    const list = await membersList();
    await user.click(
      within(list).getByRole("button", { name: /Role of Ana Villanueva/ }),
    );
    await user.click(await screen.findByRole("option", { name: "Member" }));
    const question = await screen.findByRole("alertdialog", {
      name: "Make yourself Member?",
    });
    await user.click(
      within(question).getByRole("button", { name: "Change my role" }),
    );
    await waitFor(() =>
      expect(calls.find(({ method }) => method === "PATCH")?.body).toEqual({
        role: "member",
      }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/w/${workspaceId}`),
    );
  });

  test("Leave from one's own ⋯ asks first, then opens the personal 5", async () => {
    const user = userEvent.setup();
    const personal = {
      id: "5a1b2c3d-4444-4444-8444-444444444444",
      name: "Ana Villanueva's workspace",
      isPersonal: true,
      currency: "PHP",
    };
    const calls = settingsApi({
      me: {
        ...ana,
        memberships: [
          { workspace: personal, role: "owner" },
          ...ana.memberships,
        ],
      },
      members: [anaMember, { ...kenji, role: "owner" }],
      answer: ({ method, path }) =>
        method === "DELETE" && path === `${membersPath}/me`
          ? new Response(null, { status: 204 })
          : undefined,
    });
    const router = renderApp(base);
    const list = await membersList();
    await user.click(
      within(list).getByRole("button", {
        name: "Member actions of Ana Villanueva",
      }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Leave" }));
    const question = await screen.findByRole("alertdialog", {
      name: "Leave BCDX?",
    });
    await user.click(within(question).getByRole("button", { name: "Leave" }));
    await waitFor(() =>
      expect(
        calls.some(
          ({ method, path }) =>
            method === "DELETE" && path === `${membersPath}/me`,
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/w/${personal.id}`),
    );
  });

  test("a lost session sends the user to log in, without a failure of its own", async () => {
    const user = userEvent.setup();
    settingsApi({
      answer: ({ method, path }) =>
        method === "DELETE" && path === `/api/v1/invitations/${pending.id}`
          ? apiError(401, "UNAUTHENTICATED")
          : undefined,
    });
    const router = renderApp(base);
    await user.click(
      await screen.findByRole("button", {
        name: "Cancel invitation to new.member@bcdx.example",
      }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });

  test("Cancel of an invitation cancelled meanwhile reads the list again, saying nothing", async () => {
    const user = userEvent.setup();
    const calls = settingsApi({
      answer: ({ method, path }) =>
        method === "DELETE" && path === `/api/v1/invitations/${pending.id}`
          ? apiError(410, "INVITATION_INVALID")
          : undefined,
    });
    renderApp(base);
    const reads = () =>
      calls.filter(
        ({ method, path }) =>
          method === "GET" && path.startsWith(`${invitationsPath}?`),
      ).length;
    const cancel = await screen.findByRole("button", {
      name: "Cancel invitation to new.member@bcdx.example",
    });
    const before = reads();
    await user.click(cancel);
    await waitFor(() => expect(reads()).toBeGreaterThan(before));
    expect(
      screen.queryByText(
        "The invitation to new.member@bcdx.example was cancelled",
      ),
    ).toBeNull();
    expect(screen.queryByText("Couldn't save")).toBeNull();
  });
});
