import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";

// /dev/components (docs/03_dev-setup.md 3.3): every component of packages/ui-web, drawn in both
// themes, both scales and the three widths of design-spec 4.3, with the axe check that
// SDD 10章 keeps out of the unit tests.

const widths = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1280, height: 900 },
} as const;
type WidthName = keyof typeof widths;

const themes = ["light", "dark"] as const;
const scales = ["medium", "large"] as const;

/** 06 semantic.color.{light,dark}.surface.canvas */
const canvas = { light: "rgb(244, 245, 248)", dark: "rgb(14, 17, 32)" };
/** A size M Button: 06 component.button.height.M, grown to target-min on large. */
const buttonHeightM = { medium: 32, large: 44 };
/** 06 component.target-min: 24px with a mouse, 44px on touch (design-spec 4.3). */
const targetMin = { medium: 24, large: 44 };

const capitalised = (word: string) => word[0]?.toUpperCase() + word.slice(1);

async function openGallery(page: Page, width: WidthName) {
  await page.setViewportSize(widths[width]);
  await page.goto("/dev/components");
  await expect(
    page.getByRole("heading", { level: 1, name: "Components" }),
  ).toBeVisible();
}

async function choose(page: Page, group: "Theme" | "Scale", option: string) {
  await page
    .getByRole("radiogroup", { name: group })
    .getByRole("radio", { name: capitalised(option) })
    .click();
}

const region = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true });

const frameSection = "SideNav, TabBar, AppFrame and RouterProvider";

/** Every component of the gallery, by one instance that must be on screen. */
const components: [string, string, (section: Locator) => Locator][] = [
  ["Flex", "Layout", (s) => s.getByText("Start", { exact: true })],
  ["Stack", "Layout", (s) => s.getByText("Second", { exact: true })],
  ["Grid", "Layout", (s) => s.getByText("D", { exact: true })],
  ["Container", "Layout", (s) => s.getByText("Reading column")],
  [
    "Heading",
    "Typography",
    (s) => s.getByRole("heading", { name: "Heading 4" }),
  ],
  ["Text", "Typography", (s) => s.getByText("Body small for supporting text.")],
  ["Divider", "Divider and Well", (s) => s.getByRole("separator").first()],
  [
    "Well",
    "Divider and Well",
    (s) => s.getByRole("region", { name: "Decision material" }),
  ],
  ["Link", "Link", (s) => s.getByRole("link", { name: "Edit in validation" })],
  ["Button", "Button", (s) => s.getByRole("button", { name: "Save version" })],
  ["ButtonGroup", "Button", (s) => s.getByRole("group", { name: "Stacked" })],
  [
    "ActionButton",
    "ActionButton",
    (s) => s.getByRole("button", { name: "History" }).first(),
  ],
  [
    "ActionGroup",
    "ActionButton",
    (s) => s.getByRole("toolbar", { name: "Panel tools" }),
  ],
  [
    "ToggleButtonGroup",
    "ToggleButtonGroup and SegmentedControl",
    (s) => s.getByRole("radiogroup", { name: "F/A/U", exact: true }),
  ],
  [
    "SegmentedControl",
    "ToggleButtonGroup and SegmentedControl",
    (s) => s.getByRole("radiogroup", { name: "Pitch length" }),
  ],
  [
    "TextField",
    "TextField and TextArea",
    (s) => s.getByRole("textbox", { name: "Idea name M" }),
  ],
  [
    "TextArea",
    "TextField and TextArea",
    (s) => s.getByRole("textbox", { name: "Who exactly is the customer?" }),
  ],
  [
    "NumberField",
    "NumberField",
    (s) => s.getByRole("textbox", { name: "Target margin" }),
  ],
  [
    "SearchField",
    "SearchField, Picker and ComboBox",
    (s) => s.getByRole("searchbox", { name: "Search ideas" }),
  ],
  [
    "Picker",
    "SearchField, Picker and ComboBox",
    (s) => s.getByRole("button", { name: /Currency/ }),
  ],
  [
    // A text input on tablet and wider, a button that opens the tray on a phone.
    "ComboBox",
    "SearchField, Picker and ComboBox",
    (s) =>
      s
        .getByRole("combobox", { name: "Time zone" })
        .or(s.getByRole("button", { name: /^Time zone/ })),
  ],
  [
    "DatePicker",
    "SearchField, Picker and ComboBox",
    (s) => s.getByRole("group", { name: "Deadline" }),
  ],
  [
    "RadioGroup",
    "RadioGroup, Checkbox and Switch",
    (s) => s.getByRole("radiogroup", { name: "Decision" }),
  ],
  [
    "Checkbox",
    "RadioGroup, Checkbox and Switch",
    (s) => s.getByText("Some sections", { exact: true }),
  ],
  [
    "CheckboxGroup",
    "RadioGroup, Checkbox and Switch",
    (s) => s.getByRole("group", { name: "Export scope" }),
  ],
  [
    "Switch",
    "RadioGroup, Checkbox and Switch",
    (s) => s.getByText("Focus M", { exact: true }),
  ],
  [
    "FileTrigger",
    "FileTrigger and TagGroup",
    (s) => s.getByRole("button", { name: "Choose photo" }),
  ],
  [
    "TagGroup",
    "FileTrigger and TagGroup",
    (s) => s.getByRole("grid", { name: "Supports" }),
  ],
  ["Form", "Form", (s) => s.getByRole("form", { name: "Spacious form" })],
  [
    "ProgressCircle",
    "ProgressCircle",
    (s) => s.getByRole("progressbar", { name: "Preparing PDF" }),
  ],
  // Overlays are drawn closed: their trigger is on screen; the tests below open them.
  [
    "Dialog",
    "Dialog and AlertDialog",
    (s) => s.getByRole("button", { name: "Open M" }),
  ],
  [
    "AlertDialog",
    "Dialog and AlertDialog",
    (s) => s.getByRole("button", { name: "Delete row" }),
  ],
  [
    "Popover",
    "Popover and Tray",
    (s) => s.getByRole("button", { name: "Open popover" }),
  ],
  [
    "Tray",
    "Popover and Tray",
    (s) => s.getByRole("button", { name: "Open tray" }),
  ],
  [
    "ActionMenu",
    "ActionMenu and Menu",
    (s) => s.getByRole("button", { name: "Idea actions M" }),
  ],
  [
    "Menu",
    "ActionMenu and Menu",
    (s) => s.getByRole("button", { name: "AI", exact: true }),
  ],
  [
    "Tooltip",
    "Tooltip and ContextualHelp",
    (s) => s.getByRole("button", { name: "Comments" }),
  ],
  [
    "ContextualHelp",
    "Tooltip and ContextualHelp",
    (s) => s.getByRole("button", { name: "Hint" }),
  ],
  ["InlineAlert", "InlineAlert", (s) => s.getByRole("alert").first()],
  ["Toast", "Toast", (s) => s.getByRole("button", { name: "Duplicate idea" })],
  [
    "ProgressBar",
    "ProgressBar",
    (s) => s.getByRole("progressbar", { name: "Uploading M" }),
  ],
  [
    "Skeleton",
    "Skeleton",
    (s) =>
      s.getByText("Office workers in Bacolod who buy pasalubong for family."),
  ],
  [
    "IllustratedMessage",
    "IllustratedMessage",
    (s) => s.getByRole("heading", { name: "No ideas yet (M)" }),
  ],
  ["StatusLight", "StatusLight", (s) => s.getByText("Assumption · Medium")],
  ["Badge", "Badge", (s) => s.getByText("Undecided")],
  [
    "Disclosure",
    "Disclosure and Accordion",
    (s) => s.getByRole("button", { name: "EXAMPLE M" }),
  ],
  [
    "Accordion",
    "Disclosure and Accordion",
    (s) => s.getByRole("button", { name: "Resolved thread: pricing" }),
  ],
  ["Tabs", "Tabs", (s) => s.getByRole("tablist", { name: "Execution" })],
  [
    // A table on tablet and wider; a card per row on a phone (a grid either way).
    "TableView",
    "TableView",
    (s) => s.getByRole("grid", { name: "Startup costs" }),
  ],
  [
    "ListView",
    "ListView",
    (s) => s.getByRole("grid", { name: "Ideas regular" }),
  ],
  [
    "Card",
    "Card and CardView",
    (s) => s.getByText("Airport kiosk XL", { exact: true }),
  ],
  [
    "CardView",
    "Card and CardView",
    (s) => s.getByRole("grid", { name: "Competitors" }),
  ],
  [
    "Tree",
    "Tree",
    (s) => s.getByRole("treegrid", { name: "Template regular" }),
  ],
  ["Meter", "Meter", (s) => s.getByText("Fact / Assumption / Unknown M")],
  [
    // The moon beside its caption: drawn at a size, not only present.
    "MoonGlyph",
    "MoonGlyph and CheckDots",
    (s) =>
      s
        .getByText("assumption M", { exact: true })
        .locator("xpath=preceding-sibling::*[local-name()='svg'][1]"),
  ],
  [
    "CheckDots",
    "MoonGlyph and CheckDots",
    (s) => s.getByRole("img", { name: /Demand or problem signal M: Done/ }),
  ],
  ["Avatar", "Avatar", (s) => s.getByRole("img", { name: "Paolo Gonzaga M" })],
  [
    // A button that opens the popover on tablet and wider; the buttons on a phone.
    "FauPicker",
    "FauPicker",
    (s) =>
      s
        .getByRole("button", { name: "F/A/U of Rent: Unclassified" })
        .or(s.getByRole("group", { name: "F/A/U of Rent" })),
  ],
  ["MetricTile", "MetricTile", (s) => s.getByText("₱169,500+")],
  ["RowList", "RowList", (s) => s.getByRole("list", { name: "Next steps" })],
  [
    "QuestionCard",
    "QuestionCard",
    (s) => s.getByRole("region", { name: "WHO" }),
  ],
  ["DiffText", "DiffText", (s) => s.getByText("in Bacolod", { exact: true })],
  [
    "MentionTextArea",
    "MentionTextArea",
    (s) => s.getByRole("textbox", { name: "Comment" }),
  ],
  ["Panel", "Panel", (s) => s.getByRole("button", { name: "Open comments" })],
  ["Slide", "Slide", (s) => s.getByRole("region", { name: "Competition" })],
  ["Steps", "Steps", (s) => s.getByRole("list", { name: "Import from AI" })],
  // The frame: the SideNav from the tablet breakpoint up, the TabBar on a phone, both
  // named Main; the width checks below tell them apart.
  ["SideNav / TabBar", frameSection, (s) => s.getByRole("navigation")],
  ["AppFrame", frameSection, (s) => s.getByRole("button", { name: "History" })],
  [
    "RouterProvider",
    frameSection,
    (s) => s.getByText("RouterProvider moved to: nothing yet"),
  ],
  [
    "PageFrame",
    "PageFrame",
    (s) => s.getByRole("heading", { name: "Sign in to moonx" }),
  ],
  [
    "HubPattern",
    "HubPattern",
    (s) => s.getByRole("heading", { name: "Piaya Gift Box Delivery" }),
  ],
  [
    "FocusPattern",
    "FocusPattern",
    (s) => s.getByRole("button", { name: "Save decision" }),
  ],
  [
    "QuestionFormPattern",
    "QuestionFormPattern",
    (s) => s.getByRole("textbox", { name: "Form answer WHO" }),
  ],
  [
    "ListDetailPattern",
    "ListDetailPattern",
    (s) => s.getByRole("heading", { name: "Piaya Gift Box Delivery" }),
  ],
  [
    "CardComparePattern",
    "CardComparePattern",
    (s) => s.getByText("Airport kiosk", { exact: true }),
  ],
  [
    "WorksheetPattern",
    "WorksheetPattern",
    (s) => s.getByRole("grid", { name: "Worksheet costs" }),
  ],
  [
    "StepsPattern",
    "StepsPattern",
    (s) => s.getByText("Office workers in Bacolod who buy pasalubong."),
  ],
  [
    "SettingsPattern",
    "SettingsPattern",
    (s) => s.getByRole("textbox", { name: "Display name" }),
  ],
  [
    "PresentationPattern",
    "PresentationPattern",
    (s) => s.getByRole("region", { name: "Business model" }).first(),
  ],
  [
    "PublicPattern",
    "PublicPattern",
    (s) => s.getByRole("link", { name: "Sign in" }),
  ],
];

/** Shown on tablet and wider only (design-spec 4.5): a phone shows ← instead. */
const breadcrumbs = (page: Page) =>
  region(page, "Breadcrumbs").getByRole("list", { name: "Breadcrumbs M" });

for (const width of Object.keys(widths) as WidthName[]) {
  for (const theme of themes) {
    for (const scale of scales) {
      test(`draws every component: ${width}, ${theme}, ${scale}`, async ({
        page,
      }) => {
        const fonts: string[] = [];
        page.on("request", (request) => {
          if (request.resourceType() === "font") fonts.push(request.url());
        });
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
          if (message.type() === "error") errors.push(message.text());
        });
        await openGallery(page, width);
        await choose(page, "Theme", theme);
        await choose(page, "Scale", scale);

        const html = page.locator("html");
        await expect(html).toHaveAttribute("data-theme", theme);
        await expect(html).toHaveAttribute("data-scale", scale);
        await expect(page.locator("body")).toHaveCSS(
          "background-color",
          canvas[theme],
        );

        for (const [component, sectionName, find] of components) {
          const instance = find(region(page, sectionName));
          await instance.scrollIntoViewIfNeeded();
          await expect(instance, component).toBeVisible();
        }
        if (width === "mobile") {
          await expect(breadcrumbs(page), "Breadcrumbs").toBeHidden();
        } else {
          await breadcrumbs(page).scrollIntoViewIfNeeded();
          await expect(breadcrumbs(page), "Breadcrumbs").toBeVisible();
        }

        const buttonM = region(page, "Button")
          .getByRole("button", { name: "Record decision" })
          .nth(1);
        expect((await buttonM.boundingBox())?.height).toBe(
          buttonHeightM[scale],
        );

        // The smallest steps grow to target-min and no further (design-spec 4.5): an XS
        // toggle (20px or 26px in 06), and an S tag (24px or 30px) whose remove button
        // keeps its own target-min inside it.
        const toggleXS = region(page, "ToggleButtonGroup and SegmentedControl")
          .getByRole("radiogroup", { name: "F/A/U XS" })
          .getByRole("radio")
          .first();
        expect((await toggleXS.boundingBox())?.height).toBe(targetMin[scale]);
        const tagS = region(page, "FileTrigger and TagGroup")
          .getByRole("grid", { name: "Conditions S" })
          .getByRole("row")
          .first();
        await tagS.scrollIntoViewIfNeeded();
        expect((await tagS.boundingBox())?.height).toBe(targetMin[scale]);
        expect(
          (await tagS.getByRole("button").boundingBox())?.height,
        ).toBeGreaterThanOrEqual(targetMin[scale]);

        // design-spec 4.3: nothing scrolls sideways.
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);

        // The self-hosted faces are in use, served as woff2 only (ADR-018).
        const loaded = await page.evaluate(async () => {
          await document.fonts.ready;
          return [...document.fonts]
            .filter((face) => face.status === "loaded")
            .map((face) => `${face.family.replaceAll('"', "")} ${face.weight}`);
        });
        for (const face of [
          "IBM Plex Sans 400",
          "IBM Plex Sans 500",
          "IBM Plex Sans 600",
          "IBM Plex Mono 400",
        ]) {
          expect(loaded).toContain(face);
        }
        expect(fonts.length).toBeGreaterThan(0);
        expect(fonts.filter((url) => !url.endsWith(".woff2"))).toEqual([]);

        const { violations } = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(
          violations.map((violation) => ({
            id: violation.id,
            targets: violation.nodes.map((node) => node.target.join(" ")),
          })),
        ).toEqual([]);

        // Switching the theme and the scale resized every field on the way: nothing failed.
        expect(errors).toEqual([]);
      });
    }
  }
}

test.describe("overlays follow the width (design-spec 4.5)", () => {
  for (const [width, expected] of [
    ["mobile", "tray"],
    ["tablet", "popover"],
    ["desktop", "popover"],
  ] as const) {
    test(`Picker opens a ${expected} at ${width}`, async ({ page }) => {
      await openGallery(page, width);
      await page.getByRole("button", { name: /Currency/ }).click();
      const listbox = page.getByRole("listbox");
      await expect(listbox).toBeVisible();
      const box = await listbox.boundingBox();
      const viewport = widths[width];
      if (expected === "tray") {
        // A bottom sheet: as wide as the window, resting on its bottom edge.
        expect(box?.width).toBeGreaterThan(viewport.width * 0.9);
        // The list sits directly in the sheet; once it has slid in, its bottom is the
        // window's.
        await expect(async () => {
          const bottom = await listbox.evaluate(
            (element) => element.parentElement?.getBoundingClientRect().bottom,
          );
          expect(Math.round(bottom ?? 0)).toBe(viewport.height);
        }).toPass();
      } else {
        expect(box?.width).toBeLessThan(viewport.width / 2);
        // 06 layout.popover-max-height caps the popover, or the room below if less.
        const cap = await listbox.evaluate((element) =>
          Number.parseFloat(
            (element.closest("[data-placement]") as HTMLElement).style
              .maxHeight,
          ),
        );
        expect(cap).toBeLessThanOrEqual(384);
      }
      await page.keyboard.press("Escape");
      await expect(listbox).toBeHidden();
      await expect(
        page.getByRole("button", { name: /Currency/ }),
      ).toBeFocused();
    });
  }

  test("ComboBox on a phone: the tray's input takes focus; Enter keeps free text", async ({
    page,
  }) => {
    await openGallery(page, "mobile");
    const trigger = page.getByRole("button", { name: /Assignee or name/ });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Assignee or name" });
    const input = dialog.getByRole("textbox", { name: "Assignee or name" });
    await expect(input).toBeFocused();
    await input.fill("Zed");
    await expect(
      dialog.getByRole("button", { name: 'Use "Zed"' }),
    ).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(trigger).toContainText("Zed");
  });

  test("ComboBox on a phone: choosing an item fills the field", async ({
    page,
  }) => {
    await openGallery(page, "mobile");
    await page.getByRole("button", { name: /^Assignee Ben Cruz/ }).click();
    const dialog = page.getByRole("dialog", { name: "Assignee" });
    await dialog.getByRole("textbox").fill("car");
    await dialog.getByRole("option", { name: "Carla Santos" }).click();
    await expect(
      page.getByRole("button", { name: /^Assignee Carla Santos/ }),
    ).toBeFocused();
  });

  test("DatePicker opens the calendar in a tray on a phone", async ({
    page,
  }) => {
    await openGallery(page, "mobile");
    await page
      .getByRole("group", { name: "Deadline" })
      .getByRole("button")
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("grid")).toBeVisible();
    expect((await dialog.boundingBox())?.width).toBeGreaterThan(
      widths.mobile.width * 0.9,
    );
  });
});

test.describe("a browser in another language", () => {
  // Japanese puts the year first: the field must keep en-PH's month / day / year.
  test.use({ locale: "ja-JP" });

  test("DatePicker takes typed digits segment by segment, in en-PH order", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    expect(await page.evaluate(() => navigator.language)).toBe("ja-JP");
    const group = page.getByRole("group", { name: "Target date" });
    await group.getByRole("spinbutton").first().click();
    await page.keyboard.type("03152027");
    await expect(group.getByRole("spinbutton")).toHaveText(["3", "15", "2027"]);
  });
});

test.describe("keyboard in a real browser", () => {
  test("SegmentedControl and ToggleButtonGroup move both ways with the arrows", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    const pitch = page.getByRole("radiogroup", { name: "Pitch length" });
    await pitch.getByRole("radio", { name: "1 min" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(pitch.getByRole("radio", { name: "5 min" })).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(pitch.getByRole("radio", { name: "1 min" })).toBeFocused();

    const fau = page.getByRole("radiogroup", { name: "F/A/U", exact: true });
    await fau.getByRole("radio", { name: "Unknown" }).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(fau.getByRole("radio", { name: "Assumption" })).toBeFocused();

    // Without a value only Unknown can be pressed: the arrows pass over the others.
    const empty = page.getByRole("radiogroup", {
      name: "F/A/U for an empty answer",
    });
    await empty.getByRole("radio", { name: "Unknown" }).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(empty.getByRole("radio", { name: "Unknown" })).toBeFocused();
  });

  test("ActionGroup moves with the arrows of its orientation", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    const tools = page.getByRole("toolbar", { name: "Panel tools" });
    await tools.getByRole("button", { name: "Comments" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(tools.getByRole("button", { name: "History" })).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(tools.getByRole("button", { name: "Comments" })).toBeFocused();

    const vertical = page.getByRole("toolbar", { name: "Vertical tools" });
    await vertical.getByRole("button", { name: "Duplicate" }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(
      vertical.getByRole("button", { name: "Archive" }),
    ).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(
      vertical.getByRole("button", { name: "Duplicate" }),
    ).toBeFocused();
  });

  test("DatePicker's calendar: arrows move the day, Enter picks it, Escape closes", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    const group = page.getByRole("group", { name: "Deadline" });
    await group.getByRole("button").click();
    const grid = page.getByRole("dialog").getByRole("grid");
    await expect(
      grid.getByRole("button", { name: /October 16, 2026/ }),
    ).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowLeft");
    await expect(
      grid.getByRole("button", { name: /October 23, 2026/ }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(grid).toBeHidden();
    await expect(group.getByRole("spinbutton")).toHaveText([
      "10",
      "23",
      "2026",
    ]);

    await group.getByRole("button").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("NumberField keeps '1,5' and shows the reason under it", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    const margin = page.getByRole("textbox", { name: "Target margin" });
    await expect(margin).toHaveValue("1,5");
    await expect(margin).toHaveAttribute("aria-invalid", "true");
    await margin.fill("12.5");
    await margin.blur();
    await expect(margin).toHaveValue("12.5");
    await expect(margin).not.toHaveAttribute("aria-invalid", "true");
  });
});

// Dialog, Popover, Tray, Menu and ContextualHelp: how each opens at each width, where focus
// goes, and what closes it.

/** The element React Aria sizes and moves: the dialog's or menu's frame. */
const frameOf = (inner: Locator) =>
  inner.locator(
    "xpath=ancestor-or-self::*[contains(@class, 'tray') or contains(@class, 'sheet') or @data-placement or contains(@class, 'centered')][1]",
  );

/** Waits until the element's own entering animation (slide, rise, fade) has ended. */
async function settled(element: Locator) {
  await expect
    .poll(() =>
      element.evaluate(
        (node) =>
          node.getAnimations().filter((a) => a.playState === "running").length,
      ),
    )
    .toBe(0);
}

/** Where an overlay sits: a tray on the bottom edge, a full sheet, or a card or popover. */
async function placement(overlay: Locator, width: WidthName) {
  const viewport = widths[width];
  const frame = frameOf(overlay);
  await settled(frame);
  const box = await frame.boundingBox();
  if (box === null) throw new Error("not on screen");
  const fullWidth = box.width > viewport.width * 0.9;
  const onBottom = Math.round(box.y + box.height) === viewport.height;
  if (fullWidth && onBottom && Math.round(box.y) <= 0) return "sheet";
  if (fullWidth && onBottom) return "tray";
  return "floating";
}

/** The specimen with an observable press, not the toolbars' Comments buttons. */
const tooltipButton = (page: Page, name: string) =>
  region(page, "Tooltip and ContextualHelp").getByRole("button", { name });

test.describe("dialogs, popovers and menus follow the width (design-spec 3.8・4.5)", () => {
  for (const [width, expected] of [
    ["mobile", "tray"],
    ["tablet", "floating"],
    ["desktop", "floating"],
  ] as const) {
    test(`Popover is ${expected} at ${width}; Escape returns focus`, async ({
      page,
    }) => {
      await openGallery(page, width);
      const trigger = page.getByRole("button", { name: "Open popover" });
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "F/A/U" });
      await expect(dialog).toBeVisible();
      expect(await placement(dialog, width)).toBe(expected);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
    });

    test(`Menu is ${expected} at ${width}`, async ({ page }) => {
      await openGallery(page, width);
      await page.getByRole("button", { name: "Idea actions M" }).click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      expect(await placement(menu, width)).toBe(expected);
    });

    test(`ContextualHelp is ${expected} at ${width}`, async ({ page }) => {
      await openGallery(page, width);
      await page.getByRole("button", { name: "Hint" }).click();
      const dialog = page.getByRole("dialog", { name: "Hint" });
      await expect(dialog).toBeVisible();
      expect(await placement(dialog, width)).toBe(expected);
    });
  }

  test("Dialog M is a card in the middle on a desktop; Escape returns focus", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    const trigger = page.getByRole("button", { name: "Open M" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "New idea" });
    await expect(dialog).toBeVisible();
    expect(await placement(dialog, "desktop")).toBe("floating");
    const box = await frameOf(dialog).boundingBox();
    // 06 layout.dialog-max-width.M, centred.
    expect(box?.width).toBeLessThanOrEqual(480);
    expect(
      Math.abs(
        (box?.x ?? 0) + (box?.width ?? 0) / 2 - widths.desktop.width / 2,
      ),
    ).toBeLessThanOrEqual(1);
    await expect(async () => {
      expect(
        await dialog.evaluate((element) =>
          element.contains(document.activeElement),
        ),
      ).toBe(true);
    }).toPass();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  for (const [size, form] of [
    ["S", "tray"],
    ["M", "tray"],
    ["L", "sheet"],
    ["fullscreen", "sheet"],
  ] as const) {
    test(`Dialog ${size} on a phone is a ${form}`, async ({ page }) => {
      await openGallery(page, "mobile");
      await page.getByRole("button", { name: `Open ${size}` }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      expect(await placement(dialog, "mobile")).toBe(form);
      // The buttons stay in view at the bottom (design-spec 4.1).
      const save = dialog.getByRole("button", { name: "Save" });
      await expect(save).toBeInViewport();
    });
  }

  test("a Tray is a bottom sheet on a desktop too, and returns focus", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    const trigger = page.getByRole("button", { name: "Open tray" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Tray" });
    await expect(dialog).toBeVisible();
    expect(await placement(dialog, "desktop")).toBe("tray");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("a fullscreen Dialog fills a desktop too", async ({ page }) => {
    await openGallery(page, "desktop");
    await page.getByRole("button", { name: "Open fullscreen" }).click();
    const dialog = page.getByRole("dialog", { name: "Update template" });
    await expect(dialog).toBeVisible();
    expect(await placement(dialog, "desktop")).toBe("sheet");
  });

  for (const width of ["mobile", "desktop"] as const) {
    test(`AlertDialog at ${width}: focus on Cancel, Escape does not close, an answer does`, async ({
      page,
    }) => {
      await openGallery(page, width);
      const trigger = page.getByRole("button", { name: "Delete row" });
      await trigger.click();
      const alert = page.getByRole("alertdialog", { name: "Delete this row?" });
      await expect(alert).toBeVisible();
      expect(await placement(alert, width)).toBe(
        width === "mobile" ? "tray" : "floating",
      );
      await expect(alert.getByRole("button", { name: "Cancel" })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(alert).toBeVisible();
      await alert.getByRole("button", { name: "Delete" }).click();
      await expect(alert).toBeHidden();
      await expect(page.getByText("Last answer: Delete")).toBeVisible();
      await expect(trigger).toBeFocused();
    });
  }
});

test.describe("keyboard in a real browser: menus, tabs and tooltips", () => {
  test("ActionMenu: Enter opens on the first item, arrows move, Enter acts and returns focus", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    const trigger = page.getByRole("button", { name: "Idea actions M" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu");
    await expect(
      menu.getByRole("menuitem", { name: "Duplicate" }),
    ).toBeFocused();
    await page.keyboard.press("ArrowDown");
    const archive = menu.getByRole("menuitem", { name: "Archive" });
    await expect(archive).toBeFocused();
    // The look of keyboard focus hangs on this attribute (ADR-025).
    await expect(archive).toHaveAttribute("data-focus-visible", "true");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(menu).toBeHidden();
    await expect(page.getByText("Last action: archive")).toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test("Tabs: arrows move both ways and select", async ({ page }) => {
    await openGallery(page, "desktop");
    const list = page.getByRole("tablist", { name: "Execution" });
    await list.getByRole("tab", { name: "Tasks" }).focus();
    await page.keyboard.press("ArrowRight");
    const milestones = list.getByRole("tab", { name: "Milestones" });
    await expect(milestones).toBeFocused();
    await expect(milestones).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowLeft");
    await expect(list.getByRole("tab", { name: "Tasks" })).toBeFocused();
  });

  test("Tooltip: keyboard focus shows it, Escape hides it", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    await tooltipButton(page, "Comments").focus();
    await page.keyboard.press("Tab");
    await expect(tooltipButton(page, "History")).toBeFocused();
    await expect(page.getByRole("tooltip")).toHaveText("History");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toBeHidden();
  });
});

test.describe("Tooltip on a touch screen (design-spec 4.5)", () => {
  test.use({ hasTouch: true });

  async function touch(page: Page, target: Locator, holdMs: number) {
    const box = await target.boundingBox();
    if (box === null) throw new Error("not on screen");
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point],
    });
    await page.waitForTimeout(holdMs);
    return async () => {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    };
  }

  test("a long press shows it without pressing; it hides after the finger lifts", async ({
    page,
  }) => {
    await openGallery(page, "mobile");
    const button = tooltipButton(page, "Comments");
    await button.scrollIntoViewIfNeeded();
    const lift = await touch(page, button, 800);
    await expect(page.getByRole("tooltip")).toHaveText("Comments");
    await lift();
    await expect(page.getByText("Comments pressed: 0")).toBeVisible();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await expect(page.getByRole("tooltip")).toBeHidden({ timeout: 3000 });
    await expect(page.getByText("Comments pressed: 0")).toBeVisible();
  });

  test("a tap presses the button and shows no tooltip", async ({ page }) => {
    await openGallery(page, "mobile");
    const button = tooltipButton(page, "Comments");
    await button.scrollIntoViewIfNeeded();
    await button.tap();
    await expect(page.getByText("Comments pressed: 1")).toBeVisible();
    await expect(page.getByRole("tooltip")).toBeHidden();
  });
});

test.describe("Toast and Breadcrumbs", () => {
  for (const width of ["mobile", "desktop"] as const) {
    test(`Toast at ${width}: at the bottom, its action works, it closes`, async ({
      page,
    }) => {
      await openGallery(page, width);
      await page.getByRole("button", { name: "Duplicate idea" }).click();
      const toast = page.getByRole("alertdialog", {
        name: "Duplicated from Piaya Gift Box",
      });
      await expect(toast).toBeVisible();
      await settled(toast);
      const box = await toast.boundingBox();
      // 06 layout.page-gutter-mobile from the bottom edge (the gallery has no TabBar).
      expect(widths[width].height - ((box?.y ?? 0) + (box?.height ?? 0))).toBe(
        16,
      );
      await toast.getByRole("button", { name: "Undo" }).click();
      await expect(toast).toBeHidden();
      await expect(page.getByText("Undone: 1")).toBeVisible();

      await page.getByRole("button", { name: "Apply changes" }).click();
      const second = page.getByRole("alertdialog", {
        name: "2 answers updated · 1 needs F/A/U",
      });
      await second.getByRole("button", { name: "Close" }).click();
      await expect(second).toBeHidden();
    });
  }

  test("Toast on a phone with a TabBar sits above it (design-spec 4.5)", async ({
    page,
  }) => {
    await openGallery(page, "mobile");
    await page.getByText("aboveTabBar (a phone with a TabBar)").click();
    await region(page, "Toast")
      .getByRole("button", { name: "Record decision" })
      .click();
    const toast = page.getByRole("alertdialog", { name: "Decision recorded" });
    await settled(toast);
    const box = await toast.boundingBox();
    // 06 layout.page-gutter-mobile above layout.tab-bar-height.
    expect(widths.mobile.height - ((box?.y ?? 0) + (box?.height ?? 0))).toBe(
      16 + 64,
    );
  });

  test("Breadcrumb links are full targets on a touch tablet (design-spec 4.3)", async ({
    page,
  }) => {
    await openGallery(page, "tablet");
    await choose(page, "Scale", "large");
    const link = breadcrumbs(page).getByRole("link", { name: "Ideas" });
    await link.scrollIntoViewIfNeeded();
    const box = await link.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(targetMin.large);
    expect(box?.width).toBeGreaterThanOrEqual(targetMin.large);
  });

  test("Breadcrumbs: the current page is text; the others are links", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    const list = breadcrumbs(page);
    await expect(list.getByRole("link")).toHaveText([
      "Ideas",
      "Piaya Gift Box",
    ]);
    await expect(list.getByText("05 Costs")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

test.describe("open overlays pass axe", () => {
  for (const width of ["mobile", "desktop"] as const) {
    for (const theme of themes) {
      test(`${width}, ${theme}`, async ({ page }) => {
        await openGallery(page, width);
        await choose(page, "Theme", theme);
        const check = async (what: string) => {
          const { violations } = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
            .analyze();
          expect(
            violations.map((violation) => ({
              what,
              id: violation.id,
              targets: violation.nodes.map((node) => node.target.join(" ")),
            })),
          ).toEqual([]);
        };

        await page.getByRole("button", { name: "Open M" }).click();
        await settled(frameOf(page.getByRole("dialog")));
        await check("Dialog");
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toBeHidden();

        await page.getByRole("button", { name: "Show error" }).click();
        await settled(frameOf(page.getByRole("alertdialog")));
        await check("AlertDialog");
        await page
          .getByRole("alertdialog")
          .getByRole("button", { name: "Close" })
          .click();
        await expect(page.getByRole("alertdialog")).toBeHidden();

        await page.getByRole("button", { name: "Idea actions M" }).click();
        await settled(frameOf(page.getByRole("menu")));
        await check("Menu");
        await page.keyboard.press("Escape");
        await expect(page.getByRole("menu")).toBeHidden();

        await page.getByRole("button", { name: "Hint" }).click();
        await settled(frameOf(page.getByRole("dialog")));
        await check("ContextualHelp");
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toBeHidden();

        await page.getByRole("button", { name: "Duplicate idea" }).click();
        await settled(page.getByRole("alertdialog"));
        await check("Toast");
      });
    }
  }
});

test.describe("data and moonx's own components in a real browser (design-spec 4.5)", () => {
  test("TableView: a pressed row types in place, ← moves the caret; Escape gives the arrows back; a focused row shows its inputs", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    const table = page.getByRole("grid", { name: "Startup costs" });
    await table.getByText("₱15,000").click();
    const amount = table.getByRole("textbox", { name: "Amount of Rent" });
    await expect(amount).toBeFocused();
    await expect(table.getByRole("textbox")).toHaveCount(3);
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.type("9");
    await expect(amount).toHaveValue("15,0090");
    // Escape: the focus is on the cell again, the row still shows its inputs.
    await page.keyboard.press("Escape");
    const focusedColumn = () =>
      page.evaluate(() => document.activeElement?.getAttribute("data-column"));
    await expect.poll(focusedColumn).toBe("amount");
    await expect(table.getByRole("textbox")).toHaveCount(3);
    // The arrows move again: the next row shows its inputs, this one its values.
    await page.keyboard.press("ArrowDown");
    await expect(table.getByText("₱15,0090")).toBeVisible();
    await expect(
      table.getByRole("textbox", { name: "Amount of Permits / Registration" }),
    ).toBeVisible();
    await expect.poll(focusedColumn).toBe("amount");
    await page.keyboard.press("Enter");
    await expect(
      table.getByRole("textbox", { name: "Amount of Permits / Registration" }),
    ).toBeFocused();
  });

  test("TableView: a popover opened from an edited row keeps the row edited", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    const table = page.getByRole("grid", { name: "Startup costs" });
    await table.getByText("Packaging", { exact: true }).click();
    await expect(table.getByRole("textbox")).toHaveCount(3);
    await table
      .getByRole("button", { name: "F/A/U of Packaging: Empty" })
      .click();
    const popover = page.getByRole("dialog", { name: "F/A/U of Packaging" });
    await popover.getByRole("radio", { name: "Unknown" }).click();
    await expect(popover).toBeHidden();
    await expect(
      table.getByRole("button", { name: "F/A/U of Packaging: Unknown" }),
    ).toBeFocused();
    await expect(table.getByRole("textbox")).toHaveCount(3);
  });

  test("TableView: one press on an untouched row's F/A/U opens its popover (6.3)", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    const table = page.getByRole("grid", { name: "Startup costs" });
    await table
      .getByRole("button", { name: "F/A/U of Rent: Assumption · Medium" })
      .click();
    const popover = page.getByRole("dialog", { name: "F/A/U of Rent" });
    await expect(popover).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
    await expect(
      table.getByRole("button", { name: "F/A/U of Rent: Assumption · Medium" }),
    ).toBeFocused();
  });

  test("TableView: from the keyboard, the F/A/U popover gives focus back to its button", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    const table = page.getByRole("grid", { name: "Startup costs" });
    await table.getByText("₱15,000").click();
    await expect(
      table.getByRole("textbox", { name: "Amount of Rent" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    const trigger = table.getByRole("button", {
      name: "F/A/U of Rent: Assumption · Medium",
    });
    await expect(trigger).toBeFocused();
    await page.keyboard.press("Enter");
    const popover = page.getByRole("dialog", { name: "F/A/U of Rent" });
    await expect(popover).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("TableView on a phone: a card per row, no table", async ({ page }) => {
    await openGallery(page, "mobile");
    const costs = page.getByRole("grid", { name: "Startup costs" });
    await expect(costs.locator("table")).toHaveCount(0);
    await expect(costs.getByRole("row")).toHaveCount(3);
  });

  test("CardView: the arrows move across and down the grid of cards", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    const view = page.getByRole("grid", { name: "Competitors" });
    await view.getByText("Airport kiosk", { exact: true }).click();
    await page.keyboard.press("ArrowRight");
    await expect(
      view.getByRole("row", { name: "Bakeshop boxes" }),
    ).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(
      view.getByRole("row", { name: "Airport kiosk" }),
    ).toBeFocused();
  });

  test("Tree: ← closes a branch, → opens it, ↓ moves into it", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    const tree = page.getByRole("treegrid", { name: "Template regular" });
    await tree.getByText("01 Customer & Problem").click();
    await page.keyboard.press("ArrowLeft");
    await expect(tree.getByText("WHO", { exact: true })).toBeHidden();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    await expect(tree.getByRole("row", { name: "WHO" })).toBeFocused();
  });

  test("FauPicker: the popover's Assumption waits for a confidence, then closes on it", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    const trigger = page.getByRole("button", {
      name: "F/A/U of Rent: Unclassified",
    });
    await trigger.click();
    const popover = page.getByRole("dialog", { name: "F/A/U of Rent" });
    await expect(popover).toBeVisible();
    expect(await placement(popover, "desktop")).toBe("floating");
    await popover.getByRole("radio", { name: "Assumption" }).click();
    await popover.getByRole("radio", { name: "High" }).click();
    await expect(popover).toBeHidden();
    await expect(
      page.getByRole("button", { name: "F/A/U of Rent: Assumption · High" }),
    ).toBeFocused();
  });

  test("FauPicker: Unknown on a number asks, and clears the value", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    await page
      .getByRole("button", { name: "F/A/U of Rent: Unclassified" })
      .click();
    const popover = page.getByRole("dialog", { name: "F/A/U of Rent" });
    await popover.getByRole("radio", { name: "Unknown" }).click();
    const alert = page.getByRole("alertdialog");
    await expect(alert.getByRole("button", { name: "Cancel" })).toBeFocused();
    await alert.getByRole("button", { name: "Mark Unknown" }).click();
    await expect(page.getByRole("textbox", { name: "Rent" })).toHaveValue("");
    await expect(
      page.getByRole("button", { name: "F/A/U of Rent: Unknown" }),
    ).toBeVisible();
  });

  test("MentionTextArea: the list opens under the field; ↓ and Enter write the name", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    const field = page.getByRole("textbox", { name: "Comment" });
    await field.click();
    await page.keyboard.type("Thanks @");
    const list = page.getByRole("listbox", { name: "Members" });
    await expect(list).toBeVisible();
    const [fieldBox, listBox] = await Promise.all([
      field.boundingBox(),
      list.boundingBox(),
    ]);
    expect(listBox?.y ?? 0).toBeGreaterThanOrEqual(
      (fieldBox?.y ?? 0) + (fieldBox?.height ?? 0) - 1,
    );
    await page.keyboard.type("k");
    await page.keyboard.press("Enter");
    await expect(field).toHaveValue("Thanks @Kenji Sato ");
    await expect(field).toBeFocused();
    await expect(page.getByText("Mentions: Kenji Sato")).toBeVisible();
  });

  test("MentionTextArea on a phone: a tray with its own input", async ({
    page,
  }) => {
    await openGallery(page, "mobile");
    const field = page.getByRole("textbox", { name: "Comment" });
    await field.click();
    await page.keyboard.type("@");
    const tray = page.getByRole("dialog", { name: "Members" });
    expect(await placement(tray.locator("xpath=.."), "mobile")).toBe("tray");
    await expect(
      tray.getByRole("textbox", { name: "Search members" }),
    ).toBeFocused();
    await page.keyboard.type("pa");
    await tray.getByRole("option", { name: "Paolo Gonzaga" }).click();
    await expect(field).toHaveValue("@Paolo Gonzaga ");
  });

  for (const [width, form] of [
    ["desktop", "column"],
    ["tablet", "drawer"],
    ["mobile", "tray"],
  ] as const) {
    test(`Panel at ${width} is a ${form}`, async ({ page }) => {
      await openGallery(page, width);
      const trigger = page.getByRole("button", { name: "Open comments" });
      await trigger.click();
      const viewport = widths[width];
      if (form === "column") {
        const panel = page.getByRole("complementary", { name: "Comments" });
        await expect(panel).toBeFocused();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        expect((await panel.boundingBox())?.width).toBe(360);
        await page.keyboard.press("Escape");
        await expect(panel).toBeHidden();
        await expect(trigger).toBeFocused();
        return;
      }
      const dialog = page.getByRole("dialog", { name: "Comments" });
      await expect(dialog).toBeVisible();
      const sheet = dialog.locator("xpath=..");
      await settled(sheet);
      const box = await sheet.boundingBox();
      if (form === "drawer") {
        // The right edge, the window's height, 06 layout.side-panel-width wide.
        expect(Math.round((box?.x ?? 0) + (box?.width ?? 0))).toBe(
          viewport.width,
        );
        expect(Math.round(box?.height ?? 0)).toBe(viewport.height);
        expect(Math.round(box?.width ?? 0)).toBe(360);
      } else {
        expect(await placement(dialog, "mobile")).toBe("tray");
      }
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
    });
  }

  test("QuestionCard: pressing a quiet question opens it, its answer focused in the middle of the view", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    await page
      .getByRole("region", { name: "QuestionCard" })
      .getByRole("button", { name: "PROBLEM" })
      .click();
    const answer = page.getByRole("textbox", { name: "Answer PROBLEM" });
    await expect(answer).toBeFocused();
    const card = page.getByRole("region", { name: "PROBLEM", exact: true });
    // 06 layout.focus-anchor: the card's middle at half the window's height.
    await expect(async () => {
      const box = await card.boundingBox();
      const middle = (box?.y ?? 0) + (box?.height ?? 0) / 2;
      expect(Math.abs(middle - widths.desktop.height / 2)).toBeLessThanOrEqual(
        2,
      );
    }).toPass();
  });

  for (const theme of themes) {
    test(`Slide: the PDF's sizes in shares of its width, light in the ${theme} theme`, async ({
      page,
    }) => {
      await openGallery(page, "desktop");
      await choose(page, "Theme", theme);
      const slide = page
        .getByRole("region", { name: "Business model" })
        .first();
      await slide.scrollIntoViewIfNeeded();
      const width = (await slide.boundingBox())?.width ?? 0;
      const scale = width / 960;
      // 06 semantic.print: the number slide's title 32pt, its figures 48pt.
      const heading = slide.getByRole("heading", { name: "Business model" });
      const fontSize = await heading.evaluate((node) =>
        Number.parseFloat(getComputedStyle(node).fontSize),
      );
      expect(Math.abs(fontSize - 32 * scale)).toBeLessThan(0.5);
      const price = slide.getByText("₱450", { exact: true });
      const figure = await price.evaluate((node) =>
        Number.parseFloat(getComputedStyle(node).fontSize),
      );
      expect(Math.abs(figure - 48 * scale)).toBeLessThan(0.5);
      // A value never breaks: one line.
      const lineHeight = await price.evaluate((node) =>
        Number.parseFloat(getComputedStyle(node).lineHeight),
      );
      expect((await price.boundingBox())?.height ?? 0).toBeLessThan(
        lineHeight * 1.5,
      );
      // The page's light colour at every theme (06 semantic.print.color.page).
      await expect(slide).toHaveCSS("background-color", "rgb(244, 245, 248)");
      await expect(heading).toHaveCSS("color", "rgb(21, 26, 44)");
    });
  }

  for (const width of ["mobile", "desktop"] as const) {
    for (const theme of themes) {
      test(`open FauPicker, mention list and Panel pass axe: ${width}, ${theme}`, async ({
        page,
      }) => {
        await openGallery(page, width);
        await choose(page, "Theme", theme);
        const check = async (what: string) => {
          const { violations } = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
            .analyze();
          expect(
            violations.map((violation) => ({
              what,
              id: violation.id,
              targets: violation.nodes.map((node) => node.target.join(" ")),
            })),
          ).toEqual([]);
        };
        if (width === "desktop") {
          await page
            .getByRole("button", { name: "F/A/U of Rent: Unclassified" })
            .click();
          await settled(frameOf(page.getByRole("dialog")));
          await check("FauPicker");
          await page.keyboard.press("Escape");
          await expect(page.getByRole("dialog")).toBeHidden();
        }
        await page.getByRole("textbox", { name: "Comment" }).click();
        await page.keyboard.type("@");
        const members = page.getByRole(
          width === "mobile" ? "dialog" : "listbox",
          { name: "Members" },
        );
        await expect(members).toBeVisible();
        // Checked once still: colours mid-animation are not the ones shown.
        await settled(members.locator("xpath=.."));
        await check("MentionTextArea");
        await page.keyboard.press("Escape");
        await page.getByRole("button", { name: "Open comments" }).click();
        const panel = page
          .getByRole("complementary", { name: "Comments" })
          .or(page.getByRole("dialog", { name: "Comments" }));
        await expect(panel).toBeVisible();
        await settled(panel.locator("xpath=.."));
        await check("Panel");
      });
    }
  }
});

// The frame and the layout patterns (design-spec 4.1・4.3・6.0.1): where their parts land
// at each width.

type Box = { x: number; y: number; width: number; height: number };

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("not on screen");
  return box;
}

async function openPattern(
  page: Page,
  width: WidthName,
  scale: (typeof scales)[number],
) {
  await openGallery(page, width);
  await choose(page, "Scale", scale);
}

/** Scrolls the section's top under the gallery's toolbar, where a screen's top would be. */
async function showSection(page: Page, name: string) {
  await region(page, name).evaluate((node) => {
    node.scrollIntoView({ block: "start" });
  });
}

/**
 * A phone's main action in its bar across the bottom: the bar as wide as the pattern's
 * box (4.3「主要な操作は下部に固定する」).
 */
async function inPhoneBar(button: Locator, box: Locator) {
  const [bar, outer] = [
    await boxOf(button.locator("xpath=..")),
    await boxOf(box),
  ];
  expect(Math.abs(bar.width - outer.width)).toBeLessThanOrEqual(2);
}

/** `a` and `b` side by side: `b` to the right, their tops level. */
async function sideBySide(a: Locator, b: Locator) {
  const [left, right] = [await boxOf(a), await boxOf(b)];
  expect(right.x).toBeGreaterThanOrEqual(left.x + left.width);
  expect(Math.abs(right.y - left.y)).toBeLessThanOrEqual(2);
}

/** Each one under the one before it, in one column. */
async function stacked(...locators: Locator[]) {
  const boxes = await Promise.all(locators.map(boxOf));
  for (const [index, box] of boxes.entries()) {
    const previous = boxes[index - 1];
    if (previous === undefined) continue;
    expect(box.y).toBeGreaterThanOrEqual(previous.y + previous.height);
    expect(Math.abs(box.x - previous.x)).toBeLessThanOrEqual(2);
  }
}

test.describe("the frame follows the width (design-spec 4.3・6.0.1)", () => {
  test("desktop: the sidebar with names, the breadcrumbs, the panel docked beside the body", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    const frame = region(page, frameSection);
    await showSection(page, frameSection);
    const nav = frame.getByRole("navigation", { name: "Main" });
    // 06 layout.sidebar-width.
    expect(Math.round((await boxOf(nav)).width)).toBe(240);
    await expect(nav.getByText("Ideas", { exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Ideas" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(frame.getByRole("button", { name: "More" })).toBeHidden();
    await expect(
      frame.getByRole("list", { name: "Frame breadcrumbs" }),
    ).toBeVisible();
    await expect(
      frame.getByRole("link", { name: "Back to Validation" }),
    ).toBeHidden();
    // 11's Focus switch sits in the header, beside the save state.
    const header = frame.locator("header");
    await expect(header.getByRole("switch", { name: "Focus" })).toBeVisible();
    await expect(header.getByRole("status")).toHaveText("Saved");

    // The panel is a column at the body's right, not over it.
    await header.getByRole("button", { name: /^Comments/ }).click();
    const panel = frame.getByRole("complementary", { name: "Comments" });
    await expect(panel).toBeVisible();
    await sideBySide(frame.getByRole("main"), panel);
    // 06 layout.side-panel-width.
    expect(Math.round((await boxOf(panel)).width)).toBe(360);
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  });

  test("desktop: links go through the router; the workspace opens M7", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    const frame = region(page, frameSection);
    await showSection(page, frameSection);
    await frame
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Decision Log" })
      .click();
    await expect(
      frame.getByText("RouterProvider moved to: /w/demo/decisions"),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/dev/components");
    await frame.getByRole("button", { name: "BCDX, switch workspace" }).click();
    await expect(
      frame.getByText("RouterProvider moved to: Switch workspace"),
    ).toBeVisible();
    await frame.getByRole("button", { name: "Ana Reyes" }).click();
    await page.getByRole("menuitem", { name: "Account" }).click();
    await expect(
      frame.getByText("RouterProvider moved to: /account"),
    ).toBeVisible();
  });

  test("tablet: icons only, named in tooltips; the panel is a drawer", async ({
    page,
  }) => {
    await openGallery(page, "tablet");
    const frame = region(page, frameSection);
    await showSection(page, frameSection);
    const nav = frame.getByRole("navigation", { name: "Main" });
    // 06 layout.sidebar-width-collapsed.
    expect(Math.round((await boxOf(nav)).width)).toBe(64);
    // The name is only read: a 1px clipped box beside the icon.
    expect(
      (await boxOf(nav.getByText("Ideas", { exact: true }))).width,
    ).toBeLessThanOrEqual(1);
    await nav.getByRole("link", { name: "Dashboard" }).focus();
    await page.keyboard.press("Tab");
    await expect(nav.getByRole("link", { name: "Ideas" })).toBeFocused();
    await expect(page.getByRole("tooltip")).toHaveText("Ideas");
    await page.keyboard.press("Escape");
    await expect(frame.getByRole("button", { name: "More" })).toBeHidden();
    await frame
      .locator("header")
      .getByRole("button", { name: /^Comments/ })
      .click();
    const drawer = page.getByRole("dialog", { name: "Comments" });
    await expect(drawer).toBeVisible();
    await settled(drawer.locator("xpath=.."));
    const box = await boxOf(drawer.locator("xpath=.."));
    expect(Math.round(box.x + box.width)).toBe(widths.tablet.width);
  });

  test("phone: the TabBar under the body, ← in the header, the bottom bar on the TabBar", async ({
    page,
  }) => {
    await openGallery(page, "mobile");
    const frame = region(page, frameSection);
    await showSection(page, frameSection);
    const tabs = frame.getByRole("navigation", { name: "Main" });
    await expect(tabs.getByRole("link")).toHaveCount(4);
    await expect(tabs.getByRole("button", { name: "More" })).toBeVisible();
    await expect(tabs.getByText("Self Analysis")).toBeVisible();
    await expect(
      frame.getByRole("button", { name: "BCDX, switch workspace" }),
    ).toBeHidden();
    await expect(
      frame.getByRole("link", { name: "Back to Validation" }),
    ).toBeVisible();
    await expect(
      frame.getByRole("list", { name: "Frame breadcrumbs" }),
    ).toBeHidden();
    // Saved keeps its mark and gives up its word on a phone (4.3).
    const status = frame.locator("header").getByRole("status");
    await expect(status).toHaveText("Saved");
    expect((await boxOf(status)).width).toBeLessThan(40);
    await expect(frame.getByRole("switch", { name: "Focus" })).toBeHidden();

    // The frame fills the window: the TabBar on its bottom edge, the question form's bar
    // resting on the TabBar (4.3).
    const tabBox = await boxOf(tabs);
    expect(Math.round(tabBox.y + tabBox.height)).toBe(widths.mobile.height);
    // 06 layout.tab-bar-height.
    expect(Math.round(tabBox.height)).toBe(64);
    const next = frame.getByRole("button", { name: "Next question" });
    const bar = next.locator("xpath=..");
    const barBox = await boxOf(bar);
    expect(Math.round(barBox.y + barBox.height)).toBe(Math.round(tabBox.y));

    // More opens the rest in a tray.
    await tabs.getByRole("button", { name: "More" }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    expect(await placement(menu, "mobile")).toBe("tray");
    await page.getByRole("menuitem", { name: "Decision Log" }).click();
    await expect(
      frame.getByText("RouterProvider moved to: /w/demo/decisions"),
    ).toBeVisible();
  });

  test("phone: Couldn't save keeps its words, with Retry (4.3)", async ({
    page,
  }) => {
    await openGallery(page, "mobile");
    const frame = region(page, frameSection);
    await frame
      .getByRole("radiogroup", { name: "Save state" })
      .getByRole("radio", { name: "Failed" })
      .click();
    await showSection(page, frameSection);
    const header = frame.locator("header");
    await expect(header.getByText("Couldn't save")).toBeVisible();
    expect(
      (await boxOf(header.getByText("Couldn't save"))).width,
    ).toBeGreaterThan(40);
    await expect(header.getByRole("button", { name: "Retry" })).toBeVisible();
  });

  test("phone: the tab names keep the tab-label size at both scales (4.3)", async ({
    page,
  }) => {
    const sizes: string[] = [];
    for (const scale of scales) {
      await openGallery(page, "mobile");
      await choose(page, "Scale", scale);
      const tab = region(page, frameSection)
        .getByRole("navigation", { name: "Main" })
        .getByRole("link", { name: "Ideas" });
      await tab.scrollIntoViewIfNeeded();
      sizes.push(
        await tab.evaluate(
          (node) => getComputedStyle(node.children[1] as Element).fontSize,
        ),
      );
    }
    // 06 typography.tab-label: 11px.
    expect(sizes).toEqual(["11px", "11px"]);
  });

  test("phone, large scale: the tab names fit without being cut short", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/dev/components");
    await choose(page, "Scale", "large");
    const tabs = region(page, frameSection).getByRole("navigation", {
      name: "Main",
    });
    await tabs.scrollIntoViewIfNeeded();
    // Each name stays whole inside its tab, on two lines at most, and the tab keeps its
    // height (the unread badge may hang past the icon's corner).
    for (const tab of await tabs.locator("a, button").all()) {
      const fit = await tab.evaluate((node) => {
        // The icon, then the name (then the count, if any).
        const label = node.children[1] as HTMLElement;
        const lineHeight = Number.parseFloat(
          getComputedStyle(label).lineHeight,
        );
        return {
          name: label.textContent,
          inside: label.scrollWidth <= label.clientWidth,
          lines: Math.round(label.getBoundingClientRect().height / lineHeight),
          tall: node.scrollHeight <= node.clientHeight,
        };
      });
      expect(fit.inside, fit.name ?? "").toBe(true);
      expect(fit.lines, fit.name ?? "").toBeLessThanOrEqual(2);
      expect(fit.tall, fit.name ?? "").toBe(true);
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("the patterns follow the width (design-spec 4.1)", () => {
  // At both scales: a phone and a tablet use the large one, whose larger parts must keep
  // the same arrangement.
  for (const [width, scale] of (Object.keys(widths) as WidthName[]).flatMap(
    (name) => scales.map((each) => [name, each] as const),
  )) {
    const isDesktop = width === "desktop";
    const isPhone = width === "mobile";

    test(`A HubPattern at ${width}, ${scale}`, async ({ page }) => {
      await openPattern(page, width, scale);
      const hub = region(page, "HubPattern");
      await showSection(page, "HubPattern");
      const block = (name: string) =>
        hub.getByRole("heading", { name, exact: true });
      if (isDesktop) {
        // The main column and the side column, each keeping the listed order.
        await sideBySide(block("Next steps"), block("Sections"));
        await stacked(block("Next steps"), block("Checks"), block("Summary"));
        await stacked(block("Sections"), block("Decisions"));
      } else {
        await stacked(
          block("Next steps"),
          block("Checks"),
          block("Sections"),
          block("Summary"),
          block("Decisions"),
        );
      }
      const decide = await boxOf(hub.getByRole("button", { name: "Decide" }));
      const metrics = await boxOf(hub.getByText("Startup costs"));
      if (isPhone) {
        // Fixed to the bottom: in view while the blocks above it scroll.
        expect(decide.y + decide.height).toBeLessThanOrEqual(
          widths.mobile.height,
        );
        expect(decide.y).toBeGreaterThan(widths.mobile.height - 64);
      } else {
        // In the header with the title (beside it, or under it when the title's line
        // is long), above the numbers.
        expect(decide.y + decide.height).toBeLessThanOrEqual(metrics.y);
      }
    });

    test(`B FocusPattern at ${width}, ${scale}`, async ({ page }) => {
      await openPattern(page, width, scale);
      const focus = region(page, "FocusPattern");
      await showSection(page, "FocusPattern");
      // The Well holding the material.
      const material = await boxOf(
        focus
          .getByText("Break-even 6.9 / day · 4 of 6 checks done")
          .locator("xpath=ancestor::div[1]"),
      );
      const save = await boxOf(
        focus.getByRole("button", { name: "Save decision" }),
      );
      // One reading column (06 layout.reading-column-max), the action under it.
      expect(material.width).toBeLessThanOrEqual(720);
      expect(save.y).toBeGreaterThan(material.y + material.height);
      if (isPhone) {
        const bar = await boxOf(
          focus
            .getByRole("button", { name: "Save decision" })
            .locator("xpath=.."),
        );
        const box = await boxOf(focus.locator("xpath=div").first());
        expect(Math.abs(bar.width - box.width)).toBeLessThanOrEqual(2);
      } else {
        // At the end of the column.
        expect(
          Math.abs(save.x + save.width - (material.x + material.width)),
        ).toBeLessThanOrEqual(2);
      }
    });

    test(`C QuestionFormPattern at ${width}, ${scale}`, async ({ page }) => {
      await openPattern(page, width, scale);
      const form = region(page, "QuestionFormPattern");
      await showSection(page, "QuestionFormPattern");
      const card = (name: string) =>
        form.getByRole("region", { name, exact: true });
      if (isPhone) {
        await expect(card("Form WHO")).toBeVisible();
        await expect(card("Form WHY THEM")).toHaveCount(0);
        await expect(form.getByRole("switch", { name: "Focus" })).toHaveCount(
          0,
        );
        await form.getByRole("button", { name: "Next question" }).click();
        await expect(card("Form WHY THEM")).toBeVisible();
        await expect(card("Form WHO")).toHaveCount(0);
      } else {
        await stacked(
          card("Form WHO"),
          card("Form WHY THEM"),
          card("Form PROBLEM"),
        );
        await expect(form.getByRole("switch", { name: "Focus" })).toBeVisible();
        // Ctrl+↓ opens the next question with its answer focused, in the middle.
        await form.getByRole("textbox", { name: "Form answer WHO" }).click();
        await page.keyboard.press("Control+ArrowDown");
        const next = form.getByRole("textbox", {
          name: "Form answer WHY THEM",
        });
        await expect(next).toBeFocused();
        await expect(
          form.getByRole("textbox", { name: "Form answer WHO" }),
        ).toHaveCount(0);
        // Focus off opens them all.
        await form.getByText("Focus", { exact: true }).click();
        await expect(form.getByRole("textbox")).toHaveCount(3);
      }
    });

    test(`D ListDetailPattern at ${width}, ${scale}`, async ({ page }) => {
      await openPattern(page, width, scale);
      const pattern = region(page, "ListDetailPattern");
      await showSection(page, "ListDetailPattern");
      const list = pattern.getByRole("grid", { name: "Pattern ideas" });
      const detail = pattern.getByRole("heading", {
        name: "Piaya Gift Box Delivery",
      });
      const create = pattern.getByRole("button", { name: "New idea" });
      if (isDesktop) {
        // 06 layout.list-pane-width, the detail at its right.
        expect(Math.round((await boxOf(list)).width)).toBe(352);
        expect((await boxOf(detail)).x).toBeGreaterThan(
          (await boxOf(list)).x + 352,
        );
        await expect(create).toBeVisible();
        return;
      }
      // One pane at a time across the width: the detail, then ← back to the list.
      await expect(list).toHaveCount(0);
      await pattern.getByRole("button", { name: "Back to Ideas" }).click();
      await expect(list).toBeVisible();
      await expect(detail).toHaveCount(0);
      const listBox = await boxOf(list);
      const patternBox = await boxOf(pattern.locator("xpath=div").first());
      expect(listBox.width).toBeGreaterThan(patternBox.width * 0.85);
      const action = await boxOf(create);
      if (isPhone) {
        // Floating at the bottom right, after the list.
        expect(action.y).toBeGreaterThan(listBox.y + listBox.height);
        expect(
          Math.abs(action.x + action.width - (listBox.x + listBox.width)),
        ).toBeLessThanOrEqual(2);
      } else {
        expect(action.y).toBeLessThan(listBox.y);
      }
    });

    test(`E CardComparePattern at ${width}, ${scale}`, async ({ page }) => {
      await openPattern(page, width, scale);
      const pattern = region(page, "CardComparePattern");
      await showSection(page, "CardComparePattern");
      const card = (name: string) => pattern.getByText(name, { exact: true });
      const add = pattern.getByRole("button", { name: "Add competitor" });
      const box = pattern.locator("xpath=div").first();
      if (isPhone) {
        await stacked(card("Airport kiosk"), card("Bakeshop boxes"));
        await expect(
          pattern.getByRole("radiogroup", { name: "View" }),
        ).toHaveCount(0);
        // The main action under the cards, in the bar across the bottom.
        expect((await boxOf(add)).y).toBeGreaterThan(
          (await boxOf(card("Home bakers"))).y,
        );
        await inPhoneBar(add, box);
        return;
      }
      // The main action beside the title, above the cards.
      expect((await boxOf(add)).y).toBeLessThan(
        (await boxOf(card("Airport kiosk"))).y,
      );
      await sideBySide(card("Airport kiosk"), card("Bakeshop boxes"));
      await pattern
        .getByRole("radiogroup", { name: "View" })
        .getByRole("radio", { name: "Table" })
        .click();
      await expect(
        pattern.getByRole("grid", { name: "Compared in a table" }),
      ).toBeVisible();
      await expect(
        pattern.getByRole("grid", { name: "Compared rivals" }),
      ).toHaveCount(0);
    });

    test(`F WorksheetPattern at ${width}, ${scale}`, async ({ page }) => {
      await openPattern(page, width, scale);
      const pattern = region(page, "WorksheetPattern");
      await showSection(page, "WorksheetPattern");
      const inputs = pattern.getByRole("grid", { name: "Worksheet costs" });
      if (isDesktop) {
        const results = pattern.getByRole("complementary", { name: "Totals" });
        await sideBySide(inputs, results);
        expect(Math.round((await boxOf(results)).width)).toBe(360);
        return;
      }
      // The table across the width; the summary bar opens the results.
      const summary = pattern.getByRole("button", {
        name: /Startup total ₱19,500/,
      });
      expect((await boxOf(summary)).y).toBeGreaterThan((await boxOf(inputs)).y);
      await summary.click();
      const dialog = page.getByRole("dialog", { name: "Totals" });
      await expect(dialog).toBeVisible();
      await settled(dialog.locator("xpath=.."));
      const box = await boxOf(dialog.locator("xpath=.."));
      const viewport = widths[width];
      if (isPhone) {
        expect(await placement(dialog, width)).toBe("tray");
      } else {
        // The drawer from the right (4.1 F).
        expect(Math.round(box.x + box.width)).toBe(viewport.width);
        expect(box.width).toBeLessThan(viewport.width / 2);
      }
    });

    test(`G StepsPattern at ${width}, ${scale}`, async ({ page }) => {
      await openPattern(page, width, scale);
      const pattern = region(page, "StepsPattern");
      await showSection(page, "StepsPattern");
      const steps = pattern.getByRole("list", { name: "Pattern import steps" });
      const before = pattern.getByRole("heading", {
        name: "Current",
        exact: true,
      });
      const after = pattern.getByRole("heading", {
        name: "From AI",
        exact: true,
      });
      expect((await boxOf(steps)).y).toBeLessThan((await boxOf(before)).y);
      if (isPhone) await stacked(before, after);
      else await sideBySide(before, after);
      // Apply under the diff: fixed to the bottom on a phone (6.7), at the end of the
      // column on wider screens.
      const apply = pattern.getByRole("button", { name: "Apply 1 change" });
      const afterBox = await boxOf(after);
      const applyBox = await boxOf(apply);
      expect(applyBox.y).toBeGreaterThan(afterBox.y + afterBox.height);
      if (isPhone) {
        await inPhoneBar(apply, pattern.locator("xpath=div").first());
      } else {
        expect(
          Math.abs(applyBox.x + applyBox.width - (afterBox.x + afterBox.width)),
        ).toBeLessThan(afterBox.width);
      }
    });

    test(`H SettingsPattern at ${width}, ${scale}`, async ({ page }) => {
      await openPattern(page, width, scale);
      const pattern = region(page, "SettingsPattern");
      await showSection(page, "SettingsPattern");
      const group = pattern.getByRole("region", { name: "Profile" });
      const name = group.getByRole("heading", { name: "Profile" });
      const field = group.getByRole("textbox", { name: "Display name" });
      const [nameBox, fieldBox] = [await boxOf(name), await boxOf(field)];
      if (isPhone) {
        expect(fieldBox.y).toBeGreaterThan(nameBox.y + nameBox.height);
      } else {
        expect(fieldBox.x).toBeGreaterThan(nameBox.x + nameBox.width);
      }
    });

    test(`I PresentationPattern at ${width}, ${scale}`, async ({ page }) => {
      await openPattern(page, width, scale);
      const pattern = region(page, "PresentationPattern");
      await showSection(page, "PresentationPattern");
      const thumbnails = pattern.getByRole("grid", { name: "Pattern slides" });
      const download = pattern.getByRole("button", { name: "Download PDF" });
      if (isPhone) {
        await expect(thumbnails).toHaveCount(0);
        await stacked(
          pattern.getByRole("region", { name: "Piaya Gift Box Co." }),
          pattern.getByRole("region", { name: "Problem" }),
        );
        // The slides are taller than the window: the bar holds to its bottom edge.
        const button = await boxOf(download);
        expect(button.y + button.height).toBeLessThanOrEqual(
          widths.mobile.height,
        );
        expect(button.y).toBeGreaterThan(widths.mobile.height - 64);
        await inPhoneBar(download, pattern.locator("xpath=div").first());
        await expect(pattern.getByText(/^Say:/)).toBeAttached();
        return;
      }
      expect((await boxOf(download)).y).toBeLessThan(
        (await boxOf(thumbnails)).y,
      );
      const slide = pattern.getByRole("region", { name: "Business model" });
      await sideBySide(thumbnails, slide);
      // 06 layout.thumbnail-column-width.
      expect(Math.round((await boxOf(thumbnails)).width)).toBe(160);
      expect((await boxOf(pattern.getByText(/^Say:/))).y).toBeGreaterThan(
        (await boxOf(slide)).y + (await boxOf(slide)).height,
      );
      await thumbnails.getByText("2 Problem").click();
      await expect(
        pattern.getByRole("region", { name: "Problem" }),
      ).toBeVisible();
    });

    test(`J PublicPattern at ${width}, ${scale}`, async ({ page }) => {
      await openPattern(page, width, scale);
      const pattern = region(page, "PublicPattern");
      await showSection(page, "PublicPattern");
      const signIn = pattern.getByRole("link", { name: "Sign in" });
      const title = pattern.getByRole("heading", {
        name: "Start a local business, one step at a time",
      });
      const example = pattern
        .getByText("Validate an idea before you spend on it.")
        .locator("xpath=ancestor::div[1]");
      const privacy = pattern.getByRole("link", { name: "Privacy" });
      expect((await boxOf(signIn)).y).toBeLessThan((await boxOf(title)).y);
      expect((await boxOf(privacy)).y).toBeGreaterThan(
        (await boxOf(example)).y + (await boxOf(example)).height,
      );
      // The hero's two columns, one where the width runs out.
      if (isPhone) await stacked(title, example);
      else await sideBySide(title, example);
    });
  }

  test("D without a detail (8): the list alone, in the reading column", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    const pattern = region(page, "ListDetailPattern");
    const list = pattern.getByRole("grid", { name: "Pattern notifications" });
    await list.scrollIntoViewIfNeeded();
    // 06 layout.reading-column-max, less the page's gutters.
    expect((await boxOf(list)).width).toBeLessThanOrEqual(720);
    await expect(
      pattern.getByRole("button", { name: "Back to Ideas" }),
    ).toHaveCount(0);
  });

  test("PageFrame: the main landmark, the action fixed under the form on a phone", async ({
    page,
  }) => {
    await openGallery(page, "mobile");
    const pattern = region(page, "PageFrame");
    await showSection(page, "PageFrame");
    const main = pattern.getByRole("main");
    await expect(main).toBeVisible();
    // PageFrame fills the window's height, so the bar is held to the window's bottom
    // edge however short the form is.
    const mainBox = await boxOf(main);
    expect(Math.round(mainBox.height)).toBeGreaterThanOrEqual(
      widths.mobile.height,
    );
    const button = await boxOf(main.getByRole("button", { name: "Continue" }));
    expect(button.y + button.height).toBeLessThanOrEqual(widths.mobile.height);
    expect(button.y).toBeGreaterThan(widths.mobile.height - 64);
  });

  test("open WorksheetPattern drawer passes axe", async ({ page }) => {
    await openGallery(page, "tablet");
    await showSection(page, "WorksheetPattern");
    await region(page, "WorksheetPattern")
      .getByRole("button", { name: /Startup total/ })
      .click();
    const dialog = page.getByRole("dialog", { name: "Totals" });
    await expect(dialog).toBeVisible();
    await settled(dialog.locator("xpath=.."));
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
});
