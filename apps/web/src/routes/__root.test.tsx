import { i18n } from "@moonx/i18n";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import i18next from "i18next";
import { setI18n } from "react-i18next";
import {
  afterEach,
  beforeEach,
  expect,
  onTestFinished,
  test,
  vi,
} from "vitest";
import { createAppRouter } from "../router";

// Signed out: a page outside the workspaces asks the API who is signed in.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "UNAUTHENTICATED",
              message: "No session",
              requestId: "8f14e45f-ea9e-4c5b-9a1f-2c7e1d5a3b6c",
            },
          }),
          { status: 401, headers: { "content-type": "application/json" } },
        ),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderApp(path: string) {
  const router = createAppRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  // The root route renders <html>, so the app goes into the document itself (a div
  // container would nest <html> inside <body>).
  render(<RouterProvider router={router} />, { container: document });
  return router;
}

test("the root route renders the English document shell", async () => {
  // A page that names itself no further: the tab reads the app's name alone (6.0.1).
  renderApp("/no-such-screen");

  await waitFor(() => {
    expect(document.querySelector('meta[name="viewport"]')).not.toBeNull();
  });
  expect(document.documentElement.lang).toBe("en");
  expect(document.title).toBe("moonx");
  expect(document.querySelector("meta[charset]")?.getAttribute("charset")).toBe(
    "utf-8",
  );
  expect(
    document.querySelector('meta[name="viewport"]')?.getAttribute("content"),
  ).toBe("width=device-width, initial-scale=1");
});

test("the root hands the shared catalogs to react-i18next, which the parts read", async () => {
  // The tests' own default (src/test/setup.ts) is swapped for an instance with no
  // catalogs, so only the root's I18nextProvider can give the parts their words.
  setI18n(i18next.createInstance());
  onTestFinished(() => setI18n(i18n));
  renderApp("/dev/components?screen=s05-dashboard");

  // Without the root's instance the parts would show their keys. The SideNav and the
  // TabBar.
  expect(
    await screen.findAllByRole(
      "navigation",
      { name: i18n.t("components:nav.label") },
      { timeout: 30_000 },
    ),
  ).toHaveLength(2);
  expect(document.body.textContent).not.toContain("components:");
  // The gallery compiles its styles on first load.
}, 40_000);

test("a path that is no screen: Not found; signed out, the way to 1 (6.0.6)", async () => {
  renderApp("/no-such-screen");
  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "Not found. Check the link.",
    }),
  ).toBeTruthy();
  const home = await screen.findByRole("link", { name: "Go to Home" });
  expect(home.getAttribute("href")).toBe("/");
  expect(screen.queryByRole("link", { name: "Go to Dashboard" })).toBeNull();
});

test("a path that is no screen: signed in, the way to the dashboard (6.0.6)", async () => {
  const workspace = {
    id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    name: "BCDX",
    isPersonal: false,
    currency: "PHP",
  };
  vi.mocked(fetch).mockImplementation(async () =>
    Response.json({
      id: "0f8fad5b-d9cb-469f-a165-70867728950e",
      email: "ana@bcdx.example",
      displayName: "Ana Villanueva",
      avatarUrl: null,
      timezone: "Asia/Manila",
      theme: "system",
      isAdmin: false,
      hasPassword: true,
      lastWorkspaceId: workspace.id,
      memberships: [{ workspace, role: "owner" }],
    }),
  );
  renderApp("/no-such-screen");
  const dashboard = await screen.findByRole("link", {
    name: "Go to Dashboard",
  });
  expect(dashboard.getAttribute("href")).toBe(`/w/${workspace.id}`);
  expect(screen.queryByRole("link", { name: "Go to Home" })).toBeNull();
});
