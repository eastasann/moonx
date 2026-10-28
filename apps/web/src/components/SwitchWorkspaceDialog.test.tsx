import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { ana, apiError, renderApp, stubApi } from "../test/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("M7 New workspace: a name the API refuses shows its reason under the field, until it changes (SDD 8.2)", async () => {
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
  expect(await within(dialog).findByText("Check the format")).toBeTruthy();
  // Not the small dialog of an unexpected failure (6.0.6), over M7.
  expect(screen.queryByRole("alertdialog")).toBeNull();
  await user.type(name, "s");
  await waitFor(() =>
    expect(within(dialog).queryByText("Check the format")).toBeNull(),
  );
  // Not the small dialog of an unexpected failure (6.0.6), over M7.
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(
    within(dialog)
      .getByRole("button", { name: "Create" })
      .hasAttribute("disabled"),
  ).toBe(false);
  expect(calls.filter(({ method }) => method === "POST")).toHaveLength(1);
});
