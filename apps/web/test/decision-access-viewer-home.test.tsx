import { screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { renderApp, stubApi } from "./support";
import { HOME_URL, signedIn } from "./support-decision";
import { HOME_PATH, makeDetail, makeFullHome } from "./support-validation-home";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("a Viewer sees no Record decision button and no link to screen 19 on the home", async () => {
  stubApi({ ...signedIn("viewer"), [`GET ${HOME_PATH}`]: () => ({ body: makeFullHome() }) });
  await renderApp(HOME_URL);
  await screen.findByRole("heading", { level: 1, name: "Piaya Gift Box Delivery" });
  expect(screen.queryByRole("button", { name: "Record decision" })).toBeNull();
  expect(screen.getByText("Ready to record a decision")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Ready to record a decision" })).toBeNull();
});

test("an archived idea offers no entry to screen 19 either", async () => {
  stubApi({
    ...signedIn("owner"),
    [`GET ${HOME_PATH}`]: () => ({
      body: makeFullHome({ idea: makeDetail({ archived: true, latestDecision: "proceed" }) }),
    }),
  });
  await renderApp(HOME_URL);
  await screen.findByRole("heading", { level: 1, name: "Piaya Gift Box Delivery" });
  expect(screen.queryByRole("button", { name: "Record decision" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Ready to record a decision" })).toBeNull();
});
