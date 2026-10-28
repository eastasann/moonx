import AxeBuilder from "@axe-core/playwright";
import type { Me } from "@moonx/schemas";
import type { Browser, Page } from "@playwright/test";
import {
  type Account,
  test as base,
  demo,
  expect,
  nextAddress,
  operatorInvited,
  teamWithMember,
  workspaceOf,
} from "./fixtures";

// 10 Self Analysis, 11 for a self analysis, 12 Team Self Analyses and M6 Share
// (design-spec 6.11・6.2・3.8): what writes does so in accounts of the test's own; the
// seeded BCDX is read only.

const test = base.extend<object, { account: Account }>({
  account: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures a fixture needs from this pattern, and this one needs none.
    async ({}, use, workerInfo) => {
      await use(await operatorInvited(workerInfo.workerIndex, "self"));
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

/** Waits for the save of the self-analysis answer `questionKey` (S3). */
const answerSaved = (page: Page, questionKey: string) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      response.url().endsWith(`/self-analysis/answers/${questionKey}`) &&
      response.ok(),
  );

test.describe("10, 11, 12 and M6 on a desktop", () => {
  test.use(desktop);

  test("a member answers, marks it done and shares it; the Owner reads it on 12 and comments, and the member sees where from", async ({
    page,
    browser,
    signIn,
    account,
  }, testInfo) => {
    await signIn(account.email, account.password);
    const bea = await otherBrowser(browser, testInfo.workerIndex);
    try {
      const team = await teamWithMember(page, bea.page, testInfo.workerIndex, {
        label: "Self",
        displayName: "Bea Cruz",
      });
      const member = bea.page;

      // 10 before the first answer: what it is for, and Start (6.11).
      await member.goto(`/w/${team.id}/self-analysis`);
      await expect(
        member.getByText(
          "Answer 36 questions at your own pace. Only you can see your answers until you share them.",
        ),
      ).toBeVisible();
      await expect(
        member.getByText("Not started · 0 / 36 answered"),
      ).toBeVisible();
      await expectNoAxeViolations(member);
      await member.getByRole("button", { name: "Start" }).click();
      await expect(member).toHaveURL(
        new RegExp(`/w/${team.id}/self-analysis/WHY\\?q=SA\\.WHY\\.1$`),
      );
      const first = member.getByRole("textbox", { name: "Answer to Q1" });
      await expect(first).toBeFocused();
      let save = answerSaved(member, "SA.WHY.1");
      await first.fill("To keep my family close.");
      await save;
      await expect(member.getByText("Saved")).toBeVisible();
      await expectNoAxeViolations(member);

      // INCOME: an amount and why, from the section switch (6.2).
      await member.getByRole("button", { name: "Switch section" }).click();
      await member.getByRole("menuitem", { name: "PERSONAL INCOME" }).click();
      const amount = member.getByRole("textbox", {
        name: "Amount",
        exact: true,
      });
      await expect(amount).toBeFocused();
      save = answerSaved(member, "SA.INCOME.1");
      await amount.fill("30000");
      await amount.blur();
      await save;
      save = answerSaved(member, "SA.INCOME.1");
      await member
        .getByRole("textbox", { name: "Why this amount?" })
        .fill("Rent and school fees");
      await save;
      // Its 🕘: the amount by its field's name, in the self analysis's currency.
      await member
        .getByRole("region", { name: "Q15" })
        .getByRole("button", { name: "History of INCOME Q15" })
        .click();
      const history = member.getByRole("complementary", { name: "History" });
      await expect(history.getByText("Amount", { exact: true })).toBeVisible();
      await expect(history.getByText("₱30,000").first()).toBeVisible();

      // Back on 10: done though questions are empty, after asking; then shared.
      await member
        .getByRole("list", { name: "Breadcrumbs" })
        .getByRole("link", { name: "Self Analysis" })
        .click();
      await expect(
        member.getByText("In progress · 2 / 36 answered"),
      ).toBeVisible();
      await member.getByRole("button", { name: "Mark as done" }).click();
      const confirm = member.getByRole("alertdialog", {
        name: "34 questions are empty. Mark as done anyway?",
      });
      await confirm.getByRole("button", { name: "Mark as done" }).click();
      await expect(member.getByText("Done · 2 / 36 answered")).toBeVisible();
      await member.getByRole("button", { name: "Share" }).click();
      const share = member.getByRole("dialog", { name: "Share" });
      // The box is React Aria's hidden input: its label takes the press.
      await share
        .getByRole("checkbox", { name: team.name })
        .locator("xpath=ancestor::label[1]")
        .click();
      await expect(
        share.getByRole("checkbox", { name: team.name }),
      ).toBeChecked();
      await expectNoAxeViolations(member);
      await share.getByRole("button", { name: "Save" }).click();
      await expect(share).toHaveCount(0);
      await expect(
        member.getByRole("region", { name: "Status" }).getByText(team.name),
      ).toBeVisible();

      // The Owner: 5's Self analyses opens 12 on Bea, who shared.
      await page.goto(`/w/${team.id}`);
      await page.getByRole("link", { name: /Bea Cruz/ }).click();
      await expect(page).toHaveURL(new RegExp(`/w/${team.id}/team/[\\w-]+$`));
      await expect(page.getByText("To keep my family close.")).toBeVisible();
      const income = page.getByRole("region", { name: "PERSONAL INCOME" });
      await expect(income.getByText("₱30,000")).toBeVisible();
      await expect(income.getByText("Rent and school fees")).toBeVisible();
      await expectNoAxeViolations(page);
      await page.getByRole("button", { name: "Comments on WHY Q1" }).click();
      const comments = page.getByRole("complementary", { name: "Comments" });
      await expect(comments.getByText("On WHY Q1")).toBeVisible();
      await comments
        .getByRole("textbox", { name: "Add a comment" })
        .fill("A clear reason.");
      await comments.getByRole("button", { name: "Post" }).click();
      await expect(comments.getByText("A clear reason.")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Comments on WHY Q1, 1 comment" }),
      ).toBeVisible();

      // Bea on 11: the thread, and the workspace it is from (6.0.4).
      await member.goto(`/w/${team.id}/self-analysis/WHY?q=SA.WHY.1`);
      await member
        .getByRole("region", { name: "Q1" })
        .getByRole("button", { name: "Comments on WHY Q1, 1 comment" })
        .click();
      const own = member.getByRole("complementary", { name: "Comments" });
      await expect(own.getByText("A clear reason.")).toBeVisible();
      await expect(own.getByText(`From ${team.name}`)).toBeVisible();
      await expectNoAxeViolations(member);
    } finally {
      await bea.context.close();
    }
  });

  test("a Viewer opening 10 in a workspace they view is taken to their personal workspace's 10", async ({
    page,
    browser,
    signIn,
    account,
  }, testInfo) => {
    // A Viewer of a team of the test's own: the move makes the personal workspace the
    // last opened, which the specs reading demo Grace's would see.
    await signIn(account.email, account.password);
    const viewer = await otherBrowser(browser, testInfo.workerIndex);
    try {
      const team = await teamWithMember(
        page,
        viewer.page,
        testInfo.workerIndex,
        { label: "Viewed", displayName: "Vic Viewer", role: "viewer" },
      );
      const me = (await (
        await viewer.page.request.get("/api/v1/me")
      ).json()) as Me;
      const own = me.memberships.find(({ workspace }) => workspace.isPersonal);
      if (own === undefined) throw new Error("No personal workspace");
      await viewer.page.goto(`/w/${team.id}`);
      // No way into it from the team (5章「Viewer」).
      await expect(
        viewer.page.getByRole("link", { name: "Ideas" }).first(),
      ).toBeVisible();
      await expect(
        viewer.page.getByRole("link", { name: "Self Analysis" }),
      ).toHaveCount(0);
      await viewer.page.goto(`/w/${team.id}/self-analysis`);
      await expect(viewer.page).toHaveURL(
        new RegExp(`/w/${own.workspace.id}/self-analysis$`),
      );
      await expect(
        viewer.page.getByRole("heading", {
          level: 1,
          name: "My Self Analysis",
        }),
      ).toBeVisible();
      await expect(
        viewer.page.getByText("Not started · 0 / 36 answered"),
      ).toBeVisible();
    } finally {
      await viewer.context.close();
    }
  });
});

test.describe("12 beside a panel on a narrow desktop", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("the member beside the list stays when a 💬 opens the panel and the list takes one pane (4.1)", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.owner);
    const bcdx = workspaceOf(me, "BCDX");
    await page.goto(`/w/${bcdx.id}/team`);
    // Ana, the first who shared, beside the list; her own row's threads say where from.
    const answer = page.getByText(
      "I want to build something that keeps my family's piaya recipe alive",
      { exact: false },
    );
    await expect(answer).toBeVisible();
    await page
      .getByRole("button", { name: "Comments on WHY Q1, 1 comment" })
      .click();
    const comments = page.getByRole("complementary", { name: "Comments" });
    await expect(comments.getByText("From BCDX")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/team/${me.id}\\?`));
    await expect(answer).toBeVisible();
    await expect(page.getByRole("grid", { name: "Members" })).toHaveCount(0);

    // The header's list instead of the answer's thread: the screen's threads, Ana's.
    await page
      .getByRole("banner")
      .getByRole("button", { name: /^Comments/ })
      .click();
    await expect(comments.getByText("WHY Q1 · From BCDX")).toBeVisible();
    // Back to the list: it stands alone beside the panel, which stays on Ana's list.
    const panelBox = await comments.elementHandle();
    await page
      .getByRole("button", { name: "Back to Team Self Analyses" })
      .click();
    const members = page.getByRole("grid", { name: "Members" });
    await expect(members).toBeVisible();
    await expect(comments.getByText("WHY Q1 · From BCDX")).toBeVisible();
    expect(
      await comments.evaluate(
        (element, before) => element === before,
        panelBox,
      ),
    ).toBe(true);
    const listAlone = page.url();

    // The screen's list moves with the member chosen, and stays open (SDD 4章).
    await members.getByText("Paolo Gonzaga").click();
    await expect(page).toHaveURL(
      /\/team\/[\w-]+\?panel=comments&target=container/,
    );
    await expect(comments).toBeVisible();
    await expect(comments.getByText("From BCDX")).toHaveCount(0);

    // Browser Back: the list alone again, its panel on Ana's list as that entry had it.
    await page.goBack();
    await expect(page).toHaveURL(listAlone);
    await expect(members).toBeVisible();
    await expect(comments.getByText("WHY Q1 · From BCDX")).toBeVisible();

    // From Paolo, who is not the first to share: chosen beside the list, a comment
    // half written on his answer, ←: the list stands alone beside the same panel, the
    // words kept. Then the panel closed: the list has room for two columns again, and
    // Paolo stays beside it (4.1).
    await page.goto(`/w/${bcdx.id}/team`);
    await members.getByText("Paolo Gonzaga").click();
    const paolos = page.getByText("I want to own my time", { exact: false });
    await expect(paolos).toBeVisible();
    await page
      .getByRole("button", { name: "Comments on WHY Q1", exact: true })
      .click();
    const box = comments.getByRole("textbox", { name: "Add a comment" });
    await box.fill("half-written");
    const paneledBox = await comments.elementHandle();
    await page
      .getByRole("button", { name: "Back to Team Self Analyses" })
      .click();
    await expect(members).toBeVisible();
    await expect(box).toHaveValue("half-written");
    expect(
      await comments.evaluate(
        (element, before) => element === before,
        paneledBox,
      ),
    ).toBe(true);
    // The header's 💬 shows the screen's list, then pressed again closes it.
    const headerComments = page
      .getByRole("banner")
      .getByRole("button", { name: /^Comments/ });
    await headerComments.click();
    await expect(comments.getByRole("textbox")).toHaveCount(0);
    await headerComments.click();
    await expect(comments).toHaveCount(0);
    await expect(paolos).toBeVisible();
    await expect(page).toHaveURL(/\/team\/[\w-]+$/);
    expect(page.url()).not.toContain(me.id);
  });
});

test.describe("10 and 11 on a phone", () => {
  test.use(phone);

  test("Self Analysis is a tab; Start is fixed at the bottom; 11 asks one question at a time", async ({
    page,
    signIn,
    account,
  }) => {
    const me = await signIn(account.email, account.password);
    const own = me.memberships.find(({ workspace }) => workspace.isPersonal);
    if (own === undefined) throw new Error("No personal workspace");
    await page.goto(`/w/${own.workspace.id}/self-analysis`);
    const tab = page.getByRole("link", { name: "Self Analysis" });
    await expect(tab).toHaveAttribute("aria-current", "page");
    const start = page.getByRole("button", { name: /^(Start|Continue)$/ });
    await expect(start).toBeVisible();
    const box = await start.boundingBox();
    const tabBox = await tab.boundingBox();
    // Above the TabBar, at the bottom (4.1 A).
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
      tabBox?.y ?? 0,
    );
    expect(box?.y ?? 0).toBeGreaterThan(600);
    // axe's target-size flags a row the fold cuts under the fixed bar: checked scrolled
    // to the end, where none is (as settings.spec.ts and ai.spec.ts do).
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expectNoAxeViolations(page);
    await start.click();
    await expect(page).toHaveURL(/\/self-analysis\/WHY/);
    await expect(
      page.getByRole("textbox", { name: /^Answer to Q/ }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Question 1 of 2" }),
    ).toBeVisible();
    await expect(page.getByRole("textbox")).toBeFocused();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expectNoAxeViolations(page);
  });
});
