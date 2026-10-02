import { screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { renderApp, stubApi } from "./support";
import { CONTEXT_PATH, DECIDE_URL, HOME_URL, makeContext, signedIn } from "./support-decision";
import { HOME_PATH, makeFullHome } from "./support-validation-home";

afterEach(() => {
  vi.unstubAllGlobals();
});

const stub = (role: "owner" | "member" | "viewer", home = makeFullHome()) =>
  stubApi({
    ...signedIn(role),
    [`GET ${HOME_PATH}`]: () => ({ body: home }),
    [`GET ${CONTEXT_PATH}`]: () => ({ body: makeContext() }),
  });

test("a Viewer who opens the URL gets no access and the materials are never read", async () => {
  const api = stub("viewer");
  await renderApp(DECIDE_URL);
  expect(await screen.findByText("You don't have access to this")).toBeInTheDocument();
  expect(screen.queryByRole("radio", { name: "Proceed" })).toBeNull();
  expect(api.calls.some((c) => c.url.pathname === CONTEXT_PATH)).toBe(false);
});

test("the home offers Record decision and the ready-to-decide step to Members only", async () => {
  stub("member");
  await renderApp(HOME_URL);
  await screen.findByRole("heading", { level: 1, name: "Piaya Gift Box Delivery" });
  expect(screen.getAllByRole("button", { name: "Record decision" }).length).toBeGreaterThan(0);
  expect(screen.getByRole("link", { name: "Ready to record a decision" })).toHaveAttribute(
    "href",
    `${HOME_URL}/decide`,
  );
});
