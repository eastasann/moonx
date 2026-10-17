import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";

// The screens of docs/mockups rebuilt from the components (/dev/components?screen=, Step
// 22e): the frame and the patterns A to J measured against the mockups' values (06
// semantic.layout, design-spec 4.1・4.5・6.0.1), in both themes and on a phone.

const desktop = { width: 1440, height: 900 };
const phone = { width: 390, height: 844 };

/** 06 semantic.color, light. */
const light = {
  canvas: "rgb(244, 245, 248)",
  raised: "rgb(255, 255, 255)",
  sunken: "rgb(236, 238, 243)",
  hairline: "rgb(225, 228, 235)",
  default: "rgb(198, 203, 216)",
  strong: "rgb(122, 129, 151)",
  primary: "rgb(25, 28, 42)",
  secondary: "rgb(85, 93, 114)",
  tertiary: "rgb(100, 107, 130)",
  notice: "rgb(154, 86, 0)",
  transparent: "rgba(0, 0, 0, 0)",
};

const screens = [
  "s05-dashboard",
  "d1-moon",
  "s19-decision",
  "s11-form",
  "s06-ideas",
  "s15-competitors",
  "s17-costs",
  "s25-import",
  "s09-settings",
  "s23-deck",
  "s01-landing",
] as const;

async function open(
  page: Page,
  screen: (typeof screens)[number],
  viewport = desktop,
  theme: "light" | "dark" = "light",
) {
  await page.setViewportSize(viewport);
  await page.goto(`/dev/components?screen=${screen}&theme=${theme}`);
  await page.locator("main, [role=main]").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

type Box = { x: number; y: number; width: number; height: number };

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("not on screen");
  return box;
}

const css = (locator: Locator, property: string) =>
  locator.evaluate(
    (node, name) => getComputedStyle(node).getPropertyValue(name),
    property,
  );

const cssOf = (locator: Locator, pseudo: string, property: string) =>
  locator.evaluate(
    (node, [which, name]) =>
      getComputedStyle(node, which).getPropertyValue(name as string),
    [pseudo, property],
  );

/**
 * Text of each mockup the rebuilt screen must show at 1440px: its rows, labels, values
 * and notes, one string per item. Words the docs changed on purpose are the docs' (the
 * template's titles, "Workspace Settings", s11's link on its own line).
 */
const mockupText: Record<(typeof screens)[number], string[]> = {
  "s05-dashboard": [
    "Piaya Gift Box Delivery",
    "Student Study Café",
    "1 dropped idea hidden",
    "Get the written supply quote from the bakery",
    "Yours",
    "overdue 3d",
    "Confirm permit requirements with City Hall",
    "First 30 days",
    "Test delivery slots with five offices",
    "Not shared",
    "changed 24.2 Milestones",
    "recorded Go / No-Go: Delay",
    "commented on Costs · Rent",
  ],
  "d1-moon": [
    "A newer template is available.",
    "Latest decision Oct 2 · Stage: Validation",
    "Edit summary",
    "Lower bound · 3 Unknown, 1 Empty",
    "Add evidence (1)",
    "Classify answers (3)",
    "Fill or mark 1 empty cost row",
    "Fill the Permits cost row, or log what you found",
    "62 items",
    "L9 M17 H3",
    "06–08 Unit Economics",
    "20/24 rows",
    "See all decisions",
    "No plans yet. A plan can start after a Proceed decision.",
  ],
  "s19-decision": [
    "Few healthy lunch options near the Lacson St. offices.",
    "How much more than ₱150 people will pay.",
    "≤ 306.2%",
    "2 missing",
    "Partial · 1 row is Empty",
    "Last decision: Hold · Oct 2 · Kenji Mori",
    "Should we develop this into a full Business Plan?",
    "Come back later",
    "You can decide again at any time.",
    "2 checks are missing. They will be recorded with this decision.",
  ],
  "s11-form": [
    "Define exactly who pays",
    "Every working day.",
    "Clear calories and macros on every bowl",
    "NON-CUSTOMER",
    "How painful or costly is it?",
    "Not classified yet",
    "Related research",
    "Previous section",
    "Next: 02 Market",
  ],
  "s06-ideas": [
    "Piaya Gift Box (Corporate)",
    "Missing: 6 checks",
    "Launch prep · Paolo Gonzaga · 5 days ago",
    "Latest decision Oct 2 · Stage: Validation · Kenji Mori",
    "Expected profit",
    "Demand or problem signal",
    "Plans: none yet. Latest decision: Hold on Oct 2",
    "1 dropped idea hidden",
  ],
  "s15-competitors": [
    "4 competitors · aim for 3–5",
    "Bowl & Co",
    "Home meal prep",
    "People who cook on Sundays",
    "Lunch rush volume",
    "1 source",
    "Survivor Patterns",
    "Failure Patterns",
  ],
  "s17-costs": [
    "What it takes to open, to run each month, and to make each sale.",
    "Blast chiller and prep tables",
    "Lump sum",
    "Working Capital Buffer",
    "Lacson St. ground floor, 30 m²",
    "Internet-Software",
    "Variable Labor",
    "Lower bound · 3 Empty",
    "At ₱220 a sale",
    "Unit Economics & Scenarios",
  ],
  "s25-import": [
    "Bacolod Health Bowl · validation questions",
    "to apply. Changed answers go back to Unclassified",
    "Updated by Kenji just now",
    "Imported · you can edit",
    "3 unchanged answers",
    "Each change is saved in history as an AI import.",
    "Apply 2 changes",
  ],
  "s09-settings": [
    "Changes save on their own.",
    "Changing the currency does not convert amounts you already entered.",
    "4 people. Owners can invite and change roles.",
    "This workspace needs at least one Owner",
    "grace@advisor.example",
    "Links expire after 7 days and go only to the invited email.",
    "new.member@bcdx.example",
    "Member · sent Oct 9 · expires Oct 16",
  ],
  "s23-deck": [
    "One-minute",
    "Five-minute",
    "Edit in validation",
    "Variable cost / sale",
    "Contribution margin",
    "What to say",
    "Every box we sell at ₱450",
  ],
  "s01-landing": [
    "From idea to a plan you can show.",
    "Office Lunch Bowls",
    "An example idea in validation.",
    "Each part asks one question at a time",
    "Business plan",
    "The numbers move as you type.",
    "moonx is by invitation.",
    "Privacy Policy",
  ],
};

test.describe("each screen shows its mockup's text", () => {
  for (const screen of screens) {
    test(screen, async ({ page }) => {
      await open(page, screen, { ...desktop, height: 2400 });
      for (const text of mockupText[screen]) {
        await expect(
          page.getByText(text).filter({ visible: true }).first(),
          text,
        ).toBeVisible();
      }
    });
  }
});

test.describe("the screens carry the mockups' content", () => {
  test("s05 and d1: the lists and blocks of the mockups", async ({ page }) => {
    await open(page, "s05-dashboard");
    await expect(
      page.getByRole("list", { name: "Ideas" }).getByRole("listitem"),
    ).toHaveCount(5);
    await expect(page.getByText("1 dropped idea hidden ·")).toBeVisible();
    await open(page, "d1-moon");
    await expect(
      page.getByRole("list", { name: "Checks" }).getByRole("listitem"),
    ).toHaveCount(6);
    await expect(
      page.getByRole("list", { name: "Sections" }).getByRole("listitem"),
    ).toHaveCount(8);
    await expect(
      page.getByText("A newer template is available."),
    ).toBeVisible();
  });

  test("s06, s15, s17: the ideas, the competitors and the three tables", async ({
    page,
  }) => {
    await open(page, "s06-ideas");
    await expect(
      page.getByRole("grid", { name: "Ideas" }).getByRole("row"),
    ).toHaveCount(5);
    await expect(page.getByText("1 dropped idea hidden ·")).toBeVisible();
    await expect(
      page
        .getByRole("list", { name: "Checks of Bacolod Health Bowl" })
        .getByRole("listitem"),
    ).toHaveCount(6);
    await open(page, "s15-competitors");
    await expect(page.getByText("4 competitors · aim for 3–5")).toBeVisible();
    await expect(
      page.getByRole("row", { name: /Home meal prep/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Survivor Patterns" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Failure Patterns" }),
    ).toBeVisible();
    await open(page, "s17-costs");
    for (const [name, rows] of [
      ["Startup costs", 10],
      ["Monthly fixed costs", 6],
      ["Variable costs", 6],
    ] as const) {
      await expect(
        page.getByRole("grid", { name }).getByRole("row"),
      ).toHaveCount(rows + 1);
    }
    await expect(page.getByText("3 Unknown, 1 Empty").first()).toBeVisible();
  });

  test("s11, s19, s09: the questions, the summary and the members", async ({
    page,
  }) => {
    await open(page, "s11-form");
    await expect(page.locator("[data-question]")).toHaveCount(10);
    await open(page, "s19-decision");
    await expect(page.getByText("Biggest opportunity")).toBeVisible();
    await expect(page.getByText("2 missing")).toBeVisible();
    await expect(
      page.getByText("Last decision: Hold · Oct 2 · Kenji Mori"),
    ).toBeVisible();
    await open(page, "s09-settings");
    await expect(
      page.getByRole("list", { name: "Members" }).getByRole("listitem"),
    ).toHaveCount(4);
    await expect(page.getByText("Saved")).toBeVisible();
  });
});

test.describe("every mockup screen draws, fits and passes axe", () => {
  for (const screen of screens) {
    // As tall as the screens (d1 on a phone is about 2,700px), so the header, the
    // TabBar and the bars kept at the bottom cover no part of a target: axe counts a
    // covered target as too small.
    for (const [name, viewport, theme] of [
      ["desktop, light", { ...desktop, height: 2400 }, "light"],
      ["desktop, dark", { ...desktop, height: 2400 }, "dark"],
      ["phone, light", { ...phone, height: 3200 }, "light"],
    ] as const) {
      test(`${screen}: ${name}`, async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
          if (message.type() === "error") errors.push(message.text());
        });
        await open(page, screen, viewport, theme);
        // Nothing scrolls the page sideways (4.3).
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          ),
        ).toBeLessThanOrEqual(0);
        const { violations } = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(
          violations.map((violation) => ({
            id: violation.id,
            targets: violation.nodes.map((node) => node.target.join(" ")),
          })),
        ).toEqual([]);
        expect(errors).toEqual([]);
      });
    }
  }
});

test.describe("the frame is moon-base.css's (design-spec 6.0.1, 4.5 SideNav・TabBar・AppFrame)", () => {
  test("desktop: the crescent and moonx, the workspace's box, the current page, the header", async ({
    page,
  }) => {
    await open(page, "s05-dashboard");
    const nav = page.getByRole("navigation", { name: "Main" });
    expect(Math.round((await boxOf(nav)).width)).toBe(236);
    const mark = nav.locator("svg").first();
    expect(Math.round((await boxOf(mark)).width)).toBe(22);
    await expect(nav.getByText("moonx", { exact: true })).toBeVisible();
    const workspace = nav.getByRole("button", {
      name: "BCDX, switch workspace",
    });
    expect(await css(workspace, "border-top-color")).toBe(light.hairline);
    expect(await css(workspace, "border-top-left-radius")).toBe("8px");
    const current = nav.getByRole("link", { name: "Dashboard" });
    expect(await css(current, "background-color")).toBe(light.raised);
    const shadow = await css(current, "box-shadow");
    expect(shadow).toContain(light.hairline);
    expect(shadow).toContain("inset");
    expect(shadow).not.toContain("3px");
    const account = nav.getByRole("button", { name: "Ana Villanueva" });
    expect(
      Math.round((await boxOf(account.locator("span").first())).width),
    ).toBe(28);
    const header = page.locator("header").first();
    expect(Math.round((await boxOf(header)).height)).toBe(56);
    // A lone crumb is not cut short.
    const crumb = header.getByText("Dashboard", { exact: true });
    expect(
      await crumb.evaluate((node) => node.scrollWidth - node.clientWidth),
    ).toBe(0);
  });

  test("desktop: the breadcrumbs' separator is a secondary slash", async ({
    page,
  }) => {
    await open(page, "s11-form");
    const separator = page
      .locator("header")
      .getByText("/", { exact: true })
      .first();
    expect(await css(separator, "color")).toBe(light.secondary);
  });

  test("phone: a 52px header with the screen's title, the TabBar's current tab", async ({
    page,
  }) => {
    await open(page, "s05-dashboard", phone);
    const header = page.locator("header").first();
    expect(Math.round((await boxOf(header)).height)).toBe(52);
    await expect(
      header.getByRole("button", { name: "BCDX, switch workspace" }),
    ).toBeVisible();
    const tabs = page.getByRole("navigation", { name: "Main" });
    expect(await css(tabs, "background-color")).toBe(light.raised);
    const current = tabs.getByRole("link", { name: "Dashboard" });
    expect(await css(current, "background-color")).toBe(light.transparent);
    expect(await css(current, "font-weight")).toBe("600");
    const tab = await boxOf(current);
    const line = Number.parseFloat(await cssOf(current, "::before", "width"));
    expect(Math.abs(line - tab.width * 0.4)).toBeLessThanOrEqual(1);
    expect(await cssOf(current, "::before", "height")).toBe("2px");
  });

  test("the band under the header: sunken, a hairline under it, the page's gutters (d1)", async ({
    page,
  }) => {
    await open(page, "d1-moon");
    const band = page.getByRole("alert").filter({
      hasText: "A newer template is available.",
    });
    expect(await css(band, "background-color")).toBe(light.sunken);
    expect(await css(band, "border-bottom-color")).toBe(light.hairline);
    expect(await css(band, "padding-top")).toBe("10px");
    expect(await css(band, "padding-left")).toBe("32px");
    expect(await css(band, "font-size")).toBe("14px");
    await expect(
      band.getByRole("link", { name: "Update template" }),
    ).toBeVisible();
    // Across the body, not a card in the page's column.
    const main = await boxOf(page.getByRole("main"));
    expect(Math.round((await boxOf(band)).width)).toBe(Math.round(main.width));
  });

  test("tablet: the page's gutters are the mockups' 32px from 768px up (06 layout.page-gutter-tablet)", async ({
    page,
  }) => {
    for (const width of [768, 900]) {
      await open(page, "d1-moon", { width, height: 900 });
      const band = page.getByRole("alert").filter({
        hasText: "A newer template is available.",
      });
      expect({ width, padding: await css(band, "padding-left") }).toEqual({
        width,
        padding: "32px",
      });
      const main = await boxOf(page.getByRole("main"));
      const title = await boxOf(page.getByRole("heading", { level: 1 }));
      expect({ width, inset: Math.round(title.x - main.x) }).toEqual({
        width,
        inset: 32,
      });
    }
  });
});

test.describe("← More on a phone (design-spec 6.0.1, 4.5 AppFrame)", () => {
  test.use({ hasTouch: true, isMobile: true });

  test("a screen the More menu opens shows ← More, which opens the menu as More does (s09)", async ({
    page,
  }) => {
    await open(page, "s09-settings", phone);
    const header = page.locator("header").first();
    const back = header.getByRole("button", { name: "Back to More" });
    await expect(back).toHaveText("More");
    await expect(back).toHaveAttribute("aria-haspopup", "menu");
    await expect(back).toHaveAttribute("aria-expanded", "false");
    const tabs = page.getByRole("navigation", { name: "Main" });
    const more = tabs.getByRole("button", { name: "More" });
    await expect(more).toHaveAttribute("aria-current", "true");
    const menu = page.getByRole("menu");
    const focusedRole = () =>
      page.evaluate(() => document.activeElement?.getAttribute("role"));

    // A tap: the More menu opens in its tray, focus in it as when More is tapped, and
    // goes back to ← More when it closes.
    await back.tap();
    await expect(
      menu.getByRole("menuitem", { name: "Workspace Settings" }),
    ).toBeVisible();
    await expect(back).toHaveAttribute("aria-expanded", "true");
    await expect.poll(focusedRole).toBe("menu");
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(back).toBeFocused();
    await more.tap();
    await expect(menu).toBeVisible();
    await expect.poll(focusedRole).toBe("menu");
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    // A key: the first item takes focus, as from More.
    await back.focus();
    await page.keyboard.press("Enter");
    await expect(menu.getByRole("menuitem").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(back).toBeFocused();
    await more.focus();
    await page.keyboard.press("Enter");
    await expect(menu.getByRole("menuitem").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(more).toBeFocused();

    // ↑ on ← More opens it on its last item, as on More.
    await back.focus();
    await page.keyboard.press("ArrowUp");
    await expect(menu.getByRole("menuitem").last()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(back).toBeFocused();
  });

  test("a screen the TabBar opens keeps its title, with no ← (s05)", async ({
    page,
  }) => {
    await open(page, "s05-dashboard", phone);
    const header = page.locator("header").first();
    await expect(
      header.getByRole("button", { name: "BCDX, switch workspace" }),
    ).toBeVisible();
    await expect(header.getByRole("button", { name: /Back to/ })).toHaveCount(
      0,
    );
    await expect(header.getByRole("link", { name: /Back to/ })).toHaveCount(0);
  });
});

test.describe("the patterns are the mockups' (design-spec 4.1, 06 semantic.layout)", () => {
  test("A: the columns 7 : 5 with 48px between, the action at the title's foot (d1)", async ({
    page,
  }) => {
    await open(page, "d1-moon");
    const main = page.getByRole("heading", { name: "Next steps" });
    const aside = page.getByRole("heading", { name: "Sections" });
    const [left, right] = [
      await boxOf(main.locator("xpath=ancestor::div[2]")),
      await boxOf(aside.locator("xpath=ancestor::div[2]")),
    ];
    expect(Math.round(right.x - (left.x + left.width))).toBe(48);
    expect(Math.abs(left.width / right.width - 7 / 5)).toBeLessThan(0.01);
    const record = await boxOf(
      page.getByRole("button", { name: "Record decision" }),
    );
    const concept = await boxOf(
      page.getByText(
        "Healthy fast-casual bowls with standardized nutrition in Bacolod.",
      ),
    );
    // The actions sit at the bottom of the title's block.
    expect(
      Math.abs(record.y + record.height - (concept.y + concept.height)),
    ).toBeLessThanOrEqual(6);
  });

  test("A on a phone: the main action fixed to the bottom, XL across the bar", async ({
    page,
  }) => {
    await open(page, "d1-moon", phone);
    const record = await boxOf(
      page.getByRole("button", { name: "Record decision" }),
    );
    expect(Math.round(record.height)).toBe(48);
    expect(Math.round(record.width)).toBe(phone.width - 2 * 16);
    const tabs = await boxOf(page.getByRole("navigation", { name: "Main" }));
    // 10px under it, then the TabBar.
    expect(Math.round(tabs.y - (record.y + record.height))).toBe(10);
  });

  test("B: the form's 696px column, Required beside its label, the actions under it", async ({
    page,
  }) => {
    await open(page, "s19-decision");
    const material = await boxOf(
      page.getByRole("region", { name: "What you know so far" }),
    );
    expect(Math.round(material.width)).toBe(696);
    await expect(page.getByText("Why? Required")).toBeVisible();
    expect(
      await css(page.getByText("Required", { exact: true }), "color"),
    ).toBe(light.secondary);
    // The actions follow the form, under the notice, at the column's end.
    const notice = await boxOf(
      page.getByText(
        "2 checks are missing. They will be recorded with this decision.",
      ),
    );
    const record = await boxOf(
      page.getByRole("button", { name: "Record decision" }),
    );
    expect(record.y).toBeGreaterThan(notice.y + notice.height);
    expect(Math.round(record.x + record.width)).toBe(
      Math.round(material.x + material.width),
    );
  });

  test("B, C, G: Checkbox, Radio and Switch take L in a spacious pattern (s19, s11, s25: 18px)", async ({
    page,
  }) => {
    // The control beside an input's label: the part of its label drawn as a box or a track
    // (the label's first child is React Aria's hidden input).
    const controlOf = (input: Locator, index: number) =>
      input.evaluate((node, at) => {
        const label = node.closest("label");
        const part = label?.children[at];
        if (!(part instanceof HTMLElement)) throw new Error("no control");
        const box = part.getBoundingClientRect();
        const handle = part.firstElementChild?.getBoundingClientRect();
        return {
          width: Math.round(box.width),
          height: Math.round(box.height),
          handle: handle === undefined ? null : Math.round(handle.width),
        };
      }, index);
    await open(page, "s19-decision");
    expect(
      await controlOf(page.getByRole("radio", { name: /Hold/ }), 1),
    ).toMatchObject({ width: 18, height: 18 });
    await open(page, "s25-import");
    expect(
      await controlOf(
        page.getByRole("checkbox", { name: "Apply the change to 01 · WHO" }),
        1,
      ),
    ).toMatchObject({ width: 18, height: 18 });
    await open(page, "s11-form");
    expect(
      await controlOf(
        page.locator("header").getByRole("switch", { name: "Focus" }),
        2,
      ),
    ).toEqual({ width: 30, height: 18, handle: 14 });
  });

  test("B on a phone: Cancel and the main action XL in the bar, sharing its width (s19's .formbar)", async ({
    page,
  }) => {
    await open(page, "s19-decision", phone);
    const cancel = await boxOf(page.getByRole("button", { name: "Cancel" }));
    const record = await boxOf(
      page.getByRole("button", { name: "Record decision" }),
    );
    expect(Math.round(cancel.height)).toBe(48);
    expect(Math.round(record.height)).toBe(48);
    expect(Math.abs(record.width - cancel.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(cancel.y - record.y)).toBeLessThanOrEqual(1);
  });

  test("C: quiet rows between hairlines, the card 16px wider each side, the answer's field", async ({
    page,
  }) => {
    await open(page, "s11-form");
    const card = page.getByRole("region", { name: "SEVERITY" });
    const quiet = page.getByRole("region", { name: "WHO" });
    const [cardBox, quietBox] = [await boxOf(card), await boxOf(quiet)];
    expect(Math.round(quietBox.x - cardBox.x)).toBe(16);
    expect(
      Math.round(cardBox.x + cardBox.width - (quietBox.x + quietBox.width)),
    ).toBe(16);
    expect(await css(card, "border-top-color")).toBe(light.default);
    expect(await css(card, "border-top-left-radius")).toBe("12px");
    expect((await css(card, "box-shadow")).split("px,").length).toBeGreaterThan(
      1,
    );
    // A quiet row: 14px above and under the name and the start of its answer.
    expect(Math.round(quietBox.height)).toBeGreaterThanOrEqual(74);
    expect(Math.round(quietBox.height)).toBeLessThanOrEqual(78);
    const answer = page.getByRole("textbox", { name: "Answer to SEVERITY" });
    expect(await css(answer, "font-size")).toBe("16px");
    const frame = answer.locator("xpath=..");
    expect(Math.round((await boxOf(frame)).height)).toBeGreaterThanOrEqual(112);
    expect(await css(frame, "border-top-left-radius")).toBe("10px");
    // The footer's bar at the bottom of the window, a hairline above it.
    const next = page.getByRole("button", { name: "Next: 02 Market" });
    const bar = next.locator("xpath=ancestor::div[@style][1]");
    expect(await css(bar, "border-top-color")).toBe(light.hairline);
    const barBox = await boxOf(bar);
    expect(Math.round(barBox.y + barBox.height)).toBe(desktop.height);
  });

  test("C on a phone: 48px framed arrows in a 60px bar, the answer 180px tall", async ({
    page,
  }) => {
    await open(page, "s11-form", phone);
    const next = page.getByRole("button", { name: "Next question" });
    const arrow = await boxOf(next);
    expect(Math.round(arrow.width)).toBe(48);
    expect(Math.round(arrow.height)).toBe(48);
    expect(await css(next, "border-top-color")).toBe(light.default);
    const bar = await boxOf(next.locator("xpath=ancestor::div[@style][1]"));
    expect(Math.round(bar.height)).toBe(60);
    const frame = page
      .getByRole("textbox", { name: "Answer to SEVERITY" })
      .locator("xpath=..");
    expect(Math.round((await boxOf(frame)).height)).toBeGreaterThanOrEqual(180);
  });

  test("D: the list's pane 5 of 11, its title, filters and rows, the detail beside it", async ({
    page,
  }) => {
    await open(page, "s06-ideas");
    const list = page.getByRole("grid", { name: "Ideas" });
    const pane = list.locator("xpath=../..");
    const paneBox = await boxOf(pane);
    // The body is 1440 − 236; the pane takes 5 of 5 + 6 (s06's grid).
    expect(
      Math.abs(paneBox.width - ((desktop.width - 236) * 5) / 11),
    ).toBeLessThanOrEqual(1);
    expect(await css(pane, "border-right-color")).toBe(light.hairline);
    const title = await boxOf(
      page.getByRole("heading", { name: "Ideas", level: 1 }),
    );
    expect(Math.round(title.x - paneBox.x)).toBe(24);
    const create = await boxOf(page.getByRole("button", { name: "New idea" }));
    expect(
      Math.round(paneBox.x + paneBox.width - (create.x + create.width)),
    ).toBe(25);
    // A filter: 30px, its label inside, the 3:1 frame of a field, corner 7.
    const stage = page.getByRole("button", { name: /Stage/ });
    expect(Math.round((await boxOf(stage)).height)).toBe(30);
    // Located by its frame: border.strong, 3:1 (4.5 Picker), where s06 draws a lighter one.
    expect(await css(stage, "border-top-color")).toBe(light.strong);
    expect(await css(stage, "border-top-left-radius")).toBe("7px");
    // The selected row: the raised ground and the ink line at its start.
    const row = list.getByRole("row", { name: "Bacolod Health Bowl" });
    expect(await css(row, "box-shadow")).toContain("3px 0px 0px 0px");
    expect(Math.round((await boxOf(row)).width)).toBe(
      Math.round(paneBox.width) - 1,
    );
    const detail = await boxOf(
      page.getByRole("heading", { name: "Bacolod Health Bowl", level: 2 }),
    );
    expect(Math.round(detail.x - (paneBox.x + paneBox.width))).toBe(36);
  });

  test("D on a phone: the list, the floating 56px +", async ({ page }) => {
    await open(page, "s06-ideas", phone);
    const add = page.getByRole("button", { name: "New idea" });
    const box = await boxOf(add);
    expect(Math.round(box.width)).toBe(56);
    expect(await css(add, "border-top-left-radius")).toBe("16px");
    expect(await css(add, "background-color")).toBe(light.primary);
    expect(Math.round(phone.width - (box.x + box.width))).toBe(16);
    const tabs = await boxOf(page.getByRole("navigation", { name: "Main" }));
    expect(Math.round(tabs.y - (box.y + box.height))).toBe(16);
  });

  test("E: the count in the title's row, the dashed tile last, the new item in place", async ({
    page,
  }) => {
    await open(page, "s15-competitors");
    const title = await boxOf(
      page.getByRole("heading", { name: "04 Competitors" }),
    );
    const count = await boxOf(page.getByText(/competitors · aim for 3–5/));
    expect(count.x).toBeGreaterThan(title.x + title.width);
    expect(count.y).toBeLessThan(title.y + title.height);
    const tile = page.getByRole("row", { name: "Add competitor" });
    await expect(
      page.getByRole("grid", { name: "Competitors" }).getByRole("row").last(),
    ).toHaveAccessibleName("Add competitor");
    expect(await css(tile, "border-top-style")).toBe("dashed");
    // 1.5px (06 layout.compare.add-tile-border), which a 1x screen draws as 1px.
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue(
          "--layout-compare-add-tile-border",
        ),
      ),
    ).toBe("1.5px");
    expect(await css(tile, "border-top-color")).toBe(light.default);
    expect(Math.round((await boxOf(tile)).height)).toBeGreaterThanOrEqual(160);
    const button = page.getByRole("button", { name: "Add competitor" });
    expect(await css(button, "border-top-color")).toBe(light.default);
  });

  test("F: the results card 288px, 40px from the table, its totals 24px", async ({
    page,
  }) => {
    await open(page, "s17-costs");
    const results = page.getByRole("complementary", { name: "Totals" });
    const table = await boxOf(
      page.getByRole("grid", { name: "Startup costs" }),
    );
    const card = await boxOf(results);
    expect(Math.round(card.width)).toBe(288);
    expect(Math.round(card.x - (table.x + table.width))).toBe(40);
    expect(await css(results, "border-top-color")).toBe(light.default);
    expect(await css(results, "border-top-left-radius")).toBe("12px");
    const total = results.getByText("₱145,000+", { exact: true });
    expect(await css(total, "font-size")).toBe("24px");
  });

  test("F on a phone: the summary bar 56px, raised, the light line above", async ({
    page,
  }) => {
    await open(page, "s17-costs", phone);
    const summary = page.getByRole("button", { name: /Startup ₱145,000\+/ });
    const bar = summary.locator("xpath=ancestor::div[@style][1]");
    expect(Math.round((await boxOf(bar)).height)).toBe(56);
    expect(await css(bar, "background-color")).toBe(light.raised);
    expect(await css(bar, "border-top-color")).toBe(light.default);
    // An Empty row says what a tap is for, under its name (design-spec 6.3).
    const startup = page.getByRole("grid", { name: "Startup costs" });
    const buffer = startup.getByRole("row", { name: /Working Capital Buffer/ });
    await expect(buffer.getByText("Tap to fill or mark Unknown")).toBeVisible();
    expect(
      await css(buffer.getByText("Tap to fill or mark Unknown"), "color"),
    ).toBe(light.tertiary);
    await expect(
      startup
        .getByRole("row", { name: /Permits/ })
        .getByText("Tap to fill or mark Unknown"),
    ).toHaveCount(0);
  });

  test("G: each question in its frame, two sides, the note on the bar; added text stays underlined while typing", async ({
    page,
  }) => {
    await open(page, "s25-import");
    const item = page.getByRole("region", {
      name: "01 · WHO Who is the primary paying customer?",
    });
    expect(await css(item, "border-top-left-radius")).toBe("12px");
    expect(await css(item, "border-top-color")).toBe(light.hairline);
    const note = page.getByText(
      "Each change is saved in history as an AI import.",
    );
    const apply = page.getByRole("button", { name: "Apply 2 changes" });
    const [noteBox, applyBox] = [await boxOf(note), await boxOf(apply)];
    expect(
      Math.abs(
        noteBox.y + noteBox.height / 2 - (applyBox.y + applyBox.height / 2),
      ),
    ).toBeLessThanOrEqual(2);
    expect(Math.round(applyBox.x + applyBox.width)).toBe(
      Math.round((await boxOf(item)).x + (await boxOf(item)).width),
    );
    const field = item.getByRole("textbox", {
      name: "Imported answer to 01 · WHO",
    });
    await field.click();
    await field.evaluate((node: HTMLTextAreaElement) =>
      node.setSelectionRange(node.value.length, node.value.length),
    );
    await page.keyboard.type(" Weekdays.");
    await expect(field).toHaveValue(/Weekdays\.$/);
    // The added words are underlined; the words the old text already had are not.
    await expect(
      item.locator("ins").filter({ hasText: "Weekday" }),
    ).toHaveCount(1);
    await expect(
      item.locator("ins").filter({ hasText: "convenient meals" }),
    ).toHaveCount(0);
    // The page's column widens to 06 layout.comparison-max.
    expect(Math.round((await boxOf(item)).width)).toBe(1016);
  });

  test("G on a phone: the note at the end of the content, Apply XL in the bar", async ({
    page,
  }) => {
    await open(page, "s25-import", phone);
    const apply = await boxOf(
      page.getByRole("button", { name: "Apply 2 changes" }),
    );
    expect(Math.round(apply.height)).toBe(48);
    const note = page.getByText(
      "Each change is saved in history as an AI import.",
    );
    await note.scrollIntoViewIfNeeded();
    expect((await boxOf(note)).y).toBeLessThan(
      (await boxOf(page.getByRole("button", { name: "Apply 2 changes" }))).y,
    );
  });

  test("H: a 200px name column, hairlines between groups, a dashed fixed role, the amber notice", async ({
    page,
  }) => {
    await open(page, "s09-settings");
    const group = page.getByRole("region", { name: "Workspace", exact: true });
    expect(await css(group, "border-top-color")).toBe(light.hairline);
    expect(await css(group, "padding-top")).toBe("24px");
    const name = page.getByRole("textbox", { name: "Name" });
    const groupBox = await boxOf(group);
    const field = await boxOf(name.locator("xpath=.."));
    expect(Math.round(field.x - groupBox.x)).toBe(200 + 24);
    expect(Math.round(field.x + field.width)).toBe(
      Math.round(groupBox.x + groupBox.width),
    );
    const owner = page.getByRole("button", { name: /Role of Ana Villanueva/ });
    expect(await css(owner, "border-top-style")).toBe("dashed");
    const notice = page.getByText(
      "Changing the currency does not convert amounts you already entered.",
    );
    expect(await css(notice.locator("xpath=.."), "color")).toBe(light.notice);
  });

  test("I: the numbered thumbnails 200px down the body, the quiet links over the slide", async ({
    page,
  }) => {
    await open(page, "s23-deck");
    const slides = page.getByRole("listbox", { name: "Slides" });
    const column = slides.locator("xpath=..");
    const columnBox = await boxOf(column);
    // 200 with the rule after it, as s23-deck.html's .thumbs and its border-right.
    expect(Math.round(columnBox.width)).toBe(199);
    // Down the whole body: as tall as the deck's area under the tools.
    const area = await boxOf(column.locator("xpath=.."));
    expect(Math.round(columnBox.height)).toBe(Math.round(area.height));
    const current = slides.getByRole("option", { selected: true });
    await expect(current).toHaveAccessibleName("7 Business model");
    await expect(slides.getByRole("option")).toHaveCount(14);
    expect(await css(current, "background-color")).toBe(light.raised);
    const edit = page.getByRole("link", { name: "Edit source" });
    expect(await css(edit, "text-decoration-line")).toBe("none");
    expect(await css(edit, "color")).toBe(light.secondary);
    await expect(
      page.getByRole("heading", { name: "What to say" }),
    ).toBeVisible();
  });

  test("I on a phone: the slide on screen alone, the previous and next under it", async ({
    page,
  }) => {
    await open(page, "s23-deck", phone);
    await expect(page.getByRole("listbox", { name: "Slides" })).toHaveCount(0);
    const download = await boxOf(
      page.getByRole("button", { name: "Download PDF" }),
    );
    const previous = page.getByRole("button", { name: "Previous slide" });
    expect((await boxOf(previous)).y).toBeGreaterThan(download.y);
    await previous.click();
    await expect(page.getByText("6 / 14")).toBeVisible();
  });

  test("J: the hero stacks at 900px and stands in two columns from 901px (s01's max-width: 900px)", async ({
    page,
  }) => {
    for (const [width, isStacked] of [
      [900, true],
      [901, false],
    ] as const) {
      await open(page, "s01-landing", { width, height: 900 });
      const title = await boxOf(page.getByRole("heading", { level: 1 }));
      const example = await boxOf(page.getByRole("figure"));
      if (isStacked) expect(example.y).toBeGreaterThan(title.y + title.height);
      else expect(example.x).toBeGreaterThan(title.x + title.width);
    }
  });

  test("J: the bar 68px, the hero 6 : 5, the floating example, the foot 64px", async ({
    page,
  }) => {
    await open(page, "s01-landing");
    const header = page.locator("header").first();
    expect(Math.round((await boxOf(header)).height)).toBe(68);
    expect(Math.round((await boxOf(header.locator("svg"))).width)).toBe(24);
    const login = header.getByRole("button", { name: "Log in" });
    expect(await css(login, "border-top-color")).toBe(light.default);
    const example = page.getByRole("figure");
    expect(await css(example, "border-top-left-radius")).toBe("16px");
    expect(await css(example, "box-shadow")).not.toBe("none");
    const title = await boxOf(page.getByRole("heading", { level: 1 }));
    const exampleBox = await boxOf(example);
    expect(exampleBox.x).toBeGreaterThan(title.x + title.width);
    // The hero's two columns share their width 6 : 5.
    const ratio = await page.evaluate(() => {
      const figure = document.querySelector("figure");
      let left: HTMLElement | null = document.querySelector("h1");
      while (left?.parentElement && !left.parentElement.contains(figure)) {
        left = left.parentElement;
      }
      let right: HTMLElement | null = figure;
      while (
        right?.parentElement &&
        right.parentElement !== left?.parentElement
      ) {
        right = right.parentElement;
      }
      if (!left || !right) return 0;
      return (
        left.getBoundingClientRect().width / right.getBoundingClientRect().width
      );
    });
    expect(ratio).toBeCloseTo(6 / 5, 1);
    const footer = page.locator("footer").last();
    expect(Math.round((await boxOf(footer)).height)).toBe(64 + 1);
    const privacy = footer.getByRole("link", { name: "Privacy Policy" });
    expect(await css(privacy, "text-decoration-line")).toBe("none");
  });

  test("J on a phone: the bar 60px, the hero stacked, the three parts down", async ({
    page,
  }) => {
    await open(page, "s01-landing", phone);
    const header = page.locator("header").first();
    expect(Math.round((await boxOf(header)).height)).toBe(60);
    const title = await boxOf(page.getByRole("heading", { level: 1 }));
    const example = await boxOf(page.getByRole("figure"));
    expect(example.y).toBeGreaterThan(title.y + title.height);
    const self = await boxOf(
      page.getByRole("heading", { name: "Self Analysis" }),
    );
    const validation = await boxOf(
      page.getByRole("heading", { name: "Validation", level: 3 }),
    );
    expect(validation.y).toBeGreaterThan(self.y + self.height);
  });
});

/** The width of "0" in the element's own face: CSS's 1ch. */
const chOf = (locator: Locator) =>
  locator.evaluate((node) => {
    const probe = document.createElement("span");
    probe.textContent = "0";
    probe.style.font = getComputedStyle(node).font;
    probe.style.position = "absolute";
    document.body.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  });

const isMono = async (locator: Locator) =>
  (await css(locator, "font-family")).includes("IBM Plex Mono");

test.describe("what the mockups show at a glance (Step 22i, design-spec 4.5)", () => {
  test("s05: each idea's dots and badge in the same place on every row; on a phone the badge at the top, the dots under", async ({
    page,
  }) => {
    await open(page, "s05-dashboard");
    const ideas = page.getByRole("list", { name: "Ideas" });
    const dots = ideas.getByRole("img");
    const badges = ideas.getByText(/^(Proceed|Hold|Undecided)$/);
    await expect(dots).toHaveCount(5);
    const dotsX = new Set<number>();
    const badgeEnds = new Set<number>();
    for (let index = 0; index < 5; index++) {
      dotsX.add(Math.round((await boxOf(dots.nth(index))).x));
      const badge = await boxOf(badges.nth(index));
      badgeEnds.add(Math.round(badge.x + badge.width));
    }
    expect(dotsX.size).toBe(1);
    expect(badgeEnds.size).toBe(1);
    // The dates of Due soon are monospaced (s05's .due .when).
    expect(await isMono(page.getByText("Oct 14", { exact: true }))).toBe(true);
    // Recent activity: the person in semibold, what they did in the body's weight.
    const activity = page.getByRole("list", { name: "Recent activity" });
    const who = activity.getByText("Paolo Gonzaga", { exact: true });
    expect(await css(who, "font-weight")).toBe("600");
    expect(await css(who.locator("xpath=.."), "font-weight")).toBe("400");

    await open(page, "s05-dashboard", phone);
    const row = page.getByRole("link", { name: /^Bacolod Health Bowl/ });
    const name = await boxOf(row.getByText("Bacolod Health Bowl"));
    const badge = await boxOf(row.getByText("Hold", { exact: true }));
    const meta = await boxOf(row.getByText(/^Validation · updated yesterday/));
    const rowDots = await boxOf(row.getByRole("img"));
    expect(badge.y).toBeLessThan(name.y + name.height);
    expect(badge.x).toBeGreaterThan(name.x + name.width);
    expect(rowDots.y).toBeGreaterThanOrEqual(meta.y + meta.height - 1);
    expect(Math.round(rowDots.x)).toBe(Math.round(name.x));
  });

  test("s19: the actions apart from the alert above them, Why? starting 120px tall", async ({
    page,
  }) => {
    await open(page, "s19-decision");
    const alert = await boxOf(
      page.getByRole("alert").filter({ hasText: "2 checks are missing." }),
    );
    const cancel = await boxOf(page.getByRole("button", { name: "Cancel" }));
    expect(cancel.y - (alert.y + alert.height)).toBeGreaterThanOrEqual(20);
    const why = page.getByRole("textbox", { name: /Why\?/ });
    expect(
      Math.round((await boxOf(why.locator("xpath=.."))).height),
    ).toBeGreaterThanOrEqual(120);
    // A press low in the field puts the caret in it.
    await why.scrollIntoViewIfNeeded();
    const field = await boxOf(why.locator("xpath=.."));
    await page.mouse.click(field.x + 20, field.y + field.height - 6);
    await expect(why).toBeFocused();
    // The F/A/U counts are monospaced (s19's .fauline b).
    const summary = page.getByRole("region", { name: "What you know so far" });
    expect(await isMono(summary.getByText("29", { exact: true }))).toBe(true);
  });

  test("s09: the invitation's email, role and Send on one line; on a phone one under another, the email whole", async ({
    page,
  }) => {
    await open(page, "s09-settings");
    const email = page.getByRole("textbox", { name: "Email to invite" });
    const role = page.getByRole("button", { name: /Role of the invited/ });
    const send = page.getByRole("button", { name: "Send invitation" });
    const [emailBox, roleBox, sendBox] = [
      await boxOf(email.locator("xpath=..")),
      await boxOf(role),
      await boxOf(send),
    ];
    const middle = (box: Box) => box.y + box.height / 2;
    expect(Math.abs(middle(emailBox) - middle(roleBox))).toBeLessThanOrEqual(2);
    expect(Math.abs(middle(roleBox) - middle(sendBox))).toBeLessThanOrEqual(2);
    expect(Math.round(roleBox.width)).toBe(140);

    await open(page, "s09-settings", phone);
    const stacked = [
      await boxOf(email.locator("xpath=..")),
      await boxOf(role),
      await boxOf(send),
    ];
    expect(stacked[1]?.y).toBeGreaterThan(
      (stacked[0]?.y ?? 0) + (stacked[0]?.height ?? 0) - 1,
    );
    expect(stacked[2]?.y).toBeGreaterThan(
      (stacked[1]?.y ?? 0) + (stacked[1]?.height ?? 0) - 1,
    );
    expect(Math.round(stacked[2]?.width ?? 0)).toBe(
      Math.round(stacked[0]?.width ?? 0),
    );
    const invitation = page
      .getByRole("list", { name: "Invitations" })
      .getByText("new.member@bcdx.example");
    const line = Number.parseFloat(await css(invitation, "line-height"));
    expect((await boxOf(invitation)).height).toBeLessThan(line * 1.5);
  });

  test("s23: the thumbnails in the page's flow, the page alone scrolls", async ({
    page,
  }) => {
    await open(page, "s23-deck");
    const column = page.getByRole("listbox", { name: "Slides" }).locator("..");
    expect(
      await column.evaluate((node) => node.scrollHeight - node.clientHeight),
    ).toBe(0);
    expect(await css(column, "overflow-y")).toBe("visible");
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBeGreaterThan(desktop.height);
  });

  test("s01: the section titles 22 characters wide at most, their text 56, 44 and 46", async ({
    page,
  }) => {
    await open(page, "s01-landing");
    const widest = async (locator: Locator, characters: number) => {
      const ch = await chOf(locator);
      expect((await boxOf(locator)).width).toBeLessThanOrEqual(
        ch * characters + 1,
      );
    };
    await widest(
      page.getByRole("heading", {
        name: "Three parts, in the order founders need them.",
      }),
      22,
    );
    await widest(page.getByText(/^Each part asks one question/), 56);
    await widest(page.getByText(/^Enter costs and a price/), 44);
    await widest(page.getByText(/^Ask the person who invited you/), 46);
    // Each title wraps as s01's does, onto two lines.
    const title = page.getByRole("heading", {
      name: "The numbers move as you type.",
    });
    const line = Number.parseFloat(await css(title, "line-height"));
    expect((await boxOf(title)).height).toBeGreaterThan(line * 1.5);
  });

  test("s11: the guidance 62 characters wide at most; Focus in the caption's secondary text; Related research's text under its title's", async ({
    page,
  }) => {
    await open(page, "s11-form");
    const guidance = page.getByText(/^Define exactly who pays/);
    expect((await boxOf(guidance)).width).toBeLessThanOrEqual(
      (await chOf(guidance)) * 62 + 1,
    );
    const focus = page.locator("header").getByText("Focus", { exact: true });
    expect(await css(focus, "font-size")).toBe("13px");
    expect(await css(focus, "color")).toBe(light.secondary);
    const card = page.getByRole("region", { name: "SEVERITY" });
    // Where the title's words start, past its chevron.
    const titleX = await card
      .getByRole("button", { name: "Related research" })
      .evaluate((node) => {
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        range.selectNodeContents(walker.nextNode() as Text);
        return range.getBoundingClientRect().x;
      });
    const text = card.getByText(/^No research linked to this answer/);
    expect(Math.abs((await boxOf(text)).x - titleX)).toBeLessThanOrEqual(1);
  });

  test("s19: the Summary's labels in s19's wider column, apart from their values", async ({
    page,
  }) => {
    await open(page, "s19-decision");
    const label = page.getByText("Biggest opportunity", { exact: true });
    const value = page.getByText(/^Few healthy lunch options/);
    const [labelBox, valueBox] = [await boxOf(label), await boxOf(value)];
    expect(valueBox.x - labelBox.x).toBe(132);
    // The words' own end, not the column's.
    const wordsEnd = await label.evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const box = range.getBoundingClientRect();
      return box.x + box.width;
    });
    expect(valueBox.x - wordsEnd).toBeGreaterThanOrEqual(8);
  });

  test("s11 on a phone: AI ▼ under the card, no previous or next section", async ({
    page,
  }) => {
    await open(page, "s11-form", phone);
    await expect(page.getByRole("button", { name: "AI" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Next: 02 Market" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Previous section" }),
    ).toHaveCount(0);
  });

  test("s17: an Empty row's F/A/U is a dash; on a phone the summary on one line and Add row alone under each table", async ({
    page,
  }) => {
    await open(page, "s17-costs");
    const empty = page.getByRole("button", {
      name: "F/A/U of Working Capital Buffer: Empty",
    });
    await expect(empty).toHaveText("\u2014Empty");
    expect(await isMono(page.getByText("· ₱77.00"))).toBe(true);
    await expect(page.getByText(/^Subtotal/).first()).toBeVisible();

    await open(page, "s17-costs", phone);
    const summary = page.getByRole("button", { name: /^Startup/ });
    const label = summary.getByText("Startup", { exact: false }).first();
    const line = Number.parseFloat(await css(label, "line-height"));
    expect((await boxOf(label)).height).toBeLessThan(line * 1.5);
    await expect(page.getByText(/^Subtotal/)).toHaveCount(0);
    // Narrower than the mockup, the pairs wrap between them rather than overlap.
    for (const width of [360, 320]) {
      await page.setViewportSize({ width, height: 800 });
      const bar = page.getByRole("button", { name: /^Startup/ });
      expect(
        await bar.evaluate((node) => node.scrollWidth - node.clientWidth),
      ).toBeLessThanOrEqual(0);
    }
    await page.setViewportSize(phone);
    const table = page.getByRole("grid", { name: "Startup costs" });
    const add = page.getByRole("button", { name: "Add row" }).first();
    expect(Math.round((await boxOf(add)).width)).toBe(
      Math.round((await boxOf(table)).width),
    );
  });

  test("d1: no label over the band, its name for screen readers; the counts monospaced; the phone's band not taller than it needs", async ({
    page,
  }) => {
    await open(page, "d1-moon");
    await expect(page.getByText("Answers by F/A/U")).toHaveCount(0);
    await expect(
      page.getByRole("figure", { name: "Answers by F/A/U" }),
    ).toBeVisible();
    expect(await isMono(page.getByText("62 items"))).toBe(true);
    expect(await isMono(page.getByText("L9 M17 H3"))).toBe(true);

    await open(page, "d1-moon", phone);
    const band = page
      .getByRole("alert")
      .filter({ hasText: "A newer template is available." });
    const message = band.getByText("Your answers stay on v3", { exact: false });
    const line = Number.parseFloat(await css(message, "line-height"));
    expect((await boxOf(message)).height).toBeLessThan(line * 2.5);
  });

  test("s25: words changed whole, the unchanged answers a row between hairlines, the number beside the question on a phone", async ({
    page,
  }) => {
    await open(page, "s25-import");
    const item = page.getByRole("region", {
      name: "01 · WHO Who is the primary paying customer?",
    });
    await expect(item.locator("del")).toHaveText(["25–40", "meals."]);
    await expect(item.locator("ins")).toHaveText([
      "25–45",
      "meals, mostly in BPO offices on Lacson St.",
    ]);
    const unchanged = page.getByRole("button", { name: "3 unchanged answers" });
    const row = unchanged.locator("xpath=ancestor::div[1]");
    expect(await css(row, "border-top-color")).toBe(light.hairline);
    expect(await css(row, "border-bottom-color")).toBe(light.hairline);
    await unchanged.click();
    await expect(page.getByText("01 · WHY THEM")).toBeVisible();

    await open(page, "s25-import", phone);
    const code = await boxOf(item.getByText("01 · WHO", { exact: true }));
    const question = await boxOf(
      item.getByText("Who is the primary paying customer?"),
    );
    expect(question.x).toBeGreaterThan(code.x + code.width);
    expect(question.y).toBeLessThan(code.y + code.height);
  });
});
