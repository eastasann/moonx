import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ana,
  apiError,
  authError,
  type Call,
  renderApp,
  stubApi,
} from "../test/api";

// M9 Sign in again (design-spec 3.8, SDD 8.2): how its sign-in fails.

afterEach(() => {
  vi.unstubAllGlobals();
});

const SIGN_IN = "/api/auth/sign-in/email";

/**
 * 4 Account, whose display name meets a lost session until M9 signs in; `signIn` answers
 * each A1 (a promise that rejects is the network failing).
 */
function lostSessionApi(signIn: (call: Call) => Response | Promise<Response>) {
  let signedIn = false;
  return stubApi((call) => {
    const { method, path } = call;
    if (method === "GET" && path === "/api/v1/me") return Response.json(ana);
    if (method === "PATCH" && path === "/api/v1/me") {
      return signedIn
        ? Response.json({ ...ana, displayName: "Ana V." })
        : apiError(401, "UNAUTHENTICATED");
    }
    if (method === "POST" && path === SIGN_IN) {
      return Promise.resolve(signIn(call)).then((answer) => {
        if (answer.ok) signedIn = true;
        return answer;
      });
    }
    return undefined;
  });
}

/** Types into 4's display name until the save meets the lost session, and signs in. */
async function signInFromM9(password = "the-right-password") {
  const user = userEvent.setup();
  const name = await screen.findByRole("textbox", { name: /^Display name/ });
  await user.clear(name);
  await user.type(name, "Ana V.");
  await user.tab();
  const m9 = await screen.findByRole("dialog", { name: "Sign in again" });
  await user.type(within(m9).getByLabelText(/^Password/), password);
  await user.click(within(m9).getByRole("button", { name: "Sign in" }));
  return { user, m9 };
}

const signIns = (calls: Call[]) =>
  calls.filter(({ method, path }) => method === "POST" && path === SIGN_IN);

describe("M9's failed sign-in (design-spec 3.8・6.0.6 モーダルの共通の決まり)", () => {
  test("the network: Couldn't save and Retry inside M9, which sends the same password", async () => {
    let attempt = 0;
    const calls = lostSessionApi(() => {
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new TypeError("Failed to fetch"))
        : Response.json({});
    });
    renderApp("/account");
    const { user, m9 } = await signInFromM9();
    const alert = await within(m9).findByRole("alert");
    expect(alert.textContent).toContain("Couldn't save");
    expect(alert.textContent).not.toContain("Something went wrong");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Sign in again" }),
      ).toBeNull(),
    );
    expect(signIns(calls).map(({ body }) => body)).toEqual([
      { email: ana.email, password: "the-right-password" },
      { email: ana.email, password: "the-right-password" },
    ]);
    // What was held went out once signed in.
    await waitFor(() =>
      expect(
        calls.filter(
          ({ method, path }) => method === "PATCH" && path === "/api/v1/me",
        ),
      ).toHaveLength(2),
    );
  });

  test("unexpected: the small dialog with its Ref and Retry, which sends again", async () => {
    let attempt = 0;
    const calls = lostSessionApi(() => {
      attempt += 1;
      return attempt === 1
        ? authError(500, "INTERNAL", { "x-request-id": "3c9d2e7a-0000" })
        : Response.json({});
    });
    renderApp("/account");
    const { user, m9 } = await signInFromM9();
    const small = await screen.findByRole("alertdialog", {
      name: /Something went wrong/,
    });
    expect(within(small).getByText("Ref: 3c9d2e7a")).toBeTruthy();
    expect(within(m9).queryByText("Something went wrong")).toBeNull();
    await user.click(within(small).getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Sign in again" }),
      ).toBeNull(),
    );
    expect(signIns(calls)).toHaveLength(2);
  });

  test("unexpected, closed: Close closes M9 and keeps the input held, on this page", async () => {
    const calls = lostSessionApi(() =>
      authError(500, "INTERNAL", { "x-request-id": "3c9d2e7a-0000" }),
    );
    const router = renderApp("/account");
    const { user } = await signInFromM9();
    const small = await screen.findByRole("alertdialog", {
      name: /Something went wrong/,
    });
    await user.click(within(small).getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Sign in again" }),
      ).toBeNull(),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(router.state.location.pathname).toBe("/account");
    expect(
      screen.getByRole("textbox", { name: /^Display name/ }),
    ).toHaveProperty("value", "Ana V.");
    expect(signIns(calls)).toHaveLength(1);
  });

  test("M9's own words stay: a wrong password under its field, a rate limit inside it", async () => {
    let attempt = 0;
    lostSessionApi(() => {
      attempt += 1;
      return attempt === 1
        ? authError(401, "INVALID_EMAIL_OR_PASSWORD")
        : authError(429, "RATE_LIMITED", { "x-retry-after": "60" });
    });
    renderApp("/account");
    const { user, m9 } = await signInFromM9("wrong-password");
    expect(await within(m9).findByText("Password is incorrect")).toBeTruthy();
    expect(within(m9).queryByRole("alert")).toBeNull();
    await user.type(within(m9).getByLabelText(/^Password/), "!");
    await user.click(within(m9).getByRole("button", { name: "Sign in" }));
    expect(
      await within(m9).findByText("Too many attempts. Try again in 1 minute."),
    ).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Sign in again" })).toBeTruthy();
  });

  test("a suspended account: the input dropped, on to 2 with its words", async () => {
    lostSessionApi(() => authError(403, "ACCOUNT_SUSPENDED"));
    const router = renderApp("/account");
    await signInFromM9();
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(router.state.location.search).toEqual({
      next: "/account",
      error: "ACCOUNT_SUSPENDED",
    });
    expect(await screen.findByText("This account is suspended")).toBeTruthy();
  });
});
