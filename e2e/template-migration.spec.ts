import AxeBuilder from "@axe-core/playwright";
import type { AdminTemplateList, Me } from "@moonx/schemas";
import type { Page } from "@playwright/test";
import { WEB_ORIGIN } from "./env";
import { demo, expect, test, workspaceOf } from "./fixtures";

// M8 Update template and the band of 10, 13 and 20 (design-spec 6.0.7・6.0.1・6.0.5): the
// operator publishes a validation version without one of its questions, and a plan
// version; Owners move to them from the band, and undo a move from 13's 🕘. A published
// version is what every new self analysis, idea and plan takes, so this runs after the
// other tests and after admin-publish.spec.ts (playwright.config.ts), whose self analysis
// v2 is 10's newer version. The steps share the published versions, so they run in order.

test.describe.configure({ mode: "serial" });

const desktop = { viewport: { width: 1440, height: 900 } };
const phone = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
};

async function expectNoAxeViolations(page: Page) {
  // A dialog fading in has its words part-transparent, which axe reads as low contrast;
  // a pending Button's announcement stays in the live region for 7 seconds.
  await expect(page.locator("[data-entering], [data-exiting]")).toHaveCount(0);
  await expect(
    page.locator("[data-live-announcer] [aria-labelledby]"),
  ).toHaveCount(0, { timeout: 10_000 });
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    violations.map((violation) => ({
      id: violation.id,
      targets: violation.nodes.map((node) => node.target.join(" ")),
    })),
  ).toEqual([]);
}

/** The versions of the `kind` template, as AD1 lists them for the operator. */
async function versionsOf(page: Page, kind: string) {
  const templates = (await (
    await page.request.get("/api/v1/admin/templates")
  ).json()) as AdminTemplateList;
  const template = templates.items.find((candidate) => candidate.kind === kind);
  if (template === undefined) throw new Error(`No ${kind} template`);
  return template.versions;
}

/** The idea of BCDX named `name`, as I1 lists it. */
async function bcdxIdea(page: Page, me: Me, name: string) {
  const bcdx = workspaceOf(me, "BCDX");
  const listed = await page.request.get(
    `/api/v1/workspaces/${bcdx.id}/ideas?decision=all&includeArchived=true`,
  );
  const { items } = (await listed.json()) as {
    items: { id: string; name: string }[];
  };
  const idea = items.find((candidate) => candidate.name === name);
  if (idea === undefined) throw new Error(`No idea ${name}`);
  return { bcdx, ideaId: idea.id };
}

const band = (page: Page) =>
  page.getByRole("alert").filter({ hasText: "A newer template is available." });

test.describe("on a desktop", () => {
  test.use(desktop);

  test("27: the operator deletes a question from validation v3's draft and publishes it", async ({
    page,
    signIn,
  }) => {
    await signIn(demo.operator);
    const draft = (await versionsOf(page, "validation")).find(
      (version) => version.status === "draft",
    );
    if (draft === undefined) throw new Error("No validation draft");
    await page.goto(`/admin/templates/versions/${draft.id}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Validation v3" }),
    ).toBeVisible();
    const tree = page.getByRole("treegrid", {
      name: "Sections and questions of Validation",
    });
    await tree
      .getByRole("button", { name: "Expand 01 Customer & Problem" })
      .click();
    await tree
      .getByRole("row", { name: "V.01.NON_CUSTOMER NON-CUSTOMER" })
      .click();
    await page
      .getByRole("button", {
        name: "More actions for V.01.NON_CUSTOMER NON-CUSTOMER",
      })
      .click();
    await page.getByRole("menuitem", { name: "Delete question" }).click();
    await page
      .getByRole("alertdialog", {
        name: "Delete V.01.NON_CUSTOMER NON-CUSTOMER?",
      })
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(
      tree.getByRole("row", { name: "V.01.NON_CUSTOMER NON-CUSTOMER" }),
    ).toHaveCount(0);

    // A question the published versions have is a warning, not a problem (SDD 5.13 AD6).
    const publish = page.getByRole("button", { name: "Publish as v3" });
    await expect(publish).toBeEnabled();
    await publish.click();
    await page
      .getByRole("alertdialog", { name: "Publish as v3?" })
      .getByRole("button", { name: "Publish" })
      .click();
    await expect(page).toHaveURL(
      `${WEB_ORIGIN}/admin/templates?kind=validation`,
    );
    await expect(page.getByText("Validation v3 is published")).toBeVisible();
  });

  test("13 → M8 → 🕘: Health Bowl moves to v3 with its NON-CUSTOMER answer hidden, then the whole move is undone", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.owner);
    const { bcdx, ideaId } = await bcdxIdea(page, me, "Bacolod Health Bowl");
    const home = `/w/${bcdx.id}/ideas/${ideaId}`;
    await page.goto(home);
    await expect(
      page.getByRole("heading", { level: 1, name: "Bacolod Health Bowl" }),
    ).toBeVisible();
    await expect(band(page)).toContainText(
      "A newer template is available. Your answers stay on v1 until you update.",
    );
    await band(page).getByRole("link", { name: "Update template" }).click();

    const dialog = page.getByRole("dialog", { name: "Update template" });
    await expect(
      dialog.getByText("Move from v1 to v3 of the template."),
    ).toBeVisible();
    const hidden = dialog.getByRole("list", { name: "Questions not in v3" });
    await expect(hidden.getByRole("listitem")).toHaveCount(1);
    await expect(hidden.getByRole("listitem")).toContainText("01 NON-CUSTOMER");
    await expect(hidden.getByRole("listitem")).toContainText("Answered");
    await expect(
      dialog.getByText(
        "Answers to these questions stay saved but no longer show.",
      ),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    await dialog.getByRole("button", { name: "Update template" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Template updated to v3")).toBeVisible();
    await expect(band(page)).toHaveCount(0);

    // The answer is kept but no longer shows on 11.
    await page.goto(`${home}/questions/01`);
    await expect(
      page.getByRole("heading", { level: 1, name: "01 Customer & Problem" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "PROOF", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "NON-CUSTOMER", exact: true }),
    ).toHaveCount(0);

    // 13's 🕘 lists the move as one line, which undoes it whole (6.0.5・6.0.7).
    await page.goto(home);
    await page
      .getByRole("banner")
      .getByRole("button", { name: "History" })
      .click();
    const history = page.getByRole("complementary", { name: "History" });
    await expect(history.getByText("Template updated to v3")).toBeVisible();
    // The move's line has no Revert to this point; the idea's own lines keep theirs.
    await expect(
      history.getByRole("button", {
        name: "Revert to this point, Template version",
      }),
    ).toHaveCount(0);
    await expect(
      history
        .getByRole("button", {
          name: "Revert to this point, Bacolod Health Bowl",
        })
        .first(),
    ).toBeVisible();
    await history
      .getByRole("button", { name: /^Undo the whole operation/ })
      .click();
    await expect(history.getByText("Template set back to v1")).toBeVisible();
    await expect(band(page)).toContainText(
      "Your answers stay on v1 until you update.",
    );
    await page.goto(`${home}/questions/01`);
    await expect(
      page.getByRole("region", { name: "NON-CUSTOMER", exact: true }),
    ).toBeVisible();
  });

  test("20 and 10: the band opens M8 about the plan and about the self analysis", async ({
    page,
    signIn,
  }) => {
    // A plan version as the operator publishes one, from v1 as it stands (AD2, AD6).
    await signIn(demo.operator);
    const planV1 = (await versionsOf(page, "business_plan")).find(
      (version) => version.versionNumber === 1,
    );
    if (planV1 === undefined) throw new Error("No plan v1");
    const drafted = await page.request.post(
      `/api/v1/admin/template-versions/${planV1.id}/draft`,
      { data: {}, headers: { Origin: WEB_ORIGIN } },
    );
    expect(drafted.status(), await drafted.text()).toBe(201);
    const { id: draftId } = (await drafted.json()) as { id: string };
    const published = await page.request.post(
      `/api/v1/admin/template-versions/${draftId}/publish`,
      { data: {}, headers: { Origin: WEB_ORIGIN } },
    );
    expect(published.status(), await published.text()).toBe(200);

    const me = await signIn(demo.owner);
    const { bcdx, ideaId } = await bcdxIdea(
      page,
      me,
      "Piaya Gift Box Delivery",
    );
    const plans = (await (
      await page.request.get(`/api/v1/ideas/${ideaId}/plans`)
    ).json()) as { items: { id: string; name: string }[] };
    const planA = plans.items.find((plan) => plan.name === "Plan A");
    if (planA === undefined) throw new Error("No Plan A");
    await page.goto(`/w/${bcdx.id}/ideas/${ideaId}/plans/${planA.id}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Plan A" }),
    ).toBeVisible();
    await band(page).getByRole("link", { name: "Update template" }).click();
    const planDialog = page.getByRole("dialog", { name: "Update template" });
    await expect(
      planDialog.getByText("Move from v1 to v2 of the template."),
    ).toBeVisible();
    await expect(planDialog.getByText("Cost rows added")).toHaveCount(0);
    await planDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(planDialog).toBeHidden();
    await expect(band(page)).toBeVisible();

    await page.goto(`/w/${bcdx.id}/self-analysis`);
    await expect(
      page.getByRole("heading", { level: 1, name: "My Self Analysis" }),
    ).toBeVisible();
    await band(page).getByRole("link", { name: "Update template" }).click();
    const selfDialog = page.getByRole("dialog", { name: "Update template" });
    await expect(
      selfDialog.getByText("Move from v1 to v2 of the template."),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(selfDialog).toBeHidden();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/w/${bcdx.id}/self-analysis`);
  });

  test("a Viewer has no band, and M8's URL opens nothing", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.viewer);
    const { bcdx, ideaId } = await bcdxIdea(page, me, "Bacolod Health Bowl");
    const { validationId } = (await (
      await page.request.get(`/api/v1/ideas/${ideaId}/validation`)
    ).json()) as { validationId: string };
    await page.goto(
      `/w/${bcdx.id}/ideas/${ideaId}?modal=update-template&about=validation:${validationId}`,
    );
    await expect(
      page.getByRole("heading", { level: 1, name: "Bacolod Health Bowl" }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(band(page)).toHaveCount(0);
  });
});

test.describe("on a phone", () => {
  test.use(phone);

  test("10's band opens M8 as a full-screen sheet", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.owner);
    const bcdx = workspaceOf(me, "BCDX");
    await page.goto(`/w/${bcdx.id}/self-analysis`);
    await band(page).getByRole("link", { name: "Update template" }).click();
    const dialog = page.getByRole("dialog", { name: "Update template" });
    await expect(
      dialog.getByText("Move from v1 to v2 of the template."),
    ).toBeVisible();
    // Measured once the sheet has slid up from the bottom.
    await expect
      .poll(() => dialog.boundingBox())
      .toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
    await expectNoAxeViolations(page);
  });
});
