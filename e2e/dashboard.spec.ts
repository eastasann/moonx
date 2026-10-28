import AxeBuilder from "@axe-core/playwright";
import type { Me, Workspace } from "@moonx/schemas";
import { request as apiRequest, type Page } from "@playwright/test";
import { WEB_ORIGIN } from "./env";
import {
  type Account,
  test as base,
  DEMO_PASSWORD,
  demo,
  expect,
  nextAddress,
  operatorInvited,
  workspaceOf,
} from "./fixtures";

// 5 Dashboard and M7 (design-spec 6.9・3.8・5章・6.0.1・6.0.6) against the seeded demo
// data (design-spec 8), signed in through the API. What M7 writes is done by an account of
// the worker's own.

/**
 * One account per worker for what goes through M7 (a switch, online or offline, and New
 * workspace): opening a workspace makes it the one opened last (5章「ログイン後」), which
 * a demo user's tests in other specs set back as they open BCDX at the same time.
 */
const test = base.extend<object, { account: Account }>({
  account: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures a fixture needs from this pattern, and this one needs none.
    async ({}, use, workerInfo) => {
      await use(await operatorInvited(workerInfo.workerIndex, "dashboard"));
    },
    { scope: "worker" },
  ],
});

const phone = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
};

/** The section of the hub a block's heading names. */
const block = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true });

/** Waits until every block has loaded. */
async function loaded(page: Page, blocks: string[]) {
  for (const name of blocks) {
    await expect(block(page, name)).not.toHaveAttribute("aria-busy", "true");
  }
}

const allBlocks = ["Ideas", "Due soon", "Self analyses", "Recent activity"];

test("without a session, a workspace's screen sends to the sign-in with the way back", async ({
  page,
}) => {
  const path = "/w/7c9e6679-7425-40de-944b-e07fc1f90ae7?modal=switch-workspace";
  await page.goto(path);
  await expect(page).toHaveURL(
    `${WEB_ORIGIN}/login?next=${encodeURIComponent(path)}`,
  );
});

test.describe("the Owner's BCDX on a desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the four blocks, from D1 to D4", async ({ page, signIn }) => {
    const me = await signIn(demo.owner);
    const bcdx = workspaceOf(me, "BCDX");
    await page.goto(`/w/${bcdx.id}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "BCDX" }),
    ).toBeVisible();
    await expect(page).toHaveTitle("Dashboard · BCDX · moonx");
    await expect(page.getByRole("list", { name: "Breadcrumbs" })).toHaveText(
      "Dashboard",
    );
    await loaded(page, allBlocks);

    const ideas = block(page, "Ideas");
    const piaya = ideas
      .getByRole("listitem")
      .filter({ hasText: "Piaya Gift Box Delivery" });
    await expect(piaya).toContainText("Planning · updated");
    await expect(piaya).toContainText("Proceed");
    await expect(
      piaya.getByRole("img", { name: /Competitors \(\d+–\d+\): Done/ }),
    ).toBeVisible();
    const bowl = ideas
      .getByRole("listitem")
      .filter({ hasText: "Bacolod Health Bowl" });
    await expect(bowl).toContainText(
      "Missing: Startup & monthly costs, Permits",
    );
    await expect(bowl).toContainText("Hold");
    const bike = ideas
      .getByRole("listitem")
      .filter({ hasText: "Mobile Bike Repair" });
    await expect(bike).toContainText("Missing: 6 checks");
    await expect(bike).toContainText("Undecided");
    // Drop is counted, not listed; archived ideas are left out.
    await expect(ideas).not.toContainText("Laundry Pickup");
    await expect(ideas).not.toContainText("Sari-sari Store Delivery");
    await expect(ideas).toContainText("1 dropped idea hidden");

    const due = block(page, "Due soon");
    await expect(due).toContainText("next 7 days");
    const overdue = due
      .getByRole("listitem")
      .filter({ hasText: /overdue \d+d/ });
    await expect(overdue).toHaveCount(1);
    // The user's own come first.
    await expect(due.getByRole("listitem").first()).toContainText("Yours");

    const selves = block(page, "Self analyses");
    await expect(
      selves.getByRole("listitem").filter({ hasText: "Ana Villanueva" }),
    ).toContainText("Shared · Done");
    await expect(
      selves.getByRole("listitem").filter({ hasText: "Kenji Mori" }),
    ).toContainText("Not shared");

    const activity = block(page, "Recent activity");
    await expect(activity.getByRole("listitem")).toHaveCount(20);
    await expect(activity).toContainText(
      "Ana Villanueva recorded Go / No-Go: Delay",
    );

    // Two columns: Due soon beside Ideas.
    const ideasBox = await ideas.boundingBox();
    const dueBox = await due.boundingBox();
    expect(dueBox?.x).toBeGreaterThan(
      (ideasBox?.x ?? 0) + (ideasBox?.width ?? 0),
    );

    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      violations.map((violation) => ({
        id: violation.id,
        targets: violation.nodes.map((node) => node.target.join(" ")),
      })),
    ).toEqual([]);
  });

  test("a block that fails alone shows its state; Retry loads it", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.owner);
    const bcdx = workspaceOf(me, "BCDX");
    await page.route("**/dashboard/activity", (route) =>
      route.fulfill({ status: 503, body: "Service Unavailable" }),
    );
    await page.goto(`/w/${bcdx.id}`);
    const activity = block(page, "Recent activity");
    await expect(
      activity.getByRole("heading", { name: "Couldn't load this page" }),
    ).toBeVisible({ timeout: 20_000 });
    await loaded(page, ["Ideas", "Due soon", "Self analyses"]);
    await expect(
      block(page, "Ideas").getByRole("listitem").first(),
    ).toBeVisible();
    await page.unroute("**/dashboard/activity");
    await activity.getByRole("button", { name: "Retry" }).click();
    await expect(activity.getByRole("listitem")).toHaveCount(20);
  });

  test("offline: the band says so, and leaves when the connection is back", async ({
    page,
    context,
    signIn,
  }) => {
    const me = await signIn(demo.owner);
    await page.goto(`/w/${workspaceOf(me, "BCDX").id}`);
    await loaded(page, allBlocks);
    // The screen's own content, not the route's skeleton (see the test of a workspace
    // not loaded yet, below).
    await expect(block(page, "Ideas")).toContainText("Piaya Gift Box Delivery");
    const band = page.getByRole("alert").filter({
      hasText: "You're offline. Changes can't be saved until you reconnect.",
    });
    await context.setOffline(true);
    await expect(band).toBeVisible();
    await context.setOffline(false);
    await expect(band).toBeHidden();
  });
});

test("a Viewer sees no self analyses", async ({ page, signIn }) => {
  const me = await signIn(demo.viewer);
  const bcdx = workspaceOf(me, "BCDX");
  await page.goto(`/w/${bcdx.id}`);
  await expect(
    page.getByText("Ideas and what is due across the workspace."),
  ).toBeVisible();
  await loaded(page, ["Ideas", "Due soon", "Recent activity"]);
  await expect(block(page, "Self analyses")).toHaveCount(0);
  await expect(
    block(page, "Ideas").getByRole("listitem").filter({ hasText: "Piaya" }),
  ).toHaveCount(2);
});

test("another workspace's URL: no access; an unknown one: not found; both lead home", async ({
  page,
  signIn,
}) => {
  // Ana's personal workspace, read with a session of her own.
  const ana = await apiRequest.newContext({
    baseURL: WEB_ORIGIN,
    extraHTTPHeaders: {
      "X-Forwarded-For": nextAddress(test.info().workerIndex),
      Origin: WEB_ORIGIN,
    },
  });
  const signedIn = await ana.post("/api/auth/sign-in/email", {
    data: { email: demo.owner, password: DEMO_PASSWORD },
  });
  expect(signedIn.ok(), await signedIn.text()).toBe(true);
  const anaMe = (await (await ana.get("/api/v1/me")).json()) as Me;
  const anaPersonal = anaMe.memberships.find(
    ({ workspace }) => workspace.isPersonal,
  )?.workspace.id;
  await ana.dispose();

  const me = await signIn(demo.viewer);
  expect(anaPersonal).toBeDefined();
  await page.goto(`/w/${anaPersonal}`);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "You don't have access to this",
    }),
  ).toBeVisible();
  await page.goto("/w/00000000-0000-4000-8000-000000000000");
  await expect(
    page.getByRole("heading", { level: 1, name: "Not found. Check the link." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Go to Dashboard" }).click();
  // Grace's last workspace from the seed, or her personal one.
  const home =
    me.lastWorkspaceId ??
    me.memberships.find(({ workspace }) => workspace.isPersonal)?.workspace.id;
  await expect(page).toHaveURL(`${WEB_ORIGIN}/w/${home}`);
});

test("M7 switches workspace, and the workspace becomes the last opened", async ({
  page,
  signIn,
  account,
}) => {
  const me = await signIn(account.email, account.password);
  const personal = workspaceOf(me, "Test Person's workspace");
  const made = await page.request.post("/api/v1/workspaces", {
    data: { name: `Switch team ${Date.now() % 1_000_000}` },
    headers: { Origin: WEB_ORIGIN },
  });
  expect(made.status(), await made.text()).toBe(201);
  const team = (await made.json()) as Workspace;
  await page.goto(`/w/${team.id}`);
  await page
    .getByRole("button", { name: `${team.name}, switch workspace` })
    .click();
  const dialog = page.getByRole("dialog", { name: "Switch workspace" });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/modal=switch-workspace/);
  const current = dialog.getByRole("listitem").filter({ hasText: team.name });
  await expect(current).toContainText("Current");
  await expect(current.getByRole("link")).toHaveCount(0);
  await dialog.getByRole("link", { name: /Test Person's workspace/ }).click();
  await expect(page).toHaveURL(`${WEB_ORIGIN}/w/${personal.id}`);
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("heading", { level: 1, name: "Test Person's workspace" }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/v1/me")).json()).lastWorkspaceId,
    )
    .toBe(personal.id);
});

test("M7's New workspace makes one with the user as Owner and opens its Getting started", async ({
  page,
  signIn,
  account,
}) => {
  const me = await signIn(account.email, account.password);
  await page.goto(`/w/${workspaceOf(me, "Test Person's workspace").id}`);
  await page
    .getByRole("button", { name: "Test Person's workspace, switch workspace" })
    .click();
  await page.getByRole("button", { name: "New workspace" }).click();
  const dialog = page.getByRole("dialog", { name: "New workspace" });
  const create = dialog.getByRole("button", { name: "Create" });
  await expect(create).toBeDisabled();
  await expect(dialog.getByRole("button", { name: /Currency/ })).toContainText(
    "PHP · Philippine Peso",
  );
  const name = dialog.getByRole("textbox", { name: /Name/ });
  await name.fill("x".repeat(61));
  await expect(dialog).toContainText("Too long. Shorten to 60 characters.");
  await expect(create).toBeDisabled();
  const tutoring = `Weekend tutoring ${Date.now() % 1_000_000}`;
  await name.fill(tutoring);
  await expect(create).toBeEnabled();
  await create.click();
  await expect(page).toHaveURL(/\/w\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: tutoring }),
  ).toBeVisible();
  const steps = page.getByRole("list", { name: "Getting started" });
  await expect(steps.getByRole("listitem")).toHaveText([
    "Start your self analysis",
    "Invite your team",
    "Write your first idea",
  ]);
  const after = await (await page.request.get("/api/v1/me")).json();
  const made = after.memberships.find(
    (m: { workspace: { name: string } }) => m.workspace.name === tutoring,
  );
  expect(made.role).toBe("owner");
  expect(made.workspace.currency).toBe("PHP");
  expect(page.url()).toBe(`${WEB_ORIGIN}/w/${made.workspace.id}`);
});

test("Back closes M7; closing it does not leave it to come back", async ({
  page,
  signIn,
}) => {
  const me = await signIn(demo.owner);
  const dashboard = `${WEB_ORIGIN}/w/${workspaceOf(me, "BCDX").id}`;
  await page.goto(dashboard);
  const open = () =>
    page.getByRole("button", { name: "BCDX, switch workspace" }).click();
  const dialog = page.getByRole("dialog", { name: "Switch workspace" });

  await open();
  await expect(dialog).toBeVisible();
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(dashboard);

  await open();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(dashboard);
  // Back now leaves the dashboard: the blank page the test began on.
  await page.goBack();
  await expect(page).toHaveURL("about:blank");

  // Opened from its URL, it closes in place, and Back does not open it again.
  await page.goto(dashboard);
  await page.goto(`${dashboard}?modal=switch-workspace`);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(dashboard);
  await page.goBack();
  await expect(page).toHaveURL(dashboard);
  await expect(dialog).toBeHidden();
});

test("while the session is checked, the frame and the dashboard's skeleton show", async ({
  page,
  signIn,
}) => {
  const me = await signIn(demo.owner);
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/me", async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(`/w/${workspaceOf(me, "BCDX").id}`);
  // Inert while it loads: the frame and the hub's shape, nothing to read or press.
  const skeleton = page.locator("[inert]");
  await expect(skeleton.getByRole("navigation").first()).toBeAttached();
  await expect(
    skeleton.getByText("Recent activity", { exact: true }),
  ).toBeAttached();
  await expect(
    page.getByRole("heading", { level: 1, name: "BCDX" }),
  ).toHaveCount(0);
  release();
  await expect(
    page.getByRole("heading", { level: 1, name: "BCDX" }),
  ).toBeVisible();
  await expect(page.locator("[inert]")).toHaveCount(0);
});

test("offline, a workspace not loaded yet says it cannot open", async ({
  page,
  context,
  signIn,
  account,
}) => {
  const me = await signIn(account.email, account.password);
  const personal = workspaceOf(me, "Test Person's workspace");
  const made = await page.request.post("/api/v1/workspaces", {
    data: { name: `Offline team ${Date.now() % 1_000_000}` },
    headers: { Origin: WEB_ORIGIN },
  });
  expect(made.status(), await made.text()).toBe(201);
  const team = (await made.json()) as Workspace;
  // An idea, so that 5 lists it in Ideas rather than showing Getting started.
  const idea = await page.request.post(`/api/v1/workspaces/${team.id}/ideas`, {
    data: {
      name: "Banana Cue Cart",
      oneLineConcept: "Banana cue by the school gate.",
    },
    headers: { Origin: WEB_ORIGIN },
  });
  expect(idea.status(), await idea.text()).toBe(201);
  await page.goto(`/w/${team.id}`);
  await loaded(page, allBlocks);
  // The route's skeleton has the same blocks, not busy, while the screen's code still
  // loads: offline before it has, the router could not load it and reloaded the page,
  // blank. The idea in the list is the screen's own.
  await expect(block(page, "Ideas")).toContainText("Banana Cue Cart");
  await context.setOffline(true);
  await page
    .getByRole("button", { name: `${team.name}, switch workspace` })
    .click();
  await page
    .getByRole("dialog", { name: "Switch workspace" })
    .getByRole("link", { name: /Test Person's workspace/ })
    .click();
  await expect(page).toHaveURL(`${WEB_ORIGIN}/w/${personal.id}`);
  for (const name of ["Ideas", "Due soon", "Recent activity"]) {
    await expect(
      block(page, name).getByRole("heading", {
        name: "You're offline. Connect to the internet to open this page.",
      }),
    ).toBeVisible();
  }
  await context.setOffline(false);
});

test.describe("on a phone", () => {
  test.use(phone);

  test("the blocks stack Ideas, Due soon, Self analyses, Recent activity; the title opens M7", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.owner);
    await page.goto(`/w/${workspaceOf(me, "BCDX").id}`);
    await loaded(page, allBlocks);
    const headings = await page
      .getByRole("main")
      .getByRole("heading", { level: 2 })
      .allTextContents();
    expect(headings).toEqual(allBlocks);
    await page.getByRole("button", { name: "BCDX, switch workspace" }).tap();
    await expect(
      page.getByRole("dialog", { name: "Switch workspace" }),
    ).toBeVisible();
  });

  test("More opens M7 too", async ({ page, signIn }) => {
    const me = await signIn(demo.owner);
    await page.goto(`/w/${workspaceOf(me, "BCDX").id}`);
    await page.getByRole("button", { name: "More" }).tap();
    await page.getByRole("menuitem", { name: "Switch workspace" }).tap();
    await expect(
      page.getByRole("dialog", { name: "Switch workspace" }),
    ).toBeVisible();
  });
});
