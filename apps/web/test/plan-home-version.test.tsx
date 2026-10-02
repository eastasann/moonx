import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { renderApp } from "./support";
import {
  ana,
  callsTo,
  makePlanHome,
  openPlanHome,
  PLAN_PATH,
  PLAN_URL,
  planApi,
  refusal,
  VERSION_2,
  VERSIONS_PATH,
} from "./support-plan-home";

afterEach(() => {
  vi.unstubAllGlobals();
});

const saved = {
  status: 201,
  body: {
    id: VERSION_2,
    versionNumber: 2,
    name: "v2 For the bank",
    savedBy: ana,
    savedAt: "2026-10-02T02:00:00.000Z",
  },
};

async function openSheet(extra: Parameters<typeof planApi>[1] = {}) {
  const { api, user, router } = await openPlanHome({}, extra);
  await user.click(screen.getByRole("button", { name: "Save version" }));
  const dialog = await screen.findByRole("dialog", { name: "Save version" });
  return { api, user, router, dialog };
}

const nameBox = (dialog: HTMLElement) =>
  within(dialog).findByRole("textbox", { name: /^Version name/ });

test("Save version opens the sheet with v{n} as the name", async () => {
  const { dialog, router } = await openSheet();
  expect(await nameBox(dialog)).toHaveValue("v2");
  expect(router.state.location.search).toMatchObject({ modal: "save-version" });
});

test("saving sends the trimmed name, refreshes the plan, shows a toast and closes", async () => {
  let versions = 1;
  const { api, user, dialog } = await openSheet({
    [`POST ${VERSIONS_PATH}`]: () => {
      versions = 2;
      return saved;
    },
    [`GET ${PLAN_PATH}`]: () => ({
      body: makePlanHome({
        hasChangesSinceVersion: false,
        latestVersion: {
          id: VERSION_2,
          name: "v2 For the bank",
          savedAt: "2026-10-02T02:00:00.000Z",
        },
        versions:
          versions === 2 ? [...makePlanHome().versions, saved.body] : makePlanHome().versions,
      }),
    }),
  });
  const name = await nameBox(dialog);
  await user.clear(name);
  await user.type(name, "  v2 For the bank ");
  await user.click(within(dialog).getByRole("button", { name: "Save version" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Save version" })).toBeNull());
  expect(callsTo(api, "POST", VERSIONS_PATH).map((c) => c.body)).toEqual([
    { name: "v2 For the bank" },
  ]);
  expect(await screen.findByText("Version saved")).toBeInTheDocument();
  expect(await screen.findByText("Version: v2 For the bank")).toBeInTheDocument();
  const list = screen.getByRole("list", { name: "Versions" });
  expect(await within(list).findByRole("link", { name: "v2 For the bank" })).toBeInTheDocument();
});

test("an empty name cannot be sent", async () => {
  const { api, user, dialog } = await openSheet();
  await user.clear(await nameBox(dialog));
  expect(within(dialog).getByRole("button", { name: "Save version" })).toBeDisabled();
  expect(callsTo(api, "POST", VERSIONS_PATH)).toHaveLength(0);
});

test("a name over 80 characters is refused with its reason", async () => {
  const { api, user, dialog } = await openSheet();
  const name = await nameBox(dialog);
  await user.clear(name);
  await user.click(name);
  await user.paste("x".repeat(81));
  await user.click(within(dialog).getByRole("button", { name: "Save version" }));
  expect(await within(dialog).findByText("Use at most 80 characters")).toBeInTheDocument();
  expect(callsTo(api, "POST", VERSIONS_PATH)).toHaveLength(0);
});

test("a refused save shows the reason, keeps the input and the sheet", async () => {
  const { user, dialog } = await openSheet({
    [`POST ${VERSIONS_PATH}`]: () => refusal("ARCHIVED"),
  });
  const name = await nameBox(dialog);
  await user.click(within(dialog).getByRole("button", { name: "Save version" }));
  expect(await within(dialog).findByText("The version was not saved.")).toBeInTheDocument();
  expect(
    within(dialog).getByText("This is archived. Restore it to make changes."),
  ).toBeInTheDocument();
  expect(name).toHaveValue("v2");
  expect(screen.queryByText("Version saved")).toBeNull();
});

test("a Viewer who opens the URL gets no sheet", async () => {
  planApi({ role: "viewer" });
  await renderApp(`${PLAN_URL}?modal=save-version`);
  await screen.findByRole("heading", { level: 1, name: "Plan A" });
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("Cancel closes the sheet without saving", async () => {
  const { api, user, dialog } = await openSheet();
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(callsTo(api, "POST", VERSIONS_PATH)).toHaveLength(0);
});
