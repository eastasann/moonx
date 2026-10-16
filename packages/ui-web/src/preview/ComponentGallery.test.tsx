import { render, screen } from "@testing-library/react";
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
  ]) {
    expect(screen.getByRole("region", { name: title })).toBeTruthy();
  }
});

test("the theme and scale switches set the html attributes, System and Auto clear them", async () => {
  const user = userEvent.setup();
  const { unmount } = render(<ComponentGallery />);
  const root = document.documentElement;
  expect(root.hasAttribute("data-theme")).toBe(false);
  await user.click(screen.getByRole("radio", { name: "Dark" }));
  await user.click(screen.getByRole("radio", { name: "Large" }));
  expect(root.getAttribute("data-theme")).toBe("dark");
  expect(root.getAttribute("data-scale")).toBe("large");
  await user.click(screen.getByRole("radio", { name: "System" }));
  await user.click(screen.getByRole("radio", { name: "Auto" }));
  expect(root.hasAttribute("data-theme")).toBe(false);
  expect(root.hasAttribute("data-scale")).toBe(false);
  await user.click(screen.getByRole("radio", { name: "Light" }));
  unmount();
  expect(root.hasAttribute("data-theme")).toBe(false);
});
