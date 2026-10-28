import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { WEB_ORIGIN } from "./env";
import {
  DEMO_PASSWORD,
  demo,
  expect,
  linkMailedTo,
  newAccount,
  nextAddress,
  test,
  uniqueEmail,
} from "./fixtures";

// 26–28, the operator's screens (design-spec 6.17): the operator invites from 28 and the
// link they are shown opens the sign-up; they suspend and resume a user; anyone else
// neither sees a way in nor opens them. Importing and publishing a template changes
// what every other test reads, so it runs after them (admin-publish.spec.ts).

const phone = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
};

async function expectNoAxeViolations(page: Page) {
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

/** Whether `email` can sign in now, through Better Auth as the login form does. */
async function signInStatus(page: Page, email: string, password: string) {
  const context = await page
    .context()
    .browser()
    ?.newContext({
      extraHTTPHeaders: { "X-Forwarded-For": nextAddress(99) },
    });
  if (context === undefined) throw new Error("no browser");
  try {
    const response = await context.request.post(
      `${WEB_ORIGIN}/api/auth/sign-in/email`,
      { data: { email, password }, headers: { Origin: WEB_ORIGIN } },
    );
    return response.status();
  } finally {
    await context.close();
  }
}

test.describe("on a desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("28: the operator invites to no workspace, sees the link, and it opens the sign-up", async ({
    page,
    browser,
    signIn,
  }, testInfo) => {
    await signIn(demo.operator);
    // In from the sidebar's Admin, which only an operator has.
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Admin" })
      .click();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/admin/templates`);
    await expect(page).toHaveTitle("Templates · moonx");
    await expect(
      page.getByRole("heading", { level: 2, name: "Self Analysis" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole("tab", { name: "Invitations" }).click();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/admin/users?tab=invitations`);
    await expect(page).toHaveTitle("Users & Workspaces · moonx");
    // The demo's invitation to BCDX, still pending.
    await expect(
      page
        .getByRole("grid", { name: "Invitations" })
        .getByRole("row", { name: /new\.member@bcdx\.example/ }),
    ).toBeVisible();
    await expectNoAxeViolations(page);

    const invited = uniqueEmail("admin-invited");
    await page.getByRole("button", { name: "Invite someone" }).click();
    const dialog = page.getByRole("dialog", { name: "Invite someone" });
    await dialog.getByRole("textbox", { name: /^Email/ }).fill(invited);
    await dialog.getByRole("button", { name: "Send invitation" }).click();
    const sent = page.getByRole("dialog", { name: "Invitation sent" });
    await expect(sent.getByText(`Invitation sent to ${invited}`)).toBeVisible();
    const link = await sent
      .getByRole("textbox", { name: /Invitation link/ })
      .inputValue();
    expect(link).toMatch(/\/invite\/[\w-]+$/);
    // The mail carries the same link (SDD 5.13 AD9).
    expect(
      (await linkMailedTo(invited, /https?:\/\/\S+\/invite\/[\w-]+/)).href,
    ).toBe(link);
    await sent.getByRole("button", { name: "Close" }).click();
    const row = page
      .getByRole("grid", { name: "Invitations" })
      .getByRole("row", { name: new RegExp(invited.replace(/[.]/g, "\\.")) });
    await expect(row).toBeVisible();
    await expect(row.getByText("No workspace")).toBeVisible();

    // The link, opened by the invited person on a device of their own.
    const visitor = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      extraHTTPHeaders: {
        "X-Forwarded-For": nextAddress(testInfo.workerIndex),
      },
    });
    try {
      const guest = await visitor.newPage();
      await guest.goto(link);
      await expect(
        guest.getByRole("heading", { level: 1, name: "Sign up" }),
      ).toBeVisible();
      await expect(guest.getByRole("textbox", { name: /Email/ })).toHaveValue(
        invited,
      );
    } finally {
      await visitor.close();
    }
  });

  test("28: Suspend ends their sign-in, Resume gives it back", async ({
    page,
    signIn,
  }, testInfo) => {
    const account = await newAccount(testInfo.workerIndex, "admin-suspended");
    await signIn(demo.operator);
    await page.goto("/admin/users");
    await page
      .getByRole("searchbox", { name: "Search users" })
      .fill(account.email);
    const users = page.getByRole("grid", { name: "Users" });
    await expect(users.getByRole("row")).toHaveCount(2);
    await users.getByRole("row", { name: /Test Person/ }).click();
    await expect(
      page.getByRole("heading", { level: 2, name: "Test Person" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Suspend" }).click();
    const ask = page.getByRole("alertdialog", { name: "Suspend Test Person?" });
    await ask.getByRole("button", { name: "Suspend" }).click();
    await expect(page.getByText("Test Person is suspended")).toBeVisible();
    await expect(
      users.getByRole("row", { name: /Test Person \(suspended\)/ }),
    ).toBeVisible();
    expect(await signInStatus(page, account.email, account.password)).toBe(403);

    await page.getByRole("button", { name: "Resume" }).click();
    await expect(page.getByText("Test Person can log in again")).toBeVisible();
    expect(await signInStatus(page, account.email, account.password)).toBe(200);
  });

  test("anyone but the operator sees no Admin and cannot open 26–28", async ({
    page,
    signIn,
  }) => {
    await signIn(demo.owner, DEMO_PASSWORD);
    await page.goto("/");
    await expect(
      page.getByRole("navigation", { name: "Main" }).getByRole("link", {
        name: "Dashboard",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Main" }).getByRole("link", {
        name: "Admin",
      }),
    ).toHaveCount(0);
    for (const path of [
      "/admin/templates",
      "/admin/users",
      "/admin/templates/versions/00000000-0000-4000-8000-000000000000",
    ]) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: "You don't have access to this" }),
      ).toBeVisible();
      await expect(page).toHaveTitle("moonx");
    }
    // The API refuses them too (SDD 7.1).
    expect((await page.request.get("/api/v1/admin/templates")).status()).toBe(
      403,
    );
  });
});

test.describe("on a phone", () => {
  test.use(phone);

  test("26 opens from More with ← More; a template's versions open over the list", async ({
    page,
    signIn,
  }) => {
    await signIn(demo.operator);
    await page.goto("/");
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Admin" }).click();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/admin/templates`);
    await expect(page.getByRole("button", { name: "More" })).toHaveCount(2);
    await page.getByRole("row", { name: /Validation/ }).click();
    await expect(
      page.getByRole("heading", { level: 2, name: "Validation" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Import from file" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    // The detail opened over the list: Back returns to the list (design-spec 6.17).
    await page.goBack();
    await expect(page.getByRole("row", { name: /Validation/ })).toBeVisible();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/admin/templates`);
  });

  test("27 on a phone: the tree first, a node over it, ← back to the tree", async ({
    page,
    signIn,
  }) => {
    await signIn(demo.operator);
    const templates = (await (
      await page.request.get("/api/v1/admin/templates")
    ).json()) as {
      items: { kind: string; versions: { id: string; status: string }[] }[];
    };
    const version = templates.items
      .find((template) => template.kind === "validation")
      ?.versions.find((item) => item.status === "published");
    if (version === undefined) throw new Error("no published validation");
    await page.goto(`/admin/templates/versions/${version.id}`);
    await expect(
      page.getByRole("heading", { level: 1, name: /^Validation v\d+$/ }),
    ).toBeVisible();
    const tree = page.getByRole("treegrid", {
      name: "Sections and questions of Validation",
    });
    await tree.getByRole("row", { name: "Check thresholds" }).click();
    await expect(
      page.getByRole("heading", { level: 2, name: "Check thresholds" }),
    ).toBeVisible();
    await expect(tree).toHaveCount(0);
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: "Validation" }).first().click();
    await expect(
      tree.getByRole("row", { name: "Check thresholds" }),
    ).toBeVisible();
    await expect(page).toHaveURL(
      `${WEB_ORIGIN}/admin/templates/versions/${version.id}`,
    );
  });
});
