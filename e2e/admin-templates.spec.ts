import { expect, test } from "./fixtures";
import { expectNoAxeViolations, logIn, query } from "./support";

const ADMIN = "admin@moonx.example";
const ANA = "ana@bcdx.example";

async function piaya() {
  const [row] = await query<{ workspace: string; idea: string }>(
    `select w.id as workspace, i.id as idea from ideas i join workspaces w on w.id = i.workspace_id
     where i.name = 'Piaya Gift Box Delivery' and w.name = 'BCDX'`,
  );
  if (!row) throw new Error("no Piaya idea");
  return row;
}

test("an operator publishes the validation's v3 draft, the team moves to it and takes it back", async ({
  page,
  guest,
}) => {
  await logIn(page, ADMIN);
  await page.goto("/admin/templates?kind=validation");
  const versions = page.getByRole("list", { name: /^Versions of / });
  await expectNoAxeViolations(page);
  await versions.getByRole("button", { name: "Open draft" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Business Idea & Validation v3" }),
  ).toBeVisible();

  await page.getByRole("row", { name: /NEXT STEP/ }).click();
  await expect(page.getByRole("heading", { name: "Question V.10.NEXT_STEP" })).toBeVisible();
  await expectNoAxeViolations(page);
  const hint = page.getByRole("textbox", { name: "Hint" });
  await hint.fill("Name one thing you can check this week");
  await hint.blur();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Publish as v3" }).click();
  const confirm = page.getByRole("dialog", { name: "Publish as v3" });
  await expect(confirm.getByText(/Answers already given don't change/)).toBeVisible();
  await confirm.getByRole("button", { name: "Publish v3" }).click();
  await expect(page.getByText("v3 is published")).toBeVisible();
  await expect(
    page
      .getByRole("list", { name: /^Versions of / })
      .getByRole("listitem")
      .filter({ hasText: "v3" })
      .getByText("Published", { exact: true }),
  ).toBeVisible();

  const { workspace, idea } = await piaya();
  const ana = await (await guest()).newPage();
  await logIn(ana, ANA);
  await ana.goto(`/w/${workspace}/ideas/${idea}`);
  await expect(ana.getByText("A newer template is available")).toBeVisible();
  await ana.getByRole("button", { name: "Update template" }).click();
  const dialog = ana.getByRole("dialog", { name: "Update template" });
  await expect(dialog.getByText("Template v1 to v3")).toBeVisible();
  await dialog.getByRole("button", { name: "Update to v3" }).click();
  await expect(ana.getByText("Template updated to v3").first()).toBeVisible();
  await expect(ana.getByText("A newer template is available")).toHaveCount(0);

  await ana.getByRole("button", { name: "History" }).first().click();
  const panel = ana.getByRole("complementary", { name: "History" });
  await expect(panel.getByText("Template updated to v3")).toBeVisible();
  await panel.getByRole("button", { name: "Undo the whole operation" }).click();
  await expect(ana.getByText("Operation undone")).toBeVisible();
  await expect(ana.getByText("A newer template is available")).toBeVisible();
});
