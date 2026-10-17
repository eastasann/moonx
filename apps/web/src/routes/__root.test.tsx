import { i18n } from "@moonx/i18n";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { routeTree } from "../routeTree.gen";

afterEach(cleanup);

function renderApp(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  // The root route renders <html>, so the app goes into the document itself (a div
  // container would nest <html> inside <body>).
  render(<RouterProvider router={router} />, { container: document });
  return router;
}

test("the root route renders the English document shell", async () => {
  renderApp("/");

  await waitFor(() => {
    expect(document.querySelector('meta[name="viewport"]')).not.toBeNull();
  });
  expect(document.documentElement.lang).toBe("en");
  expect(document.querySelector("meta[charset]")?.getAttribute("charset")).toBe(
    "utf-8",
  );
  expect(
    document.querySelector('meta[name="viewport"]')?.getAttribute("content"),
  ).toBe("width=device-width, initial-scale=1");
});

test("the root hands the shared catalogs to react-i18next, which the parts read", async () => {
  renderApp("/dev/components?screen=s05-dashboard");

  // Without the root's instance react-i18next has none, and the parts show their keys.
  // The SideNav and the TabBar.
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
