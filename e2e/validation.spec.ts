import AxeBuilder from "@axe-core/playwright";
import type { IdeaDetail, Me } from "@moonx/schemas";
import type { Page } from "@playwright/test";
import { WEB_ORIGIN } from "./env";
import {
  test as base,
  demo,
  expect,
  newAccount,
  workspaceOf,
} from "./fixtures";

// 11 Question form for the validation's sections, M2 Evidence, 14 Research log, 15
// Competitors and 16 Assumptions & Risks (design-spec 6.2・6.0.3・6.10), against the
// seeded BCDX (read only) and, for what writes, an idea each test makes in the personal
// workspace of its worker's own account.

/** An account the tests of one worker share. */
interface Account {
  email: string;
  password: string;
}

/**
 * One account per worker: an account each test would spend BCDX's Owner's invitations,
 * 20 an hour for the whole run (SDD 7.2), and each test writes only in an idea it makes.
 */
const test = base.extend<object, { account: Account }>({
  account: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures a fixture needs from this pattern, and this one needs none.
    async ({}, use, workerInfo) => {
      await use(await newAccount(workerInfo.workerIndex, "validation"));
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

/**
 * Presses a Checkbox or Radio by its row: React Aria's input is hidden under the box, which
 * takes the pointer, as for a person.
 */
const press = (control: ReturnType<Page["getByRole"]>) =>
  control.locator("xpath=ancestor::label[1]").click();

/** A question of 11 by its title ("WHO"). */
const question = (page: Page, title: string) =>
  page.getByRole("region", { name: title, exact: true });

async function expectNoAxeViolations(page: Page) {
  await expect(
    page.locator("[data-live-announcer] [aria-labelledby]"),
  ).toHaveCount(0, { timeout: 10_000 });
  // A dialog or popover fading in or out has its words part-transparent, which axe reads
  // as low contrast: the page is checked once overlays have settled, and colours that
  // change on a press (a SegmentedControl's segments) have finished changing.
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
      data: { name: "Piaya Tour", oneLineConcept: "Piaya tours, in one line." },
      headers: { Origin: WEB_ORIGIN },
    },
  );
  expect(created.status(), await created.text()).toBe(201);
  const idea = (await created.json()) as IdeaDetail;
  return { me, workspace: personal.workspace, idea };
}

/** The idea of BCDX named `name`, as I1 lists it. */
async function bcdxIdea(page: Page, me: Me, name: string) {
  const bcdx = workspaceOf(me, "BCDX");
  const listed = await page.request.get(
    `/api/v1/workspaces/${bcdx.id}/ideas?decision=all&includeArchived=true`,
  );
  const { items } = (await listed.json()) as {
    items: { id: string; name: string }[];
  };
  const idea = items.find((candidate) => candidate.name === name);
  if (idea === undefined) throw new Error(`No idea ${name}`);
  return { bcdx, ideaId: idea.id };
}

test.describe("11 Question form on a desktop", () => {
  test.use(desktop);

  test("13 → 11: answer, mark F/A/U and attach new evidence; 13's checks and Next steps follow", async ({
    page,
    signIn,
    account,
  }) => {
    const { workspace, idea } = await ownIdea(page, signIn, account);
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}`);
    await expect(
      block(page, "Next steps").getByRole("listitem").first(),
    ).toContainText("Start with 01 Customer & Problem");
    const demand = block(page, "Checks")
      .getByRole("listitem")
      .filter({ hasText: "Demand or problem signal" });
    await expect(demand).toContainText("Not started");
    await block(page, "Sections")
      .getByRole("link", { name: /01 Customer & Problem/ })
      .click();
    await expect(page).toHaveURL(/\/questions\/01$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "01 Customer & Problem" }),
    ).toBeVisible();
    await expect(page).toHaveTitle(
      `01 Customer & Problem · ${workspace.name} · moonx`,
    );
    await expect(page.getByRole("list", { name: "Breadcrumbs" })).toHaveText(
      "Ideas/Piaya Tour/01 Customer & Problem",
    );
    // The first question not answered has focus (6.2「開いたとき」).
    const who = page.getByRole("textbox", { name: "Answer to WHO" });
    await expect(who).toBeFocused();
    // New ideas take the latest template, v2, which adds V.01.REACH (design-spec 8.4).
    await expect(page.getByText("0/11")).toBeVisible();
    await who.fill("Office workers in Bacolod who buy pasalubong.");
    await expect(page.getByText("Saved")).toBeVisible();
    await expect(page.getByText("1/11")).toBeVisible();
    // An answer with content and no F/A/U says so; Assumption waits for a confidence.
    const whoCard = question(page, "WHO");
    await expect(whoCard).toContainText("Not classified yet");
    await whoCard.getByRole("radio", { name: /Assumption/ }).click();
    await whoCard.getByRole("radio", { name: "Medium" }).click();
    await expect(whoCard).toContainText("Assumption · Medium");
    await expectNoAxeViolations(page);

    // Ctrl+↓ moves to the next question, which opens.
    await who.focus();
    await page.keyboard.press("Control+ArrowDown");
    const whyThem = page.getByRole("textbox", { name: "Answer to WHY THEM" });
    await expect(whyThem).toBeFocused();
    await expect(
      page.getByRole("textbox", { name: "Answer to WHO" }),
    ).toHaveCount(0);
    await expect(question(page, "WHO")).toContainText(
      "Office workers in Bacolod",
    );

    // PROBLEM: Fact opens M2; a new entry made there is attached and makes it a Fact.
    await question(page, "PROBLEM")
      .getByRole("button", { name: "PROBLEM" })
      .click();
    const problem = page.getByRole("textbox", { name: "Answer to PROBLEM" });
    await expect(problem).toBeFocused();
    await problem.fill("Gifts for visitors are hard to find near the airport.");
    const problemCard = question(page, "PROBLEM");
    await problemCard.getByRole("radio", { name: /Fact/ }).click();
    const sheet = page.getByRole("dialog", { name: "Evidence" });
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(/modal=evidence&about=validation_answer/);
    await expect(sheet).toContainText(
      "01 PROBLEM · What problem are we solving?",
    );
    await expect(sheet).toContainText("No evidence yet");
    await expect(sheet).toContainText("No research logged yet");
    await sheet.getByRole("radio", { name: "New entry" }).click();
    await sheet
      .getByRole("textbox", { name: /Topic/ })
      .fill("Airport gift shop survey");
    await press(
      sheet.getByRole("checkbox", { name: "Demand or problem signal" }),
    );
    await expectNoAxeViolations(page);
    await sheet.getByRole("button", { name: "Add and attach" }).click();
    await expect(
      sheet.getByRole("row", { name: /Airport gift shop survey/ }),
    ).toBeVisible();
    await sheet.getByRole("button", { name: "Done" }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page).not.toHaveURL(/modal=/);
    await expect(problemCard).toContainText("Fact · 1 source");
    await expect(
      problemCard
        .getByRole("grid", { name: "Related research" })
        .getByRole("row", { name: /Airport gift shop survey/ }),
    ).toBeVisible();

    // Back on 13: the section counts both answers, the demand check is done, and the
    // first Next step is no longer to start.
    await page
      .getByRole("list", { name: "Breadcrumbs" })
      .getByRole("link", { name: "Piaya Tour" })
      .click();
    await expect(
      block(page, "Sections")
        .getByRole("listitem")
        .filter({ hasText: "01 Customer & Problem" }),
    ).toContainText("2/11");
    await expect(demand).toContainText("Done");
    await expect(
      block(page, "Next steps").getByRole("listitem").first(),
    ).not.toContainText("Start with");
  });

  test("14: an entry added there is chosen in M2, and lists what it is evidence for", async ({
    page,
    signIn,
    account,
  }) => {
    const { workspace, idea } = await ownIdea(page, signIn, account);
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}`);
    await block(page, "Sections")
      .getByRole("link", { name: /03 Research Log/ })
      .click();
    await expect(page).toHaveURL(/\/research$/);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "03 Research Log",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Record what you observe, with sources. Others can check it later.",
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Add entry" }).first().click();
    await expect(page).toHaveURL(/new=1/);
    await expect(
      page.getByRole("heading", { name: "New entry" }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: /Topic/ })
      .fill("Price check at SM City");
    await press(page.getByRole("checkbox", { name: "Local price" }));
    await page.getByRole("button", { name: "Add entry" }).last().click();
    await expect(page).toHaveURL(/entry=/);
    const list = page.getByRole("grid", { name: "Research Log" });
    await expect(
      list.getByRole("row", { name: /Price check at SM City/ }),
    ).toBeVisible();
    await expect(page.getByText("Not used as evidence yet")).toBeVisible();
    // The entry's fields save as they are typed.
    await page
      .getByRole("textbox", { name: "Observation" })
      .fill("Boxes sell for ₱350.");
    await expect(page.getByText("Saved")).toBeVisible();
    await expectNoAxeViolations(page);

    // 11: Fact opens M2, where the entry is ticked.
    await page.goto(
      `/w/${workspace.id}/ideas/${idea.id}/questions/01?q=V.01.WHO`,
    );
    const who = page.getByRole("textbox", { name: "Answer to WHO" });
    await expect(who).toBeFocused();
    await who.fill("Tourists who pass through Bacolod.");
    await question(page, "WHO").getByRole("radio", { name: /Fact/ }).click();
    const sheet = page.getByRole("dialog", { name: "Evidence" });
    await press(
      sheet.getByRole("checkbox", { name: /Price check at SM City/ }),
    );
    await expect(
      sheet.getByRole("row", { name: /Price check at SM City/ }),
    ).toBeVisible();
    await sheet.getByRole("button", { name: "Done" }).click();
    await expect(question(page, "WHO")).toContainText("Fact · 1 source");

    // The entry lists the answer, which opens 11 on it.
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}/research`);
    // The only entry is the one beside the list already.
    await expect(
      page.getByRole("heading", { level: 2, name: "Price check at SM City" }),
    ).toBeVisible();
    const used = page.getByRole("list", { name: "Used as evidence" });
    await expect(used).toContainText("01 WHO");
    await used.getByRole("link", { name: /01 WHO/ }).click();
    await expect(page).toHaveURL(/\/questions\/01\?q=V\.01\.WHO/);
  });

  test("02: OCEAN shows its questions; a URL is attached as evidence; the last one asks before it goes", async ({
    page,
    signIn,
    account,
  }) => {
    const { workspace, idea } = await ownIdea(page, signIn, account);
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}/questions/02`);
    await expect(page.getByText("0/8")).toBeVisible();
    await question(page, "OCEAN")
      .getByRole("button", { name: "OCEAN" })
      .click();
    const ocean = question(page, "OCEAN");
    await expect(ocean).toContainText("Answer OCEAN to see the next questions");
    await press(ocean.getByRole("radio", { name: "Red" }));
    await expect(page.getByText("1/12")).toBeVisible();
    await expect(question(page, "RED: SURVIVORS")).toBeVisible();
    await expect(question(page, "BLUE: GAP")).toHaveCount(0);
    await press(ocean.getByRole("radio", { name: "Mixed" }));
    await expect(page.getByText("1/15")).toBeVisible();

    // OCEAN as a Fact with a URL; removing its only evidence asks first.
    await ocean.getByRole("radio", { name: /Fact/ }).click();
    const sheet = page.getByRole("dialog", { name: "Evidence" });
    await sheet.getByRole("radio", { name: "URL" }).click();
    await sheet
      .getByRole("textbox", { name: /URL/ })
      .fill("https://psa.gov.ph/report");
    await sheet.getByRole("button", { name: "Attach URL" }).click();
    await expect(
      sheet.getByRole("row", { name: "https://psa.gov.ph/report" }),
    ).toBeVisible();
    await sheet.getByRole("button", { name: "Done" }).click();
    await expect(ocean).toContainText("Fact · 1 source");
    await ocean.getByRole("link", { name: "Add evidence" }).click();
    await sheet.getByRole("button", { name: /Remove/ }).click();
    const ask = page.getByRole("alertdialog", {
      name: "Remove the last evidence?",
    });
    await expect(ask).toContainText("This answer will become Unclassified.");
    await ask.getByRole("button", { name: "Remove" }).click();
    await expect(sheet).toContainText("No evidence yet");
    await sheet.getByRole("button", { name: "Done" }).click();
    await expect(ocean).toContainText("Unclassified");

    // 02's next section is 03, the research log.
    await page.getByRole("button", { name: "Next: 03 Research Log" }).click();
    await expect(page).toHaveURL(/\/research$/);
  });

  test("13's links: Summary opens the question, checks open 17's Permits row and 14's new entry", async ({
    page,
    signIn,
    account,
  }) => {
    const { workspace, idea } = await ownIdea(page, signIn, account);
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}`);
    await block(page, "Summary")
      .getByRole("link", { name: "Answer in 02 Market" })
      .click();
    await expect(page).toHaveURL(/\/questions\/02\?q=V\.02\.OCEAN/);
    await expect(page.getByRole("radio", { name: "Red" })).toBeFocused();
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}`);
    // A new idea has the Permits cost row, whose check opens it on 17 at its amount; the
    // demand check opens 14's new entry.
    const checks = block(page, "Checks");
    await checks.getByRole("link", { name: /Permits/ }).click();
    await expect(page).toHaveURL(/\/costs\?row=[\w-]+$/);
    await expect(
      page.getByRole("textbox", { name: "Amount of Permits / Registration" }),
    ).toBeFocused();
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}`);
    await checks
      .getByRole("link", { name: /Demand or problem signal/ })
      .click();
    await expect(page).toHaveURL(/\/research\?new=1$/);
    await expect(
      page.getByRole("heading", { name: "New entry" }),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: /Topic/ })).toBeFocused();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page).toHaveURL(/\/research$/);
  });
});

test.describe("11 for a Member on a Fact that lost its research log", () => {
  test.use(desktop);

  test("13's Add evidence opens it; its warning, and Add evidence opens M2 with the deleted entry", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.member);
    const { bcdx, ideaId } = await bcdxIdea(page, me, "Bacolod Health Bowl");
    await page.goto(`/w/${bcdx.id}/ideas/${ideaId}`);
    await block(page, "Next steps")
      .getByRole("link", { name: /Add evidence/ })
      .click();
    await expect(page).toHaveURL(/\/questions\/01\?q=V\.01\.PROBLEM/);
    const problem = question(page, "PROBLEM");
    await expect(
      page.getByRole("textbox", { name: "Answer to PROBLEM" }),
    ).toBeFocused();
    await expect(problem).toContainText("Fact · No evidence");
    await expect(problem.locator(".lucide-triangle-alert")).toHaveCount(1);
    await expect(problem).not.toContainText("Mark it Fact");
    await problem.getByRole("link", { name: "Add evidence" }).click();
    const sheet = page.getByRole("dialog", { name: "Evidence" });
    await expect(sheet.getByRole("row", { name: /\(deleted\)/ })).toBeVisible();
    await expectNoAxeViolations(page);
    // Closed with nothing changed: the answer stays as it was.
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(problem).toContainText("Fact · No evidence");
  });
});

test.describe("11 and 14 for a Viewer", () => {
  test.use(desktop);

  test("read only: every question open, labels only, no new entry, no M2", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.viewer);
    const { bcdx, ideaId } = await bcdxIdea(page, me, "Bacolod Health Bowl");
    await page.goto(`/w/${bcdx.id}/ideas/${ideaId}/questions/01`);
    await expect(
      page.getByRole("heading", { level: 1, name: "01 Customer & Problem" }),
    ).toBeVisible();
    await expect(page.getByRole("switch", { name: "Focus" })).toHaveCount(0);
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByRole("radio", { name: /Fact/ })).toHaveCount(0);
    await expect(question(page, "PROBLEM")).toContainText("Fact · No evidence");
    await expect(question(page, "PROBLEM")).toContainText(
      "No research linked to this answer.",
    );
    await expect(page.getByRole("link", { name: "Log research" })).toHaveCount(
      0,
    );
    await expectNoAxeViolations(page);
    // M2's URL opens nothing for a Viewer, though it names an answer of this validation.
    const home = await page.request.get(`/api/v1/ideas/${ideaId}/validation`);
    const { validationId } = (await home.json()) as { validationId: string };
    await page.goto(
      `/w/${bcdx.id}/ideas/${ideaId}/questions/01?modal=evidence&about=validation_answer:${validationId}:V.01.WHO`,
    );
    await expect(question(page, "WHO")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.goto(`/w/${bcdx.id}/ideas/${ideaId}/research`);
    const list = page.getByRole("grid", { name: "Research Log" });
    await expect(list.getByRole("row")).toHaveCount(5);
    await expect(page.getByRole("button", { name: "Add entry" })).toHaveCount(
      0,
    );
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /More for/ })).toHaveCount(0);
    // Supports narrows the list to the entries tagged with the demand signal.
    await page.getByRole("button", { name: /^Supports/ }).click();
    await page
      .getByRole("option", { name: "Demand or problem signal" })
      .click();
    await expect(list.getByRole("row")).toHaveCount(2);
    await expectNoAxeViolations(page);
  });
});

test.describe("11 on a phone", () => {
  test.use(phone);

  test("14: a new entry in a sheet, its source chosen in a tray; Back returns to the list", async ({
    page,
    signIn,
    account,
  }) => {
    const { workspace, idea } = await ownIdea(page, signIn, account);
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}/research`);
    await page.getByRole("button", { name: "Add entry" }).first().click();
    const sheet = page.getByRole("dialog", { name: "New entry" });
    await expect(sheet).toBeVisible();
    await sheet
      .getByRole("textbox", { name: /Topic/ })
      .fill("Jeepney stop count");
    await sheet.getByRole("button", { name: /Source Type/ }).click();
    await page.getByRole("option", { name: "Store Observation" }).click();
    await expect(
      sheet.getByRole("button", { name: /Source Type/ }),
    ).toContainText("Store Observation");
    // Cancel goes back to the list it was opened from.
    await sheet.getByRole("button", { name: "Cancel" }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page).toHaveURL(/\/research$/);
    await page.getByRole("button", { name: "Add entry" }).first().click();
    await sheet
      .getByRole("textbox", { name: /Topic/ })
      .fill("Jeepney stop count");
    await expectNoAxeViolations(page);
    await sheet.getByRole("button", { name: "Add entry" }).click();
    await expect(
      page.getByRole("heading", { level: 2, name: "Jeepney stop count" }),
    ).toBeVisible();
    // The entry replaced the form: Back returns to the list, not to the form.
    await page.goBack();
    await expect(page).toHaveURL(/\/research$/);
    await expect(
      page
        .getByRole("grid", { name: "Research Log" })
        .getByRole("row", { name: /Jeepney stop count/ }),
    ).toBeVisible();
  });

  test("one question at a time, the dots, and the section's completion card", async ({
    page,
    signIn,
    account,
  }) => {
    const { workspace, idea } = await ownIdea(page, signIn, account);
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}/questions/10`);
    await expect(page.getByRole("textbox")).toHaveCount(1);
    await expect(
      page.getByRole("link", { name: "Back to Validation" }),
    ).toBeVisible();
    const dots = page.getByRole("button", { name: /^Question \d+ of 6/ });
    await expect(dots).toHaveCount(6);
    await expect(
      page.getByRole("button", { name: "Question 1 of 6" }),
    ).toHaveAttribute("aria-current", "step");
    await page.getByRole("textbox").fill("The office market is large.");
    await expect(
      page.getByRole("button", { name: "Question 1 of 6, answered" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Question 6 of 6" }).click();
    await page.getByRole("button", { name: "Next question" }).click();
    await expect(
      page.getByRole("heading", { name: "10: 1/6 answered" }),
    ).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: "Back to Validation" }).click();
    await expect(page).toHaveURL(new RegExp(`/ideas/${idea.id}$`));
  });
});

/** Adds a competitor through 15's dialog, its type and price as given. */
async function addCompetitor(
  page: Page,
  name: string,
  { type, price }: { type?: string; price?: string } = {},
) {
  await page.getByRole("button", { name: "Add competitor" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New competitor" });
  await dialog.getByRole("textbox", { name: /^Name/ }).fill(name);
  if (type !== undefined) {
    await dialog.getByRole("button", { name: /Type/ }).click();
    await page.getByRole("option", { name: type, exact: true }).click();
  }
  if (price !== undefined) {
    await dialog.getByRole("textbox", { name: "Typical Price" }).fill(price);
  }
  await dialog.getByRole("button", { name: "Add competitor" }).click();
  await expect(dialog).toHaveCount(0);
  // Made, it opens in its own dialog (design-spec 6.10), closed here to add the next.
  const made = page.getByRole("dialog", { name: "Edit competitor" });
  await expect(made.getByRole("textbox", { name: /^Name/ })).toHaveValue(name);
  await expect(page).toHaveURL(/row=/);
  await made.getByRole("button", { name: /Close/ }).click();
  await expect(made).toHaveCount(0);
  await expect(page).not.toHaveURL(/row=/);
}

/** The cards of 15, in their order, by their names. */
const cardNames = (page: Page) =>
  page
    .getByRole("grid", { name: "Competitors", exact: true })
    .getByRole("row")
    .filter({ hasNotText: "Add competitor" });

test.describe("15 Competitors on a desktop", () => {
  test.use(desktop);

  test("13 → 15: competitors added, compared in the table, edited, reordered; 13's check follows", async ({
    page,
    signIn,
    account,
  }) => {
    const { workspace, idea } = await ownIdea(page, signIn, account);
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}`);
    await block(page, "Sections")
      .getByRole("link", { name: /04 Competitors/ })
      .click();
    await expect(page).toHaveURL(/\/competitors$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "04 Competitors" }),
    ).toBeVisible();
    await expect(page).toHaveTitle(
      `04 Competitors · ${workspace.name} · moonx`,
    );
    await expect(page.getByText("0 competitors · aim for 3–5")).toBeVisible();
    await expect(
      page.getByText(
        "List 3–5 competitors or substitutes. Include what people do today instead.",
      ),
    ).toBeVisible();

    await addCompetitor(page, "Salad Station", {
      type: "Direct Competitor",
      price: "240",
    });
    await addCompetitor(page, "Bowl & Co", {
      type: "Direct Competitor",
      price: "1,260.50",
    });
    await addCompetitor(page, "Home meal prep", { type: "Substitute" });
    await expect(cardNames(page)).toHaveCount(3);
    await expect(page.getByText("3 competitors · aim for 3–5")).toBeVisible();
    const salad = cardNames(page).filter({ hasText: "Salad Station" });
    await expect(salad).toContainText("Direct Competitor");
    await expect(salad).toContainText("₱240");
    await expect(salad).toContainText("No sources");
    await expect(
      cardNames(page).filter({ hasText: "Home meal prep" }),
    ).toContainText("No price");
    await expectNoAxeViolations(page);

    // A card opens its dialog, which saves as typed; M2 attaches a URL to it.
    await salad.click();
    const editor = page.getByRole("dialog", { name: "Edit competitor" });
    await expect(page).toHaveURL(/row=/);
    await editor
      .getByRole("textbox", { name: "Strength" })
      .fill("Prime location near offices");
    await expect(page.getByText("Saved")).toBeVisible();
    await editor.getByRole("link", { name: "Add evidence" }).click();
    const sheet = page.getByRole("dialog", { name: "Evidence" });
    await expect(sheet).toContainText("Competitors · Salad Station");
    await sheet.getByRole("radio", { name: "URL" }).click();
    await sheet
      .getByRole("textbox", { name: /^URL/ })
      .fill("https://example.com/salad-station-menu");
    await sheet.getByRole("button", { name: "Attach URL" }).click();
    await expect(
      sheet.getByRole("row", { name: /salad-station-menu/ }),
    ).toBeVisible();
    await sheet.getByRole("button", { name: "Done" }).click();
    await expect(sheet).toHaveCount(0);
    await expect(
      editor.getByRole("row", { name: /salad-station-menu/ }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    // Back closes the dialog it was opened by.
    await page.goBack();
    await expect(editor).toHaveCount(0);
    await expect(page).toHaveURL(/\/competitors$/);
    await expect(salad).toContainText("Prime location near offices");
    await expect(salad).toContainText("1 source");

    // The table: the fields as rows, the competitors as columns.
    await page.getByRole("radio", { name: "Table" }).click();
    await expect(page).toHaveURL(/view=table/);
    const table = page.getByRole("grid", { name: "Competitors in a table" });
    await expect(table.getByRole("columnheader")).toHaveText([
      "Field",
      "Salad Station",
      "Bowl & Co",
      "Home meal prep",
    ]);
    await expect(
      table.getByRole("row").filter({ hasText: "Typical price" }),
    ).toContainText("₱1,260.50");
    await expectNoAxeViolations(page);
    await page.getByRole("radio", { name: "Cards" }).click();

    // Reorder: Home meal prep moved to the top; the order is kept on a reload.
    await page.getByRole("button", { name: "More for Home meal prep" }).click();
    await page.getByRole("menuitem", { name: "Reorder" }).click();
    const reorder = page.getByRole("dialog", { name: "Reorder competitors" });
    await expect(
      reorder.getByRole("button", { name: "Save order" }),
    ).toBeDisabled();
    await reorder
      .getByRole("button", { name: "Move Home meal prep up" })
      .click();
    await reorder
      .getByRole("button", { name: "Move Home meal prep up" })
      .click();
    await expect(
      reorder.getByRole("button", { name: "Move Home meal prep down" }),
    ).toBeFocused();
    await expectNoAxeViolations(page);
    await reorder.getByRole("button", { name: "Save order" }).click();
    await expect(reorder).toHaveCount(0);
    await expect(cardNames(page).first()).toContainText("Home meal prep");
    await page.reload();
    await expect(cardNames(page).first()).toContainText("Home meal prep");

    // Delete asks first.
    await page.getByRole("button", { name: "More for Bowl & Co" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page
      .getByRole("alertdialog", { name: "Delete this competitor?" })
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(cardNames(page)).toHaveCount(2);
    await expect(page.getByText("2 competitors · aim for 3–5")).toBeVisible();

    // 13: the competitors check counts two of three; the section shows the count.
    await page
      .getByRole("list", { name: "Breadcrumbs" })
      .getByRole("link", { name: "Piaya Tour" })
      .click();
    await expect(
      block(page, "Checks")
        .getByRole("listitem")
        .filter({ hasText: "Competitors (3–5)" }),
    ).toContainText("2 of 3 found");
    await expect(
      block(page, "Sections")
        .getByRole("listitem")
        .filter({ hasText: "04 Competitors" }),
    ).toContainText("2 (3–5)");
  });

  test("Patterns: answered with F/A/U; 13's Classify answers opens the question", async ({
    page,
    signIn,
    account,
  }) => {
    const { workspace, idea } = await ownIdea(page, signIn, account);
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}/competitors`);
    const survivor = question(page, "Survivor Patterns");
    await expect(survivor).toContainText("Empty");
    await survivor.getByRole("button", { name: "Survivor Patterns" }).click();
    const answer = page.getByRole("textbox", {
      name: "Answer to Survivor Patterns",
    });
    await expect(answer).toBeFocused();
    await answer.fill("The busy ones sell lunch sets under ₱200.");
    await expect(page.getByText("Saved")).toBeVisible();
    await expect(survivor).toContainText("Not classified yet");
    await expectNoAxeViolations(page);

    // 13's first Next step classifies it, opening 15 on the question.
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}`);
    const first = block(page, "Next steps").getByRole("listitem").first();
    await expect(first).toContainText("Classify answers (1)");
    await first.getByRole("link").click();
    await expect(page).toHaveURL(/\/competitors\?q=V\.04\.SURVIVOR_PATTERNS$/);
    await expect(answer).toBeFocused();
    await survivor.getByRole("radio", { name: /Unknown/ }).click();
    await expect(survivor).toContainText("Unknown");
  });
});

test.describe("16 Assumptions & Risks on a desktop", () => {
  test.use(desktop);

  test("13 → 16: assumptions with evidence, risks by impact until reordered", async ({
    page,
    signIn,
    account,
  }) => {
    const { workspace, idea } = await ownIdea(page, signIn, account);
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}`);
    await block(page, "Sections")
      .getByRole("link", { name: /09 Assumptions & Risks/ })
      .click();
    await expect(page).toHaveURL(/\/assumptions$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "09 Assumptions & Risks" }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Assumptions" }),
    ).toHaveAttribute("aria-selected", "true");
    // The empty list's heading: the list's skeleton draws the same words while it loads.
    await expect(
      page.getByRole("heading", {
        name: "List what has to be true for this idea to work, and why you believe it.",
      }),
    ).toBeVisible();

    // A new assumption in the detail's place; made, it shows there to edit.
    await page.getByRole("button", { name: "Add assumption" }).first().click();
    await expect(
      page.getByRole("heading", { level: 2, name: "New assumption" }),
    ).toBeVisible();
    const add = page.getByRole("button", { name: "Add assumption" }).last();
    await expect(add).toBeDisabled();
    await page
      .getByRole("textbox", { name: /^Assumption/ })
      .fill("Tourists buy piaya as gifts on the way home.");
    await page.getByRole("radio", { name: "Medium" }).click();
    await add.click();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Tourists buy piaya as gifts on the way home.",
      }),
    ).toBeVisible();
    const list = page.getByRole("grid", { name: "Assumptions" });
    await expect(list.getByRole("row")).toHaveCount(1);
    await expect(list).toContainText("Medium confidence");
    await page
      .getByRole("textbox", { name: "Next Check" })
      .fill("Count gift buyers at the airport for a day.");
    await expect(page.getByText("Saved")).toBeVisible();
    // Confidence can be left unset again.
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(list).not.toContainText("Medium confidence");
    await expectNoAxeViolations(page);

    // M2 attaches a URL to it: no Fact, the row stays as it is.
    await page.getByRole("link", { name: "Add evidence" }).click();
    const sheet = page.getByRole("dialog", { name: "Evidence" });
    await expect(sheet).toContainText(
      "Assumptions · Tourists buy piaya as gifts on the way home.",
    );
    await sheet.getByRole("radio", { name: "URL" }).click();
    await sheet
      .getByRole("textbox", { name: /^URL/ })
      .fill("https://example.com/airport-gifts");
    await sheet.getByRole("button", { name: "Attach URL" }).click();
    await expect(
      sheet.getByRole("row", { name: /airport-gifts/ }),
    ).toBeVisible();
    // The last one goes without asking: the row has no Fact to lose.
    await sheet
      .getByRole("row", { name: /airport-gifts/ })
      .getByRole("button")
      .click();
    await expect(sheet).toContainText("No evidence yet");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await sheet.getByRole("radio", { name: "URL" }).click();
    await sheet
      .getByRole("textbox", { name: /^URL/ })
      .fill("https://example.com/airport-gifts");
    await sheet.getByRole("button", { name: "Attach URL" }).click();
    await sheet.getByRole("button", { name: "Done" }).click();
    await expect(list).toContainText("1 source");

    // Risks: the highest Impact first, then Probability; a new one takes its place.
    await page.getByRole("tab", { name: "Risks" }).click();
    await expect(page).toHaveURL(/tab=risks/);
    const risks = page.getByRole("grid", { name: "Risks" });
    const addRisk = async (
      statement: string,
      impact: string,
      probability: string,
    ) => {
      await page.getByRole("button", { name: "Add risk" }).first().click();
      await page.getByRole("textbox", { name: /^Risk/ }).fill(statement);
      await page.getByRole("button", { name: /Probability/ }).click();
      await page
        .getByRole("listbox", { name: "Probability" })
        .getByRole("option", { name: probability, exact: true })
        .click();
      await page.getByRole("button", { name: /Impact/ }).click();
      await page
        .getByRole("listbox", { name: "Impact" })
        .getByRole("option", { name: impact, exact: true })
        .click();
      await page.getByRole("button", { name: "Add risk" }).last().click();
      await expect(
        page.getByRole("heading", { level: 2, name: statement }),
      ).toBeVisible();
    };
    await addRisk("Typhoons close the shop", "Medium", "High");
    await addRisk("Flour prices double", "High", "Low");
    await addRisk("A mall chain copies the boxes", "Low", "Medium");
    await expect(risks.getByRole("row")).toHaveText([
      /Flour prices double/,
      /Typhoons close the shop/,
      /A mall chain copies the boxes/,
    ]);
    await expect(risks.getByRole("row").first()).toContainText(
      "Impact High · Probability Low",
    );
    await expectNoAxeViolations(page);

    // Reordered by hand, the order stays, and a new risk goes last.
    await risks
      .getByRole("button", { name: "More for A mall chain copies the boxes" })
      .click();
    await page.getByRole("menuitem", { name: "Reorder" }).click();
    const reorder = page.getByRole("dialog", { name: "Reorder risks" });
    await reorder
      .getByRole("button", { name: "Move A mall chain copies the boxes up" })
      .click();
    await reorder.getByRole("button", { name: "Save order" }).click();
    await expect(reorder).toHaveCount(0);
    await expect(risks.getByRole("row")).toHaveText([
      /Flour prices double/,
      /A mall chain copies the boxes/,
      /Typhoons close the shop/,
    ]);
    await addRisk("Staff leave after training", "High", "High");
    await expect(risks.getByRole("row").last()).toContainText(
      "Staff leave after training",
    );

    // Delete asks first.
    await risks
      .getByRole("button", { name: "More for Typhoons close the shop" })
      .click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page
      .getByRole("alertdialog", { name: "Delete this risk?" })
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(risks.getByRole("row")).toHaveCount(3);

    // 13 counts both lists.
    await page
      .getByRole("list", { name: "Breadcrumbs" })
      .getByRole("link", { name: "Piaya Tour" })
      .click();
    await expect(
      block(page, "Sections")
        .getByRole("listitem")
        .filter({ hasText: "09 Assumptions & Risks" }),
    ).toContainText("1 · 3");
  });
});

test.describe("15 and 16 for a Viewer", () => {
  test.use(desktop);

  test("read only: cards open to read, no adding, ⋯ for comments only; 16 without fields or M2", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.viewer);
    const { bcdx, ideaId } = await bcdxIdea(page, me, "Bacolod Health Bowl");
    await page.goto(`/w/${bcdx.id}/ideas/${ideaId}/competitors`);
    await expect(cardNames(page)).toHaveCount(4);
    await expect(page.getByText("4 competitors · aim for 3–5")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add competitor" }),
    ).toHaveCount(0);
    await expect(page.getByRole("textbox")).toHaveCount(0);
    // A Viewer comments too (design-spec 2.2・6.0.4): the card's ⋯ holds Comments alone.
    await page
      .getByRole("button", { name: "More for Mall salad bars" })
      .click();
    await expect(page.getByRole("menuitem")).toHaveText(["Comments"]);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menuitem")).toHaveCount(0);
    await cardNames(page).filter({ hasText: "Mall salad bars" }).click();
    const card = page.getByRole("dialog", { name: "Mall salad bars" });
    await expect(card).toContainText("Fresh, visible, trusted");
    await expect(card.getByRole("textbox")).toHaveCount(0);
    await expect(card.getByRole("link", { name: "Add evidence" })).toHaveCount(
      0,
    );
    await expectNoAxeViolations(page);
    await card.getByRole("button", { name: /Close/ }).click();

    await page.goto(`/w/${bcdx.id}/ideas/${ideaId}/assumptions?tab=risks`);
    const risks = page.getByRole("grid", { name: "Risks" });
    // Impact first: the typhoon-season prices (High) before the rainy days (Medium).
    await expect(risks.getByRole("row")).toHaveText([
      /Ingredient prices rise/,
      /Lunch demand drops/,
    ]);
    await expect(page.getByRole("button", { name: "Add risk" })).toHaveCount(0);
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /More for/ })).toHaveCount(0);
    await expectNoAxeViolations(page);
    // M2's URL opens nothing for a Viewer, though it names a row of this validation.
    const home = await page.request.get(`/api/v1/ideas/${ideaId}/validation`);
    const { validationId } = (await home.json()) as { validationId: string };
    const listed = async (list: string) => {
      const response = await page.request.get(
        `/api/v1/validations/${validationId}/${list}`,
      );
      const [first] = ((await response.json()) as { items: { id: string }[] })
        .items;
      if (first === undefined) throw new Error(`No ${list}`);
      return first.id;
    };
    await page.goto(
      `/w/${bcdx.id}/ideas/${ideaId}/assumptions?modal=evidence&about=assumption:${await listed("assumptions")}`,
    );
    await expect(page.getByRole("grid", { name: "Assumptions" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goto(
      `/w/${bcdx.id}/ideas/${ideaId}/competitors?modal=evidence&about=competitor:${await listed("competitors")}`,
    );
    await expect(cardNames(page)).toHaveCount(4);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test.describe("15 and 16 on a phone", () => {
  test.use(phone);

  test("15 in one column with Add in place; 16's new assumption in a sheet, Back to the list", async ({
    page,
    signIn,
    account,
  }) => {
    const { workspace, idea } = await ownIdea(page, signIn, account);
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}/competitors`);
    await expect(page.getByRole("radio", { name: "Table" })).toHaveCount(0);
    // No price: a NumberField committed as its dialog closes leaves React Aria's live
    // announcer a message naming the closed field for a few seconds, which the axe check
    // below could meet before it is gone.
    await addCompetitor(page, "Salad Station");
    await expect(cardNames(page)).toHaveCount(1);
    await expectNoAxeViolations(page);

    await page.goto(`/w/${workspace.id}/ideas/${idea.id}/assumptions`);
    await page.getByRole("button", { name: "Add assumption" }).first().click();
    const sheet = page.getByRole("dialog", { name: "New assumption" });
    await expect(sheet).toBeVisible();
    await sheet
      .getByRole("textbox", { name: /^Assumption/ })
      .fill("Office workers order twice a week.");
    await expectNoAxeViolations(page);
    await sheet.getByRole("button", { name: "Add assumption" }).click();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Office workers order twice a week.",
      }),
    ).toBeVisible();
    // A phone reads the row and edits it in a sheet.
    await page.getByRole("button", { name: "Edit" }).click();
    const edit = page.getByRole("dialog", { name: "Edit assumption" });
    await edit
      .getByRole("textbox", { name: "Why We Believe It" })
      .fill("Ten of twelve said so.");
    await expect(page.getByRole("status").getByText("Saved")).toBeVisible();
    await edit.getByRole("button", { name: /Close/ }).click();
    await expect(page.getByText("Ten of twelve said so.")).toBeVisible();
    // The row replaced the form: Back returns to the list.
    await page.goBack();
    await expect(page).toHaveURL(/\/assumptions$/);
    await expect(
      page
        .getByRole("grid", { name: "Assumptions" })
        .getByRole("row", { name: /Office workers order twice a week/ }),
    ).toBeVisible();
  });
});

/** A row of one of 17's or 18's tables, by its name. */
const tableRow = (page: Page, table: string, name: string) =>
  page
    .getByRole("grid", { name: table, exact: true })
    .getByRole("row")
    .filter({ hasText: name });

test.describe("17 Costs and 18 Unit Economics on a desktop", () => {
  test.use(desktop);

  test("Piaya Gift Box Delivery: 17 and 18 show the numbers of design-spec 8.3", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.member);
    const { bcdx, ideaId } = await bcdxIdea(
      page,
      me,
      "Piaya Gift Box Delivery",
    );
    await page.goto(`/w/${bcdx.id}/ideas/${ideaId}`);
    await block(page, "Sections")
      .getByRole("link", { name: /05 Costs/ })
      .click();
    await expect(page).toHaveURL(/\/costs$/);
    await expect(page).toHaveTitle(`05 Costs · BCDX · moonx`);
    const totals = page.getByRole("group", { name: "Totals" });
    await expect(totals).toContainText("₱169,500");
    await expect(totals).toContainText("₱41,700");
    await expect(totals).toContainText("₱218.50");
    await expect(totals).toContainText("6.9");
    await expect(
      tableRow(page, "Variable costs", "Payment / Platform Fee"),
    ).toContainText("3% · ₱13.50");
    await expectNoAxeViolations(page);

    await page.getByRole("link", { name: /Unit Economics/ }).click();
    await expect(page).toHaveURL(/\/economics$/);
    await expect(page).toHaveTitle(
      "06–08 Unit Economics & Scenarios · BCDX · moonx",
    );
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "06–08 Unit Economics & Scenarios",
      }),
    ).toBeVisible();
    const results = page.getByRole("group", { name: "Results" });
    for (const value of [
      "₱218.50",
      "₱231.50",
      "6.9",
      "9.8",
      "51.4% of the price",
      "180.1 / month · ₱81,058 / month",
      "254.3 / month at 15%",
      "₱18,490",
      "9.2 months",
      "130.9%",
    ]) {
      await expect(results).toContainText(value);
    }
    await expect(page.getByText("using default 15%")).toBeVisible();
    // The scenarios sit in the results, a line each (design-spec 6.4・4.1 F).
    const scenarios = page
      .getByRole("complementary", { name: "Results" })
      .getByRole("grid", { name: "Scenarios" });
    await expect(scenarios.getByRole("row")).toHaveCount(5);
    const expected = scenarios.getByRole("row").filter({ hasText: "Expected" });
    for (const value of ["260", "₱117,000", "₱56,810", "₱18,490", "15.8%"]) {
      await expect(expected).toContainText(value);
    }
    const conservative = scenarios
      .getByRole("row")
      .filter({ hasText: "Conservative" });
    for (const value of ["156", "₱70,200", "−₱5,586"]) {
      await expect(conservative).toContainText(value);
    }
    await expectNoAxeViolations(page);
  });

  test("13 → 17 → 18: amounts typed change the totals and results at once; 13 follows", async ({
    page,
    signIn,
    account,
  }) => {
    const { workspace, idea } = await ownIdea(page, signIn, account);
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}`);
    await block(page, "Sections")
      .getByRole("link", { name: /05 Costs/ })
      .click();
    await expect(
      page.getByText(
        "Fill in what you know. Mark the rest Unknown, or delete rows you don't need.",
      ),
    ).toBeVisible();
    const totals = page.getByRole("group", { name: "Totals" });
    await expect(totals).toContainText("StartupEmpty");

    // A row pressed takes its amount; the total follows as it is typed.
    const equipment = tableRow(page, "Startup costs", "Equipment");
    await equipment.getByText("Empty").first().click();
    const amount = page.getByRole("textbox", { name: "Amount of Equipment" });
    await expect(amount).toBeFocused();
    await amount.fill("35,000");
    await expect(totals).toContainText("₱35,000+");
    await expect(page.getByText("Saved")).toBeVisible();
    await page
      .getByRole("button", { name: "F/A/U of Equipment: Unclassified" })
      .click();
    const picker = page.getByRole("dialog", { name: "F/A/U of Equipment" });
    await picker.getByRole("radio", { name: "Assumption" }).click();
    await picker.getByRole("radio", { name: "Medium" }).click();
    await expect(
      page.getByRole("button", {
        name: "F/A/U of Equipment: Assumption · Medium",
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "F/A/U of Permits / Registration: Empty" })
      .click();
    await page
      .getByRole("dialog", { name: "F/A/U of Permits / Registration" })
      .getByRole("radio", { name: "Unknown" })
      .click();
    await expect(
      tableRow(page, "Startup costs", "Permits / Registration"),
    ).toContainText("Unknown");
    await expect(totals).toContainText("1 Unknown");

    // + Add row under the monthly fixed costs (the second table): an Empty row at
    // the end, its name to type.
    await page.getByRole("button", { name: "Add row" }).nth(1).click();
    const newName = page.getByRole("textbox", { name: "Name of Untitled" });
    await expect(newName).toBeFocused();
    await newName.fill("Cleaning");
    await tableRow(page, "Monthly fixed costs", "Rent")
      .getByText("Empty")
      .first()
      .click();
    await page.getByRole("textbox", { name: "Amount of Rent" }).fill("12,000");
    await expect(totals).toContainText("₱12,000+");

    // A % of the price waits for 18's price, which the Totals link to.
    await page
      .getByRole("button", { name: "Row actions for Core Product / Materials" })
      .click();
    await page.getByRole("menuitem", { name: "Use % of price" }).click();
    // The closing menu gives focus back to the row's ⋯, and a row with focus shows its
    // inputs (design-spec 4.5 TableView): the % field is there once the menu has gone.
    // Pressing the row's "Empty" raced that hand-back, which removes the text.
    await expect(page.getByRole("menuitem")).toHaveCount(0);
    await page
      .getByRole("textbox", { name: "% of price for Core Product / Materials" })
      .fill("30");
    // Left, the row shows its values again.
    await page.getByRole("heading", { level: 1, name: "05 Costs" }).click();
    await expect(
      tableRow(page, "Variable costs", "Core Product / Materials"),
    ).toContainText("· Needs price");
    await expect(totals).toContainText("Needs price");
    await expectNoAxeViolations(page);
    await page.getByRole("link", { name: "Add price" }).click();
    await expect(page).toHaveURL(/\/economics\?field=selling_price$/);
    const price = page.getByRole("textbox", { name: "Value of Price" });
    await expect(price).toBeFocused();
    await price.fill("300");
    const results = page.getByRole("group", { name: "Results" });
    await expect(results).toContainText("₱90.00+");
    await tableRow(page, "Daily sales", "Expected")
      .getByText("Empty")
      .first()
      .click();
    await page.getByRole("textbox", { name: "Value of Expected" }).fill("10");
    // 300 a month at ₱300, less ₱90 each and ₱12,000: at most ₱51,000.
    await expect(results).toContainText("≤ ₱51,000");
    await expect(results).toContainText("1.9+");
    await expect(page.getByText("using default 30 days")).toBeVisible();
    await expect(page.getByText("Saved")).toBeVisible();
    await expectNoAxeViolations(page);

    // 13's key numbers and sections read what was saved.
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}`);
    const numbers = page.getByRole("group", { name: "Key numbers" });
    await expect(numbers).toContainText("₱35,000+");
    await expect(numbers).toContainText("1.9+");
    await expect(numbers).toContainText("≤ ₱51,000");
    await expect(
      block(page, "Sections").getByRole("link", {
        name: /06–08 Unit Economics/,
      }),
    ).toContainText("2/7 inputs");
  });
});

test.describe("19 Decision on a desktop", () => {
  test.use(desktop);

  test("13 → 19: a decision recorded with its reason shows in 13's decisions", async ({
    page,
    signIn,
    account,
  }) => {
    const { workspace, idea } = await ownIdea(page, signIn, account);
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}`);
    await page.getByRole("button", { name: "Record decision" }).click();
    await expect(page).toHaveURL(/\/decide$/);
    const material = page.getByRole("region", {
      name: "What you know so far",
    });
    await expect(material).toContainText("6 missing");
    await expect(material).toContainText("Piaya tours, in one line.");
    await page.getByRole("button", { name: "Record decision" }).click();
    await expect(page.getByText("Choose one of the options")).toBeVisible();
    await press(page.getByRole("radio", { name: /Hold/ }));
    await expect(
      page.getByText(
        "6 checks are missing. They will be recorded with this decision.",
      ),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: /Why\?/ })
      .fill("Costs and permits are not known yet.");
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: "Record decision" }).click();
    await expect(page).toHaveURL(new RegExp(`/ideas/${idea.id}$`));
    await expect(page.getByText("Decision recorded")).toBeVisible();
    const decisions = block(page, "Decisions");
    await expect(decisions).toContainText("Hold");
    await expect(decisions).toContainText(
      "“Costs and permits are not known yet.”",
    );
  });
});

test.describe("17, 18 and 19 for a Viewer", () => {
  test.use(desktop);

  test("17 and 18 read only; no Record decision, and 19 is closed", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.viewer);
    const { bcdx, ideaId } = await bcdxIdea(page, me, "Bacolod Health Bowl");
    await page.goto(`/w/${bcdx.id}/ideas/${ideaId}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Bacolod Health Bowl" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Record decision" }),
    ).toHaveCount(0);
    await page.goto(`/w/${bcdx.id}/ideas/${ideaId}/costs`);
    await expect(
      page.getByRole("grid", { name: "Startup costs" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Add row" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^F\/A\/U of/ })).toHaveCount(
      0,
    );
    await page
      .getByRole("button", { name: "Row actions for Equipment" })
      .click();
    await expect(page.getByRole("menuitem")).toHaveText(["Comments"]);
    await page.keyboard.press("Escape");
    await page.goto(`/w/${bcdx.id}/ideas/${ideaId}/economics`);
    await expect(page.getByRole("grid", { name: "Inputs" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^F\/A\/U of/ })).toHaveCount(
      0,
    );
    await page.goto(`/w/${bcdx.id}/ideas/${ideaId}/decide`);
    await expect(
      page.getByRole("heading", { name: "You don't have access to this" }),
    ).toBeVisible();
  });
});

test.describe("17, 18 and 19 on a phone", () => {
  test.use(phone);

  test("17: a row in a sheet; the totals from the summary bar", async ({
    page,
    signIn,
    account,
  }) => {
    const { workspace, idea } = await ownIdea(page, signIn, account);
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}/costs`);
    const equipment = tableRow(page, "Startup costs", "Equipment");
    await expect(equipment).toContainText("Tap to fill or mark Unknown");
    await equipment.click();
    const sheet = page.getByRole("dialog", { name: "Edit cost row" });
    await sheet.getByRole("textbox", { name: "Amount" }).fill("20,000");
    await expect(
      sheet.getByRole("group", { name: /F\/A\/U of Equipment/ }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    await sheet.getByRole("button", { name: /Close/ }).click();
    await expect(sheet).toHaveCount(0);
    const summary = page.getByRole("button", { name: /Startup ₱20,000\+/ });
    await expect(summary).toBeVisible();
    await summary.click();
    const drawer = page.getByRole("dialog", { name: "Totals" });
    await expect(drawer.getByRole("group", { name: "Totals" })).toContainText(
      "₱20,000+",
    );
  });

  test("18: the results from the summary bar, the scenarios a row each", async ({
    page,
    signIn,
    account,
  }) => {
    const { workspace, idea } = await ownIdea(page, signIn, account);
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}/economics`);
    await page.getByRole("button", { name: /^BE / }).click();
    const scenarios = page
      .getByRole("dialog", { name: "Results" })
      .getByRole("grid", { name: "Scenarios" });
    await expect(scenarios.getByRole("row")).toHaveCount(5);
    await expect(
      scenarios.getByRole("row").filter({ hasText: "Expected" }),
    ).toContainText("Empty");
    await expectNoAxeViolations(page);
  });

  test("19: Record decision and Cancel fixed at the bottom", async ({
    page,
    signIn,
    account,
  }) => {
    const { workspace, idea } = await ownIdea(page, signIn, account);
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}/decide`);
    await expect(
      page.getByRole("region", { name: "What you know so far" }),
    ).toContainText("6 missing");
    const record = page.getByRole("button", { name: "Record decision" });
    const cancel = page.getByRole("button", { name: "Cancel" });
    await expect(record).toBeInViewport();
    await expect(cancel).toBeInViewport();
    await expectNoAxeViolations(page);
    await cancel.click();
    await expect(page).toHaveURL(new RegExp(`/ideas/${idea.id}$`));
  });
});
