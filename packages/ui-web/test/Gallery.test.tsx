import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ComponentGallery } from "../src/preview";
import { expectNoAxeViolations } from "./axe";
import { mockNarrow } from "./matchMedia";

// The gallery renders every component, so each render is slow under a parallel run.
vi.setConfig({ testTimeout: 60_000 });

// jsdom has no ResizeObserver; Slide scales itself to its container with one.
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-scale");
});

const SECTIONS = [
  "Actions",
  "Fields",
  "Overlays",
  "Status and feedback",
  "Collections and containers",
  "App frame and app-specific parts",
  "Layout",
];

test("renders every section", () => {
  render(<ComponentGallery />);
  expect(screen.getByRole("heading", { level: 1, name: "Component gallery" })).toBeInTheDocument();
  for (const name of SECTIONS) {
    expect(screen.getByRole("region", { name })).toBeInTheDocument();
  }
});

test("shows every public component by name", () => {
  render(<ComponentGallery />);
  const names = screen
    .getAllByRole("heading", { level: 3 })
    .map((heading) => heading.textContent ?? "");
  const expected = [
    "Button",
    "ButtonGroup",
    "ActionButton",
    "ActionGroup",
    "ActionMenu",
    "Menu",
    "Link",
    "ToggleButtonGroup",
    "SegmentedControl",
    "TextField",
    "TextArea",
    "MentionTextArea",
    "NumberField",
    "SearchField",
    "Picker",
    "ComboBox",
    "DatePicker",
    "RadioGroup",
    "Checkbox",
    "CheckboxGroup",
    "Switch",
    "TagGroup",
    "Dialog",
    "AlertDialog",
    "Popover",
    "Tray",
    "Tooltip",
    "ContextualHelp",
    "Panel",
    "Toast",
    "StatusLight",
    "Badge",
    "InlineAlert",
    "ProgressBar",
    "ProgressCircle",
    "Meter",
    "MetricTile",
    "Skeleton",
    "IllustratedMessage",
    "Avatar",
    "TableView",
    "ListView",
    "CardView and Card",
    "Tree",
    "Well",
    "RowList",
    "Divider",
    "Heading",
    "Text",
    "Steps",
    "Form",
    "FileTrigger",
    "AppFrame",
    "PageFrame",
    "Disclosure and Accordion",
    "Tabs",
    "Breadcrumbs",
    "SideNav",
    "TabBar",
    "QuestionCard",
    "Slide",
    "Flex and Stack",
    "Grid",
    "Container",
  ];
  for (const name of expected) expect(names).toContain(name);
  for (const letter of "ABCDEFGHIJ") {
    expect(names.some((name) => name.startsWith(`${letter}. `))).toBe(true);
  }
});

test("the theme control sets and removes data-theme", async () => {
  const user = userEvent.setup();
  render(<ComponentGallery />);
  const theme = screen.getByRole("radiogroup", { name: "Theme" });
  expect(document.documentElement).not.toHaveAttribute("data-theme");

  await user.click(within(theme).getByRole("radio", { name: "Dark" }));
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");

  await user.click(within(theme).getByRole("radio", { name: "Light" }));
  expect(document.documentElement).toHaveAttribute("data-theme", "light");

  await user.click(within(theme).getByRole("radio", { name: "System" }));
  expect(document.documentElement).not.toHaveAttribute("data-theme");
});

test("the scale control sets and removes data-scale", async () => {
  const user = userEvent.setup();
  render(<ComponentGallery />);
  const scale = screen.getByRole("radiogroup", { name: "Scale" });
  expect(document.documentElement).not.toHaveAttribute("data-scale");

  await user.click(within(scale).getByRole("radio", { name: "Large" }));
  expect(document.documentElement).toHaveAttribute("data-scale", "large");

  await user.click(within(scale).getByRole("radio", { name: "Medium" }));
  expect(document.documentElement).toHaveAttribute("data-scale", "medium");

  await user.click(within(scale).getByRole("radio", { name: "Auto" }));
  expect(document.documentElement).not.toHaveAttribute("data-scale");
});

test("every theme and scale combination renders without errors", async () => {
  const user = userEvent.setup();
  render(<ComponentGallery />);
  const theme = screen.getByRole("radiogroup", { name: "Theme" });
  const scale = screen.getByRole("radiogroup", { name: "Scale" });
  for (const themeName of ["Light", "Dark"]) {
    for (const scaleName of ["Medium", "Large"]) {
      await user.click(within(theme).getByRole("radio", { name: themeName }));
      await user.click(within(scale).getByRole("radio", { name: scaleName }));
      expect(document.documentElement).toHaveAttribute("data-theme", themeName.toLowerCase());
      expect(document.documentElement).toHaveAttribute("data-scale", scaleName.toLowerCase());
      expect(screen.getByRole("region", { name: "Layout" })).toBeInTheDocument();
    }
  }
});

test("leaving the gallery restores the page's own theme and scale", async () => {
  const user = userEvent.setup();
  const { unmount } = render(<ComponentGallery />);
  await user.click(
    within(screen.getByRole("radiogroup", { name: "Theme" })).getByRole("radio", { name: "Dark" }),
  );
  unmount();
  expect(document.documentElement).not.toHaveAttribute("data-theme");
});

test("reports the window width and what overlays become", () => {
  render(<ComponentGallery />);
  expect(
    screen.getByText(/^Window \d+ px, \w+ layout, overlays open as a (Popover|Tray)$/),
  ).toBeInTheDocument();
});

test("says the overlays are trays below the tablet width", () => {
  mockNarrow(true);
  render(<ComponentGallery />);
  expect(screen.getByText(/overlays open as a Tray$/)).toBeInTheDocument();
});

test("the remove button on a gallery tag takes the tag out", async () => {
  const user = userEvent.setup();
  render(<ComponentGallery />);
  const before = screen.getAllByRole("button", { name: "Remove Market size" });
  await user.click(before[0] as HTMLElement);
  expect(screen.getAllByRole("button", { name: "Remove Market size" })).toHaveLength(
    before.length - 1,
  );
});

test("has no axe violations", async () => {
  const { container } = render(<ComponentGallery />);
  await expectNoAxeViolations(container);
}, 60_000);
