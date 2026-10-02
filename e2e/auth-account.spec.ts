import { expect, test } from "./fixtures";
import {
  attemptLogIn,
  DEMO_PASSWORD,
  expectNoAxeViolations,
  logIn,
  operatorInvitationLink,
  query,
} from "./support";

test.describe.configure({ mode: "serial" });

const ANA = "ana@bcdx.example";

test.describe("log in and the guard", () => {
  test("a protected path asks for the log in and returns to it", async ({ page }) => {
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);
    await expectNoAxeViolations(page);
    await page.getByLabel("Email").fill(ANA);
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
  });

  test("a demo user lands in the last opened workspace", async ({ page }) => {
    await logIn(page, ANA);
    const [workspace] = await query<{ id: string }>(
      "select w.id from workspaces w where w.name = 'BCDX'",
    );
    await expect(page).toHaveURL(new RegExp(`/w/${workspace?.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("banner")).toContainText("Dashboard");
    await expectNoAxeViolations(page);
  });

  test("a wrong password shows the message and stays", async ({ page }) => {
    await attemptLogIn(page, ANA, "not-the-password");
    await expect(page.getByText("Email or password is incorrect")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("a blank form is stopped before it is sent", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("Required", { exact: true })).toHaveCount(2);
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password").fill("x");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("Enter a valid email address")).toBeVisible();
  });

  test("the landing page sends a signed-in person to the workspace and shows the log in to others", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Start a local business");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await logIn(page, ANA);
    await expect(page).toHaveURL(/\/w\//);
    await page.goto("/");
    await expect(page).toHaveURL(/\/w\//);
  });

  test("another person's workspace says there is no access", async ({ page }) => {
    const [other] = await query<{ id: string }>(
      "select id from workspaces where name = 'Kenji Mori''s workspace'",
    );
    await logIn(page, ANA);
    await page.goto(`/w/${other?.id}`);
    await expect(
      page.getByRole("heading", { name: "You don't have access to this" }),
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();
  });

  test("an unknown path inside the app says not found and keeps the navigation", async ({
    page,
  }) => {
    await logIn(page, ANA);
    await expect(page).toHaveURL(/\/w\//);
    await page.goto("/w/not-a-workspace/nothing-here");
    await expect(page.getByRole("heading", { name: "Not found. Check the link." })).toBeVisible();
  });
});

test.describe("the app frame", () => {
  test("the sidebar, the unread count and the workspace switcher", async ({ page }) => {
    await logIn(page, ANA);
    const nav = page.getByRole("navigation", { name: "Main menu" });
    for (const name of ["Dashboard", "Ideas", "Self Analysis", "Notifications", "Decision Log"]) {
      await expect(nav.getByRole("link", { name })).toBeVisible();
    }
    await expect(nav.getByRole("link", { name: "Settings" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Admin" })).toHaveCount(0);

    await page.getByRole("button", { name: /Switch workspace, current: BCDX/ }).click();
    const dialog = page.getByRole("dialog", { name: "Switch workspace" });
    await expect(dialog.getByRole("row", { name: /BCDX/ })).toBeVisible();
    await dialog.getByRole("row", { name: /Ana Villanueva's workspace/ }).click();
    await expect(
      page.getByRole("button", { name: /current: Ana Villanueva's workspace/ }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Settings" })).toBeVisible();
  });

  test("a new workspace can be created and opened, and the name must be filled", async ({
    page,
  }) => {
    await logIn(page, ANA);
    await page.getByRole("button", { name: /Switch workspace, current/ }).click();
    await page.getByRole("button", { name: "New workspace" }).click();
    const dialog = page.getByRole("dialog", { name: "New workspace" });
    await dialog.getByRole("button", { name: "Create workspace" }).click();
    await expect(dialog.getByText("Required")).toBeVisible();
    await dialog.getByRole("textbox", { name: "Name" }).fill("Cebu Bakery Team");
    await dialog.getByRole("button", { name: "Create workspace" }).click();
    await expect(page.getByRole("button", { name: /current: Cebu Bakery Team/ })).toBeVisible();
    await expect(page).toHaveURL(/\/w\//);
  });

  test("a Viewer has no Self Analysis and no Settings", async ({ page }) => {
    await logIn(page, "grace@advisor.example");
    await page.getByRole("button", { name: /Switch workspace, current/ }).click();
    await page.getByRole("dialog").getByRole("row", { name: /BCDX/ }).click();
    const nav = page.getByRole("navigation", { name: "Main menu" });
    await expect(nav.getByRole("link", { name: "Ideas" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Self Analysis" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("the tab bar and the More sheet replace the sidebar", async ({ page }) => {
    await logIn(page, ANA);
    const tabs = page.getByRole("navigation", { name: "Tab bar" });
    await expect(tabs.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main menu" })).toBeHidden();
    await tabs.getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog", { name: "More" });
    await expect(sheet.getByRole("link", { name: "Decision Log" })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Account" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Log out" })).toBeVisible();
    await sheet.getByRole("link", { name: "Account" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("link", { name: "Back" })).toBeVisible();
  });
});

test.describe("account settings", () => {
  test("display name, display mode and time zone", async ({ page }) => {
    await logIn(page, "paolo@bcdx.example");
    await page.goto("/account");
    await expectNoAxeViolations(page);

    await page.getByLabel("Display name").fill("Paolo G.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Profile saved")).toBeVisible();

    await page.getByRole("button", { name: /Display mode/ }).click();
    await page.getByRole("option", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByLabel("Display name")).toHaveValue("Paolo G.");

    await page.getByRole("button", { name: /Display mode/ }).click();
    await page.getByRole("option", { name: "System" }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  });

  test("the password can be changed and the new one logs in", async ({ page }) => {
    await logIn(page, "kenji@bcdx.example");
    await page.goto("/account");
    await page.getByLabel("Current password").fill("wrong-password-1");
    await page.getByLabel("New password", { exact: true }).fill("a-new-password-1");
    await page.getByLabel("Confirm new password").fill("a-new-password-1");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("The password is incorrect.")).toBeVisible();

    await page.getByLabel("Current password").fill(DEMO_PASSWORD);
    await page.getByLabel("Confirm new password").fill("different-1");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("The passwords don't match")).toBeVisible();

    await page.getByLabel("Confirm new password").fill("a-new-password-1");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Password changed")).toBeVisible();

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/$/);
    await logIn(page, "kenji@bcdx.example", "a-new-password-1");
    await expect(page).toHaveURL(/\/w\//);
  });

  test("leaving a team workspace", async ({ page }) => {
    await logIn(page, "paolo@bcdx.example");
    await page.goto("/account");
    await page.getByRole("button", { name: "Leave BCDX" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Leave", exact: true }).click();
    await expect(page.getByText("You left the workspace")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Leave/ })).toHaveCount(0);
  });

  test("the last Owner cannot leave", async ({ page }) => {
    await logIn(page, ANA);
    await page.goto("/account");
    await page.getByRole("button", { name: "Leave BCDX" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Leave", exact: true }).click();
    await expect(page.getByText("Make someone else Owner first")).toBeVisible();
  });
});

test.describe("invitations", () => {
  test("sign up from a team invitation, join, fill in the profile, and delete the account", async ({
    page,
  }) => {
    await page.goto("/invite/demo-invite-pending");
    await expect(page.getByText("You're invited to join BCDX")).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveValue("new.member@bcdx.example");
    await expect(page.getByLabel("Email")).toHaveAttribute("readonly", "");
    await expectNoAxeViolations(page);

    await page.getByLabel("Display name").fill("Nina Member");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter at least 8 characters")).toBeVisible();
    await page.getByLabel("Password").fill("nina-password-1");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/welcome\?step=invite&token=demo-invite-pending$/);
    await expect(page.getByRole("heading", { name: "BCDX" })).toBeVisible();
    await page.getByRole("button", { name: "Join" }).click();
    await expect(page).toHaveURL(/\/welcome\?step=profile$/);
    await expect(page.getByLabel("Display name")).toHaveValue("Nina Member");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/welcome\?step=done$/);
    await page.getByRole("button", { name: "Go to Dashboard" }).click();
    await expect(page.getByRole("button", { name: /current: BCDX/ })).toBeVisible();

    await page.goto("/account");
    await page.getByRole("button", { name: "Delete account" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete your account" });
    await dialog.getByLabel("Your email address").fill("someone.else@example.com");
    await dialog.getByLabel("Password").fill("nina-password-1");
    await dialog.getByRole("button", { name: "Delete account" }).click();
    await expect(dialog.getByText("The confirmation text doesn't match.")).toBeVisible();
    await dialog.getByLabel("Your email address").fill("new.member@bcdx.example");
    await dialog.getByLabel("Password").fill("not-my-password");
    await dialog.getByRole("button", { name: "Delete account" }).click();
    await expect(dialog.getByText("The password is incorrect.")).toBeVisible();
    await dialog.getByLabel("Password").fill("nina-password-1");
    await dialog.getByRole("button", { name: "Delete account" }).click();
    await expect(page).toHaveURL(/\/$/);

    await attemptLogIn(page, "new.member@bcdx.example", "nina-password-1");
    await expect(page.getByText("Email or password is incorrect")).toBeVisible();
  });

  test("an expired invitation says so", async ({ page }) => {
    await page.goto("/invite/demo-invite-expired");
    await expect(
      page.getByText(
        "This invitation is invalid or expired. Ask the person who invited you for a new one.",
      ),
    ).toBeVisible();
  });

  test("an operator invitation skips the invitation step and shows the Admin menu", async ({
    page,
  }) => {
    const link = operatorInvitationLink("first.operator@moonx.example");
    await page.goto(link);
    await page.getByLabel("Display name").fill("First Operator");
    await page.getByLabel("Password").fill("operator-password-1");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/welcome\?step=profile$/);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Go to Dashboard" }).click();
    await expect(
      page.getByRole("button", { name: /current: First Operator's workspace/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Main menu" }).getByRole("link", { name: "Admin" }),
    ).toBeVisible();
  });

  test("someone who already has an account logs in first and then lands on the invitation", async ({
    page,
    guest,
  }) => {
    await logIn(page, ANA);
    await expect(page).toHaveURL(/\/w\//);
    const [workspace] = await query<{ id: string }>(
      "select id from workspaces where name = 'BCDX'",
    );
    const created = await page.request.post(`/api/v1/workspaces/${workspace?.id}/invitations`, {
      data: { email: "admin@moonx.example", role: "member" },
    });
    expect(created.status()).toBe(201);
    const { link } = (await created.json()) as { link: string };

    const guestContext = await guest();
    const guestPage = await guestContext.newPage();
    await guestPage.goto(link);
    await expect(guestPage).toHaveURL(/\/login\?next=/);
    await guestPage.getByLabel("Email").fill("admin@moonx.example");
    await guestPage.getByLabel("Password").fill(DEMO_PASSWORD);
    await guestPage.getByRole("button", { name: "Log in" }).click();
    await expect(guestPage).toHaveURL(/\/welcome\?step=invite&token=/);
    await guestPage.getByRole("button", { name: "Join" }).click();
    await expect(guestPage).toHaveURL(/\/welcome\?step=profile$/);
  });

  test("a different account gets the invited address in the message", async ({ page, guest }) => {
    await logIn(page, ANA);
    const [workspace] = await query<{ id: string }>(
      "select id from workspaces where name = 'BCDX'",
    );
    const created = await page.request.post(`/api/v1/workspaces/${workspace?.id}/invitations`, {
      data: { email: "someone.new@example.com", role: "member" },
    });
    const { link } = (await created.json()) as { link: string };
    const token = link.split("/invite/")[1];

    const guestContext = await guest();
    const guestPage = await guestContext.newPage();
    await logIn(guestPage, "paolo@bcdx.example");
    await guestPage.goto(`/invite/${token}`);
    await expect(guestPage).toHaveURL(/\/welcome\?step=invite&token=/);
    await guestPage.getByRole("button", { name: "Join" }).click();
    await expect(
      guestPage.getByText(
        "This invitation was sent to someone.new@example.com. Log in with that email.",
      ),
    ).toBeVisible();
  });
});

test.describe("password reset", () => {
  test("a reset link signs the person in with the new password", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Reset your password" }),
    ).toBeVisible();
    await page.getByLabel("Email").fill("grace@advisor.example");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(/we sent a link to reset the password/)).toBeVisible();

    const [row] = await query<{ identifier: string }>(
      "select identifier from verifications where identifier like 'reset-password:%' order by created_at desc limit 1",
    );
    const token = row?.identifier.replace("reset-password:", "");
    await page.goto(`/reset-password?token=${token}`);
    await page.getByLabel("New password", { exact: true }).fill("grace-new-password-1");
    await page.getByLabel("Confirm new password").fill("grace-new-password-1");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page).toHaveURL(/\/w\//);
  });

  test("a link without a valid token asks for a new one", async ({ page }) => {
    await page.goto("/reset-password?token=not-a-real-token");
    await page.getByLabel("New password", { exact: true }).fill("grace-new-password-2");
    await page.getByLabel("Confirm new password").fill("grace-new-password-2");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(
      page.getByText("This link is invalid or has expired. Request a new one."),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
  });
});
