import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ana, authError, renderApp, stubApi } from "../test/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("2 Forgot password? (design-spec 6.16)", () => {
  test("the address by 6.0.8, then the answer that tells nothing of the account", async () => {
    const calls = stubApi(({ path }) =>
      path === "/api/auth/request-password-reset"
        ? Response.json({ status: true })
        : undefined,
    );
    renderApp("/forgot-password");
    const user = userEvent.setup();
    const email = await screen.findByRole("textbox", { name: /Email/ });
    const send = screen.getByRole("button", { name: "Send link" });
    await user.type(email, "ana@");
    await user.tab();
    expect(screen.getByText("Enter an email address")).toBeTruthy();
    expect(send.hasAttribute("disabled")).toBe(true);
    await user.type(email, "bcdx.example");
    await user.click(send);
    expect(
      await screen.findByText(
        "If an account exists for ana@bcdx.example, we sent a link to reset your password.",
      ),
    ).toBeTruthy();
    expect(
      calls.filter(({ path }) => path === "/api/auth/request-password-reset"),
    ).toHaveLength(1);
    expect(document.title).toBe("Reset your password · moonx");
  });
});

describe("2 Choose a new password (design-spec 6.16)", () => {
  const TOKEN = "j9z01DSDoew2CF97psMIjefz";

  test("without a token in the link: expired, and the way to a new one", async () => {
    stubApi(() => undefined);
    renderApp("/reset-password");
    expect(
      await screen.findByText("This link has expired or was already used."),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Send a new link" })
        .getAttribute("href"),
    ).toBe("/forgot-password");
    expect(screen.queryByRole("button", { name: "Save password" })).toBeNull();
  });

  test("the password by 6.0.8; a link used or expired reads the same once sent", async () => {
    stubApi(({ path }) =>
      path === "/api/auth/reset-password"
        ? authError(400, "INVALID_TOKEN")
        : undefined,
    );
    renderApp(`/reset-password?token=${TOKEN}`);
    const user = userEvent.setup();
    const password = await screen.findByLabelText(/^New password/);
    await user.type(password, "short");
    await user.tab();
    expect(screen.getByText("Use at least 8 characters")).toBeTruthy();
    await user.type(password, "-but-long-now");
    await user.click(screen.getByRole("button", { name: "Save password" }));
    expect(
      await screen.findByText("This link has expired or was already used."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Send a new link" })).toBeTruthy();
  });

  test("a suspended account", async () => {
    stubApi(({ path }) =>
      path === "/api/auth/reset-password"
        ? authError(403, "ACCOUNT_SUSPENDED")
        : undefined,
    );
    renderApp(`/reset-password?token=${TOKEN}`);
    const user = userEvent.setup();
    await user.type(
      await screen.findByLabelText(/^New password/),
      "a-new-password",
    );
    await user.click(screen.getByRole("button", { name: "Save password" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "This account is suspended",
    );
  });

  test("the API refusing the password: the reason under the field (SDD 8.2)", async () => {
    stubApi(({ path }) =>
      path === "/api/auth/reset-password"
        ? authError(422, "VALIDATION_FAILED")
        : undefined,
    );
    renderApp(`/reset-password?token=${TOKEN}`);
    const user = userEvent.setup();
    const form = await screen.findByRole("form", {
      name: "Choose a new password",
    });
    await user.type(
      within(form).getByLabelText(/^New password/),
      "a-new-password",
    );
    await user.click(screen.getByRole("button", { name: "Save password" }));
    expect(await within(form).findByText("Check the format")).toBeTruthy();
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });

  test("set and signed in: on to 5, once only, though asking who it is fails", async () => {
    const calls = stubApi(({ path }) => {
      if (path === "/api/auth/reset-password") return Response.json({});
      if (path === "/api/v1/me") return Response.json(ana);
      return undefined;
    });
    const router = renderApp(`/reset-password?token=${TOKEN}`);
    const user = userEvent.setup();
    await user.type(
      await screen.findByLabelText(/^New password/),
      "a-new-password",
    );
    await user.keyboard("{Enter}{Enter}");
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/w/${ana.lastWorkspaceId}`),
    );
    expect(
      calls.filter(({ path }) => path === "/api/auth/reset-password"),
    ).toHaveLength(1);
  });
});
