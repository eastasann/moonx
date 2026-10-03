import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { expectNoAxeViolations, logIn, query } from "./support";

test.describe.configure({ mode: "serial" });

const ANA = "ana@bcdx.example";

async function ideaIds(name: string) {
  const [row] = await query<{ workspace: string; idea: string }>(
    "select workspace_id as workspace, id as idea from ideas where name = $1",
    [name],
  );
  if (!row) throw new Error(`no idea ${name}`);
  return row;
}

async function planIds(ideaName: string, planName: string) {
  const { workspace, idea } = await ideaIds(ideaName);
  const [plan] = await query<{ id: string }>(
    "select id from business_plans where idea_id = $1 and name = $2",
    [idea, planName],
  );
  if (!plan) throw new Error(`no plan ${planName} of ${ideaName}`);
  return { workspace, idea, plan: plan.id };
}

const list = (page: Page, name: string) => page.getByRole("list", { name });

test("Plan A of Piaya shows 20 to 23 as the demo data has them", async ({ page }) => {
  await logIn(page, ANA);
  const { workspace, idea, plan } = await planIds("Piaya Gift Box Delivery", "Plan A");
  const home = `/w/${workspace}/ideas/${idea}/plans/${plan}`;

  // 20 Plan home
  await page.goto(home);
  await expect(page.getByRole("heading", { level: 1, name: "Plan A" })).toBeVisible();
  await expect(page.getByText("Version: v1 For advisors + changes")).toBeVisible();
  await expect(page.getByText("Latest decision is")).toHaveCount(0);
  const numbers = page.getByRole("heading", { name: "Key numbers (from validation)" });
  await expect(numbers).toBeVisible();
  await expect(page.getByText("₱169,500").first()).toBeVisible();
  await expect(page.getByText("6.9 / day").first()).toBeVisible();
  await expect(page.getByText("₱18,490").first()).toBeVisible();
  await expect(page.getByText("9.2").first()).toBeVisible();
  const goNoGoBlock = page.getByRole("heading", { name: "Go / No-Go" }).locator("xpath=..");
  await expect(goNoGoBlock).toContainText("Delay");
  await expect(goNoGoBlock).toContainText("Ana");
  await expect(list(page, "Versions").getByRole("link", { name: "v1 For advisors" })).toBeVisible();
  await expect(page.getByText("2 actions due soon")).toBeVisible();
  await expect(page.getByText("1 overdue")).toBeVisible();
  await expect(list(page, "Part A: Business Case").getByRole("listitem")).toHaveCount(10);
  await expect(list(page, "Part B: Execution Plan").getByRole("listitem")).toHaveCount(20);
  await expect(page.getByRole("link", { name: "1 Executive Summary" })).toBeVisible();
  await expectNoAxeViolations(page);

  // 22 Execution
  await page.getByRole("link", { name: "Open the execution plan" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Execution" })).toBeVisible();
  const tabs = page.getByRole("tablist", { name: "Kinds of execution items" });
  for (const label of ["Milestones", "Launch", "KPIs", "Open Questions", "Next Actions"]) {
    await expect(tabs.getByRole("tab", { name: new RegExp(`^${label}`) })).toBeVisible();
  }
  await expect(page.getByText("Business decision").first()).toBeVisible();
  await expectNoAxeViolations(page);
  await tabs.getByRole("tab", { name: /^Next Actions/ }).click();
  await expect(page.getByRole("tabpanel", { name: /^Next Actions/ })).toBeVisible();
  await expect(page.getByRole("gridcell", { name: /Overdue$/ })).toHaveCount(1);
  await expectNoAxeViolations(page);

  // 23 Pitch Deck: 8 slides in the one-minute deck, 12 in the five-minute deck
  await page.goto(`${home}/pitch`);
  await expect(page.getByRole("heading", { level: 1, name: "Pitch Deck" })).toBeVisible();
  await expect(page.getByText(/^Slide \d+ of 8: /)).toHaveCount(8);
  await expect(page.getByText("Not written yet")).toHaveCount(0);
  await page.getByRole("radio", { name: "Five-minute" }).check({ force: true });
  await expect(page.getByText(/^Slide \d+ of 12: /)).toHaveCount(12);
  // Only table cells may be empty (a competitor without a strength, launch steps without actions);
  // no slide has an empty bullet.
  const empty = page.getByText("Not written yet");
  await expect(empty).toHaveCount(
    await page.getByRole("cell", { name: "Not written yet" }).count(),
  );
  await expectNoAxeViolations(page);
});

test("a number on 21 leads back to 17 and to 18 through Edit in validation", async ({ page }) => {
  await logIn(page, ANA);
  const { workspace, idea, plan } = await planIds("Piaya Gift Box Delivery", "Plan A");
  const home = `/w/${workspace}/ideas/${idea}/plans/${plan}`;

  await page.goto(`${home}/items/8`);
  await expect(page.getByRole("heading", { level: 1, name: /Business Model/ })).toBeVisible();
  await expect(page.getByText("₱231.50").first()).toBeVisible();
  await expect(page.getByText("51.4%").first()).toBeVisible();
  await page.getByRole("link", { name: "Edit in validation" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/ideas/${idea}/economics`));
  await expect(page.getByText("₱231.50", { exact: true })).toBeVisible();

  await page.goto(`${home}/items/18`);
  await expect(page.getByRole("heading", { level: 1, name: /People & Hiring/ })).toBeVisible();
  await page.getByRole("link", { name: "Edit in validation" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/ideas/${idea}/costs`));
  await expect(page.getByRole("heading", { name: "Totals" })).toBeVisible();
});

test("Mobile Bike Repair goes to Proceed, a draft is made from M5, and its version and Go / No-Go reach 7", async ({
  page,
}) => {
  await logIn(page, ANA);
  const { workspace, idea } = await ideaIds("Mobile Bike Repair");

  // 7 is read first and the rest is reached by links, so what 7 shows afterwards comes from the
  // app refreshing its own cache and not from a fresh page load.
  await page.goto(`/w/${workspace}/decisions`);
  const log = page.getByRole("grid", { name: "Recorded decisions" });
  await expect(log.getByRole("row").first()).toBeVisible();
  await expect(log.getByRole("row").filter({ hasText: "Mobile Bike Repair" })).toHaveCount(0);
  await page.getByRole("link", { name: "Ideas", exact: true }).first().click();
  await page.getByRole("row", { name: /Mobile Bike Repair/ }).click();
  await page.getByRole("link", { name: "Open validation" }).click();
  await page
    .getByRole("button", { name: "Record decision" })
    .or(page.getByRole("link", { name: "Record decision" }))
    .first()
    .click();
  await expect(page).toHaveURL(/\/decide$/);
  await page
    .locator("label")
    .filter({ hasText: /^Proceed$/ })
    .click();
  await page
    .getByRole("textbox", { name: /^Why\?/ })
    .fill("Walk-in demand is visible near the market");
  await page.getByRole("button", { name: "Record decision" }).click();
  const ask = page.getByRole("alertdialog", { name: "Create a plan draft?" });
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "Create draft" }).click();

  // M5: the default name is Plan A
  const create = page.getByRole("dialog", { name: "Create plan draft" });
  await expect(create.getByLabel(/^Plan name/)).toHaveValue("Plan A");
  await create.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Plan A" })).toBeVisible();
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Version: No version saved")).toBeVisible();
  await expect(page.getByText("Start with the items marked [V]")).toBeVisible();
  const plans = await query<{ name: string }>(
    "select name from business_plans where idea_id = $1",
    [idea],
  );
  expect(plans).toEqual([{ name: "Plan A" }]);

  // The same name is refused when another draft is added from the switcher
  await page.getByRole("button", { name: /Plans/ }).click();
  await page.getByRole("menuitem", { name: "Add plan" }).click();
  const second = page.getByRole("dialog", { name: "Create plan draft" });
  await second.getByLabel(/^Plan name/).fill("Plan A");
  await second.getByRole("button", { name: "Create draft" }).click();
  await expect(second.getByText("This name is already used.")).toBeVisible();
  await second.getByRole("button", { name: "Cancel" }).click();

  // M3
  await page.getByRole("button", { name: "Save version" }).click();
  const save = page.getByRole("dialog", { name: "Save version" });
  await expect(save.getByLabel(/^Version name/)).toHaveValue("v1");
  await save.getByLabel(/^Version name/).fill("v1 For the shop");
  await save.getByRole("button", { name: "Save version" }).click();
  await expect(page.getByText("Version: v1 For the shop", { exact: true })).toBeVisible();
  await expect(list(page, "Versions").getByRole("link", { name: "v1 For the shop" })).toBeVisible();

  // M4
  await page.getByRole("button", { name: "Record Go/No-Go" }).click();
  const goNoGo = page.getByRole("dialog", { name: "Record Go / No-Go" });
  await goNoGo
    .locator("label")
    .filter({ hasText: /^Delay$/ })
    .click();
  await goNoGo.getByRole("textbox", { name: /^Why\?/ }).fill("The parts supplier is not fixed yet");
  await goNoGo.getByRole("button", { name: "Record", exact: true }).click();
  await expect(goNoGo).toBeHidden();
  await expect(page.getByRole("heading", { name: "Go / No-Go" }).locator("xpath=..")).toContainText(
    "Delay",
  );

  // 7 keeps the decision, the version and the Go / No-Go
  await page.getByRole("link", { name: "Decision Log" }).click();
  await expect(
    log.getByRole("row").filter({ hasText: "Mobile Bike Repair" }).filter({ hasText: "Decision" }),
  ).toContainText("Proceed");
  const versionRow = log
    .getByRole("row")
    .filter({ hasText: "Mobile Bike Repair · Plan A" })
    .filter({ hasText: "Version saved" });
  await expect(versionRow).toContainText("v1 For the shop");
  const goNoGoRow = log
    .getByRole("row")
    .filter({ hasText: "Mobile Bike Repair · Plan A" })
    .filter({ hasText: "Go / No-Go" });
  await expect(goNoGoRow).toContainText("Delay");
  await expect(goNoGoRow).toContainText("The parts supplier is not fixed yet");
  await expectNoAxeViolations(page);
});

test("23 downloads the PDF of the Plan A deck", async ({ page }) => {
  await logIn(page, ANA);
  const { workspace, idea, plan } = await planIds("Piaya Gift Box Delivery", "Plan A");
  await page.goto(`/w/${workspace}/ideas/${idea}/plans/${plan}/pitch`);
  await expect(page.getByText(/^Slide 1 of 8: /)).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.pdf$/);
  const bytes = await readFile(await file.path());
  expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  expect(bytes.length).toBeGreaterThan(5_000);
});
