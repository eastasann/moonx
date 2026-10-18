import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ana, apiError, authError, renderApp, stubApi } from "../test/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

const form = () => screen.getByRole("form", { name: "Log in" });
const field = (name: RegExp) => within(form()).getByRole("textbox", { name });
const password = () => within(form()).getByLabelText(/^Password/);
const logIn = () => screen.getByRole("button", { name: "Log in" });

/** Signed out until A1 signs in; U1 answers Ana after that. */
function signedOutApi(signIn: () => Response) {
  let isSignedIn = false;
  return stubApi(({ method, path }) => {
    if (method === "POST" && path === "/api/auth/sign-in/email") {
      const answer = signIn();
      isSignedIn = answer.ok;
      return answer;
    }
    if (path === "/api/v1/me") {
      return isSignedIn ? Response.json(ana) : apiError(401, "UNAUTHENTICATED");
    }
    return undefined;
  });
}

describe("2 Log in (design-spec 6.16)", () => {
  test("the input rules of 6.0.8 under the fields, Log in held until they pass", async () => {
    signedOutApi(() => Response.json({}));
    renderApp("/login");
    const user = userEvent.setup();
    await screen.findByRole("heading", { level: 1, name: "Log in" });
    expect(logIn().hasAttribute("disabled")).toBe(true);
    await user.type(field(/Email/), "ana@bcdx");
    await user.type(password(), "short");
    await user.tab();
    expect(form().textContent).toContain("Enter an email address");
    expect(form().textContent).toContain("Use at least 8 characters");
    expect(logIn().hasAttribute("disabled")).toBe(true);
    await user.type(field(/Email/), ".example");
    await user.type(password(), "-enough");
    await waitFor(() => expect(logIn().hasAttribute("disabled")).toBe(false));
    expect(document.title).toBe("Log in · moonx");
  });

  test("a wrong password: Email or password is incorrect, the input kept", async () => {
    const calls = signedOutApi(() =>
      authError(401, "INVALID_EMAIL_OR_PASSWORD"),
    );
    renderApp("/login");
    const user = userEvent.setup();
    await user.type(
      await screen.findByRole("textbox", { name: /Email/ }),
      "ana@bcdx.example",
    );
    await user.type(password(), "not-the-password");
    await user.click(logIn());
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Email or password is incorrect",
    );
    expect((field(/Email/) as HTMLInputElement).value).toBe("ana@bcdx.example");
    expect(
      calls.find(({ path }) => path === "/api/auth/sign-in/email")?.body,
    ).toEqual({
      email: "ana@bcdx.example",
      password: "not-the-password",
    });
  });

  test("too many attempts: the wait from X-Retry-After", async () => {
    signedOutApi(() =>
      authError(429, "RATE_LIMITED", { "x-retry-after": "60" }),
    );
    renderApp("/login");
    const user = userEvent.setup();
    await user.type(
      await screen.findByRole("textbox", { name: /Email/ }),
      "ana@bcdx.example",
    );
    await user.type(password(), "moonx-demo-2026");
    await user.click(logIn());
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Too many attempts. Try again in 1 minute.",
    );
  });

  test("signed in, it goes back to next", async () => {
    signedOutApi(() => Response.json({ redirect: false }));
    const router = renderApp(
      `/login?next=${encodeURIComponent("/no-such-screen?x=1")}`,
    );
    const user = userEvent.setup();
    await user.type(
      await screen.findByRole("textbox", { name: /Email/ }),
      "ana@bcdx.example",
    );
    await user.type(password(), "moonx-demo-2026");
    await user.click(logIn());
    await waitFor(() =>
      expect(router.state.location.href).toBe("/no-such-screen?x=1"),
    );
  });

  test("a next of another site is not followed: the last workspace instead", async () => {
    signedOutApi(() => Response.json({ redirect: false }));
    const router = renderApp(
      `/login?next=${encodeURIComponent("//evil.example/")}`,
    );
    const user = userEvent.setup();
    await user.type(
      await screen.findByRole("textbox", { name: /Email/ }),
      "ana@bcdx.example",
    );
    await user.type(password(), "moonx-demo-2026");
    await user.click(logIn());
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/w/${ana.lastWorkspaceId}`),
    );
  });

  test.each([
    ["ACCOUNT_SUSPENDED", "This account is suspended"],
    [
      "signup_disabled",
      "This invitation is invalid or expired. Ask the person who invited you for a new one.",
    ],
    [
      "INVITATION_REQUIRED",
      "This invitation is invalid or expired. Ask the person who invited you for a new one.",
    ],
  ])("came back with %s", async (error, words) => {
    signedOutApi(() => Response.json({}));
    renderApp(`/login?error=${error}`);
    expect((await screen.findByRole("alert")).textContent).toContain(words);
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  test("came back with another error: Something went wrong, the Ref of the request, Retry with Google", async () => {
    const calls = signedOutApi(() => Response.json({}));
    renderApp(
      "/login?error=unable_to_create_user&requestId=0a1b2c3d-4e5f-6789-abcd-ef0123456789&next=%2Fw%2F1",
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Something went wrong");
    expect(alert.textContent).toContain("Ref: 0a1b2c3d");
    // Google's sign-in starts again from Retry (A2), and goes back to next after.
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(
        calls.find(({ path }) => path === "/api/auth/sign-in/social")?.body,
      ).toEqual({
        provider: "google",
        callbackURL: "/w/1",
        errorCallbackURL: "/login?next=%2Fw%2F1",
      }),
    );
  });
});
