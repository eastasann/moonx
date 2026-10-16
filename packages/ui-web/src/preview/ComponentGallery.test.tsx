import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockTextMeasure } from "../test/helpers";
import { ComponentGallery } from "./ComponentGallery";

// The gallery's slides measure their figures with a canvas happy-dom does not have.
beforeEach(mockTextMeasure);
afterEach(() => {
  vi.restoreAllMocks();
});

test("the gallery renders every section", () => {
  render(<ComponentGallery />);
  for (const title of [
    "Layout",
    "Typography",
    "Divider and Well",
    "Link",
    "Button",
    "ActionButton",
    "ToggleButtonGroup and SegmentedControl",
    "TextField and TextArea",
    "NumberField",
    "SearchField, Picker and ComboBox",
    "RadioGroup, Checkbox and Switch",
    "FileTrigger and TagGroup",
    "Form",
    "ProgressCircle",
    "Dialog and AlertDialog",
    "Popover and Tray",
    "ActionMenu and Menu",
    "Tooltip and ContextualHelp",
    "InlineAlert",
    "Toast",
    "ProgressBar",
    "Skeleton",
    "IllustratedMessage",
    "StatusLight",
    "Badge",
    "Disclosure and Accordion",
    "Tabs",
    "Breadcrumbs",
    "TableView",
    "ListView",
    "Card and CardView",
    "Tree",
    "Meter",
    "MoonGlyph and CheckDots",
    "Avatar",
    "FauPicker",
    "MetricTile",
    "RowList",
    "QuestionCard",
    "DiffText",
    "MentionTextArea",
    "Panel",
    "Slide",
    "Steps",
    "SideNav, TabBar, AppFrame and RouterProvider",
    "PageFrame",
    "HubPattern",
    "FocusPattern",
    "QuestionFormPattern",
    "ListDetailPattern",
    "CardComparePattern",
    "WorksheetPattern",
    "StepsPattern",
    "SettingsPattern",
    "PresentationPattern",
    "PublicPattern",
  ]) {
    expect(screen.getByRole("region", { name: title })).toBeTruthy();
  }
});

test("the theme and scale switches set the html attributes, System and Auto clear them", async () => {
  const user = userEvent.setup();
  const { unmount } = render(<ComponentGallery />);
  const root = document.documentElement;
  // The toolbar's switches; SettingsPattern's sample has its own System / Light / Dark.
  const option = (group: "Theme" | "Scale", name: string) =>
    within(screen.getByRole("radiogroup", { name: group })).getByRole("radio", {
      name,
    });
  expect(root.hasAttribute("data-theme")).toBe(false);
  await user.click(option("Theme", "Dark"));
  await user.click(option("Scale", "Large"));
  expect(root.getAttribute("data-theme")).toBe("dark");
  expect(root.getAttribute("data-scale")).toBe("large");
  await user.click(option("Theme", "System"));
  await user.click(option("Scale", "Auto"));
  expect(root.hasAttribute("data-theme")).toBe(false);
  expect(root.hasAttribute("data-scale")).toBe(false);
  await user.click(option("Theme", "Light"));
  unmount();
  expect(root.hasAttribute("data-theme")).toBe(false);
});
