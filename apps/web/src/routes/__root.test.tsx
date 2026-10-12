import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, waitFor } from "@testing-library/react";
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
