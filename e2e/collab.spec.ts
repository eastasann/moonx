import AxeBuilder from "@axe-core/playwright";
import type { IdeaDetail, Me } from "@moonx/schemas";
import type { Browser, Page } from "@playwright/test";
import { WEB_ORIGIN } from "./env";
import {
  type Account,
  test as base,
  DEMO_PASSWORD,
  demo,
  expect,
  nextAddress,
  operatorInvited,
  teamWithMember,
  workspaceOf,
} from "./fixtures";

// 7 Decision Log, 8 Notifications, PNL-1 Comments and PNL-2 History (design-spec 6.15・
// 6.0.4・6.0.5・5章): the seeded BCDX is read only; what writes does so in a workspace of
// the test's own account, or in a team workspace the test makes, whose two people are
// accounts of its own.

const test = base.extend<object, { account: Account }>({
  account: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures a fixture needs from this pattern, and this one needs none.
    async ({}, use, workerInfo) => {
      await use(await operatorInvited(workerInfo.workerIndex, "collab"));
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

/** A team workspace of the page's user with a second person as a Member, and an idea in it (I1). */
async function teamWithIdea(page: Page, other: Page, workerIndex: number) {
  const workspace = await teamWithMember(page, other, workerIndex, {
    label: "Collab",
    displayName: "Bea Cruz",
  });
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

/** A comment on WHO of `idea` (C1), or a reply to `parentId`, mentioning no one. */
async function commentOnWho(
  page: Page,
  workspaceId: string,
  idea: IdeaDetail,
  body: string,
  parentId?: string,
) {
  const posted = await page.request.post("/api/v1/comments", {
    data: {
      workspaceId,
      target: {
        type: "validation_answer",
        id: idea.validationId,
        key: "V.01.WHO",
      },
      body,
      mentionUserIds: [],
      ...(parentId === undefined ? {} : { parentId }),
    },
    headers: { Origin: WEB_ORIGIN },
  });
  expect(posted.status(), await posted.text()).toBe(201);
  return ((await posted.json()) as { id: string }).id;
}

/** WHO of a new idea of the user's own, with a thread of a comment and 11 replies of differing lengths. */
async function longThread(page: Page, me: Me) {
  const { workspace, idea } = await personalIdea(
    page,
    me,
    `Long Thread ${Date.now() % 1_000_000}`,
  );
  const root = await commentOnWho(
    page,
    workspace.id,
    idea,
    "Which offices do we start with?",
  );
  for (let n = 1; n <= 11; n++) {
    await commentOnWho(
      page,
      workspace.id,
      idea,
      `Reply ${n}:${" more".repeat(n % 4 === 0 ? 12 : n % 3)}`,
      root,
    );
  }
  return { workspace, idea };
}

test.describe("PNL-1's box for a new thread under a long thread", () => {
  for (const [width, viewport, role] of [
    ["desktop", desktop.viewport, "complementary"],
    ["tablet", { width: 820, height: 1180 }, "dialog"],
  ] as const) {
    test(`${width}: stays in view while the thread scrolls; each ⋯ at the same edge`, async ({
      page,
      signIn,
      account,
    }) => {
      await page.setViewportSize(viewport);
      const me = await signIn(account.email, account.password);
      const { workspace, idea } = await longThread(page, me);
      await page.goto(
        `/w/${workspace.id}/ideas/${idea.id}/questions/01?q=V.01.WHO`,
      );
      await page
        .getByRole("region", { name: "WHO", exact: true })
        .getByRole("button", { name: /^Comments on 01 WHO/ })
        .click();
      const panel = page.getByRole(role, { name: "Comments" });
      const box = panel.getByRole("textbox", { name: "Add a comment" });
      const last = panel.getByText(/^Reply 11:/);
      await expect(last).toBeAttached();
      // The thread is longer than the panel: it scrolls.
      expect(
        await last.evaluate((element) => {
          let node = element.parentElement;
          while (node !== null && getComputedStyle(node).overflowY !== "auto")
            node = node.parentElement;
          return node !== null && node.scrollHeight > node.clientHeight;
        }),
      ).toBe(true);
      await expect(box).toBeInViewport({ ratio: 1 });
      await last.scrollIntoViewIfNeeded();
      await expect(last).toBeInViewport();
      await expect(box).toBeInViewport({ ratio: 1 });

      // The comment's column takes the panel's width, not its words', replies too (6.0.4).
      const menus = panel.getByRole("button", {
        name: /^More for .*'s comment$/,
      });
      await expect(menus).toHaveCount(12);
      const rights = await menus.evaluateAll((buttons) =>
        buttons.map((button) =>
          Math.round(button.getBoundingClientRect().right),
        ),
      );
      expect(new Set(rights).size, rights.join(", ")).toBe(1);
      await expectNoAxeViolations(page);
    });
  }
});

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

  test("an answer typed again three times, a pause between, is one change from before the first to after the last", async ({
    page,
    signIn,
    account,
  }) => {
    const me = await signIn(account.email, account.password);
    const { workspace, idea } = await personalIdea(
      page,
      me,
      `Halo Cart ${Date.now() % 1_000_000}`,
    );
    await page.goto(
      `/w/${workspace.id}/ideas/${idea.id}/questions/01?q=V.01.WHO`,
    );
    const answer = page.getByRole("textbox", { name: "Answer to WHO" });
    // Each is saved on its own, after the pause of autosave (6.0.2).
    for (const text of [
      "Offices",
      "Offices in Bacolod",
      "Offices in Bacolod and Iloilo",
      "HR officers in Bacolod and Iloilo",
    ]) {
      const save = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          response.url().includes("/answers/V.01.WHO") &&
          response.ok(),
      );
      await answer.fill(text);
      await save;
    }

    const who = page.getByRole("region", { name: "WHO", exact: true });
    await who.getByRole("button", { name: "History of 01 WHO" }).click();
    const panel = page.getByRole("complementary", { name: "History" });
    // The first save added the answer; the three after it are one change (6.0.5).
    await expect(panel.getByText("Manual · Added")).toHaveCount(1);
    const changed = panel.getByText("Manual · Changed");
    await expect(changed).toHaveCount(1);
    await expect(
      panel.getByRole("button", { name: "Revert to this point, 01 WHO" }),
    ).toHaveCount(2);
    const entry = changed.locator("xpath=..");
    await expect(entry.locator("del")).toHaveText(["Offices"]);
    await expect(entry).toContainText("HR officers in Bacolod and Iloilo");
    await expect(entry).not.toContainText("Offices in Bacolod");
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

  test("PNL-1's tray keeps the box for a new thread in view under a long thread, and above the keyboard", async ({
    page,
    signIn,
    account,
  }) => {
    const me = await signIn(account.email, account.password);
    const { workspace, idea } = await longThread(page, me);
    await page.goto(
      `/w/${workspace.id}/ideas/${idea.id}/questions/01?q=V.01.WHO`,
    );
    await page
      .getByRole("region", { name: "WHO", exact: true })
      .getByRole("button", { name: /^Comments on 01 WHO/ })
      .tap();
    const tray = page.getByRole("dialog", { name: "Comments" });
    const box = tray.getByRole("textbox", { name: "Add a comment" });
    const last = tray.getByText(/^Reply 11:/);
    await expect(last).toBeAttached();
    // The thread is longer than the tray: it scrolls.
    expect(
      await last.evaluate((element) => {
        let node = element.parentElement;
        while (node !== null && getComputedStyle(node).overflowY !== "auto")
          node = node.parentElement;
        return node !== null && node.scrollHeight > node.clientHeight;
      }),
    ).toBe(true);
    await expect(box).toBeInViewport({ ratio: 1 });
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    await expect(box).toBeInViewport({ ratio: 1 });
    const rights = await tray
      .getByRole("button", { name: /^More for .*'s comment$/ })
      .evaluateAll((buttons) =>
        buttons.map((button) =>
          Math.round(button.getBoundingClientRect().right),
        ),
      );
    expect(rights).toHaveLength(12);
    expect(new Set(rights).size, rights.join(", ")).toBe(1);

    await box.tap();
    await expect(box).toBeFocused();
    // The on-screen keyboard shrinks only the visible part of the window, as on an
    // iPhone (4.3): the tray rises above it with the box.
    await page.evaluate(() => {
      const visible = window.visualViewport;
      if (visible === null) throw new Error("No visualViewport");
      Object.defineProperty(visible, "height", { get: () => 460 });
      visible.dispatchEvent(new Event("resize"));
    });
    await expect
      .poll(() =>
        tray.evaluate((dialog) =>
          Math.round(dialog.parentElement?.getBoundingClientRect().bottom ?? 0),
        ),
      )
      .toBe(460);
    const field = await box.boundingBox();
    expect((field?.y ?? 0) + (field?.height ?? 0)).toBeLessThanOrEqual(460);
    expect(field?.y ?? -1).toBeGreaterThanOrEqual(0);

    // A long comment grows the box only so far: the thread keeps room above it, and
    // Post can still be reached.
    await box.fill(
      Array.from({ length: 40 }, (_, n) => `Line ${n + 1}`).join("\n"),
    );
    const thread = await last.evaluate((element) => {
      let node = element.parentElement;
      while (node !== null && getComputedStyle(node).overflowY !== "auto")
        node = node.parentElement;
      return node?.clientHeight ?? 0;
    });
    expect(thread).toBeGreaterThan(40);
    const post = tray.getByRole("button", { name: "Post" });
    await post.scrollIntoViewIfNeeded();
    const button = await post.boundingBox();
    const sheet = await tray.evaluate(
      (dialog) => dialog.parentElement?.getBoundingClientRect().bottom ?? 0,
    );
    expect((button?.y ?? 0) + (button?.height ?? 0)).toBeLessThanOrEqual(
      sheet + 1,
    );
  });

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
