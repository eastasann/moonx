import { expect, test } from "./fixtures";
import { logIn, query } from "./support";

const ANA = "ana@bcdx.example";

test.describe.configure({ mode: "serial" });

async function piaya() {
  const [row] = await query<{ workspace: string; idea: string; plan: string }>(
    `select w.id as workspace, i.id as idea, p.id as plan
     from ideas i join workspaces w on w.id = i.workspace_id
     join business_plans p on p.idea_id = i.id and p.name = 'Plan A'
     where i.name = 'Piaya Gift Box Delivery' and w.name = 'BCDX'`,
  );
  if (!row) throw new Error("no Piaya idea with a Plan A");
  return row;
}

const countOf = async (table: "ideas" | "business_plans") =>
  (await query<{ n: string }>(`select count(*)::text as n from ${table}`))[0]?.n;

test("undoing a duplicate from the history deletes the copy and returns to the ideas list", async ({
  page,
}) => {
  await logIn(page, ANA);
  const { workspace } = await piaya();
  const ideasBefore = await countOf("ideas");
  await page.goto(`/w/${workspace}/ideas`);
  await page.getByRole("button", { name: "More actions for Piaya Gift Box Delivery" }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Piaya Gift Box Delivery (copy)" }),
  ).toBeVisible();
  expect(await countOf("ideas")).toBe(String(Number(ideasBefore) + 1));

  await page.getByRole("button", { name: "History" }).first().click();
  const panel = page.getByRole("complementary", { name: "History" });
  await panel.getByRole("button", { name: "Undo the whole operation" }).click();
  const ask = page.getByRole("alertdialog", { name: "Delete the copied idea?" });
  await ask.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${workspace}/ideas$`));
  await expect(page.getByText("Piaya Gift Box Delivery (copy)")).toHaveCount(0);
  expect(await countOf("ideas")).toBe(ideasBefore);
});

test("undoing a plan draft deletes the plan and returns to its idea", async ({ page }) => {
  await logIn(page, ANA);
  const { workspace, idea, plan } = await piaya();
  const plansBefore = await countOf("business_plans");
  await page.goto(`/w/${workspace}/ideas/${idea}/plans/${plan}`);
  await page.getByRole("button", { name: /Plans/ }).click();
  await page.getByRole("menuitem", { name: "Add plan" }).click();
  const create = page.getByRole("dialog", { name: "Create plan draft" });
  await create.getByLabel(/^Plan name/).fill("Plan Z");
  await create.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Plan Z" })).toBeVisible();
  expect(await countOf("business_plans")).toBe(String(Number(plansBefore) + 1));

  await page.getByRole("button", { name: "History" }).first().click();
  const panel = page.getByRole("complementary", { name: "History" });
  await panel.getByRole("button", { name: "Undo the whole operation" }).click();
  const ask = page.getByRole("alertdialog", { name: "Delete this plan draft?" });
  await ask.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${workspace}/ideas/${idea}$`));
  expect(await countOf("business_plans")).toBe(plansBefore);
});
