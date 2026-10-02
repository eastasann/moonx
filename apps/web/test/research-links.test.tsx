import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { ENTRY_OLD, logEntry } from "./research-fixtures";
import { makeMe, renderApp, stubApi, WORKSPACE } from "./support";
import { registerResearchHooks, writes } from "./support-research";
import {
  HOME_PATH,
  HOME_URL,
  IDEA,
  IDEA_PATH,
  makeDetail,
  makeNewHome,
  VALIDATION,
} from "./support-validation-home";

registerResearchHooks();

const LOG = `/api/v1/validations/${VALIDATION}/research-log`;

/** design-spec 6.1 / Step 14: a check on 13 leads to 14, and what is entered there changes 13. */
test("the demand signal check opens a new entry on 14, and the home reads again after it is saved", {
  timeout: 20000,
}, async () => {
  const created = logEntry({
    id: ENTRY_OLD,
    topic: "Walk the market",
    supportsChecks: ["demand_signal"],
  });
  let homeReads = 0;
  const { calls } = stubApi({
    "GET /api/v1/me": () => ({ body: makeMe() }),
    "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
    [`GET ${IDEA_PATH}`]: () => ({ body: makeDetail() }),
    [`GET ${HOME_PATH}`]: () => {
      homeReads += 1;
      return { body: makeNewHome() };
    },
    [`GET ${LOG}`]: () => ({ body: { items: [], nextCursor: null } }),
    [`POST ${LOG}`]: () => ({ status: 201, body: created }),
    [`GET /api/v1/research-log/${ENTRY_OLD}`]: () => ({ body: { ...created, usages: [] } }),
  });
  const user = userEvent.setup();
  const { router } = await renderApp(HOME_URL);
  await screen.findByRole("heading", { level: 1, name: "Piaya Gift Box Delivery" });
  expect(homeReads).toBe(1);

  const link = document.querySelector<HTMLAnchorElement>('a[href$="/research?new=1"]');
  expect(link?.getAttribute("href")).toBe(`/w/${WORKSPACE}/ideas/${IDEA}/research?new=1`);
  await user.click(link as HTMLAnchorElement);
  await user.type(await screen.findByRole("textbox", { name: /Topic/ }), "Walk the market");
  await user.click(screen.getByRole("button", { name: "Add to log" }));
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  await screen.findByRole("heading", { level: 2, name: "Walk the market" });

  await user.click(screen.getByRole("link", { name: "← Validation" }));
  await waitFor(() => expect(router.state.location.pathname).toBe(`/w/${WORKSPACE}/ideas/${IDEA}`));
  await waitFor(() => expect(homeReads).toBeGreaterThanOrEqual(2));
});

test("the sections of 13 and the checks lead to routes that open", async () => {
  stubApi({
    "GET /api/v1/me": () => ({ body: makeMe() }),
    "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
    [`GET ${IDEA_PATH}`]: () => ({ body: makeDetail() }),
    [`GET ${HOME_PATH}`]: () => ({ body: makeNewHome() }),
    [`GET ${LOG}`]: () => ({ body: { items: [], nextCursor: null } }),
    [`GET /api/v1/validations/${VALIDATION}/competitors`]: () => ({
      body: { items: [], patterns: [], guidance: { min: 3, max: 5 } },
    }),
    [`GET /api/v1/validations/${VALIDATION}/assumptions`]: () => ({ body: { items: [] } }),
    [`GET /api/v1/validations/${VALIDATION}/risks`]: () => ({ body: { items: [] } }),
  });
  const user = userEvent.setup();
  const { router } = await renderApp(HOME_URL);
  await screen.findByRole("heading", { level: 1, name: "Piaya Gift Box Delivery" });
  for (const [name, path] of [
    ["03 Research Log", "research"],
    ["04 Competitors", "competitors"],
    ["09 Assumptions & Risks", "assumptions"],
  ] as const) {
    await user.click(screen.getByRole("link", { name: new RegExp(name) }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/w/${WORKSPACE}/ideas/${IDEA}/${path}`),
    );
    expect(await screen.findByRole("heading", { level: 1, name })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "← Validation" }));
    await screen.findByRole("heading", { level: 1, name: "Piaya Gift Box Delivery" });
  }
});
