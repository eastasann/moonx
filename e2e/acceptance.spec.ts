import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Workspace } from "@moonx/schemas";
import type { APIRequestContext, Page } from "@playwright/test";
import { SLOWNESS, WEB_ORIGIN } from "./env";
import {
  type Account,
  apiAs,
  expect,
  expectNoAxeViolations,
  linkMailedTo,
  nextAddress,
  operatorInvited,
  signUpThroughApi,
  test,
  uniqueEmail,
} from "./fixtures";

// The acceptance suite (SDD 10章 E2E, design-spec 2.3, PRD 4章), in a team of the run's
// own: its Member takes an idea through the core flow, from logging in to the Pitch
// Deck's PDF, then its Viewer reads what the Member made and comments, through the screens
// a person uses and the behaviour the docs promise. Axe checks each screen and overlay the
// Member passes, and the Viewer's 11, 13 and comment panel; the other screens have theirs
// in their own specs. The seeded BCDX is not touched.

const desktop = { viewport: { width: 1440, height: 900 } };

const IDEA = "Piaya Office Boxes";
const CONCEPT = "Boxes of fresh piaya delivered to offices for meetings.";
const WHO = "Admin staff of offices in Bacolod who order snacks.";
const PROBLEM = "Meeting snacks are ordered late and arrive cold.";
const BUSINESS_NAME = "Piaya Office Co.";
const VERSION = "v1 For advisors";
const COMMENT = "Which offices did you ask?";

/** The section of a hub a block's heading names. */
const block = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true });

/** A question of 11 by its title ("WHO"). */
const question = (page: Page, title: string) =>
  page.getByRole("region", { name: title, exact: true });

/** The slide of 23 shown now, by its title. */
const slideOn = (page: Page, name: string) =>
  page.getByRole("main").getByRole("region", { name, exact: true });

/** The row of the table `table` whose text has `name`. */
const tableRow = (page: Page, table: string, name: string) =>
  page
    .getByRole("grid", { name: table, exact: true })
    .getByRole("row")
    .filter({ hasText: name });

/**
 * Presses a Checkbox or Radio by its row: React Aria's input is hidden under the box, which
 * takes the pointer, as for a person.
 */
const press = (control: ReturnType<Page["getByRole"]>) =>
  control.locator("xpath=ancestor::label[1]").click();

/** Types `value` into the cell of a worksheet's row, which takes it once pressed. */
async function typeInRow(
  page: Page,
  table: string,
  row: string,
  field: string,
  value: string,
) {
  await tableRow(page, table, row).getByText("Empty").first().click();
  const input = page.getByRole("textbox", { name: `${field} ${row}` });
  await expect(input).toBeFocused();
  await input.fill(value);
}

/** Each page of the PDF at `path`: its text, and its footer's alone (read-pdf.ts). */
const pdfPages = (path: string) =>
  JSON.parse(
    execFileSync(
      "bun",
      [fileURLToPath(new URL("./read-pdf.ts", import.meta.url)), path],
      { timeout: 60_000 * SLOWNESS },
    ).toString(),
  ) as { text: string; footer: string }[];

/**
 * A PDF page's footer for `version` (design-spec 6.14): the date as the en-PH format
 * writes one of this year or another ("Oct 29", "Oct 29, 2025").
 */
const footerOf = (version: string) =>
  new RegExp(
    `^Piaya Office Co\\. · ${version} · [A-Z][a-z]{2} \\d{1,2}(, \\d{4})?$`,
  );

/** Downloads the deck 23 shows with Download PDF. */
async function downloadPdf(page: Page) {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const file = await download;
  return { name: file.suggestedFilename(), pages: pdfPages(await file.path()) };
}

/** {@link apiAs}'s context, signed in as `account`. */
async function apiSignedIn(account: Account, workerIndex: number) {
  const context = await apiAs(workerIndex);
  const signedIn = await context.post("/api/auth/sign-in/email", {
    data: account,
  });
  expect(signedIn.ok(), await signedIn.text()).toBe(true);
  return context;
}

/**
 * Someone the Owner invites to `workspace` with `role` (W4), signed up from the mail's
 * link (U5) and joined (U6).
 */
async function join(
  owner: APIRequestContext,
  workspace: Workspace,
  role: "member" | "viewer",
  displayName: string,
  workerIndex: number,
): Promise<Account> {
  const email = uniqueEmail(`acceptance-${role}`);
  const invited = await owner.post(
    `/api/v1/workspaces/${workspace.id}/invitations`,
    { data: { email, role } },
  );
  expect(invited.status(), await invited.text()).toBe(201);
  const link = await linkMailedTo(email, /https?:\/\/\S+\/invite\/[\w-]+/);
  const token = link.pathname.replace("/invite/", "");
  const account = { email, password: `acceptance-${role}-2026` };
  await signUpThroughApi(
    token,
    { displayName, password: account.password },
    workerIndex,
  );
  const person = await apiSignedIn(account, workerIndex);
  try {
    const accepted = await person.post(
      `/api/v1/invitations/by-token/${token}/accept`,
      { data: {} },
    );
    expect(accepted.ok(), await accepted.text()).toBe(true);
  } finally {
    await person.dispose();
  }
  return account;
}

/**
 * A team the Owner makes (W0), with a Member and a Viewer in it: the Owner's own
 * invitations are spent, not BCDX's Owner's, which the whole run shares (SDD 7.2).
 */
async function makeTeam(workerIndex: number) {
  const owner = await operatorInvited(workerIndex, "acceptance-owner");
  const api = await apiSignedIn(owner, workerIndex);
  try {
    const made = await api.post("/api/v1/workspaces", {
      data: { name: `Piaya Team ${Date.now() % 1_000_000}` },
    });
    expect(made.status(), await made.text()).toBe(201);
    const workspace = (await made.json()) as Workspace;
    return {
      workspace,
      member: await join(api, workspace, "member", "Mia Member", workerIndex),
      viewer: await join(api, workspace, "viewer", "Ada Advisor", workerIndex),
    };
  } finally {
    await api.dispose();
  }
}

test.describe("a team's core flow, then its Viewer, on a desktop", () => {
  // The Viewer reads what the core flow made: a failure skips the rest, and a retry runs
  // the whole group again with a new team.
  test.describe.configure({ mode: "serial" });
  test.use(desktop);

  let team: Awaited<ReturnType<typeof makeTeam>>;

  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures a hook needs from this pattern, and this one needs none.
  test.beforeAll(async ({}, workerInfo) => {
    team = await makeTeam(workerInfo.workerIndex);
  });

  test("the Member: an idea made, answered with evidence, costed, decided, planned, versioned, given a Go and pitched as a PDF", async ({
    page,
  }) => {
    // Ten screens and six overlays, each checked by axe once its announcements clear:
    // about 80 seconds alone, longer beside the other specs.
    test.setTimeout(240_000 * SLOWNESS);

    await test.step("2 → 5 → M7 → 5: logging in, then to the team's workspace (C-02, C-04)", async () => {
      await page.goto("/login");
      const form = page.getByRole("form", { name: "Log in" });
      await form
        .getByRole("textbox", { name: /Email/ })
        .fill(team.member.email);
      await form.getByLabel(/^Password/).fill(team.member.password);
      await page.getByRole("button", { name: "Log in", exact: true }).click();
      // The workspace opened last: the personal one, made at sign-up.
      await expect(
        page.getByRole("heading", { level: 1, name: "Mia Member's workspace" }),
      ).toBeVisible();
      await page
        .getByRole("button", {
          name: "Mia Member's workspace, switch workspace",
        })
        .click();
      const m7 = page.getByRole("dialog", { name: "Switch workspace" });
      await expect(
        m7.getByRole("listitem").filter({ hasText: team.workspace.name }),
      ).toContainText("Member");
      await m7
        .getByRole("link", { name: new RegExp(team.workspace.name) })
        .click();
      await expect(page).toHaveURL(`${WEB_ORIGIN}/w/${team.workspace.id}`);
      await expect(
        page.getByRole("heading", { level: 1, name: team.workspace.name }),
      ).toBeVisible();
      await expect(block(page, "Getting started")).toBeVisible();
      await expectNoAxeViolations(page);
    });

    await test.step("5 → M1 → 13: an idea from its name and one line (MB-01)", async () => {
      await block(page, "Getting started")
        .getByRole("button", { name: "Write your first idea" })
        .click();
      const dialog = page.getByRole("dialog", { name: "New idea" });
      const create = dialog.getByRole("button", { name: "Create" });
      await expect(create).toBeDisabled();
      await dialog.getByRole("textbox", { name: /^Name/ }).fill(IDEA);
      await dialog
        .getByRole("textbox", { name: /^One-line concept/ })
        .fill(CONCEPT);
      await expectNoAxeViolations(page);
      await create.click();
      await expect(
        page.getByRole("heading", { level: 1, name: IDEA }),
      ).toBeVisible();
      // What is missing, not a score (MB-03, design-spec 6.1「作ったばかり」).
      await expect(
        block(page, "Next steps").getByRole("listitem").first(),
      ).toContainText("Start with 01 Customer & Problem");
      await expect(
        page.getByRole("group", { name: "Key numbers" }),
      ).toContainText("Empty");
      await expectNoAxeViolations(page);
    });

    await test.step("13 → 11 → M2: answers marked F/A/U, a Fact with its evidence (MB-04, MB-05)", async () => {
      await block(page, "Sections")
        .getByRole("link", { name: /01 Customer & Problem/ })
        .click();
      await expect(
        page.getByRole("heading", { level: 1, name: "01 Customer & Problem" }),
      ).toBeVisible();
      const who = page.getByRole("textbox", { name: "Answer to WHO" });
      await expect(who).toBeFocused();
      // Saved as typed (MB-09).
      await who.fill(WHO);
      await expect(page.getByText("Saved")).toBeVisible();
      const whoCard = question(page, "WHO");
      await whoCard.getByRole("radio", { name: /Assumption/ }).click();
      await whoCard.getByRole("radio", { name: "Medium" }).click();
      await expect(whoCard).toContainText("Assumption · Medium");

      await question(page, "PROBLEM")
        .getByRole("button", { name: "PROBLEM" })
        .click();
      const problem = page.getByRole("textbox", { name: "Answer to PROBLEM" });
      await expect(problem).toBeFocused();
      await problem.fill(PROBLEM);
      const problemCard = question(page, "PROBLEM");
      await problemCard.getByRole("radio", { name: /Fact/ }).click();
      const evidence = page.getByRole("dialog", { name: "Evidence" });
      await expect(evidence).toBeVisible();
      await evidence.getByRole("radio", { name: "New entry" }).click();
      await evidence
        .getByRole("textbox", { name: /Topic/ })
        .fill("Calls to five office managers");
      await press(
        evidence.getByRole("checkbox", { name: "Demand or problem signal" }),
      );
      await expectNoAxeViolations(page);
      await evidence.getByRole("button", { name: "Add and attach" }).click();
      await expect(
        evidence.getByRole("row", { name: /Calls to five office managers/ }),
      ).toBeVisible();
      await evidence.getByRole("button", { name: "Done" }).click();
      await expect(evidence).toHaveCount(0);
      await expect(problemCard).toContainText("Fact · 1 source");
      await expectNoAxeViolations(page);

      await page
        .getByRole("list", { name: "Breadcrumbs" })
        .getByRole("link", { name: IDEA })
        .click();
      await expect(
        block(page, "Checks")
          .getByRole("listitem")
          .filter({ hasText: "Demand or problem signal" }),
      ).toContainText("Done");
    });

    await test.step("13 → 17 → 18: costs and a price give the results at once (MB-08)", async () => {
      await block(page, "Sections")
        .getByRole("link", { name: /05 Costs/ })
        .click();
      await expect(page).toHaveURL(/\/costs$/);
      const totals = page.getByRole("group", { name: "Totals" });
      await typeInRow(
        page,
        "Startup costs",
        "Equipment",
        "Amount of",
        "35,000",
      );
      // Rows left Empty make each total a lower bound (design-spec 6.3).
      await expect(totals).toContainText("₱35,000+");
      await typeInRow(
        page,
        "Monthly fixed costs",
        "Rent",
        "Amount of",
        "12,000",
      );
      await expect(totals).toContainText("₱12,000+");
      await typeInRow(
        page,
        "Variable costs",
        "Core Product / Materials",
        "Amount of",
        "120",
      );
      await expect(totals).toContainText("₱120.00+");
      await expect(page.getByText("Saved")).toBeVisible();
      // Pressed outside the tables, the rows show their values again, as a person leaves
      // them (design-spec 4.5 TableView): axe checks the page as read, not mid-edit.
      await page.getByRole("heading", { level: 1, name: "05 Costs" }).click();
      await expectNoAxeViolations(page);

      await page.getByRole("link", { name: /Unit Economics/ }).click();
      await expect(page).toHaveURL(/\/economics$/);
      await typeInRow(page, "Inputs", "Price", "Value of", "450");
      await typeInRow(page, "Daily sales", "Expected", "Value of", "10");
      await expect(page.getByText("Saved")).toBeVisible();
      // P 450, VC 120, FC 12,000, IC 35,000, D 30 by default, Expected 10 a day, m 15%
      // by default (design-spec 6.4): break-even 12,000 / 330 = 36.4 a month, 1.2 a day;
      // the Expected 300 a month earn 300 × 330 − 12,000 = 87,000, which pays 35,000
      // back in 0.4 months. The Empty rows make each a bound.
      const results = page.getByRole("group", { name: "Results" });
      for (const value of [
        "≤ ₱330.00",
        "1.2+",
        "36.4+ / month",
        "≤ ₱87,000",
        "0.4+ months",
      ]) {
        await expect(results).toContainText(value);
      }
      await expect(page.getByText("using default 30 days")).toBeVisible();
      await expect(
        page.getByText(
          "Some cost rows are Empty or Unknown, so results may look better than reality.",
        ),
      ).toBeVisible();
      // Out of the tables, as on 17.
      await page
        .getByRole("heading", {
          level: 1,
          name: "06–08 Unit Economics & Scenarios",
        })
        .click();
      await expectNoAxeViolations(page);
    });

    await test.step("13 → 19: Proceed recorded with its reason and what is missing (MB-11)", async () => {
      await page
        .getByRole("list", { name: "Breadcrumbs" })
        .getByRole("link", { name: IDEA })
        .click();
      await expect(
        page.getByRole("group", { name: "Key numbers" }),
      ).toContainText("≤ ₱87,000");
      await page.getByRole("button", { name: "Record decision" }).click();
      await expect(page).toHaveURL(/\/decide$/);
      const material = page.getByRole("region", {
        name: "What you know so far",
      });
      await expect(material).toContainText(CONCEPT);
      await expect(material).toContainText(WHO);
      await press(page.getByRole("radio", { name: /Proceed/ }));
      await expect(
        page.getByText(
          "Proceed means it is worth planning, not approval to launch.",
        ),
      ).toBeVisible();
      // Competitors, Local price range, Permits, and the costs Partial (design-spec 6.1).
      await expect(
        page.getByText(
          "4 checks are missing. They will be recorded with this decision.",
        ),
      ).toBeVisible();
      await page
        .getByRole("textbox", { name: /Why\?/ })
        .fill("Offices asked for it; the numbers leave room.");
      await expectNoAxeViolations(page);
      await page.getByRole("button", { name: "Record decision" }).click();
    });

    await test.step("19 → M5 → 20: the plan draft carries the validation over (MB-19)", async () => {
      const prompt = page.getByRole("alertdialog", {
        name: "Create a plan draft?",
      });
      await expect(prompt).toBeVisible();
      await expectNoAxeViolations(page);
      await prompt.getByRole("button", { name: "Create draft" }).click();
      const create = page.getByRole("dialog", { name: "Create plan draft" });
      await expect(
        create.getByRole("textbox", { name: /Plan name/ }),
      ).toHaveValue("Plan A");
      await expectNoAxeViolations(page);
      await create.getByRole("button", { name: "Create draft" }).click();
      await expect(page).toHaveURL(/\/plans\/[0-9a-f-]+$/);
      await expect(
        page.getByRole("heading", { level: 1, name: "Plan A" }),
      ).toBeVisible();
      await expect(page.getByText(/^No version saved · Updated/)).toBeVisible();
      // The numbers read from the validation, not copied (design-spec 6.12).
      await expect(block(page, "Key numbers")).toContainText("≤ ₱87,000");
      await page
        .getByRole("textbox", { name: "Business Name" })
        .fill(BUSINESS_NAME);
      await expect(page.getByText("Saved", { exact: true })).toBeVisible();
      await expectNoAxeViolations(page);
    });

    await test.step("20 → M3: a named version (MB-22)", async () => {
      await page.getByRole("button", { name: "Save version" }).click();
      const save = page.getByRole("dialog", { name: "Save version" });
      const name = save.getByRole("textbox", { name: /Version name/ });
      await expect(name).toHaveValue("v1");
      await name.fill(VERSION);
      await expectNoAxeViolations(page);
      await save.getByRole("button", { name: "Save version" }).click();
      await expect(save).toBeHidden();
      await expect(
        page.getByText(`Version: ${VERSION} · Updated`, { exact: false }),
      ).toBeVisible();
    });

    await test.step("20 → M4: Launch recorded with its reason (MB-23)", async () => {
      await page.getByRole("button", { name: "Record Go / No-Go" }).click();
      const goNoGo = page.getByRole("dialog", { name: "Record Go / No-Go" });
      await expect(
        goNoGo.getByRole("button", { name: "Record" }),
      ).toBeDisabled();
      await press(goNoGo.getByRole("radio", { name: "Launch" }));
      await goNoGo
        .getByRole("textbox", { name: /Why\?/ })
        .fill("Three offices will order in the first month.");
      await expectNoAxeViolations(page);
      await goNoGo.getByRole("button", { name: "Record" }).click();
      await expect(goNoGo).toBeHidden();
      await expect(block(page, "Go / No-Go")).toContainText("Launch");
    });

    await test.step("20 → 23: the saved version's deck as a PDF (MB-25)", async () => {
      await page.getByRole("button", { name: "Pitch Deck" }).click();
      await expect(page).toHaveURL(/\/pitch$/);
      // The title slide, headed by the Business Name, once the deck has come.
      await expect(slideOn(page, BUSINESS_NAME)).toBeVisible();
      const slides = page.getByRole("listbox", { name: "Slides" });
      await expect(slides.getByRole("option")).toHaveCount(8);
      // The validation's PROBLEM, which M5 copied into §4, needs no retyping (MB-19).
      await slides.getByRole("option", { name: "2 Problem" }).click();
      await expect(slideOn(page, "Problem")).toContainText(PROBLEM);
      await page.getByRole("button", { name: /^From/ }).click();
      await page.getByRole("option", { name: VERSION }).click();
      await expect(page).toHaveURL(/\/pitch\?version=[\w-]+$/);
      await expect(slideOn(page, "Problem")).toContainText(`${VERSION} ·`);
      await expectNoAxeViolations(page);

      const { name, pages } = await downloadPdf(page);
      // SDD 5.3 P13: {Business Name}-{length}-{version}-{date}.pdf.
      expect(name).toMatch(
        /^Piaya Office Co\.-one-v1 For advisors-\d{4}-\d{2}-\d{2}\.pdf$/,
      );
      // A page a slide, each with "Business Name · version · date" at its foot
      // (design-spec 6.14「Download PDF」).
      expect(pages).toHaveLength(8);
      for (const { footer } of pages) {
        expect(footer).toMatch(footerOf(VERSION));
      }
      // The one-minute deck (design-spec 6.14): §1's concept, §4's problem and §3's
      // customer from the validation, and the business model's numbers from 18.
      expect(pages[0]?.text).toContain(CONCEPT);
      expect(pages[1]?.text).toContain(PROBLEM);
      expect(pages[2]?.text).toContain(WHO);
      for (const value of ["₱450", "≤ ₱330.00", "1.2+"]) {
        expect(pages[5]?.text).toContain(value);
      }
    });

    await test.step("7: who decided what, when and why (C-06)", async () => {
      await page
        .getByRole("navigation", { name: "Main" })
        .getByRole("link", { name: "Decision Log" })
        .click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Decision Log" }),
      ).toBeVisible();
      const rows = page
        .getByRole("grid", { name: "Decisions" })
        .getByRole("row");
      // Newest first: the Go / No-Go, the version, the decision (design-spec 6.15).
      await expect(rows.nth(1)).toContainText("Launch");
      await expect(rows.nth(1)).toContainText("Go / No-Go · Mia Member");
      await expect(rows.nth(2)).toContainText(VERSION);
      await expect(rows.nth(3)).toContainText("Proceed");
      await expect(rows.nth(3)).toContainText(
        "“Offices asked for it; the numbers leave room.”",
      );
      await rows.nth(3).click();
      await expect(page.getByText("Checks missing then")).toBeVisible();
      await expect(page.getByRole("main")).toContainText("Permits");
      await expect(
        page.getByRole("group", { name: "Key numbers then" }),
      ).toContainText("≤ ₱87,000");
      await expectNoAxeViolations(page);
      await page.getByRole("link", { name: "Open validation" }).click();
      await expect(page).toHaveURL(
        new RegExp(
          `^${WEB_ORIGIN}/w/${team.workspace.id}/ideas/[0-9a-f-]{36}$`,
        ),
      );
      await expect(block(page, "Decisions")).toContainText("Proceed");
    });
  });

  test("the Viewer: reads the idea, its plan and deck with no way to change them, and a comment reaches the Member", async ({
    page,
    browser,
    signIn,
  }, testInfo) => {
    // Two people's sessions, a PDF and the announcements a comment's Post leaves.
    test.slow();
    await signIn(team.viewer.email, team.viewer.password);

    await test.step("5 → 6: the team's ideas with their stage, decision and gaps, and nothing to make one with (VW-01)", async () => {
      await page.goto(`/w/${team.workspace.id}`);
      await expect(block(page, "Ideas")).toContainText(IDEA);
      // A Viewer reads no one's self analysis (design-spec 2.1).
      await expect(block(page, "Self analyses")).toHaveCount(0);
      await page
        .getByRole("navigation", { name: "Main" })
        .getByRole("link", { name: "Ideas", exact: true })
        .click();
      const row = page
        .getByRole("grid", { name: "Ideas" })
        .getByRole("row", { name: new RegExp(IDEA) });
      // A Launch makes the stage Launch prep (design-spec 6.8「工程」).
      await expect(row).toContainText("Launch prep · Mia Member");
      await expect(row).toContainText("Proceed");
      await expect(row).toContainText("Missing: 4 checks");
      await expect(page.getByRole("button", { name: "New idea" })).toHaveCount(
        0,
      );
    });

    await test.step("6 → 13 → 11: the validation and its evidence read only (VW-02)", async () => {
      await page.getByRole("button", { name: "Open validation" }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: IDEA }),
      ).toBeVisible();
      await expect(block(page, "Decisions")).toContainText("Proceed");
      await expect(block(page, "Plans")).toContainText("Plan A");
      // design-spec 6.1「状態」: no editing, deciding, AI, Add plan or ⋯ for a Viewer.
      for (const tool of ["Edit summary", "Record decision", "AI"]) {
        await expect(
          page.getByRole("button", { name: tool, exact: true }),
        ).toHaveCount(0);
      }
      await expect(page.getByRole("link", { name: "Add plan" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^More for/ })).toHaveCount(
        0,
      );
      await expectNoAxeViolations(page);

      await block(page, "Sections")
        .getByRole("link", { name: /01 Customer & Problem/ })
        .click();
      await expect(question(page, "WHO")).toContainText(WHO);
      await expect(question(page, "PROBLEM")).toContainText("Fact · 1 source");
      await expect(
        question(page, "PROBLEM").getByRole("row", {
          name: /Calls to five office managers/,
        }),
      ).toBeVisible();
      await expect(page.getByRole("textbox")).toHaveCount(0);
      await expectNoAxeViolations(page);
      await page
        .getByRole("list", { name: "Breadcrumbs" })
        .getByRole("link", { name: IDEA })
        .click();
    });

    await test.step("13 → 20 → 23: the plan and its deck, and the PDF (VW-04)", async () => {
      await block(page, "Plans")
        .getByRole("link", { name: /Plan A/ })
        .click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Plan A" }),
      ).toBeVisible();
      await expect(block(page, "Go / No-Go")).toContainText("Launch");
      for (const tool of ["Save version", "Record Go / No-Go"]) {
        await expect(page.getByRole("button", { name: tool })).toHaveCount(0);
      }
      await page.getByRole("button", { name: "Pitch Deck" }).click();
      await expect(page).toHaveURL(/\/pitch$/);
      await expect(slideOn(page, BUSINESS_NAME)).toBeVisible();
      await expect(page.getByRole("link", { name: "Edit source" })).toHaveCount(
        0,
      );
      const { name, pages } = await downloadPdf(page);
      // The plan now, which nothing changed since the version: a draft by name.
      expect(name).toMatch(
        /^Piaya Office Co\.-one-draft-\d{4}-\d{2}-\d{2}\.pdf$/,
      );
      expect(pages).toHaveLength(8);
      for (const { footer } of pages) {
        expect(footer).toMatch(footerOf("Draft"));
      }
    });

    await test.step("23 → PNL-1: a comment on a slide (VW-03)", async () => {
      await page
        .getByRole("listbox", { name: "Slides" })
        .getByRole("option", { name: "2 Problem" })
        .click();
      await expect(slideOn(page, "Problem")).toContainText(PROBLEM);
      await page.getByRole("button", { name: "Comments on Problem" }).click();
      const panel = page.getByRole("complementary", { name: "Comments" });
      const box = panel.getByRole("textbox", { name: "Add a comment" });
      await box.click();
      await box.pressSequentially(COMMENT);
      await panel.getByRole("button", { name: "Post" }).click();
      await expect(panel.getByText(COMMENT)).toBeVisible();
      await expectNoAxeViolations(page);
    });

    await test.step("8: the Member, who made the plan, is told; the row opens the slide's thread", async () => {
      const context = await browser.newContext({
        ...desktop,
        extraHTTPHeaders: {
          "X-Forwarded-For": nextAddress(testInfo.workerIndex),
        },
      });
      try {
        // The page's request context shares its cookies, so the page is signed in too.
        const member = await context.newPage();
        const signedIn = await member.request.post("/api/auth/sign-in/email", {
          data: team.member,
          headers: { Origin: WEB_ORIGIN },
        });
        expect(signedIn.ok(), await signedIn.text()).toBe(true);
        await member.goto("/notifications");
        const row = member
          .getByRole("grid", { name: "Notifications" })
          .getByRole("row")
          .filter({ hasText: "Ada Advisor commented on" });
        await expect(row).toHaveCount(1);
        await expect(row).toContainText(COMMENT);
        await row.click();
        await expect(member).toHaveURL(/\/pitch\b/);
        await expect(slideOn(member, "Problem")).toBeVisible();
        await expect(
          member
            .getByRole("complementary", { name: "Comments" })
            .getByText(COMMENT),
        ).toBeVisible();
      } finally {
        await context.close();
      }
    });
  });
});
