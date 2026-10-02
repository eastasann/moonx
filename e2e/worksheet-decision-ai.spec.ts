import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { expectNoAxeViolations, logIn, query } from "./support";

test.describe.configure({ mode: "serial" });

async function workspaceId() {
  const [bcdx] = await query<{ id: string }>("select id from workspaces where name = 'BCDX'");
  if (!bcdx) throw new Error("no BCDX workspace");
  return bcdx.id;
}

async function createIdea(page: Page, name: string) {
  const workspace = await workspaceId();
  await page.goto(`/w/${workspace}/ideas`);
  await page.getByRole("button", { name: "New idea" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New idea" });
  await dialog.getByLabel(/^Name/).fill(name);
  await dialog.getByLabel(/^One-line concept/).fill("Made by the worksheet spec");
  await dialog.getByRole("button", { name: "Create idea" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  const [idea] = await query<{ id: string }>("select id from ideas where name = $1", [name]);
  const [validation] = await query<{ id: string }>(
    "select id from validations where idea_id = $1",
    [idea?.id ?? ""],
  );
  if (!idea || !validation) throw new Error(`no idea or validation for ${name}`);
  return { workspace, idea: idea.id, validation: validation.id };
}

async function piaya() {
  const [row] = await query<{ idea: string }>(
    "select id as idea from ideas where name = 'Piaya Gift Box Delivery'",
  );
  if (!row) throw new Error("no Piaya idea");
  return { workspace: await workspaceId(), idea: row.idea };
}

const saved = (page: Page) =>
  page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes("/cost-items/"));

test("Piaya's costs and economics show the design-spec 8.3 numbers and follow an edit", async ({
  page,
}) => {
  await logIn(page, "ana@bcdx.example");
  const { workspace, idea } = await piaya();
  await page.goto(`/w/${workspace}/ideas/${idea}/costs`);
  await expect(page.getByRole("heading", { name: "Totals" })).toBeVisible();
  await expect(page.getByText("₱41,700").first()).toBeVisible();
  await expect(page.getByText("₱169,500").first()).toBeVisible();
  await expectNoAxeViolations(page);

  const rent = page.getByRole("textbox", { name: "Amount of Rent" });
  await rent.fill("13,500");
  await expect(page.getByText("₱43,200").first()).toBeVisible();
  const first = saved(page);
  await rent.blur();
  await first;
  await rent.fill("12,000");
  await expect(page.getByText("₱41,700").first()).toBeVisible();
  const restore = saved(page);
  await rent.blur();
  await restore;

  await page.getByRole("link", { name: "Unit Economics →" }).click();
  await page.waitForURL(/\/economics$/);
  await expect(page.getByText("Unit economics")).toBeVisible();
  await expect(page.getByText("₱231.50", { exact: true })).toBeVisible();
  await expect(page.getByText("51.4%", { exact: true })).toBeVisible();
  await expect(page.getByText("6.9 / day", { exact: true })).toBeVisible();
  await expect(page.getByText("180.1 / month · ₱81,058 / month", { exact: true })).toBeVisible();
  await expectNoAxeViolations(page);
});

test("a new idea gets a cost row, a decision, and the exchange with AI end to end", async ({
  page,
}) => {
  await logIn(page, "ana@bcdx.example");
  const { workspace, idea, validation } = await createIdea(page, "Worksheet Spec Idea");

  await page.goto(`/w/${workspace}/ideas/${idea}/costs`);
  await page.getByRole("button", { name: "Add row to Startup costs" }).click();
  const name = page.getByRole("textbox", { name: "Name of New row" });
  await expect(name).toBeFocused();
  await name.fill("Wrench set");
  const named = saved(page);
  await page.keyboard.press("Tab");
  await named;
  const amount = page.getByRole("textbox", { name: "Amount of Wrench set" });
  await amount.fill("3,000");
  await expect(page.getByText("₱3,000").first()).toBeVisible();
  const amountSaved = saved(page);
  await page.keyboard.press("Tab");
  await amountSaved;

  await page.goto(`/w/${workspace}/ideas/${idea}/decide`);
  await expectNoAxeViolations(page);
  await page
    .locator("label")
    .filter({ hasText: /^Hold$/ })
    .click();
  await page.getByRole("textbox", { name: /^Why\?/ }).fill("Waiting for the price check");
  await page.getByRole("button", { name: "Record decision" }).click();
  await expect(page.getByText("Latest decision: Hold")).toBeVisible();

  await page.goto(`/w/${workspace}/ai/export?source=validation&id=${validation}&scope=01`);
  await expectNoAxeViolations(page);
  await page.getByRole("checkbox", { name: "Include empty questions" }).check();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("group", { name: "Preview of the export" })).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download .md" }).click();
  const path = await (await download).path();
  const exported = await readFile(path, "utf8");
  expect(exported).toContain("[V.01.WHO]");
  const reply = exported.replace(
    /(## \[V\.01\.WHO\][\s\S]*?\*\*Current answer:\*\*\s*)(?:> )?\(empty\)/,
    "$1> Tourists who buy snacks at the pier",
  );
  expect(reply).not.toBe(exported);

  await page.getByRole("link", { name: "Import from AI" }).click();
  await expectNoAxeViolations(page);
  await page.getByRole("textbox", { name: "AI reply" }).fill(reply);
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("list", { name: "Match" })).toContainText("[V.01.WHO]");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Tourists who buy snacks at the pier").first()).toBeVisible();
  await page.getByRole("button", { name: "Apply 1 change" }).click();
  await expect(page.getByText("1 answer updated")).toBeVisible();
});
