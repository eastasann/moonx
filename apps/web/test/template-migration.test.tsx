import type { HistoryEntry, TemplateMigrationPreview } from "@moonx/schemas";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, type MockInstance, test, vi } from "vitest";
import { toasts } from "../src/lib/toast";
import { renderApp, stubApi } from "./support";
import {
  callsTo,
  makePlanHome,
  PLAN,
  PLAN_PATH,
  PLAN_URL,
  planApi,
  refusal,
} from "./support-plan-home";
import { viewerMe } from "./support-research";
import {
  ANALYSIS,
  ME,
  registerSelfAnalysisHooks,
  HOME_PATH as SELF_HOME_PATH,
  selfAnalysisApi,
  home as selfHome,
} from "./support-self-analysis";
import {
  HOME_PATH,
  HOME_URL,
  makeDetail,
  makeFullHome,
  meOf,
  VALIDATION,
} from "./support-validation-home";

registerSelfAnalysisHooks();

const TEMPLATE_PATH = "/api/v1/template-migrations";
const PREVIEW_PATH = `${TEMPLATE_PATH}/preview`;
const NEWER = { versionId: "tv2", versionNumber: 2 };
const OLD_TEMPLATE = { versionId: "tv1", versionNumber: 1, newerVersion: NEWER };
let toast: MockInstance<typeof toasts.add>;

const PREVIEW: TemplateMigrationPreview = {
  from: { versionNumber: 1 },
  to: { versionId: "tv2", versionNumber: 2 },
  carried: 12,
  hiddenQuestions: [
    { questionKey: "V.05.OLD", title: "Which stall will you use?", hasAnswer: true },
    { questionKey: "V.06.OLD", title: "Who helps you on weekends?", hasAnswer: false },
  ],
  addedQuestions: 2,
  addedCostRows: ["Signage", "Permit renewal"],
};

const previewAnswer = (preview: TemplateMigrationPreview = PREVIEW) => ({ body: preview });
const MIGRATED = { body: { batchId: "b0000000-0000-4000-8000-000000000001", template: NEWER } };

const validationUrl = `${HOME_URL}?modal=update-template&about=validation:${VALIDATION}`;
const newerValidation = () => makeFullHome({ template: OLD_TEMPLATE });

// The history panel is a side panel only on a wide screen.
beforeEach(() => {
  // The shared hooks restore every spy after each test, so it is made again for each one.
  toast = vi.spyOn(toasts, "add");
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: /min-width/.test(query),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

// Screen 13

function stubValidation(extra: Parameters<typeof stubApi>[0] = {}) {
  let migrated = false;
  return validationApi({
    [`GET ${HOME_PATH}`]: () => ({
      body: migrated ? makeFullHome() : newerValidation(),
    }),
    [`GET ${PREVIEW_PATH}`]: () => previewAnswer(),
    [`POST ${TEMPLATE_PATH}`]: () => {
      migrated = true;
      return MIGRATED;
    },
    ...extra,
  });
}

function validationApi(
  handlers: Parameters<typeof stubApi>[0],
  role: "owner" | "viewer" = "owner",
) {
  return stubApi({
    "GET /api/v1/me": () => ({ body: meOf(role) }),
    "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
    ...handlers,
  });
}

test("13: the dialog shows what is carried, what is hidden and what is added", async () => {
  const api = stubValidation();
  await renderApp(validationUrl);
  const dialog = await screen.findByRole("dialog", { name: "Update template" });
  expect(await within(dialog).findByText("Template v1 to v2")).toBeInTheDocument();
  expect(within(dialog).getByText("12 answers carry over")).toBeInTheDocument();
  expect(
    within(dialog).getByText("2 new questions, empty until you answer them"),
  ).toBeInTheDocument();
  expect(within(dialog).getByText("Signage, Permit renewal")).toBeInTheDocument();
  const hidden = within(dialog).getByRole("list", { name: "Not in the new version" });
  const rows = within(hidden).getAllByRole("listitem");
  expect(rows[0]).toHaveTextContent("Which stall will you use?");
  expect(rows[0]).toHaveTextContent("Has an answer");
  expect(rows[1]).toHaveTextContent("Who helps you on weekends?");
  expect(rows[1]).toHaveTextContent("No answer");
  const preview = callsTo(api, "GET", PREVIEW_PATH)[0];
  expect(Object.fromEntries(preview?.url.searchParams ?? [])).toEqual({
    targetType: "validation",
    targetId: VALIDATION,
  });
});

test("13: Update sends the newer version, refreshes the home, closes and says so", async () => {
  const api = stubValidation();
  const { router } = await renderApp(validationUrl);
  const user = userEvent.setup();
  const dialog = await screen.findByRole("dialog", { name: "Update template" });
  await within(dialog).findByText("Template v1 to v2");
  const reads = () => callsTo(api, "GET", HOME_PATH).length;
  const before = reads();
  await user.click(within(dialog).getByRole("button", { name: "Update to v2" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(callsTo(api, "POST", TEMPLATE_PATH).map((c) => c.body)).toEqual([
    { targetType: "validation", targetId: VALIDATION, toVersionId: "tv2" },
  ]);
  expect(reads()).toBeGreaterThan(before);
  expect(router.state.location.search).not.toHaveProperty("modal");
  expect(router.state.location.search).not.toHaveProperty("about");
  expect(toast).toHaveBeenCalledWith({ title: "Template updated to v2", variant: "positive" });
  await waitFor(() => expect(screen.queryByText("A newer template is available")).toBeNull());
});

test("13: the notice and the menu entry open the dialog for this validation", async () => {
  validationApi({
    [`GET ${HOME_PATH}`]: () => ({ body: newerValidation() }),
    [`GET ${PREVIEW_PATH}`]: () => previewAnswer(),
  });
  const { router } = await renderApp(HOME_URL);
  const user = userEvent.setup();
  await screen.findByText("A newer template is available");
  await user.click(screen.getByRole("button", { name: "Update template" }));
  await waitFor(() =>
    expect(router.state.location.search).toMatchObject({
      modal: "update-template",
      about: `validation:${VALIDATION}`,
    }),
  );
  await screen.findByRole("dialog", { name: "Update template" });
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await user.click(screen.getByRole("button", { name: "More actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Update template" }));
  await waitFor(() =>
    expect(router.state.location.search).toMatchObject({
      about: `validation:${VALIDATION}`,
    }),
  );
});

test("13: a template that is already the latest says so and offers no update", async () => {
  validationApi({
    [`GET ${HOME_PATH}`]: () => ({ body: newerValidation() }),
    [`GET ${PREVIEW_PATH}`]: () => refusal("ALREADY_LATEST"),
  });
  await renderApp(validationUrl);
  const dialog = await screen.findByRole("dialog", { name: "Update template" });
  expect(await within(dialog).findByText(/already on the latest template/)).toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: /^Update to/ })).toBeNull();
});

test("13: someone else's update during the confirm is reported as already latest", async () => {
  const api = stubValidation({ [`POST ${TEMPLATE_PATH}`]: () => refusal("ALREADY_LATEST") });
  await renderApp(validationUrl);
  const user = userEvent.setup();
  const dialog = await screen.findByRole("dialog", { name: "Update template" });
  await within(dialog).findByText("Template v1 to v2");
  await user.click(within(dialog).getByRole("button", { name: "Update to v2" }));
  expect(await within(dialog).findByText(/already on the latest template/)).toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: /^Update to/ })).toBeNull();
  expect(callsTo(api, "POST", TEMPLATE_PATH)).toHaveLength(1);
});

test("13: a failed preview can be retried", async () => {
  let attempts = 0;
  validationApi({
    [`GET ${HOME_PATH}`]: () => ({ body: newerValidation() }),
    [`GET ${PREVIEW_PATH}`]: () => {
      attempts += 1;
      return attempts === 1 ? refusal("INTERNAL", 500) : previewAnswer();
    },
  });
  await renderApp(validationUrl);
  const user = userEvent.setup();
  const dialog = await screen.findByRole("dialog", { name: "Update template" });
  expect(await within(dialog).findByText("Couldn't load the changes")).toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: /^Update to/ })).not.toBeNull();
  expect(within(dialog).getByRole("button", { name: /^Update to/ })).toBeDisabled();
  await user.click(within(dialog).getByRole("button", { name: "Retry" }));
  expect(await within(dialog).findByText("Template v1 to v2")).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Update to v2" })).toBeEnabled();
});

test("13: a failed update keeps the dialog and offers Retry", async () => {
  let attempts = 0;
  const api = stubValidation({
    [`POST ${TEMPLATE_PATH}`]: () => {
      attempts += 1;
      return attempts === 1 ? refusal("INTERNAL", 500) : MIGRATED;
    },
  });
  await renderApp(validationUrl);
  const user = userEvent.setup();
  const dialog = await screen.findByRole("dialog", { name: "Update template" });
  await within(dialog).findByText("Template v1 to v2");
  await user.click(within(dialog).getByRole("button", { name: "Update to v2" }));
  expect(await within(dialog).findByText("Couldn't update the template")).toBeInTheDocument();
  expect(within(dialog).getByText("Template v1 to v2")).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(callsTo(api, "POST", TEMPLATE_PATH)).toHaveLength(2);
});

test("13: a Viewer who types the address gets no dialog and no preview request", async () => {
  const api = validationApi(
    {
      [`GET ${HOME_PATH}`]: () => ({ body: newerValidation() }),
      [`GET ${PREVIEW_PATH}`]: () => previewAnswer(),
    },
    "viewer",
  );
  await renderApp(validationUrl);
  await screen.findByRole("heading", { level: 1, name: newerValidation().idea.name });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByText("A newer template is available")).toBeNull();
  expect(callsTo(api, "GET", PREVIEW_PATH)).toHaveLength(0);
});

test("13: an archived idea gets no dialog", async () => {
  const api = validationApi({
    [`GET ${HOME_PATH}`]: () => ({
      body: makeFullHome({ template: OLD_TEMPLATE, idea: makeDetail({ archived: true }) }),
    }),
    [`GET ${PREVIEW_PATH}`]: () => previewAnswer(),
  });
  await renderApp(validationUrl);
  await screen.findByText("This idea is archived");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByText("A newer template is available")).toBeNull();
  expect(callsTo(api, "GET", PREVIEW_PATH)).toHaveLength(0);
});

test("13: an about that names another validation opens nothing", async () => {
  const api = stubValidation();
  await renderApp(
    `${HOME_URL}?modal=update-template&about=validation:99999999-9999-4999-8999-999999999999`,
  );
  await screen.findByText("A newer template is available");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(callsTo(api, "GET", PREVIEW_PATH)).toHaveLength(0);
});

test("13: an update link with no about opens nothing", async () => {
  stubValidation();
  await renderApp(`${HOME_URL}?modal=update-template`);
  await screen.findByText("A newer template is available");
  expect(screen.queryByRole("dialog")).toBeNull();
});

// Screen 10

const selfUrl = `${SELF_HOME_PATH}?modal=update-template&about=self_analysis:${ANALYSIS}`;
const newerSelf = () => selfHome({ template: OLD_TEMPLATE });

test("10: the owner sees the notice and the menu entry when a newer template exists", async () => {
  selfAnalysisApi({}, { home: newerSelf() });
  await renderApp(SELF_HOME_PATH);
  expect(await screen.findByText("A newer template is available")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Update template" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "More actions for the self analysis" }));
  expect(await screen.findByRole("menuitem", { name: "Update template" })).toBeInTheDocument();
});

test("10: no notice when the template is the latest", async () => {
  selfAnalysisApi();
  await renderApp(SELF_HOME_PATH);
  await screen.findByRole("heading", { level: 1, name: "My Self Analysis" });
  expect(screen.queryByText("A newer template is available")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "More actions for the self analysis" }));
  await screen.findByRole("menuitem", { name: /Currency/ });
  expect(screen.queryByRole("menuitem", { name: "Update template" })).toBeNull();
});

test("10: a Viewer is shown neither the notice nor a dialog", async () => {
  const api = selfAnalysisApi(
    { [`GET ${PREVIEW_PATH}`]: () => previewAnswer() },
    { home: newerSelf(), me: viewerMe() },
  );
  await renderApp(selfUrl);
  await screen.findByRole("heading", { level: 1, name: "My Self Analysis" });
  expect(screen.queryByText("A newer template is available")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(callsTo(api, "GET", PREVIEW_PATH)).toHaveLength(0);
});

test("10: Update posts the self analysis and the home is read again", async () => {
  let migrated = false;
  const api = selfAnalysisApi(
    {
      [`GET ${ME}`]: () => ({ body: migrated ? selfHome() : newerSelf() }),
      [`GET ${PREVIEW_PATH}`]: () =>
        previewAnswer({ ...PREVIEW, hiddenQuestions: [], addedCostRows: [] }),
      [`POST ${TEMPLATE_PATH}`]: () => {
        migrated = true;
        return MIGRATED;
      },
    },
    {},
  );
  await renderApp(selfUrl);
  const user = userEvent.setup();
  const dialog = await screen.findByRole("dialog", { name: "Update template" });
  expect(await within(dialog).findByText("Every question carries over.")).toBeInTheDocument();
  expect(within(dialog).queryByText("Cost rows added")).toBeNull();
  await user.click(within(dialog).getByRole("button", { name: "Update to v2" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(callsTo(api, "POST", TEMPLATE_PATH).map((c) => c.body)).toEqual([
    { targetType: "self_analysis", targetId: ANALYSIS, toVersionId: "tv2" },
  ]);
  await waitFor(() => expect(screen.queryByText("A newer template is available")).toBeNull());
});

// Screen 20

const planUrl = `${PLAN_URL}?modal=update-template&about=business_plan:${PLAN}`;
const newerPlan = (patch = {}) => makePlanHome({ template: OLD_TEMPLATE, ...patch });

test("20: an editor sees the notice and the menu entry on the latest plan", async () => {
  planApi({ plan: newerPlan() });
  await renderApp(PLAN_URL);
  expect(await screen.findByText("A newer template is available")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Update template" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "More actions" }));
  expect(await screen.findByRole("menuitem", { name: "Update template" })).toBeInTheDocument();
});

test.each([
  ["a Viewer", { role: "viewer" as const, plan: newerPlan() }],
  ["an archived plan", { plan: newerPlan({ archived: true }) }],
  ["an archived idea", { plan: newerPlan(), ideaArchived: true }],
])("20: %s gets no notice and no dialog", async (_name, options) => {
  const api = planApi(options, { [`GET ${PREVIEW_PATH}`]: () => previewAnswer() });
  await renderApp(planUrl);
  await screen.findByRole("heading", { level: 1, name: "Plan A" });
  expect(screen.queryByText("A newer template is available")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(callsTo(api, "GET", PREVIEW_PATH)).toHaveLength(0);
});

test("20: a saved version is read only and has no notice", async () => {
  const version = makePlanHome().versions[0];
  planApi({
    plan: newerPlan({
      viewingVersion: version && { id: version.id, name: version.name, savedAt: version.savedAt },
    }),
  });
  await renderApp(`${PLAN_URL}?version=${version?.id}`);
  await screen.findByRole("heading", { level: 1, name: "Plan A" });
  expect(screen.queryByText("A newer template is available")).toBeNull();
});

test("20: Update posts the plan and the plan is read again", async () => {
  let migrated = false;
  const api = planApi(
    { plan: newerPlan() },
    {
      [`GET ${PLAN_PATH}`]: () => ({
        body: { ...(migrated ? makePlanHome() : newerPlan()), ideaArchived: false },
      }),
      [`GET ${PREVIEW_PATH}`]: () => previewAnswer(),
      [`POST ${TEMPLATE_PATH}`]: () => {
        migrated = true;
        return MIGRATED;
      },
    },
  );
  await renderApp(planUrl);
  const user = userEvent.setup();
  const dialog = await screen.findByRole("dialog", { name: "Update template" });
  await within(dialog).findByText("Template v1 to v2");
  await user.click(within(dialog).getByRole("button", { name: "Update to v2" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(callsTo(api, "POST", TEMPLATE_PATH).map((c) => c.body)).toEqual([
    { targetType: "business_plan", targetId: PLAN, toVersionId: "tv2" },
  ]);
  await waitFor(() => expect(screen.queryByText("A newer template is available")).toBeNull());
});

// History

const BATCH = "b0000000-0000-4000-8000-0000000000aa";
const migrationEntry = (): HistoryEntry => ({
  id: "e0000000-0000-4000-8000-0000000000aa",
  batchId: BATCH,
  target: { type: "template_version", id: ANALYSIS, key: "self_analysis" },
  label: "Template updated to v2",
  action: "update",
  source: "template_migration",
  before: { versionId: "tv1", versionNumber: 1 },
  after: { versionId: "tv2", versionNumber: 2 },
  changedBy: {
    id: "77777777-7777-4777-8777-777777777777",
    displayName: "Ana Villanueva",
    avatarUrl: null,
    badge: null,
  },
  changedAt: new Date(Date.now() - 3_600_000).toISOString(),
  revertible: true,
});

test("the history shows the update and undoes it as a whole, then 10 reads the template again", async () => {
  let undone = false;
  const api = selfAnalysisApi(
    {
      [`GET ${ME}`]: () => ({
        body: undone
          ? newerSelf()
          : selfHome({ template: { ...OLD_TEMPLATE, versionNumber: 2, newerVersion: null } }),
      }),
      "GET /api/v1/history": () => ({
        body: { items: undone ? [] : [migrationEntry()], nextCursor: null },
      }),
      [`POST /api/v1/history/batches/${BATCH}/revert`]: () => {
        undone = true;
        return { body: { reverted: 1, batchId: "b0000000-0000-4000-8000-0000000000bb" } };
      },
    },
    {},
  );
  await renderApp(`${SELF_HOME_PATH}?panel=history&target=container:self_analysis:${ANALYSIS}`);
  const panel = within(await screen.findByRole("complementary", { name: "History" }));
  expect(await panel.findByText("Template updated to v2")).toBeInTheDocument();
  expect(panel.getByText("Template migration")).toBeInTheDocument();
  expect(panel.queryByRole("button", { name: "Restore this version" })).toBeNull();
  expect(screen.queryByText("A newer template is available")).toBeNull();
  await userEvent.click(panel.getByRole("button", { name: "Undo the whole operation" }));
  await waitFor(() =>
    expect(callsTo(api, "POST", `/api/v1/history/batches/${BATCH}/revert`)).toHaveLength(1),
  );
  expect(await screen.findByText("A newer template is available")).toBeInTheDocument();
});

test("a Viewer's update entry has no undo", async () => {
  selfAnalysisApi(
    {
      "GET /api/v1/history": () => ({
        body: { items: [{ ...migrationEntry(), revertible: false }], nextCursor: null },
      }),
    },
    {},
  );
  await renderApp(`${SELF_HOME_PATH}?panel=history&target=container:self_analysis:${ANALYSIS}`);
  const panel = within(await screen.findByRole("complementary", { name: "History" }));
  expect(await panel.findByText("Template updated to v2")).toBeInTheDocument();
  expect(panel.queryByRole("button", { name: /Restore|Undo/ })).toBeNull();
});
