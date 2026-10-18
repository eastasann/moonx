import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ana, apiError, renderApp, stubApi } from "../test/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

const heading = () =>
  screen.findByRole("heading", {
    level: 1,
    name: "From idea to a plan you can show.",
  });

describe("1 Landing (design-spec 6.16・5章「認証」)", () => {
  test("signed out: what moonx does, by invitation, Log in; no way to sign up", async () => {
    stubApi(({ path }) =>
      path === "/api/v1/me" ? apiError(401, "UNAUTHENTICATED") : undefined,
    );
    const router = renderApp("/");
    await heading();
    expect(screen.getAllByRole("button", { name: "Log in" })).toHaveLength(3);
    expect(screen.getByText("moonx is by invitation.")).toBeTruthy();
    expect(screen.queryByText(/sign up/i)).toBeNull();
    expect(
      screen.getByRole("img", {
        name: "Example startup costs with two known rows, one Unknown row and one Empty row, and totals",
      }).textContent,
    ).toContain("₱145,000+");
    expect(document.title).toBe("Home · moonx");
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(router.state.location.pathname).toBe("/");
  });

  test("signed in: on to the workspace opened last", async () => {
    stubApi(({ path }) =>
      path === "/api/v1/me" ? Response.json(ana) : undefined,
    );
    const router = renderApp("/");
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/w/${ana.lastWorkspaceId}`),
    );
  });

  test("when asking who is signed in fails, 1 still opens", async () => {
    stubApi(({ path }) =>
      path === "/api/v1/me" ? apiError(500, "INTERNAL") : undefined,
    );
    const router = renderApp("/");
    await heading();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(router.state.location.pathname).toBe("/");
  });
});
