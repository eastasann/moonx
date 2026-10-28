import AxeBuilder from "@axe-core/playwright";
import type { IdeaDetail, Me } from "@moonx/schemas";
import type { Page } from "@playwright/test";
import { WEB_ORIGIN } from "./env";
import { demo, expect, newAccount, test, workspaceOf } from "./fixtures";

// 6 Ideas, M1, 13 Validation home and the input mechanism of design-spec 6.0.2 (autosave,
// conflicts, offline, M9, X-Moonx-Client), against the seeded BCDX (read only) and, for
// what writes, the personal workspace of an account each test makes.

const phone = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
};
const tablet = { viewport: { width: 800, height: 1000 } };
const desktop = { viewport: { width: 1440, height: 900 } };

/** The section of a hub a block's heading names. */
const block = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true });

/** The list of 6, once its rows have come. */
async function ideasList(page: Page) {
  const list = page.getByRole("grid", { name: "Ideas" });
  await expect(list.getByRole("row").first()).toBeVisible();
  return list;
}

async function expectNoAxeViolations(page: Page) {
  // A Button pending as its screen went (Create) left React Aria's announcement of its
  // spinner in the live region, which React Aria clears after 7 seconds (entry.spec.ts).
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

/** A user of their own, signed in, and their personal workspace (no one else's ideas). */
async function ownWorkspace(
  signIn: (email: string, password?: string) => Promise<Me>,
  label: string,
) {
  const account = await newAccount(test.info().workerIndex, label);
  const me = await signIn(account.email, account.password);
  const personal = me.memberships.find(({ workspace }) => workspace.isPersonal);
  if (personal === undefined) throw new Error("No personal workspace");
  return { account, me, workspace: personal.workspace };
}

/** Makes an idea through I1 POST with the page's session. */
async function createIdea(page: Page, workspaceId: string, name: string) {
  const created = await page.request.post(
    `/api/v1/workspaces/${workspaceId}/ideas`,
    {
      data: { name, oneLineConcept: `${name}, in one line.` },
      headers: { Origin: WEB_ORIGIN },
    },
  );
  expect(created.status(), await created.text()).toBe(201);
  return (await created.json()) as IdeaDetail;
}

test.describe("6 Ideas on a desktop", () => {
  test.use(desktop);

  test("the list, the selected idea beside it, the filters and the search", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.owner);
    const bcdx = workspaceOf(me, "BCDX");
    await page.goto(`/w/${bcdx.id}`);
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Ideas" })
      .click();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/w/${bcdx.id}/ideas`);
    await expect(page).toHaveTitle("Ideas · BCDX · moonx");
    const list = await ideasList(page);
    // Drop and archived ideas are left out by default; the Drop one is counted.
    await expect(list).not.toContainText("Laundry Pickup");
    await expect(list).not.toContainText("Sari-sari Store Delivery");
    await expect(page.getByText("1 dropped idea hidden")).toBeVisible();
    const bowl = list.getByRole("row", { name: /Bacolod Health Bowl/ });
    await expect(bowl).toContainText("Validation · Kenji Mori");
    await expect(bowl).toContainText(
      "Missing: Startup & monthly costs, Permits",
    );

    // The first idea is beside the list until another is chosen.
    await expect(
      page.getByRole("button", { name: "Open validation" }),
    ).toBeVisible();
    const shown = page.getByRole("heading", { level: 2 }).first();
    expect(await list.getByRole("row").first().textContent()).toContain(
      await shown.textContent(),
    );
    await list.getByRole("row", { name: /Mobile Bike Repair/ }).click();
    await expect(page).toHaveURL(/selected=/);
    await expect(
      page.getByRole("heading", { level: 2, name: "Mobile Bike Repair" }),
    ).toBeVisible();
    await bowl.click();
    const detail = page.getByRole("heading", {
      level: 2,
      name: "Bacolod Health Bowl",
    });
    await expect(detail).toBeVisible();
    await expect(
      page.getByRole("group", { name: "Key numbers of Bacolod Health Bowl" }),
    ).toContainText("Startup costs");
    const checks = page.getByRole("list", {
      name: "Checks of Bacolod Health Bowl",
    });
    await expect(
      checks.getByRole("listitem").filter({ hasText: "Permits" }),
    ).toContainText("Not started");
    await expect(page.getByText(/Latest decision: Hold on/)).toBeVisible();
    await expectNoAxeViolations(page);

    // Show: the Drop idea joins the list.
    await page.getByRole("link", { name: "Show" }).click();
    await expect(page).toHaveURL(/decision=all/);
    await expect(list).toContainText("Laundry Pickup");

    // The decision filter.
    await page.getByRole("button", { name: /^Decision/ }).click();
    await page.getByRole("option", { name: "Hold" }).click();
    await expect(list.getByRole("row")).toHaveCount(2);
    await expect(list).toContainText("Bacolod Night Market Stall");

    // Archived ideas, included.
    await page.getByRole("button", { name: /^Decision/ }).click();
    await page.getByRole("option", { name: "All", exact: true }).click();
    await page.getByRole("button", { name: /^Archived/ }).click();
    await page.getByRole("option", { name: "Included" }).click();
    await expect(
      list.getByRole("row", { name: /Sari-sari Store Delivery/ }),
    ).toContainText("Archived");

    // The search, then nothing: Clear filters.
    await page.getByRole("searchbox", { name: "Search ideas" }).fill("piaya");
    await expect(page).toHaveURL(/q=piaya/);
    await expect(list.getByRole("row")).toHaveCount(2);
    await page
      .getByRole("searchbox", { name: "Search ideas" })
      .fill("no such idea anywhere");
    await expect(
      page.getByRole("heading", { name: "No ideas match these filters" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/w/${bcdx.id}/ideas`);
    await expect(await ideasList(page)).not.toContainText("Laundry Pickup");
  });

  test("the dashboard's ideas open 13, and its Show the dropped ones in 6", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.owner);
    const bcdx = workspaceOf(me, "BCDX");
    await page.goto(`/w/${bcdx.id}`);
    await block(page, "Ideas").getByRole("link", { name: "Show" }).click();
    await expect(page).toHaveURL(/\/ideas\?decision=drop$/);
    await expect(
      (await ideasList(page)).getByRole("row", { name: /Laundry Pickup/ }),
    ).toBeVisible();
    await page.goto(`/w/${bcdx.id}`);
    await block(page, "Ideas")
      .getByRole("link", { name: /Bacolod Health Bowl/ })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Bacolod Health Bowl" }),
    ).toBeVisible();
  });
});

test.describe("13 Validation home on a desktop", () => {
  test.use(desktop);

  test("the numbers, next steps, checks, F/A/U, summary, sections and decisions", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.member);
    const bcdx = workspaceOf(me, "BCDX");
    await page.goto(`/w/${bcdx.id}/ideas`);
    await (await ideasList(page))
      .getByRole("row", { name: /Bacolod Health Bowl/ })
      .click();
    await page.getByRole("button", { name: "Open validation" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Bacolod Health Bowl" }),
    ).toBeVisible();
    await expect(page).toHaveTitle("Bacolod Health Bowl · BCDX · moonx");
    await expect(page.getByRole("list", { name: "Breadcrumbs" })).toHaveText(
      "Ideas/Bacolod Health Bowl",
    );
    const numbers = page.getByRole("group", { name: "Key numbers" });
    await expect(numbers).toContainText("Startup costs");
    await expect(numbers).toContainText(/₱[\d,]+\+/);
    await expect(numbers).toContainText("Lower bound");
    const next = block(page, "Next steps").getByRole("listitem");
    await expect(next.first()).toContainText("Add evidence (1)");
    await expect(next.first()).toContainText(
      "A Fact in 01 Customer & Problem lost its research log.",
    );
    await expect(next.nth(1)).toContainText("Classify answers (3)");
    const checks = block(page, "Checks");
    await expect(
      checks
        .getByRole("listitem")
        .filter({ hasText: "Startup & monthly costs" }),
    ).toContainText("1 row is Empty");
    await expect(
      checks.getByRole("listitem").filter({ hasText: "Competitors (3–5)" }),
    ).toContainText(/Done \(\d+\)/);
    await expect(block(page, "Fact / Assumption / Unknown")).toContainText(
      /\d+ items/,
    );
    await expect(block(page, "Fact / Assumption / Unknown")).toContainText(
      "Unclassified",
    );
    await expect(block(page, "Summary")).toContainText("Market type");
    const sections = block(page, "Sections");
    await expect(
      sections.getByRole("listitem").filter({ hasText: "03 Research Log" }),
    ).toContainText("5 entries");
    await expect(
      sections.getByRole("listitem").filter({ hasText: "04 Competitors" }),
    ).toContainText("(3–5)");
    await expect(block(page, "Decisions")).toContainText("Hold");
    // Two columns: Sections beside Next steps.
    const nextBox = await block(page, "Next steps").boundingBox();
    const sectionsBox = await sections.boundingBox();
    expect(sectionsBox?.x).toBeGreaterThan(
      (nextBox?.x ?? 0) + (nextBox?.width ?? 0),
    );
    await expectNoAxeViolations(page);
    // ← Ideas.
    await page
      .getByRole("list", { name: "Breadcrumbs" })
      .getByRole("link", { name: "Ideas" })
      .click();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/w/${bcdx.id}/ideas`);
  });

  test("an archived plan is counted; Show lists it", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.owner);
    const bcdx = workspaceOf(me, "BCDX");
    await page.goto(`/w/${bcdx.id}/ideas`);
    await (await ideasList(page))
      .getByRole("row", { name: /Student Study Café/ })
      .click();
    await page.getByRole("button", { name: "Open validation" }).click();
    const plans = block(page, "Plans");
    await expect(plans).toContainText("Plan A");
    await expect(plans).toContainText("v1 Launch review");
    await expect(plans).toContainText("Launch");
    await expect(plans).toContainText("1 archived plan");
    await plans.getByRole("link", { name: "Show" }).click();
    await expect(
      plans.getByRole("listitem").filter({ hasText: "Plan B" }),
    ).toContainText("Archived");
  });

  test("an archived idea reads only; a Viewer gets no tools", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.viewer);
    const bcdx = workspaceOf(me, "BCDX");
    await page.goto(`/w/${bcdx.id}/ideas?archived=true`);
    const list = await ideasList(page);
    // No New idea, and no row ⋯, for a Viewer.
    await expect(page.getByRole("button", { name: "New idea" })).toHaveCount(0);
    await expect(list.getByRole("button", { name: /More for/ })).toHaveCount(0);
    await list.getByRole("row", { name: /Sari-sari Store Delivery/ }).click();
    await page.getByRole("button", { name: "Open validation" }).click();
    await expect(page.getByText("This idea is archived")).toBeVisible();
    await expect(page.getByRole("button", { name: "Restore" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Edit summary" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: /More for/ })).toHaveCount(0);
    // M1's URL opens nothing for a Viewer.
    await page.goto(`/w/${bcdx.id}/ideas?modal=new-idea`);
    await ideasList(page);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("an unknown idea: Not found, and the way to the dashboard", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.owner);
    const bcdx = workspaceOf(me, "BCDX");
    await page.goto(`/w/${bcdx.id}/ideas/00000000-0000-4000-8000-000000000000`);
    await expect(
      page.getByRole("heading", { name: "Not found. Check the link." }),
    ).toBeVisible();
    await expect(page).toHaveTitle("moonx");
    await expect(
      page.getByRole("link", { name: "Go to Dashboard" }),
    ).toBeVisible();
  });
});

test.describe("making, copying and archiving ideas", () => {
  test.use(desktop);

  test("M1 from Getting started makes the first idea and opens its 13", async ({
    page,
    signIn,
  }) => {
    const { workspace } = await ownWorkspace(signIn, "first-idea");
    await page.goto(`/w/${workspace.id}`);
    await block(page, "Getting started")
      .getByRole("button", { name: "Write your first idea" })
      .click();
    const dialog = page.getByRole("dialog", { name: "New idea" });
    await expect(page).toHaveURL(/modal=new-idea/);
    const create = dialog.getByRole("button", { name: "Create" });
    await expect(create).toBeDisabled();
    await dialog.getByRole("textbox", { name: /^Name/ }).fill("Kakanin Cart");
    await expect(create).toBeDisabled();
    await dialog
      .getByRole("textbox", { name: /^One-line concept/ })
      .fill("Rice cakes sold from a cart at the plaza.");
    await create.click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Kakanin Cart" }),
    ).toBeVisible();
    // Just made (6.1「作ったばかり」).
    await expect(
      page.getByRole("group", { name: "Key numbers" }),
    ).toContainText("Empty");
    await expect(
      block(page, "Next steps").getByRole("listitem").first(),
    ).toContainText("Start with 01 Customer & Problem");
    await expect(block(page, "Decisions")).toContainText("No decisions yet");
    // Before any decision, Plans says so as Decisions does (6.1「作ったばかり」).
    await expect(block(page, "Plans")).toContainText("No decisions yet");
    const fau = block(page, "Fact / Assumption / Unknown");
    await expect(fau).toContainText("Empty");
    await expect(fau.getByText("Assumption", { exact: true })).toHaveCount(0);
    // Back leads to the dashboard, not to M1 again.
    await page.goBack();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/w/${workspace.id}`);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("M1 from 6, a copy with Undo, archive and restore", async ({
    page,
    signIn,
  }) => {
    const { workspace } = await ownWorkspace(signIn, "copy-idea");
    await page.goto(`/w/${workspace.id}/ideas`);
    await expect(
      page.getByRole("heading", {
        name: "No ideas yet. Write down the first one. You can have many.",
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "New idea" }).first().click();
    const dialog = page.getByRole("dialog", { name: "New idea" });
    await dialog.getByRole("textbox", { name: /^Name/ }).fill("Taho Bikes");
    await dialog
      .getByRole("textbox", { name: /^One-line concept/ })
      .fill("Fresh taho delivered by bike before 8 a.m.");
    await dialog
      .getByRole("textbox", { name: /^Proposed solution/ })
      .fill("Three bikes, two routes.");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Taho Bikes" }),
    ).toBeVisible();
    await expect(block(page, "Summary")).toContainText(
      "Three bikes, two routes.",
    );

    // Duplicate from 13's ⋯: the copy's 13, and Undo deletes it.
    await page.getByRole("button", { name: "More for Taho Bikes" }).click();
    await page.getByRole("menuitem", { name: "Duplicate" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Taho Bikes (copy)" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Duplicated from Taho Bikes" }),
    ).toBeVisible();
    await expect(
      page.getByText("Duplicated from Taho Bikes").last(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    const confirm = page.getByRole("alertdialog", {
      name: "Delete the copied idea?",
    });
    await expect(confirm).toContainText("can't be undone");
    await confirm.getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/w/${workspace.id}/ideas`);
    const list = await ideasList(page);
    await expect(list.getByRole("row")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);

    // Archive from the row's ⋯: gone from the list, back with Archived included.
    await list.getByRole("row", { name: /Taho Bikes/ }).hover();
    await list.getByRole("button", { name: "More for Taho Bikes" }).click();
    await page.getByRole("menuitem", { name: "Archive" }).click();
    await expect(
      page.getByRole("heading", {
        name: "No ideas yet. Write down the first one. You can have many.",
      }),
    ).toBeVisible();
    await page.goto(`/w/${workspace.id}/ideas?archived=true`);
    await page.getByRole("button", { name: "Open validation" }).click();
    await expect(page.getByText("This idea is archived")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Edit summary" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByText("This idea is archived")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Edit summary" }),
    ).toBeVisible();
  });
});

test.describe("Edit summary: saved as typed (design-spec 6.0.2)", () => {
  test.use(desktop);

  test("saved after a pause, with X-Moonx-Client web; an empty name is not sent", async ({
    page,
    signIn,
  }) => {
    const { workspace } = await ownWorkspace(signIn, "autosave");
    const idea = await createIdea(page, workspace.id, "Halo-halo Stand");
    const clients: (string | null)[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "PATCH" &&
        request.url().includes("/api/v1/ideas/")
      ) {
        clients.push(request.headers()["x-moonx-client"] ?? null);
      }
    });
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}`);
    await page.getByRole("button", { name: "Edit summary" }).click();
    const sheet = page.getByRole("dialog", { name: "Edit summary" });
    const concept = sheet.getByRole("textbox", { name: /^One-line concept/ });
    await concept.fill("Halo-halo by the beach, open late.");
    await expect(page.getByText("Saved")).toBeVisible();
    expect(clients).toEqual(["web"]);
    const name = sheet.getByRole("textbox", { name: /^Name/ });
    await name.fill("");
    await expect(sheet.getByText("Can't be empty")).toBeVisible();
    await page.waitForTimeout(1500);
    expect(clients).toEqual(["web"]);
    await sheet.getByRole("button", { name: "Close" }).click();
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Halo-halo Stand" }),
    ).toBeVisible();
    await expect(
      page.getByText("Halo-halo by the beach, open late."),
    ).toBeVisible();
  });

  test("someone else saved first: Load theirs, or overwrite with mine", async ({
    page,
    signIn,
  }) => {
    const { workspace } = await ownWorkspace(signIn, "conflict");
    const idea = await createIdea(page, workspace.id, "Puto Bumbong");
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}`);
    await page.getByRole("button", { name: "Edit summary" }).click();
    const sheet = page.getByRole("dialog", { name: "Edit summary" });
    // Saved meanwhile from elsewhere, on the version the page holds.
    const other = await page.request.patch(`/api/v1/ideas/${idea.id}`, {
      data: {
        oneLineConcept: "Theirs: sold at dawn masses.",
        lockVersion: idea.lockVersion,
      },
      headers: { Origin: WEB_ORIGIN },
    });
    expect(other.ok(), await other.text()).toBe(true);
    const concept = sheet.getByRole("textbox", { name: /^One-line concept/ });
    await concept.fill("Mine: sold at the night market.");
    const question = page.getByRole("alertdialog", {
      name: /Test Person updated this summary/,
    });
    await expect(question).toBeVisible();
    await expect(page.getByText("Couldn't save").first()).toBeVisible();
    await question.getByRole("button", { name: "Load theirs" }).click();
    await expect(question).toBeHidden();
    await expect(concept).toHaveValue("Theirs: sold at dawn masses.");

    // Again, overwriting it.
    const again = await page.request.patch(`/api/v1/ideas/${idea.id}`, {
      data: {
        oneLineConcept: "Theirs again.",
        lockVersion: idea.lockVersion + 1,
      },
      headers: { Origin: WEB_ORIGIN },
    });
    expect(again.ok(), await again.text()).toBe(true);
    await concept.fill("Mine after all.");
    await question.getByRole("button", { name: "Overwrite with mine" }).click();
    await expect(page.getByText("Saved")).toBeVisible();
    const saved = await page.request.get(`/api/v1/ideas/${idea.id}`);
    expect(((await saved.json()) as IdeaDetail).oneLineConcept).toBe(
      "Mine after all.",
    );
  });

  test("offline: the fields stop; back online, what was typed is sent", async ({
    page,
    context,
    signIn,
  }) => {
    const { workspace } = await ownWorkspace(signIn, "offline");
    const idea = await createIdea(page, workspace.id, "Balut Corner");
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}`);
    await page.getByRole("button", { name: "Edit summary" }).click();
    const sheet = page.getByRole("dialog", { name: "Edit summary" });
    const concept = sheet.getByRole("textbox", { name: /^One-line concept/ });
    await concept.fill("Typed before the signal dropped.");
    await context.setOffline(true);
    await expect(
      page.getByText(
        "You're offline. Changes can't be saved until you reconnect.",
      ),
    ).toBeVisible();
    await expect(concept).toHaveAttribute("readonly", "");
    await expect(page.getByText("Couldn't save").first()).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 });
    await expect(concept).not.toHaveAttribute("readonly", "");
    const saved = await page.request.get(`/api/v1/ideas/${idea.id}`);
    expect(((await saved.json()) as IdeaDetail).oneLineConcept).toBe(
      "Typed before the signal dropped.",
    );
  });

  test("the session ends with input unsaved: M9 signs in again and sends it", async ({
    page,
    signIn,
  }) => {
    const { workspace, account } = await ownWorkspace(signIn, "m9");
    const idea = await createIdea(page, workspace.id, "Bibingka Hut");
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}`);
    await page.getByRole("button", { name: "Edit summary" }).click();
    const sheet = page.getByRole("dialog", { name: "Edit summary" });
    // The session is gone on the server's side.
    await page.request.post("/api/auth/sign-out", {
      headers: { Origin: WEB_ORIGIN, "content-type": "application/json" },
      data: {},
    });
    await sheet
      .getByRole("textbox", { name: /^One-line concept/ })
      .fill("Typed after the session ended.");
    const m9 = page.getByRole("dialog", { name: "Sign in again" });
    await expect(m9).toBeVisible();
    await expect(m9.getByRole("textbox", { name: "Email" })).toHaveValue(
      account.email,
    );
    await m9.getByLabel(/^Password/).fill("not-the-password-1");
    await m9.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(m9.getByText("Password is incorrect")).toBeVisible();
    await m9.getByLabel(/^Password/).fill(account.password);
    await m9.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(m9).toBeHidden();
    await expect(page.getByText("Saved")).toBeVisible();
    expect(page.url()).toContain(`/ideas/${idea.id}`);
    const saved = await page.request.get(`/api/v1/ideas/${idea.id}`);
    expect(((await saved.json()) as IdeaDetail).oneLineConcept).toBe(
      "Typed after the session ended.",
    );
  });

  test("logging out with input unsaved asks first", async ({
    page,
    signIn,
  }) => {
    const { workspace } = await ownWorkspace(signIn, "logout-unsaved");
    const idea = await createIdea(page, workspace.id, "Turon Stall");
    // Saves hang, so the input stays unsaved.
    await page.route(`**/api/v1/ideas/${idea.id}`, (route) =>
      route.request().method() === "PATCH"
        ? route.fulfill({ status: 503, body: "Service Unavailable" })
        : route.continue(),
    );
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}`);
    await page.getByRole("button", { name: "Edit summary" }).click();
    const sheet = page.getByRole("dialog", { name: "Edit summary" });
    await sheet
      .getByRole("textbox", { name: /^One-line concept/ })
      .fill("Not saved yet.");
    await expect(sheet.getByText("Couldn't save")).toBeVisible();
    await sheet.getByRole("button", { name: "Close" }).click();
    await page
      .getByRole("button", { name: "Test Person", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Log out" }).click();
    const confirm = page.getByRole("alertdialog", { name: "Log out?" });
    await expect(confirm).toContainText(
      "Unsaved changes on this page will be lost.",
    );
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(page).toHaveURL(/\/ideas\//);
    await page
      .getByRole("button", { name: "Test Person", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Log out" }).click();
    await page
      .getByRole("alertdialog", { name: "Log out?" })
      .getByRole("button", { name: "Log out" })
      .click();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/`);
  });
});

test.describe("6 and 13 on a phone", () => {
  test.use(phone);

  test("the list alone; a row opens 13; + makes an idea; saves say web_mobile", async ({
    page,
    signIn,
  }) => {
    const { workspace } = await ownWorkspace(signIn, "phone");
    await createIdea(page, workspace.id, "Sorbetes Cart");
    const clients: (string | null)[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().endsWith("/ideas")) {
        clients.push(request.headers()["x-moonx-client"] ?? null);
      }
    });
    await page.goto(`/w/${workspace.id}/ideas`);
    await ideasList(page);
    // No detail beside the list.
    await expect(
      page.getByRole("button", { name: "Open validation" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "New idea" }).click();
    const dialog = page.getByRole("dialog", { name: "New idea" });
    await dialog.getByRole("textbox", { name: /^Name/ }).fill("Fishball Cart");
    await dialog
      .getByRole("textbox", { name: /^One-line concept/ })
      .fill("Fishballs by the jeepney stop.");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Fishball Cart" }),
    ).toBeVisible();
    expect(clients).toEqual(["web_mobile"]);
    await page.getByRole("link", { name: "Ideas" }).first().click();
    await (await ideasList(page))
      .getByRole("row", { name: /Sorbetes Cart/ })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Sorbetes Cart" }),
    ).toBeVisible();
    // One column, in the phone's order: Checks before Sections.
    const checksBox = await block(page, "Checks").boundingBox();
    const sectionsBox = await block(page, "Sections").boundingBox();
    expect(sectionsBox?.y).toBeGreaterThan(checksBox?.y ?? 0);
    expect(sectionsBox?.x).toBe(checksBox?.x);
    // Checked at the page's end, which leaves room for the TabBar: at the top, the row
    // cut by the fold sits half under the fixed TabBar, and axe counts a link row there
    // (13's checks open 15) as a target too small, wherever the fold happens to fall.
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    await expectNoAxeViolations(page);
  });
});

test.describe("6 and 13 on a tablet", () => {
  test.use(tablet);

  test("one pane: a row opens 13, laid out in one column", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.owner);
    const bcdx = workspaceOf(me, "BCDX");
    await page.goto(`/w/${bcdx.id}/ideas`);
    await expect(
      page.getByRole("button", { name: "Open validation" }),
    ).toHaveCount(0);
    await (await ideasList(page))
      .getByRole("row", { name: /Piaya Gift Box Delivery/ })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Piaya Gift Box Delivery" }),
    ).toBeVisible();
    const nextBox = await block(page, "Next steps").boundingBox();
    const sectionsBox = await block(page, "Sections").boundingBox();
    expect(sectionsBox?.y).toBeGreaterThan(nextBox?.y ?? 0);
    expect(sectionsBox?.x).toBe(nextBox?.x);
  });
});
