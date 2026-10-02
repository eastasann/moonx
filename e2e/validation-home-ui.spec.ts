import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { expectNoAxeViolations, logIn, query } from "./support";

const ANA = "ana@bcdx.example";

async function ids(ideaName: string) {
  const [row] = await query<{ workspace: string; idea: string }>(
    `select w.id as workspace, i.id as idea from ideas i join workspaces w on w.id = i.workspace_id
     where i.name = $1 and w.name = 'BCDX'`,
    [ideaName],
  );
  if (!row) throw new Error(`no idea ${ideaName}`);
  return row;
}

async function openHome(page: Page, ideaName: string) {
  const { workspace, idea } = await ids(ideaName);
  await page.goto(`/w/${workspace}/ideas/${idea}`);
  await expect(page.getByRole("heading", { level: 1, name: ideaName })).toBeVisible();
  return { workspace, idea };
}

const top = async (page: Page, name: string) => {
  const box = await page.getByRole("list", { name }).boundingBox();
  if (!box) throw new Error(`${name} is not on the page`);
  return box.y;
};

test.describe("the summary sheet", () => {
  test("has no Save button, saves by itself and keeps the text after a reload", async ({
    page,
  }) => {
    await logIn(page, ANA);
    const { workspace } = await ids("Piaya Gift Box Delivery");
    await page.goto(`/w/${workspace}/ideas`);
    await page.getByRole("button", { name: "New idea" }).first().click();
    const create = page.getByRole("dialog", { name: "New idea" });
    await create.getByLabel(/^Name/).fill("Cebu Dried Mango Stall");
    await create.getByLabel(/^One-line concept/).fill("Dried mango at the airport");
    await create.getByRole("button", { name: "Create idea" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Cebu Dried Mango Stall" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Edit summary" }).click();
    const sheet = page.getByRole("dialog", { name: "Edit summary" });
    await expect(sheet.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
    await sheet.getByLabel("Proposed solution").fill("Sell from a cart near the arrival gate");
    await sheet.getByLabel("Proposed solution").blur();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    await sheet.getByLabel(/^Name/).fill("");
    await sheet.getByLabel(/^Name/).blur();
    await expect(sheet.getByText("Required")).toBeVisible();
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).toBeHidden();

    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Cebu Dried Mango Stall" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Edit summary" }).click();
    await expect(page.getByRole("dialog").getByLabel("Proposed solution")).toHaveValue(
      "Sell from a cart near the arrival gate",
    );
    await expectNoAxeViolations(page);
  });
});

test("a Fact shows a chip for each piece of evidence", async ({ page }) => {
  await logIn(page, ANA);
  const { workspace, idea } = await ids("Piaya Gift Box Delivery");
  await page.goto(`/w/${workspace}/ideas/${idea}/questions/01`);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  const chips = page.getByRole("grid", { name: "Evidence" }).first();
  await expect(chips).toBeVisible();
  await expect(chips.getByRole("row").first()).toHaveText(/\S/);
});

test("the ideas list names the competitors range of an idea that lacks competitors", async ({
  page,
}) => {
  await logIn(page, ANA);
  const { workspace } = await ids("Mobile Bike Repair");
  await page.goto(`/w/${workspace}/ideas`);
  const row = page.getByRole("row", { name: /Mobile Bike Repair/ });
  await expect(row).toContainText("Missing: Competitors (3–5), Local price range");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the home stacks Summary after the sections", async ({ page }) => {
    await logIn(page, ANA);
    await openHome(page, "Piaya Gift Box Delivery");
    const checks = await top(page, "Checks");
    const sections = await top(page, "Sections");
    const summary = await top(page, "Summary");
    const decisions = await top(page, "Decisions");
    expect(checks).toBeLessThan(sections);
    expect(sections).toBeLessThan(summary);
    expect(summary).toBeLessThan(decisions);
  });

  test("an @ in a comment opens a tray to choose the member", async ({ page }) => {
    await logIn(page, ANA);
    await openHome(page, "Piaya Gift Box Delivery");
    await page.getByRole("button", { name: "Comments" }).click();
    const input = page.getByRole("textbox", { name: "Add a comment" });
    await input.fill("Thanks @");
    const tray = page.getByRole("dialog", { name: "Members" });
    await expect(tray).toBeVisible();
    await tray.getByRole("option").first().click();
    await expect(tray).toBeHidden();
    await expect(input).toHaveValue(/^Thanks @\S+/);
  });
});
