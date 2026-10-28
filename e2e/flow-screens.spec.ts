import type { AdminTemplateList, Me, PlanSummary } from "@moonx/schemas";
import type { Locator, Page } from "@playwright/test";
import { WEB_ORIGIN } from "./env";
import { demo, expect, test, workspaceOf } from "./fixtures";

// What docs/screen_flow.mermaid leaves to its header comments, on every signed-in screen
// 4–28: the common navigation with the pages the role may open, one of them pressed on
// each screen in turn (line 5); each screen's way back (line 6) by the desktop's
// breadcrumbs and the phone's ← or "← More"; and the panels of design-spec 3.8 (PNL-1
// from 💬, PNL-2 from 🕘); then 26 ↔ 27 ↔ 28 (lines 210–211). One table of screens walked
// on one page per role and viewport, over the seeded BCDX as its Owner and the
// operator's screens as the operator. Nothing here writes, so the tests run side by side.

test.describe.configure({ mode: "parallel" });

const desktop = { viewport: { width: 1440, height: 900 } };
const phone = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
};

/** A screen a step arrives at: its path, and what shows it is there. */
interface Landing {
  /** The screen's number in design-spec 3章 and docs/screen_flow.mermaid. */
  screen: string;
  path: string;
  /**
   * What shows the screen is there: its level-1 heading, or where 26 and 28 share theirs
   * ("Admin"), the selected tab or the template shown.
   */
  mark: (page: Page) => Locator;
}

/** A screen of the table: its breadcrumbs, its phone header's ←, and its panels. */
interface Stop extends Landing {
  /** Where a desktop opens it instead (26 at a template, which its crumb Admin leaves). */
  desktopPath?: string;
  /** Where a desktop moves the screen on its own once it opens (12: the member beside the list). */
  settlesAt?: string;
  /** The desktop's breadcrumb links in their order, each with the screen it opens. */
  crumbs: readonly { name: string; to: Landing }[];
  /** The phone's ← by its label and where it leads, or "← More", which opens More. */
  back?: { label: string; to: Landing } | "more";
  /** Whether the header has 💬 for PNL-1 and 🕘 for PNL-2 (design-spec 3.8). */
  panels: { comments: boolean; history: boolean };
}

/** The level-`level` heading named exactly `name`. */
const heading =
  (name: string, level = 1) =>
  (page: Page) =>
    page.getByRole("heading", { level, name, exact: true });

/** An item of the common navigation, where it is pressed, and what it opens. */
interface NavItem {
  /** The sidebar's or TabBar's link, More's item, the account's menu, or the workspace's button. */
  via: "link" | "more" | "account" | "workspace";
  /**
   * Its name on screen; the workspace's button, named after the workspace, goes by
   * More's "Switch workspace".
   */
  label: string;
  /** The screen it opens, or M7, which opens over the screen. */
  to: Landing | "M7";
}

/** A role's common navigation (design-spec 5章「共通ナビ」) and the items a walk presses. */
interface Navigation {
  /** The sidebar's links in their order. */
  sidebar: readonly (string | RegExp)[];
  /** More's items in their order. */
  more: readonly (string | RegExp)[];
  /** The items a desktop presses, one per screen in turn. */
  desktop: readonly NavItem[];
  /** The items a phone presses, one per screen in turn. */
  phone: readonly NavItem[];
}

/** A phone's tabs; the rest is in More. */
const TABS = ["Dashboard", "Ideas", "Self Analysis", /^Notifications/];

/** The sidebar's pages of a workspace's Owner; the operator's add Admin. */
const OWNER_PAGES = [...TABS, "Decision Log", "Settings"];

/** More's items for a workspace's Owner; the operator's add Admin before Log out. */
const OWNER_MORE = [
  "Decision Log",
  "Switch workspace",
  "Account",
  "Workspace Settings",
  "Log out",
];

/** 4 and 8, which stand in no workspace of their own, as their path names none. */
const account: Landing = {
  screen: "4",
  path: "/account",
  mark: heading("Account"),
};
const notifications: Landing = {
  screen: "8",
  path: "/notifications",
  mark: heading("Notifications"),
};

/**
 * 4–25 in BCDX as its Owner, Ana, over Piaya Gift Box Delivery and its Plan A, which have
 * every screen of the validation and the plan (design-spec 8.2); 11 both as a self
 * analysis and as a validation section, 24 as 13 opens it and 25 as 20 does.
 */
async function bcdxTour(
  page: Page,
  me: Me,
): Promise<{ stops: Stop[]; navigation: Navigation }> {
  const bcdx = workspaceOf(me, "BCDX");
  const listed = (await (
    await page.request.get(`/api/v1/workspaces/${bcdx.id}/ideas?decision=all`)
  ).json()) as { items: { id: string; name: string }[] };
  const piaya = listed.items.find(
    ({ name }) => name === "Piaya Gift Box Delivery",
  );
  if (piaya === undefined) throw new Error("No Piaya Gift Box Delivery");
  const plans = (await (
    await page.request.get(`/api/v1/ideas/${piaya.id}/plans`)
  ).json()) as { items: PlanSummary[] };
  const planA = plans.items.find(({ name }) => name === "Plan A");
  if (planA === undefined) throw new Error("No Plan A");
  const { validationId } = (await (
    await page.request.get(`/api/v1/ideas/${piaya.id}/validation`)
  ).json()) as { validationId: string };

  const dashboard: Landing = {
    screen: "5",
    path: `/w/${bcdx.id}`,
    mark: heading("BCDX"),
  };
  const ideas: Landing = {
    screen: "6",
    path: `/w/${bcdx.id}/ideas`,
    mark: heading("Ideas"),
  };
  const decisions: Landing = {
    screen: "7",
    path: `/w/${bcdx.id}/decisions`,
    mark: heading("Decision Log"),
  };
  const settings: Landing = {
    screen: "9",
    path: `/w/${bcdx.id}/settings`,
    mark: heading("Workspace Settings"),
  };
  const selfAnalysis: Landing = {
    screen: "10",
    path: `/w/${bcdx.id}/self-analysis`,
    mark: heading("My Self Analysis"),
  };
  const validation: Landing = {
    screen: "13",
    path: `/w/${bcdx.id}/ideas/${piaya.id}`,
    mark: heading("Piaya Gift Box Delivery"),
  };
  const plan: Landing = {
    screen: "20",
    path: `${validation.path}/plans/${planA.id}`,
    mark: heading("Plan A"),
  };
  const both = { comments: true, history: true };
  const toIdea = [
    { name: "Ideas", to: ideas },
    { name: "Piaya Gift Box Delivery", to: validation },
  ];
  const toPlan = [...toIdea, { name: "Plan A", to: plan }];
  /** 14–19: a section of the validation, ← Validation and the crumbs to 6 and 13. */
  const section = (
    screen: string,
    path: string,
    name: string,
    panels = both,
  ): Stop => ({
    screen,
    path: `${validation.path}/${path}`,
    mark: heading(name),
    crumbs: toIdea,
    back: { label: "Validation", to: validation },
    panels,
  });
  /** 21–23: a screen of the plan, ← Plan and the crumbs to 6, 13 and 20. */
  const ofPlan = (
    screen: string,
    path: string,
    name: string,
    panels = both,
  ): Stop => ({
    screen,
    path: `${plan.path}/${path}`,
    mark: heading(name),
    crumbs: toPlan,
    back: { label: "Plan", to: plan },
    panels,
  });
  const ai = (screen: "export" | "import", search: Record<string, string>) =>
    `/w/${bcdx.id}/ai/${screen}?${new URLSearchParams(search)}`;

  const none = { comments: false, history: false };
  const stops: Stop[] = [
    { ...account, crumbs: [], back: "more", panels: none },
    { ...dashboard, crumbs: [], panels: none },
    { ...ideas, crumbs: [], panels: none },
    { ...decisions, crumbs: [], back: "more", panels: none },
    { ...notifications, crumbs: [], panels: none },
    { ...settings, crumbs: [], back: "more", panels: none },
    { ...selfAnalysis, crumbs: [], panels: both },
    {
      screen: "11 (self analysis)",
      path: `${selfAnalysis.path}/WHY`,
      mark: heading("WHY"),
      crumbs: [{ name: "Self Analysis", to: selfAnalysis }],
      back: { label: "Self Analysis", to: selfAnalysis },
      panels: both,
    },
    {
      screen: "11 (validation)",
      path: `${validation.path}/questions/01`,
      mark: heading("01 Customer & Problem"),
      crumbs: toIdea,
      back: { label: "Validation", to: validation },
      panels: both,
    },
    {
      screen: "12",
      path: `/w/${bcdx.id}/team`,
      mark: heading("Team Self Analyses"),
      // Ana shared first: beside the list on a desktop (design-spec 6.11).
      settlesAt: `/w/${bcdx.id}/team/${me.id}`,
      crumbs: [{ name: "Self Analysis", to: selfAnalysis }],
      back: { label: "Self Analysis", to: selfAnalysis },
      panels: { comments: true, history: false },
    },
    {
      ...validation,
      crumbs: [{ name: "Ideas", to: ideas }],
      back: { label: "Ideas", to: ideas },
      panels: both,
    },
    section("14", "research", "03 Research Log"),
    section("15", "competitors", "04 Competitors"),
    section("16", "assumptions", "09 Assumptions & Risks"),
    section("17", "costs", "05 Costs"),
    section("18", "economics", "06–08 Unit Economics & Scenarios"),
    section("19", "decide", "Record a decision", none),
    {
      ...plan,
      crumbs: toIdea,
      back: { label: "Validation", to: validation },
      panels: both,
    },
    ofPlan("21", "items/1", "1 Executive Summary"),
    ofPlan("22", "execution", "Execution"),
    ofPlan("23", "pitch", "Pitch Deck", { comments: true, history: false }),
    {
      screen: "24",
      path: ai("export", {
        source: "validation",
        id: validationId,
        returnTo: validation.path,
      }),
      mark: heading("Export for AI"),
      crumbs: toIdea,
      back: { label: "Validation", to: validation },
      panels: none,
    },
    {
      screen: "25",
      path: ai("import", {
        target: "business_plan",
        id: planA.id,
        returnTo: plan.path,
      }),
      mark: heading("Import from AI"),
      crumbs: toPlan,
      back: { label: "Plan", to: plan },
      panels: none,
    },
  ];
  return {
    stops,
    navigation: {
      sidebar: OWNER_PAGES,
      more: OWNER_MORE,
      desktop: [
        { via: "link", label: "Dashboard", to: dashboard },
        { via: "link", label: "Ideas", to: ideas },
        { via: "link", label: "Self Analysis", to: selfAnalysis },
        { via: "link", label: "Notifications", to: notifications },
        { via: "link", label: "Decision Log", to: decisions },
        { via: "link", label: "Settings", to: settings },
        { via: "workspace", label: "Switch workspace", to: "M7" },
        { via: "account", label: "Account", to: account },
      ],
      phone: [
        { via: "link", label: "Dashboard", to: dashboard },
        { via: "link", label: "Ideas", to: ideas },
        { via: "link", label: "Self Analysis", to: selfAnalysis },
        { via: "link", label: "Notifications", to: notifications },
        { via: "more", label: "Decision Log", to: decisions },
        { via: "more", label: "Switch workspace", to: "M7" },
        { via: "more", label: "Account", to: account },
        { via: "more", label: "Workspace Settings", to: settings },
      ],
    },
  };
}

/** 26 as the nav, its crumb and its tab open it: no template chosen. */
const templates: Landing = {
  screen: "26",
  path: "/admin/templates",
  mark: (page) => page.getByRole("tab", { name: "Templates", selected: true }),
};

/** 26 on the validation template, where 27's ← and crumb return to. */
const validationTemplate: Landing = {
  screen: "26",
  path: "/admin/templates?kind=validation",
  mark: heading("Validation", 2),
};

/**
 * The seeded validation v3 draft (design-spec 8.4), which template-migration.spec.ts
 * publishes after this has run (playwright.config.ts): opened here, never edited.
 */
async function validationDraft(page: Page) {
  const templateList = (await (
    await page.request.get("/api/v1/admin/templates")
  ).json()) as AdminTemplateList;
  const draft = templateList.items
    .find(({ kind }) => kind === "validation")
    ?.versions.find(({ status }) => status === "draft");
  if (draft === undefined) throw new Error("No validation draft");
  return draft;
}

/** 26–28, the operator's. */
async function adminTour(
  page: Page,
): Promise<{ stops: Stop[]; navigation: Navigation }> {
  const draft = await validationDraft(page);
  const none = { comments: false, history: false };
  const toTemplates = [{ name: "Admin", to: templates }];
  const stops: Stop[] = [
    {
      ...templates,
      desktopPath: validationTemplate.path,
      crumbs: toTemplates,
      back: "more",
      panels: none,
    },
    {
      screen: "27",
      path: `/admin/templates/versions/${draft.id}`,
      mark: heading(`Validation v${draft.versionNumber}`),
      crumbs: [{ name: "Admin", to: validationTemplate }],
      back: { label: "Templates", to: validationTemplate },
      panels: none,
    },
    {
      screen: "28",
      path: "/admin/users",
      mark: (page) => page.getByRole("tab", { name: "Users", selected: true }),
      crumbs: toTemplates,
      back: "more",
      panels: none,
    },
  ];
  // 26–28 stand in no workspace of their own (`inTurn`): no item opens a workspace's page.
  return {
    stops,
    navigation: {
      sidebar: [...OWNER_PAGES, "Admin"],
      more: [...OWNER_MORE.slice(0, -1), "Admin", "Log out"],
      desktop: [
        { via: "account", label: "Account", to: account },
        { via: "link", label: "Admin", to: templates },
        { via: "link", label: "Notifications", to: notifications },
      ],
      phone: [
        { via: "more", label: "Account", to: account },
        { via: "more", label: "Admin", to: templates },
        { via: "link", label: "Notifications", to: notifications },
      ],
    },
  };
}

/** Expects the page on `to`: its URL and its mark. */
async function expectAt(page: Page, to: Landing) {
  await expect(page).toHaveURL(`${WEB_ORIGIN}${to.path}`);
  await expect(to.mark(page)).toBeVisible();
}

/** Opens `stop` at `path` and waits for the screen itself, not its skeleton. */
async function open(page: Page, stop: Stop, path = stop.path) {
  await page.goto(path);
  await expect(stop.mark(page)).toBeVisible();
}

/** The page's common navigation: the sidebar on a desktop, the TabBar on a phone. */
const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });

/**
 * The items of `items` in turn, one for each screen: an item that opens the screen it is
 * pressed on is passed over, and so is a page of a workspace on a screen that stands in
 * none of its own (4, 8, 26–28 show the one opened last, which other specs may change).
 */
function inTurn(items: readonly NavItem[]) {
  let turn = 0;
  return (stop: Stop): NavItem => {
    for (let tried = 0; tried < items.length; tried += 1) {
      const item = items[turn % items.length];
      turn += 1;
      if (item === undefined) break;
      if (item.to === "M7") return item;
      const isSame = item.to.screen === stop.screen;
      const isOtherWorkspace =
        item.to.path.startsWith("/w/") && !stop.path.startsWith("/w/");
      if (!isSame && !isOtherWorkspace) return item;
    }
    throw new Error(`No navigation item leads away from ${stop.screen}`);
  };
}

/**
 * Presses `item` on `stop`, expects what it opens, and comes back to `stop` as it was: Back
 * from a screen, Escape from M7. More's items need the menu open already.
 */
async function follow(page: Page, me: Me, stop: Stop, item: NavItem) {
  const where = {
    link: "nav",
    more: "More",
    account: "account menu",
    workspace: "workspace",
  }[item.via];
  const target = item.to === "M7" ? "M7" : item.to.screen;
  await test.step(`${stop.screen} → ${target} (${where}: ${item.label})`, async () => {
    const here = page.url();
    const nav = mainNav(page);
    const menuItem = page.getByRole("menuitem", {
      name: item.label,
      exact: true,
    });
    if (item.via === "link") {
      // A page with unread items says how many in its name (design-spec 6.0.1).
      await nav
        .getByRole("link", {
          name: new RegExp(`^${item.label}(, \\S+ unread)?$`),
        })
        .click();
    } else if (item.via === "more") {
      await menuItem.click();
    } else if (item.via === "workspace") {
      await nav.getByRole("button", { name: /, switch workspace$/ }).click();
    } else {
      await nav
        .getByRole("button", { name: me.displayName, exact: true })
        .click();
      await expect(page.getByRole("menuitem")).toHaveText([
        "Account",
        "Log out",
      ]);
      await menuItem.click();
    }
    if (item.to === "M7") {
      const dialog = page.getByRole("dialog", { name: "Switch workspace" });
      await expect(dialog).toBeVisible();
      await expect(page).toHaveURL(/[?&]modal=switch-workspace/);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    } else {
      await expectAt(page, item.to);
      await page.goBack();
    }
    await expect(page).toHaveURL(here);
    await expect(stop.mark(page)).toBeVisible();
  });
}

/**
 * The desktop's sidebar: the pages in their order, the workspace (M7) and the account's
 * menu (4, Log out).
 */
async function expectSidebar(page: Page, me: Me, navigation: Navigation) {
  const nav = mainNav(page);
  await expect(nav.getByRole("link")).toHaveText(navigation.sidebar);
  await expect(
    nav.getByRole("button", { name: /, switch workspace$/ }),
  ).toBeVisible();
  await expect(
    nav.getByRole("button", { name: me.displayName, exact: true }),
  ).toBeVisible();
}

/** The header's 💬 and 🕘 open their panel, whose Close closes it; none where not offered. */
async function expectPanels(page: Page, stop: Stop) {
  const header = page.getByRole("banner");
  const buttons = {
    comments: header.getByRole("button", { name: /^Comments/ }),
    history: header.getByRole("button", { name: "History", exact: true }),
  };
  for (const [kind, id, name] of [
    ["comments", "PNL-1", "Comments"],
    ["history", "PNL-2", "History"],
  ] as const) {
    if (!stop.panels[kind]) {
      await expect(buttons[kind]).toHaveCount(0);
      continue;
    }
    await test.step(`${stop.screen} → ${id} (${name})`, async () => {
      await buttons[kind].click();
      const panel = page.getByRole("complementary", { name });
      await expect(panel).toBeVisible();
      await panel.getByRole("button", { name: "Close", exact: true }).click();
      await expect(panel).toBeHidden();
    });
  }
}

/** Each breadcrumb link of `stop` opens its screen; Back returns for the next one. */
async function followCrumbs(page: Page, stop: Stop) {
  const crumbs = page.getByRole("list", { name: "Breadcrumbs" });
  await expect(crumbs.getByRole("link")).toHaveText(
    stop.crumbs.map(({ name }) => name),
  );
  for (const [index, crumb] of stop.crumbs.entries()) {
    await test.step(`${stop.screen} → ${crumb.to.screen} (crumb ${crumb.name})`, async () => {
      if (index > 0) {
        await page.goBack();
        await expect(stop.mark(page)).toBeVisible();
      }
      await crumbs.getByRole("link", { name: crumb.name, exact: true }).click();
      await expectAt(page, crumb.to);
    });
  }
}

/** On a desktop, each stop's sidebar and one of its items, its panels and its breadcrumbs. */
async function walkDesktop(
  page: Page,
  me: Me,
  { stops, navigation }: { stops: readonly Stop[]; navigation: Navigation },
) {
  const next = inTurn(navigation.desktop);
  for (const stop of stops) {
    await test.step(stop.screen, async () => {
      await open(page, stop, stop.desktopPath);
      if (stop.settlesAt !== undefined) {
        await expect(page).toHaveURL(`${WEB_ORIGIN}${stop.settlesAt}`);
      }
      await expectSidebar(page, me, navigation);
      await follow(page, me, stop, next(stop));
      await expectPanels(page, stop);
      await followCrumbs(page, stop);
    });
  }
}

/**
 * On a phone, each stop's TabBar and More's items, More opened by ← More where the
 * screen has it, and one of the items pressed; then its ← to the screen it leads to.
 */
async function walkPhone(
  page: Page,
  me: Me,
  { stops, navigation }: { stops: readonly Stop[]; navigation: Navigation },
) {
  const header = page.getByRole("banner");
  const menu = page.getByRole("menuitem");
  const next = inTurn(navigation.phone);
  for (const stop of stops) {
    await test.step(stop.screen, async () => {
      await open(page, stop);
      const tabs = mainNav(page);
      await expect(tabs.getByRole("link")).toHaveText(TABS);
      const back = stop.back;
      const item = next(stop);
      await test.step(
        back === "more"
          ? `${stop.screen} → More (← More)`
          : `${stop.screen} → More`,
        async () => {
          await (back === "more"
            ? header.getByRole("button", { name: "Back to More", exact: true })
            : tabs.getByRole("button", { name: "More", exact: true })
          ).click();
          await expect(menu).toHaveText(navigation.more);
          if (item.via !== "more") {
            await page.keyboard.press("Escape");
            await expect(menu).toHaveCount(0);
          }
        },
      );
      await follow(page, me, stop, item);
      if (back === undefined || back === "more") {
        await expect(
          header.getByRole("link", { name: /^Back to / }),
        ).toHaveCount(0);
        return;
      }
      await test.step(`${stop.screen} → ${back.to.screen} (← ${back.label})`, async () => {
        await header
          .getByRole("link", { name: `Back to ${back.label}`, exact: true })
          .click();
        await expectAt(page, back.to);
      });
    });
  }
}

test.describe("on a desktop", () => {
  test.use(desktop);

  test("4–25 as BCDX's Owner: the sidebar and an item of it pressed, 💬 and 🕘 open and close their panels, each crumb leads to its screen", async ({
    page,
    signIn,
  }) => {
    // 23 screens loaded from the dev server, 23 items, 33 crumbs and 26 panels: about a
    // minute alone, longer beside the other specs.
    test.setTimeout(240_000);
    const me = await signIn(demo.owner);
    await walkDesktop(page, me, await bcdxTour(page, me));
  });

  test("26–28 as the operator: the sidebar with Admin and an item of it pressed, each crumb leads to 26; 28 → 26 → 27 by the tab and Open draft", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.operator);
    await walkDesktop(page, me, await adminTour(page));
    const draft = await validationDraft(page);
    await test.step("28 → 26 (tab Templates)", async () => {
      await page.goto("/admin/users");
      await expect(
        page.getByRole("tab", { name: "Users", selected: true }),
      ).toBeVisible();
      await page.getByRole("tab", { name: "Templates" }).click();
      await expectAt(page, templates);
      await expect(heading("Admin")(page)).toBeVisible();
    });
    await test.step(`26 → 27 (Open draft v${draft.versionNumber})`, async () => {
      await page
        .getByRole("grid", { name: "Templates", exact: true })
        .getByRole("row", { name: /^Validation/ })
        .click();
      await expectAt(page, validationTemplate);
      await page
        .getByRole("button", { name: `Open draft v${draft.versionNumber}` })
        .click();
      await expect(page).toHaveURL(
        `${WEB_ORIGIN}/admin/templates/versions/${draft.id}`,
      );
      await expect(
        heading(`Validation v${draft.versionNumber}`)(page),
      ).toBeVisible();
      await expect(page).toHaveTitle("Edit Template · moonx");
    });
  });
});

test.describe("on a phone", () => {
  test.use(phone);

  test("4–25 as BCDX's Owner: the TabBar and More's items and one of them pressed, ← More opens More, each ← leads to its screen", async ({
    page,
    signIn,
  }) => {
    // 23 screens loaded from the dev server, More opened and an item pressed on each:
    // about a minute alone, longer beside the other specs.
    test.setTimeout(240_000);
    const me = await signIn(demo.owner);
    await walkPhone(page, me, await bcdxTour(page, me));
  });

  test("26–28 as the operator: More with Admin and an item pressed, ← More on 26 and 28, 27's ← Templates to 26", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.operator);
    await walkPhone(page, me, await adminTour(page));
  });
});
