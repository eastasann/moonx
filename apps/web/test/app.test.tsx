import { onlineManager } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { makeMe, OTHER, PERSONAL, renderApp, stubApi, unauthenticated, WORKSPACE } from "./support";

afterEach(() => {
  // The offline event pauses every query for the rest of the file unless it is undone.
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const signedIn = (me = makeMe()) => ({
  "GET /api/v1/me": () => ({ body: me }),
  "GET /api/v1/notifications/unread-count": () => ({ body: { total: 3 } }),
  "PATCH /api/v1/me": ({ body }: { body: unknown }) => ({ body: { ...me, ...(body as object) } }),
});

const signedOut = {
  "GET /api/v1/me": unauthenticated,
};

test("a protected path sends a signed-out person to the login screen with ?next=", async () => {
  stubApi(signedOut);
  const { router } = await renderApp("/account?x=1");
  expect(router.state.location.pathname).toBe("/login");
  expect(router.state.location.search).toEqual({ next: "/account?x=1" });
  expect(await screen.findByRole("heading", { level: 1, name: "Log in" })).toBeInTheDocument();
});

test("the landing page stays open to a signed-out person", async () => {
  stubApi(signedOut);
  const { router } = await renderApp("/");
  expect(router.state.location.pathname).toBe("/");
  expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
    "Start a local business",
  );
  expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
  expect(screen.getByText(/by invitation/)).toBeInTheDocument();
});

test("a signed-in person opening the landing or login page goes to the last opened workspace", async () => {
  stubApi(signedIn());
  for (const path of ["/", "/login"]) {
    const { router, unmount } = await renderApp(path);
    expect(router.state.location.pathname).toBe(`/w/${WORKSPACE}`);
    unmount();
  }
});

test("a signed-in person opening the login screen with ?next= goes there", async () => {
  stubApi(signedIn());
  const { router } = await renderApp("/login?next=%2Faccount");
  expect(router.state.location.pathname).toBe("/account");
});

test("the account screen sits in the frame with the navigation and the trail", async () => {
  stubApi(signedIn());
  await renderApp("/account");
  expect(await screen.findByRole("heading", { level: 1, name: "Account" })).toBeInTheDocument();
  const nav = screen.getByRole("navigation", { name: "Main menu" });
  for (const name of [
    "Dashboard",
    "Ideas",
    "Self Analysis",
    "Notifications",
    "Decision Log",
    "Settings",
  ]) {
    expect(within(nav).getByRole("link", { name: new RegExp(name) })).toBeInTheDocument();
  }
  expect(within(nav).queryByRole("link", { name: "Admin" })).toBeNull();
  expect(
    within(screen.getByRole("list", { name: "Breadcrumbs" })).getByText("Account"),
  ).toBeInTheDocument();
  expect(screen.getByRole("main")).toContainElement(
    screen.getByRole("heading", { name: "Account" }),
  );
  expect(screen.getByRole("link", { name: "Skip to main content" })).toBeInTheDocument();
});

test("the unread count shows on Notifications", async () => {
  stubApi(signedIn());
  await renderApp("/account");
  const link = await screen.findByRole("link", { name: /^Notifications\s*3$/ });
  expect(link).toHaveAttribute("href", "/notifications");
});

test("a workspace the person does not belong to says there is no access, inside the frame", async () => {
  stubApi(signedIn());
  await renderApp(`/w/${OTHER}`);
  expect(
    await screen.findByRole("heading", { name: "You don't have access to this" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Main menu" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Go to Dashboard" })).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}`,
  );
});

test("opening a workspace makes it the last opened", async () => {
  const api = stubApi(signedIn());
  await renderApp(`/w/${PERSONAL}`);
  expect(await screen.findByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
  await waitFor(() =>
    expect(
      api.calls.some(
        (c) =>
          c.method === "PATCH" &&
          (c.body as { lastWorkspaceId?: string }).lastWorkspaceId === PERSONAL,
      ),
    ).toBe(true),
  );
});

test("an unknown path inside the app says not found and keeps the frame", async () => {
  stubApi(signedIn());
  await renderApp(`/w/${WORKSPACE}/nothing-here`);
  expect(
    await screen.findByRole("heading", { name: "Not found. Check the link." }),
  ).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Main menu" })).toBeInTheDocument();
});

test("losing the session while a screen is open goes to the login screen and returns to it", async () => {
  let session = true;
  stubApi({
    "GET /api/v1/me": () => (session ? { body: makeMe() } : unauthenticated()),
    "GET /api/v1/notifications/unread-count": () =>
      session ? { body: { total: 0 } } : unauthenticated(),
  });
  const { router } = await renderApp("/account");
  await screen.findByRole("heading", { level: 1, name: "Account" });
  session = false;
  // What returning to the window does: the stale unread count is read again.
  void router.options.context.queryClient.invalidateQueries({
    queryKey: ["notifications", "unread-count"],
  });
  await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  expect(router.state.location.search).toEqual({ next: "/account" });
});

test("the offline notice shows while offline", async () => {
  stubApi(signedIn());
  await renderApp("/account");
  await screen.findByRole("heading", { level: 1, name: "Account" });
  expect(screen.queryByText(/Offline/)).toBeNull();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  window.dispatchEvent(new Event("offline"));
  expect(
    await screen.findByText("Offline — changes will be saved when you reconnect"),
  ).toBeInTheDocument();
});

test("a modal name nobody has built yet opens nothing, and an invalid one is dropped", async () => {
  stubApi(signedIn());
  const { router } = await renderApp(`/w/${WORKSPACE}?modal=not-a-modal`);
  await screen.findByRole("heading", { level: 1, name: "Dashboard" });
  expect(router.state.location.search).toEqual({});
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("logging in with the right password goes to the workspace, or to ?next=", async () => {
  let session = false;
  const api = stubApi({
    "GET /api/v1/me": () => (session ? { body: makeMe() } : unauthenticated()),
    "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
    "POST /api/auth/sign-in/email": () => {
      session = true;
      return { body: { redirect: false, token: "t", user: { id: "u" } } };
    },
  });
  const { router } = await renderApp("/login?next=%2Faccount");
  await userEvent.type(await screen.findByLabelText(/^Email/), "ana@example.com");
  await userEvent.type(screen.getByLabelText(/^Password/), "moonx-demo-2026");
  await userEvent.click(screen.getByRole("button", { name: "Log in" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/account"));
  expect(api.calls.find((c) => c.url.pathname === "/api/auth/sign-in/email")?.body).toEqual({
    email: "ana@example.com",
    password: "moonx-demo-2026",
  });
});

test("a wrong password shows the message and stays on the login screen", async () => {
  stubApi({
    ...signedOut,
    "POST /api/auth/sign-in/email": () => ({
      status: 401,
      body: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" },
    }),
  });
  const { router } = await renderApp("/login");
  await userEvent.type(await screen.findByLabelText(/^Email/), "ana@example.com");
  await userEvent.type(screen.getByLabelText(/^Password/), "wrong");
  await userEvent.click(screen.getByRole("button", { name: "Log in" }));
  expect(await screen.findByText("Email or password is incorrect")).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/login");
});

test("an invalid form is stopped before anything is sent", async () => {
  const api = stubApi(signedOut);
  await renderApp("/login");
  await userEvent.click(await screen.findByRole("button", { name: "Log in" }));
  expect(await screen.findAllByText("Required")).toHaveLength(2);
  expect(api.calls.some((c) => c.url.pathname.startsWith("/api/auth"))).toBe(false);
});

test("a Google sign-in that was refused shows the invitation text from ?error=", async () => {
  stubApi(signedOut);
  await renderApp("/login?error=signup_disabled");
  expect(
    await screen.findByText(
      "This invitation is invalid or expired. Ask the person who invited you for a new one.",
    ),
  ).toBeInTheDocument();
});

test("an invitation that cannot be read says so, and a server failure offers a retry", async () => {
  const answer: { status: number; body: unknown } = {
    status: 410,
    body: { error: { code: "INVITATION_INVALID", message: "gone", requestId: "r" } },
  };
  stubApi({ ...signedOut, "GET /api/v1/invitations/by-token/abc": () => answer });
  await renderApp("/invite/abc");
  expect(
    await screen.findByText(
      "This invitation is invalid or expired. Ask the person who invited you for a new one.",
    ),
  ).toBeInTheDocument();
});

test("a failing server shows Couldn't load this page, and Retry loads it again", async () => {
  let failing = true;
  stubApi({
    ...signedOut,
    "GET /api/v1/invitations/by-token/abc": () =>
      failing
        ? {
            status: 503,
            body: { error: { code: "UPSTREAM_UNAVAILABLE", message: "down", requestId: "r" } },
          }
        : {
            body: {
              status: "pending",
              email: "new@example.com",
              workspace: { id: WORKSPACE, name: "BCDX" },
              role: "member",
              invitedBy: { displayName: "Ana" },
              expiresAt: new Date().toISOString(),
              accountExists: false,
            },
          },
  });
  await renderApp("/invite/abc");
  expect(
    await screen.findByRole("heading", { name: "Couldn't load this page" }, { timeout: 5000 }),
  ).toBeInTheDocument();
  failing = false;
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("You're invited to join BCDX")).toBeInTheDocument();
  expect(screen.getByLabelText(/^Email/)).toHaveValue("new@example.com");
});

test("an unexpected 500 shows Something went wrong with the first eight characters of the request id", async () => {
  stubApi({
    ...signedOut,
    "GET /api/v1/invitations/by-token/abc": () => ({
      status: 500,
      body: {
        error: {
          code: "INTERNAL",
          message: "boom",
          requestId: "8f14e45f-ea9e-4c5b-9a1f-2c7e1d5a3b6c",
        },
      },
    }),
  });
  await renderApp("/invite/abc");
  expect(
    await screen.findByRole("heading", { name: "Something went wrong" }, { timeout: 5000 }),
  ).toBeInTheDocument();
  expect(screen.getByText("Ref: 8f14e45f")).toBeInTheDocument();
});

test("a signed-in person opening an invitation link goes to step 1 of the welcome flow", async () => {
  stubApi({
    ...signedIn(),
    "GET /api/v1/invitations/by-token/abc": () => ({
      body: {
        status: "pending",
        email: "ana@example.com",
        workspace: { id: OTHER, name: "Cebu Team" },
        role: "member",
        invitedBy: { displayName: "Paolo" },
        expiresAt: new Date().toISOString(),
        accountExists: true,
      },
    }),
  });
  const { router } = await renderApp("/invite/abc");
  expect(router.state.location.pathname).toBe("/welcome");
  expect(router.state.location.search).toEqual({ step: "invite", token: "abc" });
  expect(await screen.findByRole("heading", { name: "Cebu Team" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Join" })).toBeInTheDocument();
});

test("the unread badge in the navigation goes through the count format", async () => {
  stubApi({
    ...signedIn(),
    "GET /api/v1/notifications/unread-count": () => ({ body: { total: 1234 } }),
  });
  await renderApp("/account");
  expect(await screen.findByRole("link", { name: /^Notifications\s*99\+$/ })).toBeInTheDocument();
});
