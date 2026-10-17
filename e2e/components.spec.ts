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
/** A size M Button: 06 component.button.height.M (docs/mockups), target-min on large. */
const buttonHeightM = { medium: 36, large: 44 };
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
    // A table on tablet and wider; lined rows on a phone (a grid either way).
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
  ["MetricTile", "MetricTile and MetricGroup", (s) => s.getByText("₱169,500+")],
  [
    "MetricGroup",
    "MetricTile and MetricGroup",
    (s) => s.getByRole("group", { name: "Key numbers band" }),
  ],
  ["RowList", "RowList", (s) => s.getByRole("list", { name: "Next steps" })],
  [
    "DescriptionList",
    "DescriptionList",
    (s) =>
      s.getByText("Office workers in Bacolod who buy pasalubong for family."),
  ],
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
    (s) => s.getByRole("heading", { name: "Log in to moonx" }),
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
    (s) => s.getByRole("button", { name: "Log in" }),
  ],
  [
    "AlertBanner",
    "AlertBanner, DiffTextArea and SettingsList",
    (s) => s.getByRole("link", { name: "Update template" }),
  ],
  [
    "DiffTextArea",
    "AlertBanner, DiffTextArea and SettingsList",
    (s) => s.getByRole("textbox", { name: "Imported · you can edit" }),
  ],
  [
    "SettingsList",
    "AlertBanner, DiffTextArea and SettingsList",
    (s) => s.getByRole("list", { name: "Gallery members" }),
  ],
  [
    "IdeaPreview",
    "IdeaPreview, PhaseRoute and CostPreview",
    (s) => s.getByText("An example idea in validation."),
  ],
  [
    "PhaseRoute",
    "IdeaPreview, PhaseRoute and CostPreview",
    (s) => s.getByRole("heading", { name: "Self Analysis" }),
  ],
  [
    "CostPreview",
    "IdeaPreview, PhaseRoute and CostPreview",
    (s) => s.getByRole("img", { name: "Example startup costs" }),
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
      const listbox = page.getByRole("listbox", { name: "Currency" });
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

  test("TableView on a phone: a line per row, no table", async ({ page }) => {
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
      // The page's white at every theme (06 semantic.print.color.page, s23-deck.html).
      await expect(slide).toHaveCSS("background-color", "rgb(255, 255, 255)");
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
    // The bar is the button's nearest box that sets the keyboard's inset.
    await boxOf(button.locator("xpath=ancestor::div[@style][1]")),
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
    // 06 layout.sidebar-width (moon-base.css .app).
    expect(Math.round((await boxOf(nav)).width)).toBe(236);
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
    const bar = next.locator("xpath=ancestor::div[@style][1]");
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
    // 06 typography.tab-label: 10.5px (moon-base.css .tabbar a).
    expect(sizes).toEqual(["10.5px", "10.5px"]);
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
      // One form column (06 layout.form-column-max), the action under it.
      expect(material.width).toBeLessThanOrEqual(696);
      expect(save.y).toBeGreaterThan(material.y + material.height);
      if (isPhone) {
        await inPhoneBar(
          focus.getByRole("button", { name: "Save decision" }),
          focus.locator("xpath=div").first(),
        );
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
        // The question being answered is a card wider than the column by 16px each
        // side (06 layout.question-form.card-outset); the quiet rows line up under it.
        const focused = await boxOf(card("Form WHO"));
        const quiet = await boxOf(card("Form WHY THEM"));
        const last = await boxOf(card("Form PROBLEM"));
        expect(quiet.y).toBeGreaterThanOrEqual(focused.y + focused.height);
        expect(Math.round(quiet.x - focused.x)).toBe(16);
        expect(Math.round(focused.width - quiet.width)).toBe(32);
        await stacked(card("Form WHY THEM"), card("Form PROBLEM"));
        expect(last.y).toBeGreaterThan(quiet.y);
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
        // The list's pane takes 5 of 5 + 6 of the panes' width, 380px at least
        // (06 layout.list-detail), the title and New idea at its top; the detail at
        // its right.
        const pane = await boxOf(list.locator("xpath=../.."));
        const panes = await boxOf(list.locator("xpath=../../.."));
        expect(
          Math.abs(pane.width - Math.max(380, (panes.width * 5) / 11)),
        ).toBeLessThanOrEqual(1);
        expect((await boxOf(detail)).x).toBeGreaterThan(pane.x + pane.width);
        const action = await boxOf(create);
        expect(action.x + action.width).toBeLessThanOrEqual(
          pane.x + pane.width,
        );
        expect(action.y).toBeLessThan((await boxOf(list)).y);
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
        // Floating at the bottom right, after the list, 16px in from the right edge
        // (06 layout.list-detail.floating-action-offset), 56px square.
        expect(action.y).toBeGreaterThanOrEqual(listBox.y + listBox.height);
        expect(
          Math.round(listBox.x + listBox.width - (action.x + action.width)),
        ).toBe(16);
        expect(Math.round(action.width)).toBe(56);
        expect(Math.round(action.height)).toBe(56);
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
        // The new item stays in place under the title, not fixed to the bottom (4.1).
        expect((await boxOf(add)).y).toBeLessThan(
          (await boxOf(card("Airport kiosk"))).y,
        );
        expect(
          await add.evaluate(
            (node) => node.closest("[style]")?.getAttribute("style") ?? "",
          ),
        ).not.toContain("--");
        await expect(box).toBeVisible();
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
        // A card of the light frame, 288px wide, 40px from the table
        // (06 layout.worksheet, s17-costs.html .totals).
        const [table, card] = [await boxOf(inputs), await boxOf(results)];
        expect(Math.round(card.width)).toBe(288);
        expect(Math.round(card.x - (table.x + table.width))).toBe(40);
        await expect(results).toHaveCSS(
          "border-top-color",
          "rgb(198, 203, 216)",
        );
        await expect(results).toHaveCSS("border-top-left-radius", "12px");
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
      const thumbnails = pattern.getByRole("listbox", { name: "Slides" });
      const download = pattern.getByRole("button", { name: "Download PDF" });
      const slide = pattern.getByRole("region", { name: "Business model" });
      if (isPhone) {
        // The slide on screen alone, the previous and next under it; Download PDF in
        // place on the tools' line, not fixed to the bottom (4.1 I).
        await expect(thumbnails).toHaveCount(0);
        await expect(
          pattern.getByRole("region", { name: "Problem" }),
        ).toHaveCount(0);
        expect((await boxOf(download)).y).toBeLessThan((await boxOf(slide)).y);
        const previous = pattern.getByRole("button", {
          name: "Previous slide",
        });
        expect((await boxOf(previous)).y).toBeGreaterThan(
          (await boxOf(slide)).y,
        );
        await expect(pattern.getByText("3 / 4")).toBeVisible();
        await previous.click();
        await expect(
          pattern.getByRole("region", { name: "Problem" }),
        ).toBeVisible();
        await expect(pattern.getByText("2 / 4")).toBeVisible();
        await expect(pattern.getByText(/^Say:/)).toBeAttached();
        return;
      }
      expect((await boxOf(download)).y).toBeLessThan(
        (await boxOf(thumbnails)).y,
      );
      // The slide at the thumbnails' right, its column's inset 12px lower than theirs
      // (06 layout.presentation: 28 against 16).
      const [left, right] = [await boxOf(thumbnails), await boxOf(slide)];
      expect(right.x).toBeGreaterThan(left.x + left.width);
      expect(Math.round(right.y - left.y)).toBe(12);
      // 06 layout.presentation.thumbnail-column-width, less its insets (12 each side).
      expect(Math.round((await boxOf(thumbnails)).width)).toBe(200 - 2 * 12);
      expect((await boxOf(pattern.getByText(/^Say:/))).y).toBeGreaterThan(
        (await boxOf(slide)).y + (await boxOf(slide)).height,
      );
      await thumbnails.getByRole("option", { name: "2 Problem" }).click();
      await expect(
        pattern.getByRole("region", { name: "Problem" }),
      ).toBeVisible();
    });

    test(`J PublicPattern at ${width}, ${scale}`, async ({ page }) => {
      await openPattern(page, width, scale);
      const pattern = region(page, "PublicPattern");
      await showSection(page, "PublicPattern");
      const logIn = pattern.getByRole("button", { name: "Log in" });
      const title = pattern.getByRole("heading", {
        name: "Start a local business, one step at a time",
      });
      const example = pattern
        .getByText("Validate an idea before you spend on it.")
        .locator("xpath=ancestor::div[1]");
      const privacy = pattern.getByRole("link", { name: "Privacy" });
      expect((await boxOf(logIn)).y).toBeLessThan((await boxOf(title)).y);
      expect((await boxOf(privacy)).y).toBeGreaterThan(
        (await boxOf(example)).y + (await boxOf(example)).height,
      );
      // The hero's two columns (6 : 5), one below 900px (06 layout.public); its
      // columns are centred on each other.
      if (width === "desktop") {
        const [left, right] = [await boxOf(title), await boxOf(example)];
        expect(right.x).toBeGreaterThan(left.x + left.width);
      } else await stacked(title, example);
    });
  }

  test("D without a detail (8): the list alone, in the reading column", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    const pattern = region(page, "ListDetailPattern");
    const list = pattern.getByRole("grid", { name: "Pattern notifications" });
    await list.scrollIntoViewIfNeeded();
    // 06 layout.reading-column-max, with the pane's insets on both sides (its rows
    // reach the pane's edges).
    expect((await boxOf(list)).width).toBeLessThanOrEqual(756 + 2 * 24);
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

test.describe("D and F beside a docked panel (design-spec 4.1・4.3)", () => {
  const section = "AppFrame with a panel beside D and F";

  // Switching arrangements raises no error on the window, such as a ResizeObserver round
  // left with undelivered notifications, which reaches error reporting.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const errors: string[] = [];
      Object.assign(window, { windowErrors: errors });
      window.addEventListener("error", (event) => errors.push(event.message));
    });
  });
  test.afterEach(async ({ page }) => {
    expect(
      await page.evaluate(
        () => (window as unknown as { windowErrors: string[] }).windowErrors,
      ),
    ).toEqual([]);
  });

  /** The window-wide frame of the gallery at `width`, holding `pattern`. */
  async function openPanelFrame(
    page: Page,
    width: number,
    pattern: "ListDetailPattern" | "WorksheetPattern",
  ) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dev/components");
    const frame = region(page, section);
    await frame
      .getByRole("radiogroup", { name: "Pattern D or F beside the panel" })
      .getByRole("radio", { name: pattern === "ListDetailPattern" ? "D" : "F" })
      .click();
    await showSection(page, section);
    return frame;
  }

  /** The detail at the list's right (the list sits under the filter, lower). */
  async function besideList(list: Locator, detail: Locator) {
    const [left, right] = [await boxOf(list), await boxOf(detail)];
    expect(right.x).toBeGreaterThan(left.x + left.width);
  }

  const commentsButton = (frame: Locator) =>
    frame.locator("header").getByRole("button", { name: /^Comments/ });

  /** 💬 docks the panel at the body's right; nothing scrolls sideways (4.3). */
  async function openPanel(frame: Locator) {
    await commentsButton(frame).click();
    const panel = frame.getByRole("complementary", { name: "Comments" });
    await expect(panel).toBeVisible();
    await sideBySide(frame.getByRole("main"), panel);
    expect(
      await frame
        .page()
        .evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        ),
    ).toBeLessThanOrEqual(0);
    return panel;
  }

  test("D at 1024px: one pane while the panel is open; two columns once it closes", async ({
    page,
  }) => {
    const frame = await openPanelFrame(page, 1024, "ListDetailPattern");
    const list = frame.getByRole("grid", { name: "Panel frame ideas" });
    const detail = frame.getByRole("heading", {
      name: "Piaya Gift Box Delivery",
    });
    const back = frame.getByRole("button", { name: "Back to Ideas" });
    // Without the panel, the desktop's two columns at the breakpoint: the list's pane
    // at its minimum (06 layout.list-detail.list-min-width).
    expect(Math.round((await boxOf(list.locator("xpath=../.."))).width)).toBe(
      380,
    );
    await besideList(list, detail);
    await expect(back).toHaveCount(0);

    const panel = await openPanel(frame);
    // The body is 424px: the selected item's detail alone, across the body.
    await expect(list).toHaveCount(0);
    await expect(detail).toBeVisible();
    await expect(back).toBeVisible();
    // The field's frame, as wide as the detail: the body less the page's gutters.
    const field = await boxOf(
      frame
        .getByRole("textbox", { name: "Panel frame summary" })
        .locator("xpath=.."),
    );
    const main = await boxOf(frame.getByRole("main"));
    expect(Math.round(field.width)).toBe(Math.round(main.width) - 2 * 32);

    await panel.getByRole("button", { name: "Close" }).click();
    await expect(panel).toBeHidden();
    await expect(commentsButton(frame)).toBeFocused();
    expect(Math.round((await boxOf(list.locator("xpath=../.."))).width)).toBe(
      380,
    );
    await besideList(list, detail);
    await expect(back).toHaveCount(0);
    // The item chosen before the panel opened is still the one selected.
    await expect(
      list.getByRole("row", { name: "Piaya Gift Box Delivery" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  test("D at 1440px: two columns beside the panel; narrowing keeps the field being typed in", async ({
    page,
  }) => {
    const frame = await openPanelFrame(page, 1440, "ListDetailPattern");
    const list = frame.getByRole("grid", { name: "Panel frame ideas" });
    const detail = frame.getByRole("heading", {
      name: "Piaya Gift Box Delivery",
    });
    await openPanel(frame);
    // The body is wider than 06 layout.two-column-min-width: the list's pane takes its
    // 5 of 5 + 6 of it, at least 380px.
    const body = await boxOf(frame.getByRole("main"));
    expect(Math.round(body.width)).toBeGreaterThanOrEqual(788);
    const pane = await boxOf(list.locator("xpath=../.."));
    expect(
      Math.abs(pane.width - Math.max(380, (body.width * 5) / 11)),
    ).toBeLessThanOrEqual(1);
    await besideList(list, detail);

    const field = frame.getByRole("textbox", { name: "Panel frame summary" });
    await field.click();
    await page.keyboard.type("Same-day boxes");
    await page.setViewportSize({ width: 1024, height: 900 });
    await expect(list).toHaveCount(0);
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("Same-day boxes");
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(list).toBeVisible();
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("Same-day boxes");
  });

  test("D: narrowing while the filter is typed in keeps the list and the field; selecting another item opens it", async ({
    page,
  }) => {
    const frame = await openPanelFrame(page, 1440, "ListDetailPattern");
    const list = frame.getByRole("grid", { name: "Panel frame ideas" });
    const heading = (name: string) => frame.getByRole("heading", { name });
    await openPanel(frame);
    const search = frame.getByRole("searchbox", { name: "Panel frame search" });
    await search.click();
    await page.keyboard.type("bowl");
    await page.setViewportSize({ width: 1024, height: 900 });
    // One pane: the list, where focus was, with the chosen item still selected.
    await expect(heading("Piaya Gift Box Delivery")).toHaveCount(0);
    await expect(list).toBeVisible();
    await expect(search).toBeFocused();
    await expect(search).toHaveValue("bowl");
    await expect(
      list.getByRole("row", { name: "Piaya Gift Box Delivery" }),
    ).toHaveAttribute("aria-selected", "true");
    await list.getByRole("row", { name: "Bacolod Health Bowl" }).click();
    await expect(heading("Bacolod Health Bowl")).toBeVisible();
    await expect(list).toHaveCount(0);
    await expect(
      frame.getByRole("button", { name: "Back to Ideas" }),
    ).toBeVisible();
  });

  test("F at 1024px: the summary bar and the drawer while the panel is open; the results column once it closes", async ({
    page,
  }) => {
    const frame = await openPanelFrame(page, 1024, "WorksheetPattern");
    const inputs = frame.getByRole("grid", { name: "Panel frame costs" });
    const results = frame.getByRole("complementary", {
      name: "Panel frame totals",
    });
    const summary = frame.getByRole("button", {
      name: /Startup total ₱19,500/,
    });
    await sideBySide(inputs, results);
    // 06 layout.worksheet.results-width.
    expect(Math.round((await boxOf(results)).width)).toBe(288);
    await expect(summary).toHaveCount(0);

    const panel = await openPanel(frame);
    await expect(results).toHaveCount(0);
    const inputsBox = await boxOf(inputs);
    const main = await boxOf(frame.getByRole("main"));
    expect(inputsBox.width).toBeGreaterThan(main.width * 0.8);
    // The bar fixed to the bottom of the window, under the inputs.
    const bar = await boxOf(summary.locator("xpath=ancestor::div[@style][1]"));
    expect(bar.y).toBeGreaterThan(inputsBox.y + inputsBox.height);
    expect(Math.round(bar.y + bar.height)).toBe(900);
    await summary.click();
    const dialog = page.getByRole("dialog", { name: "Panel frame totals" });
    await expect(dialog).toBeVisible();
    await settled(dialog.locator("xpath=.."));
    // The drawer from the right (4.1 F), over the docked panel.
    const drawer = await boxOf(dialog.locator("xpath=.."));
    expect(Math.round(drawer.x + drawer.width)).toBe(1024);
    expect(Math.round(drawer.width)).toBe(360);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(panel).toBeVisible();

    await panel.getByRole("button", { name: "Close" }).click();
    await expect(panel).toBeHidden();
    await sideBySide(inputs, results);
    await expect(summary).toHaveCount(0);
  });

  test("F at 1440px: the results column beside the panel; narrowing keeps the field being typed in", async ({
    page,
  }) => {
    const frame = await openPanelFrame(page, 1440, "WorksheetPattern");
    const inputs = frame.getByRole("grid", { name: "Panel frame costs" });
    const results = frame.getByRole("complementary", {
      name: "Panel frame totals",
    });
    await openPanel(frame);
    await sideBySide(inputs, results);
    expect(Math.round((await boxOf(results)).width)).toBe(288);

    const field = frame.getByRole("textbox", { name: "Panel frame cost note" });
    await field.click();
    await page.keyboard.type("Oven is second-hand");
    await page.setViewportSize({ width: 1024, height: 900 });
    await expect(results).toHaveCount(0);
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("Oven is second-hand");
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(results).toBeVisible();
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("Oven is second-hand");
  });
});

test.describe("the keys between questions on each platform (design-spec 4.1 C)", () => {
  // The platform the page reports, as React Aria reads it: userAgentData, then platform.
  const platforms = [
    ["macOS", "MacIntel", "macOS"],
    ["Windows", "Win32", "Windows"],
    ["Linux", "Linux x86_64", "Linux"],
  ] as const;
  for (const [name, platform, uaPlatform] of platforms) {
    test(`${name}: Ctrl+arrows move${name === "macOS" ? ", and so do Ctrl+Option+arrows" : "; Ctrl+Alt+arrows do not"}`, async ({
      page,
    }) => {
      await page.addInitScript(
        ([reported, data]) => {
          Object.defineProperty(Navigator.prototype, "platform", {
            get: () => reported,
          });
          Object.defineProperty(Navigator.prototype, "userAgentData", {
            get: () => ({ platform: data, brands: [], mobile: false }),
          });
        },
        [platform, uaPlatform],
      );
      await openGallery(page, "desktop");
      const form = region(page, "QuestionFormPattern");
      await showSection(page, "QuestionFormPattern");
      const answer = (id: string) =>
        form.getByRole("textbox", { name: `Form answer ${id}` });
      await answer("WHO").click();
      await page.keyboard.press("Control+Alt+ArrowDown");
      if (name === "macOS") {
        await expect(answer("WHY THEM")).toBeFocused();
        await page.keyboard.press("Control+Alt+ArrowUp");
        await expect(answer("WHO")).toBeFocused();
      } else {
        await expect(answer("WHO")).toBeFocused();
      }
      await page.keyboard.press("Control+ArrowDown");
      await expect(answer("WHY THEM")).toBeFocused();
      if (name !== "macOS") {
        // From the second question there is a previous one to move to, and it stays.
        await page.keyboard.press("Control+Alt+ArrowUp");
        await expect(answer("WHY THEM")).toBeFocused();
      }
      await page.keyboard.press("Control+ArrowUp");
      await expect(answer("WHO")).toBeFocused();
    });
  }
});

/** The computed style of an element, by property (getComputedStyle). */
const css = (locator: Locator, ...names: string[]) =>
  locator.evaluate((node, list) => {
    const style = getComputedStyle(node);
    return Object.fromEntries(
      list.map((name) => [name, style.getPropertyValue(name)]),
    );
  }, names);

test.describe("the parts match docs/mockups (Step 22c, design-spec 4.4・4.5)", () => {
  const mockups = "Mockup parts: type, frames, marks and basic parts";
  /** 06 border.default: the mockups' --line-strong. */
  const borderDefault = {
    light: "rgb(198, 203, 216)",
    dark: "rgb(58, 66, 99)",
  };

  for (const theme of themes) {
    test(`desktop, ${theme}: type, frames, marks and sizes are the mockups'`, async ({
      page,
    }) => {
      await openGallery(page, "desktop");
      await choose(page, "Theme", theme);
      await choose(page, "Scale", "medium");
      const section = region(page, mockups);
      await section.scrollIntoViewIfNeeded();

      // Type (06 semantic.typography): body 15/1.55, the hub's title 30/600.
      expect(
        await css(
          section.getByText("Ideas, self analyses and what is due"),
          "font-size",
          "line-height",
        ),
      ).toEqual({ "font-size": "15px", "line-height": "23.25px" });
      expect(
        await css(
          section.getByRole("heading", { name: "BCDX" }),
          "font-size",
          "font-weight",
        ),
      ).toEqual({ "font-size": "30px", "font-weight": "600" });
      expect(
        await css(
          section.getByRole("heading", { name: /^How painful/ }),
          "font-size",
        ),
      ).toEqual({ "font-size": "21px" });

      // Buttons: M 36px with corner 8; secondary and quiet in the medium weight; the
      // secondary frame is the light line.
      const send = section.getByRole("button", { name: "Send invitation" });
      expect((await send.boundingBox())?.height).toBe(36);
      expect(await css(send, "border-top-left-radius", "font-weight")).toEqual({
        "border-top-left-radius": "8px",
        "font-weight": "600",
      });
      expect(
        await css(
          section.getByRole("button", { name: "Resend" }),
          "font-weight",
        ),
      ).toEqual({ "font-weight": "500" });
      expect(
        await css(
          section.getByRole("button", { name: "Edit summary" }),
          "border-top-color",
          "font-weight",
        ),
      ).toEqual({
        "border-top-color": borderDefault[theme],
        "font-weight": "500",
      });
      const logIn = section.getByRole("button", { name: "Log in" });
      expect((await logIn.boundingBox())?.height).toBe(48);
      expect(await css(logIn, "font-size", "border-top-left-radius")).toEqual({
        "font-size": "16px",
        "border-top-left-radius": "10px",
      });
      const comments = section.getByRole("button", {
        name: "Comments on this answer",
      });
      const box = await comments.boundingBox();
      expect([box?.width, box?.height]).toEqual([36, 36]);
      expect((await comments.locator("svg").boundingBox())?.width).toBe(18);

      // A field L is 38px high in 15px type.
      const name = section.getByRole("textbox", { name: "Name" });
      expect(await css(name, "font-size")).toEqual({ "font-size": "15px" });
      expect((await name.locator("xpath=..").boundingBox())?.height).toBe(38);

      // Badges: the light frame; Overdue without one, monospaced; the count's ink tag.
      expect(
        await css(
          // The badge comes before the radio of the same name.
          section
            .getByText("Proceed", { exact: true })
            .first()
            .locator("xpath=.."),
          "border-top-color",
        ),
      ).toEqual({ "border-top-color": borderDefault[theme] });
      const overdue = section
        .getByText("overdue 3d", { exact: true })
        .locator("xpath=..");
      expect(
        await css(overdue, "border-top-width", "font-family"),
      ).toMatchObject({ "border-top-width": "0px" });
      expect((await css(overdue, "font-family"))["font-family"]).toContain(
        "IBM Plex Mono",
      );
      // The specimen's tag comes before the Meter, whose counts read "3" too.
      const count = section
        .getByText("3", { exact: true })
        .first()
        .locator("xpath=..");
      expect((await count.boundingBox())?.height).toBe(15);

      // Avatar: a rounded square of 28px, corner 8.
      const avatar = section.getByText("AV", { exact: true });
      expect((await avatar.boundingBox())?.width).toBe(28);
      expect(await css(avatar, "border-top-left-radius")).toEqual({
        "border-top-left-radius": "8px",
      });

      // CheckDots S: 12px moons, 3px apart.
      const dots = section.getByRole("img", { name: /^Competitors/ });
      expect(await css(dots, "column-gap")).toEqual({ "column-gap": "3px" });
      expect((await dots.locator("svg").first().boundingBox())?.width).toBe(12);

      // The groove: canvas inside the light frame, corner 9; the chosen one in ink.
      const groove = section.getByRole("radiogroup", { name: "Invitations" });
      expect(
        await css(groove, "border-top-color", "border-top-left-radius"),
      ).toEqual({
        "border-top-color": borderDefault[theme],
        "border-top-left-radius": "9px",
      });

      // Checkbox 18px, corner 5.
      const checkbox = section
        .getByText("Apply this change")
        .locator("xpath=preceding-sibling::span[1]");
      const checkboxBox = await checkbox.boundingBox();
      expect([checkboxBox?.width, checkboxBox?.height]).toEqual([18, 18]);
      expect(await css(checkbox, "border-top-left-radius")).toEqual({
        "border-top-left-radius": "5px",
      });

      // InlineAlert: no edge band, ink text, corner 10.
      const alert = section.getByRole("alert");
      expect(
        await css(alert, "border-left-width", "border-top-left-radius"),
      ).toEqual({
        "border-left-width": "0px",
        "border-top-left-radius": "10px",
      });

      // Meter: the band 10px high with corner 3.
      const band = section
        .getByRole("figure", { name: "Fact / Assumption / Unknown" })
        .locator("[aria-hidden='true']")
        .first();
      expect((await band.boundingBox())?.height).toBe(10);
      expect(await css(band, "border-top-left-radius")).toEqual({
        "border-top-left-radius": "3px",
      });

      // A card has no shadow; a lone link's underline is the light line.
      expect(
        await css(
          section.getByText("Salad Station").locator("xpath=.."),
          "box-shadow",
        ),
      ).toEqual({ "box-shadow": "none" });
      expect(
        await css(
          section.getByRole("link", { name: "See all decisions" }),
          "text-decoration-color",
        ),
      ).toEqual({ "text-decoration-color": borderDefault[theme] });
    });
  }

  test("a justified groove fills the line, no segment narrower than its label (FauPicker, 6.0.3)", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    const groove = region(
      page,
      "ToggleButtonGroup and SegmentedControl",
    ).getByRole("radiogroup", { name: "F/A/U justified" });
    await groove.scrollIntoViewIfNeeded();
    const segments = await groove.getByRole("radio").evaluateAll((nodes) =>
      nodes.map((node) => ({
        width: node.getBoundingClientRect().width,
        clipped: node.scrollWidth > node.clientWidth,
      })),
    );
    expect(segments).toHaveLength(3);
    expect(segments.some(({ clipped }) => clipped)).toBe(false);
    const inner = await groove.evaluate((node) => {
      const style = getComputedStyle(node);
      return (
        node.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight)
      );
    });
    // Three segments and the two 2px gaps between them fill the groove.
    const sum = segments.reduce((total, { width }) => total + width, 0);
    expect(Math.abs(sum + 4 - inner)).toBeLessThanOrEqual(1);
  });

  test("tablet: field text is 16px on touch, the mockups' 15px with a mouse (4.3)", async ({
    page,
  }) => {
    await openGallery(page, "tablet");
    const field = region(page, mockups).getByRole("textbox", { name: "Name" });
    await choose(page, "Scale", "large");
    expect(await css(field, "font-size")).toEqual({ "font-size": "16px" });
    await choose(page, "Scale", "medium");
    expect(await css(field, "font-size")).toEqual({ "font-size": "15px" });
  });

  test("phone: the mockups' 390px type; large raises only what is pressed", async ({
    page,
  }) => {
    await openGallery(page, "mobile");
    await choose(page, "Theme", "light");
    const section = region(page, mockups);
    const body = section.getByText("Ideas, self analyses and what is due");
    const field = section.getByRole("textbox", { name: "Name" });
    const send = section.getByRole("button", { name: "Send invitation" });
    for (const scale of scales) {
      await choose(page, "Scale", scale);
      await section.scrollIntoViewIfNeeded();
      // Text follows the width, not the scale (design-spec 4.3).
      expect(await css(body, "font-size")).toEqual({ "font-size": "16px" });
      expect(await css(field, "font-size")).toEqual({ "font-size": "16px" });
      expect(
        await css(section.getByRole("heading", { name: "BCDX" }), "font-size"),
      ).toEqual({ "font-size": "26px" });
      expect(await css(send, "font-size")).toEqual({ "font-size": "14px" });
      expect((await send.boundingBox())?.height).toBe(buttonHeightM[scale]);
    }
  });
});

test.describe("data parts match docs/mockups (Step 22d, design-spec 4.4・4.5)", () => {
  const mockups = "Mockup parts: tables, cards, metrics, rows and steps";
  /** 06 border.default (the mockups' --line-strong) and border.hairline (--line). */
  const lines = {
    light: { default: "rgb(198, 203, 216)", hairline: "rgb(225, 228, 235)" },
    dark: { default: "rgb(58, 66, 99)", hairline: "rgb(38, 44, 68)" },
  };
  const ink = { light: "rgb(21, 26, 44)", dark: "rgb(230, 232, 241)" };
  const box = async (locator: Locator) => {
    const rect = await locator.boundingBox();
    if (rect === null) throw new Error("not on screen");
    return rect;
  };
  /** Whether a text sits on one line: its box is lower than one and a half lines. */
  const oneLine = (locator: Locator) =>
    locator.evaluate((node) => {
      const lineHeight = Number.parseFloat(getComputedStyle(node).lineHeight);
      return node.getBoundingClientRect().height < lineHeight * 1.5;
    });

  for (const theme of themes) {
    test(`desktop, ${theme}: the table has no ground, a line under its header and 46px rows`, async ({
      page,
    }) => {
      await openGallery(page, "desktop");
      await choose(page, "Theme", theme);
      await choose(page, "Scale", "medium");
      const table = region(page, mockups).getByRole("grid", {
        name: "Costs to open (s17)",
      });
      await table.scrollIntoViewIfNeeded();
      expect(await css(table, "background-color", "table-layout")).toEqual({
        "background-color": "rgba(0, 0, 0, 0)",
        "table-layout": "fixed",
      });
      const header = table.getByRole("columnheader", { name: "Amount" });
      expect(
        await css(
          header,
          "font-size",
          "font-weight",
          "border-bottom-color",
          "background-color",
        ),
      ).toEqual({
        "font-size": "12.5px",
        "font-weight": "500",
        "border-bottom-color": lines[theme].default,
        "background-color": "rgba(0, 0, 0, 0)",
      });
      const row = table.getByRole("row", { name: "Lease Deposit" });
      expect((await box(row)).height).toBe(46);
      expect(await css(row, "border-bottom-color")).toEqual({
        "border-bottom-color": lines[theme].hairline,
      });
      // The mark has its own column; the F/A/U cell shows the label alone, 13.5px.
      const fau = row.getByRole("button", {
        name: /^F\/A\/U of Lease Deposit/,
      });
      expect(await fau.locator("svg").count()).toBe(0);
      expect(await css(fau, "font-size")).toEqual({ "font-size": "13.5px" });
      await expect(
        row.getByRole("gridcell").first().locator("svg"),
      ).toHaveCount(1);
    });
  }

  test("an edited row moves neither the columns nor the amount's digits; it shows ▾ and the ⋯", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    await choose(page, "Scale", "medium");
    const table = region(page, mockups).getByRole("grid", {
      name: "Costs to open (s17)",
    });
    await table.scrollIntoViewIfNeeded();
    const row = table.getByRole("row", { name: "Renovation" });
    // Where the value's text ends: its box also covers the cell's padding.
    const valueEnd = await row
      .getByText("₱30,000", { exact: true })
      .evaluate((node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return range.getBoundingClientRect().right;
      });
    const headers = await table
      .getByRole("columnheader")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().x),
      );
    const width = (await box(table)).width;
    // With a mouse the ⋯ is out of sight until the row is under the pointer.
    const more = row
      .getByRole("button", { name: "Row actions of Renovation" })
      .locator("xpath=..");
    await page.mouse.move(0, 0);
    await expect(more).toHaveCSS("opacity", "0");
    await row.getByText("Renovation", { exact: true }).click();
    const input = row.getByRole("textbox", { name: "Amount of Renovation" });
    await expect(input).toBeVisible();
    expect((await box(row)).height).toBe(46);
    expect((await box(table)).width).toBe(width);
    expect(
      await table
        .getByRole("columnheader")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getBoundingClientRect().x),
        ),
    ).toEqual(headers);
    // The digits end where the value ended, the symbol beside them.
    const digits = await input.evaluate((node) => {
      const field = node as HTMLInputElement;
      const rect = field.getBoundingClientRect();
      const style = getComputedStyle(field);
      return {
        end: rect.right - Number.parseFloat(style.paddingRight),
        start: rect.left,
      };
    });
    expect(Math.abs(digits.end - valueEnd)).toBeLessThanOrEqual(1);
    const symbol = await box(row.getByText("₱", { exact: true }));
    expect(
      Math.abs(symbol.x + symbol.width - digits.start),
    ).toBeLessThanOrEqual(1);
    await expect(more).toHaveCSS("opacity", "1");
    await expect(
      row
        .getByRole("button", { name: /^F\/A\/U of Renovation/ })
        .locator("svg"),
    ).toHaveCount(1);
  });

  test("a row's ⋯ gives focus back to itself when its menu closes (design-spec 4.5)", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    const table = region(page, mockups).getByRole("grid", {
      name: "Costs to open (s17)",
    });
    await table.scrollIntoViewIfNeeded();
    const more = table.getByRole("button", {
      name: "Row actions of Equipment",
    });
    await more.click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(more).toBeFocused();
  });

  test("the large scale shows every row's ⋯", async ({ page }) => {
    await openGallery(page, "desktop");
    await choose(page, "Scale", "large");
    const table = region(page, mockups).getByRole("grid", {
      name: "Costs to open (s17)",
    });
    await table.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await expect(
      table
        .getByRole("button", { name: "Row actions of Equipment" })
        .locator("xpath=.."),
    ).toHaveCSS("opacity", "1");
  });

  test("the F/A/U popover is s17's: 300px, its two headings, the way to evidence", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    await choose(page, "Scale", "medium");
    const table = region(page, mockups).getByRole("grid", {
      name: "Costs to open (s17)",
    });
    await table.scrollIntoViewIfNeeded();
    await table.getByRole("button", { name: /^F\/A\/U of Renovation/ }).click();
    const dialog = page.getByRole("dialog", { name: "F/A/U of Renovation" });
    await expect(
      dialog.getByText("How do you know this amount?"),
    ).toBeVisible();
    expect(Math.round((await box(dialog)).width)).toBe(300);
    const groove = dialog.getByRole("radiogroup", {
      name: "F/A/U of Renovation",
    });
    // The three buttons fit the popover: nothing scrolls.
    expect(
      await groove.evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
    expect(
      Math.round((await box(groove.getByRole("radio").first())).height),
    ).toBe(32);
    await expect(
      dialog.getByRole("radiogroup", { name: "Confidence" }),
    ).toBeVisible();
    await expect(dialog.getByText("Have a quote? Mark it Fact.")).toBeVisible();
    await dialog.getByRole("link", { name: "Add evidence" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("a phone: lines under a line, the mark, the name with its F/A/U under it, the amount at the end", async ({
    page,
  }) => {
    await openGallery(page, "mobile");
    await choose(page, "Theme", "light");
    const rows = region(page, mockups).getByRole("grid", {
      name: "Costs to open (s17)",
    });
    await rows.scrollIntoViewIfNeeded();
    await expect(rows.locator("table")).toHaveCount(0);
    expect(await css(rows, "border-top-color")).toEqual({
      "border-top-color": lines.light.default,
    });
    const equipment = rows.getByRole("row", { name: "Equipment" });
    await expect(equipment.getByText("Fact · 1 source")).toBeVisible();
    const amount = equipment.getByText("₱60,000", { exact: true });
    expect(await css(amount, "font-size", "font-weight")).toEqual({
      "font-size": "15px",
      "font-weight": "500",
    });
    const name = await box(equipment.getByText("Equipment", { exact: true }));
    expect((await box(amount)).x).toBeGreaterThan(name.x + name.width);
    // Notes, Can reduce? and the ⋯ stay off a phone's row.
    for (const text of ["Blast chiller and prep tables", "Partly"]) {
      await expect(equipment.getByText(text)).toHaveCount(0);
    }
    await expect(
      equipment.getByRole("button", { name: /Row actions/ }),
    ).toHaveCount(0);
  });

  for (const theme of themes) {
    test(`desktop, ${theme}: numbers, rows, the summary, cards, choices and steps are the mockups'`, async ({
      page,
    }) => {
      await openGallery(page, "desktop");
      await choose(page, "Theme", theme);
      await choose(page, "Scale", "medium");
      const section = region(page, mockups);

      // d1's band: a line above, a hairline below and between; 30px numbers on one line.
      const band = section.getByRole("group", {
        name: "d1 numbers",
        exact: true,
      });
      await band.scrollIntoViewIfNeeded();
      expect(
        await css(band, "border-top-color", "border-bottom-color"),
      ).toEqual({
        "border-top-color": lines[theme].default,
        "border-bottom-color": lines[theme].hairline,
      });
      const tiles = band.locator("dl");
      expect(await css(tiles.nth(1), "border-left-color")).toEqual({
        "border-left-color": lines[theme].hairline,
      });
      const startup = band.getByText("₱145,000+", { exact: true });
      expect(await css(startup, "font-size")).toEqual({ "font-size": "30px" });
      expect(await oneLine(startup)).toBe(true);
      const top = await Promise.all(
        [0, 1, 2, 3].map(async (index) => (await box(tiles.nth(index))).y),
      );
      expect(new Set(top).size).toBe(1);
      // s19's: 12.5px labels, 17px numbers, five across.
      const compact = section.getByRole("group", {
        name: "s19 numbers",
        exact: true,
      });
      expect(
        await css(compact.getByText("ROI", { exact: true }), "font-size"),
      ).toEqual({ "font-size": "12.5px" });
      expect(
        await css(
          compact.getByText("≤ 306.2%", { exact: true }).locator("xpath=.."),
          "font-size",
          "font-weight",
        ),
      ).toEqual({ "font-size": "17px", "font-weight": "500" });

      // d1's rows: a hairline above the first; names line up past the marks' column.
      const sections = section.getByRole("list", {
        name: "d1 section list",
        exact: true,
      });
      const first = sections.getByRole("listitem").first();
      expect(await css(first, "border-top-color")).toEqual({
        "border-top-color": lines[theme].hairline,
      });
      const marked = await box(
        sections.getByText("01 Customer & Problem", { exact: true }),
      );
      const unmarked = await box(
        sections.getByText("03 Research Log", { exact: true }),
      );
      expect(unmarked.x).toBe(marked.x);
      // The first of the Next steps: a light frame, a 3px ink line, corner 10, 16/600.
      const next = section.getByRole("list", {
        name: "d1 next list",
        exact: true,
      });
      const emphasized = next.getByRole("listitem").first();
      expect(
        await css(
          emphasized,
          "border-top-color",
          "border-left-width",
          "border-left-color",
          "border-top-left-radius",
          "box-shadow",
        ),
      ).toEqual({
        "border-top-color": lines[theme].default,
        "border-left-width": "3px",
        "border-left-color": ink[theme],
        "border-top-left-radius": "10px",
        "box-shadow": "none",
      });
      expect(
        await css(
          next.getByText("Add evidence (1)", { exact: true }),
          "font-size",
          "font-weight",
        ),
      ).toEqual({ "font-size": "16px", "font-weight": "600" });

      // The summary: a 120px column of 13px labels, 14.5px values.
      const summary = section.locator("dl").filter({ hasText: "Biggest risk" });
      const label = summary.getByText("Customer", { exact: true });
      expect((await box(label)).width).toBe(120);
      expect(await css(label, "font-size")).toEqual({ "font-size": "13px" });
      expect(
        await css(summary.getByText("Red", { exact: true }), "font-size"),
      ).toEqual({ "font-size": "14.5px" });

      // s15's card: its type above the name, not upper-cased; the price; 112px labels.
      const cards = section.getByRole("grid", {
        name: "s15 cards",
        exact: true,
      });
      const card = cards.getByRole("row", { name: "Salad Station" });
      expect(
        await css(
          card.getByText("Direct competitor", { exact: true }),
          "text-transform",
          "font-size",
        ),
      ).toEqual({ "text-transform": "none", "font-size": "11.5px" });
      expect(
        await css(
          card.getByText("Salad Station", { exact: true }),
          "font-size",
          "font-weight",
        ),
      ).toEqual({ "font-size": "18px", "font-weight": "600" });
      expect(
        (await box(card.getByText("Target customer", { exact: true }))).width,
      ).toBe(112);
      expect(await css(card, "box-shadow")).toEqual({ "box-shadow": "none" });

      // s19's choices: three cards in a row; the chosen one framed in ink.
      const choices = section.getByRole("radiogroup", {
        name: "Should we develop this into a full Business Plan?",
      });
      const cardOf = (name: string) =>
        choices
          .getByText(name, { exact: true })
          .locator("xpath=ancestor::label[1]");
      const [proceed, hold] = [cardOf("Proceed"), cardOf("Hold")];
      expect((await box(proceed)).y).toBe((await box(hold)).y);
      expect(await css(hold, "border-top-color")).toEqual({
        "border-top-color": ink[theme],
      });
      expect(await css(proceed, "border-top-color")).toEqual({
        "border-top-color": lines[theme].default,
      });

      // s23's slide: white with corner 6 and its two shadows; the thumbnail without.
      const slide = section.getByRole("region", {
        name: "Business model",
        exact: true,
      });
      expect(
        await css(slide, "background-color", "border-top-left-radius"),
      ).toEqual({
        "background-color": "rgb(255, 255, 255)",
        "border-top-left-radius": "6px",
      });
      expect(
        (await css(slide, "box-shadow"))["box-shadow"]?.split("px,").length,
      ).toBeGreaterThan(1);
      expect(
        await css(
          section.getByRole("region", {
            name: "Business model (thumbnail)",
            exact: true,
          }),
          "box-shadow",
        ),
      ).toEqual({ "box-shadow": "none" });

      // s25's steps: a hairline under the row, the current one underlined, no connectors.
      const steps = section.getByRole("list", {
        name: "s25 steps",
        exact: true,
      });
      expect(await css(steps, "border-bottom-color")).toEqual({
        "border-bottom-color": lines[theme].hairline,
      });
      const current = steps.locator('[aria-current="step"]');
      expect((await css(current, "box-shadow"))["box-shadow"]).toContain(
        "-2px",
      );
      expect(
        await steps
          .getByRole("listitem")
          .nth(1)
          .evaluate((node) => getComputedStyle(node, "::before").content),
      ).toBe("none");
    });
  }

  test("phone: the band is 2×2 with its numbers on one line; choices stack; only the current step is named", async ({
    page,
  }) => {
    await openGallery(page, "mobile");
    await choose(page, "Theme", "light");
    const section = region(page, mockups);
    const band = section.getByRole("group", {
      name: "d1 numbers",
      exact: true,
    });
    await band.scrollIntoViewIfNeeded();
    const tiles = band.locator("dl");
    const [a, b, c] = await Promise.all(
      [0, 1, 2].map((i) => box(tiles.nth(i))),
    );
    expect(a?.y).toBe(b?.y);
    expect(c?.y).toBeGreaterThan(a?.y ?? 0);
    for (const value of ["₱145,000+", "≤ ₱37,000"]) {
      const number = band.getByText(value, { exact: true });
      expect(await css(number, "font-size")).toEqual({ "font-size": "20px" });
      expect(await oneLine(number)).toBe(true);
    }
    const compact = section.getByRole("group", {
      name: "s19 numbers",
      exact: true,
    });
    for (const value of ["₱145,000+", "≤ ₱37,000 / mo"]) {
      expect(await oneLine(compact.getByText(value, { exact: true }))).toBe(
        true,
      );
    }
    const choices = section.getByRole("radiogroup", {
      name: "Should we develop this into a full Business Plan?",
    });
    const proceed = await box(choices.getByText("Proceed", { exact: true }));
    const hold = await box(choices.getByText("Hold", { exact: true }));
    expect(hold.y).toBeGreaterThan(proceed.y);
    const steps = section.getByRole("list", { name: "s25 steps", exact: true });
    // Each step's name: the second of its spans, after the mark.
    const width = (index: number) =>
      steps
        .getByRole("listitem")
        .nth(index)
        .locator(":scope > span")
        .nth(1)
        .evaluate((node) => node.getBoundingClientRect().width);
    expect(await width(0)).toBeLessThanOrEqual(1);
    expect(await width(2)).toBeGreaterThan(1);
    // The names stay for screen readers.
    expect(await steps.ariaSnapshot()).toContain("Paste completed");
  });

  test("a card's ⋯ takes Tab from the card and opens its menu, not the card", async ({
    page,
  }) => {
    await openGallery(page, "desktop");
    const section = region(page, mockups);
    const cards = section.getByRole("grid", { name: "s15 cards", exact: true });
    await cards.scrollIntoViewIfNeeded();
    await cards.getByText("Bowl & Co", { exact: true }).click();
    await expect(section.getByText("Card opened: bowl")).toBeVisible();
    await page.keyboard.press("Tab");
    const more = cards.getByRole("button", {
      name: "Card actions of Bowl & Co",
    });
    await expect(more).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(more).toBeFocused();
    await cards
      .getByRole("button", { name: "Card actions of Salad Station" })
      .click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(section.getByText("Card opened: bowl")).toBeVisible();
  });
});
