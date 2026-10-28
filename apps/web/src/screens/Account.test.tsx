import type { Me, Member } from "@moonx/schemas";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ana,
  apiError,
  authError,
  type Call,
  renderApp,
  stubApi,
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
  answer?: (call: Call) => Response | undefined;
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

  test("Leave the workspace open now: asked first, then the personal 5", async () => {
    const user = userEvent.setup();
    const calls = accountApi({
      me: { ...anaHere, lastWorkspaceId: team.id },
      answer: ({ method, path }) =>
        method === "DELETE" &&
        path === `/api/v1/workspaces/${team.id}/members/me`
          ? new Response(null, { status: 204 })
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
    await user.click(within(question).getByRole("button", { name: "Leave" }));
    await waitFor(() =>
      expect(
        calls.some(
          ({ method, path }) =>
            method === "DELETE" &&
            path === `/api/v1/workspaces/${team.id}/members/me`,
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/w/${personal.id}`),
    );
  });

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
});
