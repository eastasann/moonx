import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { makeMe, OTHER, renderApp, stubApi, unauthenticated, WORKSPACE } from "./support";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const invitation = (workspace: { id: string; name: string } | null) => ({
  status: "pending",
  email: "ana@example.com",
  workspace,
  role: workspace ? "member" : null,
  invitedBy: workspace ? { displayName: "Paolo" } : null,
  expiresAt: new Date().toISOString(),
  accountExists: true,
});

const signedIn = (
  workspace: { id: string; name: string } | null = { id: OTHER, name: "Cebu Team" },
) => {
  const me = makeMe();
  return {
    "GET /api/v1/me": () => ({ body: me }),
    "PATCH /api/v1/me": ({ body }: { body: unknown }) => ({ body: { ...me, ...(body as object) } }),
    "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
    "GET /api/v1/invitations/by-token/abc": () => ({ body: invitation(workspace) }),
    "POST /api/v1/invitations/by-token/abc/accept": () => ({
      body: { workspaceId: workspace?.id ?? null, alreadyMember: false },
    }),
  };
};

const stepLabels = () =>
  within(screen.getByRole("navigation", { name: "Progress" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent);

test("a person who already had an account sees step 1 only and lands in the workspace after Join", async () => {
  stubApi(signedIn());
  const { router } = await renderApp("/welcome?step=invite&token=abc");
  await screen.findByRole("heading", { name: "Cebu Team" });
  expect(stepLabels()).toEqual(["1Invitation"]);
  await userEvent.click(screen.getByRole("button", { name: "Join" }));
  await vi.waitFor(() => expect(router.state.location.pathname).toBe(`/w/${OTHER}`));
});

test("a new account from a workspace invitation goes through all three steps", async () => {
  stubApi(signedIn());
  const { router } = await renderApp("/welcome?step=invite&token=abc&new=1");
  await screen.findByRole("heading", { name: "Cebu Team" });
  expect(stepLabels()).toEqual(["1Invitation", "2Profile", "3Done"]);
  await userEvent.click(screen.getByRole("button", { name: "Join" }));
  await vi.waitFor(() => expect(router.state.location.search).toEqual({ step: "profile", new: 1 }));
  expect(await screen.findByRole("heading", { name: "Your profile" })).toBeInTheDocument();
  expect(stepLabels()).toEqual(["Invitation, completed", "2Profile", "3Done"]);
  expect(
    screen.getAllByRole("listitem").find((item) => item.getAttribute("data-status") === "done"),
  ).toHaveTextContent("Invitation, completed");
});

test("an invitation without a workspace skips step 1 and the indicator shows two steps", async () => {
  stubApi(signedIn(null));
  await renderApp("/welcome?step=profile");
  expect(await screen.findByRole("heading", { name: "Your profile" })).toBeInTheDocument();
  expect(stepLabels()).toEqual(["1Profile", "2Done"]);
});

test("the landing page opens when the API is down", async () => {
  const handlers = { "GET /api/v1/me": () => ({ status: 500, body: null }) };
  stubApi(handlers);
  const { router } = await renderApp("/");
  expect(router.state.location.pathname).toBe("/");
  expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
    "Start a local business",
  );
});

test("the landing page opens when the network is down", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }),
  );
  await renderApp("/");
  expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
    "Start a local business",
  );
});

test("the landing page still sends a signed-in person to their workspace", async () => {
  stubApi(signedIn());
  const { router } = await renderApp("/");
  expect(router.state.location.pathname).toBe(`/w/${WORKSPACE}`);
});

test("a signed-out person on the landing page is not redirected", async () => {
  stubApi({ "GET /api/v1/me": unauthenticated });
  const { router } = await renderApp("/");
  expect(router.state.location.pathname).toBe("/");
});
