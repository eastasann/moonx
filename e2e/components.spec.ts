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
