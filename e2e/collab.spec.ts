import AxeBuilder from "@axe-core/playwright";
import type { IdeaDetail, Me, Workspace } from "@moonx/schemas";
import {
  request as apiRequest,
  type Browser,
  type Page,
} from "@playwright/test";
import { WEB_ORIGIN } from "./env";
import {
  test as base,
  DEMO_PASSWORD,
  demo,
  expect,
  linkMailedTo,
  nextAddress,
  signUpThroughApi,
  uniqueEmail,
  workspaceOf,
} from "./fixtures";

// 7 Decision Log, 8 Notifications, PNL-1 Comments and PNL-2 History (design-spec 6.15・
// 6.0.4・6.0.5・5章): the seeded BCDX is read only; what writes does so in a workspace of
// the test's own account, or in a team workspace the test makes, whose two people are
// accounts of its own.

/** An account the tests of one worker share. */
interface Account {
  email: string;
  password: string;
}

/**
 * A user of their own with only a personal workspace, signed up from the operator's
 * invitation without a workspace (AD9): BCDX's Owner sends the other specs' invitations,
 * 20 an hour for the whole run (SDD 7.2), and this spec takes none of them.
 */
async function operatorInvited(workerIndex: number): Promise<Account> {
  const operator = await apiRequest.newContext({
    baseURL: WEB_ORIGIN,
    extraHTTPHeaders: {
      Origin: WEB_ORIGIN,
      "X-Forwarded-For": nextAddress(workerIndex),
    },
  });
  const email = uniqueEmail("collab");
  try {
    const signedIn = await operator.post("/api/auth/sign-in/email", {
      data: { email: demo.operator, password: DEMO_PASSWORD },
    });
    expect(signedIn.ok(), await signedIn.text()).toBe(true);
    const sent = await operator.post("/api/v1/admin/invitations", {
      data: { email },
    });
    expect(sent.status(), await sent.text()).toBe(201);
    const { link } = (await sent.json()) as { link: string };
    const token = new URL(link).pathname.replace("/invite/", "");
    const password = "collab-password-2026";
    await signUpThroughApi(
      token,
      { displayName: "Test Person", password },
      workerIndex,
    );
    return { email, password };
  } finally {
    await operator.dispose();
  }
}

const test = base.extend<object, { account: Account }>({
  account: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures a fixture needs from this pattern, and this one needs none.
    async ({}, use, workerInfo) => {
      await use(await operatorInvited(workerInfo.workerIndex));
    },
    { scope: "worker" },
  ],
});

const phone = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
};
const desktop = { viewport: { width: 1440, height: 900 } };

async function expectNoAxeViolations(page: Page) {
  // A dialog, tray or panel fading in or out has its words part-transparent, which axe
  // reads as low contrast: the page is checked once overlays have settled.
  await expect(page.locator("[data-entering], [data-exiting]")).toHaveCount(0);
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          !(animation instanceof CSSTransition) ||
          animation.playState !== "running",
      ),
  );
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    violations.map((violation) => ({
      id: violation.id,
      targets: violation.nodes.map((node) => node.target.join(" ")),
    })),
  ).toEqual([]);
}

/** A browser of its own, as someone else on another device. */
async function otherBrowser(browser: Browser, workerIndex: number) {
  const context = await browser.newContext({
    ...desktop,
    extraHTTPHeaders: { "X-Forwarded-For": nextAddress(workerIndex) },
  });
  return { context, page: await context.newPage() };
}

/**
 * A team workspace of the page's user (W0) with a second person, signed up from its
 * invitation and in it as a Member (W4, U5, U6), and an idea in it (I1).
 */
async function teamWithIdea(page: Page, other: Page, workerIndex: number) {
  const made = await page.request.post("/api/v1/workspaces", {
    data: { name: `Collab ${Date.now() % 1_000_000}` },
    headers: { Origin: WEB_ORIGIN },
  });
  expect(made.status(), await made.text()).toBe(201);
  const workspace = (await made.json()) as Workspace;
  const email = uniqueEmail("collab-member");
  const invited = await page.request.post(
    `/api/v1/workspaces/${workspace.id}/invitations`,
    { data: { email, role: "member" }, headers: { Origin: WEB_ORIGIN } },
  );
  expect(invited.status(), await invited.text()).toBe(201);
  const link = await linkMailedTo(email, /https?:\/\/\S+\/invite\/[\w-]+/);
  const token = link.pathname.replace("/invite/", "");
  const password = "collab-member-2026";
  await signUpThroughApi(
    token,
    { displayName: "Bea Cruz", password },
    workerIndex,
  );
  const signedIn = await other.request.post("/api/auth/sign-in/email", {
    data: { email, password },
    headers: { Origin: WEB_ORIGIN },
  });
  expect(signedIn.ok(), await signedIn.text()).toBe(true);
  const accepted = await other.request.post(
    `/api/v1/invitations/by-token/${token}/accept`,
    { data: {}, headers: { Origin: WEB_ORIGIN } },
  );
  expect(accepted.ok(), await accepted.text()).toBe(true);
  const created = await page.request.post(
    `/api/v1/workspaces/${workspace.id}/ideas`,
    {
      data: {
        name: "Sunday Kiosk",
        oneLineConcept: "A kiosk open on Sundays.",
      },
      headers: { Origin: WEB_ORIGIN },
    },
  );
  expect(created.status(), await created.text()).toBe(201);
  return { workspace, idea: (await created.json()) as IdeaDetail };
}

test.describe("comments and notifications on a desktop", () => {
  test.use(desktop);

  test("a comment that mentions someone reaches their 8, which opens the answer with its thread", async ({
    page,
    browser,
    signIn,
    account,
  }, testInfo) => {
    await signIn(account.email, account.password);
    const other = await otherBrowser(browser, testInfo.workerIndex);
    try {
      const { workspace, idea } = await teamWithIdea(
        page,
        other.page,
        testInfo.workerIndex,
      );
      const form = `/w/${workspace.id}/ideas/${idea.id}/questions/01`;
      await page.goto(`${form}?q=V.01.WHO`);
      const who = page.getByRole("region", { name: "WHO", exact: true });
      await who.getByRole("button", { name: "Comments on 01 WHO" }).click();
      const panel = page.getByRole("complementary", { name: "Comments" });
      await expect(panel.getByText("No comments yet")).toBeVisible();
      const box = panel.getByRole("textbox", { name: "Add a comment" });
      await box.click();
      await box.pressSequentially("Can you check @Be");
      await page.getByRole("option", { name: "Bea Cruz" }).click();
      await box.pressSequentially("Sunday hours?");
      await panel.getByRole("button", { name: "Post" }).click();
      await expect(
        panel.getByText("Can you check @Bea Cruz Sunday hours?"),
      ).toBeVisible();
      await expect(box).toHaveValue("");
      // The answer's 💬 counts it, and the header's 💬 its open thread.
      await expect(
        who.getByRole("button", { name: "Comments on 01 WHO, 1 comment" }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("banner")
          .getByRole("button", { name: "Comments, 1 unresolved thread" }),
      ).toBeVisible();
      await expectNoAxeViolations(page);

      // Bea's 8: who mentioned her, where, and the comment's start.
      await other.page.goto("/notifications");
      await expect(
        other.page.getByRole("link", { name: "Notifications, 1 unread" }),
      ).toBeVisible();
      const list = other.page.getByRole("grid", { name: "Notifications" });
      const row = list.getByRole("row").filter({
        hasText: `mentioned you on 01 WHO · ${idea.name}`,
      });
      await expect(row).toContainText("Can you check @Bea Cruz Sunday hours?");
      await expect(row).toContainText(`Unread · ${workspace.name}`);
      await expectNoAxeViolations(other.page);
      await row.click();
      await expect(other.page).toHaveURL(
        new RegExp(`/w/${workspace.id}/ideas/${idea.id}/questions/01\\?`),
      );
      const opened = other.page.getByRole("complementary", {
        name: "Comments",
      });
      await expect(
        opened.getByText("Can you check @Bea Cruz Sunday hours?"),
      ).toBeVisible();
      await expect(
        other.page.getByRole("link", { name: "Notifications", exact: true }),
      ).toBeVisible();

      // Bea replies and resolves; the writer's panel shows the reply in the folded thread.
      await opened.getByRole("button", { name: "Reply" }).click();
      const reply = opened.getByRole("textbox", { name: /^Reply to/ });
      await reply.fill("9 to 5, every Sunday.");
      await opened.getByRole("button", { name: "Reply" }).last().click();
      await expect(opened.getByText("9 to 5, every Sunday.")).toBeVisible();
      await opened.getByRole("button", { name: "Resolve" }).click();
      await expect(
        opened.getByRole("button", { name: /^Resolved · / }),
      ).toBeVisible();
      await page.reload();
      const fold = page
        .getByRole("complementary", { name: "Comments" })
        .getByRole("button", { name: /^Resolved · / });
      await fold.click();
      await expect(
        page
          .getByRole("complementary", { name: "Comments" })
          .getByText("9 to 5, every Sunday."),
      ).toBeVisible();
    } finally {
      await other.context.close();
    }
  });
});

/** An idea of its own in the user's personal workspace (I1), named to be found again. */
async function personalIdea(page: Page, me: Me, name: string) {
  const workspace = me.memberships.find(
    ({ workspace }) => workspace.isPersonal,
  )?.workspace;
  if (workspace === undefined) throw new Error("No personal workspace");
  const created = await page.request.post(
    `/api/v1/workspaces/${workspace.id}/ideas`,
    {
      data: { name, oneLineConcept: "A cart at the plaza every morning." },
      headers: { Origin: WEB_ORIGIN },
    },
  );
  expect(created.status(), await created.text()).toBe(201);
  return { workspace, idea: (await created.json()) as IdeaDetail };
}

test.describe("PNL-2 History on a desktop", () => {
  test.use(desktop);

  test("an answer goes back to an earlier change from its 🕘, and 11 shows it", async ({
    page,
    signIn,
    account,
  }) => {
    const me = await signIn(account.email, account.password);
    const { workspace, idea } = await personalIdea(
      page,
      me,
      `Taho Cart ${Date.now() % 1_000_000}`,
    );
    await page.goto(
      `/w/${workspace.id}/ideas/${idea.id}/questions/01?q=V.01.WHO`,
    );
    const answer = page.getByRole("textbox", { name: "Answer to WHO" });
    const saved = () =>
      page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          response.url().includes("/answers/V.01.WHO") &&
          response.ok(),
      );
    let save = saved();
    await answer.fill("Office workers in Bacolod");
    await save;
    save = saved();
    await answer.fill("Office workers in Iloilo");
    await save;

    const who = page.getByRole("region", { name: "WHO", exact: true });
    await who.getByRole("button", { name: "History of 01 WHO" }).click();
    const panel = page.getByRole("complementary", { name: "History" });
    await expect(panel.getByText("On 01 WHO")).toBeVisible();
    const reverts = panel.getByRole("button", {
      name: "Revert to this point, 01 WHO",
    });
    await expect(reverts).toHaveCount(2);
    // Newest first.
    await expect(panel.locator("del").first()).toHaveText("Bacolod");
    await expect(panel.locator("ins").first()).toHaveText("Iloilo");
    await expectNoAxeViolations(page);

    // Back to just after the first change: the answer reads it, and the revert is a
    // change of its own.
    await reverts.nth(1).click();
    await expect(answer).toHaveValue("Office workers in Bacolod");
    await expect(panel.getByText("Revert · Changed")).toBeVisible();
    await expect(reverts).toHaveCount(3);

    await page
      .getByRole("banner")
      .getByRole("button", { name: "History" })
      .click();
    await expect(panel.getByText("On 01 WHO")).toHaveCount(0);
    await expect(panel.getByText("01 WHO", { exact: true })).toHaveCount(3);
  });

  test("a copy's creation is undone from its 🕘, and the idea it came from keeps a line of it", async ({
    page,
    signIn,
    account,
  }) => {
    const me = await signIn(account.email, account.password);
    const name = `Taho Cart ${Date.now() % 1_000_000}`;
    const { workspace, idea } = await personalIdea(page, me, name);
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}`);
    await page.getByRole("button", { name: `More for ${name}` }).click();
    await page.getByRole("menuitem", { name: "Duplicate" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: `${name} (copy)` }),
    ).toBeVisible();

    await page
      .getByRole("banner")
      .getByRole("button", { name: "History" })
      .click();
    const panel = page.getByRole("complementary", { name: "History" });
    await expect(panel.getByText("Duplicate · Added")).toBeVisible();
    await panel
      .getByRole("button", { name: /^Undo the whole operation/ })
      .click();
    const confirm = page.getByRole("alertdialog", {
      name: "Delete the copied idea?",
    });
    await expect(confirm).toContainText(
      `${name} (copy) and everything copied into it will be deleted.`,
    );
    await confirm.getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/w/${workspace.id}/ideas`);
    await expect(page.getByText(`${name} (copy)`)).toHaveCount(0);

    // The idea it came from keeps "Duplicate undone", with nothing to press on it: its
    // own creation is the one change that can be reverted.
    await page.goto(
      `/w/${workspace.id}/ideas/${idea.id}?panel=history&target=container:idea:${idea.id}`,
    );
    const kept = page.getByRole("complementary", { name: "History" });
    await expect(kept.getByText("Duplicate undone · Deleted")).toBeVisible();
    await expect(kept.getByText("Manual · Added")).toBeVisible();
    await expect(
      kept.getByRole("button", { name: /^Revert to this point/ }),
    ).toHaveCount(1);
    await expect(
      kept.getByRole("button", { name: /^Undo the whole operation/ }),
    ).toHaveCount(0);
  });
});

test.describe("7 Decision Log on a desktop", () => {
  test.use(desktop);

  test("opens from the navigation and from 13's See all; an entry shows what was kept", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.owner);
    const bcdx = workspaceOf(me, "BCDX");
    await page.goto(`/w/${bcdx.id}`);
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Decision Log" })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Decision Log" }),
    ).toBeVisible();
    await expect(page).toHaveTitle("Decision Log · BCDX · moonx");
    const list = page.getByRole("grid", { name: "Decisions" });
    const hold = list
      .getByRole("row")
      .filter({ hasText: "Bacolod Health Bowl" })
      .first();
    await expect(hold).toContainText("Hold");
    await hold.click();
    await expect(page.getByText("Checks missing then")).toBeVisible();
    await expect(
      page.getByRole("group", { name: "Key numbers then" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);

    // 13's Decisions lead to this idea's.
    const ideas = await page.request.get(
      `/api/v1/workspaces/${bcdx.id}/ideas?decision=all&includeArchived=true`,
    );
    const piaya = (
      (await ideas.json()) as { items: { id: string; name: string }[] }
    ).items.find(({ name }) => name === "Piaya Gift Box Delivery");
    if (piaya === undefined) throw new Error("No Piaya Gift Box Delivery");
    await page.goto(`/w/${bcdx.id}/ideas/${piaya.id}`);
    await page
      .getByRole("region", { name: "Decisions", exact: true })
      .getByRole("link", { name: "See all decisions" })
      .click();
    await expect(page).toHaveURL(
      `${WEB_ORIGIN}/w/${bcdx.id}/decisions?idea=${piaya.id}`,
    );
    await expect(list.getByRole("row").nth(1)).toContainText("Piaya");
    await expect(list).not.toContainText("Bacolod Health Bowl");
  });
});

test.describe("on a phone", () => {
  test.use(phone);

  test("8 is a tab; 7 opens from More with ← More", async ({
    page,
    signIn,
  }) => {
    const me: Me = await signIn(demo.member, DEMO_PASSWORD);
    const bcdx = workspaceOf(me, "BCDX");
    await page.goto(`/w/${bcdx.id}`);
    const tabs = page.getByRole("navigation", { name: "Main" });
    await tabs.getByRole("link", { name: /^Notifications/ }).tap();
    await expect(
      page.getByRole("heading", { level: 1, name: "Notifications" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("grid", { name: "Notifications" })
        .getByRole("row")
        .first(),
    ).toBeVisible();
    await expectNoAxeViolations(page);

    await tabs.getByRole("button", { name: "More" }).tap();
    await page.getByRole("menuitem", { name: "Decision Log" }).tap();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/w/${bcdx.id}/decisions`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Decision Log" }),
    ).toBeVisible();
    await expect(
      page.getByRole("banner").getByRole("button", { name: "More" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Decision Log" }),
    ).toHaveCount(0);
    await expectNoAxeViolations(page);
  });
});
