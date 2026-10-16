import { i18n } from "@moonx/i18n";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";
import type { ChoiceItem } from "../internal/ChoiceListBox";
import { setPhoneWidth } from "../test/helpers";
import { ComboBox } from "./ComboBox";
import { DatePicker } from "./DatePicker";
import { Picker } from "./Picker";
import { SearchField } from "./SearchField";
import { TagGroup } from "./TagGroup";

// React Aria's strings that the components pass in from the `components` catalog (SDD 9章
// 「React Aria の文言」). The catalog holds React Aria's own English, so each test swaps
// the entry first: the component must show the swapped text, not React Aria's.

const items: ChoiceItem[] = [
  { id: "a", label: "Ana" },
  { id: "b", label: "Ben" },
];

const swapped = new Map<string, string>();

/** Replaces a `components` entry for one test; afterEach puts the catalog's back. */
const swap = (key: string) => {
  const text = `[${key}]`;
  if (!swapped.has(key)) {
    swapped.set(key, i18n.getResource("en", "components", key) as string);
  }
  i18n.addResource("en", "components", key, text);
  return text;
};

afterEach(() => {
  for (const [key, text] of swapped) {
    i18n.addResource("en", "components", key, text);
  }
  swapped.clear();
});

describe("strings from the components catalog", () => {
  test("Picker: the placeholder, unless the screen gives one", () => {
    const text = swap("picker.placeholder");
    render(
      <>
        <Picker aria-label="Role" items={items} />
        <Picker aria-label="Currency" items={items} placeholder="Choose" />
      </>,
    );
    const [plain, given] = screen.getAllByRole("button");
    expect(plain?.textContent).toBe(text);
    expect(given?.textContent).toBe("Choose");
  });

  test("DatePicker: each empty segment's placeholder, in the en-PH order", () => {
    const month = swap("dateField.placeholder.month");
    const day = swap("dateField.placeholder.day");
    const year = swap("dateField.placeholder.year");
    render(<DatePicker aria-label="Deadline" />);
    const segments = screen
      .getAllByRole("spinbutton")
      .map((segment) => segment.textContent);
    expect(segments).toEqual([month, day, year]);
  });

  test("DatePicker: a filled segment shows its value", () => {
    swap("dateField.placeholder.month");
    render(<DatePicker aria-label="Deadline" defaultValue="2026-09-30" />);
    const segments = screen
      .getAllByRole("spinbutton")
      .map((segment) => segment.textContent);
    expect(segments).toEqual(["9", "30", "2026"]);
  });

  test("DatePicker: the calendar button and the calendar's previous and next", async () => {
    const calendar = swap("datePicker.calendar");
    const previous = swap("calendar.previous");
    const next = swap("calendar.next");
    const user = userEvent.setup();
    render(<DatePicker label="Deadline" defaultValue="2026-10-16" />);
    const button = within(
      screen.getByRole("group", { name: "Deadline" }),
    ).getByRole("button");
    expect(button.getAttribute("aria-label")).toBe(calendar);
    await user.click(button);
    const dialog = screen.getByRole("dialog");
    const october = within(dialog).getByRole("heading").textContent;
    await user.click(within(dialog).getByRole("button", { name: next }));
    expect(within(dialog).getByRole("heading").textContent).not.toBe(october);
    await user.click(within(dialog).getByRole("button", { name: previous }));
    expect(within(dialog).getByRole("heading").textContent).toBe(october);
  });

  test("SearchField: the clear button", () => {
    const text = swap("searchField.clear");
    render(<SearchField aria-label="Search ideas" defaultValue="cafe" />);
    expect(screen.getByRole("button", { name: text })).toBeTruthy();
  });

  test("ComboBox on tablet and wider: the button and the list of suggestions", async () => {
    const button = swap("comboBox.showSuggestions");
    const list = swap("comboBox.suggestions");
    const user = userEvent.setup();
    render(<ComboBox aria-label="Assignee" items={items} />);
    const trigger = screen.getByRole("button");
    expect(trigger.getAttribute("aria-label")).toBe(button);
    await user.click(trigger);
    expect(screen.getByRole("listbox").getAttribute("aria-label")).toBe(list);
  });

  test("ComboBox on a phone: the list of suggestions in the tray", async () => {
    setPhoneWidth();
    const list = swap("comboBox.suggestions");
    const user = userEvent.setup();
    render(<ComboBox aria-label="Assignee" items={items} />);
    await user.click(screen.getByRole("button", { name: "Assignee" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("listbox").getAttribute("aria-label")).toBe(
      list,
    );
  });

  test("TagGroup: the remove button", () => {
    const text = swap("tagGroup.remove");
    render(
      <TagGroup
        aria-label="Supports"
        items={[{ id: "permits", label: "Permits" }]}
        onRemove={() => {}}
      />,
    );
    const remove = within(screen.getByRole("row")).getByRole("button");
    expect(remove.getAttribute("aria-label")).toBe(text);
  });
});
