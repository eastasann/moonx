import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToggleButtonGroup, ToggleButtonGroupItem } from "../src/components/ToggleButtonGroup";
import { expectNoAxeViolations } from "./axe";
import { expectPressedLifecycle } from "./pressed";

function Fau(props: Partial<React.ComponentProps<typeof ToggleButtonGroup>>) {
  return (
    <ToggleButtonGroup aria-label="Fact, assumption or unknown" {...props}>
      <ToggleButtonGroupItem value="fact" aria-label="Fact">
        F
      </ToggleButtonGroupItem>
      <ToggleButtonGroupItem value="assumption" aria-label="Assumption">
        A
      </ToggleButtonGroupItem>
      <ToggleButtonGroupItem value="unknown" aria-label="Unknown" isDisabled>
        U
      </ToggleButtonGroupItem>
    </ToggleButtonGroup>
  );
}

describe("ToggleButtonGroup", () => {
  test.each(["S", "M", "L", "XL"] as const)("renders three buttons at size %s", (size) => {
    render(<Fau size={size} />);
    expect(
      screen.getByRole("radiogroup", { name: "Fact, assumption or unknown" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  test("chooses one, replaces it with another, and clears it by pressing it again", async () => {
    const onChange = vi.fn();
    render(<Fau onChange={onChange} />);
    const fact = screen.getByRole("radio", { name: "Fact" });
    const assumption = screen.getByRole("radio", { name: "Assumption" });
    await userEvent.click(fact);
    expect(onChange).toHaveBeenLastCalledWith("fact");
    expect(fact).toBeChecked();
    expect(fact).toHaveAttribute("data-selected");
    await userEvent.click(assumption);
    expect(onChange).toHaveBeenLastCalledWith("assumption");
    expect(fact).not.toBeChecked();
    await userEvent.click(assumption);
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(assumption).not.toBeChecked();
  });

  test("a controlled null shows no selection", () => {
    const { rerender } = render(<Fau value={null} onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "Fact" })).not.toBeChecked();
    rerender(<Fau value="fact" onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "Fact" })).toBeChecked();
  });

  test("toggles with the keyboard and moves with the arrow keys", async () => {
    const onChange = vi.fn();
    render(<Fau onChange={onChange} />);
    await userEvent.tab();
    expect(screen.getByRole("radio", { name: "Fact" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Fact" })).toHaveAttribute("data-focus-visible");
    await userEvent.keyboard(" ");
    expect(onChange).toHaveBeenLastCalledWith("fact");
    await userEvent.keyboard(" ");
    expect(onChange).toHaveBeenLastCalledWith(null);
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Assumption" })).toHaveFocus();
  });

  test("sets state attributes for hover and disabled", async () => {
    const onChange = vi.fn();
    render(<Fau onChange={onChange} />);
    await userEvent.hover(screen.getByRole("radio", { name: "Fact" }));
    expect(screen.getByRole("radio", { name: "Fact" })).toHaveAttribute("data-hovered");
    const unknown = screen.getByRole("radio", { name: "Unknown" });
    expect(unknown).toHaveAttribute("data-disabled");
    await userEvent.click(unknown);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("an item is pressed while held and released after, by pointer and keyboard", async () => {
    const user = userEvent.setup();
    render(<Fau />);
    await expectPressedLifecycle(screen.getByRole("radio", { name: "Fact" }), user);
  });

  test("a disabled item is never pressed, hovered, or reached by Tab", async () => {
    const user = userEvent.setup();
    render(<Fau />);
    const unknown = screen.getByRole("radio", { name: "Unknown" });
    await user.hover(unknown);
    expect(unknown).not.toHaveAttribute("data-hovered");
    await user.pointer({ keys: "[MouseLeft>]", target: unknown });
    expect(unknown).not.toHaveAttribute("data-pressed");
    await user.pointer({ keys: "[/MouseLeft]" });
    await user.tab();
    await user.tab();
    expect(unknown).not.toHaveFocus();
  });

  test("a pointer click does not show data-focus-visible", async () => {
    const user = userEvent.setup();
    render(<Fau />);
    const fact = screen.getByRole("radio", { name: "Fact" });
    await user.click(fact);
    expect(fact).toHaveFocus();
    expect(fact).not.toHaveAttribute("data-focus-visible");
  });

  test("has no axe violations", async () => {
    const { container } = render(<Fau defaultValue="fact" />);
    await expectNoAxeViolations(container);
  });
});
