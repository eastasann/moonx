import { i18n } from "@moonx/i18n";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";
import type { ChoiceItem } from "../internal/ChoiceListBox";
import { setPhoneWidth } from "../test/helpers";
import { Breadcrumb, Breadcrumbs } from "./Breadcrumbs";
import { Button } from "./Button";
import { ComboBox } from "./ComboBox";
import { ContextualHelp } from "./ContextualHelp";
import { DatePicker } from "./DatePicker";
import { Dialog, DialogTrigger } from "./Dialog";
import { InlineAlert } from "./InlineAlert";
import { ActionMenu, MenuItem } from "./Menu";
import { Picker } from "./Picker";
import { SearchField } from "./SearchField";
import { TagGroup } from "./TagGroup";
import { ToastContainer, ToastQueue } from "./Toast";
import { Tree, TreeItem } from "./Tree";

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

  test("Dialog: the close button of a dismissable dialog", async () => {
    const text = swap("dialog.close");
    const user = userEvent.setup();
    render(
      <DialogTrigger>
        <Button>Open</Button>
        <Dialog title="Share" isDismissable>
          Body
        </Dialog>
      </DialogTrigger>,
    );
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(
      within(screen.getByRole("dialog")).getByRole("button", { name: text }),
    ).toBeTruthy();
  });

  test("ActionMenu: the ⋯ button, unless the screen names it", () => {
    const text = swap("actionMenu.label");
    render(
      <>
        <ActionMenu>
          <MenuItem id="a">A</MenuItem>
        </ActionMenu>
        <ActionMenu aria-label="Row actions">
          <MenuItem id="a">A</MenuItem>
        </ActionMenu>
      </>,
    );
    expect(screen.getByRole("button", { name: text })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Row actions" })).toBeTruthy();
  });

  test("ContextualHelp: the help and the info button", () => {
    const help = swap("contextualHelp.help");
    const info = swap("contextualHelp.info");
    render(
      <>
        <ContextualHelp title="A">a</ContextualHelp>
        <ContextualHelp variant="info" title="B">
          b
        </ContextualHelp>
      </>,
    );
    expect(screen.getByRole("button", { name: help })).toBeTruthy();
    expect(screen.getByRole("button", { name: info })).toBeTruthy();
  });

  test("InlineAlert: the close button", () => {
    const text = swap("inlineAlert.close");
    render(<InlineAlert onDismiss={() => {}}>A new version</InlineAlert>);
    expect(screen.getByRole("button", { name: text })).toBeTruthy();
  });

  test("Toast: the close button and the region's name with its count", () => {
    const close = swap("toast.close");
    const region = swap("toast.region_one");
    render(<ToastContainer />);
    let dismiss = () => {};
    act(() => {
      dismiss = ToastQueue.neutral("Decision recorded");
    });
    expect(screen.getByRole("region", { name: region })).toBeTruthy();
    expect(screen.getByRole("button", { name: close })).toBeTruthy();
    act(dismiss);
  });

  test("Breadcrumbs: the list's name, unless the screen gives one", () => {
    const text = swap("breadcrumbs.label");
    render(
      <>
        <Breadcrumbs>
          <Breadcrumb>Here</Breadcrumb>
        </Breadcrumbs>
        <Breadcrumbs aria-label="Plan path">
          <Breadcrumb>There</Breadcrumb>
        </Breadcrumbs>
      </>,
    );
    expect(screen.getByRole("list", { name: text })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Plan path" })).toBeTruthy();
  });

  test("Tree: a branch's button, Expand or Collapse", async () => {
    const expand = swap("tree.expand");
    const collapse = swap("tree.collapse");
    const user = userEvent.setup();
    render(
      <Tree aria-label="Template">
        <TreeItem id="01" textValue="Section" title="Section">
          <TreeItem id="who" textValue="WHO" title="WHO" />
        </TreeItem>
      </Tree>,
    );
    await user.click(screen.getByRole("button", { name: `${expand} Section` }));
    expect(
      screen.getByRole("button", { name: `${collapse} Section` }),
    ).toBeTruthy();
  });
});
