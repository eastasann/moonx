import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SegmentedControl, SegmentedControlItem } from "../src/components/SegmentedControl";
import { expectNoAxeViolations } from "./axe";
import { expectPressedLifecycle } from "./pressed";

function Confidence(props: Partial<React.ComponentProps<typeof SegmentedControl>>) {
  return (
    <SegmentedControl aria-label="Confidence" defaultValue="medium" {...props}>
      <SegmentedControlItem value="low">Low</SegmentedControlItem>
      <SegmentedControlItem value="medium">Medium</SegmentedControlItem>
      <SegmentedControlItem value="high" isDisabled>
        High
      </SegmentedControlItem>
    </SegmentedControl>
  );
}

describe("SegmentedControl", () => {
  test.each(["S", "M", "L", "XL"] as const)("renders its segments at size %s", (size) => {
    render(<Confidence size={size} />);
    expect(screen.getByRole("radiogroup", { name: "Confidence" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  test("starts with the default segment chosen", () => {
    render(<Confidence />);
    expect(screen.getByRole("radio", { name: "Medium" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Medium" })).toHaveAttribute("data-selected");
  });

  test("changes the segment and never ends with none chosen", async () => {
    const onChange = vi.fn();
    render(<Confidence onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Low" }));
    expect(onChange).toHaveBeenLastCalledWith("low");
    onChange.mockClear();
    await userEvent.click(screen.getByRole("radio", { name: "Low" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: "Low" })).toBeChecked();
  });

  test("follows a controlled value", () => {
    const { rerender } = render(<Confidence value="low" onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "Low" })).toBeChecked();
    rerender(<Confidence value="medium" onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "Medium" })).toBeChecked();
  });

  test("moves with the arrow keys and chooses with Space", async () => {
    const onChange = vi.fn();
    render(<Confidence onChange={onChange} />);
    await userEvent.tab();
    expect(screen.getByRole("radio", { name: "Low" })).toHaveAttribute("data-focus-visible");
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Medium" })).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft} ");
    expect(onChange).toHaveBeenLastCalledWith("low");
  });

  test("sets state attributes for hover and disabled", async () => {
    const onChange = vi.fn();
    render(<Confidence onChange={onChange} />);
    await userEvent.hover(screen.getByRole("radio", { name: "Low" }));
    expect(screen.getByRole("radio", { name: "Low" })).toHaveAttribute("data-hovered");
    const high = screen.getByRole("radio", { name: "High" });
    expect(high).toHaveAttribute("data-disabled");
    await userEvent.click(high);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("a segment is pressed while held and released after, by pointer and keyboard", async () => {
    const user = userEvent.setup();
    render(<Confidence />);
    await expectPressedLifecycle(screen.getByRole("radio", { name: "Low" }), user);
  });

  test("the chosen segment can be pressed too", async () => {
    const user = userEvent.setup();
    render(<Confidence />);
    await expectPressedLifecycle(screen.getByRole("radio", { name: "Medium" }), user);
  });

  test("a disabled segment is never pressed, hovered, or reached by Tab", async () => {
    const user = userEvent.setup();
    render(<Confidence />);
    const high = screen.getByRole("radio", { name: "High" });
    await user.hover(high);
    expect(high).not.toHaveAttribute("data-hovered");
    await user.pointer({ keys: "[MouseLeft>]", target: high });
    expect(high).not.toHaveAttribute("data-pressed");
    await user.pointer({ keys: "[/MouseLeft]" });
    await user.tab();
    await user.tab();
    await user.tab();
    expect(high).not.toHaveFocus();
  });

  test("a pointer click does not show data-focus-visible", async () => {
    const user = userEvent.setup();
    render(<Confidence />);
    const low = screen.getByRole("radio", { name: "Low" });
    await user.click(low);
    expect(low).toHaveFocus();
    expect(low).not.toHaveAttribute("data-focus-visible");
  });

  test("has no axe violations", async () => {
    const { container } = render(<Confidence />);
    await expectNoAxeViolations(container);
  });
});
