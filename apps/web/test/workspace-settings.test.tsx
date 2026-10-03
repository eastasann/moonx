import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { makeMe, renderApp, stubApi, WORKSPACE } from "./support";

afterEach(() => {
  vi.unstubAllGlobals();
});

const ANA = "44444444-4444-4444-8444-444444444444";
const KENJI = "66666666-6666-4666-8666-666666666666";
const GRACE = "77777777-7777-4777-8777-777777777777";
const PENDING = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const EXPIRED = "aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa";
const ACCEPTED = "aaaaaaaa-3333-4333-8333-aaaaaaaaaaaa";

const ref = (id: string, displayName: string) => ({
  id,
  displayName,
  avatarUrl: null,
  badge: null,
});
const member = (id: string, name: string, role: string, email: string) => ({
  user: ref(id, name),
  email,
  role,
  joinedAt: "2026-09-01T00:00:00.000Z",
  isPersonalOwner: false,
});
const MEMBERS = [
  member(ANA, "Ana Villanueva", "owner", "ana@bcdx.example"),
  member(KENJI, "Kenji Mori", "member", "kenji@bcdx.example"),
  member(GRACE, "Grace Tan", "viewer", "grace@advisor.example"),
];
const invitation = (id: string, email: string, status: string) => ({
  id,
  email,
  role: "member",
  workspace: { id: WORKSPACE, name: "BCDX" },
  status,
  invitedBy: ref(ANA, "Ana Villanueva"),
  createdAt: "2026-09-20T00:00:00.000Z",
  expiresAt: "2026-09-27T00:00:00.000Z",
  acceptedAt: status === "accepted" ? "2026-09-21T00:00:00.000Z" : null,
});

const base = (members = MEMBERS) => ({
  "GET /api/v1/me": () => ({ body: makeMe() }),
  "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
  [`GET /api/v1/workspaces/${WORKSPACE}/members`]: () => ({ body: { items: members } }),
  [`GET /api/v1/workspaces/${WORKSPACE}/invitations`]: ({ url }: { url: URL }) => ({
    body: {
      items:
        url.searchParams.get("status") === "all"
          ? [
              invitation(PENDING, "new.member@bcdx.example", "pending"),
              invitation(EXPIRED, "late.joiner@bcdx.example", "expired"),
              invitation(ACCEPTED, "done@bcdx.example", "accepted"),
            ]
          : [invitation(PENDING, "new.member@bcdx.example", "pending")],
    },
  }),
});

const SETTINGS = `/w/${WORKSPACE}/settings`;

async function openMenu(rowName: RegExp, menuName: RegExp) {
  const row = await screen.findByRole("row", { name: rowName });
  await userEvent.click(within(row).getByRole("button", { name: menuName }));
}

test("a Member does not get the settings", async () => {
  const me = makeMe({
    memberships: [
      {
        workspace: { id: WORKSPACE, name: "BCDX", isPersonal: false, currency: "PHP" },
        role: "member",
      },
    ],
  });
  const api = stubApi({ ...base(), "GET /api/v1/me": () => ({ body: me }) });
  await renderApp(SETTINGS);
  expect(await screen.findByText("You don't have access to this")).toBeInTheDocument();
  expect(api.calls.some((c) => c.url.pathname.endsWith("/members"))).toBe(false);
});

test("saving sends only the changed name and warns that amounts are not converted", async () => {
  const api = stubApi({
    ...base(),
    [`PATCH /api/v1/workspaces/${WORKSPACE}`]: () => ({
      body: {
        id: WORKSPACE,
        name: "BCDX Cebu",
        currency: "PHP",
        isPersonal: false,
        myRole: "owner",
        memberCount: 3,
      },
    }),
  });
  await renderApp(SETTINGS);
  expect(await screen.findByText(/does not convert existing amounts/)).toBeInTheDocument();
  const name = await screen.findByRole("textbox", { name: /^Workspace name/ });
  expect(name).toHaveValue("BCDX");
  await userEvent.clear(name);
  await userEvent.type(name, "BCDX Cebu");
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(api.calls.find((c) => c.method === "PATCH")?.body).toEqual({ name: "BCDX Cebu" }),
  );
  expect(await screen.findByText("Workspace settings saved")).toBeInTheDocument();
});

test("an empty name is refused before anything is sent", async () => {
  const api = stubApi(base());
  await renderApp(SETTINGS);
  const name = await screen.findByRole("textbox", { name: /^Workspace name/ });
  await userEvent.clear(name);
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByText("Required")).toBeInTheDocument();
  expect(api.calls.some((c) => c.method === "PATCH")).toBe(false);
});

test("the members table lists emails and roles, and the last Owner has no menu", async () => {
  stubApi(base());
  await renderApp(SETTINGS);
  const ana = await screen.findByRole("row", { name: /Ana Villanueva/ });
  expect(within(ana).getByText("ana@bcdx.example")).toBeInTheDocument();
  expect(within(ana).getByText("Make someone else Owner first")).toBeInTheDocument();
  expect(within(ana).getByRole("button", { name: /Actions for Ana Villanueva/ })).toBeDisabled();
  const kenji = screen.getByRole("row", { name: /Kenji Mori/ });
  expect(within(kenji).getByRole("button", { name: /Actions for Kenji Mori/ })).toBeEnabled();
});

test("the owner of a personal workspace has no menu for another Owner, whose own row keeps one", async () => {
  stubApi(
    base([
      member(ANA, "Ana Villanueva", "owner", "a@x"),
      { ...member(KENJI, "Kenji Mori", "owner", "k@x"), isPersonalOwner: true },
    ]),
  );
  await renderApp(SETTINGS);
  const kenji = await screen.findByRole("row", { name: /Kenji Mori/ });
  expect(within(kenji).getByText("Owner of this personal workspace")).toBeInTheDocument();
  expect(within(kenji).getByRole("button", { name: /Actions for Kenji Mori/ })).toBeDisabled();
  const ana = screen.getByRole("row", { name: /Ana Villanueva/ });
  expect(within(ana).getByRole("button", { name: /Actions for Ana Villanueva/ })).toBeEnabled();
});

test("a second Owner makes the first one's menu available", async () => {
  stubApi(
    base([
      member(ANA, "Ana Villanueva", "owner", "a@x"),
      member(KENJI, "Kenji Mori", "owner", "k@x"),
    ]),
  );
  await renderApp(SETTINGS);
  const ana = await screen.findByRole("row", { name: /Ana Villanueva/ });
  expect(within(ana).getByRole("button", { name: /Actions for Ana Villanueva/ })).toBeEnabled();
});

test("changing a role to Member is sent at once", async () => {
  const api = stubApi({
    ...base(),
    [`PATCH /api/v1/workspaces/${WORKSPACE}/members/${GRACE}`]: () => ({
      body: member(GRACE, "Grace Tan", "member", "grace@advisor.example"),
    }),
  });
  await renderApp(SETTINGS);
  await openMenu(/Grace Tan/, /Actions for Grace Tan/);
  const items = (await screen.findAllByRole("menuitem")).map((i) => i.textContent);
  expect(items).toEqual(["Change to Owner", "Change to Member", "Remove from workspace"]);
  await userEvent.click(screen.getByRole("menuitem", { name: "Change to Member" }));
  await waitFor(() =>
    expect(api.calls.find((c) => c.method === "PATCH")?.body).toEqual({ role: "member" }),
  );
  expect(await screen.findByText("Grace Tan is now Member")).toBeInTheDocument();
});

test("demoting to Viewer states what happens to the person's records before it is sent", async () => {
  const api = stubApi({
    ...base(),
    [`PATCH /api/v1/workspaces/${WORKSPACE}/members/${KENJI}`]: () => ({
      body: member(KENJI, "Kenji Mori", "viewer", "kenji@bcdx.example"),
    }),
  });
  await renderApp(SETTINGS);
  await openMenu(/Kenji Mori/, /Actions for Kenji Mori/);
  await userEvent.click(await screen.findByRole("menuitem", { name: "Change to Viewer" }));
  const dialog = await screen.findByRole("alertdialog", { name: "Change Kenji Mori to Viewer?" });
  expect(within(dialog).getByText(/stops being shared with this workspace/)).toBeInTheDocument();
  expect(within(dialog).getByText(/because a Viewer cannot be an assignee/)).toBeInTheDocument();
  expect(within(dialog).getByText(/without a \(former member\) mark/)).toBeInTheDocument();
  expect(
    within(dialog).getByText(/Only notifications about comments on their Self Analysis/),
  ).toBeInTheDocument();
  expect(api.calls.some((c) => c.method === "PATCH")).toBe(false);
  await userEvent.click(within(dialog).getByRole("button", { name: "Change to Viewer" }));
  await waitFor(() =>
    expect(api.calls.find((c) => c.method === "PATCH")?.body).toEqual({ role: "viewer" }),
  );
});

test("removing a member states the consequences, then deletes the membership", async () => {
  const api = stubApi({
    ...base(),
    [`DELETE /api/v1/workspaces/${WORKSPACE}/members/${KENJI}`]: () => ({ status: 204 }),
  });
  await renderApp(SETTINGS);
  await openMenu(/Kenji Mori/, /Actions for Kenji Mori/);
  await userEvent.click(await screen.findByRole("menuitem", { name: "Remove from workspace" }));
  const dialog = await screen.findByRole("alertdialog", { name: "Remove Kenji Mori?" });
  expect(within(dialog).getByText(/marked \(former member\)/)).toBeInTheDocument();
  expect(
    within(dialog).getByText(/Opening one shows "You no longer have access"/),
  ).toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
  await waitFor(() => expect(api.calls.some((c) => c.method === "DELETE")).toBe(true));
  expect(await screen.findByText("Kenji Mori was removed from the workspace")).toBeInTheDocument();
});

test("a refusal for the last Owner is shown in the catalog text", async () => {
  stubApi({
    ...base([
      member(ANA, "Ana Villanueva", "owner", "a@x"),
      member(KENJI, "Kenji Mori", "owner", "k@x"),
    ]),
    [`PATCH /api/v1/workspaces/${WORKSPACE}/members/${KENJI}`]: () => ({
      status: 409,
      body: { error: { code: "LAST_OWNER", message: "x", requestId: "r" } },
    }),
  });
  await renderApp(SETTINGS);
  await openMenu(/Kenji Mori/, /Actions for Kenji Mori/);
  await userEvent.click(await screen.findByRole("menuitem", { name: "Change to Member" }));
  expect(await screen.findByText("A workspace needs at least one Owner.")).toBeInTheDocument();
});

test("pending invitations list with their status and expiry", async () => {
  stubApi(base());
  await renderApp(SETTINGS);
  const row = await screen.findByRole("row", { name: /new.member@bcdx.example/ });
  expect(within(row).getByText("Sent")).toBeInTheDocument();
  expect(within(row).getByText("Expires Sep 27, 2026")).toBeInTheDocument();
  expect(screen.queryByRole("row", { name: /late.joiner/ })).not.toBeInTheDocument();
});

test("All shows sent, expired and accepted invitations; only open ones have a menu", async () => {
  stubApi(base());
  await renderApp(SETTINGS);
  await userEvent.click(await screen.findByRole("radio", { name: "All" }));
  const expired = await screen.findByRole("row", { name: /late.joiner/ });
  expect(within(expired).getByText("Expired")).toBeInTheDocument();
  expect(
    within(expired).getByRole("button", { name: /Actions for the invitation/ }),
  ).toBeInTheDocument();
  const accepted = screen.getByRole("row", { name: /done@bcdx.example/ });
  expect(within(accepted).getByText("Accepted")).toBeInTheDocument();
  expect(within(accepted).queryByRole("button")).not.toBeInTheDocument();
});

test("no invitations shows No pending invitations", async () => {
  stubApi({
    ...base(),
    [`GET /api/v1/workspaces/${WORKSPACE}/invitations`]: () => ({ body: { items: [] } }),
  });
  await renderApp(SETTINGS);
  expect(await screen.findByText("No pending invitations")).toBeInTheDocument();
});

test("sending checks the email, posts email and role, and clears the email", async () => {
  const api = stubApi({
    ...base(),
    [`POST /api/v1/workspaces/${WORKSPACE}/invitations`]: () => ({
      status: 201,
      body: {
        invitation: invitation(PENDING, "paolo@bcdx.example", "pending"),
        link: "http://localhost:5173/invite/tok1",
      },
    }),
  });
  await renderApp(SETTINGS);
  const email = await screen.findByRole("textbox", { name: /^Email/ });
  await userEvent.type(email, "not-an-email");
  await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));
  expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
  expect(api.calls.some((c) => c.method === "POST")).toBe(false);
  await userEvent.clear(email);
  await userEvent.type(email, "paolo@bcdx.example");
  await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));
  await waitFor(() =>
    expect(api.calls.find((c) => c.method === "POST")?.body).toEqual({
      email: "paolo@bcdx.example",
      role: "member",
    }),
  );
  expect(await screen.findByText("Invitation sent to paolo@bcdx.example")).toBeInTheDocument();
  await waitFor(() => expect(email).toHaveValue(""));
});

test("a failed send keeps the form and offers another try", async () => {
  let failing = true;
  const api = stubApi({
    ...base(),
    [`POST /api/v1/workspaces/${WORKSPACE}/invitations`]: () =>
      failing
        ? {
            status: 503,
            body: { error: { code: "UPSTREAM_UNAVAILABLE", message: "x", requestId: "r" } },
          }
        : {
            status: 201,
            body: {
              invitation: invitation(PENDING, "paolo@bcdx.example", "pending"),
              link: "http://localhost:5173/invite/tok1",
            },
          },
  });
  await renderApp(SETTINGS);
  const email = await screen.findByRole("textbox", { name: /^Email/ });
  await userEvent.type(email, "paolo@bcdx.example");
  await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));
  expect(await screen.findByText(/temporarily unavailable/)).toBeInTheDocument();
  expect(email).toHaveValue("paolo@bcdx.example");
  failing = false;
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Invitation sent to paolo@bcdx.example")).toBeInTheDocument();
  expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(2);
});

test("an address with an open invitation offers to resend that invitation", async () => {
  const api = stubApi({
    ...base(),
    [`POST /api/v1/workspaces/${WORKSPACE}/invitations`]: () => ({
      status: 409,
      body: {
        error: { code: "INVITATION_PENDING", message: "x", requestId: "r", invitationId: PENDING },
      },
    }),
    [`POST /api/v1/invitations/${PENDING}/resend`]: () => ({
      body: {
        invitation: invitation(PENDING, "new.member@bcdx.example", "pending"),
        link: "http://localhost:5173/invite/tok2",
      },
    }),
  });
  await renderApp(SETTINGS);
  await userEvent.type(
    await screen.findByRole("textbox", { name: /^Email/ }),
    "new.member@bcdx.example",
  );
  await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));
  await userEvent.click(
    await screen.findByRole("button", { name: "Resend the existing invitation" }),
  );
  expect(
    await screen.findByText("Invitation resent to new.member@bcdx.example"),
  ).toBeInTheDocument();
  expect(api.calls.some((c) => c.url.pathname === `/api/v1/invitations/${PENDING}/resend`)).toBe(
    true,
  );
});

test("an invitation row offers Resend and Cancel but no way to copy the link", async () => {
  stubApi(base());
  await renderApp(SETTINGS);
  await openMenu(/new.member@bcdx.example/, /Actions for the invitation/);
  expect(await screen.findByRole("menuitem", { name: "Resend" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "Cancel invitation" })).toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: "Copy link" })).not.toBeInTheDocument();
});

test("Resend posts to the invitation", async () => {
  const api = stubApi({
    ...base(),
    [`POST /api/v1/invitations/${PENDING}/resend`]: () => ({
      body: {
        invitation: invitation(PENDING, "new.member@bcdx.example", "pending"),
      },
    }),
  });
  await renderApp(SETTINGS);
  await openMenu(/new.member@bcdx.example/, /Actions for the invitation/);
  await userEvent.click(await screen.findByRole("menuitem", { name: "Resend" }));
  expect(
    await screen.findByText("Invitation resent to new.member@bcdx.example"),
  ).toBeInTheDocument();
  expect(api.calls.some((c) => c.url.pathname.endsWith("/resend"))).toBe(true);
});

test("cancelling asks first, then deletes the invitation", async () => {
  const api = stubApi({
    ...base(),
    [`DELETE /api/v1/invitations/${PENDING}`]: () => ({ status: 204 }),
  });
  await renderApp(SETTINGS);
  await openMenu(/new.member@bcdx.example/, /Actions for the invitation/);
  await userEvent.click(await screen.findByRole("menuitem", { name: "Cancel invitation" }));
  const dialog = await screen.findByRole("alertdialog", {
    name: "Cancel the invitation to new.member@bcdx.example?",
  });
  expect(api.calls.some((c) => c.method === "DELETE")).toBe(false);
  await userEvent.click(within(dialog).getByRole("button", { name: "Cancel invitation" }));
  expect(
    await screen.findByText("Invitation to new.member@bcdx.example cancelled"),
  ).toBeInTheDocument();
});

test("the link in the invitation mail opens the invitation screen", async () => {
  stubApi({
    "GET /api/v1/me": () => ({
      status: 401,
      body: {
        error: { code: "UNAUTHENTICATED", message: "no session", requestId: "abcdef12-0000" },
      },
    }),
    "GET /api/v1/invitations/by-token/fresh-token": () => ({
      body: {
        status: "pending",
        email: "new.member@bcdx.example",
        workspace: { id: WORKSPACE, name: "BCDX" },
        role: "member",
        invitedBy: { displayName: "Ana" },
        expiresAt: new Date().toISOString(),
        accountExists: false,
      },
    }),
  });
  await renderApp("/invite/fresh-token");
  expect(await screen.findByText("You're invited to join BCDX")).toBeInTheDocument();
});

test("an Owner who demotes themselves is taken home, because the settings are no longer theirs", async () => {
  let demoted = false;
  const me = () =>
    makeMe(
      demoted
        ? {
            memberships: [
              {
                workspace: { id: WORKSPACE, name: "BCDX", isPersonal: false, currency: "PHP" },
                role: "member",
              },
            ],
          }
        : {},
    );
  stubApi({
    ...base([
      member(ANA, "Ana Villanueva", "owner", "a@x"),
      member(KENJI, "Kenji Mori", "owner", "k@x"),
    ]),
    "GET /api/v1/me": () => ({ body: me() }),
    [`PATCH /api/v1/workspaces/${WORKSPACE}/members/${ANA}`]: () => {
      demoted = true;
      return { body: member(ANA, "Ana Villanueva", "member", "a@x") };
    },
  });
  const { router } = await renderApp(SETTINGS);
  await openMenu(/Ana Villanueva/, /Actions for Ana Villanueva/);
  await userEvent.click(await screen.findByRole("menuitem", { name: "Change to Member" }));
  await waitFor(() => expect(router.state.location.pathname).toBe(`/w/${WORKSPACE}`));
});
