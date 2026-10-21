import AxeBuilder from "@axe-core/playwright";
import type { IdeaDetail, Me } from "@moonx/schemas";
import type { Page } from "@playwright/test";
import { WEB_ORIGIN } from "./env";
import { demo, expect, newAccount, test, workspaceOf } from "./fixtures";

// 11 Question form for the validation's sections, M2 Evidence and 14 Research log
// (design-spec 6.2・6.0.3・6.10), against the seeded BCDX (read only) and, for what
// writes, the personal workspace of an account each test makes.

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
  // as low contrast: the page is checked once overlays have settled.
  await expect(page.locator("[data-entering], [data-exiting]")).toHaveCount(0);
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

/** A user of their own, signed in, with an idea in their personal workspace. */
async function ownIdea(
  page: Page,
  signIn: (email: string, password?: string) => Promise<Me>,
  label: string,
) {
  const account = await newAccount(test.info().workerIndex, label);
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
  }) => {
    const { workspace, idea } = await ownIdea(page, signIn, "answers");
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
  }) => {
    const { workspace, idea } = await ownIdea(page, signIn, "research");
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
  }) => {
    const { workspace, idea } = await ownIdea(page, signIn, "ocean");
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

  test("13's links: Summary opens the question, a check opens 14's new entry", async ({
    page,
    signIn,
  }) => {
    const { workspace, idea } = await ownIdea(page, signIn, "links");
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}`);
    await block(page, "Summary")
      .getByRole("link", { name: "Answer in 02 Market" })
      .click();
    await expect(page).toHaveURL(/\/questions\/02\?q=V\.02\.OCEAN/);
    await expect(page.getByRole("radio", { name: "Red" })).toBeFocused();
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}`);
    // A new idea has the Permits cost row, whose check opens 17 (not built yet: no link);
    // the demand check opens 14's new entry.
    const checks = block(page, "Checks");
    await expect(
      checks.getByRole("listitem").filter({ hasText: "Permits" }),
    ).toBeVisible();
    await expect(
      checks
        .getByRole("listitem")
        .filter({ hasText: "Permits" })
        .getByRole("link"),
    ).toHaveCount(0);
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
  }) => {
    const { workspace, idea } = await ownIdea(page, signIn, "phone-log");
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
  }) => {
    const { workspace, idea } = await ownIdea(page, signIn, "phone-form");
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
