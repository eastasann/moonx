import type { Me, Member } from "@moonx/schemas";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { PENDING_MS } from "../components/states";
import {
  ana,
  apiError,
  authError,
  type Call,
  renderApp,
  stubApi,
  toastAfter,
} from "../test/api";

// 4 Account (design-spec 6.16).

afterEach(() => {
  vi.unstubAllGlobals();
});

const bcdx = ana.memberships[0]?.workspace ?? {
  id: "",
  name: "",
  isPersonal: false,
  currency: "PHP",
};
const personal = {
  id: "5a1b2c3d-4444-4444-8444-444444444444",
  name: "Ana Villanueva's workspace",
  isPersonal: true,
  currency: "PHP",
};
const team = {
  id: "6b2c3d4e-5555-4555-8555-555555555555",
  name: "Bacolod Bakers",
  isPersonal: false,
  currency: "PHP",
};

/** Ana in her personal workspace, the Owner of BCDX and a Member of another team. */
const anaHere: Me = {
  ...ana,
  memberships: [
    { workspace: personal, role: "owner" },
    { workspace: bcdx, role: "owner" },
    { workspace: team, role: "member" },
  ],
};

const owner: Member = {
  user: {
    id: ana.id,
    displayName: ana.displayName,
    avatarUrl: null,
    badge: null,
  },
  email: ana.email,
  role: "owner",
  joinedAt: "2026-09-01T00:00:00.000Z",
  isPersonalOwner: false,
};

/** The API of 4; `answer` takes a call first, for the case a test is about. */
function accountApi({
  me = anaHere,
  answer,
}: {
  me?: Me;
  answer?: (call: Call) => Response | Promise<Response> | undefined;
} = {}) {
  let deleted = false;
  const calls = stubApi((call: Call) => {
    const answered = answer?.(call);
    if (answered !== undefined) return answered;
    const { method, path, body } = call;
    if (method === "GET" && path === "/api/v1/me") {
      return deleted ? apiError(401, "UNAUTHENTICATED") : Response.json(me);
    }
    if (method === "PATCH" && path === "/api/v1/me") {
      return Response.json({ ...me, ...(body as object) });
    }
    if (method === "GET" && path === `/api/v1/workspaces/${bcdx.id}/members`) {
      return Response.json({ items: [owner] });
    }
    if (method === "POST" && path === "/api/v1/me/delete") {
      deleted = true;
      return new Response(null, { status: 204 });
    }
    return undefined;
  });
  return calls;
}

const workspaces = () => screen.findByRole("list", { name: "Your workspaces" });

describe("4 Account (design-spec 6.16)", () => {
  test("the groups, the email shown, and Leave everywhere but the own personal workspace", async () => {
    accountApi();
    renderApp("/account");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Account" }),
    ).toBeTruthy();
    expect(document.title).toBe("Account · moonx");
    for (const name of [
      "Profile",
      "Password",
      "Preferences",
      "Workspaces",
      "Log out",
      "Delete account",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeTruthy();
    }
    const email = screen.getByRole("textbox", {
      name: /^Email/,
    }) as HTMLInputElement;
    expect(email.value).toBe(ana.email);
    expect(email.readOnly).toBe(true);
    const list = await workspaces();
    expect(
      within(list).queryByRole("button", { name: `Leave ${personal.name}` }),
    ).toBeNull();
    expect(within(list).getByText("Personal · Owner")).toBeTruthy();
    // The only Owner of BCDX: Leave is there, unavailable, with why (1.3).
    await waitFor(() =>
      expect(
        within(list).getByText("Make someone else Owner first"),
      ).toBeTruthy(),
    );
    expect(
      within(list)
        .getByRole("button", { name: "Leave BCDX" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      within(list)
        .getByRole("button", { name: `Leave ${team.name}` })
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  test("the display name saves when the field is left; against its rule it says why", async () => {
    const user = userEvent.setup();
    const calls = accountApi();
    renderApp("/account");
    const name = await screen.findByRole("textbox", { name: /^Display name/ });
    await user.clear(name);
    expect(screen.getByText("Can't be empty")).toBeTruthy();
    await user.type(name, "Ana V.");
    await user.tab();
    await waitFor(() =>
      expect(
        calls.find(
          ({ method, path }) => method === "PATCH" && path === "/api/v1/me",
        )?.body,
      ).toEqual({ displayName: "Ana V." }),
    );
  });

  test.each([
    ["it leaves", () => new Response(null, { status: 204 })],
    ["it was left already (404)", () => apiError(404, "NOT_FOUND")],
  ] as const)(
    "Leave the workspace open now, when %s: asked first, then the personal 5 and the toast",
    async (_, answer) => {
      const user = userEvent.setup();
      const calls = accountApi({
        me: { ...anaHere, lastWorkspaceId: team.id },
        answer: ({ method, path }) =>
          method === "DELETE" &&
          path === `/api/v1/workspaces/${team.id}/members/me`
            ? answer()
            : undefined,
      });
      const router = renderApp("/account");
      const list = await workspaces();
      await user.click(
        within(list).getByRole("button", { name: `Leave ${team.name}` }),
      );
      const question = await screen.findByRole("alertdialog", {
        name: `Leave ${team.name}?`,
      });
      await toastAfter(`You left ${team.name}`, () =>
        user.click(within(question).getByRole("button", { name: "Leave" })),
      );
      expect(
        calls.some(
          ({ method, path }) =>
            method === "DELETE" &&
            path === `/api/v1/workspaces/${team.id}/members/me`,
        ),
      ).toBe(true);
      await waitFor(() =>
        expect(router.state.location.pathname).toBe(`/w/${personal.id}`),
      );
    },
  );

  test("Change password: a wrong current password says so under it", async () => {
    const user = userEvent.setup();
    const calls = accountApi({
      answer: ({ method, path }) =>
        method === "POST" && path === "/api/auth/change-password"
          ? authError(400, "INVALID_PASSWORD")
          : undefined,
    });
    renderApp("/account");
    await user.type(
      await screen.findByLabelText(/^Current password/),
      "not-my-password",
    );
    await user.type(screen.getByLabelText(/^New password/), "a new password");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText("Password is incorrect")).toBeTruthy();
    expect(
      calls.find(({ path }) => path === "/api/auth/change-password")?.body,
    ).toEqual({
      currentPassword: "not-my-password",
      newPassword: "a new password",
      revokeOtherSessions: true,
    });
  });

  test("an account made with Google: Set password, and Log in again when the sign-in is old", async () => {
    const user = userEvent.setup();
    accountApi({
      me: { ...anaHere, hasPassword: false },
      answer: ({ method, path }) =>
        method === "POST" && path === "/api/v1/me/password"
          ? apiError(403, "REAUTH_REQUIRED")
          : undefined,
    });
    renderApp("/account");
    expect(screen.queryByLabelText(/^Current password/)).toBeNull();
    await user.type(
      await screen.findByLabelText(/^New password/),
      "a new password",
    );
    await user.click(screen.getByRole("button", { name: "Set password" }));
    expect(
      await screen.findByText("Log in again to set a password"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Log in again" })).toBeTruthy();
  });

  test("Delete account: another address says so unsent; the right one deletes and opens 1", async () => {
    const user = userEvent.setup();
    const calls = accountApi();
    const router = renderApp("/account");
    await user.click(
      await screen.findByRole("button", { name: "Delete account" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Delete your account?",
    });
    expect(within(dialog).getByText(/Your self analysis/)).toBeTruthy();
    const confirm = within(dialog).getByRole("button", {
      name: "Delete account",
    });
    expect(confirm.hasAttribute("disabled")).toBe(true);
    await user.type(
      within(dialog).getByRole("textbox", { name: /^Your email/ }),
      "someone@else.example",
    );
    await user.type(
      within(dialog).getByLabelText(/^Password/),
      "moonx-demo-2026",
    );
    await user.click(confirm);
    expect(
      await within(dialog).findByText("The email doesn't match your account"),
    ).toBeTruthy();
    expect(calls.some(({ path }) => path === "/api/v1/me/delete")).toBe(false);

    const email = within(dialog).getByRole("textbox", { name: /^Your email/ });
    await user.clear(email);
    await user.type(email, "ANA@bcdx.example");
    await user.click(confirm);
    await waitFor(() =>
      expect(
        calls.find(({ path }) => path === "/api/v1/me/delete")?.body,
      ).toEqual({
        confirmEmail: "ANA@bcdx.example",
        password: "moonx-demo-2026",
      }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  test("Delete account as the only Owner of a team: the way to its 9", async () => {
    const user = userEvent.setup();
    accountApi({
      answer: ({ method, path }) =>
        method === "POST" && path === "/api/v1/me/delete"
          ? apiError(409, "LAST_OWNER", {
              workspaces: [{ id: bcdx.id, name: bcdx.name }],
            })
          : undefined,
    });
    renderApp("/account");
    await user.click(
      await screen.findByRole("button", { name: "Delete account" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Delete your account?",
    });
    await user.type(
      within(dialog).getByRole("textbox", { name: /^Your email/ }),
      ana.email,
    );
    await user.type(
      within(dialog).getByLabelText(/^Password/),
      "moonx-demo-2026",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Delete account" }),
    );
    expect(
      await within(dialog).findByText("Make someone else Owner of BCDX first"),
    ).toBeTruthy();
    expect(
      within(dialog)
        .getByRole("link", { name: "Open Workspace Settings of BCDX" })
        .getAttribute("href"),
    ).toBe(`/w/${bcdx.id}/settings`);
  });

  test("Account is in the account's menu; the display mode holds the page", async () => {
    const user = userEvent.setup();
    accountApi({ me: { ...anaHere, theme: "dark" } });
    renderApp(`/w/${bcdx.id}`);
    await user.click(
      await screen.findByRole("button", { name: ana.displayName }),
    );
    const item = await screen.findByRole("menuitem", { name: "Account" });
    expect(item.getAttribute("href")).toBe("/account");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  test("Remove photo removes it, back to the initials", async () => {
    const user = userEvent.setup();
    const calls = accountApi({
      me: {
        ...anaHere,
        avatarUrl: "/api/avatars/0123456789abcdef0123456789abcdef.webp",
      },
      answer: ({ method, path }) =>
        method === "DELETE" && path === "/api/v1/me/avatar"
          ? new Response(null, { status: 204 })
          : undefined,
    });
    renderApp("/account");
    await user.click(
      await screen.findByRole("button", { name: "Remove photo" }),
    );
    await waitFor(() =>
      expect(
        calls.some(
          ({ method, path }) =>
            method === "DELETE" && path === "/api/v1/me/avatar",
        ),
      ).toBe(true),
    );
    expect(
      await screen.findByRole("button", { name: "Add photo" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove photo" })).toBeNull();
  });

  test("a time zone saves when chosen", async () => {
    const user = userEvent.setup();
    const calls = accountApi();
    renderApp("/account");
    const zone = await screen.findByRole("combobox", { name: /^Time zone/ });
    await user.clear(zone);
    await user.type(zone, "Asia/Tokyo");
    await user.click(await screen.findByRole("option", { name: "Asia/Tokyo" }));
    await waitFor(() =>
      expect(
        calls.find(
          ({ method, path }) => method === "PATCH" && path === "/api/v1/me",
        )?.body,
      ).toEqual({ timezone: "Asia/Tokyo" }),
    );
  });

  test("a display mode shows as soon as it is chosen, while it saves", async () => {
    const user = userEvent.setup();
    accountApi({
      // Held: the choice shows before U2 answers.
      answer: ({ method, path }) =>
        method === "PATCH" && path === "/api/v1/me"
          ? (new Promise<Response>(() => {}) as unknown as Response)
          : undefined,
    });
    renderApp("/account");
    await user.click(
      await screen.findByRole("button", { name: /Display mode/ }),
    );
    await user.click(await screen.findByRole("option", { name: "Dark" }));
    await waitFor(() =>
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark"),
    );
  });

  test("Delete account without a password and an old sign-in: Log in again", async () => {
    const user = userEvent.setup();
    accountApi({
      me: { ...anaHere, hasPassword: false },
      answer: ({ method, path }) =>
        method === "POST" && path === "/api/v1/me/delete"
          ? apiError(403, "REAUTH_REQUIRED")
          : undefined,
    });
    renderApp("/account");
    await user.click(
      await screen.findByRole("button", { name: "Delete account" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Delete your account?",
    });
    expect(within(dialog).queryByLabelText(/^Password/)).toBeNull();
    await user.type(
      within(dialog).getByRole("textbox", { name: /^Your email/ }),
      ana.email,
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Delete account" }),
    );
    expect(
      await within(dialog).findByText("Log in again to delete your account"),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole("button", { name: "Log in again" }),
    ).toBeTruthy();
  });

  test("the only Owner of a workspace with others cannot open Delete account, and is told where to go", async () => {
    accountApi({
      answer: ({ method, path }) =>
        method === "GET" && path === `/api/v1/workspaces/${bcdx.id}/members`
          ? Response.json({
              items: [
                owner,
                {
                  ...owner,
                  user: {
                    ...owner.user,
                    id: "7d793037-a076-4c2b-9f8e-3a1b2c3d4e5f",
                    displayName: "Kenji Mori",
                  },
                  email: "kenji@bcdx.example",
                  role: "member",
                },
              ],
            })
          : undefined,
    });
    renderApp("/account");
    expect(
      await screen.findByText("Make someone else Owner of BCDX first"),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Delete account" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("link", { name: "Open Workspace Settings of BCDX" })
        .getAttribute("href"),
    ).toBe(`/w/${bcdx.id}/settings`);
  });

  test("Change password with the session gone: on to log in, without a failure of its own", async () => {
    const user = userEvent.setup();
    accountApi({
      answer: ({ method, path }) =>
        method === "POST" && path === "/api/auth/change-password"
          ? authError(401, "UNAUTHENTICATED")
          : undefined,
    });
    const router = renderApp("/account");
    await user.type(
      await screen.findByLabelText(/^Current password/),
      "moonx-demo-2026",
    );
    await user.type(screen.getByLabelText(/^New password/), "a new password");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });

  test("Leave refused as the only Owner, W2 unread: the API's words in the question", async () => {
    const user = userEvent.setup();
    accountApi({
      answer: ({ method, path }) =>
        method === "DELETE" &&
        path === `/api/v1/workspaces/${bcdx.id}/members/me`
          ? apiError(409, "LAST_OWNER")
          : method === "GET" && path === `/api/v1/workspaces/${bcdx.id}/members`
            ? apiError(500, "INTERNAL")
            : undefined,
    });
    renderApp("/account");
    const list = await workspaces();
    await user.click(
      within(list).getByRole("button", { name: `Leave ${bcdx.name}` }),
    );
    const question = await screen.findByRole("alertdialog", {
      name: `Leave ${bcdx.name}?`,
    });
    await user.click(within(question).getByRole("button", { name: "Leave" }));
    expect(
      await within(question).findByText("Make someone else Owner first"),
    ).toBeTruthy();
    expect(within(question).queryByText("Something went wrong")).toBeNull();
  });

  /** Ana's memberships as U1 has them once she is out of the team. */
  const withoutTeam: Me = {
    ...anaHere,
    memberships: anaHere.memberships.filter(
      ({ workspace }) => workspace.id !== team.id,
    ),
  };
  const leaveTeam = `/api/v1/workspaces/${team.id}/members/me`;

  test.each([
    ["it leaves", () => new Response(null, { status: 204 })],
    ["it was left already (404)", () => apiError(404, "NOT_FOUND")],
    ["it was left already (NO_ACCESS)", () => apiError(403, "NO_ACCESS")],
  ] as const)(
    "Leave of a workspace not open now, when %s: 4 stays, the row goes, the toast says so",
    async (_, answer) => {
      const user = userEvent.setup();
      let isIn = true;
      accountApi({
        answer: ({ method, path }) => {
          if (method === "DELETE" && path === leaveTeam) {
            isIn = false;
            return answer();
          }
          return method === "GET" && path === "/api/v1/me" && !isIn
            ? Response.json(withoutTeam)
            : undefined;
        },
      });
      const router = renderApp("/account");
      const list = await workspaces();
      await user.click(
        within(list).getByRole("button", { name: `Leave ${team.name}` }),
      );
      const question = await screen.findByRole("alertdialog", {
        name: `Leave ${team.name}?`,
      });
      await toastAfter(`You left ${team.name}`, () =>
        user.click(within(question).getByRole("button", { name: "Leave" })),
      );
      expect(
        screen.queryByRole("alertdialog", { name: `Leave ${team.name}?` }),
      ).toBeNull();
      expect(within(await workspaces()).queryByText(team.name)).toBeNull();
      expect(router.state.location.pathname).toBe("/account");
      expect(screen.queryByText("Something went wrong")).toBeNull();
      expect(screen.queryByText("Couldn't save")).toBeNull();
    },
  );

  /**
   * Opens Leave of the team, presses Leave, then Cancel while the leave is held: returns
   * the question, the list and the way to answer the leave with `answer`, after which U1
   * has the team unless it left.
   */
  async function cancelWhileLeaving(answer: () => Response) {
    const user = userEvent.setup();
    let answerLeave = () => {};
    let isIn = true;
    const calls = accountApi({
      answer: ({ method, path }) => {
        if (method === "DELETE" && path === leaveTeam) {
          return new Promise<Response>((resolve) => {
            answerLeave = () => {
              const answered = answer();
              // Out once it leaves, or was out already (404, NO_ACCESS).
              isIn = ![204, 403, 404].includes(answered.status);
              resolve(answered);
            };
          });
        }
        return method === "GET" && path === "/api/v1/me" && !isIn
          ? Response.json(withoutTeam)
          : undefined;
      },
    });
    const router = renderApp("/account");
    const list = await workspaces();
    await user.click(
      within(list).getByRole("button", { name: `Leave ${team.name}` }),
    );
    const question = await screen.findByRole("alertdialog", {
      name: `Leave ${team.name}?`,
    });
    await user.click(within(question).getByRole("button", { name: "Leave" }));
    await user.click(within(question).getByRole("button", { name: "Cancel" }));
    // Still asked while the leave is on its way: it may go through.
    expect(
      screen.getByRole("alertdialog", { name: `Leave ${team.name}?` }),
    ).toBe(question);
    return {
      user,
      calls,
      router,
      list,
      question,
      answerLeave: () => answerLeave(),
    };
  }

  const leaveQuestion = () =>
    screen.queryByRole("alertdialog", { name: `Leave ${team.name}?` });

  /**
   * The name of 6.0.6's small dialog, its alert icon's label and its title: a toast
   * saying "Something went wrong. Ref: …", which may outlive its test, is not it.
   */
  const smallDialog = "Alert Something went wrong";

  test.each([
    ["it leaves", () => new Response(null, { status: 204 })],
    ["it was left already (404)", () => apiError(404, "NOT_FOUND")],
    ["it was left already (NO_ACCESS)", () => apiError(403, "NO_ACCESS")],
  ] as const)(
    "Cancel while Leave is on its way, when %s: the question closes once it is answered, and it is left",
    async (_, answer) => {
      const { list, answerLeave } = await cancelWhileLeaving(answer);
      // Left all the same: as any leave that went through.
      await toastAfter(`You left ${team.name}`, async () => answerLeave());
      await waitFor(() => expect(leaveQuestion()).toBeNull());
      await waitFor(() =>
        expect(within(list).queryByText(team.name)).toBeNull(),
      );
    },
  );

  test.each([
    [
      "unexpected (500)",
      () => apiError(500, "INTERNAL"),
      "Something went wrong. Ref: 8f14e45f",
    ],
    [
      "for now (503)",
      () => apiError(503, "UPSTREAM_UNAVAILABLE"),
      "Couldn't save. Ref: 8f14e45f",
    ],
  ] as const)(
    "Cancel while Leave is on its way, and it fails %s: the question closes once it is answered, and a toast says so; its Retry leaves",
    async (_, answer, words) => {
      let failing = true;
      const { user, calls, list, answerLeave } = await cancelWhileLeaving(() =>
        failing ? answer() : new Response(null, { status: 204 }),
      );
      const deletes = () => calls.filter(({ method }) => method === "DELETE");
      const toast = await toastAfter(words, async () => answerLeave());
      await waitFor(() => expect(leaveQuestion()).toBeNull());
      expect(within(list).getByText(team.name)).toBeTruthy();
      expect(
        screen.queryByRole("alertdialog", { name: smallDialog }),
      ).toBeNull();
      // Retry sends the same leave, which goes through this time.
      failing = false;
      await toastAfter(`You left ${team.name}`, async () => {
        await user.click(within(toast).getByRole("button", { name: "Retry" }));
        await waitFor(() => expect(deletes()).toHaveLength(2));
        answerLeave();
      });
      await waitFor(() =>
        expect(within(list).queryByText(team.name)).toBeNull(),
      );
    },
  );

  test("Cancel while Leave is on its way, and it is refused as the only Owner: the question closes, and a toast has its words", async () => {
    const { list, answerLeave } = await cancelWhileLeaving(() =>
      apiError(409, "LAST_OWNER"),
    );
    const toast = await toastAfter("Make someone else Owner first", async () =>
      answerLeave(),
    );
    await waitFor(() => expect(leaveQuestion()).toBeNull());
    expect(within(toast).queryByRole("button", { name: "Retry" })).toBeNull();
    expect(within(list).getByText(team.name)).toBeTruthy();
  });

  /** Opens Leave of the team and presses Leave, which W3 answers with `answer`. */
  async function leaveAnswered(answer: () => Response) {
    const user = userEvent.setup();
    const calls = accountApi({
      answer: ({ method, path }) =>
        method === "DELETE" && path === leaveTeam ? answer() : undefined,
    });
    renderApp("/account");
    const list = await workspaces();
    await user.click(
      within(list).getByRole("button", { name: `Leave ${team.name}` }),
    );
    const question = await screen.findByRole("alertdialog", {
      name: `Leave ${team.name}?`,
    });
    await user.click(within(question).getByRole("button", { name: "Leave" }));
    const deletes = () => calls.filter(({ method }) => method === "DELETE");
    return { user, list, question, deletes };
  }

  test("Leave failing unexpectedly (500): the small dialog with its Ref, whose Retry sends again and whose Close closes the question", async () => {
    const { user, list, question, deletes } = await leaveAnswered(() =>
      apiError(500, "INTERNAL"),
    );
    const small = await screen.findByRole("alertdialog", {
      name: smallDialog,
    });
    expect(within(small).getByText("Ref: 8f14e45f")).toBeTruthy();
    // Not in the question, as a reason would be (6.0.6).
    expect(within(question).queryByText("Something went wrong")).toBeNull();
    await user.click(within(small).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(deletes()).toHaveLength(2));
    await user.click(
      within(
        await screen.findByRole("alertdialog", {
          name: smallDialog,
        }),
      ).getByRole("button", { name: "Close" }),
    );
    await waitFor(() => expect(leaveQuestion()).toBeNull());
    expect(screen.queryByRole("alertdialog", { name: smallDialog })).toBeNull();
    expect(within(list).getByText(team.name)).toBeTruthy();
    expect(deletes()).toHaveLength(2);
  });

  test("Leave failing for now (503): Couldn't save and Retry in the question, which sends again", async () => {
    let failing = true;
    const { user, question, deletes } = await leaveAnswered(() =>
      failing
        ? apiError(503, "UPSTREAM_UNAVAILABLE")
        : new Response(null, { status: 204 }),
    );
    expect(await within(question).findByText("Couldn't save")).toBeTruthy();
    expect(screen.queryByRole("alertdialog", { name: smallDialog })).toBeNull();
    failing = false;
    await toastAfter(`You left ${team.name}`, () =>
      user.click(within(question).getByRole("button", { name: "Retry" })),
    );
    expect(deletes()).toHaveLength(2);
    await waitFor(() => expect(leaveQuestion()).toBeNull());
  });

  test("Leave over its rate limit: the wait in the question, without Retry", async () => {
    const { question } = await leaveAnswered(() =>
      apiError(429, "RATE_LIMITED", { retryAfterSeconds: 120 }),
    );
    expect(
      await within(question).findByText(
        "Too many attempts. Try again in 2 minutes.",
      ),
    ).toBeTruthy();
    expect(
      within(question).queryByRole("button", { name: "Retry" }),
    ).toBeNull();
    expect(screen.queryByRole("alertdialog", { name: smallDialog })).toBeNull();
    expect(leaveQuestion()).toBe(question);
  });

  test("Cancel while Leave is on its way, and the session ended: no failure of its own, on to log in", async () => {
    const { router, answerLeave } = await cancelWhileLeaving(() =>
      apiError(401, "UNAUTHENTICATED"),
    );
    answerLeave();
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(screen.queryByText("Something went wrong")).toBeNull();
    expect(screen.queryByText("Couldn't save")).toBeNull();
  });

  test("Set password met by a password set meanwhile: the Change password form, without words", async () => {
    const user = userEvent.setup();
    let hasPassword = false;
    accountApi({
      answer: ({ method, path }) => {
        if (method === "POST" && path === "/api/v1/me/password") {
          hasPassword = true;
          return apiError(409, "PASSWORD_ALREADY_SET");
        }
        return method === "GET" && path === "/api/v1/me"
          ? Response.json({ ...anaHere, hasPassword })
          : undefined;
      },
    });
    renderApp("/account");
    expect(
      await screen.findByText(
        "You log in with Google. Set a password to log in with your email too.",
      ),
    ).toBeTruthy();
    await user.type(
      await screen.findByLabelText(/^New password/),
      "a new password",
    );
    await user.click(screen.getByRole("button", { name: "Set password" }));
    expect(await screen.findByLabelText(/^Current password/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Change password" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Set password" })).toBeNull();
    expect(
      screen.getByText("Changing it logs you out on your other devices."),
    ).toBeTruthy();
    const form = screen.getByRole("form", { name: "Password" });
    expect(within(form).queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Something went wrong")).toBeNull();
    expect(screen.queryByText("Couldn't save")).toBeNull();
    // Not set by this form: no toast says it was.
    expect(
      screen.queryByText("Password set. You can log in with your email too."),
    ).toBeNull();
  });

  test("Delete account refused by the API: another email or a wrong password under its field", async () => {
    const user = userEvent.setup();
    let refusal: "CONFIRMATION_MISMATCH" | "INVALID_PASSWORD" =
      "CONFIRMATION_MISMATCH";
    accountApi({
      answer: ({ method, path }) =>
        method === "POST" && path === "/api/v1/me/delete"
          ? apiError(refusal === "INVALID_PASSWORD" ? 403 : 422, refusal)
          : undefined,
    });
    renderApp("/account");
    await user.click(
      await screen.findByRole("button", { name: "Delete account" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Delete your account?",
    });
    await user.type(
      within(dialog).getByRole("textbox", { name: /^Your email/ }),
      ana.email,
    );
    const password = within(dialog).getByLabelText(/^Password/);
    await user.type(password, "moonx-demo-2026");
    const confirm = within(dialog).getByRole("button", {
      name: "Delete account",
    });
    await user.click(confirm);
    expect(
      await within(dialog).findByText("The email doesn't match your account"),
    ).toBeTruthy();
    refusal = "INVALID_PASSWORD";
    await user.type(password, "!");
    await user.click(confirm);
    expect(
      await within(dialog).findByText("Password is incorrect"),
    ).toBeTruthy();
    expect(within(dialog).queryByText("Something went wrong")).toBeNull();
  });

  /**
   * Opens Delete account, fills it in and presses Delete account, which U7 answers with
   * `answer`; Better Auth's start of a Google sign-in answers `google`.
   */
  async function deleteAnswered(
    answer: () => Response,
    {
      me = anaHere,
      google,
    }: { me?: Me; google?: () => Response | undefined } = {},
  ) {
    const user = userEvent.setup();
    const calls = accountApi({
      me,
      answer: ({ method, path }) =>
        method === "POST" && path === "/api/v1/me/delete"
          ? answer()
          : path === "/api/auth/sign-in/social"
            ? google?.()
            : undefined,
    });
    renderApp("/account");
    await user.click(
      await screen.findByRole("button", { name: "Delete account" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Delete your account?",
    });
    await user.type(
      within(dialog).getByRole("textbox", { name: /^Your email/ }),
      ana.email,
    );
    if (me.hasPassword) {
      await user.type(
        within(dialog).getByLabelText(/^Password/),
        "moonx-demo-2026",
      );
    }
    await user.click(
      within(dialog).getByRole("button", { name: "Delete account" }),
    );
    const deletes = () =>
      calls.filter(({ path }) => path === "/api/v1/me/delete");
    const deleteDialog = () =>
      screen.queryByRole("dialog", { name: "Delete your account?" });
    return { user, calls, dialog, deletes, deleteDialog };
  }

  test("Delete account failing unexpectedly (500): the small dialog with its Ref, whose Retry sends again and whose Close closes Delete account", async () => {
    const { user, dialog, deletes, deleteDialog } = await deleteAnswered(() =>
      apiError(500, "INTERNAL"),
    );
    const small = await screen.findByRole("alertdialog", {
      name: smallDialog,
    });
    expect(within(small).getByText("Ref: 8f14e45f")).toBeTruthy();
    expect(within(dialog).queryByText("Something went wrong")).toBeNull();
    await user.click(within(small).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(deletes()).toHaveLength(2));
    await user.click(
      within(
        await screen.findByRole("alertdialog", { name: smallDialog }),
      ).getByRole("button", { name: "Close" }),
    );
    await waitFor(() => expect(deleteDialog()).toBeNull());
    expect(screen.queryByRole("alertdialog", { name: smallDialog })).toBeNull();
    expect(deletes()).toHaveLength(2);
  });

  test.each([
    [
      "for now (503)",
      () => apiError(503, "UPSTREAM_UNAVAILABLE"),
      "Couldn't save",
      true,
    ],
    [
      "over its rate limit",
      () => apiError(429, "RATE_LIMITED", { retryAfterSeconds: 120 }),
      "Too many attempts. Try again in 2 minutes.",
      false,
    ],
  ] as const)(
    "Delete account failing %s: its words in the dialog, which stays with what was typed",
    async (_, answer, words, hasRetry) => {
      const { dialog, deleteDialog } = await deleteAnswered(answer);
      expect(await within(dialog).findByText(words)).toBeTruthy();
      expect(
        within(dialog).queryByRole("button", { name: "Retry" }) !== null,
      ).toBe(hasRetry);
      expect(
        screen.queryByRole("alertdialog", { name: smallDialog }),
      ).toBeNull();
      expect(deleteDialog()).toBe(dialog);
      expect(
        (
          within(dialog).getByRole("textbox", {
            name: /^Your email/,
          }) as HTMLInputElement
        ).value,
      ).toBe(ana.email);
    },
  );

  test("Log in again inside Delete account that cannot start: the small dialog, whose Close closes Delete account", async () => {
    const { user, dialog, calls, deleteDialog } = await deleteAnswered(
      () => apiError(403, "REAUTH_REQUIRED"),
      {
        me: { ...anaHere, hasPassword: false },
        google: () => authError(500, "INTERNAL_SERVER_ERROR"),
      },
    );
    await user.click(
      await within(dialog).findByRole("button", { name: "Log in again" }),
    );
    const small = await screen.findByRole("alertdialog", {
      name: smallDialog,
    });
    expect(within(dialog).queryByText("Something went wrong")).toBeNull();
    await user.click(within(small).getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(
        calls.filter(({ path }) => path === "/api/auth/sign-in/social"),
      ).toHaveLength(2),
    );
    await user.click(
      within(
        await screen.findByRole("alertdialog", { name: smallDialog }),
      ).getByRole("button", { name: "Close" }),
    );
    await waitFor(() => expect(deleteDialog()).toBeNull());
  });

  test("a photo the API finds too large: its words under the photo", async () => {
    accountApi({
      answer: ({ method, path }) =>
        method === "PUT" && path === "/api/v1/me/avatar"
          ? apiError(413, "PAYLOAD_TOO_LARGE")
          : undefined,
    });
    renderApp("/account");
    await screen.findByRole("button", { name: "Add photo" });
    const photo =
      document.querySelector<HTMLInputElement>('input[type="file"]');
    if (photo === null) throw new Error("no file input");
    await userEvent.upload(
      photo,
      new File(["small"], "a.png", { type: "image/png" }),
    );
    expect(
      await screen.findByText("This photo is too large. Use one under 5 MB."),
    ).toBeTruthy();
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });
});

describe("4 while its route loads (design-spec 6.0.6「ローディング」)", () => {
  test("its skeleton in the frame: the groups' names and their fields, as bars", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      // U1 does not answer, so the route stays on its way.
      stubApi(({ path }) =>
        path === "/api/v1/me" ? new Promise<Response>(() => {}) : undefined,
      );
      renderApp("/account");
      await act(() => vi.advanceTimersByTimeAsync(PENDING_MS));
      for (const text of ["Account", "Profile", "Password", "Preferences"]) {
        expect(screen.getByText(text).closest("[inert]")).not.toBeNull();
      }
      for (const label of [
        "Display name",
        "Email",
        "New password",
        "Time zone",
      ]) {
        expect(
          screen.getByText(label, { selector: "label" }).closest("[inert]"),
        ).not.toBeNull();
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
