import { formatDate } from "@moonx/i18n";
import type { Invitation, Me, Member, Role } from "@moonx/schemas";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ana,
  apiError,
  type Call,
  holdFirst,
  renderApp,
  stubApi,
  toastAfter,
} from "../test/api";
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
  answer?: (call: Call) => Response | Promise<Response> | undefined;
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

/** How many times W4 GET was read, of either list. */
const invitationReads = (calls: Call[]) =>
  calls.filter(
    ({ method, path }) =>
      method === "GET" && path.startsWith(`${invitationsPath}?`),
  ).length;

/** The alert that says `words`, wherever on 9 it is. */
const alertSaying = async (words: string) => {
  const alert = (await screen.findByText(words)).closest<HTMLElement>(
    '[role="alert"]',
  );
  if (alert === null) throw new Error(`"${words}" is not in an alert`);
  return alert;
};

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
      expect(
        screen.queryByRole("link", { name: "Workspace Settings" }),
      ).toBeNull();
      expect(calls.some(({ path }) => path === membersPath)).toBe(false);
    },
  );

  test("an Owner has Workspace Settings in the navigation", async () => {
    settingsApi();
    renderApp(`/w/${workspaceId}`);
    const link = await screen.findByRole("link", {
      name: "Workspace Settings",
    });
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
    // What being removed undoes, as 6.16's table has it.
    expect(question.textContent).toContain(
      "They lose access to this workspace. Their self analysis stops being shared with it and stays unshared if they join again, and the execution items assigned to them keep their name as text. Their name stays on what they added and wrote here, marked “(former member)”. Their notifications from this workspace stay, but open “You no longer have access”.",
    );
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

  test("a change the API refuses for the only Owner or the personal workspace's owner: its words under the list, the list read again", async () => {
    const user = userEvent.setup();
    const otherOwner = { ...kenji, role: "owner" as const };
    let refusal: "LAST_OWNER" | "PERSONAL_OWNER" = "LAST_OWNER";
    const calls = settingsApi({
      members: [anaMember, otherOwner],
      answer: ({ method, path }) =>
        method === "PATCH" && path === `${membersPath}/${kenji.user.id}`
          ? apiError(409, refusal)
          : undefined,
    });
    renderApp(base);
    const list = await membersList();
    const reads = () =>
      calls.filter(
        ({ method, path }) => method === "GET" && path === membersPath,
      ).length;
    for (const [code, words] of [
      ["LAST_OWNER", "This workspace needs at least one Owner"],
      ["PERSONAL_OWNER", "Owner of this personal workspace"],
    ] as const) {
      refusal = code;
      const before = reads();
      await user.click(
        within(list).getByRole("button", { name: /Role of Kenji Mori/ }),
      );
      await user.click(await screen.findByRole("option", { name: "Member" }));
      const alert = (await screen.findByText(words)).closest('[role="alert"]');
      expect(alert).not.toBeNull();
      expect(alert?.textContent).not.toContain("Something went wrong");
      expect(list.contains(alert)).toBe(false);
      expect(
        alert !== null &&
          list.compareDocumentPosition(alert) &
            Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      await waitFor(() => expect(reads()).toBeGreaterThan(before));
      // The Picker is back on the role the API kept.
      expect(
        within(list).getByRole("button", { name: /Role of Kenji Mori/ })
          .textContent,
      ).toContain("Owner");
    }
  });

  test.each([
    ["LAST_OWNER", "This workspace needs at least one Owner"],
    ["PERSONAL_OWNER", "Owner of this personal workspace"],
  ] as const)(
    "Remove refused with %s: its words under the list, the member kept, the list read again",
    async (code, words) => {
      const user = userEvent.setup();
      const otherOwner = { ...kenji, role: "owner" as const };
      const calls = settingsApi({
        members: [anaMember, otherOwner],
        answer: ({ method, path }) =>
          method === "DELETE" && path === `${membersPath}/${kenji.user.id}`
            ? apiError(409, code)
            : undefined,
      });
      renderApp(base);
      const list = await membersList();
      const reads = () =>
        calls.filter(
          ({ method, path }) => method === "GET" && path === membersPath,
        ).length;
      const before = reads();
      await user.click(
        within(list).getByRole("button", {
          name: "Member actions of Kenji Mori",
        }),
      );
      await user.click(await screen.findByRole("menuitem", { name: "Remove" }));
      const question = await screen.findByRole("alertdialog", {
        name: "Remove Kenji Mori?",
      });
      await user.click(
        within(question).getByRole("button", { name: "Remove" }),
      );
      const alert = await alertSaying(words);
      expect(alert.textContent).not.toContain("Something went wrong");
      expect(list.contains(alert)).toBe(false);
      expect(
        list.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(within(list).getByText("Kenji Mori")).toBeTruthy();
      await waitFor(() => expect(reads()).toBeGreaterThan(before));
    },
  );

  test("a role that fails to save: the Picker back to the role, Couldn't save and Retry under the list", async () => {
    const user = userEvent.setup();
    let attempt = 0;
    const calls = settingsApi({
      answer: ({ method, path }) => {
        if (method !== "PATCH" || path !== `${membersPath}/${kenji.user.id}`) {
          return undefined;
        }
        attempt += 1;
        if (attempt === 1) throw new TypeError("Failed to fetch");
        return Response.json({ ...kenji, role: "owner" });
      },
    });
    renderApp(base);
    const list = await membersList();
    const picker = () =>
      within(list).getByRole("button", { name: /Role of Kenji Mori/ });
    await user.click(picker());
    await user.click(await screen.findByRole("option", { name: "Owner" }));
    const alert = await alertSaying("Couldn't save");
    expect(alert.textContent).not.toContain("Something went wrong");
    expect(picker().textContent).toContain("Member");
    expect(picker().textContent).not.toContain("Owner");
    // Under the list, not in it.
    expect(list.contains(alert)).toBe(false);
    expect(
      list.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(picker().textContent).toContain("Owner"));
    expect(
      calls.filter(({ method }) => method === "PATCH").map(({ body }) => body),
    ).toEqual([{ role: "owner" }, { role: "owner" }]);
    expect(screen.queryByText("Couldn't save")).toBeNull();
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

  test.each(["Resend", "Cancel"] as const)(
    "%s of an invitation accepted meanwhile: Already accepted, and the list read again",
    async (action) => {
      const user = userEvent.setup();
      const calls = settingsApi({
        answer: ({ method, path }) =>
          (action === "Resend" &&
            method === "POST" &&
            path === `/api/v1/invitations/${pending.id}/resend`) ||
          (action === "Cancel" &&
            method === "DELETE" &&
            path === `/api/v1/invitations/${pending.id}`)
            ? apiError(409, "INVITATION_ALREADY_ACCEPTED")
            : undefined,
      });
      renderApp(base);
      const button = await screen.findByRole("button", {
        name: `${action} invitation to new.member@bcdx.example`,
      });
      const before = invitationReads(calls);
      await user.click(button);
      const alert = await alertSaying("Already accepted");
      expect(alert.textContent).not.toContain("Something went wrong");
      await waitFor(() =>
        expect(invitationReads(calls)).toBeGreaterThan(before),
      );
    },
  );

  test("Send invitation failing for a while: Couldn't save and Retry under it, the email kept", async () => {
    const user = userEvent.setup();
    let attempt = 0;
    const calls = settingsApi({
      answer: ({ method, path }) => {
        if (method !== "POST" || path !== invitationsPath) return undefined;
        attempt += 1;
        return attempt === 1
          ? apiError(503, "UPSTREAM_UNAVAILABLE")
          : Response.json({ invitation: pending }, { status: 201 });
      },
    });
    renderApp(base);
    const email = await screen.findByRole("textbox", {
      name: "Email to invite",
    });
    await user.type(email, "new.member@bcdx.example");
    const send = screen.getByRole("button", { name: "Send invitation" });
    await user.click(send);
    const alert = await alertSaying("Couldn't save");
    expect(alert.textContent).not.toContain("Something went wrong");
    // Under the send field's row, not in its form.
    expect(alert.closest("form")).toBeNull();
    for (const field of [email, send]) {
      expect(
        field.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect((email as HTMLInputElement).value).toBe("new.member@bcdx.example");
    await toastAfter("Invitation sent to new.member@bcdx.example", () =>
      user.click(within(alert).getByRole("button", { name: "Retry" })),
    );
    expect(
      calls
        .filter(
          ({ method, path }) => method === "POST" && path === invitationsPath,
        )
        .map(({ body }) => body),
    ).toEqual([
      { email: "new.member@bcdx.example", role: "member" },
      { email: "new.member@bcdx.example", role: "member" },
    ]);
  });

  test("Resend sends the link again: the toast says so, the list read again", async () => {
    const user = userEvent.setup();
    const calls = settingsApi({
      answer: ({ method, path }) =>
        method === "POST" && path === `/api/v1/invitations/${pending.id}/resend`
          ? Response.json({ invitation: pending })
          : undefined,
    });
    renderApp(base);
    const resend = await screen.findByRole("button", {
      name: "Resend invitation to new.member@bcdx.example",
    });
    const before = invitationReads(calls);
    await toastAfter("Invitation sent again to new.member@bcdx.example", () =>
      user.click(resend),
    );
    expect(invitationReads(calls)).toBeGreaterThan(before);
  });

  test("Resend of an expired invitation: a member already, or another one pending with its Resend", async () => {
    const user = userEvent.setup();
    const expired: Invitation = {
      ...pending,
      id: "4b2e8f1a-6666-4666-8666-666666666666",
      email: "late@bcdx.example",
      status: "expired",
    };
    const other = "4b2e8f1a-7777-4777-8777-777777777777";
    let refusal: "ALREADY_MEMBER" | "INVITATION_PENDING" = "ALREADY_MEMBER";
    const calls = settingsApi({
      invitations: [expired],
      answer: ({ method, path }) => {
        if (method !== "POST") return undefined;
        if (path === `/api/v1/invitations/${expired.id}/resend`) {
          return refusal === "ALREADY_MEMBER"
            ? apiError(409, "ALREADY_MEMBER")
            : apiError(409, "INVITATION_PENDING", { invitationId: other });
        }
        return path === `/api/v1/invitations/${other}/resend`
          ? Response.json({
              invitation: { ...pending, id: other, email: expired.email },
            })
          : undefined;
      },
    });
    renderApp(base);
    const resend = await screen.findByRole("button", {
      name: "Resend invitation to late@bcdx.example",
    });
    await user.click(resend);
    await alertSaying(
      "late@bcdx.example is already a member of this workspace",
    );
    refusal = "INVITATION_PENDING";
    await user.click(resend);
    const alert = await alertSaying(
      "An invitation to late@bcdx.example is already pending",
    );
    await toastAfter("Invitation sent again to late@bcdx.example", () =>
      user.click(within(alert).getByRole("button", { name: "Resend" })),
    );
    expect(
      calls.filter(({ method }) => method === "POST").map(({ path }) => path),
    ).toEqual([
      `/api/v1/invitations/${expired.id}/resend`,
      `/api/v1/invitations/${expired.id}/resend`,
      `/api/v1/invitations/${other}/resend`,
    ]);
  });

  test("no invitations: No pending invitations, and with All, No invitations yet", async () => {
    const user = userEvent.setup();
    const calls = settingsApi({ invitations: [] });
    renderApp(base);
    // The skeleton before the list holds the same words, inert.
    await waitFor(() =>
      expect(
        screen.getByText("No pending invitations").closest("[inert]"),
      ).toBeNull(),
    );
    await user.click(screen.getByRole("radio", { name: "All" }));
    await waitFor(() =>
      expect(
        screen.getByText("No invitations yet").closest("[inert]"),
      ).toBeNull(),
    );
    expect(screen.queryByText("No pending invitations")).toBeNull();
    expect(
      calls.some(
        ({ method, path }) =>
          method === "GET" && path === `${invitationsPath}?status=all`,
      ),
    ).toBe(true);
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

describe("9 left while a send is on its way (design-spec 6.0.6「送っている間に閉じた送信の失敗」)", () => {
  /** 9 goes for 8, as a link would, while the held send waits. */
  async function leave9(router: ReturnType<typeof renderApp>) {
    await act(() => router.navigate({ to: "/notifications" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { level: 1, name: "Workspace Settings" }),
      ).toBeNull(),
    );
  }

  test("a role chosen, and no answer comes: Couldn't save in a toast, whose Retry sends the same role", async () => {
    const user = userEvent.setup();
    let isFailing = true;
    const held = holdFirst("PATCH", `${membersPath}/${kenji.user.id}`, () => {
      if (isFailing) throw new TypeError("Failed to fetch");
      return Response.json({ ...kenji, role: "owner" });
    });
    const calls = settingsApi({ answer: held.answer });
    const router = renderApp(base);
    const list = await membersList();
    await user.click(
      within(list).getByRole("button", { name: /Role of Kenji Mori/ }),
    );
    await user.click(await screen.findByRole("option", { name: "Owner" }));
    const patches = () => calls.filter(({ method }) => method === "PATCH");
    await waitFor(() => expect(patches()).toHaveLength(1));
    await leave9(router);
    const toast = await toastAfter("Couldn't save", held.release);
    isFailing = false;
    await user.click(within(toast).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(patches().map(({ body }) => body)).toEqual([
      { role: "owner" },
      { role: "owner" },
    ]);
    expect(router.state.location.pathname).toBe("/notifications");
  });

  test("Remove refused for the personal workspace's owner: its words in a toast, without Retry", async () => {
    const user = userEvent.setup();
    const held = holdFirst("DELETE", `${membersPath}/${kenji.user.id}`, () =>
      apiError(409, "PERSONAL_OWNER"),
    );
    const calls = settingsApi({ answer: held.answer });
    const router = renderApp(base);
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
      expect(calls.some(({ method }) => method === "DELETE")).toBe(true),
    );
    await leave9(router);
    const toast = await toastAfter(
      "Owner of this personal workspace",
      held.release,
    );
    expect(within(toast).queryByRole("button", { name: "Retry" })).toBeNull();
  });

  test("making oneself a Member that goes through once 9 was left: the user stays where they went", async () => {
    const user = userEvent.setup();
    const held = holdFirst("PATCH", `${membersPath}/${ana.id}`, () =>
      Response.json({ ...anaMember, role: "member" }),
    );
    const calls = settingsApi({
      members: [anaMember, { ...kenji, role: "owner" }],
      answer: held.answer,
    });
    const router = renderApp(base);
    const list = await membersList();
    await user.click(
      within(list).getByRole("button", { name: /Role of Ana Villanueva/ }),
    );
    await user.click(await screen.findByRole("option", { name: "Member" }));
    await user.click(
      within(
        await screen.findByRole("alertdialog", {
          name: "Make yourself Member?",
        }),
      ).getByRole("button", { name: "Change my role" }),
    );
    await waitFor(() =>
      expect(calls.some(({ method }) => method === "PATCH")).toBe(true),
    );
    await leave9(router);
    const reads = () =>
      calls.filter(
        ({ method, path }) => method === "GET" && path === "/api/v1/me",
      ).length;
    const before = reads();
    await held.release();
    // The user is read again (their role there changed), and nothing moves them.
    await waitFor(() => expect(reads()).toBeGreaterThan(before));
    expect(router.state.location.pathname).toBe("/notifications");
  });

  test("making oneself a Member whose toast's Retry goes through once the user is back on 9: 9 gives way to 5", async () => {
    const user = userEvent.setup();
    let isFailing = true;
    const held = holdFirst("PATCH", `${membersPath}/${ana.id}`, () => {
      if (isFailing) throw new TypeError("Failed to fetch");
      return Response.json({ ...anaMember, role: "member" });
    });
    const calls = settingsApi({
      members: [anaMember, { ...kenji, role: "owner" }],
      answer: held.answer,
    });
    const router = renderApp(base);
    const list = await membersList();
    await user.click(
      within(list).getByRole("button", { name: /Role of Ana Villanueva/ }),
    );
    await user.click(await screen.findByRole("option", { name: "Member" }));
    await user.click(
      within(
        await screen.findByRole("alertdialog", {
          name: "Make yourself Member?",
        }),
      ).getByRole("button", { name: "Change my role" }),
    );
    const patches = () => calls.filter(({ method }) => method === "PATCH");
    await waitFor(() => expect(patches()).toHaveLength(1));
    await leave9(router);
    const toast = await toastAfter("Couldn't save", held.release);
    await act(() => router.navigate({ href: base }));
    await membersList();
    isFailing = false;
    await user.click(within(toast).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(patches()).toHaveLength(2));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/w/${workspaceId}`),
    );
  });

  /** How many times the user was read (U1 GET `me`). */
  const meReads = (calls: Call[]) =>
    calls.filter(
      ({ method, path }) => method === "GET" && path === "/api/v1/me",
    ).length;

  /** Lets what settles after an answer settle: a read it would start has started. */
  const settled = () =>
    act(() => new Promise((resolve) => setTimeout(resolve, 100)));

  test("a role change refused for good (403) once 9 was left: the toast says so, and the user is read once", async () => {
    const user = userEvent.setup();
    const held = holdFirst("PATCH", `${membersPath}/${kenji.user.id}`, () =>
      apiError(403, "FORBIDDEN"),
    );
    const calls = settingsApi({ answer: held.answer });
    const router = renderApp(base);
    const list = await membersList();
    await user.click(
      within(list).getByRole("button", { name: /Role of Kenji Mori/ }),
    );
    await user.click(await screen.findByRole("option", { name: "Owner" }));
    await waitFor(() =>
      expect(calls.some(({ method }) => method === "PATCH")).toBe(true),
    );
    await leave9(router);
    const before = meReads(calls);
    const toast = await toastAfter(
      "Couldn't save. You don't have access to this.",
      held.release,
    );
    expect(within(toast).queryByRole("button", { name: "Retry" })).toBeNull();
    await waitFor(() => expect(meReads(calls)).toBe(before + 1));
    await settled();
    expect(meReads(calls)).toBe(before + 1);
  });

  test("a Resend refused for good (403) once 9 was left: the toast says so, and the user is read once", async () => {
    const user = userEvent.setup();
    const resendPath = `/api/v1/invitations/${pending.id}/resend`;
    const held = holdFirst("POST", resendPath, () =>
      apiError(403, "FORBIDDEN"),
    );
    const calls = settingsApi({ answer: held.answer });
    const router = renderApp(base);
    await user.click(
      await screen.findByRole("button", {
        name: "Resend invitation to new.member@bcdx.example",
      }),
    );
    await waitFor(() =>
      expect(calls.some(({ path }) => path === resendPath)).toBe(true),
    );
    await leave9(router);
    const before = meReads(calls);
    await toastAfter(
      "Couldn't save. You don't have access to this.",
      held.release,
    );
    await waitFor(() => expect(meReads(calls)).toBe(before + 1));
    await settled();
    expect(meReads(calls)).toBe(before + 1);
  });

  test("a Resend whose toast's Retry is refused for good (403): the toast says so, and the user is read once", async () => {
    const user = userEvent.setup();
    const resendPath = `/api/v1/invitations/${pending.id}/resend`;
    let isFailing = true;
    const held = holdFirst("POST", resendPath, () => {
      if (isFailing) throw new TypeError("Failed to fetch");
      return apiError(403, "FORBIDDEN");
    });
    const calls = settingsApi({ answer: held.answer });
    const router = renderApp(base);
    await user.click(
      await screen.findByRole("button", {
        name: "Resend invitation to new.member@bcdx.example",
      }),
    );
    await waitFor(() =>
      expect(calls.some(({ path }) => path === resendPath)).toBe(true),
    );
    await leave9(router);
    const toast = await toastAfter("Couldn't save", held.release);
    isFailing = false;
    await settled();
    const before = meReads(calls);
    await toastAfter("Couldn't save. You don't have access to this.", () =>
      user.click(within(toast).getByRole("button", { name: "Retry" })),
    );
    await waitFor(() => expect(meReads(calls)).toBe(before + 1));
    await settled();
    expect(meReads(calls)).toBe(before + 1);
  });

  test("Leave that goes through once 9 was left: You left BCDX, and the user stays where they went", async () => {
    const user = userEvent.setup();
    const held = holdFirst(
      "DELETE",
      `${membersPath}/me`,
      () => new Response(null, { status: 204 }),
    );
    const calls = settingsApi({
      members: [anaMember, { ...kenji, role: "owner" }],
      answer: held.answer,
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
      expect(calls.some(({ method }) => method === "DELETE")).toBe(true),
    );
    await leave9(router);
    await toastAfter("You left BCDX", held.release);
    expect(router.state.location.pathname).toBe("/notifications");
  });

  test("Leave that goes through once 9 was left for another page of BCDX: the personal 5 opens, as that page would say no access", async () => {
    const user = userEvent.setup();
    const personal = {
      id: "5a1b2c3d-4444-4444-8444-444444444444",
      name: "Ana Villanueva's workspace",
      isPersonal: true,
      currency: "PHP",
    };
    const held = holdFirst(
      "DELETE",
      `${membersPath}/me`,
      () => new Response(null, { status: 204 }),
    );
    const calls = settingsApi({
      me: {
        ...ana,
        memberships: [
          { workspace: personal, role: "owner" },
          ...ana.memberships,
        ],
      },
      members: [anaMember, { ...kenji, role: "owner" }],
      answer: held.answer,
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
      expect(calls.some(({ method }) => method === "DELETE")).toBe(true),
    );
    await act(() => router.navigate({ to: `/w/${workspaceId}/ideas` }));
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { level: 1, name: "Workspace Settings" }),
      ).toBeNull(),
    );
    await toastAfter("You left BCDX", held.release);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/w/${personal.id}`),
    );
  });

  test.each([
    {
      refusal: "to a member's address",
      answer: () => apiError(409, "ALREADY_MEMBER"),
      words: "kenji@bcdx.example is already a member of this workspace",
    },
    {
      refusal: "to an address the API refuses by its rule",
      answer: () =>
        apiError(422, "VALIDATION_FAILED", {
          details: [{ path: "email", message: "invalid" }],
        }),
      words: "Couldn't save. Check the format.",
    },
  ])(
    "Send invitation $refusal: its words in a toast, without Retry",
    async ({ answer, words }) => {
      const user = userEvent.setup();
      const held = holdFirst("POST", invitationsPath, answer);
      const calls = settingsApi({ answer: held.answer });
      const router = renderApp(base);
      await user.type(
        await screen.findByRole("textbox", { name: "Email to invite" }),
        "kenji@bcdx.example",
      );
      await user.click(screen.getByRole("button", { name: "Send invitation" }));
      await waitFor(() =>
        expect(
          calls.find(
            ({ method, path }) => method === "POST" && path === invitationsPath,
          )?.body,
        ).toEqual({ email: "kenji@bcdx.example", role: "member" }),
      );
      await leave9(router);
      const toast = await toastAfter(words, held.release);
      expect(within(toast).queryByRole("button", { name: "Retry" })).toBeNull();
    },
  );

  test("Resend failing unexpectedly (500): Something went wrong with its Ref and Retry, in a toast; Retry resends it", async () => {
    const user = userEvent.setup();
    let isFailing = true;
    const resendPath = `/api/v1/invitations/${pending.id}/resend`;
    const held = holdFirst("POST", resendPath, () =>
      isFailing
        ? apiError(500, "INTERNAL")
        : Response.json({ invitation: pending }),
    );
    const calls = settingsApi({ answer: held.answer });
    const router = renderApp(base);
    await user.click(
      await screen.findByRole("button", {
        name: "Resend invitation to new.member@bcdx.example",
      }),
    );
    const resends = () => calls.filter(({ path }) => path === resendPath);
    await waitFor(() => expect(resends()).toHaveLength(1));
    await leave9(router);
    const toast = await toastAfter(
      "Something went wrong. Ref: 8f14e45f",
      held.release,
    );
    isFailing = false;
    await toastAfter("Invitation sent again to new.member@bcdx.example", () =>
      user.click(within(toast).getByRole("button", { name: "Retry" })),
    );
    expect(resends()).toHaveLength(2);
  });

  test("Cancel of an invitation accepted meanwhile: Already accepted in a toast, without Retry", async () => {
    const user = userEvent.setup();
    const held = holdFirst("DELETE", `/api/v1/invitations/${pending.id}`, () =>
      apiError(409, "INVITATION_ALREADY_ACCEPTED"),
    );
    const calls = settingsApi({ answer: held.answer });
    const router = renderApp(base);
    await user.click(
      await screen.findByRole("button", {
        name: "Cancel invitation to new.member@bcdx.example",
      }),
    );
    await waitFor(() =>
      expect(calls.some(({ method }) => method === "DELETE")).toBe(true),
    );
    await leave9(router);
    const toast = await toastAfter("Already accepted", held.release);
    expect(within(toast).queryByRole("button", { name: "Retry" })).toBeNull();
  });
});
