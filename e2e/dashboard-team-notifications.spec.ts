import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  expectNoAxeViolations,
  logIn,
  query,
  restoreDemoPassword,
  restorePaoloInBcdx,
} from "./support";

const ANA = "ana@bcdx.example";
const KENJI = "kenji@bcdx.example";
const GRACE = "grace@advisor.example";

async function bcdx() {
  const [row] = await query<{ id: string }>("select id from workspaces where name = 'BCDX'");
  if (!row) throw new Error("no BCDX workspace");
  return row.id;
}

const rowsOf = (page: Page, name: string) => page.getByRole("list", { name }).getByRole("listitem");

test("Ana's dashboard shows the four blocks as the demo data has them", async ({ page }) => {
  await restorePaoloInBcdx();
  await logIn(page, ANA);
  await page.goto(`/w/${await bcdx()}`);

  const ideas = page.getByRole("list", { name: "Ideas in this workspace" });
  for (const name of [
    "Piaya Gift Box Delivery",
    "Piaya Gift Box (Corporate)",
    "Bacolod Health Bowl",
    "Student Study Café",
    "Mobile Bike Repair",
  ]) {
    await expect(ideas.getByRole("link", { name })).toBeVisible();
  }
  await expect(ideas.getByRole("link", { name: "Laundry Pickup" })).toHaveCount(0);
  await expect(page.getByText("1 dropped idea hidden")).toBeVisible();
  await expect(
    ideas.getByRole("listitem").filter({ hasText: "Bacolod Health Bowl" }),
  ).toContainText("Hold");

  const analyses = rowsOf(page, "Self analyses of the members");
  await expect(analyses.filter({ hasText: "Ana" })).toContainText("Shared · Done");
  await expect(analyses.filter({ hasText: "Paolo" })).toContainText("Shared · Done");
  const kenji = analyses.filter({ hasText: "Kenji" });
  await expect(kenji).toContainText("Not shared");
  await expect(kenji.getByRole("link")).toHaveCount(0);
  await expect(kenji).not.toContainText("In progress");

  const due = rowsOf(page, "Execution items due soon");
  await expect(due.first()).toBeVisible();
  await expect(due.filter({ hasText: /overdue \d+d/ })).not.toHaveCount(0);

  await expect(rowsOf(page, "Recent activity").first()).toBeVisible();
  await expectNoAxeViolations(page);
});

test("Ana reads Paolo's shared self analysis from the dashboard and comments on an answer", async ({
  page,
}) => {
  await restorePaoloInBcdx();
  await logIn(page, ANA);
  await page.goto(`/w/${await bcdx()}`);
  await page
    .getByRole("list", { name: "Self analyses of the members" })
    .getByRole("link", { name: /Paolo/ })
    .click();
  await expect(page).toHaveURL(/\/team\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 2, name: /Paolo/ })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "WHY" })).toBeVisible();
  await expect(page.getByRole("button", { name: "History" })).toHaveCount(0);

  const members = page.getByRole("grid", { name: "Members" });
  await expect(members.getByRole("row", { name: /Kenji/ })).toHaveAttribute(
    "aria-disabled",
    "true",
  );

  await page.getByRole("button", { name: "Comments" }).first().click();
  const panel = page.getByRole("complementary", { name: "Comments" });
  await panel
    .getByRole("textbox", { name: "Add a comment" })
    .fill("Thanks for sharing this, Paolo.");
  await panel.getByRole("button", { name: "Post" }).click();
  await expect(panel.getByText("Thanks for sharing this, Paolo.")).toBeVisible();
  await expectNoAxeViolations(page);
});

test("Kenji opens the comment he was mentioned in from his unread notifications", async ({
  page,
}) => {
  await restoreDemoPassword(KENJI);
  await logIn(page, KENJI);
  await page.goto("/notifications?filter=unread");
  const list = page.getByRole("grid", { name: "Notifications" });
  const mention = list.getByRole("row").filter({ hasText: "mentioned you" }).first();
  await expect(mention).toContainText("Unread");
  await expectNoAxeViolations(page);
  await mention.click();
  await expect(page.getByRole("complementary", { name: "Comments" })).toBeVisible();
  await expect(page).toHaveURL(/panel=comments/);

  await page.goto("/notifications");
  await expect(
    page
      .getByRole("grid", { name: "Notifications" })
      .getByRole("row")
      .filter({ hasText: "mentioned you" })
      .first(),
  ).not.toContainText("Unread");
});

test("Grace, a Viewer, has no self analysis tab, no team page and no self analyses block", async ({
  page,
}) => {
  await restoreDemoPassword(GRACE);
  await logIn(page, GRACE);
  const workspace = await bcdx();
  await page.goto(`/w/${workspace}`);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(rowsOf(page, "Ideas in this workspace").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Self analyses" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Self Analysis" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Decision Log" }).first()).toBeVisible();

  await page.goto(`/w/${workspace}/team`);
  await expect(page.getByText("You don't have access to this")).toBeVisible();
});

test("the decision log lists what was recorded and opens a decision with what it rested on", async ({
  page,
}) => {
  await logIn(page, ANA);
  await page.goto(`/w/${await bcdx()}/decisions`);
  const list = page.getByRole("grid", { name: "Recorded decisions" });
  await expect(list.getByRole("row").first()).toBeVisible();
  const hold = list.getByRole("row").filter({ hasText: "Bacolod Health Bowl" });
  await expect(hold).toContainText("Hold");
  await expect(list.getByRole("row").filter({ hasText: "Laundry Pickup" })).toContainText("Drop");
  await expectNoAxeViolations(page);

  await hold.click();
  await expect(page.getByRole("heading", { level: 2, name: "Bacolod Health Bowl" })).toBeVisible();
  await expect(page.getByText(/checks? (was|were) missing/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open validation" })).toBeVisible();

  await page.getByRole("button", { name: /Type/ }).click();
  await page.getByRole("option", { name: "Go / No-Go" }).click();
  await expect(list.getByRole("row")).toHaveCount(2);
  await expect(page).toHaveURL(/kind=go_no_go/);
});

test("Kenji continues his self analysis where he stopped and an answer is saved", async ({
  page,
}) => {
  await restoreDemoPassword(KENJI);
  await logIn(page, KENJI);
  await page.goto(`/w/${await bcdx()}/self-analysis`);
  await expect(page.getByRole("heading", { level: 1, name: "My Self Analysis" })).toBeVisible();
  await expect(page.getByText("In progress · 21 / 36 answered")).toBeVisible();
  await expect(page.getByText("Shared with: not shared")).toBeVisible();
  await expectNoAxeViolations(page);

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/self-analysis\/[A-Z]+\?q=/);
  const field = page.getByRole("textbox").first();
  await field.fill("Enough to keep the family safe.");
  await field.blur();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.goto(`/w/${await bcdx()}/self-analysis`);
  await expect(page.getByText("In progress · 22 / 36 answered")).toBeVisible();
});

test("Ana's finished self analysis is shared with BCDX and the sheet shows it", async ({
  page,
}) => {
  await logIn(page, ANA);
  await page.goto(`/w/${await bcdx()}/self-analysis`);
  await expect(page.getByText("Done · 36 / 36 answered")).toBeVisible();
  await expect(page.getByText("Shared with: BCDX")).toBeVisible();
  await page.getByRole("button", { name: "Share" }).click();
  const sheet = page.getByRole("dialog", { name: "Share your self analysis" });
  await expect(sheet.getByRole("checkbox", { name: "BCDX" })).toBeChecked();
  await expectNoAxeViolations(page);
});
