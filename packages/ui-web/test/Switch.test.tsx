import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Switch } from "../src/components/Switch";
import { expectNoAxeViolations } from "./axe";

describe("Switch", () => {
  test.each(["S", "M", "L", "XL"] as const)("renders a labelled switch at size %s", (size) => {
    render(<Switch size={size}>Focus</Switch>);
    expect(screen.getByRole("switch", { name: "Focus" })).not.toBeChecked();
  });

  test("toggles with the pointer and the Space key", async () => {
    const onChange = vi.fn();
    render(<Switch onChange={onChange}>Focus</Switch>);
    const control = screen.getByRole("switch", { name: "Focus" });
    await userEvent.click(control);
    expect(onChange).toHaveBeenLastCalledWith(true);
    expect(control.closest("label")).toHaveAttribute("data-selected");
    await userEvent.keyboard(" ");
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  test("connects the description", () => {
    render(<Switch description="Hides everything but the current question">Focus</Switch>);
    expect(screen.getByRole("switch", { name: "Focus" })).toHaveAccessibleDescription(
      "Hides everything but the current question",
    );
  });

  test("a controlled switch follows isSelected", () => {
    const { rerender } = render(
      <Switch isSelected={false} onChange={() => {}}>
        Focus
      </Switch>,
    );
    expect(screen.getByRole("switch")).not.toBeChecked();
    rerender(
      <Switch isSelected onChange={() => {}}>
        Focus
      </Switch>,
    );
    expect(screen.getByRole("switch")).toBeChecked();
  });

  test("sets state attributes for hover, keyboard focus and disabled", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<Switch onChange={onChange}>Focus</Switch>);
    const label = screen.getByRole("switch", { name: "Focus" }).closest("label");
    await userEvent.hover(screen.getByText("Focus"));
    expect(label).toHaveAttribute("data-hovered");
    await userEvent.tab();
    expect(label).toHaveAttribute("data-focus-visible");
    rerender(
      <Switch isDisabled onChange={onChange}>
        Focus
      </Switch>,
    );
    expect(screen.getByRole("switch", { name: "Focus" }).closest("label")).toHaveAttribute(
      "data-disabled",
    );
    await userEvent.click(screen.getByText("Focus"));
    expect(onChange).not.toHaveBeenCalled();
  });

  test("has no axe violations", async () => {
    const { container } = render(<Switch description="Hint">Focus</Switch>);
    await expectNoAxeViolations(container);
  });
});
