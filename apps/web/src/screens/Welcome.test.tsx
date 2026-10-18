import type { InvitationPreview } from "@moonx/schemas";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ana, apiError, authError, renderApp, stubApi } from "../test/api";
import { stepsOf } from "./Welcome";

afterEach(() => {
  vi.unstubAllGlobals();
});

const TOKEN = "Zm9vYmFyYmF6cXV4cXV1eHF1dXhxdXV4cXV1eHF1dXg";

const invitation: InvitationPreview = {
  status: "pending",
  email: "new.member@bcdx.example",
  workspace: { id: "7c9e6679-7425-40de-944b-e07fc1f90ae7", name: "BCDX" },
  role: "member",
  invitedBy: { displayName: "Ana Villanueva" },
  expiresAt: "2026-10-25T00:00:00.000Z",
  accountExists: false,
};

describe("stepsOf: the steps of a visit to 3 (design-spec 6.16)", () => {
  test("a new account from an invitation to a workspace: ① ② ③", () => {
    expect(stepsOf(invitation, true)).toEqual(["invite", "profile", "done"]);
  });

  test("a new account from an invitation without one: ② ③", () => {
    expect(
      stepsOf({ ...invitation, workspace: null, role: null }, true),
    ).toEqual(["profile", "done"]);
    expect(stepsOf(undefined, false)).toEqual(["profile", "done"]);
  });

  test("an account that was there already: ① alone", () => {
    expect(stepsOf(invitation, false)).toEqual(["invite"]);
    expect(stepsOf({ ...invitation, workspace: null }, false)).toEqual([
      "invite",
    ]);
  });
});

describe("3 Welcome ① (design-spec 6.16)", () => {
  test("the invitation, who sent it, and Join", async () => {
    stubApi(({ path }) => {
      if (path === "/api/v1/me") {
        return Response.json({ ...ana, email: invitation.email });
      }
      if (path === `/api/v1/invitations/by-token/${TOKEN}`) {
        return Response.json(invitation);
      }
      return undefined;
    });
    renderApp(`/welcome?step=invite&token=${TOKEN}&new=1`);
    expect(
      await screen.findByText(
        "Ana Villanueva invited you to join BCDX on moonx as Member.",
      ),
    ).toBeTruthy();
    const steps = screen.getByRole("list", { name: "Steps" });
    expect(
      within(steps)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["1Invitation", "2Profile", "3Done"]);
    expect(screen.getByRole("button", { name: "Join" })).toBeTruthy();
    expect(document.title).toBe("Welcome · moonx");
  });

  test("signed in with another address: the invitation's address and Log out, no Join", async () => {
    stubApi(({ path }) => {
      if (path === "/api/v1/me") return Response.json(ana);
      if (path === `/api/v1/invitations/by-token/${TOKEN}`) {
        return Response.json(invitation);
      }
      return undefined;
    });
    renderApp(`/welcome?step=invite&token=${TOKEN}`);
    expect(
      await screen.findByText(
        "This invitation was sent to new.member@bcdx.example. Log in with that email.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Log out" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Join" })).toBeNull();
    // An account that was there already has ① alone.
    expect(
      within(screen.getByRole("list", { name: "Steps" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(1);
  });

  test("an invitation no longer valid", async () => {
    stubApi(({ path }) => {
      if (path === "/api/v1/me") return Response.json(ana);
      if (path === `/api/v1/invitations/by-token/${TOKEN}`) {
        return apiError(410, "INVITATION_INVALID");
      }
      return undefined;
    });
    renderApp(`/welcome?step=invite&token=${TOKEN}`);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "This invitation is invalid or expired. Ask the person who invited you for a new one.",
      }),
    ).toBeTruthy();
  });
});

test("a token that cannot be an invitation's is refused before the API is asked", async () => {
  const calls = stubApi(({ path }) =>
    path === "/api/v1/me" ? Response.json(ana) : undefined,
  );
  renderApp("/welcome?step=invite&token=..");
  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "This invitation is invalid or expired. Ask the person who invited you for a new one.",
    }),
  ).toBeTruthy();
  expect(calls.some(({ path }) => path.includes("/invitations"))).toBe(false);
});

describe("2 Sign up from an invitation (design-spec 6.16)", () => {
  function signedOut() {
    return stubApi(({ method, path }) => {
      if (path === "/api/v1/me") return apiError(401, "UNAUTHENTICATED");
      if (
        method === "GET" &&
        path === `/api/v1/invitations/by-token/${TOKEN}`
      ) {
        return Response.json(invitation);
      }
      if (path === `/api/v1/invitations/by-token/${TOKEN}/sign-up`) {
        return apiError(422, "VALIDATION_FAILED");
      }
      return undefined;
    });
  }

  test("the invitation's address, fixed; the name and the password by 6.0.8", async () => {
    const calls = signedOut();
    renderApp(`/invite/${TOKEN}`);
    const user = userEvent.setup();
    const form = await screen.findByRole("form", { name: "Sign up" });
    const email = within(form).getByRole("textbox", { name: /Email/ });
    expect((email as HTMLInputElement).value).toBe("new.member@bcdx.example");
    expect(email.hasAttribute("readonly")).toBe(true);
    const name = within(form).getByRole("textbox", { name: /Display name/ });
    await user.type(name, "x".repeat(61));
    await user.tab();
    expect(form.textContent).toContain("Too long. Shorten to 60 characters.");
    const signUp = screen.getByRole("button", { name: "Sign up" });
    expect(signUp.hasAttribute("disabled")).toBe(true);
    await user.clear(name);
    await user.type(name, "New Member");
    await user.type(
      within(form).getByLabelText(/^Password/),
      "a-long-password",
    );
    await waitFor(() => expect(signUp.hasAttribute("disabled")).toBe(false));
    await user.click(signUp);
    await screen.findByRole("alert");
    const sent = calls.find(({ path }) => path.endsWith("/sign-up"))?.body;
    expect(sent).toMatchObject({
      displayName: "New Member",
      password: "a-long-password",
    });
    expect(typeof (sent as { timezone: unknown }).timezone).toBe("string");
  });

  test("an invitation no longer valid", async () => {
    stubApi(({ path }) => {
      if (path === "/api/v1/me") return apiError(401, "UNAUTHENTICATED");
      if (path === `/api/v1/invitations/by-token/${TOKEN}`) {
        return apiError(410, "INVITATION_INVALID");
      }
      return undefined;
    });
    renderApp(`/invite/${TOKEN}`);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "This invitation is invalid or expired. Ask the person who invited you for a new one.",
      }),
    ).toBeTruthy();
  });

  test("an account with the address: Log in, then back to the link", async () => {
    stubApi(({ path }) => {
      if (path === "/api/v1/me") return apiError(401, "UNAUTHENTICATED");
      if (path === `/api/v1/invitations/by-token/${TOKEN}`) {
        return Response.json({ ...invitation, accountExists: true });
      }
      return undefined;
    });
    const router = renderApp(`/invite/${TOKEN}`);
    await waitFor(() =>
      expect(router.state.location.href).toBe(
        `/login?next=${encodeURIComponent(`/invite/${TOKEN}`)}`,
      ),
    );
  });
});

describe("3 Welcome: on to 5 (design-spec 6.16)", () => {
  const bcdx = invitation.workspace?.id ?? "";
  const member = { ...ana, email: invitation.email };

  test("a member already: 5 opens and the toast says so", async () => {
    const calls = stubApi(({ method, path }) => {
      if (method === "GET" && path === "/api/v1/me")
        return Response.json(member);
      if (path === `/api/v1/invitations/by-token/${TOKEN}`) {
        return Response.json(invitation);
      }
      if (path === `/api/v1/invitations/by-token/${TOKEN}/accept`) {
        return Response.json({ workspaceId: bcdx, alreadyMember: true });
      }
      return undefined;
    });
    const router = renderApp(`/welcome?step=invite&token=${TOKEN}`);
    await userEvent.click(await screen.findByRole("button", { name: "Join" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/w/${bcdx}`),
    );
    expect(await screen.findByText("You're already a member")).toBeTruthy();
    // The role stays as it was: nothing but U6 was sent.
    expect(calls.filter(({ method }) => method !== "GET")).toHaveLength(1);
  });

  test("accepted already: 5 opens without a Join, and the toast says so", async () => {
    stubApi(({ path }) => {
      if (path === "/api/v1/me") return Response.json(member);
      if (path === `/api/v1/invitations/by-token/${TOKEN}`) {
        return Response.json({ ...invitation, status: "accepted" });
      }
      return undefined;
    });
    const router = renderApp(`/welcome?step=invite&token=${TOKEN}`);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/w/${bcdx}`),
    );
    expect(await screen.findByText("Already accepted")).toBeTruthy();
  });

  test("Join of a new account: the workspace becomes the one opened last, then ②", async () => {
    const calls = stubApi(({ method, path }) => {
      if (path === "/api/v1/me") {
        return Response.json(
          method === "PATCH"
            ? { ...member, lastWorkspaceId: bcdx }
            : {
                ...member,
                lastWorkspaceId: "11111111-1111-4111-8111-111111111111",
              },
        );
      }
      if (path === `/api/v1/invitations/by-token/${TOKEN}`) {
        return Response.json(invitation);
      }
      if (path === `/api/v1/invitations/by-token/${TOKEN}/accept`) {
        return Response.json({ workspaceId: bcdx, alreadyMember: false });
      }
      return undefined;
    });
    const router = renderApp(`/welcome?step=invite&token=${TOKEN}&new=1`);
    await userEvent.click(await screen.findByRole("button", { name: "Join" }));
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ step: "profile" }),
    );
    expect(calls.find(({ method }) => method === "PATCH")?.body).toEqual({
      lastWorkspaceId: bcdx,
    });
  });

  test("Join failing on the network: Couldn't save and Retry", async () => {
    stubApi(({ path }) => {
      if (path === "/api/v1/me") return Response.json(member);
      if (path === `/api/v1/invitations/by-token/${TOKEN}`) {
        return Response.json(invitation);
      }
      if (path === `/api/v1/invitations/by-token/${TOKEN}/accept`) {
        throw new TypeError("Failed to fetch");
      }
      return undefined;
    });
    renderApp(`/welcome?step=invite&token=${TOKEN}`);
    await userEvent.click(await screen.findByRole("button", { name: "Join" }));
    // Toasts of the tests before may still be up: the app's queue is one for all.
    const words = await screen.findByText("Couldn't save");
    const alert = words.closest<HTMLElement>('[role="alert"]');
    if (alert === null) throw new Error("not in an alert");
    expect(alert.textContent).toContain("Couldn't save");
    expect(within(alert).getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});

describe("3 Welcome ② (design-spec 6.16・6.0.8)", () => {
  const profile = (
    answer: (path: string, method: string) => Response | undefined,
  ) =>
    stubApi(({ method, path }) => {
      if (method === "GET" && path === "/api/v1/me") return Response.json(ana);
      return answer(path, method);
    });

  test("the name of sign-up, its rule, and the photo's size checked before it is sent", async () => {
    const calls = profile(() => undefined);
    renderApp("/welcome?step=profile");
    const user = userEvent.setup();
    const name = await screen.findByRole("textbox", { name: /Display name/ });
    expect((name as HTMLInputElement).value).toBe("Ana Villanueva");
    await user.type(name, "x".repeat(60));
    await user.tab();
    expect(
      screen.getByText("Too long. Shorten to 60 characters."),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Continue" }).hasAttribute("disabled"),
    ).toBe(true);
    const photo =
      document.querySelector<HTMLInputElement>('input[type="file"]');
    if (photo === null) throw new Error("no file input");
    await user.upload(
      photo,
      new File([new Uint8Array(5_000_001)], "big.png", { type: "image/png" }),
    );
    expect(
      await screen.findByText("This photo is too large. Use one under 5 MB."),
    ).toBeTruthy();
    expect(calls.some(({ path }) => path === "/api/v1/me/avatar")).toBe(false);
  });

  test("a photo the API cannot read as one", async () => {
    profile((path) =>
      path === "/api/v1/me/avatar"
        ? apiError(422, "VALIDATION_FAILED", {
            details: [
              { path: "file", code: "custom", message: "not an image" },
            ],
          })
        : undefined,
    );
    renderApp("/welcome?step=profile");
    const photo = await waitFor(() => {
      const input =
        document.querySelector<HTMLInputElement>('input[type="file"]');
      if (input === null) throw new Error("no file input yet");
      return input;
    });
    await userEvent.upload(
      photo,
      new File(["not a picture"], "a.png", { type: "image/png" }),
    );
    expect(
      await screen.findByText("Use a JPEG, PNG or WebP image."),
    ).toBeTruthy();
  });

  test("Continue saves the name and the device's time zone; a refused name shows under it", async () => {
    const calls = profile((path, method) =>
      path === "/api/v1/me" && method === "PATCH"
        ? apiError(422, "VALIDATION_FAILED", {
            details: [
              { path: "displayName", code: "custom", message: "refused" },
            ],
          })
        : undefined,
    );
    renderApp("/welcome?step=profile");
    await userEvent.click(
      await screen.findByRole("button", { name: "Continue" }),
    );
    expect(await screen.findByText("Check the format")).toBeTruthy();
    const sent = calls.find(({ method }) => method === "PATCH")?.body as {
      displayName: string;
      timezone: string;
    };
    expect(sent.displayName).toBe("Ana Villanueva");
    expect(typeof sent.timezone).toBe("string");
  });
});

describe("Log out (design-spec 5章「共通ナビ」)", () => {
  /** Ana on her dashboard (its blocks failing, which the frame survives) until A4 works. */
  const dashboard = (signOut: () => Response) => {
    let isSignedIn = true;
    return stubApi(({ method, path }) => {
      if (path === "/api/auth/sign-out") {
        const answer = signOut();
        if (answer.ok || answer.status === 401) isSignedIn = false;
        return answer;
      }
      if (method === "GET" && path === "/api/v1/me") {
        return isSignedIn
          ? Response.json(ana)
          : apiError(401, "UNAUTHENTICATED");
      }
      if (path.startsWith("/api/v1/workspaces/")) {
        return apiError(500, "INTERNAL");
      }
      return undefined;
    });
  };

  test("the API not ending the session: the user stays; the toast gives the Ref and Retry", async () => {
    const calls = dashboard(() => {
      const failed = authError(500, "INTERNAL", {
        "x-request-id": "5ca1ab1e-0000-4000-8000-000000000000",
      });
      return failed;
    });
    const router = renderApp(`/w/${ana.lastWorkspaceId}`);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Ana Villanueva" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Log out" }));
    const words = await screen.findByText(
      "Something went wrong. Ref: 5ca1ab1e",
    );
    const toast = words.closest<HTMLElement>('[role="alertdialog"]');
    if (toast === null) throw new Error("not in a toast");
    expect(router.state.location.pathname).toBe(`/w/${ana.lastWorkspaceId}`);
    await user.click(within(toast).getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(
        calls.filter(({ path }) => path === "/api/auth/sign-out"),
      ).toHaveLength(2),
    );
  });

  test("no session left (401) is signed out all the same: on to 1", async () => {
    dashboard(() => authError(401, "UNAUTHENTICATED"));
    const router = renderApp(`/w/${ana.lastWorkspaceId}`);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Ana Villanueva" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Log out" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
});
