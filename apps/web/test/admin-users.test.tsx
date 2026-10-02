import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { makeMe, renderApp, stubApi } from "./support";
import {
  adminBase,
  BCDX,
  INVITATIONS,
  INVITE_PENDING,
  KENJI,
  makeInvitation,
  PAOLO,
  USERS,
  WORKSPACES,
} from "./support-admin";

afterEach(() => {
  vi.unstubAllGlobals();
});

const lists = {
  "GET /api/v1/admin/users": () => ({ body: USERS }),
  "GET /api/v1/admin/workspaces": () => ({ body: WORKSPACES }),
  "GET /api/v1/admin/invitations": () => ({ body: INVITATIONS }),
};

const rowOf = async (name: RegExp | string) => {
  const rows = await screen.findAllByRole("row");
  const row = rows.find((candidate) => within(candidate).queryByText(name));
  expect(row).toBeDefined();
  return row as HTMLElement;
};

test("someone who is not an operator gets no access and nothing is loaded", async () => {
  const api = stubApi({ ...adminBase(makeMe()), ...lists });
  await renderApp("/admin/users");
  expect(await screen.findByText("You don't have access to this")).toBeInTheDocument();
  expect(api.calls.filter((call) => call.url.pathname.startsWith("/api/v1/admin"))).toEqual([]);
});

test("the Users tab lists name, email, dates, workspace count and status", async () => {
  stubApi({ ...adminBase(), ...lists });
  await renderApp("/admin/users");
  const kenji = await rowOf("Kenji Mori");
  expect(within(kenji).getByText("kenji@bcdx.example")).toBeInTheDocument();
  expect(within(kenji).getByText("Mar 4, 2026")).toBeInTheDocument();
  expect(within(kenji).getByText("Active")).toBeInTheDocument();
  expect(within(kenji).getByText("2")).toBeInTheDocument();
  const paolo = await rowOf(/Paolo Gonzaga \(suspended\)/);
  expect(within(paolo).getByText("Never")).toBeInTheDocument();
  expect(within(paolo).getByText("Suspended")).toBeInTheDocument();
});

test("the search text reaches the API as q", async () => {
  const api = stubApi({ ...adminBase(), ...lists });
  await renderApp("/admin/users");
  await screen.findByText("Kenji Mori");
  await userEvent.type(screen.getByRole("searchbox", { name: "Search users" }), "kenji");
  await waitFor(() =>
    expect(
      api.calls.some(
        (c) => c.url.pathname === "/api/v1/admin/users" && c.url.searchParams.get("q") === "kenji",
      ),
    ).toBe(true),
  );
});

test("choosing a user shows usage only and Suspend asks first, then suspends", async () => {
  const api = stubApi({
    ...adminBase(),
    ...lists,
    [`POST /api/v1/admin/users/${KENJI}/suspend`]: () => ({
      body: { ...USERS.items[1], status: "suspended" },
    }),
  });
  await renderApp("/admin/users");
  await userEvent.click(await rowOf("Kenji Mori"));
  expect(screen.getByText(/Usage only: counts and dates/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Suspend" }));
  const dialog = await screen.findByRole("alertdialog", { name: "Suspend Kenji Mori?" });
  expect(within(dialog).getByText(/logged out now.*not notified/)).toBeInTheDocument();
  expect(api.calls.some((c) => c.method === "POST")).toBe(false);
  await userEvent.click(within(dialog).getByRole("button", { name: "Suspend" }));
  await waitFor(() =>
    expect(api.calls.some((c) => c.method === "POST" && c.url.pathname.endsWith("/suspend"))).toBe(
      true,
    ),
  );
  expect(await screen.findByText("Kenji Mori is suspended")).toBeInTheDocument();
});

test("a suspended user can be reactivated", async () => {
  const api = stubApi({
    ...adminBase(),
    ...lists,
    [`POST /api/v1/admin/users/${PAOLO}/reactivate`]: () => ({
      body: { ...USERS.items[2], status: "active" },
    }),
  });
  await renderApp("/admin/users");
  await userEvent.click(await rowOf(/Paolo Gonzaga/));
  expect(screen.queryByRole("button", { name: "Suspend" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Reactivate" }));
  const dialog = await screen.findByRole("alertdialog", { name: "Reactivate Paolo Gonzaga?" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Reactivate" }));
  await waitFor(() =>
    expect(
      api.calls.some((c) => c.method === "POST" && c.url.pathname.endsWith("/reactivate")),
    ).toBe(true),
  );
});

test("the operator's own row and a deleted account have no action", async () => {
  stubApi({ ...adminBase(), ...lists });
  await renderApp("/admin/users");
  await userEvent.click(await rowOf("ana@example.com"));
  expect(screen.queryByRole("button", { name: "Suspend" })).toBeNull();
  await userEvent.click(await rowOf("Deleted user"));
  expect(screen.getByText(/This account was deleted/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Suspend" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Reactivate" })).toBeNull();
});

test("a refused suspension shows the API's reason", async () => {
  stubApi({
    ...adminBase(),
    ...lists,
    [`POST /api/v1/admin/users/${KENJI}/suspend`]: () => ({
      status: 422,
      body: { error: { code: "CANNOT_SUSPEND_SELF", message: "x", requestId: "abcdef12-0000" } },
    }),
  });
  await renderApp("/admin/users");
  await userEvent.click(await rowOf("Kenji Mori"));
  await userEvent.click(screen.getByRole("button", { name: "Suspend" }));
  const dialog = await screen.findByRole("alertdialog");
  await userEvent.click(within(dialog).getByRole("button", { name: "Suspend" }));
  expect(await screen.findByText("You can't suspend your own account.")).toBeInTheDocument();
});

test("the Workspaces tab shows owners and counts, and nothing from inside", async () => {
  const api = stubApi({ ...adminBase(), ...lists });
  const { router } = await renderApp("/admin/users?tab=workspaces");
  const bcdx = await rowOf("BCDX");
  expect(within(bcdx).getByText("Ana Villanueva")).toBeInTheDocument();
  expect(within(bcdx).getByText("4")).toBeInTheDocument();
  expect(within(bcdx).getByText("6")).toBeInTheDocument();
  await userEvent.click(bcdx);
  expect(screen.getByText(/Usage only/)).toBeInTheDocument();
  expect(router.state.location.search).toMatchObject({ tab: "workspaces" });
  expect(api.calls.every((c) => !c.url.pathname.includes("/ideas"))).toBe(true);
});

test("switching tabs puts the tab in the URL, and Users leaves it out", async () => {
  stubApi({ ...adminBase(), ...lists });
  const { router } = await renderApp("/admin/users");
  await userEvent.click(await screen.findByRole("tab", { name: "Invitations" }));
  await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: "invitations" }));
  await userEvent.click(screen.getByRole("tab", { name: "Users" }));
  await waitFor(() => expect(router.state.location.search).not.toHaveProperty("tab"));
});

test("an unknown tab falls back to Users", async () => {
  stubApi({ ...adminBase(), ...lists });
  await renderApp("/admin/users?tab=nonsense");
  expect(await screen.findByRole("tab", { name: "Users", selected: true })).toBeInTheDocument();
});

test("the Invitations tab lists status, workspace and role, and resends or cancels", async () => {
  const api = stubApi({
    ...adminBase(),
    ...lists,
    [`POST /api/v1/invitations/${INVITE_PENDING}/resend`]: () => ({
      body: { invitation: makeInvitation(), link: "http://localhost/invite/x" },
    }),
    [`DELETE /api/v1/invitations/${INVITE_PENDING}`]: () => ({ status: 204 }),
  });
  await renderApp("/admin/users?tab=invitations");
  const pending = await rowOf("new.member@bcdx.example");
  expect(within(pending).getByText("BCDX · Member")).toBeInTheDocument();
  expect(within(pending).getByText("Sent")).toBeInTheDocument();
  const accepted = await rowOf("done@bcdx.example");
  expect(within(accepted).getByText("No workspace")).toBeInTheDocument();
  expect(within(accepted).getByText("Operator setup")).toBeInTheDocument();

  await userEvent.click(accepted);
  expect(screen.queryByRole("button", { name: "Resend" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Cancel invitation" })).toBeNull();

  await userEvent.click(pending);
  await userEvent.click(screen.getByRole("button", { name: "Resend" }));
  expect(
    await screen.findByText("Invitation sent again to new.member@bcdx.example"),
  ).toBeInTheDocument();
  expect(api.calls.some((c) => c.method === "POST" && c.url.pathname.endsWith("/resend"))).toBe(
    true,
  );

  await userEvent.click(screen.getByRole("button", { name: "Cancel invitation" }));
  const dialog = await screen.findByRole("alertdialog", {
    name: "Cancel the invitation to new.member@bcdx.example?",
  });
  expect(api.calls.some((c) => c.method === "DELETE")).toBe(false);
  await userEvent.click(within(dialog).getByRole("button", { name: "Cancel invitation" }));
  await waitFor(() => expect(api.calls.some((c) => c.method === "DELETE")).toBe(true));
});

test("a new invitation without a workspace sends only the email", async () => {
  const api = stubApi({
    ...adminBase(),
    ...lists,
    "POST /api/v1/admin/invitations": () => ({
      status: 201,
      body: {
        invitation: makeInvitation({ workspace: null, role: null }),
        link: "http://localhost/invite/x",
      },
    }),
  });
  await renderApp("/admin/users?tab=invitations");
  await userEvent.click(await screen.findByRole("button", { name: "New invitation" }));
  const dialog = await screen.findByRole("dialog", { name: "New invitation" });
  await userEvent.type(within(dialog).getByRole("textbox", { name: /^Email/ }), "not-an-email");
  await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));
  expect(await within(dialog).findByText("Enter a valid email address")).toBeInTheDocument();
  await userEvent.clear(within(dialog).getByRole("textbox", { name: /^Email/ }));
  await userEvent.type(
    within(dialog).getByRole("textbox", { name: /^Email/ }),
    "first.timer@example.com",
  );
  await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "New invitation" })).toBeNull());
  const post = api.calls.find(
    (c) => c.method === "POST" && c.url.pathname === "/api/v1/admin/invitations",
  );
  expect(post?.body).toEqual({ email: "first.timer@example.com" });
  expect(await screen.findByText("Invitation sent to first.timer@example.com")).toBeInTheDocument();
});

test("choosing a workspace needs a role, and both go to the API", async () => {
  const api = stubApi({
    ...adminBase(),
    ...lists,
    "POST /api/v1/admin/invitations": () => ({
      status: 201,
      body: { invitation: makeInvitation(), link: "http://localhost/invite/x" },
    }),
  });
  await renderApp("/admin/users?tab=invitations");
  await userEvent.click(await screen.findByRole("button", { name: "New invitation" }));
  const dialog = await screen.findByRole("dialog", { name: "New invitation" });
  await userEvent.type(within(dialog).getByRole("textbox", { name: /^Email/ }), "kai@example.com");
  expect(within(dialog).getByRole("button", { name: /Role/ })).toBeDisabled();

  const workspace = within(dialog).getByRole("combobox", { name: "Workspace" });
  await userEvent.type(workspace, "BCD");
  await userEvent.click(await screen.findByRole("option", { name: "BCDX" }));
  const role = within(dialog).getByRole("button", { name: /Role/ });
  await waitFor(() => expect(role).toBeEnabled());
  expect(role).toHaveTextContent("Member");
  await userEvent.click(role);
  await userEvent.click(await screen.findByRole("option", { name: "Viewer" }));
  await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "New invitation" })).toBeNull());
  const post = api.calls.find(
    (c) => c.method === "POST" && c.url.pathname === "/api/v1/admin/invitations",
  );
  expect(post?.body).toEqual({ email: "kai@example.com", workspaceId: BCDX, role: "viewer" });
});

test("a failed invitation keeps the dialog and says why", async () => {
  stubApi({
    ...adminBase(),
    ...lists,
    "POST /api/v1/admin/invitations": () => ({
      status: 409,
      body: { error: { code: "INVITATION_PENDING", message: "x", requestId: "abcdef12-0000" } },
    }),
  });
  await renderApp("/admin/users?tab=invitations");
  await userEvent.click(await screen.findByRole("button", { name: "New invitation" }));
  const dialog = await screen.findByRole("dialog", { name: "New invitation" });
  await userEvent.type(within(dialog).getByRole("textbox", { name: /^Email/ }), "kai@example.com");
  await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));
  expect(
    await within(dialog).findByText("An invitation has already been sent to this email address."),
  ).toBeInTheDocument();
  expect(within(dialog).getByRole("textbox", { name: /^Email/ })).toHaveValue("kai@example.com");
});

test("an empty invitation list offers the first invitation", async () => {
  stubApi({
    ...adminBase(),
    ...lists,
    "GET /api/v1/admin/invitations": () => ({ body: { items: [], nextCursor: null } }),
  });
  await renderApp("/admin/users?tab=invitations");
  expect(await screen.findByText("No invitations yet")).toBeInTheDocument();
});

test("a refused read shows the state for it and the tabs stay", async () => {
  stubApi({
    ...adminBase(),
    ...lists,
    "GET /api/v1/admin/users": () => ({
      status: 403,
      body: { error: { code: "FORBIDDEN", message: "x", requestId: "abcdef12-0000" } },
    }),
  });
  await renderApp("/admin/users");
  expect(await screen.findByText("You don't have access to this")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Workspaces" })).toBeInTheDocument();
});

test("Load more asks for the next cursor", async () => {
  const api = stubApi({
    ...adminBase(),
    ...lists,
    "GET /api/v1/admin/users": ({ url }) =>
      url.searchParams.get("cursor") === "next"
        ? { body: { items: [USERS.items[2]], nextCursor: null } }
        : { body: { items: [USERS.items[1]], nextCursor: "next" } },
  });
  await renderApp("/admin/users");
  await screen.findByText("Kenji Mori");
  expect(screen.queryByText(/Paolo Gonzaga/)).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByText(/Paolo Gonzaga/)).toBeInTheDocument();
  expect(api.calls.filter((c) => c.url.searchParams.get("cursor") === "next")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
});
