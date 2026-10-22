import AxeBuilder from "@axe-core/playwright";
import type { IdeaDetail, Me, PlanSummary } from "@moonx/schemas";
import type { Page } from "@playwright/test";
import { WEB_ORIGIN } from "./env";
import {
  type Account,
  test as base,
  demo,
  expect,
  operatorInvited,
  workspaceOf,
} from "./fixtures";

// 20 Plan home, M3 Save version, M4 Record Go / No-Go and M5 Create plan draft
// (design-spec 6.12・3.8), from 19's Proceed, against an idea each test makes in the
// personal workspace of its worker's own account; the seeded BCDX is read only.

const test = base.extend<object, { account: Account }>({
  account: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures a fixture needs from this pattern, and this one needs none.
    async ({}, use, workerInfo) => {
      await use(await operatorInvited(workerInfo.workerIndex, "plans"));
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

/** The section of a hub a block's heading names. */
const block = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true });

/** Presses a Radio by its row: React Aria's input is hidden under the card. */
const press = (control: ReturnType<Page["getByRole"]>) =>
  control.locator("xpath=ancestor::label[1]").click();

async function expectNoAxeViolations(page: Page) {
  await expect(
    page.locator("[data-live-announcer] [aria-labelledby]"),
  ).toHaveCount(0, { timeout: 10_000 });
  // A dialog fading in or out has its words part-transparent, which axe reads as low
  // contrast: the page is checked once overlays have settled.
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

/** The worker's account, signed in, with a new idea in its personal workspace. */
async function ownIdea(
  page: Page,
  signIn: (email: string, password?: string) => Promise<Me>,
  account: Account,
) {
  const me = await signIn(account.email, account.password);
  const personal = me.memberships.find(({ workspace }) => workspace.isPersonal);
  if (personal === undefined) throw new Error("No personal workspace");
  const created = await page.request.post(
    `/api/v1/workspaces/${personal.workspace.id}/ideas`,
    {
      data: {
        name: "Piaya Picnic Boxes",
        oneLineConcept: "Picnic boxes of piaya for park days.",
      },
      headers: { Origin: WEB_ORIGIN },
    },
  );
  expect(created.status(), await created.text()).toBe(201);
  const idea = (await created.json()) as IdeaDetail;
  return { me, workspace: personal.workspace, idea };
}

/** The worker's account with a new idea, recorded Proceed, and its draft Plan A (P1). */
async function ownPlan(
  page: Page,
  signIn: (email: string, password?: string) => Promise<Me>,
  account: Account,
) {
  const own = await ownIdea(page, signIn, account);
  const decided = await page.request.post(
    `/api/v1/ideas/${own.idea.id}/decisions`,
    {
      data: {
        value: "proceed",
        reason: "Worth a full plan.",
        basedOnDecisionId: null,
      },
      headers: { Origin: WEB_ORIGIN },
    },
  );
  expect(decided.status(), await decided.text()).toBe(201);
  const drafted = await page.request.post(
    `/api/v1/ideas/${own.idea.id}/plans`,
    { data: { name: "Plan A" }, headers: { Origin: WEB_ORIGIN } },
  );
  expect(drafted.status(), await drafted.text()).toBe(201);
  const plan = (await drafted.json()) as { id: string };
  return { ...own, planId: plan.id };
}

/** Records Proceed on 19 and answers its question about a plan draft. */
async function recordProceed(page: Page, answer: "Create draft" | "Later") {
  await page.getByRole("button", { name: "Record decision" }).click();
  await expect(page).toHaveURL(/\/decide$/);
  await press(page.getByRole("radio", { name: /Proceed/ }));
  await page.getByRole("textbox", { name: /Why\?/ }).fill("Worth a full plan.");
  await page.getByRole("button", { name: "Record decision" }).click();
  const prompt = page.getByRole("alertdialog", {
    name: "Create a plan draft?",
  });
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: answer }).click();
}

/** Waits for the save of a plan's header (P2 PATCH). */
const headerSaved = (page: Page, planId: string) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      response.url().endsWith(`/api/v1/plans/${planId}`) &&
      response.ok(),
  );

/** Waits for the save of a plan answer (P5 PUT). */
const answerSaved = (page: Page, planId: string, questionKey: string) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      response
        .url()
        .endsWith(`/api/v1/plans/${planId}/answers/${questionKey}`) &&
      response.ok(),
  );

/** BCDX's Piaya Gift Box Delivery and its Plan A, as the seed makes them (8.2). */
async function piayaPlanA(page: Page, me: Me) {
  const bcdx = workspaceOf(me, "BCDX");
  const listed = await page.request.get(
    `/api/v1/workspaces/${bcdx.id}/ideas?decision=all`,
  );
  const { items } = (await listed.json()) as {
    items: { id: string; name: string }[];
  };
  const piaya = items.find(({ name }) => name === "Piaya Gift Box Delivery");
  if (piaya === undefined) throw new Error("No Piaya Gift Box Delivery");
  const plans = (await (
    await page.request.get(`/api/v1/ideas/${piaya.id}/plans`)
  ).json()) as { items: PlanSummary[] };
  const planA = plans.items.find(({ name }) => name === "Plan A");
  if (planA === undefined) throw new Error("No Plan A");
  return { bcdx, piaya, planA };
}

test.describe("20 and M3〜M5 on a desktop", () => {
  test.use(desktop);

  test("19's Proceed → M5 → 20: the draft as made, its Business Name saved as typed", async ({
    page,
    signIn,
    account,
  }) => {
    const { workspace, idea } = await ownIdea(page, signIn, account);
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}`);
    await recordProceed(page, "Create draft");

    // M5 over 13 (design-spec 6.5「記録の後（Proceed）」).
    await expect(page).toHaveURL(
      new RegExp(`/ideas/${idea.id}\\?modal=create-plan$`),
    );
    const create = page.getByRole("dialog", { name: "Create plan draft" });
    await expect(
      create.getByRole("textbox", { name: /Plan name/ }),
    ).toHaveValue("Plan A");
    await expectNoAxeViolations(page);
    await create.getByRole("button", { name: "Create draft" }).click();

    // 20: the draft, before anything changed it.
    await expect(page).toHaveURL(
      new RegExp(`/ideas/${idea.id}/plans/[0-9a-f-]+$`),
    );
    const planId = page.url().split("/plans/")[1] ?? "";
    await expect(
      page.getByRole("heading", { level: 1, name: "Plan A" }),
    ).toBeVisible();
    await expect(page.getByText(/^No version saved · Updated/)).toBeVisible();
    await expect(
      page.getByText(
        "Start with the items marked [V]. They already have your validation data.",
      ),
    ).toBeVisible();
    const partA = page.getByRole("list", { name: "Part A: Business Case" });
    await expect(partA.getByRole("listitem")).toHaveCount(10);
    await expect(partA.getByRole("listitem").first()).toContainText(
      "1 Executive Summary",
    );
    await expect(partA.getByRole("listitem").first()).toContainText(
      "Uses your validation",
    );
    await expect(
      page
        .getByRole("list", { name: "Part B: Execution Plan" })
        .getByRole("listitem"),
    ).toHaveCount(20);
    await expect(block(page, "Go / No-Go")).toContainText("Not recorded yet");
    await expectNoAxeViolations(page);

    // The header's Business Name, saved as typed (6.0.2).
    const saved = headerSaved(page, planId);
    await page
      .getByRole("textbox", { name: "Business Name" })
      .fill("Picnic Piaya Co.");
    await saved;
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  });

  test("a version saved (M3), the plan changed, a Go / No-Go recorded (M4); the version read only; 7 opens the plan", async ({
    page,
    signIn,
    account,
  }) => {
    const { workspace, idea, planId } = await ownPlan(page, signIn, account);
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}/plans/${planId}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Plan A" }),
    ).toBeVisible();
    let saved = headerSaved(page, planId);
    await page
      .getByRole("textbox", { name: "Business Name" })
      .fill("Picnic Piaya Co.");
    await saved;

    // 21 from 20's items: its first sub-item not answered has focus, and saves as typed.
    await page
      .getByRole("list", { name: "Part A: Business Case" })
      .getByRole("link", { name: /1 Executive Summary/ })
      .click();
    await expect(page).toHaveURL(new RegExp(`/plans/${planId}/items/1$`));
    await expect(
      page.getByRole("heading", { level: 1, name: "1 Executive Summary" }),
    ).toBeVisible();
    await expect(page.getByText("1/6")).toBeVisible();
    const customer = page.getByRole("textbox", {
      name: "Answer to Who is the primary customer?",
    });
    await expect(customer).toBeFocused();
    const answered = answerSaved(page, planId, "P.01.2");
    await customer.fill("Families who picnic in Bacolod's parks.");
    await answered;
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await expect(page.getByText("2/6")).toBeVisible();
    await page
      .getByRole("list", { name: "Breadcrumbs" })
      .getByRole("link", { name: "Plan A" })
      .click();
    await expect(
      page.getByRole("list", { name: "Part A: Business Case" }),
    ).toContainText("2/6");

    // M3: v1 by default, named, then the version in the header and Versions.
    await page.getByRole("button", { name: "Save version" }).click();
    const save = page.getByRole("dialog", { name: "Save version" });
    const name = save.getByRole("textbox", { name: /Version name/ });
    await expect(name).toHaveValue("v1");
    await name.fill("v1 For advisors");
    await expectNoAxeViolations(page);
    await save.getByRole("button", { name: "Save version" }).click();
    await expect(save).toBeHidden();
    await expect(page.getByText("v1 For advisors saved")).toBeVisible();
    await expect(
      page.getByText(/^Version: v1 For advisors · Updated/),
    ).toBeVisible();
    await expect(
      block(page, "Versions").getByRole("link", { name: /v1 For advisors/ }),
    ).toBeVisible();

    // A change after it: "+ changes" (6.12 M3).
    saved = headerSaved(page, planId);
    await page.getByRole("textbox", { name: "Prepared by" }).fill("The team");
    await saved;
    await expect(
      page.getByText(/^Version: v1 For advisors \+ changes · Updated/),
    ).toBeVisible();

    // M4: what it is recorded on, the way to M3, a choice and a reason.
    await page.getByRole("button", { name: "Record Go / No-Go" }).click();
    const goNoGo = page.getByRole("dialog", { name: "Record Go / No-Go" });
    await expect(goNoGo.getByText("We proceed to launch if")).toBeVisible();
    await expect(
      goNoGo.getByText(
        "The plan has changed since v1 For advisors was saved. Save a version first?",
      ),
    ).toBeVisible();
    // Record waits for a choice and a reason (6.0.6「モーダルの共通の決まり」).
    await expect(goNoGo.getByRole("button", { name: "Record" })).toBeDisabled();
    await press(goNoGo.getByRole("radio", { name: "Delay" }));
    await goNoGo
      .getByRole("textbox", { name: /Why\?/ })
      .fill("Permits come first.");
    await expectNoAxeViolations(page);
    await goNoGo.getByRole("button", { name: "Record" }).click();
    await expect(goNoGo).toBeHidden();
    await expect(page.getByText("Go / No-Go recorded")).toBeVisible();
    await expect(block(page, "Go / No-Go")).toContainText("Delay");

    // The version, read only, and back to the latest.
    await block(page, "Versions")
      .getByRole("link", { name: /v1 For advisors/ })
      .click();
    await expect(
      page.getByText("Viewing v1 For advisors (read only)"),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Business Name: Picnic Piaya Co. · Prepared by: Test Person",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Record Go / No-Go" }),
    ).toHaveCount(0);
    await page.getByRole("link", { name: "Show the latest" }).click();
    await expect(
      page.getByRole("textbox", { name: "Prepared by" }),
    ).toHaveValue("The team");

    // 7: the Go / No-Go opens its plan, the saved version that version.
    await block(page, "Go / No-Go")
      .getByRole("link", { name: "See all Go / No-Go decisions" })
      .click();
    await expect(page).toHaveURL(/\/decisions\?kind=go_no_go&idea=/);
    await page.getByRole("link", { name: "Open plan" }).click();
    await expect(page).toHaveURL(
      `${WEB_ORIGIN}/w/${workspace.id}/ideas/${idea.id}/plans/${planId}`,
    );
  });

  test('a second draft from the plan switch, undone from 20\'s history: 13 keeps "Plan draft undone"', async ({
    page,
    signIn,
    account,
  }) => {
    const { workspace, idea } = await ownIdea(page, signIn, account);
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}`);
    // Later leaves for 13; its Plans block has Add plan after Proceed.
    await recordProceed(page, "Later");
    await expect(page).toHaveURL(
      `${WEB_ORIGIN}/w/${workspace.id}/ideas/${idea.id}`,
    );
    await block(page, "Plans").getByRole("link", { name: "Add plan" }).click();
    const first = page.getByRole("dialog", { name: "Create plan draft" });
    await first.getByRole("button", { name: "Create draft" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Plan A" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Switch plan" }).click();
    await page.getByRole("menuitem", { name: "Add plan" }).click();
    const second = page.getByRole("dialog", { name: "Create plan draft" });
    await expect(
      second.getByRole("textbox", { name: /Plan name/ }),
    ).toHaveValue("Plan B");
    await second.getByRole("button", { name: "Create draft" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Plan B" }),
    ).toBeVisible();

    // The draft's first row undoes the whole creation (6.0.5).
    await page.getByRole("button", { name: "History" }).click();
    const history = page.getByRole("complementary", { name: "History" });
    await expect(history.getByText("Plan draft · Added").first()).toBeVisible();
    await expectNoAxeViolations(page);
    await history
      .getByRole("button", { name: /^Undo the whole operation/ })
      .click();
    const ask = page.getByRole("alertdialog", {
      name: "Delete this plan draft?",
    });
    await ask.getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(
      `${WEB_ORIGIN}/w/${workspace.id}/ideas/${idea.id}`,
    );
    const plans = page.getByRole("list", { name: "Plans" });
    await expect(plans.getByRole("listitem")).toHaveCount(1);
    await expect(plans).toContainText("Plan A");
    await page.getByRole("button", { name: "History" }).click();
    await expect(
      page
        .getByRole("complementary", { name: "History" })
        .getByText("Plan draft undone · Deleted"),
    ).toBeVisible();
  });
});

test.describe("20 for a Viewer", () => {
  test.use(desktop);

  test("Piaya's Plan A read only: the version with its changes, Delay, no tools", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.viewer);
    const bcdx = workspaceOf(me, "BCDX");
    const listed = await page.request.get(
      `/api/v1/workspaces/${bcdx.id}/ideas?decision=all`,
    );
    const { items } = (await listed.json()) as {
      items: { id: string; name: string }[];
    };
    const piaya = items.find(({ name }) => name === "Piaya Gift Box Delivery");
    if (piaya === undefined) throw new Error("No Piaya Gift Box Delivery");
    const plans = (await (
      await page.request.get(`/api/v1/ideas/${piaya.id}/plans`)
    ).json()) as { items: PlanSummary[] };
    const planA = plans.items.find(({ name }) => name === "Plan A");
    if (planA === undefined) throw new Error("No Plan A");
    await page.goto(`/w/${bcdx.id}/ideas/${piaya.id}/plans/${planA.id}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Plan A" }),
    ).toBeVisible();
    await expect(
      page.getByText(/^Version: v1 For advisors \+ changes · Updated/),
    ).toBeVisible();
    await expect(block(page, "Go / No-Go")).toContainText("Delay");
    await expect(block(page, "Execution")).toContainText("1 item overdue");
    await expect(
      page.getByText(/^Business Name: .* · Prepared by: /),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save version" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Record Go / No-Go" }),
    ).toHaveCount(0);
    await expect(
      block(page, "Key numbers").getByRole("link", {
        name: "Open in validation",
      }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

test.describe("20 on a phone", () => {
  test.use(phone);

  test("the blocks in the phone's order; Record Go / No-Go fixed at the bottom; M4 a full-screen sheet", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.member);
    const bcdx = workspaceOf(me, "BCDX");
    const listed = await page.request.get(
      `/api/v1/workspaces/${bcdx.id}/ideas?decision=all`,
    );
    const { items } = (await listed.json()) as {
      items: { id: string; name: string }[];
    };
    const piaya = items.find(({ name }) => name === "Piaya Gift Box Delivery");
    if (piaya === undefined) throw new Error("No Piaya Gift Box Delivery");
    const plans = (await (
      await page.request.get(`/api/v1/ideas/${piaya.id}/plans`)
    ).json()) as { items: PlanSummary[] };
    const planA = plans.items.find(({ name }) => name === "Plan A");
    if (planA === undefined) throw new Error("No Plan A");
    await page.goto(`/w/${bcdx.id}/ideas/${piaya.id}/plans/${planA.id}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Plan A" }),
    ).toBeVisible();
    // 6.12「スマホで積む順」: the numbers, the items, Go / No-Go, Versions, Execution.
    const order = await page
      .locator("section[aria-labelledby] h2")
      .allInnerTexts();
    expect(order).toEqual([
      "Key numbers",
      "Part A: Business Case",
      "Part B: Execution Plan",
      "Go / No-Go",
      "Versions",
      "Execution",
    ]);
    const record = page.getByRole("button", { name: "Record Go / No-Go" });
    const box = await record.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(844 - 140);
    await record.click();
    const sheet = page.getByRole("dialog", { name: "Record Go / No-Go" });
    await expect(sheet).toBeVisible();
    const sheetBox = await sheet.boundingBox();
    expect(sheetBox?.width).toBe(390);
    await expectNoAxeViolations(page);
  });
});

test.describe("21 on a desktop", () => {
  test.use(desktop);

  test("a row added to §11's table, a milestone added to §23; the saved version's 21 read only", async ({
    page,
    signIn,
    account,
  }) => {
    const { workspace, idea, planId } = await ownPlan(page, signIn, account);
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}/plans/${planId}`);
    await page
      .getByRole("list", { name: "Part B: Execution Plan" })
      .getByRole("link", { name: /11 Founder Roles/ })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "11 Founder Roles" }),
    ).toBeVisible();
    await expect(page).toHaveTitle(
      `11 Founder Roles · Plan A · ${workspace.name} · moonx`,
    );

    // §11's table: "No rows", then a row typed cell by cell, saved as the whole table.
    const founders = page.getByRole("region", {
      name: "Founders",
      exact: true,
    });
    await expect(founders.getByText("No rows")).toBeVisible();
    let saved = answerSaved(page, planId, "P.11.1");
    await founders.getByRole("button", { name: "Add row to Founders" }).click();
    await saved;
    saved = answerSaved(page, planId, "P.11.1");
    await founders.getByRole("textbox", { name: "Name" }).fill("Ana");
    await saved;
    saved = answerSaved(page, planId, "P.11.1");
    await founders.getByRole("textbox", { name: "Role" }).fill("Operations");
    await saved;
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await expectNoAxeViolations(page);

    // §23 through the item switch: the template's six milestones, then a seventh.
    await page.getByRole("button", { name: "Switch item" }).click();
    await page
      .getByRole("menuitem", { name: "23 Pre-launch Milestones" })
      .click();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "23 Pre-launch Milestones",
      }),
    ).toBeVisible();
    const milestones = page.getByRole("grid", { name: "Milestones" });
    await expect(milestones.getByRole("row")).toHaveCount(6);
    await page.getByRole("button", { name: "Add milestone" }).click();
    const added = page.getByRole("dialog", { name: "New milestone" });
    await expect(added.getByRole("button", { name: "Add" })).toBeDisabled();
    await added
      .getByRole("textbox", { name: /Milestone/ })
      .fill("Sign the lease");
    await added
      .getByRole("textbox", { name: "Goal" })
      .fill("A stall near the plaza.");
    await expectNoAxeViolations(page);
    await added.getByRole("button", { name: "Add" }).click();
    await expect(added).toBeHidden();
    await expect(milestones.getByRole("row")).toHaveCount(7);
    await expect(milestones.getByRole("row").last()).toContainText(
      "Sign the lease",
    );
    await expect(page.getByText("1/1")).toBeVisible();

    // The header's 🕘 lists the item's milestones with its sub-items (SDD 6.3).
    await page.getByRole("button", { name: "History", exact: true }).click();
    const history = page.getByRole("complementary", { name: "History" });
    await expect(
      history.getByText("Execution · Sign the lease").first(),
    ).toBeVisible();
    await history.getByRole("button", { name: "Close" }).click();
    await expect(history).toBeHidden();

    // Opened, it saves as typed (P10 PATCH).
    await milestones.getByRole("row").last().click();
    const edit = page.getByRole("dialog", { name: "Edit milestone" });
    const patched = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        /\/api\/v1\/execution-items\//.test(response.url()) &&
        response.ok(),
    );
    await edit
      .getByRole("textbox", { name: "Exit Condition" })
      .fill("The lease is signed.");
    await patched;
    await edit.getByRole("button", { name: "Close" }).click();
    await expect(edit).toBeHidden();

    // A saved version's 21 reads only, with what it kept.
    const version = await page.request.post(
      `/api/v1/plans/${planId}/versions`,
      { data: { name: "v1" }, headers: { Origin: WEB_ORIGIN } },
    );
    expect(version.status(), await version.text()).toBe(201);
    const { id: versionId } = (await version.json()) as { id: string };
    await page.goto(
      `/w/${workspace.id}/ideas/${idea.id}/plans/${planId}?version=${versionId}`,
    );
    await page
      .getByRole("list", { name: "Part B: Execution Plan" })
      .getByRole("link", { name: /11 Founder Roles/ })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/plans/${planId}/items/11\\?version=${versionId}$`),
    );
    await expect(page.getByText("Viewing v1 (read only)")).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Founders", exact: true }),
    ).toContainText("Ana");
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Add row to Founders" }),
    ).toHaveCount(0);
    await expectNoAxeViolations(page);
    await page.getByRole("link", { name: "Show the latest" }).click();
    await expect(page).toHaveURL(new RegExp(`/plans/${planId}/items/11$`));
  });

  test("a Viewer reads Piaya's §1 with every sub-item open and the numbers to open in validation", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.viewer);
    const { bcdx, piaya, planA } = await piayaPlanA(page, me);
    await page.goto(
      `/w/${bcdx.id}/ideas/${piaya.id}/plans/${planA.id}/items/1`,
    );
    await expect(
      page.getByRole("heading", { level: 1, name: "1 Executive Summary" }),
    ).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
    // Every sub-item open: none is a quiet row, whose title is a button to open it.
    await expect(
      page.getByRole("region", {
        name: "Who is the primary customer?",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Who is the primary customer?",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Key numbers", exact: true }),
    ).toContainText("Startup cost");
    await expect(
      page.getByRole("link", { name: "Open in validation" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /AI/ })).toHaveCount(0);
    await expectNoAxeViolations(page);
  });
});

test.describe("21 on a phone", () => {
  test.use(phone);

  test("one sub-item at a time; a table's row typed in its sheet", async ({
    page,
    signIn,
    account,
  }) => {
    const { workspace, idea, planId } = await ownPlan(page, signIn, account);
    await page.goto(
      `/w/${workspace.id}/ideas/${idea.id}/plans/${planId}/items/13`,
    );
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "13 Ownership & Money Between Founders",
      }),
    ).toBeVisible();
    const table = page.getByRole("region", {
      name: "Ownership and capital",
      exact: true,
    });
    await expect(table).toBeVisible();
    await expect(
      page.getByRole("region", {
        name: "Founder compensation at launch",
        exact: true,
      }),
    ).toHaveCount(0);
    const saved = answerSaved(page, planId, "P.13.1");
    await table
      .getByRole("button", { name: "Add row to Ownership and capital" })
      .click();
    await saved;
    const sheet = page.getByRole("dialog", { name: "Row 1" });
    await expect(sheet).toBeVisible();
    let typed = answerSaved(page, planId, "P.13.1");
    await sheet.getByRole("textbox", { name: "Name" }).fill("Ana");
    await typed;
    typed = answerSaved(page, planId, "P.13.1");
    await sheet
      .getByRole("textbox", { name: "Initial ownership (%)" })
      .fill("40");
    await typed;
    await expectNoAxeViolations(page);
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(table).toContainText("Ana");
    await expect(table).toContainText("40%");
    await expect(page.getByText("Total ownership: 40%")).toBeVisible();
  });
});
