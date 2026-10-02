import { CalendarDate } from "@internationalized/date";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { DatePicker } from "../src/components/DatePicker";
import { expectNoAxeViolations } from "./axe";
import { mockNarrow } from "./matchMedia";
import {
  expectOverlayTriggerPressedLifecycle,
  expectPressedClearsOnLeave,
  expectPressedLifecycle,
} from "./pressed";

function Deadline(props: Partial<React.ComponentProps<typeof DatePicker>>) {
  return (
    <DatePicker
      label="Deadline"
      openLabel="Open calendar"
      previousMonthLabel="Previous month"
      nextMonthLabel="Next month"
      {...props}
    />
  );
}

/** The popover is portaled outside the page landmark, so `region` (a page-level rule) is off for it. */
async function expectNoOverlayViolations() {
  const result = await axe.run(document.body, {
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  expect(result.violations.map((v) => v.id)).toEqual([]);
}

const october = new CalendarDate(2026, 10, 2);

describe("DatePicker", () => {
  test.each(["S", "M", "L", "XL"] as const)(
    "renders day, month and year segments at size %s",
    (size) => {
      render(<Deadline size={size} defaultValue={october} />);
      const group = screen.getByRole("group", { name: /Deadline/ });
      expect(within(group).getAllByRole("spinbutton")).toHaveLength(3);
      expect(screen.getByRole("button", { name: /Open calendar/ })).toBeInTheDocument();
    },
  );

  test("shows the value in en-PH order", () => {
    render(<Deadline defaultValue={october} />);
    const values = screen.getAllByRole("spinbutton").map((s) => s.textContent);
    expect(values).toEqual(["10", "2", "2026"]);
  });

  test("types a date into the segments", async () => {
    const onChange = vi.fn();
    render(<Deadline onChange={onChange} />);
    const [month] = screen.getAllByRole("spinbutton");
    await userEvent.click(month as HTMLElement);
    await userEvent.keyboard("12252026");
    expect(onChange).toHaveBeenLastCalledWith(new CalendarDate(2026, 12, 25));
  });

  test("picks a date from the calendar and closes it", async () => {
    const onChange = vi.fn();
    render(<Deadline defaultValue={october} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Open calendar/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /October 15, 2026/ }));
    expect(onChange).toHaveBeenCalledWith(new CalendarDate(2026, 10, 15));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("moves between months with the labelled buttons", async () => {
    render(<Deadline defaultValue={october} />);
    await userEvent.click(screen.getByRole("button", { name: /Open calendar/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Next month" }));
    expect(within(dialog).getByRole("button", { name: /November 3, 2026/ })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Previous month" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Previous month" }));
    expect(within(dialog).getByRole("button", { name: /September 3, 2026/ })).toBeInTheDocument();
  });

  test("picks with the keyboard and closes with Escape", async () => {
    const onChange = vi.fn();
    render(<Deadline defaultValue={october} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Open calendar/ }));
    await screen.findByRole("dialog");
    await userEvent.keyboard("{ArrowRight}{Enter}");
    expect(onChange).toHaveBeenCalledWith(new CalendarDate(2026, 10, 3));
    await userEvent.click(screen.getByRole("button", { name: /Open calendar/ }));
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("blocks dates outside minValue and maxValue", async () => {
    const onChange = vi.fn();
    render(
      <Deadline
        defaultValue={october}
        minValue={new CalendarDate(2026, 10, 1)}
        maxValue={new CalendarDate(2026, 10, 20)}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Open calendar/ }));
    const dialog = await screen.findByRole("dialog");
    const late = within(dialog).getByRole("button", { name: /October 25, 2026/ });
    expect(late.closest("[data-disabled]")).not.toBeNull();
    await userEvent.click(late);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("opens as a tray on a narrow viewport", async () => {
    mockNarrow(true);
    const onChange = vi.fn();
    render(<Deadline defaultValue={october} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Open calendar/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.closest("[class*='ResponsivePopover_tray']")).not.toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: /October 9, 2026/ }));
    expect(onChange).toHaveBeenCalledWith(new CalendarDate(2026, 10, 9));
  });

  test("marks invalid and required with description and error message", () => {
    render(
      <Deadline description="Plan end date" errorMessage="Pick a date" isInvalid isRequired />,
    );
    const group = screen.getByRole("group", { name: /Deadline/ });
    expect(group).toHaveAttribute("data-invalid");
    expect(group.closest("[data-required]")).not.toBeNull();
    expect(screen.getByText("Pick a date")).toBeInTheDocument();
    expect(screen.getByText("Plan end date")).toBeInTheDocument();
  });

  test("sets state attributes for hover, keyboard focus and disabled", async () => {
    const { rerender } = render(<Deadline defaultValue={october} />);
    const group = screen.getByRole("group", { name: /Deadline/ });
    await userEvent.hover(group);
    expect(group).toHaveAttribute("data-hovered");
    await userEvent.tab();
    expect(group).toHaveAttribute("data-focus-within");
    expect(screen.getAllByRole("spinbutton")[0]).toHaveAttribute("data-focused");
    rerender(<Deadline defaultValue={october} isDisabled />);
    expect(screen.getByRole("group", { name: /Deadline/ })).toHaveAttribute("data-disabled");
    expect(screen.getByRole("button", { name: /Open calendar/ })).toBeDisabled();
  });

  test.each(["pointer", "Enter", "Space"] as const)(
    "%s press sets data-pressed on the open button, kept while open and removed on close",
    async (way) => {
      const user = userEvent.setup();
      render(<Deadline defaultValue={october} />);
      await expectOverlayTriggerPressedLifecycle(
        screen.getByRole("button", { name: /Open calendar/ }),
        user,
        way,
      );
    },
  );

  test("the month buttons are pressed while held and released after, by pointer and keyboard", async () => {
    const user = userEvent.setup();
    render(<Deadline defaultValue={october} />);
    await user.click(screen.getByRole("button", { name: /Open calendar/ }));
    const dialog = await screen.findByRole("dialog");
    await expectPressedLifecycle(within(dialog).getByRole("button", { name: "Next month" }), user);
    await expectPressedLifecycle(
      within(dialog).getByRole("button", { name: "Previous month" }),
      user,
    );
  });

  // Why: releasing a press on a day selects it and closes the calendar, which unmounts the cell, so
  // the release cannot show the attribute going away. The pointer leaves with the button held
  // instead, which clears it on a node that is still mounted; the key check stops at the held key.
  test("a day is pressed while held and clears when the pointer leaves, without selecting", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Deadline defaultValue={october} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /Open calendar/ }));
    const dialog = await screen.findByRole("dialog");
    const day = within(dialog).getByRole("button", { name: /October 15, 2026/ });
    const cell = day.closest("td")?.firstElementChild as HTMLElement;
    await expectPressedClearsOnLeave(cell, user);
    expect(onChange).not.toHaveBeenCalled();
    cell.focus();
    await user.keyboard("{Enter>}");
    expect(cell).toHaveAttribute("data-pressed");
  });

  test("tabbing reaches the open button with data-focus-visible, a click does not", async () => {
    const user = userEvent.setup();
    render(<Deadline defaultValue={october} />);
    const open = screen.getByRole("button", { name: /Open calendar/ });
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    expect(open).toHaveFocus();
    expect(open).toHaveAttribute("data-focus-visible");
    await user.tab();
    expect(open).not.toHaveAttribute("data-focus-visible");
    await user.click(open);
    await screen.findByRole("dialog");
    await user.click(document.body);
    await waitFor(() => expect(open).toHaveFocus());
    expect(open).not.toHaveAttribute("data-focus-visible");
  });

  test("the open button shows data-hovered on hover and clears on leaving", async () => {
    const user = userEvent.setup();
    render(<Deadline defaultValue={october} />);
    const open = screen.getByRole("button", { name: /Open calendar/ });
    await user.hover(open);
    expect(open).toHaveAttribute("data-hovered");
    await user.unhover(open);
    expect(open).not.toHaveAttribute("data-hovered");
  });

  test("has no axe violations closed and open", async () => {
    const { container } = render(<Deadline description="Plan end date" defaultValue={october} />);
    await expectNoAxeViolations(container);
    await userEvent.click(screen.getByRole("button", { name: /Open calendar/ }));
    await screen.findByRole("dialog");
    await expectNoOverlayViolations();
  });
});
