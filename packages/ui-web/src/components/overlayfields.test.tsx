import { parseDate } from "@internationalized/date";
import { User } from "@react-aria/test-utils";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import {
  DateField as AriaDateField,
  DateInput,
  DateSegment,
} from "react-aria-components";
import { describe, expect, test, vi } from "vitest";
import type { ChoiceItem } from "../internal/ChoiceListBox";
import * as overlay from "../internal/overlay.css";
import { setPhoneWidth, settle } from "../test/helpers";
import { ComboBox } from "./ComboBox";
import { DatePicker } from "./DatePicker";
import { Picker } from "./Picker";

const roles: ChoiceItem[] = [
  { id: "owner", label: "Owner", description: "Manages members" },
  { id: "member", label: "Member", description: "Edits ideas" },
  { id: "viewer", label: "Viewer", isDisabled: true },
];

const members: ChoiceItem[] = [
  { id: "u1", label: "Ana Reyes" },
  { id: "u2", label: "Ben Cruz" },
  { id: "u3", label: "Carla Santos" },
];

const testUser = new User({ interactionType: "mouse" });

/** Whether the element sits in the tray (bottom sheet) rather than a popover. */
const inTray = (element: Element) =>
  element.closest(`.${overlay.tray}`) !== null;
const inPopover = (element: Element) =>
  element.closest(`.${overlay.popover}`) !== null;

describe("Picker", () => {
  test("opens a popover on tablet and wider and reports the chosen id", async () => {
    const onChange = vi.fn();
    render(<Picker label="Role" items={roles} onChange={onChange} />);
    const select = testUser.createTester("Select", {
      root: screen.getByRole("button"),
    });
    await select.open();
    const listbox = select.getListbox() as HTMLElement;
    expect(inPopover(listbox)).toBe(true);
    expect(select.getOptions()).toHaveLength(3);
    await select.toggleOptionSelection({ option: "Member" });
    expect(onChange).toHaveBeenCalledWith("member");
  });

  test("crossing the phone breakpoint keeps its value, with no warning about its open state", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      render(<Picker label="Role" items={roles} defaultValue="member" />);
      setPhoneWidth();
      await settle();
      expect(screen.getByRole("button").textContent).toBe("Member");
      expect(
        warn.mock.calls.filter((call) =>
          String(call[0]).includes("uncontrolled"),
        ),
      ).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });

  test("the trigger shows the label alone, not the option's description", async () => {
    render(<Picker label="Role" items={roles} defaultValue="owner" />);
    const trigger = screen.getByRole("button");
    expect(trigger.textContent).toBe("Owner");
  });

  test("opens a tray on a phone, still knowing its items", async () => {
    setPhoneWidth();
    const onChange = vi.fn();
    render(
      <Picker
        label="Role"
        items={roles}
        defaultValue="owner"
        onChange={onChange}
      />,
    );
    const trigger = screen.getByRole("button");
    // The chosen label shows, so the hidden render built the collection.
    expect(trigger.textContent).toBe("Owner");
    const select = testUser.createTester("Select", { root: trigger });
    await select.open();
    const listbox = select.getListbox() as HTMLElement;
    expect(inTray(listbox)).toBe(true);
    expect(inPopover(listbox)).toBe(false);
    await select.toggleOptionSelection({ option: "Member" });
    expect(onChange).toHaveBeenCalledWith("member");
    await settle();
    expect(document.activeElement).toBe(trigger);
  });

  test("keyboard chooses an item; disabled items cannot be chosen", async () => {
    const onChange = vi.fn();
    render(<Picker label="Role" items={roles} onChange={onChange} />);
    const select = new User({ interactionType: "keyboard" }).createTester(
      "Select",
      { root: screen.getByRole("button") },
    );
    await select.open();
    const viewer = select.findOption({ indexOrText: "Viewer" });
    expect(viewer.getAttribute("aria-disabled")).toBe("true");
    await select.toggleOptionSelection({ option: "Member" });
    expect(onChange).toHaveBeenLastCalledWith("member");
  });

  test("an error marks it invalid and shows under it", () => {
    render(<Picker label="Role" items={roles} errorMessage="Choose a role." />);
    expect(screen.getByText("Choose a role.")).toBeTruthy();
    expect(screen.getByRole("button").closest("[data-invalid]")).not.toBeNull();
  });
});

describe("ComboBox on tablet and wider", () => {
  test("filters as you type and chooses an item", async () => {
    const onChange = vi.fn();
    render(<ComboBox label="Assignee" items={members} onChange={onChange} />);
    const comboBox = testUser.createTester("ComboBox", {
      root: screen.getByRole("combobox"),
    });
    const user = userEvent.setup();
    await user.type(comboBox.getCombobox(), "car");
    const options = comboBox.getOptions();
    expect(options.map((option) => option.textContent)).toEqual([
      "Carla Santos",
    ]);
    expect(inPopover(comboBox.getListbox() as HTMLElement)).toBe(true);
    await comboBox.toggleOptionSelection({ option: "Carla Santos" });
    expect(onChange).toHaveBeenCalledWith("u3");
    expect((comboBox.getCombobox() as HTMLInputElement).value).toBe(
      "Carla Santos",
    );
  });

  test("keeps free text when allowed", async () => {
    const onInputChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ComboBox
        label="Assignee"
        items={members}
        allowsCustomValue
        customValueLabel={(text) => `Use ${text}`}
        onInputChange={onInputChange}
      />,
    );
    await user.type(screen.getByRole("combobox"), "Zed");
    await user.tab();
    expect(onInputChange).toHaveBeenLastCalledWith("Zed");
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe(
      "Zed",
    );
  });
});

describe("ComboBox keeps its text and value in step", () => {
  function Controlled({ items = members }: { items?: ChoiceItem[] }) {
    const [value, setValue] = useState<string | null>("u2");
    return (
      <>
        <ComboBox
          label="Assignee"
          items={items}
          value={value}
          onChange={setValue}
        />
        <output>{value ?? "none"}</output>
      </>
    );
  }

  test("a value the screen holds shows its label from the start", () => {
    render(<Controlled />);
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe(
      "Ben Cruz",
    );
  });

  test("on a phone too, and once items that load later arrive", () => {
    setPhoneWidth();
    const { rerender } = render(<Controlled items={[]} />);
    rerender(<Controlled items={members} />);
    expect(
      screen.getByRole("button", { name: /Assignee/ }).textContent,
    ).toContain("Ben Cruz");
  });

  test("list only: text that is not chosen goes back on leaving; emptying clears", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    await user.type(input, "x");
    await user.tab();
    expect(input.value).toBe("Ben Cruz");
    expect(screen.getByRole("status").textContent).toBe("u2");
    await user.clear(input);
    await user.tab();
    expect(screen.getByRole("status").textContent).toBe("none");
    expect(input.value).toBe("");
  });

  test("a screen holding both value and text: emptying a list-only field clears it", async () => {
    const user = userEvent.setup();
    function Both() {
      const [value, setValue] = useState<string | null>("u2");
      const [text, setText] = useState("Ben Cruz");
      return (
        <>
          <ComboBox
            label="Assignee"
            items={members}
            value={value}
            onChange={setValue}
            inputValue={text}
            onInputChange={setText}
          />
          <output>{`${value ?? "none"}|${text}`}</output>
        </>
      );
    }
    render(<Both />);
    await user.clear(screen.getByRole("combobox"));
    await user.tab();
    expect(screen.getByRole("status").textContent).toBe("none|");
  });

  test("Escape in the phone's tray reports nothing", async () => {
    setPhoneWidth();
    const onChange = vi.fn();
    const onInputChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ComboBox
        label="Assignee"
        items={members}
        defaultValue="u2"
        onChange={onChange}
        onInputChange={onInputChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Assignee/ }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(onInputChange).not.toHaveBeenCalled();
  });

  test("a disabled field on a phone submits nothing", () => {
    setPhoneWidth();
    const { container } = render(
      <form>
        <ComboBox
          name="owner"
          label="Owner"
          items={members}
          defaultInputValue="Zed"
          allowsCustomValue
          customValueLabel={(typed) => `Use "${typed}"`}
          isDisabled
        />
      </form>,
    );
    const data = new FormData(
      container.querySelector("form") as HTMLFormElement,
    );
    expect(data.get("owner")).toBeNull();
  });

  test("choosing reports the text once", async () => {
    const onInputChange = vi.fn();
    render(
      <ComboBox
        label="Assignee"
        items={members}
        onInputChange={onInputChange}
      />,
    );
    const comboBox = new User({ interactionType: "keyboard" }).createTester(
      "ComboBox",
      { root: screen.getByRole("combobox") },
    );
    await comboBox.toggleOptionSelection({ option: "Ana Reyes" });
    expect(
      onInputChange.mock.calls.filter(([text]) => text === "Ana Reyes"),
    ).toHaveLength(1);
  });

  test("on a phone, emptying a list-only field and pressing Enter clears it", async () => {
    setPhoneWidth();
    const user = userEvent.setup();
    render(<Controlled />);
    await user.click(screen.getByRole("button", { name: /Assignee/ }));
    await user.clear(screen.getByRole("textbox"));
    await user.keyboard("{Enter}");
    expect(screen.getByRole("status").textContent).toBe("none");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("ComboBox on a phone (design-spec 4.5)", () => {
  function Assignee({
    allowsCustomValue = false,
  }: {
    allowsCustomValue?: boolean;
  }) {
    const [value, setValue] = useState<string | null>("u2");
    const [text, setText] = useState("Ben Cruz");
    return (
      <>
        {allowsCustomValue ? (
          <ComboBox
            label="Assignee"
            items={members}
            value={value}
            onChange={setValue}
            inputValue={text}
            onInputChange={setText}
            allowsCustomValue
            customValueLabel={(typed) => `Use "${typed}"`}
          />
        ) : (
          <ComboBox
            label="Assignee"
            items={members}
            value={value}
            onChange={setValue}
            inputValue={text}
            onInputChange={setText}
          />
        )}
        <output>{`${value ?? "none"}|${text}`}</output>
      </>
    );
  }

  test("looks like a field; pressing it opens a tray with its own input", async () => {
    setPhoneWidth();
    const user = userEvent.setup();
    render(<Assignee />);
    const trigger = screen.getByRole("button", { name: "Assignee Ben Cruz" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Assignee" });
    expect(inTray(dialog)).toBe(true);
    // The tray's input takes focus as it opens; happy-dom focuses the dialog instead,
    // so the E2E test checks that in Chromium.
    const input = within(dialog).getByRole("textbox", { name: "Assignee" });
    // Opened on the current text, the tray lists every item until the user types.
    expect(within(dialog).getAllByRole("option")).toHaveLength(3);
    await user.clear(input);
    await user.type(input, "ana");
    const options = within(dialog).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["Ana Reyes"]);
    await user.click(options[0] as HTMLElement);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("u1|Ana Reyes");
    await settle();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Assignee Ana Reyes" }),
    );
  });

  test("Escape closes the tray without changing the field", async () => {
    setPhoneWidth();
    const user = userEvent.setup();
    render(<Assignee />);
    await user.click(screen.getByRole("button", { name: /Assignee/ }));
    await user.type(screen.getByRole("textbox"), "zzz");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("u2|Ben Cruz");
  });

  test("free text: Enter or the button keeps what was typed", async () => {
    setPhoneWidth();
    const user = userEvent.setup();
    render(<Assignee allowsCustomValue />);
    await user.click(screen.getByRole("button", { name: /Assignee/ }));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Zed{Enter}");
    expect(screen.getByRole("status").textContent).toBe("none|Zed");

    await user.click(screen.getByRole("button", { name: /Assignee/ }));
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "Yan");
    await user.click(screen.getByRole("button", { name: 'Use "Yan"' }));
    expect(screen.getByRole("status").textContent).toBe("none|Yan");
  });

  test("without free text, Enter on no item does nothing", async () => {
    setPhoneWidth();
    const user = userEvent.setup();
    render(<Assignee />);
    await user.click(screen.getByRole("button", { name: /Assignee/ }));
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "Zed{Enter}");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Use/ })).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("u2|Ben Cruz");
  });

  test("submits the chosen id under its name, or the text when free text is allowed", async () => {
    setPhoneWidth();
    const user = userEvent.setup();
    const { container } = render(
      <form>
        <ComboBox
          name="assignee"
          label="Assignee"
          items={members}
          defaultValue="u2"
        />
        <ComboBox
          name="owner"
          label="Owner"
          items={members}
          allowsCustomValue
          customValueLabel={(typed) => `Use "${typed}"`}
        />
      </form>,
    );
    await user.click(screen.getByRole("button", { name: /^Owner/ }));
    await user.type(screen.getByRole("textbox"), "Zed{Enter}");
    const data = new FormData(
      container.querySelector("form") as HTMLFormElement,
    );
    expect(data.get("assignee")).toBe("u2");
    expect(data.get("owner")).toBe("Zed");
  });

  test("shows the error and the help under the trigger and describes it with them", () => {
    setPhoneWidth();
    render(
      <ComboBox
        label="Time zone"
        items={members}
        description="Where you are."
        errorMessage="Choose a time zone."
      />,
    );
    const trigger = screen.getByRole("button", { name: /Time zone/ });
    const describedBy = trigger.getAttribute("aria-describedby") ?? "";
    expect(describedBy.split(" ")).toHaveLength(2);
    expect(trigger.closest("[data-invalid]")).not.toBeNull();
    expect(screen.getByText("Choose a time zone.")).toBeTruthy();
  });
});

describe("DatePicker", () => {
  test("shows the date in en-PH order and reports an ISO date", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DatePicker
        label="Deadline"
        defaultValue="2026-10-16"
        onChange={onChange}
      />,
    );
    const group = screen.getByRole("group", { name: "Deadline" });
    const segments = within(group).getAllByRole("spinbutton");
    expect(segments.map((segment) => segment.textContent)).toEqual([
      "10",
      "16",
      "2026",
    ]);
    await user.click(within(group).getByRole("button"));
    const dialog = screen.getByRole("dialog");
    expect(inPopover(dialog)).toBe(true);
    await user.click(
      within(dialog).getByRole("button", { name: /October 20, 2026/ }),
    );
    expect(onChange).toHaveBeenLastCalledWith("2026-10-20");
  });

  test("keeps en-PH and React Aria's English even when the browser speaks another language", () => {
    const language = vi
      .spyOn(navigator, "language", "get")
      .mockReturnValue("ja-JP");
    try {
      render(
        <div>
          <DatePicker label="Deadline" defaultValue="2026-10-16" />
          <AriaDateField
            aria-label="Unfixed"
            defaultValue={parseDate("2026-10-16")}
          >
            <DateInput>
              {(segment) => <DateSegment segment={segment} />}
            </DateInput>
          </AriaDateField>
        </div>,
      );
      // React Aria reads the language again when the browser announces a change, with
      // a field on the page to listen.
      act(() => {
        window.dispatchEvent(new Event("languagechange"));
      });
      const order = (name: string) =>
        within(screen.getByRole("group", { name }))
          .getAllByRole("spinbutton")
          .map((segment) => segment.textContent);
      // A field outside FixedLocale follows the browser: year first in Japanese.
      expect(order("Unfixed")[0]).toBe("2026");
      expect(order("Deadline")).toEqual(["10", "16", "2026"]);
      // The segments' names come from React Aria, not the catalog (SDD 9章「React Aria の
      // 文言」): English under FixedLocale, the browser's language without it.
      const names = (name: string) =>
        within(screen.getByRole("group", { name }))
          .getAllByRole("spinbutton")
          .map((segment) => segment.getAttribute("aria-label")?.split(",")[0]);
      expect(names("Deadline")).toEqual(["month", "day", "year"]);
      expect(names("Unfixed")).not.toContain("year");
    } finally {
      language.mockRestore();
      act(() => {
        window.dispatchEvent(new Event("languagechange"));
      });
    }
  });

  test("opens the calendar in a tray on a phone", async () => {
    setPhoneWidth();
    const user = userEvent.setup();
    render(<DatePicker label="Deadline" defaultValue="2026-10-16" />);
    await user.click(
      within(screen.getByRole("group", { name: "Deadline" })).getByRole(
        "button",
      ),
    );
    const dialog = screen.getByRole("dialog");
    expect(inTray(dialog)).toBe(true);
    expect(within(dialog).getByRole("grid")).toBeTruthy();
  });

  test("an error marks it invalid", () => {
    render(<DatePicker label="Date" errorMessage="Enter a date." />);
    expect(screen.getByText("Enter a date.")).toBeTruthy();
    expect(
      screen.getByRole("group", { name: "Date" }).closest("[data-invalid]"),
    ).not.toBeNull();
  });
});
