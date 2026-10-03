import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { renderApp } from "./support";
import {
  callsTo,
  holdReads,
  IDEA,
  IDEA_URL,
  makePlanHome,
  PLAN,
  PLAN_B,
  PLAN_URL,
  PLANS_PATH,
  planApi,
  plansAnswer,
  refusal,
  summaryOf,
  WORKSPACE,
} from "./support-plan-home";

afterEach(() => {
  vi.unstubAllGlobals();
});

const NEW_URL = `${IDEA_URL}?modal=create-plan`;

async function openSheet(
  options: Parameters<typeof planApi>[0] = {},
  extra: Parameters<typeof planApi>[1] = {},
  path = NEW_URL,
) {
  const api = planApi(options, extra);
  const view = await renderApp(path);
  const user = userEvent.setup();
  const dialog = await screen.findByRole("dialog", { name: "Create plan draft" });
  return { api, user, dialog, ...view };
}

const nameBox = (dialog: HTMLElement) =>
  within(dialog).findByRole("textbox", { name: /^Plan name/ });

test("the default name is Plan A on an idea with no plan", async () => {
  const { dialog } = await openSheet({ plans: [] });
  expect(await nameBox(dialog)).toHaveValue("Plan A");
});

test("the default name counts the archived plans' names as used", async () => {
  const { dialog } = await openSheet({
    plans: [summaryOf(PLAN, "Plan A"), summaryOf(PLAN_B, "Plan B", true)],
  });
  expect(await nameBox(dialog)).toHaveValue("Plan C");
});

test("the default name takes the first free letter in order", async () => {
  const { dialog } = await openSheet({
    plans: [summaryOf(PLAN, "plan a"), summaryOf(PLAN_B, "Plan C")],
  });
  expect(await nameBox(dialog)).toHaveValue("Plan B");
});

test("Create draft sends the name and opens the new plan's home", async () => {
  const created = makePlanHome({ id: PLAN_B, name: "Plan B" });
  const { api, user, dialog, router } = await openSheet(
    { plans: [summaryOf(PLAN, "Plan A")] },
    {
      [`POST ${PLANS_PATH}`]: () => ({ status: 201, body: created }),
      [`GET /api/v1/plans/${PLAN_B}`]: () => ({ body: created }),
    },
  );
  const name = await nameBox(dialog);
  await user.clear(name);
  await user.type(name, "  Plan B ");
  await user.click(within(dialog).getByRole("button", { name: "Create draft" }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe(`/w/${WORKSPACE}/ideas/${IDEA}/plans/${PLAN_B}`),
  );
  expect(callsTo(api, "POST", PLANS_PATH).map((c) => c.body)).toEqual([{ name: "Plan B" }]);
  expect(router.state.location.search).not.toHaveProperty("modal");
  expect(await screen.findByRole("heading", { level: 1, name: "Plan B" })).toBeInTheDocument();
});

test("the idea's plan list is read again after a plan is created", async () => {
  const created = makePlanHome({ id: PLAN_B, name: "Plan B" });
  const { api, user, dialog } = await openSheet(
    {},
    {
      [`POST ${PLANS_PATH}`]: () => ({ status: 201, body: created }),
      [`GET /api/v1/plans/${PLAN_B}`]: () => ({ body: created }),
    },
  );
  await nameBox(dialog);
  const reads = () => callsTo(api, "GET", PLANS_PATH).length;
  const before = reads();
  await user.click(within(dialog).getByRole("button", { name: "Create draft" }));
  await waitFor(() => expect(reads()).toBeGreaterThan(before));
});

test("a name another plan uses is refused under the field and the sheet stays", async () => {
  const { user, dialog, router } = await openSheet(
    {},
    { [`POST ${PLANS_PATH}`]: () => refusal("NAME_TAKEN") },
  );
  const name = await nameBox(dialog);
  await user.click(within(dialog).getByRole("button", { name: "Create draft" }));
  expect(await within(dialog).findByText("This name is already used.")).toBeInTheDocument();
  expect(name).toHaveAttribute("aria-invalid", "true");
  expect(router.state.location.search).toMatchObject({ modal: "create-plan" });
});

test("a decision that is not Proceed is refused with its reason", async () => {
  const { user, dialog } = await openSheet(
    {},
    { [`POST ${PLANS_PATH}`]: () => refusal("DECISION_NOT_PROCEED") },
  );
  await nameBox(dialog);
  await user.click(within(dialog).getByRole("button", { name: "Create draft" }));
  expect(await within(dialog).findByText("Couldn't save — Retry")).toBeInTheDocument();
  expect(
    within(dialog).getByText("A plan can only be created after a Proceed decision."),
  ).toBeInTheDocument();
});

test("an archived idea is refused with its reason", async () => {
  const { user, dialog } = await openSheet(
    {},
    { [`POST ${PLANS_PATH}`]: () => refusal("ARCHIVED") },
  );
  await nameBox(dialog);
  await user.click(within(dialog).getByRole("button", { name: "Create draft" }));
  expect(
    await within(dialog).findByText("This is archived. Restore it to make changes."),
  ).toBeInTheDocument();
});

test("an empty name cannot be sent", async () => {
  const { api, user, dialog } = await openSheet();
  const name = await nameBox(dialog);
  await user.clear(name);
  expect(within(dialog).getByRole("button", { name: "Create draft" })).toBeDisabled();
  expect(callsTo(api, "POST", PLANS_PATH)).toHaveLength(0);
});

test("a Viewer who opens the URL gets no sheet", async () => {
  planApi({ role: "viewer" });
  await renderApp(NEW_URL);
  await screen.findByRole("heading", { level: 1, name: "Piaya Gift Box Delivery" });
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("the sheet shows no input while the plans are read", async () => {
  planApi();
  holdReads(PLANS_PATH);
  void renderApp(NEW_URL);
  const dialog = await screen.findByRole("dialog", { name: "Create plan draft" });
  expect(within(dialog).queryByRole("textbox")).toBeNull();
});

test("a failed read of the plans offers Retry", async () => {
  let failing = true;
  planApi(
    {},
    {
      [`GET ${PLANS_PATH}`]: () => (failing ? refusal("RATE_LIMITED", 429) : plansAnswer([])),
    },
  );
  await renderApp(NEW_URL);
  const dialog = await screen.findByRole("dialog", { name: "Create plan draft" });
  expect(
    await within(dialog).findByText("The existing plans could not be read."),
  ).toBeInTheDocument();
  failing = false;
  await userEvent.click(within(dialog).getByRole("button", { name: "Retry" }));
  // The sheet is a new dialog once the read succeeds, so the old element is gone.
  expect(await screen.findByRole("textbox", { name: /^Plan name/ })).toHaveValue("Plan A");
});

test("Add plan on screen 20 opens the same sheet", async () => {
  planApi();
  await renderApp(`${PLAN_URL}?modal=create-plan`);
  const dialog = await screen.findByRole("dialog", { name: "Create plan draft" });
  expect(await nameBox(dialog)).toHaveValue("Plan C");
});

test("a failed save keeps the name, says Couldn't save, and Create draft sends it again", async () => {
  const created = makePlanHome({ id: PLAN_B, name: "Plan B" });
  let attempts = 0;
  const { api, user, dialog, router } = await openSheet(
    {},
    {
      [`POST ${PLANS_PATH}`]: () => {
        attempts += 1;
        return attempts === 1 ? refusal("INTERNAL", 500) : { status: 201, body: created };
      },
      [`GET /api/v1/plans/${PLAN_B}`]: () => ({ body: created }),
    },
  );
  const name = await nameBox(dialog);
  await user.clear(name);
  await user.type(name, "Plan B");
  await user.click(within(dialog).getByRole("button", { name: "Create draft" }));
  expect(await within(dialog).findByText("Couldn't save — Retry")).toBeInTheDocument();
  expect(name).toHaveValue("Plan B");
  await user.click(within(dialog).getByRole("button", { name: "Create draft" }));
  await waitFor(() => expect(router.state.location.pathname).toContain(PLAN_B));
  expect(callsTo(api, "POST", PLANS_PATH)).toHaveLength(2);
});
