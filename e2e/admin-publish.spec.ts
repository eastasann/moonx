import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import type { AdminTemplateList } from "@moonx/schemas";
import type { Page } from "@playwright/test";
import { WEB_ORIGIN } from "./env";
import { demo, expect, test } from "./fixtures";

// 26 and 27 (design-spec 6.17): the operator imports a template file, edits the draft it
// makes, checks it, and publishes it, as the release steps do with the BCDX files (04).
// A published version is for every new self analysis, so this runs after the other
// tests (playwright.config.ts), which read the seed's v1. The steps share the one draft,
// so they run in order.

const selfAnalysisFile = fileURLToPath(
  new URL("../data/templates/bcdx/self-analysis.json", import.meta.url),
);

test.describe.configure({ mode: "serial" });

async function expectNoAxeViolations(page: Page) {
  // A pending Button's spinner leaves React Aria's announcement in the live region for
  // 7 seconds; the page is checked once it has gone.
  await expect(
    page.locator("[data-live-announcer] [aria-labelledby]"),
  ).toHaveCount(0, { timeout: 10_000 });
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(violations).toEqual([]);
}

/** The self analysis's draft, which the first step made. */
async function draftOf(page: Page) {
  const templates = (await (
    await page.request.get("/api/v1/admin/templates")
  ).json()) as AdminTemplateList;
  const draft = templates.items
    .find((template) => template.kind === "self_analysis")
    ?.versions.find((version) => version.status === "draft");
  if (draft === undefined) throw new Error("No self analysis draft");
  return draft;
}

test.describe("on a desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("26 → 27: import the self analysis file, then edit its draft and check it", async ({
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
    await tree.getByRole("row", { name: "AI prompt" }).click();
    await expect(
      page.getByRole("heading", { level: 2, name: "AI prompt" }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "AI prompt" }),
    ).not.toBeEmpty();

    // A question v1 published: its ID stays, its title changes and saves as typed.
    await tree.getByRole("button", { name: "Expand WHY WHY" }).click();
    await tree.getByRole("row", { name: "SA.WHY.1 Q1" }).click();
    const id = page.getByRole("textbox", { name: /^Question ID/ });
    await expect(id).toHaveValue("SA.WHY.1");
    await expect(id).toHaveAttribute("readonly", "");
    await expect(
      page.getByText(
        "This question ID is in a published version, so it can't change.",
      ),
    ).toBeVisible();
    const title = page.getByRole("textbox", { name: /^Title/ });
    await title.fill("Q1 WHY");
    await title.blur();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await expect(
      tree.getByRole("row", { name: "SA.WHY.1 Q1 WHY" }),
    ).toBeVisible();

    // The preview shows the section as 11 would.
    await page.getByRole("button", { name: "Preview" }).click();
    const preview = page.getByRole("dialog", { name: "Preview: WHY" });
    await expect(preview.getByText("Why do I want this?")).toBeVisible();
    await expect(
      preview.getByRole("textbox", { name: "Answer to Q1 WHY" }),
    ).toHaveAttribute("placeholder", "Write your answer…");
    await page.keyboard.press("Escape");
    await expect(preview).toBeHidden();

    // A question added under WHY with another section's ID: Check blocks Publish.
    await page
      .getByRole("button", { name: "More actions for SA.WHY.1 Q1 WHY" })
      .click();
    await page.getByRole("menuitem", { name: "Add question" }).click();
    const add = page.getByRole("dialog", { name: "Add a question to WHY" });
    const newId = add.getByRole("textbox", { name: /^Question ID/ });
    await expect(newId).toHaveValue("SA.WHY.3");
    await newId.fill("SA.BE.9");
    await add.getByRole("textbox", { name: /^Title/ }).fill("Q2b");
    await add
      .getByRole("textbox", { name: /^Question(?! ID)/ })
      .fill("Why now?");
    await add.getByRole("button", { name: "Add question" }).click();
    await expect(add).toBeHidden();
    await expect(
      page.getByRole("heading", { level: 2, name: "Q2b" }),
    ).toBeVisible();
    await expect(
      page.getByText("Fix 1 problem on Check to publish"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Publish as v2" }),
    ).toBeDisabled();
    await page.getByRole("tab", { name: "Check (1)" }).click();
    await page
      .getByRole("grid", { name: "Problems before publishing" })
      .getByText("The question ID doesn't match its section")
      .click();
    const fix = page.getByRole("textbox", { name: /^Question ID/ });
    await expect(fix).toHaveValue("SA.BE.9");
    await fix.fill("SA.WHY.3");
    await fix.blur();
    await page.getByRole("tab", { name: "Check" }).click();
    await expect(
      page.getByText("No problems. Ready to publish as v2."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Publish as v2" }),
    ).toBeEnabled();
    await page.getByRole("tab", { name: "Contents" }).click();
    await expectNoAxeViolations(page);
  });
});

test.describe("on a phone", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test("27: a draft's node shows as it stands; Edit opens its fields in a sheet", async ({
    page,
    signIn,
  }) => {
    await signIn(demo.operator);
    const draft = await draftOf(page);
    // The tree first, with Add section floating at the bottom right (4.1 D).
    await page.goto(`/admin/templates/versions/${draft.id}`);
    await expect(
      page.getByRole("button", { name: "Add section" }),
    ).toBeVisible();
    await page.goto(`/admin/templates/versions/${draft.id}?node=name`);
    await expect(
      page.getByRole("heading", { level: 2, name: "Template name" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Edit" }).click();
    const sheet = page.getByRole("dialog", { name: "Edit Template name" });
    const name = sheet.getByRole("textbox", { name: /^Template name/ });
    await name.fill("Self Analysis (BCDX)");
    await name.blur();
    await expectNoAxeViolations(page);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(
      page.getByText("Self Analysis (BCDX)", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("on a desktop, at last", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("27 → 26: the checked draft is published as v2", async ({
    page,
    signIn,
  }) => {
    await signIn(demo.operator);
    const draft = await draftOf(page);
    await page.goto(`/admin/templates/versions/${draft.id}`);
    const publish = page.getByRole("button", { name: "Publish as v2" });
    await expect(publish).toBeEnabled();
    await publish.click();
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
    // The name the draft was given is the template's (design-spec 6.17).
    await expect(
      page.getByText("Self Analysis (BCDX)", { exact: true }),
    ).toBeVisible();
  });
});
