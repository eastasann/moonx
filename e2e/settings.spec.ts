import AxeBuilder from "@axe-core/playwright";
import type { Me, Workspace } from "@moonx/schemas";
import type { Browser, Page } from "@playwright/test";
import { WEB_ORIGIN } from "./env";
import {
  demo,
  expect,
  linkMailedTo,
  newAccount,
  nextAddress,
  test,
  uniqueEmail,
  workspaceOf,
} from "./fixtures";

// 4 Account and 9 Workspace Settings (design-spec 6.16・5章): an Owner invites from 9 and
// the invited person signs up from the mail's link and joins; an account is deleted from
// 4, which leaves it on 1 and unable to log in. Each test makes its own accounts.

const phone = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
};

async function expectNoAxeViolations(page: Page) {
  // At the page's end: a row cut by the fold half under a phone's fixed TabBar is
  // reported by axe's target-size rule wherever the fold falls.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  // A pending Button's spinner leaves React Aria's announcement in the live region for
  // 7 seconds; the page is checked once it has gone.
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

/** A team workspace of the page's user (W0), its Owner. */
async function newWorkspace(page: Page, name: string) {
  const created = await page.request.post("/api/v1/workspaces", {
    data: { name },
    headers: { Origin: WEB_ORIGIN },
  });
  expect(created.status(), await created.text()).toBe(201);
  return (await created.json()) as Workspace;
}

/** A browser of its own, as someone else on another device. */
async function otherBrowser(browser: Browser, workerIndex: number) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { "X-Forwarded-For": nextAddress(workerIndex) },
  });
  return { context, page: await context.newPage() };
}

async function logInWithForm(page: Page, email: string, password: string) {
  const form = page.getByRole("form", { name: "Log in" });
  await form.getByRole("textbox", { name: /Email/ }).fill(email);
  await form.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
}

test.describe("on a desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("9: invite from Workspace Settings; the invited person signs up from the link and joins", async ({
    page,
    browser,
    signIn,
  }, testInfo) => {
    const owner = await newAccount(testInfo.workerIndex, "settings-owner");
    await signIn(owner.email, owner.password);
    const teamName = `Team ${Date.now() % 100_000}`;
    const team = await newWorkspace(page, teamName);

    // In from the sidebar's Settings, which only an Owner has.
    await page.goto(`/w/${team.id}`);
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Settings" })
      .click();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/w/${team.id}/settings`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Workspace Settings" }),
    ).toBeVisible();
    await expect(page).toHaveTitle(`Workspace Settings · ${teamName} · moonx`);

    // The only Owner keeps the role, shown unavailable with why (design-spec 1.3).
    const members = page.getByRole("list", { name: "Members" });
    await expect(members.getByRole("listitem")).toHaveCount(1);
    await expect(members.getByText("(you)")).toBeVisible();
    await expect(
      members.getByText("This workspace needs at least one Owner"),
    ).toBeVisible();
    await expect(
      members.getByRole("button", { name: /Role of Test Person/ }),
    ).toBeDisabled();
    await expect(page.getByText("No pending invitations")).toBeVisible();
    await expectNoAxeViolations(page);

    // The name saves as it is typed (6.0.2).
    const renamed = `${teamName} renamed`;
    await page.getByRole("textbox", { name: /^Name/ }).fill(renamed);
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await expect
      .poll(async () => workspaceOf(await meOf(page), renamed).id)
      .toBe(team.id);

    // An invitation, which the screen never shows the link of.
    const invited = uniqueEmail("settings-invited");
    const send = page.getByRole("button", {
      name: "Send invitation",
      exact: true,
    });
    await page.getByRole("textbox", { name: "Email to invite" }).fill(invited);
    await send.click();
    await expect(page.getByText(`Invitation sent to ${invited}`)).toBeVisible();
    const invitations = page.getByRole("list", { name: "Invitations" });
    await expect(invitations.getByText(invited)).toBeVisible();
    await expect(
      invitations.getByText(/^Member · sent \w+ \d+ · expires \w+ \d+$/),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText("/invite/");

    // The same address again: pending already, with its Resend.
    await page.getByRole("textbox", { name: "Email to invite" }).fill(invited);
    await send.click();
    await expect(
      page.getByText(`An invitation to ${invited} is already pending`),
    ).toBeVisible();

    // The link goes to the invited email only: the other person opens it there.
    const link = await linkMailedTo(invited, /https?:\/\/\S+\/invite\/[\w-]+/);
    const other = await otherBrowser(browser, testInfo.workerIndex);
    try {
      await other.page.goto(link.pathname);
      const form = other.page.getByRole("form", { name: "Sign up" });
      await expect(form.getByRole("textbox", { name: /Email/ })).toHaveValue(
        invited,
      );
      await form
        .getByRole("textbox", { name: /Display name/ })
        .fill("Iris Invited");
      await form.getByLabel(/^Password/).fill("iris-invited-2026");
      await other.page
        .getByRole("button", { name: "Sign up", exact: true })
        .click();
      await expect(
        other.page.getByText(
          `Test Person invited you to join ${renamed} on moonx as Member.`,
        ),
      ).toBeVisible();
      await other.page.getByRole("button", { name: "Join" }).click();
      await other.page.getByRole("button", { name: "Continue" }).click();
      await other.page.getByRole("button", { name: "Go to Dashboard" }).click();
      await expect(other.page).toHaveURL(`${WEB_ORIGIN}/w/${team.id}`);
      await expect(
        other.page.getByRole("heading", { level: 1, name: renamed }),
      ).toBeVisible();
      // A Member has no way into 9, and its URL says so (design-spec 2.2・6.0.6).
      await expect(
        other.page
          .getByRole("navigation", { name: "Main" })
          .getByRole("link", { name: "Settings" }),
      ).toHaveCount(0);
      await other.page.goto(`/w/${team.id}/settings`);
      await expect(
        other.page.getByRole("heading", {
          name: "You don't have access to this",
        }),
      ).toBeVisible();
    } finally {
      await other.context.close();
    }

    // Back on 9: the member, no pending invitation, and the accepted one under All.
    await page.reload();
    await expect(members.getByRole("listitem")).toHaveCount(2);
    await expect(members.getByText("Iris Invited")).toBeVisible();
    await expect(page.getByText("No pending invitations")).toBeVisible();
    await page.getByRole("radio", { name: "All" }).click();
    await expect(
      invitations.getByText(/^Member · accepted \w+ \d+$/),
    ).toBeVisible();

    // A Viewer, asked first (6.16's table), then removed, asked first.
    await members.getByRole("button", { name: /Role of Iris Invited/ }).click();
    await page.getByRole("option", { name: "Viewer" }).click();
    await page.getByRole("button", { name: "Make Viewer" }).click();
    await expect(
      members.getByRole("button", { name: /Role of Iris Invited/ }),
    ).toContainText("Viewer");
    await members
      .getByRole("button", { name: "Member actions of Iris Invited" })
      .click();
    await page.getByRole("menuitem", { name: "Remove" }).click();
    await expect(
      page.getByRole("alertdialog", { name: "Remove Iris Invited?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByText("Iris Invited was removed")).toBeVisible();
    await expect(members.getByRole("listitem")).toHaveCount(1);
  });

  test("4: Account, Leave, then Delete account to 1, after which the account cannot log in", async ({
    page,
    signIn,
  }, testInfo) => {
    const account = await newAccount(testInfo.workerIndex, "settings-delete");
    await signIn(account.email, account.password);
    // A Member of BCDX, as ① Join would make them (U6).
    const joined = await page.request.post(
      `/api/v1/invitations/by-token/${account.token}/accept`,
      { data: {}, headers: { Origin: WEB_ORIGIN } },
    );
    expect(joined.ok(), await joined.text()).toBe(true);
    const bcdx = workspaceOf(await meOf(page), "BCDX");

    // In from the account's menu.
    await page.goto(`/w/${bcdx.id}`);
    await page.getByRole("button", { name: "Test Person" }).click();
    await page.getByRole("menuitem", { name: "Account" }).click();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/account`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Account" }),
    ).toBeVisible();
    await expect(page).toHaveTitle("Account · moonx");
    await expect(page.getByRole("textbox", { name: /^Email/ })).toHaveValue(
      account.email,
    );
    await expectNoAxeViolations(page);

    // The name saves as it is typed; the display mode when chosen, and holds the page.
    await page
      .getByRole("textbox", { name: /^Display name/ })
      .fill("Dana Deleted");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await expect
      .poll(async () => (await meOf(page)).displayName)
      .toBe("Dana Deleted");
    await page.getByRole("button", { name: /Display mode/ }).click();
    await page.getByRole("option", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect.poll(async () => (await meOf(page)).theme).toBe("dark");

    // Leave BCDX, asked first; the personal workspace has no Leave.
    const workspaces = page.getByRole("list", { name: "Your workspaces" });
    await expect(
      workspaces.getByRole("button", { name: /^Leave Test Person's/ }),
    ).toHaveCount(0);
    await workspaces.getByRole("button", { name: "Leave BCDX" }).click();
    await page
      .getByRole("alertdialog", { name: "Leave BCDX?" })
      .getByRole("button", { name: "Leave" })
      .click();
    // BCDX was the workspace open now (the one 4 stands in): on to the personal 5.
    const personal = workspaceOf(await meOf(page), "Test Person's workspace");
    await expect(page).toHaveURL(`${WEB_ORIGIN}/w/${personal.id}`);
    await expect(page.getByText("You left BCDX")).toBeVisible();
    await page.getByRole("button", { name: "Dana Deleted" }).click();
    await page.getByRole("menuitem", { name: "Account" }).click();
    await expect(workspaces.getByRole("listitem")).toHaveCount(1);
    await expect(workspaces.getByText("BCDX")).toHaveCount(0);

    // Delete account: the wrong address says so; the right one and the password delete.
    await page.getByRole("button", { name: "Delete account" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete your account?" });
    await dialog
      .getByRole("textbox", { name: /^Your email/ })
      .fill("someone.else@e2e.example");
    await dialog.getByLabel(/^Password/).fill(account.password);
    await dialog.getByRole("button", { name: "Delete account" }).click();
    await expect(
      dialog.getByText("The email doesn't match your account"),
    ).toBeVisible();
    await dialog
      .getByRole("textbox", { name: /^Your email/ })
      .fill(account.email);
    await dialog.getByRole("button", { name: "Delete account" }).click();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/`);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "From idea to a plan you can show.",
      }),
    ).toBeVisible();
    // Logged out, the OS decides the display mode again (design-spec 4.4).
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-theme",
      "dark",
    );
    expect((await page.request.get("/api/v1/me")).status()).toBe(401);

    await page.goto("/login");
    await logInWithForm(page, account.email, account.password);
    await expect(
      page.getByText("Email or password is incorrect"),
    ).toBeVisible();
  });
});

test.describe("on a phone", () => {
  test.use(phone);

  test("4 and 9 open from More, and their ← More opens it again", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.owner);
    const bcdx = workspaceOf(me, "BCDX");
    await page.goto(`/w/${bcdx.id}`);
    const tabs = page.getByRole("navigation", { name: "Main" });
    await tabs.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Workspace Settings" }).click();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/w/${bcdx.id}/settings`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Workspace Settings" }),
    ).toBeVisible();
    await expect(page.getByRole("list", { name: "Members" })).toBeVisible();
    await expectNoAxeViolations(page);

    // The header's ← More opens the menu again (design-spec 6.0.1), on 9 and on 4.
    const back = page.getByRole("banner").getByRole("button", { name: "More" });
    await back.click();
    await page.getByRole("menuitem", { name: "Account" }).click();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/account`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Account" }),
    ).toBeVisible();
    await back.click();
    await expect(
      page.getByRole("menuitem", { name: "Workspace Settings" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    // The tray closes with an animation: the page is checked once it has gone, not while
    // its fading text is still drawn over the page.
    await expect(
      page.getByRole("menuitem", { name: "Workspace Settings" }),
    ).toHaveCount(0);
    await expectNoAxeViolations(page);
  });
});
