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

// The transitions of docs/screen_flow.mermaid around the plan (13 / 7 → 20, 20 / 21 / 23
// → 17 / 18, 23 → 21, 21 → 22, 21's References → 11 / 14〜18 / 7, M4 → M3) that
// plans.spec.ts reaches only by URL, checks only as an href or presses on one item only:
// each test walks them by clicking, as design-spec 5章・6.12・6.14 give them. The seeded
// BCDX is only read; what writes (M3, M4, archiving an idea) uses the worker's own account.

const test = base.extend<object, { account: Account }>({
  account: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures a fixture needs from this pattern, and this one needs none.
    async ({}, use, workerInfo) => {
      await use(await operatorInvited(workerInfo.workerIndex, "flow-plans"));
    },
    { scope: "worker" },
  ],
});

const desktop = { viewport: { width: 1440, height: 900 } };

/** The section of a hub a block's heading names. */
const block = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true });

/** Presses a Radio by its label: React Aria's input is hidden under it. */
const press = (control: ReturnType<Page["getByRole"]>) =>
  control.locator("xpath=ancestor::label[1]").click();

/** Expects the level-1 heading `name`: the screen arrived at. */
const expectHeading = (page: Page, name: string) =>
  expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

/** The idea of BCDX named `name`, as I1 lists it. */
async function bcdxIdea(page: Page, me: Me, name: string) {
  const bcdx = workspaceOf(me, "BCDX");
  const listed = await page.request.get(
    `/api/v1/workspaces/${bcdx.id}/ideas?decision=all`,
  );
  const { items } = (await listed.json()) as {
    items: { id: string; name: string }[];
  };
  const idea = items.find((candidate) => candidate.name === name);
  if (idea === undefined) throw new Error(`No idea ${name}`);
  return { bcdx, ideaId: idea.id };
}

/** The plan of an idea named `name`, archived ones included (P1). */
async function planNamed(page: Page, ideaId: string, name: string) {
  const plans = (await (
    await page.request.get(`/api/v1/ideas/${ideaId}/plans?includeArchived=true`)
  ).json()) as { items: PlanSummary[] };
  const plan = plans.items.find((candidate) => candidate.name === name);
  if (plan === undefined) throw new Error(`No plan ${name}`);
  return plan;
}

/** BCDX's Piaya Gift Box Delivery and the paths of its Plan A, as the seed makes them (8.2). */
async function piayaPlanA(page: Page, me: Me) {
  const { bcdx, ideaId } = await bcdxIdea(page, me, "Piaya Gift Box Delivery");
  const planA = await planNamed(page, ideaId, "Plan A");
  const idea = `/w/${bcdx.id}/ideas/${ideaId}`;
  const plan = `${idea}/plans/${planA.id}`;
  return { bcdx, ideaId, idea, plan };
}

/** The worker's account with a new idea, recorded Proceed, and its draft Plan A (P1). */
async function ownPlan(
  page: Page,
  signIn: (email: string, password?: string) => Promise<Me>,
  account: Account,
) {
  const me = await signIn(account.email, account.password);
  const personal = me.memberships.find(({ workspace }) => workspace.isPersonal);
  if (personal === undefined) throw new Error("No personal workspace");
  const headers = { Origin: WEB_ORIGIN };
  const created = await page.request.post(
    `/api/v1/workspaces/${personal.workspace.id}/ideas`,
    {
      data: {
        name: "Piaya Picnic Boxes",
        oneLineConcept: "Picnic boxes of piaya for park days.",
      },
      headers,
    },
  );
  expect(created.status(), await created.text()).toBe(201);
  const idea = (await created.json()) as IdeaDetail;
  const decided = await page.request.post(
    `/api/v1/ideas/${idea.id}/decisions`,
    {
      data: {
        value: "proceed",
        reason: "Worth a full plan.",
        basedOnDecisionId: null,
      },
      headers,
    },
  );
  expect(decided.status(), await decided.text()).toBe(201);
  const drafted = await page.request.post(`/api/v1/ideas/${idea.id}/plans`, {
    data: { name: "Plan A" },
    headers,
  });
  expect(drafted.status(), await drafted.text()).toBe(201);
  const { id: planId } = (await drafted.json()) as { id: string };
  const ideaPath = `/w/${personal.workspace.id}/ideas/${idea.id}`;
  return {
    ideaId: idea.id,
    planId,
    idea: ideaPath,
    plan: `${ideaPath}/plans/${planId}`,
  };
}

test.describe("on a desktop", () => {
  test.use(desktop);

  test("13 → 20 by a Plans row and by an archived one after Show; 7 → 20 a saved version, read only", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.owner);
    const { bcdx, ideaId, idea, plan } = await piayaPlanA(page, me);

    await test.step("13 → 20 (Plans: Plan A)", async () => {
      await page.goto(idea);
      await block(page, "Plans")
        .getByRole("link", { name: /^Plan A/ })
        .click();
      await expect(page).toHaveURL(`${WEB_ORIGIN}${plan}`);
      await expectHeading(page, "Plan A");
    });

    await test.step("13 → 20 (1 archived plan · Show: Plan B, read only)", async () => {
      const cafe = await bcdxIdea(page, me, "Student Study Café");
      const planB = await planNamed(page, cafe.ideaId, "Plan B");
      await page.goto(`/w/${bcdx.id}/ideas/${cafe.ideaId}`);
      const plans = block(page, "Plans");
      await expect(plans).toContainText("1 archived plan");
      await plans.getByRole("link", { name: "Show" }).click();
      await plans.getByRole("link", { name: /^Plan B/ }).click();
      await expect(page).toHaveURL(
        `${WEB_ORIGIN}/w/${bcdx.id}/ideas/${cafe.ideaId}/plans/${planB.id}`,
      );
      await expectHeading(page, "Plan B");
      await expect(page.getByText("This plan is archived")).toBeVisible();
      await expect(page.getByRole("button", { name: "Restore" })).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Record Go / No-Go" }),
      ).toHaveCount(0);
    });

    await test.step("7 → 20 (Open this version: v1 For advisors, read only)", async () => {
      await page.goto(
        `/w/${bcdx.id}/decisions?kind=version_saved&idea=${ideaId}`,
      );
      await expectHeading(page, "Decision Log");
      await page
        .getByRole("grid", { name: "Decisions" })
        .getByRole("row")
        .filter({ hasText: "v1 For advisors" })
        .click();
      await expect(
        page.getByRole("heading", { level: 2, name: "v1 For advisors" }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Open this version" }).click();
      await expect(page).toHaveURL(
        new RegExp(`^${WEB_ORIGIN}${plan}\\?version=[0-9a-f-]+$`),
      );
      await expectHeading(page, "Plan A");
      await expect(
        page.getByText("Viewing v1 For advisors (read only)"),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Record Go / No-Go" }),
      ).toHaveCount(0);
    });
  });

  test("a Member fixes the numbers in validation: 20 / 21 / 23 → 17 / 18 by Edit in validation, 23 → 21 by Edit source", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.member);
    const { idea, plan } = await piayaPlanA(page, me);

    await test.step("20 → 18 (Key numbers: Edit in validation)", async () => {
      await page.goto(plan);
      await block(page, "Key numbers")
        .getByRole("link", { name: "Edit in validation" })
        .click();
      await expect(page).toHaveURL(`${WEB_ORIGIN}${idea}/economics`);
      await expectHeading(page, "06–08 Unit Economics & Scenarios");
    });

    // With Focus on, a number sub-item is a quiet row until it is pressed (4.1 C).
    const openSubItem = async (title: string) => {
      await page.getByRole("button", { name: title, exact: true }).click();
      return block(page, title);
    };

    await test.step("21 → 18 (§8 Average selling price: Edit in validation)", async () => {
      await page.goto(`${plan}/items/8`);
      await expectHeading(page, "8 Business Model");
      await (await openSubItem("Average selling price"))
        .getByRole("link", { name: "Edit in validation" })
        .click();
      await expect(page).toHaveURL(
        `${WEB_ORIGIN}${idea}/economics?field=selling_price`,
      );
      await expectHeading(page, "06–08 Unit Economics & Scenarios");
    });

    await test.step("21 → 17 (§8 Variable cost per sale: Edit in validation)", async () => {
      await page.goto(`${plan}/items/8`);
      await expectHeading(page, "8 Business Model");
      await (await openSubItem("Variable cost per sale"))
        .getByRole("link", { name: "Edit in validation" })
        .click();
      await expect(page).toHaveURL(`${WEB_ORIGIN}${idea}/costs`);
      await expectHeading(page, "05 Costs");
    });

    const slides = page.getByRole("listbox", { name: "Slides" });

    await test.step("23 → 21 (title slide: Edit source)", async () => {
      await page.goto(`${plan}/pitch`);
      await expectHeading(page, "Pitch Deck");
      await page.getByRole("link", { name: "Edit source" }).click();
      await expect(page).toHaveURL(`${WEB_ORIGIN}${plan}/items/1`);
      await expectHeading(page, "1 Executive Summary");
    });

    await test.step("23 → 18 (one-minute Business model: Edit in validation)", async () => {
      await page.goto(`${plan}/pitch`);
      await slides.getByRole("option", { name: "6 Business model" }).click();
      await page.getByRole("link", { name: "Edit in validation" }).click();
      await expect(page).toHaveURL(`${WEB_ORIGIN}${idea}/economics`);
      await expectHeading(page, "06–08 Unit Economics & Scenarios");
    });

    await test.step("23 → 17 (five-minute Economics: Edit in validation)", async () => {
      await page.goto(`${plan}/pitch?variant=five`);
      await slides.getByRole("option", { name: "8 Economics" }).click();
      await page.getByRole("link", { name: "Edit in validation" }).click();
      await expect(page).toHaveURL(`${WEB_ORIGIN}${idea}/costs`);
      await expectHeading(page, "05 Costs");
    });
  });

  test("a Viewer opens the numbers in validation: 20 / 21 → 18 and 21 → 17 by Open in validation", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.viewer);
    const { idea, plan } = await piayaPlanA(page, me);

    await test.step("20 → 18 (Key numbers: Open in validation)", async () => {
      await page.goto(plan);
      await expectHeading(page, "Plan A");
      await block(page, "Key numbers")
        .getByRole("link", { name: "Open in validation" })
        .click();
      await expect(page).toHaveURL(`${WEB_ORIGIN}${idea}/economics`);
      await expectHeading(page, "06–08 Unit Economics & Scenarios");
    });

    await test.step("21 → 18 (§1 Key numbers: Open in validation)", async () => {
      await page.goto(`${plan}/items/1`);
      await expectHeading(page, "1 Executive Summary");
      await block(page, "Key numbers")
        .getByRole("link", { name: "Open in validation" })
        .click();
      await expect(page).toHaveURL(`${WEB_ORIGIN}${idea}/economics`);
      await expectHeading(page, "06–08 Unit Economics & Scenarios");
    });

    await test.step("21 → 17 (§18 Expected monthly payroll: Open in validation)", async () => {
      await page.goto(`${plan}/items/18`);
      await expectHeading(page, "18 People & Hiring");
      await block(page, "Expected monthly payroll")
        .getByRole("link", { name: "Open in validation" })
        .click();
      await expect(page).toHaveURL(
        `${WEB_ORIGIN}${idea}/costs?row=monthly.salaries`,
      );
      await expectHeading(page, "05 Costs");
    });
  });

  test("an Owner's archived idea opens the numbers in validation: 20 / 21 → 18 and 21 → 17 by Open in validation", async ({
    page,
    signIn,
    account,
  }) => {
    const { ideaId, idea, plan } = await ownPlan(page, signIn, account);
    const archived = await page.request.post(
      `/api/v1/ideas/${ideaId}/archive`,
      { data: {}, headers: { Origin: WEB_ORIGIN } },
    );
    expect(archived.status(), await archived.text()).toBe(200);

    await test.step("20 → 18 (Key numbers: Open in validation, archived)", async () => {
      await page.goto(plan);
      await expectHeading(page, "Plan A");
      await expect(page.getByText("This idea is archived")).toBeVisible();
      await block(page, "Key numbers")
        .getByRole("link", { name: "Open in validation" })
        .click();
      await expect(page).toHaveURL(`${WEB_ORIGIN}${idea}/economics`);
      await expectHeading(page, "06–08 Unit Economics & Scenarios");
    });

    await test.step("21 → 18 (§1 Key numbers: Open in validation, archived)", async () => {
      await page.goto(`${plan}/items/1`);
      await expectHeading(page, "1 Executive Summary");
      await block(page, "Key numbers")
        .getByRole("link", { name: "Open in validation" })
        .click();
      await expect(page).toHaveURL(`${WEB_ORIGIN}${idea}/economics`);
      await expectHeading(page, "06–08 Unit Economics & Scenarios");
    });

    await test.step("21 → 17 (§20 Startup cost: Open in validation, archived)", async () => {
      await page.goto(`${plan}/items/20`);
      await expectHeading(page, "20 Financial Plan");
      await block(page, "Startup cost")
        .getByRole("link", { name: "Open in validation" })
        .click();
      await expect(page).toHaveURL(`${WEB_ORIGIN}${idea}/costs`);
      await expectHeading(page, "05 Costs");
    });
  });

  test("21 → 22 by Open in Execution from §23, §25, §26 and §28, each on its tab", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.viewer);
    const { plan } = await piayaPlanA(page, me);
    for (const [itemNo, item, tab, tabName] of [
      [23, "Pre-launch Milestones", "milestones", "Milestones"],
      [25, "Launch Plan", "launch", "Launch"],
      [26, "KPI Scorecard", "kpis", "KPIs"],
      [28, "Open Questions", "questions", "Open Questions"],
    ] as const) {
      await test.step(`21 → 22 (§${itemNo} ${item}: Open in Execution)`, async () => {
        await page.goto(`${plan}/items/${itemNo}`);
        await expectHeading(page, `${itemNo} ${item}`);
        await page.getByRole("link", { name: "Open in Execution" }).click();
        await expect(page).toHaveURL(
          `${WEB_ORIGIN}${plan}/execution?tab=${tab}`,
        );
        await expectHeading(page, "Execution");
        await expect(
          page.getByRole("tab", { name: tabName, selected: true }),
        ).toBeVisible();
      });
    }
  });

  test("21's References open where the whole of each is: 11, 14, 15, 16, 17, 18 and 7", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.viewer);
    const { bcdx, ideaId, idea, plan } = await piayaPlanA(page, me);

    /** Opens §`itemNo`'s reference `title` and follows its link `label`. */
    const follow = async (
      itemNo: number,
      itemTitle: string,
      title: string,
      label = "Open in validation",
    ) => {
      await page.goto(`${plan}/items/${itemNo}`);
      await expectHeading(page, `${itemNo} ${itemTitle}`);
      // Each reference is a closed Disclosure: its link shows once it is opened.
      await page.getByRole("button", { name: title, exact: true }).click();
      await page
        .getByRole("group", { name: title, exact: true })
        .getByRole("link", { name: label })
        .click();
    };

    await test.step("21 → 11 (§3 Validation · 01 Customer & Problem)", async () => {
      await follow(3, "Customer", "Validation · 01 Customer & Problem");
      await expect(page).toHaveURL(`${WEB_ORIGIN}${idea}/questions/01`);
      await expectHeading(page, "01 Customer & Problem");
    });

    await test.step("21 → 14 (§14 Research Log · Permits)", async () => {
      await follow(14, "Legal & Company Setup", "Research Log · Permits");
      await expect(page).toHaveURL(`${WEB_ORIGIN}${idea}/research`);
      await expectHeading(page, "03 Research Log");
    });

    await test.step("21 → 15 (§7 Competitors)", async () => {
      await follow(7, "Positioning & Value Proposition", "Competitors");
      await expect(page).toHaveURL(`${WEB_ORIGIN}${idea}/competitors`);
      await expectHeading(page, "04 Competitors");
    });

    await test.step("21 → 16 (§21 Assumptions)", async () => {
      await follow(21, "Key Assumptions", "Assumptions");
      await expect(page).toHaveURL(
        `${WEB_ORIGIN}${idea}/assumptions?tab=assumptions`,
      );
      await expectHeading(page, "09 Assumptions & Risks");
    });

    await test.step("21 → 17 (§14 Costs)", async () => {
      await follow(14, "Legal & Company Setup", "Costs");
      await expect(page).toHaveURL(`${WEB_ORIGIN}${idea}/costs`);
      await expectHeading(page, "05 Costs");
    });

    await test.step("21 → 18 (§17 Key numbers)", async () => {
      await follow(17, "Operations", "Key numbers");
      await expect(page).toHaveURL(`${WEB_ORIGIN}${idea}/economics`);
      await expectHeading(page, "06–08 Unit Economics & Scenarios");
    });

    await test.step("21 → 7 (§12 Decision log: Open Decision Log)", async () => {
      await follow(
        12,
        "Decision Making & Governance",
        "Decision log",
        "Open Decision Log",
      );
      await expect(page).toHaveURL(
        `${WEB_ORIGIN}/w/${bcdx.id}/decisions?idea=${ideaId}`,
      );
      await expectHeading(page, "Decision Log");
    });
  });

  test("M4 → M3 by Save a version; closing M3 brings M4 back with its choice and reason", async ({
    page,
    signIn,
    account,
  }) => {
    const { planId, plan } = await ownPlan(page, signIn, account);
    const version = await page.request.post(
      `/api/v1/plans/${planId}/versions`,
      { data: { name: "v1" }, headers: { Origin: WEB_ORIGIN } },
    );
    expect(version.status(), await version.text()).toBe(201);
    await page.goto(plan);
    await expectHeading(page, "Plan A");
    // A change after v1 is what makes M4 offer to save a version (6.12 M4).
    const headerSaved = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        response.url().endsWith(`/api/v1/plans/${planId}`) &&
        response.ok(),
    );
    await page.getByRole("textbox", { name: "Prepared by" }).fill("The team");
    await headerSaved;
    await expect(
      page.getByText(/^Version: v1 \+ changes · Updated/),
    ).toBeVisible();

    const goNoGo = page.getByRole("dialog", { name: "Record Go / No-Go" });
    const save = page.getByRole("dialog", { name: "Save version" });
    const delay = goNoGo.getByRole("radio", { name: "Delay" });
    const reason = goNoGo.getByRole("textbox", { name: /Why\?/ });

    await test.step("20 → M4 (Record Go / No-Go): Delay and a reason", async () => {
      await page.getByRole("button", { name: "Record Go / No-Go" }).click();
      await expect(page).toHaveURL(`${WEB_ORIGIN}${plan}?modal=go-no-go`);
      await press(delay);
      await reason.fill("Permits come first.");
    });

    await test.step("M4 → M3 (Save a version)", async () => {
      await expect(
        goNoGo.getByText(
          "The plan has changed since v1 was saved. Save a version first?",
        ),
      ).toBeVisible();
      await goNoGo.getByRole("link", { name: "Save a version" }).click();
      await expect(page).toHaveURL(`${WEB_ORIGIN}${plan}?modal=save-version`);
      await expect(save).toBeVisible();
      await expect(goNoGo).toBeHidden();
    });

    await test.step("M3 → M4 (Cancel): the choice and the reason kept", async () => {
      await save.getByRole("button", { name: "Cancel" }).click();
      await expect(save).toBeHidden();
      await expect(page).toHaveURL(`${WEB_ORIGIN}${plan}?modal=go-no-go`);
      await expect(goNoGo).toBeVisible();
      await expect(delay).toBeChecked();
      await expect(reason).toHaveValue("Permits come first.");
    });

    await test.step("M4 → M3 → M4 (Save version): v2 saved, the choice and the reason kept", async () => {
      await goNoGo.getByRole("link", { name: "Save a version" }).click();
      const name = save.getByRole("textbox", { name: /Version name/ });
      await expect(name).toHaveValue("v2");
      await save.getByRole("button", { name: "Save version" }).click();
      await expect(save).toBeHidden();
      await expect(page.getByText("v2 saved")).toBeVisible();
      await expect(page).toHaveURL(`${WEB_ORIGIN}${plan}?modal=go-no-go`);
      await expect(goNoGo).toBeVisible();
      await expect(goNoGo.getByText("v2", { exact: true })).toBeVisible();
      await expect(goNoGo.getByText(/Save a version first\?/)).toHaveCount(0);
      await expect(delay).toBeChecked();
      await expect(reason).toHaveValue("Permits come first.");
      await goNoGo.getByRole("button", { name: "Record" }).click();
      await expect(goNoGo).toBeHidden();
      await expect(page.getByText("Go / No-Go recorded")).toBeVisible();
      await expect(block(page, "Go / No-Go")).toContainText("Delay");
    });
  });
});
