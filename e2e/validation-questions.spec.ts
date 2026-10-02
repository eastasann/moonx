import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { expectNoAxeViolations, logIn, query, restoreDemoPassword } from "./support";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  for (const email of ["kenji@bcdx.example", "grace@advisor.example"]) {
    await restoreDemoPassword(email);
  }
});

const WHO = "Who is the primary paying customer?";

async function ids(ideaName: string) {
  const [row] = await query<{ workspace: string; idea: string }>(
    `select w.id as workspace, i.id as idea from ideas i join workspaces w on w.id = i.workspace_id
     where i.name = $1 and w.name = 'BCDX'`,
    [ideaName],
  );
  if (!row) throw new Error(`no idea ${ideaName}`);
  return row;
}

const questionsPath = (workspace: string, idea: string, section = "01") =>
  `/w/${workspace}/ideas/${idea}/questions/${section}`;

async function openQuestions(page: Page, ideaName: string, section = "01") {
  const { workspace, idea } = await ids(ideaName);
  await page.goto(questionsPath(workspace, idea, section));
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  return { workspace, idea };
}

test("Ana creates an idea, answers, classifies, and the validation home follows", async ({
  page,
}) => {
  await logIn(page, "ana@bcdx.example");
  const [bcdx] = await query<{ id: string }>("select id from workspaces where name = 'BCDX'");
  await page.goto(`/w/${bcdx?.id}/ideas`);
  await page.getByRole("button", { name: "New idea" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New idea" });
  await dialog.getByLabel(/^Name/).fill("Dumaguete Banana Chips");
  await dialog.getByLabel(/^One-line concept/).fill("Banana chips sold at the pier");
  await dialog.getByRole("button", { name: "Create idea" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Dumaguete Banana Chips" }),
  ).toBeVisible();
  await expect(page.getByText("Start with 01 Customer & Problem")).toBeVisible();
  await expectNoAxeViolations(page);

  await page
    .getByRole("link", { name: /01 Customer & Problem/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "01 Customer & Problem" }),
  ).toBeVisible();
  const field = page.getByRole("textbox", { name: WHO });
  await field.fill("Tourists who buy snacks at the pier");
  await field.blur();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect(page.getByText(/^1\/\d+ answered$/)).toBeVisible();

  await page.getByRole("radio", { name: "Assumption" }).click();
  await page.getByRole("radio", { name: "Medium" }).click();
  await expect(page.getByText("Assumption · Medium").first()).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expectNoAxeViolations(page);

  await page.reload();
  await expect(page.getByText("Assumption · Medium").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /WHO/ }).first()).toContainText(
    "Tourists who buy snacks at the pier",
  );

  // The home recalculates from the saved answer: classified, so it is no longer asked for.
  await page.getByRole("link", { name: "Dumaguete Banana Chips" }).first().click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Dumaguete Banana Chips" }),
  ).toBeVisible();
  await expect(page.getByText("Classify answers")).toHaveCount(0);
  await expect(page.getByText("1 (L0 M1 H0)").first()).toBeVisible();
});

test("a second person's save asks Ana what to do, and loading theirs shows their answer", async ({
  page,
  guest,
}) => {
  const { workspace, idea } = await ids("Piaya Gift Box Delivery");
  await logIn(page, "ana@bcdx.example");
  await page.goto(`${questionsPath(workspace, idea)}?q=V.01.WHO`);
  const anaField = page.getByRole("textbox", { name: WHO });
  await expect(anaField).toBeVisible();

  const kenji = await (await guest()).newPage();
  await logIn(kenji, "kenji@bcdx.example");
  await kenji.goto(`${questionsPath(workspace, idea)}?q=V.01.WHO`);
  const kenjiField = kenji.getByRole("textbox", { name: WHO });
  await kenjiField.fill("Kenji's version of the customer");
  await kenjiField.blur();
  await expect(kenji.getByText("Saved", { exact: true })).toBeVisible();

  await anaField.fill("Ana's version of the customer");
  await anaField.blur();
  const dialog = page.getByRole("dialog", { name: "Someone updated this first" });
  await expect(dialog.getByText(/Kenji Mori updated this answer/)).toBeVisible();
  await expect(dialog.getByText("Kenji's version of the customer")).toBeVisible();
  await expect(dialog.getByText("Ana's version of the customer")).toBeVisible();
  await dialog.getByRole("button", { name: "Load theirs" }).click();
  await expect(page.getByRole("textbox", { name: WHO })).toHaveValue(
    "Kenji's version of the customer",
  );
});

test("overwriting with mine keeps the other version in the history", async ({ page, guest }) => {
  const { workspace, idea } = await ids("Piaya Gift Box Delivery");
  await logIn(page, "ana@bcdx.example");
  await page.goto(`${questionsPath(workspace, idea)}?q=V.01.WHO`);
  const anaField = page.getByRole("textbox", { name: WHO });
  await expect(anaField).toHaveValue("Kenji's version of the customer");

  const kenji = await (await guest()).newPage();
  await logIn(kenji, "kenji@bcdx.example");
  await kenji.goto(`${questionsPath(workspace, idea)}?q=V.01.WHO`);
  await kenji.getByRole("textbox", { name: WHO }).fill("Kenji again");
  await kenji.getByRole("textbox", { name: WHO }).blur();
  await expect(kenji.getByText("Saved", { exact: true })).toBeVisible();

  await anaField.fill("Ana overwrites");
  await anaField.blur();
  await page
    .getByRole("dialog", { name: "Someone updated this first" })
    .getByRole("button", { name: "Overwrite with mine" })
    .click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const [saved] = await query<{ text: string }>(
    `select a.text from validation_answers a join validations v on v.id = a.validation_id
     where v.idea_id = $1 and a.question_key = 'V.01.WHO'`,
    [idea],
  );
  expect(saved?.text).toBe("Ana overwrites");
  const history = await query<{ n: string }>(
    `select count(*)::text as n from change_history where target_key = 'V.01.WHO' and (after::text like '%Kenji again%' or before::text like '%Kenji again%')`,
  );
  expect(Number(history[0]?.n)).toBeGreaterThan(0);
});

test("typing offline is kept and saved when the connection returns", async ({ page, context }) => {
  await logIn(page, "ana@bcdx.example");
  await openQuestions(page, "Bacolod Health Bowl");
  const field = page.getByRole("textbox").first();
  await expect(field).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByText("Offline — changes will be saved when you reconnect")).toBeVisible();
  await field.fill("Typed while offline");
  await field.blur();
  await expect(page.getByText("Couldn't save — Retry").first()).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 40_000 });
  await page.reload();
  await expect(page.getByText("Typed while offline").first()).toBeVisible();
});

test("Grace, a Viewer, reads the answers and sees no edit controls", async ({ page }) => {
  await logIn(page, "grace@advisor.example");
  await openQuestions(page, "Piaya Gift Box Delivery");
  await expect(page.getByRole("textbox", { name: WHO })).toHaveAttribute("readonly", "");
  await expect(page.getByRole("radio", { name: "Fact" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "AI" })).toHaveCount(0);
  await expectNoAxeViolations(page);
});
