import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { ComboBox, ComboBoxItem, type ComboBoxProps } from "../src/components/ComboBox";
import { expectNoAxeViolations } from "./axe";
import { mockNarrow } from "./matchMedia";
import { expectOverlayTriggerPressedLifecycle } from "./pressed";

/** The popover is portaled outside the page landmark, so `region` (a page-level rule) is off for it. */
async function expectNoOverlayViolations() {
  const result = await axe.run(document.body, {
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  expect(result.violations.map((v) => v.id)).toEqual([]);
}

type AssigneeProps = Omit<Partial<ComboBoxProps>, "allowsCustomValue" | "customValueLabel"> & {
  custom?: boolean;
};

function Assignee({ custom, ...props }: AssigneeProps) {
  const items = [
    <ComboBoxItem key="ana" id="ana">
      Ana Reyes
    </ComboBoxItem>,
    <ComboBoxItem key="ben" id="ben">
      Ben Cruz
    </ComboBoxItem>,
    <ComboBoxItem key="ana2" id="ana2">
      Anabel Lim
    </ComboBoxItem>,
  ];
  return custom ? (
    <ComboBox
      label="Owner"
      openLabel="Show members"
      emptyMessage="No match"
      allowsCustomValue
      customValueLabel="Use this text"
      {...props}
    >
      {items}
    </ComboBox>
  ) : (
    <ComboBox label="Owner" openLabel="Show members" emptyMessage="No match" {...props}>
      {items}
    </ComboBox>
  );
}

describe("ComboBox", () => {
  test.each(["S", "M", "L", "XL"] as const)(
    "renders a combobox with an open button at size %s",
    (size) => {
      render(<Assignee size={size} />);
      expect(screen.getByRole("combobox", { name: "Owner" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Show members/ })).toBeInTheDocument();
    },
  );

  test("filters while typing and chooses with Enter", async () => {
    const onChange = vi.fn();
    render(<Assignee onChange={onChange} />);
    await userEvent.type(screen.getByRole("combobox", { name: "Owner" }), "ana");
    const list = await screen.findByRole("listbox");
    expect(
      within(list)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Ana Reyes", "Anabel Lim"]);
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("ana");
    expect(screen.getByRole("combobox", { name: "Owner" })).toHaveValue("Ana Reyes");
  });

  test("the open button lists everything and a click chooses", async () => {
    const onChange = vi.fn();
    render(<Assignee onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Show members/ }));
    const list = await screen.findByRole("listbox");
    await userEvent.click(within(list).getByRole("option", { name: "Ben Cruz" }));
    expect(onChange).toHaveBeenCalledWith("ben");
  });

  test.each(["pointer", "Enter", "Space"] as const)(
    "%s press sets data-pressed on the open button, kept while open and removed on close",
    async (way) => {
      const user = userEvent.setup();
      render(<Assignee />);
      await expectOverlayTriggerPressedLifecycle(
        screen.getByRole("button", { name: /Show members/ }),
        user,
        way,
      );
    },
  );

  test("the open button shows data-hovered on hover and clears on leaving", async () => {
    const user = userEvent.setup();
    render(<Assignee />);
    const open = screen.getByRole("button", { name: /Show members/ });
    await user.hover(open);
    expect(open).toHaveAttribute("data-hovered");
    await user.unhover(open);
    expect(open).not.toHaveAttribute("data-hovered");
  });

  test("keeps free text when allowsCustomValue is set", async () => {
    const onInputChange = vi.fn();
    render(<Assignee custom onInputChange={onInputChange} />);
    const input = screen.getByRole("combobox", { name: "Owner" });
    await userEvent.type(input, "Carla{Enter}");
    await userEvent.tab();
    expect(input).toHaveValue("Carla");
    expect(onInputChange).toHaveBeenLastCalledWith("Carla");
  });

  test("shows the empty message when nothing matches", async () => {
    render(<Assignee />);
    await userEvent.type(screen.getByRole("combobox", { name: "Owner" }), "zzz");
    expect(await screen.findByText("No match")).toBeInTheDocument();
  });

  test("marks invalid and required with description and error message", () => {
    render(
      <Assignee description="Who does it" errorMessage="Pick an owner" isInvalid isRequired />,
    );
    const input = screen.getByRole("combobox", { name: "Owner" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toBeRequired();
    expect(input).toHaveAccessibleDescription("Who does it Pick an owner");
  });

  test("sets state attributes for hover, keyboard focus and disabled", async () => {
    const { rerender } = render(<Assignee />);
    const input = screen.getByRole("combobox", { name: "Owner" });
    await userEvent.hover(input);
    expect(input.parentElement).toHaveAttribute("data-hovered");
    await userEvent.tab();
    expect(input).toHaveAttribute("data-focus-visible");
    expect(input.parentElement).toHaveAttribute("data-focus-within");
    rerender(<Assignee isDisabled />);
    expect(screen.getByRole("combobox", { name: "Owner" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Owner" }).parentElement).toHaveAttribute(
      "data-disabled",
    );
  });

  test("has no axe violations closed and open", async () => {
    const { container } = render(<Assignee description="Hint" />);
    await expectNoAxeViolations(container);
    await userEvent.click(screen.getByRole("button", { name: /Show members/ }));
    await screen.findByRole("listbox");
    await expectNoOverlayViolations();
  });
});

describe("ComboBox on a narrow viewport", () => {
  beforeEach(() => mockNarrow(true));

  const openTray = async () => {
    await userEvent.click(screen.getByRole("button", { name: /Owner/ }));
    return screen.findByRole("dialog", { name: "Owner" });
  };

  test.each(["S", "M", "L", "XL"] as const)("renders a field-like button at size %s", (size) => {
    render(<Assignee size={size} placeholder="Choose" />);
    const button = screen.getByRole("button", { name: /Owner/ });
    expect(button).toHaveTextContent("Choose");
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  test("shows the chosen item's text, also for a controlled value", () => {
    render(<Assignee value="ben" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /Owner/ })).toHaveTextContent("Ben Cruz");
  });

  test("opens a tray with its own search field and the list", async () => {
    render(<Assignee />);
    const dialog = await openTray();
    expect(dialog.closest("[class*='ResponsivePopover_tray']")).not.toBeNull();
    expect(within(dialog).getByRole("textbox", { name: "Owner" })).toHaveFocus();
    expect(within(dialog).getAllByRole("option")).toHaveLength(3);
  });

  test("filters while typing, chooses with a press, and closes with the value in the field", async () => {
    const onChange = vi.fn();
    const onInputChange = vi.fn();
    render(<Assignee onChange={onChange} onInputChange={onInputChange} />);
    const dialog = await openTray();
    await userEvent.type(within(dialog).getByRole("textbox"), "ana");
    expect(
      within(dialog)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Ana Reyes", "Anabel Lim"]);
    await userEvent.click(within(dialog).getByRole("option", { name: "Anabel Lim" }));
    expect(onChange).toHaveBeenCalledWith("ana2");
    expect(onInputChange).toHaveBeenCalledWith("Anabel Lim");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Owner/ })).toHaveTextContent("Anabel Lim");
  });

  test("chooses with ArrowDown and Enter", async () => {
    const onChange = vi.fn();
    render(<Assignee onChange={onChange} />);
    const dialog = await openTray();
    await userEvent.type(within(dialog).getByRole("textbox"), "ben");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("ben");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("pressing the item that is already chosen still closes the tray", async () => {
    const onChange = vi.fn();
    render(<Assignee defaultValue="ben" onChange={onChange} />);
    const dialog = await openTray();
    const ben = within(dialog).getByRole("option", { name: "Ben Cruz" });
    expect(ben).toHaveAttribute("aria-selected", "true");
    expect(within(dialog).getByRole("option", { name: "Ana Reyes" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    await userEvent.click(ben);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Owner/ })).toHaveTextContent("Ben Cruz");
  });

  test("re-choosing the chosen item with Enter closes the tray and keeps the value", async () => {
    const onChange = vi.fn();
    render(<Assignee defaultValue="ben" onChange={onChange} />);
    const dialog = await openTray();
    await userEvent.type(within(dialog).getByRole("textbox"), "ben");
    await userEvent.keyboard("{ArrowDown}");
    expect(within(dialog).getByRole("option", { name: "Ben Cruz" })).toHaveAttribute(
      "data-focused",
    );
    await userEvent.keyboard("{Enter}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith("ben");
    expect(screen.getByRole("button", { name: /Owner/ })).toHaveTextContent("Ben Cruz");
  });

  test("Space types into the search field instead of choosing, as in any text combobox", async () => {
    const onChange = vi.fn();
    render(<Assignee defaultValue="ben" onChange={onChange} />);
    const dialog = await openTray();
    const input = within(dialog).getByRole("textbox");
    await userEvent.type(input, "ben");
    await userEvent.keyboard("{ArrowDown} ");
    expect(input).toHaveValue("ben ");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  test("choosing another item moves aria-selected and closes with the new value", async () => {
    render(<Assignee defaultValue="ben" />);
    let dialog = await openTray();
    await userEvent.click(within(dialog).getByRole("option", { name: "Ana Reyes" }));
    expect(screen.getByRole("button", { name: /Owner/ })).toHaveTextContent("Ana Reyes");
    dialog = await openTray();
    expect(within(dialog).getByRole("option", { name: "Ana Reyes" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(dialog).getByRole("option", { name: "Ben Cruz" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  test("Escape closes the tray and changes nothing", async () => {
    const onChange = vi.fn();
    render(<Assignee onChange={onChange} />);
    const dialog = await openTray();
    await userEvent.type(within(dialog).getByRole("textbox"), "ben");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: /Owner/ })).toHaveFocus());
  });

  test("without allowsCustomValue there is no action for typed text", async () => {
    render(<Assignee />);
    const dialog = await openTray();
    await userEvent.type(within(dialog).getByRole("textbox"), "Carla{Enter}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Use this text" })).not.toBeInTheDocument();
  });

  test("allowsCustomValue confirms the typed text with Enter", async () => {
    const onChange = vi.fn();
    const onInputChange = vi.fn();
    render(<Assignee custom onChange={onChange} onInputChange={onInputChange} />);
    const dialog = await openTray();
    await userEvent.type(within(dialog).getByRole("textbox"), "Carla{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(onInputChange).toHaveBeenLastCalledWith("Carla");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Owner/ })).toHaveTextContent("Carla");
  });

  test("allowsCustomValue confirms the typed text with the labelled action", async () => {
    const onInputChange = vi.fn();
    render(<Assignee custom onInputChange={onInputChange} />);
    const dialog = await openTray();
    const use = within(dialog).getByRole("button", { name: "Use this text" });
    expect(use).toBeDisabled();
    await userEvent.type(within(dialog).getByRole("textbox"), "Carla");
    await userEvent.click(use);
    expect(onInputChange).toHaveBeenLastCalledWith("Carla");
    expect(screen.getByRole("button", { name: /Owner/ })).toHaveTextContent("Carla");
  });

  test("allowsCustomValue starts the search field with the current text", async () => {
    render(<Assignee custom defaultInputValue="Carla" />);
    const dialog = await openTray();
    expect(within(dialog).getByRole("textbox")).toHaveValue("Carla");
  });

  test("Enter on a highlighted item chooses it instead of the typed text", async () => {
    const onChange = vi.fn();
    render(<Assignee custom onChange={onChange} />);
    const dialog = await openTray();
    await userEvent.type(within(dialog).getByRole("textbox"), "ben");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("ben");
  });

  test("shows the empty message when nothing matches", async () => {
    render(<Assignee />);
    const dialog = await openTray();
    await userEvent.type(within(dialog).getByRole("textbox"), "zzz");
    expect(within(dialog).getByText("No match")).toBeInTheDocument();
  });

  test("a disabled field does not open and marks the state", async () => {
    render(<Assignee isDisabled />);
    const button = screen.getByRole("button", { name: /Owner/ });
    expect(button).toHaveAttribute("data-disabled");
    await userEvent.click(button);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("sets state attributes for hover and keyboard focus, and connects help text", async () => {
    render(
      <Assignee description="Who does it" errorMessage="Pick an owner" isInvalid isRequired />,
    );
    const button = screen.getByRole("button", { name: /Owner/ });
    await userEvent.hover(button);
    expect(button).toHaveAttribute("data-hovered");
    await userEvent.tab();
    expect(button).toHaveAttribute("data-focus-visible");
    expect(button).toHaveAttribute("data-invalid");
    expect(button).toHaveAccessibleDescription("Who does it Pick an owner");
  });

  test("submits the chosen id under name", async () => {
    const { container } = render(<Assignee name="owner" defaultValue="ben" />);
    expect(container.querySelector("input[name='owner']")).toHaveValue("ben");
  });

  test("has no axe violations closed and open", async () => {
    const { container } = render(<Assignee custom description="Hint" />);
    await expectNoAxeViolations(container);
    await openTray();
    await expectNoOverlayViolations();
  });
});
