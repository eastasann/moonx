import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Checkbox } from "../src/components/Checkbox";
import { expectNoAxeViolations } from "./axe";

describe("Checkbox", () => {
  test.each(["S", "M", "L", "XL"] as const)("renders a labelled checkbox at size %s", (size) => {
    render(<Checkbox size={size}>Apply</Checkbox>);
    expect(screen.getByRole("checkbox", { name: "Apply" })).not.toBeChecked();
  });

  test("toggles with the pointer and the Space key", async () => {
    const onChange = vi.fn();
    render(<Checkbox onChange={onChange}>Apply</Checkbox>);
    const box = screen.getByRole("checkbox", { name: "Apply" });
    await userEvent.click(box);
    expect(onChange).toHaveBeenLastCalledWith(true);
    expect(box.closest("label")).toHaveAttribute("data-selected");
    await userEvent.keyboard(" ");
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  test("shows the indeterminate state", () => {
    render(<Checkbox isIndeterminate>Select all</Checkbox>);
    const box = screen.getByRole("checkbox", { name: "Select all" });
    expect(box).toBePartiallyChecked();
    expect(box.closest("label")).toHaveAttribute("data-indeterminate");
  });

  test("connects description and error message, and marks invalid and required", () => {
    render(
      <Checkbox
        description="Writes to the plan"
        errorMessage="Confirm to continue"
        isInvalid
        isRequired
      >
        Apply
      </Checkbox>,
    );
    const box = screen.getByRole("checkbox", { name: "Apply" });
    expect(box).toBeRequired();
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveAccessibleDescription("Writes to the plan Confirm to continue");
  });

  test("hides the error message while valid", () => {
    render(<Checkbox errorMessage="Confirm to continue">Apply</Checkbox>);
    expect(screen.queryByText("Confirm to continue")).not.toBeInTheDocument();
  });

  test("sets state attributes for hover, keyboard focus and disabled", async () => {
    const { rerender } = render(<Checkbox>Apply</Checkbox>);
    const label = screen.getByRole("checkbox", { name: "Apply" }).closest("label");
    await userEvent.hover(screen.getByText("Apply"));
    expect(label).toHaveAttribute("data-hovered");
    await userEvent.tab();
    expect(label).toHaveAttribute("data-focus-visible");
    rerender(<Checkbox isDisabled>Apply</Checkbox>);
    expect(screen.getByRole("checkbox", { name: "Apply" }).closest("label")).toHaveAttribute(
      "data-disabled",
    );
  });

  test("has no axe violations", async () => {
    const { container } = render(
      <Checkbox description="Writes to the plan" errorMessage="Confirm" isInvalid isRequired>
        Apply
      </Checkbox>,
    );
    await expectNoAxeViolations(container);
  });
});
