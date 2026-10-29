import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { ana, apiError, renderApp, stubApi } from "../test/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("M7 New workspace: a name the API refuses, Couldn't save with its reason and under the field too, until it changes (6.0.2, SDD 8.2)", async () => {
  const calls = stubApi(({ method, path }) => {
    if (method === "GET" && path === "/api/v1/me") return Response.json(ana);
    if (method === "POST" && path === "/api/v1/workspaces") {
      return apiError(422, "VALIDATION_FAILED", {
        details: [{ path: "name", code: "custom", message: "refused" }],
      });
    }
    if (path.startsWith("/api/v1/workspaces/"))
      return apiError(500, "INTERNAL");
    return undefined;
  });
  renderApp(`/w/${ana.lastWorkspaceId}?modal=switch-workspace`);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "New workspace" }),
  );
  const dialog = await screen.findByRole("dialog", { name: "New workspace" });
  const name = within(dialog).getByRole("textbox", { name: /Name/ });
  await user.type(name, "Night Market");
  await user.click(within(dialog).getByRole("button", { name: "Create" }));
  const alert = await within(dialog).findByRole("alert");
  expect(within(alert).getByText("Couldn't save")).toBeTruthy();
  expect(within(alert).getByText("Check the format")).toBeTruthy();
  expect(name.getAttribute("aria-invalid")).toBe("true");
  expect(within(dialog).getAllByText("Check the format")).toHaveLength(2);
  // Not the small dialog of an unexpected failure (6.0.6), over M7.
  expect(screen.queryByRole("alertdialog")).toBeNull();
  await user.type(name, "s");
  await waitFor(() =>
    expect(within(dialog).queryByText("Check the format")).toBeNull(),
  );
  expect(within(dialog).queryByText("Couldn't save")).toBeNull();
  expect(name.getAttribute("aria-invalid")).not.toBe("true");
  // Not the small dialog of an unexpected failure (6.0.6), over M7.
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(
    within(dialog)
      .getByRole("button", { name: "Create" })
      .hasAttribute("disabled"),
  ).toBe(false);
  expect(calls.filter(({ method }) => method === "POST")).toHaveLength(1);
});

const created = {
  id: "9e8d7c6b-1111-4111-8111-111111111111",
  name: "Night Market",
  isPersonal: false,
  currency: "PHP",
};

/** The API of M7's New workspace, W0 answered by `create` (a rejected promise is the network). */
function newWorkspaceApi(create: () => Response | Promise<Response>) {
  return stubApi(({ method, path }) => {
    if (method === "GET" && path === "/api/v1/me") return Response.json(ana);
    if (method === "POST" && path === "/api/v1/workspaces") return create();
    if (
      method === "GET" &&
      path === `/api/v1/workspaces/${created.id}/dashboard`
    )
      return apiError(500, "INTERNAL");
    return undefined;
  });
}

/** Opens M7's New workspace and sends "Night Market". */
async function createNightMarket() {
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "New workspace" }),
  );
  const dialog = await screen.findByRole("dialog", { name: "New workspace" });
  await user.type(
    within(dialog).getByRole("textbox", { name: /Name/ }),
    "Night Market",
  );
  await user.click(within(dialog).getByRole("button", { name: "Create" }));
  return { user, dialog };
}

const posts = (calls: { method: string; path: string; body: unknown }[]) =>
  calls
    .filter(
      ({ method, path }) => method === "POST" && path === "/api/v1/workspaces",
    )
    .map(({ body }) => body);

test("M7 New workspace, the network fails: Couldn't save and Retry in place, which sends the same name (3.8 M7)", async () => {
  let attempt = 0;
  const calls = newWorkspaceApi(() => {
    attempt += 1;
    return attempt === 1
      ? Promise.reject(new TypeError("Failed to fetch"))
      : Response.json(created, { status: 201 });
  });
  const router = renderApp(`/w/${ana.lastWorkspaceId}?modal=switch-workspace`);
  const { user, dialog } = await createNightMarket();
  const alert = await within(dialog).findByRole("alert");
  expect(alert.textContent).toContain("Couldn't save");
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(within(dialog).getByRole("textbox", { name: /Name/ })).toHaveProperty(
    "value",
    "Night Market",
  );
  await user.click(within(alert).getByRole("button", { name: "Retry" }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe(`/w/${created.id}`),
  );
  expect(posts(calls)).toEqual([
    { name: "Night Market", currency: "PHP" },
    { name: "Night Market", currency: "PHP" },
  ]);
});

test("M7 New workspace, unexpected: the small dialog with Something went wrong and its Ref; Retry sends again, Close closes M7", async () => {
  const calls = newWorkspaceApi(() => apiError(500, "INTERNAL"));
  const router = renderApp(`/w/${ana.lastWorkspaceId}?modal=switch-workspace`);
  const { user, dialog } = await createNightMarket();
  const small = await screen.findByRole("alertdialog", {
    name: /Something went wrong/,
  });
  expect(within(small).getByText("Ref: 8f14e45f")).toBeTruthy();
  expect(within(dialog).queryByRole("alert")).toBeNull();
  await user.click(within(small).getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(posts(calls)).toHaveLength(2));
  expect(posts(calls)[1]).toEqual({ name: "Night Market", currency: "PHP" });
  const again = await screen.findByRole("alertdialog", {
    name: /Something went wrong/,
  });
  await user.click(within(again).getByRole("button", { name: "Close" }));
  // M7 itself is closed, not back at its list of workspaces.
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(router.state.location.search).not.toHaveProperty("modal");
  expect(router.state.location.pathname).toBe(`/w/${ana.lastWorkspaceId}`);
});

test("M7 New workspace, a rate limit: its wait in place, not the small dialog (6.0.6 モーダルの共通の決まり)", async () => {
  newWorkspaceApi(() =>
    apiError(429, "RATE_LIMITED", { retryAfterSeconds: 60 }),
  );
  renderApp(`/w/${ana.lastWorkspaceId}?modal=switch-workspace`);
  const { dialog } = await createNightMarket();
  expect((await within(dialog).findByRole("alert")).textContent).toContain(
    "Too many attempts. Try again in 1 minute.",
  );
  expect(screen.queryByRole("alertdialog")).toBeNull();
});
