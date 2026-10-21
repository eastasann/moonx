import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { WEB_ORIGIN } from "./env";
import { demo, expect, test } from "./fixtures";

// 26 and 27 (design-spec 6.17): the operator imports a template file, checks the draft
// it makes, and publishes it, as the release steps do with the BCDX files (04). A
// published version is for every new self analysis, so this runs after the other tests
// (playwright.config.ts), which read the seed's v1.

const selfAnalysisFile = fileURLToPath(
  new URL("../data/templates/bcdx/self-analysis.json", import.meta.url),
);

test.use({ viewport: { width: 1440, height: 900 } });

test("26 → 27: import the self analysis file, check the draft, publish it as v2", async ({
  page,
  signIn,
}) => {
  await signIn(demo.operator);
  await page.goto("/admin/templates?kind=self_analysis");
  await expect(
    page.getByRole("heading", { level: 2, name: "Self Analysis" }),
  ).toBeVisible();

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import from file" }).click();
  await (await chooser).setFiles(selfAnalysisFile);

  await expect(page).toHaveURL(/\/admin\/templates\/versions\/[\w-]+$/);
  await expect(page.getByText("Imported as draft v2")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Self Analysis v2" }),
  ).toBeVisible();
  await expect(page).toHaveTitle("Edit Template · moonx");
  const tree = page.getByRole("treegrid", {
    name: "Sections and questions of Self Analysis",
  });
  await expect(tree.getByRole("row", { name: "AI prompt" })).toBeVisible();
  await tree.getByRole("row", { name: "AI prompt" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "AI prompt" }),
  ).toBeVisible();
  // The prompt runs past the window: the keyboard reaches its pane to scroll it.
  await expect(
    page
      .locator('[tabindex="0"]')
      .filter({ has: page.getByRole("heading", { name: "AI prompt" }) }),
  ).toHaveCount(1);

  await page.getByRole("tab", { name: "Check" }).click();
  await expect(
    page.getByText("No problems. Ready to publish as v2."),
  ).toBeVisible();
  // The pending Import's spinner leaves React Aria's announcement in the live region for
  // 7 seconds; the page is checked once it has gone.
  await expect(
    page.locator("[data-live-announcer] [aria-labelledby]"),
  ).toHaveCount(0, { timeout: 10_000 });
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(violations).toEqual([]);

  await page.getByRole("button", { name: "Publish as v2" }).click();
  const ask = page.getByRole("alertdialog", { name: "Publish as v2?" });
  await expect(
    ask.getByText(
      "Answers already written don't change. People on an earlier version can move to v2 when they choose.",
    ),
  ).toBeVisible();
  await ask.getByRole("button", { name: "Publish" }).click();

  await expect(page).toHaveURL(
    `${WEB_ORIGIN}/admin/templates?kind=self_analysis`,
  );
  await expect(page.getByText("Self Analysis v2 is published")).toBeVisible();
  const versions = page.getByRole("grid", {
    name: "Versions of Self Analysis",
  });
  await expect(versions.getByRole("row").first()).toContainText("v2");
  await expect(versions.getByRole("row").first()).toContainText("Published");
  await expect(
    versions
      .getByRole("row")
      .first()
      .getByText(/^Published (just now|\dm ago) by Moonx Admin · 0 in use$/),
  ).toBeVisible();
});
