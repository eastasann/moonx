import type {
  CostItem,
  IdeaDetail,
  Me,
  ValidationHome,
  Workspace,
} from "@moonx/schemas";
import type { Page } from "@playwright/test";
import { WEB_ORIGIN } from "./env";
import {
  type Account,
  test as base,
  demo,
  expect,
  linkMailedTo,
  operatorInvited,
  signUpThroughApi,
  uniqueEmail,
  workspaceOf,
} from "./fixtures";

// The transitions of docs/screen_flow.mermaid around validation (lines 7 and 86〜116)
// that validation.spec.ts and ideas.spec.ts do not walk: 13's Sections rows, the section
// switch ▼ of 11 and 14〜18, 18 → 17, Log research, Fact on 17 and 18, M2's new entry in
// 14, 19's Drop, Cancel and Last decision, the copy from 6's ⋯, and where each kind of
// 13's Next steps leads (design-spec 6.1), for a Viewer too. Each test walks them by their
// controls as a person would; the seeded BCDX is read only, and what writes does so in an
// idea of the worker's own account, shaped through the API between the screens.

const test = base.extend<object, { account: Account }>({
  account: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures a fixture needs from this pattern, and this one needs none.
    async ({}, use, workerInfo) => {
      await use(
        await operatorInvited(workerInfo.workerIndex, "flow-validation"),
      );
    },
    { scope: "worker" },
  ],
});

const desktop = { viewport: { width: 1440, height: 900 } };

/** The section of a hub a block's heading names. */
const block = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true });

/** A question of 11 by its title ("WHO"). */
const question = (page: Page, title: string) =>
  page.getByRole("region", { name: title, exact: true });

/**
 * Presses a Checkbox or Radio by its row: React Aria's input is hidden under the box, which
 * takes the pointer, as for a person.
 */
const press = (control: ReturnType<Page["getByRole"]>) =>
  control.locator("xpath=ancestor::label[1]").click();

/** The level-1 heading a screen is named by. */
const title = (page: Page, name: string) =>
  page.getByRole("heading", { level: 1, name, exact: true });

/** Moves to `section` with the ▼ beside the screen's title (design-spec 5章「検証の中の移動」). */
async function switchSection(page: Page, section: string) {
  await page.getByRole("button", { name: "Switch section" }).click();
  await page
    .getByRole("menu")
    .getByRole("menuitem", { name: section, exact: true })
    .click();
}

/**
 * The account, signed in, with a new idea named `name` in its personal workspace (I1),
 * which only the tests of this worker write in.
 */
async function ownIdea(
  page: Page,
  signIn: (email: string, password?: string) => Promise<Me>,
  account: Account,
  name: string,
) {
  const me = await signIn(account.email, account.password);
  const workspace = me.memberships.find(
    ({ workspace }) => workspace.isPersonal,
  )?.workspace;
  if (workspace === undefined) throw new Error("No personal workspace");
  const created = await page.request.post(
    `/api/v1/workspaces/${workspace.id}/ideas`,
    {
      data: { name, oneLineConcept: `${name}, in one line.` },
      headers: { Origin: WEB_ORIGIN },
    },
  );
  expect(created.status(), await created.text()).toBe(201);
  const idea = (await created.json()) as IdeaDetail;
  return { workspace, idea, home: `/w/${workspace.id}/ideas/${idea.id}` };
}

/** A name no other test of the run uses, as the worker's tests share one workspace. */
const uniqueName = (label: string) =>
  `${label} ${Date.now() % 1_000_000}${Math.floor(Math.random() * 100)}`;

test.describe("moving through a validation on a desktop", () => {
  test.use(desktop);

  test("13's Sections rows open 11 and 18, and ▼ walks 11 → 14 → 15 → 16 → 17 → 18 → 11", async ({
    page,
    signIn,
    account,
  }) => {
    const { home } = await ownIdea(
      page,
      signIn,
      account,
      uniqueName("Sections Tour"),
    );
    await page.goto(home);

    await test.step("13 → 11 (Sections: 10 Final Assessment)", async () => {
      await block(page, "Sections")
        .getByRole("link", { name: /^10 Final Assessment/ })
        .click();
      await expect(page).toHaveURL(new RegExp(`${home}/questions/10$`));
      await expect(title(page, "10 Final Assessment")).toBeVisible();
    });
    await test.step("11 → 14 (▼: 03 Research Log)", async () => {
      await switchSection(page, "03 Research Log");
      await expect(page).toHaveURL(new RegExp(`${home}/research$`));
      await expect(title(page, "03 Research Log")).toBeVisible();
    });
    await test.step("14 → 15 (▼: 04 Competitors)", async () => {
      await switchSection(page, "04 Competitors");
      await expect(page).toHaveURL(new RegExp(`${home}/competitors$`));
      await expect(title(page, "04 Competitors")).toBeVisible();
    });
    await test.step("15 → 16 (▼: 09 Assumptions & Risks)", async () => {
      await switchSection(page, "09 Assumptions & Risks");
      await expect(page).toHaveURL(new RegExp(`${home}/assumptions$`));
      await expect(title(page, "09 Assumptions & Risks")).toBeVisible();
    });
    await test.step("16 → 17 (▼: 05 Costs)", async () => {
      await switchSection(page, "05 Costs");
      await expect(page).toHaveURL(new RegExp(`${home}/costs$`));
      await expect(title(page, "05 Costs")).toBeVisible();
    });
    await test.step("17 → 18 (▼: 06–08 Unit Economics)", async () => {
      await switchSection(page, "06–08 Unit Economics");
      await expect(page).toHaveURL(new RegExp(`${home}/economics$`));
      await expect(
        title(page, "06–08 Unit Economics & Scenarios"),
      ).toBeVisible();
    });
    await test.step("18 → 11 (▼: 01 Customer & Problem)", async () => {
      await switchSection(page, "01 Customer & Problem");
      await expect(page).toHaveURL(new RegExp(`${home}/questions/01$`));
      await expect(title(page, "01 Customer & Problem")).toBeVisible();
    });

    await page.goto(home);
    await test.step("13 → 11 (Sections: 02 Market)", async () => {
      await block(page, "Sections")
        .getByRole("link", { name: /^02 Market/ })
        .click();
      await expect(page).toHaveURL(new RegExp(`${home}/questions/02$`));
      await expect(title(page, "02 Market")).toBeVisible();
    });

    await page.goto(home);
    await test.step("13 → 18 (Sections: 06–08 Unit Economics)", async () => {
      await block(page, "Sections")
        .getByRole("link", { name: /^06–08 Unit Economics/ })
        .click();
      await expect(page).toHaveURL(new RegExp(`${home}/economics$`));
      await expect(
        title(page, "06–08 Unit Economics & Scenarios"),
      ).toBeVisible();
    });
    await test.step("18 → 17 (Costs from 05: Costs)", async () => {
      await page.getByRole("link", { name: "Costs", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${home}/costs$`));
      await expect(title(page, "05 Costs")).toBeVisible();
    });
  });

  test("11's Log research opens 14's new entry; an entry made in M2 is in 14's list", async ({
    page,
    signIn,
    account,
  }) => {
    const { home } = await ownIdea(
      page,
      signIn,
      account,
      uniqueName("Evidence Tour"),
    );
    await page.goto(`${home}/questions/01`);
    const who = question(page, "WHO");

    await test.step("11 → 14 (Log research)", async () => {
      // The first question not answered, WHO, is open with its Related research.
      await who.getByRole("link", { name: "Log research" }).click();
      await expect(page).toHaveURL(new RegExp(`${home}/research\\?new=1$`));
      await expect(title(page, "03 Research Log")).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "New entry" }),
      ).toBeVisible();
    });

    await page.goto(`${home}/questions/01`);
    await page
      .getByRole("textbox", { name: "Answer to WHO" })
      .fill("Families who picnic in the plaza on Sundays.");
    const topic = uniqueName("Plaza head count");
    await test.step("11 → M2 (Fact): a new entry added and attached", async () => {
      await who.getByRole("radio", { name: /Fact/ }).click();
      const sheet = page.getByRole("dialog", { name: "Evidence" });
      await expect(sheet).toBeVisible();
      await sheet.getByRole("radio", { name: "New entry" }).click();
      await sheet.getByRole("textbox", { name: /Topic/ }).fill(topic);
      await press(
        sheet.getByRole("checkbox", { name: "Demand or problem signal" }),
      );
      await sheet.getByRole("button", { name: "Add and attach" }).click();
      await expect(
        sheet.getByRole("row", { name: new RegExp(topic) }),
      ).toBeVisible();
      await sheet.getByRole("button", { name: "Done" }).click();
      await expect(sheet).toHaveCount(0);
      await expect(who).toContainText("Fact · 1 source");
    });
    await test.step("M2 → 14 (the new entry stays in 14; reached by ▼)", async () => {
      await switchSection(page, "03 Research Log");
      await expect(page).toHaveURL(new RegExp(`${home}/research$`));
      await expect(title(page, "03 Research Log")).toBeVisible();
      await expect(
        page
          .getByRole("grid", { name: "Research Log" })
          .getByRole("row", { name: new RegExp(topic) }),
      ).toBeVisible();
    });
  });

  test("Fact on 17's amount and on 18's price opens M2", async ({
    page,
    signIn,
    account,
  }) => {
    const { home } = await ownIdea(
      page,
      signIn,
      account,
      uniqueName("Numbers Tour"),
    );
    const evidence = page.getByRole("dialog", { name: "Evidence" });

    await page.goto(`${home}/costs`);
    await page
      .getByRole("grid", { name: "Startup costs", exact: true })
      .getByRole("row")
      .filter({ hasText: "Equipment" })
      .getByText("Empty")
      .first()
      .click();
    await page
      .getByRole("textbox", { name: "Amount of Equipment" })
      .fill("35,000");
    await expect(page.getByText("Saved")).toBeVisible();
    await test.step("17 → M2 (Fact on Equipment)", async () => {
      await page
        .getByRole("button", { name: "F/A/U of Equipment: Unclassified" })
        .click();
      await page
        .getByRole("dialog", { name: "F/A/U of Equipment" })
        .getByRole("radio", { name: "Fact" })
        .click();
      await expect(page).toHaveURL(/modal=evidence&about=cost_item/);
      await expect(evidence).toContainText("Costs · Equipment");
    });

    await page.goto(`${home}/economics?field=selling_price`);
    await page.getByRole("textbox", { name: "Value of Price" }).fill("300");
    await expect(page.getByText("Saved")).toBeVisible();
    await test.step("18 → M2 (Fact on Price)", async () => {
      await page
        .getByRole("button", { name: "F/A/U of Price: Unclassified" })
        .click();
      await page
        .getByRole("dialog", { name: "F/A/U of Price" })
        .getByRole("radio", { name: "Fact" })
        .click();
      await expect(page).toHaveURL(/modal=evidence&about=economics_input/);
      await expect(evidence).toContainText("Unit Economics · Price");
    });
  });

  test("19 goes back to 13 by Cancel and by recording Drop", async ({
    page,
    signIn,
    account,
  }) => {
    const name = uniqueName("Decision Tour");
    const { home } = await ownIdea(page, signIn, account, name);
    await page.goto(home);
    const record = page.getByRole("button", { name: "Record decision" });

    await record.click();
    await expect(page).toHaveURL(new RegExp(`${home}/decide$`));
    await test.step("19 → 13 (Cancel)", async () => {
      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(page).toHaveURL(`${WEB_ORIGIN}${home}`);
      await expect(title(page, name)).toBeVisible();
    });

    await record.click();
    await expect(title(page, "Record a decision")).toBeVisible();
    await test.step("19 → 13 (Drop)", async () => {
      await press(page.getByRole("radio", { name: /^Drop/ }));
      await page
        .getByRole("textbox", { name: /Why\?/ })
        .fill("Too few people pass the plaza on weekdays.");
      await record.click();
      await expect(page).toHaveURL(`${WEB_ORIGIN}${home}`);
      await expect(title(page, name)).toBeVisible();
      // design-spec 6.5「記録の後（Hold / Drop）」.
      await expect(page.getByText("Decision recorded")).toBeVisible();
      await expect(block(page, "Decisions")).toContainText("Drop");
    });
  });

  test("6's ⋯ Duplicate opens the copy's 13", async ({
    page,
    signIn,
    account,
  }) => {
    const name = uniqueName("Copy Tour");
    const { workspace, idea } = await ownIdea(page, signIn, account, name);
    await page.goto(`/w/${workspace.id}/ideas`);
    const list = page.getByRole("grid", { name: "Ideas" });

    await test.step("6 → 13 of the copy (row ⋯: Duplicate)", async () => {
      await list.getByRole("row", { name: new RegExp(name) }).hover();
      await list.getByRole("button", { name: `More for ${name}` }).click();
      await page.getByRole("menuitem", { name: "Duplicate" }).click();
      await expect(title(page, `${name} (copy)`)).toBeVisible();
      await expect(page).toHaveURL(
        new RegExp(`/w/${workspace.id}/ideas/[0-9a-f-]+$`),
      );
      expect(page.url()).not.toContain(idea.id);
    });
  });
});

/** Sends a write of the API with the page's session and returns what it answers. */
async function send<T>(
  page: Page,
  method: "post" | "patch" | "put" | "delete",
  path: string,
  data?: unknown,
): Promise<T> {
  const response = await page.request[method](path, {
    data,
    // A bodyless DELETE is declared JSON too, as every state change must be (SDD 7.2 CSRF).
    headers: { Origin: WEB_ORIGIN, "Content-Type": "application/json" },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (response.status() === 204 ? undefined : await response.json()) as T;
}

/** An Assumption of Medium confidence: a value classified, so not "Classify answers". */
const assumed = { fau: "assumption", confidence: "medium" } as const;

/** The validation of an idea (V1), with its id and Next steps. */
const validationOf = async (page: Page, ideaId: string) =>
  (await (
    await page.request.get(`/api/v1/ideas/${ideaId}/validation`)
  ).json()) as ValidationHome;

/** The cost rows of a validation (V12), at the versions they have now. */
const costRows = async (page: Page, validationId: string) =>
  (
    (await (
      await page.request.get(`/api/v1/validations/${validationId}/costs`)
    ).json()) as { items: CostItem[] }
  ).items;

/** Adds the competitors of 15 (V8), with the typical prices given. */
async function addCompetitors(
  page: Page,
  validationId: string,
  prices: (number | null)[],
) {
  for (const [index, typicalPrice] of prices.entries()) {
    await send(
      page,
      "post",
      `/api/v1/validations/${validationId}/competitors`,
      {
        name: `Competitor ${index + 1}`,
        typicalPrice,
      },
    );
  }
}

/** Saves `change` on the cost row named `name` (V14), at the version it has now. */
async function saveRow(
  page: Page,
  validationId: string,
  name: string,
  change: Record<string, unknown>,
) {
  const row = (await costRows(page, validationId)).find(
    (candidate) => candidate.name === name,
  );
  if (row === undefined) throw new Error(`No cost row ${name}`);
  await send(page, "patch", `/api/v1/cost-items/${row.id}`, {
    ...change,
    lockVersion: row.lockVersion,
  });
  return row;
}

/** Marks every startup and monthly row without a value Unknown: none is left Empty. */
async function markEmptyRowsUnknown(page: Page, validationId: string) {
  for (const row of await costRows(page, validationId)) {
    if (row.category === "variable" || row.amount !== null) continue;
    await send(page, "patch", `/api/v1/cost-items/${row.id}`, {
      classification: { fau: "unknown" },
      lockVersion: row.lockVersion,
    });
  }
}

/** The idea of BCDX named `name`, archived and dropped ones included (I1). */
async function bcdxIdea(page: Page, me: Me, name: string) {
  const bcdx = workspaceOf(me, "BCDX");
  const listed = await page.request.get(
    `/api/v1/workspaces/${bcdx.id}/ideas?decision=all&includeArchived=true`,
  );
  const idea = (
    (await listed.json()) as { items: { id: string; name: string }[] }
  ).items.find((candidate) => candidate.name === name);
  if (idea === undefined) throw new Error(`No idea ${name}`);
  return { bcdx, ideaId: idea.id, home: `/w/${bcdx.id}/ideas/${idea.id}` };
}

/** 13's Next steps, the items in their order. */
const nextSteps = (page: Page) =>
  block(page, "Next steps").getByRole("listitem");

/** The Next step whose label holds `label`, as a link. */
const nextStep = (page: Page, label: string) =>
  block(page, "Next steps").getByRole("link", { name: label });

test.describe("13's Next steps on a desktop (design-spec 6.1)", () => {
  test.use(desktop);

  test("each kind of check opens its screen, as the idea fills in step by step", async ({
    page,
    signIn,
    account,
  }) => {
    // Some twenty saves through the API between the screens.
    test.slow();
    const { idea, home } = await ownIdea(
      page,
      signIn,
      account,
      uniqueName("Next Steps Tour"),
    );
    const { validationId } = await validationOf(page, idea.id);
    const fromHome = async (label: string) => {
      await page.goto(home);
      await nextStep(page, label).click();
    };

    await page.goto(home);
    await expect(nextSteps(page)).toHaveText([
      /^Start with 01 Customer & Problem/,
      /^Find 3 competitors/,
      /^Add local prices/,
    ]);
    await test.step("13 → 11 (Next steps: Start with 01 Customer & Problem)", async () => {
      await nextStep(page, "Start with 01 Customer & Problem").click();
      await expect(page).toHaveURL(new RegExp(`${home}/questions/01$`));
      await expect(title(page, "01 Customer & Problem")).toBeVisible();
    });
    await test.step("13 → 15 (Next steps: Find 3 competitors)", async () => {
      await fromHome("Find 3 competitors");
      await expect(page).toHaveURL(new RegExp(`${home}/competitors$`));
      await expect(title(page, "04 Competitors")).toBeVisible();
    });
    await test.step("13 → 15 (Next steps: Add local prices)", async () => {
      await fromHome("Add local prices");
      await expect(page).toHaveURL(new RegExp(`${home}/competitors$`));
      await expect(title(page, "04 Competitors")).toBeVisible();
    });

    // Checks 1 and 2 done: three competitors, two of them priced.
    await addCompetitors(page, validationId, [180, 220, null]);
    await page.goto(home);
    await expect(nextSteps(page)).toHaveText([
      /^Fill or mark \d+ empty cost rows/,
      /^Add price and monthly costs/,
      /^Check permits/,
    ]);
    await test.step("13 → 17 (Next steps: Fill or mark n empty cost rows)", async () => {
      await nextStep(page, "empty cost rows").click();
      await expect(page).toHaveURL(new RegExp(`${home}/costs$`));
      await expect(title(page, "05 Costs")).toBeVisible();
    });
    await test.step("13 → 18 (Next steps: Add price and monthly costs, no price)", async () => {
      await fromHome("Add price and monthly costs");
      await expect(page).toHaveURL(new RegExp(`${home}/economics$`));
      await expect(
        title(page, "06–08 Unit Economics & Scenarios"),
      ).toBeVisible();
    });
    const permits = (await costRows(page, validationId)).find(
      (row) => row.templateKey === "initial.permits",
    );
    if (permits === undefined) throw new Error("No Permits row");
    await test.step("13 → 17's Permits row (Next steps: Check permits)", async () => {
      await fromHome("Check permits");
      await expect(page).toHaveURL(
        new RegExp(`${home}/costs\\?row=${permits.id}$`),
      );
      await expect(
        page.getByRole("textbox", { name: "Amount of Permits / Registration" }),
      ).toBeFocused();
    });

    // No row left Empty, and neither table has an amount.
    await markEmptyRowsUnknown(page, validationId);
    await page.goto(home);
    await expect(nextSteps(page).first()).toHaveText(
      /^Add startup and monthly costs/,
    );
    await test.step("13 → 17 (Next steps: Add startup and monthly costs)", async () => {
      await nextStep(page, "Add startup and monthly costs").click();
      await expect(page).toHaveURL(new RegExp(`${home}/costs$`));
      await expect(title(page, "05 Costs")).toBeVisible();
    });

    // A price, and still no monthly costs: the break-even is fixed on 17.
    await send(
      page,
      "put",
      `/api/v1/validations/${validationId}/economics/selling_price`,
      { value: 100, classification: assumed, lockVersion: 0 },
    );
    await test.step("13 → 17 (Next steps: Add price and monthly costs, with a price)", async () => {
      await fromHome("Add price and monthly costs");
      await expect(page).toHaveURL(new RegExp(`${home}/costs$`));
      await expect(title(page, "05 Costs")).toBeVisible();
    });

    // Monthly costs, and a sale costing more than its price: the margin is below zero.
    await saveRow(page, validationId, "Rent", {
      amount: 10_000,
      classification: assumed,
    });
    await saveRow(page, validationId, "Core Product / Materials", {
      amount: 150,
      classification: assumed,
    });
    await page.goto(home);
    await expect(nextSteps(page)).toHaveText([
      /^Add startup and monthly costs/,
      /^Review price or variable costs/,
      /^Check permits/,
    ]);
    await test.step("13 → 18 (Next steps: Review price or variable costs)", async () => {
      await nextStep(page, "Review price or variable costs").click();
      await expect(page).toHaveURL(new RegExp(`${home}/economics$`));
      await expect(
        title(page, "06–08 Unit Economics & Scenarios"),
      ).toBeVisible();
    });

    // Without the template's Permits row, the check is met by research alone.
    await send(page, "delete", `/api/v1/cost-items/${permits.id}`);
    await test.step("13 → 14's new entry tagged Permits (Next steps: Check permits, no Permits row)", async () => {
      await page.goto(home);
      // SDD 4章's form, in the link and in the address once there.
      await expect(nextStep(page, "Check permits")).toHaveAttribute(
        "href",
        `${home}/research?new=1&presetSupports=permits`,
      );
      await nextStep(page, "Check permits").click();
      await expect(page).toHaveURL(
        new RegExp(`${home}/research\\?new=1&presetSupports=permits$`),
      );
      await expect(title(page, "03 Research Log")).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "New entry" }),
      ).toBeVisible();
      await expect(
        page.getByRole("checkbox", { name: "Permits", exact: true }),
      ).toBeChecked();
    });
  });

  test("a demand signal opens 14's new entry, and Start 02 Market opens 02", async ({
    page,
    signIn,
    account,
  }) => {
    test.slow();
    const { idea, home } = await ownIdea(
      page,
      signIn,
      account,
      uniqueName("Signal Tour"),
    );
    const { validationId } = await validationOf(page, idea.id);
    // Checks 1 to 5 done, nothing answered in 01 or 02: a Permits amount, one startup
    // and one monthly amount, the other rows Unknown, and a price above the costs.
    await addCompetitors(page, validationId, [180, 220, null]);
    await saveRow(page, validationId, "Permits / Registration", {
      amount: 0,
      classification: assumed,
    });
    await saveRow(page, validationId, "Rent", {
      amount: 10_000,
      classification: assumed,
    });
    await markEmptyRowsUnknown(page, validationId);
    await send(
      page,
      "put",
      `/api/v1/validations/${validationId}/economics/selling_price`,
      { value: 300, classification: assumed, lockVersion: 0 },
    );
    await page.goto(home);
    await expect(nextSteps(page)).toHaveText([
      /^Find a demand or problem signal/,
      /^Start 01 Customer & Problem/,
      /^Start 02 Market/,
    ]);

    await test.step("13 → 14's new entry (Next steps: Find a demand or problem signal)", async () => {
      await nextStep(page, "Find a demand or problem signal").click();
      await expect(page).toHaveURL(new RegExp(`${home}/research\\?new=1$`));
      await expect(title(page, "03 Research Log")).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "New entry" }),
      ).toBeVisible();
    });
    await page.goto(home);
    await test.step("13 → 11 (Next steps: Start 02 Market)", async () => {
      await nextStep(page, "Start 02 Market").click();
      await expect(page).toHaveURL(new RegExp(`${home}/questions/02$`));
      await expect(title(page, "02 Market")).toBeVisible();
    });
  });
});

test.describe("BCDX's seeded ideas, read only, on a desktop", () => {
  test.use(desktop);

  test("a Member walks 13 → 19 → 7 → 13 on Bacolod Health Bowl", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.member);
    const { bcdx, ideaId, home } = await bcdxIdea(
      page,
      me,
      "Bacolod Health Bowl",
    );
    const context = (await (
      await page.request.get(`/api/v1/ideas/${ideaId}/decision-context`)
    ).json()) as { lastDecision: { id: string } | null };
    const last = context.lastDecision?.id;
    if (last === undefined) throw new Error("No last decision");
    await page.goto(home);

    await test.step("13 → 19 (Record decision)", async () => {
      await page.getByRole("button", { name: "Record decision" }).click();
      await expect(page).toHaveURL(new RegExp(`${home}/decide$`));
      await expect(title(page, "Record a decision")).toBeVisible();
    });
    // Its seeded decision (design-spec 8.2): Hold, by Kenji Mori.
    await test.step("19 → 7 with that record beside the list (Last decision: Hold · … · Kenji Mori)", async () => {
      await page
        .getByRole("link", { name: /^Last decision: Hold · .+ · Kenji Mori$/ })
        .click();
      await expect(page).toHaveURL(
        `${WEB_ORIGIN}/w/${bcdx.id}/decisions?selected=${last}`,
      );
      await expect(title(page, "Decision Log")).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 2, name: "Bacolod Health Bowl" }),
      ).toBeVisible();
      await expect(page.getByText(/^Recorded by Kenji Mori · /)).toBeVisible();
      await expect(
        page.getByText(
          "Startup costs are incomplete (three Unknown rows and the working capital) and permits are not checked yet. Revisit after the city hall visit.",
          { exact: true },
        ),
      ).toBeVisible();
    });
    await test.step("7 → 13 (the entry's Open validation)", async () => {
      await page.getByRole("link", { name: "Open validation" }).click();
      await expect(page).toHaveURL(`${WEB_ORIGIN}${home}`);
      await expect(title(page, "Bacolod Health Bowl")).toBeVisible();
    });
  });

  test("a Member's Check unknowns opens the first Unknown, and Ready to record a decision opens 19", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.member);
    // Its Unknowns (design-spec 8.2): 02 MARKET SIZE, then 10 BIGGEST UNKNOWN.
    const piaya = await bcdxIdea(page, me, "Piaya Gift Box Delivery");
    await page.goto(piaya.home);
    await expect(nextSteps(page)).toHaveText([/^Check unknowns \(2\)/]);
    await test.step("13 → 11 at 02 MARKET SIZE (Next steps: Check unknowns (2))", async () => {
      await nextStep(page, "Check unknowns (2)").click();
      await expect(page).toHaveURL(
        new RegExp(`${piaya.home}/questions/02\\?q=V\\.02\\.MARKET_SIZE$`),
      );
      await expect(title(page, "02 Market")).toBeVisible();
      await expect(
        page.getByRole("textbox", { name: "Answer to MARKET SIZE" }),
      ).toBeFocused();
    });

    const cafe = await bcdxIdea(page, me, "Student Study Café");
    await page.goto(cafe.home);
    await test.step("13 → 19 (Next steps: Ready to record a decision)", async () => {
      await nextStep(page, "Ready to record a decision").click();
      await expect(page).toHaveURL(new RegExp(`${cafe.home}/decide$`));
      await expect(title(page, "Record a decision")).toBeVisible();
    });
  });

  test("a Viewer's Next steps: 19 is text, while 15 and 17 stay links", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.viewer);
    const cafe = await bcdxIdea(page, me, "Student Study Café");
    await page.goto(cafe.home);
    await expect(nextSteps(page)).toHaveText([/^Ready to record a decision/]);
    await expect(block(page, "Next steps").getByRole("link")).toHaveCount(0);

    const bike = await bcdxIdea(page, me, "Mobile Bike Repair");
    await page.goto(bike.home);
    await test.step("13 → 15 as a Viewer (Next steps: Find 3 competitors)", async () => {
      await nextStep(page, "Find 3 competitors").click();
      await expect(page).toHaveURL(new RegExp(`${bike.home}/competitors$`));
      await expect(title(page, "04 Competitors")).toBeVisible();
    });

    const bowl = await bcdxIdea(page, me, "Bacolod Health Bowl");
    await page.goto(bowl.home);
    await test.step("13 → 17 as a Viewer (Next steps: Fill or mark 1 empty cost row)", async () => {
      await nextStep(page, "Fill or mark 1 empty cost row").click();
      await expect(page).toHaveURL(new RegExp(`${bowl.home}/costs$`));
      await expect(title(page, "05 Costs")).toBeVisible();
    });
  });
});

test.describe("a Viewer of a team of the test's own on a desktop", () => {
  test.use(desktop);

  test("a new 14 entry is text in a Viewer's Next steps, while 17 and 18 stay links", async ({
    page,
    signIn,
    account,
  }) => {
    test.slow();
    // No seeded idea shows a step that opens a new 14 entry among its three: a team of
    // the account's own, with a Viewer, shapes one.
    await signIn(account.email, account.password);
    const team = await send<Workspace>(page, "post", "/api/v1/workspaces", {
      name: uniqueName("Viewer Team"),
    });
    const teamIdea = await send<IdeaDetail>(
      page,
      "post",
      `/api/v1/workspaces/${team.id}/ideas`,
      { name: "Viewer Tour", oneLineConcept: "Viewer Tour, in one line." },
    );
    const { validationId } = await validationOf(page, teamIdea.id);
    // Checks 1 and 2 done and no Permits row: Permits opens a new 14 entry.
    await addCompetitors(page, validationId, [180, 220, null]);
    const permits = (await costRows(page, validationId)).find(
      (row) => row.templateKey === "initial.permits",
    );
    if (permits === undefined) throw new Error("No Permits row");
    await send(page, "delete", `/api/v1/cost-items/${permits.id}`);
    const email = uniqueEmail("flow-validation-viewer");
    await send(page, "post", `/api/v1/workspaces/${team.id}/invitations`, {
      email,
      role: "viewer",
    });
    const link = await linkMailedTo(email, /https?:\/\/\S+\/invite\/[\w-]+/);
    const token = link.pathname.replace("/invite/", "");
    const password = "flow-validation-viewer-2026";
    await signUpThroughApi(
      token,
      { displayName: "Vic Viewer", password },
      test.info().workerIndex,
    );
    await signIn(email, password);
    await send(
      page,
      "post",
      `/api/v1/invitations/by-token/${token}/accept`,
      {},
    );

    const home = `/w/${team.id}/ideas/${teamIdea.id}`;
    await page.goto(home);
    await expect(nextSteps(page)).toHaveText([
      /^Fill or mark \d+ empty cost rows/,
      /^Add price and monthly costs/,
      /^Check permits/,
    ]);
    await expect(
      nextSteps(page).filter({ hasText: "Check permits" }).getByRole("link"),
    ).toHaveCount(0);
    await expect(nextStep(page, "empty cost rows")).toHaveAttribute(
      "href",
      `${home}/costs`,
    );
    await test.step("13 → 18 as a Viewer (Next steps: Add price and monthly costs)", async () => {
      await nextStep(page, "Add price and monthly costs").click();
      await expect(page).toHaveURL(new RegExp(`${home}/economics$`));
      await expect(
        title(page, "06–08 Unit Economics & Scenarios"),
      ).toBeVisible();
    });
  });
});
