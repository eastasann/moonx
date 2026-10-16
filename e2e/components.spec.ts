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
];

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

        const buttonM = region(page, "Button")
          .getByRole("button", { name: "Record decision" })
          .nth(1);
        expect((await buttonM.boundingBox())?.height).toBe(
          buttonHeightM[scale],
        );

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
