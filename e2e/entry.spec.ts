import AxeBuilder from "@axe-core/playwright";
import type { Me } from "@moonx/schemas";
import type { Page } from "@playwright/test";
import { WEB_ORIGIN } from "./env";
import {
  demo,
  expect,
  inviteToBcdx,
  linkMailedTo,
  mailsTo,
  signUpThroughApi,
  test,
  uniqueEmail,
  workspaceOf,
} from "./fixtures";

// 1 Landing, 2 Log in / Sign up / password reset, 3 Welcome and Log out (design-spec
// 6.16・5章・6.0.6), against the seeded demo data (design-spec 8.1) and accounts each test
// makes from its own invitation.

const phone = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
};

const INVALID_INVITATION =
  "This invitation is invalid or expired. Ask the person who invited you for a new one.";

async function expectNoAxeViolations(page: Page) {
  // A Button pending as its screen went (Sign up, Join) left React Aria's announcement of
  // its spinner, by the spinner's id, in the live region; React Aria clears it after
  // 7 seconds. The page is checked once it has.
  await expect(
    page.locator("[data-live-announcer] [aria-labelledby]"),
  ).toHaveCount(0, { timeout: 10_000 });
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(violations).toEqual([]);
}

/** The signed-in user of the page (U1). */
async function meOf(page: Page) {
  const response = await page.request.get("/api/v1/me");
  expect(response.ok()).toBe(true);
  return (await response.json()) as Me;
}

/** A user of their own, signed up from an invitation to BCDX not yet accepted. */
async function newAccount(workerIndex: number, label: string) {
  const email = uniqueEmail(label);
  const password = `${label}-password-2026`;
  const token = await inviteToBcdx(email, workerIndex);
  await signUpThroughApi(
    token,
    { displayName: "Test Person", password },
    workerIndex,
  );
  return { email, password, token };
}

async function logInWithForm(page: Page, email: string, password: string) {
  const form = page.getByRole("form", { name: "Log in" });
  await form.getByRole("textbox", { name: /Email/ }).fill(email);
  await form.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
}

test.describe("on a desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("1 Landing: what moonx does, by invitation, and Log in to 2", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "From idea to a plan you can show.",
      }),
    ).toBeVisible();
    await expect(page).toHaveTitle("Home · moonx");
    await expect(page.getByText("moonx is by invitation.")).toBeVisible();
    // No way to sign up: that starts from an invitation (design-spec 6.16).
    await expect(page.getByText(/sign up/i)).toHaveCount(0);
    await expectNoAxeViolations(page);
    // The top bar's: the first of the three.
    await page.getByRole("button", { name: "Log in" }).first().click();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/login`);
    await expect(page).toHaveTitle("Log in · moonx");
    await expectNoAxeViolations(page);
  });

  test("1 signed in goes on to the workspace opened last", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.viewer);
    await page.goto("/");
    await expect(page).toHaveURL(`${WEB_ORIGIN}/w/${me.lastWorkspaceId}`);
  });

  test("the invitation's link: sign up, 3 to BCDX's 5, then Log out to 1 and Log in to the workspace opened last", async ({
    page,
  }) => {
    const token = "demo-invite-pending";
    await page.goto(`/invite/${token}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Sign up" }),
    ).toBeVisible();
    await expect(page).toHaveTitle("Sign up · moonx");
    const form = page.getByRole("form", { name: "Sign up" });
    const email = form.getByRole("textbox", { name: /Email/ });
    await expect(email).toHaveValue("new.member@bcdx.example");
    await expect(email).toHaveAttribute("readonly", "");
    await expectNoAxeViolations(page);
    await form
      .getByRole("textbox", { name: /Display name/ })
      .fill("New Member");
    await form.getByLabel(/^Password/).fill("new-member-2026");
    await page.getByRole("button", { name: "Sign up", exact: true }).click();

    // ① of the three steps of a new account.
    await expect(page).toHaveURL(
      `${WEB_ORIGIN}/welcome?step=invite&token=${token}&new=1`,
    );
    await expect(page).toHaveTitle("Welcome · moonx");
    const steps = page.getByRole("list", { name: "Steps" });
    await expect(steps.getByRole("listitem")).toHaveText([
      /Invitation/,
      /Profile/,
      /Done/,
    ]);
    await expect(
      page.getByText(
        "Ana Villanueva invited you to join BCDX on moonx as Member.",
      ),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: "Join" }).click();

    // ② The name sign-up gave, which can still change.
    await expect(page).toHaveURL(/step=profile/);
    const name = page.getByRole("textbox", { name: /Display name/ });
    await expect(name).toHaveValue("New Member");
    await expect(page.getByRole("button", { name: "Add photo" })).toBeVisible();
    await expectNoAxeViolations(page);
    await name.fill("Nina Member");
    await page.getByRole("button", { name: "Continue" }).click();

    // ③ and on to the invitation's workspace.
    await expect(page).toHaveURL(/step=done/);
    await expect(
      page.getByRole("heading", { level: 2, name: "You're all set" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Go to Dashboard" }).click();
    const me = await meOf(page);
    expect(me.displayName).toBe("Nina Member");
    const bcdx = workspaceOf(me, "BCDX");
    const personal = workspaceOf(me, "New Member's workspace");
    expect(me.memberships.find((m) => m.workspace.id === bcdx.id)?.role).toBe(
      "member",
    );
    await expect(page).toHaveURL(`${WEB_ORIGIN}/w/${bcdx.id}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "BCDX" }),
    ).toBeVisible();

    // The personal workspace becomes the one opened last.
    await page.getByRole("button", { name: "BCDX, switch workspace" }).click();
    await page
      .getByRole("dialog", { name: "Switch workspace" })
      .getByRole("link", { name: /New Member's workspace/ })
      .click();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/w/${personal.id}`);
    await expect
      .poll(async () => (await meOf(page)).lastWorkspaceId)
      .toBe(personal.id);

    // Log out from the account's menu, to 1.
    await page.getByRole("button", { name: "Nina Member" }).click();
    await page.getByRole("menuitem", { name: "Log out" }).click();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/`);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "From idea to a plan you can show.",
      }),
    ).toBeVisible();
    expect((await page.request.get("/api/v1/me")).status()).toBe(401);

    // Log in again: the workspace opened last.
    await page.getByRole("button", { name: "Log in" }).first().click();
    await logInWithForm(page, "new.member@bcdx.example", "new-member-2026");
    await expect(page).toHaveURL(`${WEB_ORIGIN}/w/${personal.id}`);
  });

  test("the expired invitation: invalid or expired", async ({ page }) => {
    await page.goto("/invite/demo-invite-expired");
    await expect(
      page.getByRole("heading", { level: 1, name: INVALID_INVITATION }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("an account already there: the link asks to Log in, then ① alone and Join to 5", async ({
    page,
  }, testInfo) => {
    const { email, password, token } = await newAccount(
      testInfo.workerIndex,
      "existing",
    );
    await page.goto(`/invite/${token}`);
    await expect(page).toHaveURL(
      `${WEB_ORIGIN}/login?next=${encodeURIComponent(`/invite/${token}`)}`,
    );
    await logInWithForm(page, email, password);
    await expect(page).toHaveURL(
      `${WEB_ORIGIN}/welcome?step=invite&token=${token}`,
    );
    await expect(
      page.getByRole("list", { name: "Steps" }).getByRole("listitem"),
    ).toHaveCount(1);
    await page.getByRole("button", { name: "Join" }).click();
    await expect(page).toHaveURL(/\/w\/[\w-]+$/);
    const bcdx = workspaceOf(await meOf(page), "BCDX");
    await expect(page).toHaveURL(`${WEB_ORIGIN}/w/${bcdx.id}`);

    // The link again: accepted already, so 5 opens and the toast says so.
    await page.goto(`/invite/${token}`);
    await expect(page).toHaveURL(`${WEB_ORIGIN}/w/${bcdx.id}`);
    await expect(page.getByText("Already accepted")).toBeVisible();
  });

  test("the password reset: the mail, a new password, signed in to 5; the link once only", async ({
    page,
  }, testInfo) => {
    const { email } = await newAccount(testInfo.workerIndex, "reset");
    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/forgot-password`);
    await expectNoAxeViolations(page);
    await page.getByRole("textbox", { name: /Email/ }).fill(email);
    await page.getByRole("button", { name: "Send link" }).click();
    await expect(
      page.getByText(
        `If an account exists for ${email}, we sent a link to reset your password.`,
      ),
    ).toBeVisible();
    const link = await linkMailedTo(
      email,
      /https?:\/\/\S+\/reset-password\?token=\S+/,
    );
    expect((await mailsTo(email)).at(-1)?.subject).toBe(
      "Reset your moonx password",
    );

    // An address without an account reads the same.
    const unknown = uniqueEmail("nobody");
    await page.getByRole("textbox", { name: /Email/ }).fill(unknown);
    await page.getByRole("button", { name: "Send link" }).click();
    await expect(
      page.getByText(
        `If an account exists for ${unknown}, we sent a link to reset your password.`,
      ),
    ).toBeVisible();
    expect(await mailsTo(unknown)).toEqual([]);

    await page.goto(`${link.pathname}${link.search}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Choose a new password" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByLabel(/^New password/).fill("a-new-password-2026");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page).toHaveURL(/\/w\/[\w-]+$/);
    const me = await meOf(page);
    await expect(page).toHaveURL(
      `${WEB_ORIGIN}/w/${workspaceOf(me, "Test Person's workspace").id}`,
    );

    // Used once, the link is over, with the way to a new one: A7 tells when it is sent.
    await page.goto(`${link.pathname}${link.search}`);
    await page.getByLabel(/^New password/).fill("another-password-2026");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(
      page.getByText("This link has expired or was already used."),
    ).toBeVisible();
    await page.getByRole("link", { name: "Send a new link" }).click();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/forgot-password`);
  });

  test("a wrong password, and Google's sign-in from 2 and from the invitation", async ({
    page,
  }, testInfo) => {
    await page.goto("/login");
    await logInWithForm(page, demo.viewer, "not-the-password");
    await expect(page.getByRole("alert")).toHaveText(
      /Email or password is incorrect/,
    );

    // Google itself is checked on staging (Step 43); here A2's request and the way back.
    const sent: unknown[] = [];
    await page.route("**/api/auth/sign-in/social", async (route) => {
      sent.push(route.request().postDataJSON());
      await route.fulfill({
        json: {
          url: `${WEB_ORIGIN}/login?error=signup_disabled`,
          redirect: true,
        },
      });
    });
    await page.goto(`/login?next=${encodeURIComponent("/w/1")}`);
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page.getByRole("alert")).toHaveText(
      new RegExp(INVALID_INVITATION.replace(/\./g, "\\.")),
    );
    expect(sent[0]).toEqual({
      provider: "google",
      callbackURL: "/w/1",
      errorCallbackURL: "/login?next=%2Fw%2F1",
    });

    const token = await inviteToBcdx(
      uniqueEmail("google"),
      testInfo.workerIndex,
    );
    await page.goto(`/invite/${token}`);
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page).toHaveURL(/\/login\?error=signup_disabled/);
    expect(sent[1]).toEqual({
      provider: "google",
      callbackURL: `/welcome?step=invite&token=${token}&new=1`,
      errorCallbackURL: "/login",
      requestSignUp: true,
      additionalData: { invitationToken: token },
    });
  });
});

test.describe("on a phone", () => {
  test.use(phone);

  test("2: Log in held at the bottom across the width; 1 and 2 pass axe", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "From idea to a plan you can show.",
      }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    await page.goto("/login");
    const logIn = page.getByRole("button", { name: "Log in", exact: true });
    const box = await logIn.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(844 - 40);
    expect(box?.width ?? 0).toBeGreaterThan(390 - 2 * 32);
    await expectNoAxeViolations(page);
  });

  test("More's Log out goes to 1", async ({ page }, testInfo) => {
    const { email, password } = await newAccount(testInfo.workerIndex, "phone");
    await page.goto("/login");
    await logInWithForm(page, email, password);
    await expect(page).toHaveURL(/\/w\//);
    await page.getByRole("button", { name: "More" }).tap();
    await page.getByRole("menuitem", { name: "Log out" }).tap();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/`);
    expect((await page.request.get("/api/v1/me")).status()).toBe(401);
  });
});
