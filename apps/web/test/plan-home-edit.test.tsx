import { screen, waitFor, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import {
  ana,
  callsTo,
  makePlanHome,
  openPlanHome,
  PLAN,
  PLAN_PATH,
  refusal,
} from "./support-plan-home";
import { PAOLO } from "./support-validation-home";

afterEach(() => {
  vi.unstubAllGlobals();
});

const businessName = () => screen.getByRole("textbox", { name: /^Business name/ });
const preparedBy = () => screen.getByRole("textbox", { name: /^Prepared by/ });
const patches = (api: Parameters<typeof callsTo>[0]) => callsTo(api, "PATCH", PLAN_PATH);

test("Business Name saves with the plan's lock when the person leaves the field", async () => {
  const { api, user } = await openPlanHome(
    {},
    {
      [`PATCH ${PLAN_PATH}`]: () => ({
        body: makePlanHome({ businessName: "Piaya Boxes Co.", lockVersion: 6 }),
      }),
    },
  );
  await user.clear(businessName());
  await user.type(businessName(), "  Piaya Boxes Co. ");
  await user.tab();
  await waitFor(() => expect(patches(api)).toHaveLength(1));
  expect(patches(api)[0]?.body).toEqual({ businessName: "Piaya Boxes Co.", lockVersion: 5 });
});

test("the next field's save carries the lock the last save returned", async () => {
  const { api, user } = await openPlanHome(
    {},
    {
      [`PATCH ${PLAN_PATH}`]: () => ({ body: makePlanHome({ lockVersion: 6 }) }),
    },
  );
  await user.type(businessName(), "!");
  await user.tab();
  await waitFor(() => expect(patches(api)).toHaveLength(1));
  await user.type(preparedBy(), "?");
  await user.tab();
  await waitFor(() => expect(patches(api)).toHaveLength(2));
  expect(patches(api)[1]?.body).toEqual({ preparedBy: "Ana?", lockVersion: 6 });
});

test("an empty Business Name is refused with its reason and nothing is sent", async () => {
  const { api, user } = await openPlanHome();
  await user.clear(businessName());
  await user.tab();
  expect(await screen.findByText("Required")).toBeInTheDocument();
  expect(patches(api)).toHaveLength(0);
});

test("a save that failed offers Retry", async () => {
  let attempts = 0;
  const { api, user } = await openPlanHome(
    {},
    {
      [`PATCH ${PLAN_PATH}`]: () => {
        attempts += 1;
        return attempts === 1
          ? refusal("FORBIDDEN", 403)
          : { body: makePlanHome({ lockVersion: 6 }) };
      },
    },
  );
  await user.type(preparedBy(), "!");
  await user.tab();
  await screen.findByText("You don't have permission to do this.");
  // The app header carries its own Retry for queued saves; the plan's alert comes after it.
  await user.click(screen.getAllByRole("button", { name: "Retry" }).at(-1) as HTMLElement);
  await waitFor(() => expect(patches(api)).toHaveLength(2));
  expect(patches(api)[1]?.body).toMatchObject({ preparedBy: "Ana!" });
});

test("someone else's save opens the conflict choice, and Load theirs takes their header", async () => {
  const { user } = await openPlanHome(
    {},
    {
      [`PATCH ${PLAN_PATH}`]: () => ({
        status: 409,
        body: {
          error: {
            code: "CONFLICT",
            message: "changed",
            requestId: "r",
            current: {
              value: { name: "Plan A", businessName: "Their Co.", preparedBy: "Paolo" },
              lockVersion: 7,
              updatedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
              updatedBy: { ...ana, id: PAOLO, displayName: "Paolo Reyes" },
            },
          },
        },
      }),
    },
  );
  await user.type(businessName(), "!");
  await user.tab();
  const dialog = await screen.findByRole("dialog", { name: "Someone updated this first" });
  expect(within(dialog).getByText(/Paolo Reyes updated this plan header/)).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Load theirs" }));
  await waitFor(() => expect(businessName()).toHaveValue("Their Co."));
  expect(preparedBy()).toHaveValue("Paolo");
});

test("Overwrite with mine sends the input again with force", async () => {
  let attempts = 0;
  const { api, user } = await openPlanHome(
    {},
    {
      [`PATCH ${PLAN_PATH}`]: () => {
        attempts += 1;
        return attempts === 1
          ? {
              status: 409,
              body: {
                error: {
                  code: "CONFLICT",
                  message: "changed",
                  requestId: "r",
                  current: {
                    value: { name: "Plan A", businessName: "Their Co.", preparedBy: "Ana" },
                    lockVersion: 7,
                    updatedAt: new Date().toISOString(),
                    updatedBy: { ...ana, id: PAOLO, displayName: "Paolo Reyes" },
                  },
                },
              },
            }
          : { body: makePlanHome({ lockVersion: 8 }) };
      },
    },
  );
  await user.type(businessName(), "!");
  await user.tab();
  const dialog = await screen.findByRole("dialog", { name: "Someone updated this first" });
  await user.click(within(dialog).getByRole("button", { name: "Overwrite with mine" }));
  await waitFor(() => expect(patches(api)).toHaveLength(2));
  expect(patches(api)[1]?.body).toEqual({
    businessName: "Piaya Gift Box Co.!",
    lockVersion: 7,
    force: true,
  });
});

async function openRename(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "More actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Rename plan" }));
  return screen.findByRole("dialog", { name: "Rename plan" });
}

test("Rename plan sends the name with the lock and closes", async () => {
  const { api, user } = await openPlanHome(
    {},
    {
      [`PATCH ${PLAN_PATH}`]: () => ({ body: makePlanHome({ name: "Plan Z", lockVersion: 6 }) }),
    },
  );
  const dialog = await openRename(user);
  const name = within(dialog).getByRole("textbox", { name: /^Plan name/ });
  expect(name).toHaveValue("Plan A");
  await user.clear(name);
  await user.type(name, " Plan Z ");
  await user.click(within(dialog).getByRole("button", { name: "Rename" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Rename plan" })).toBeNull());
  expect(patches(api)).toHaveLength(1);
  expect(patches(api)[0]?.body).toEqual({ name: "Plan Z", lockVersion: 5 });
});

test("a name another plan uses is refused under the field and the sheet stays open", async () => {
  const { user } = await openPlanHome({}, { [`PATCH ${PLAN_PATH}`]: () => refusal("NAME_TAKEN") });
  const dialog = await openRename(user);
  const name = within(dialog).getByRole("textbox", { name: /^Plan name/ });
  await user.clear(name);
  await user.type(name, "Plan B");
  await user.click(within(dialog).getByRole("button", { name: "Rename" }));
  expect(await within(dialog).findByText("This name is already used.")).toBeInTheDocument();
  expect(name).toHaveAttribute("aria-invalid", "true");
  await user.type(name, "2");
  await waitFor(() => expect(within(dialog).queryByText("This name is already used.")).toBeNull());
});

test("an empty name is not sent", async () => {
  const { api, user } = await openPlanHome();
  const dialog = await openRename(user);
  await user.clear(within(dialog).getByRole("textbox", { name: /^Plan name/ }));
  expect(within(dialog).getByRole("button", { name: "Rename" })).toBeDisabled();
  expect(patches(api)).toHaveLength(0);
});

test("a failed rename shows the reason in the sheet", async () => {
  const { user } = await openPlanHome({}, { [`PATCH ${PLAN_PATH}`]: () => refusal("ARCHIVED") });
  const dialog = await openRename(user);
  await user.type(within(dialog).getByRole("textbox", { name: /^Plan name/ }), "2");
  await user.click(within(dialog).getByRole("button", { name: "Rename" }));
  expect(await within(dialog).findByText("Couldn't save — Retry")).toBeInTheDocument();
  expect(
    within(dialog).getByText("This is archived. Restore it to make changes."),
  ).toBeInTheDocument();
});

test("Archive plan archives through P3 and the plan turns read only", async () => {
  let archived = false;
  const { api, user } = await openPlanHome(
    {},
    {
      [`GET ${PLAN_PATH}`]: () => ({ body: makePlanHome({ archived }) }),
      [`POST ${PLAN_PATH}/archive`]: () => {
        archived = true;
        return { body: { id: PLAN, name: "Plan A", archived: true } };
      },
    },
  );
  await user.click(screen.getByRole("button", { name: "More actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Archive plan" }));
  await waitFor(() => expect(callsTo(api, "POST", `${PLAN_PATH}/archive`)).toHaveLength(1));
  expect(await screen.findByText("This plan is archived")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save version" })).toBeNull();
});

test("a refused archive shows why", async () => {
  const { user } = await openPlanHome(
    {},
    { [`POST ${PLAN_PATH}/archive`]: () => refusal("FORBIDDEN", 403) },
  );
  await user.click(screen.getByRole("button", { name: "More actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Archive plan" }));
  expect(await screen.findByText(/You don't have permission/)).toBeInTheDocument();
});
