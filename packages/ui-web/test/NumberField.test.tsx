import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumberField } from "../src/components/NumberField";
import { expectNoAxeViolations } from "./axe";

describe("NumberField", () => {
  test.each(["S", "M", "L", "XL"] as const)("renders a spinbutton at size %s", (size) => {
    render(<NumberField label="Price" size={size} />);
    expect(screen.getByRole("textbox", { name: "Price" })).toBeInTheDocument();
  });

  test("formats currency with en-PH grouping and reports the number", async () => {
    const onChange = vi.fn();
    render(
      <NumberField
        label="Price"
        formatOptions={{ style: "currency", currency: "PHP" }}
        onChange={onChange}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Price" });
    await userEvent.type(input, "30000.5");
    await userEvent.tab();
    expect(input).toHaveValue("₱30,000.50");
    expect(onChange).toHaveBeenLastCalledWith(30000.5);
  });

  test("reports the text on every keystroke while onChange waits for the commit", async () => {
    const onChange = vi.fn();
    const onInputChange = vi.fn();
    render(<NumberField label="Price" onChange={onChange} onInputChange={onInputChange} />);
    const input = screen.getByRole("textbox", { name: "Price" });
    await userEvent.type(input, "1,2");
    expect(onInputChange.mock.calls.map(([text]) => text)).toEqual(["1", "1,", "1,2"]);
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith(12);
  });

  test("hides the label visually but keeps it as the accessible name", () => {
    render(<NumberField label="Price" isLabelHidden />);
    const input = screen.getByRole("textbox", { name: "Price" });
    expect(input).toBeInTheDocument();
    expect(screen.getByText("Price").className).not.toMatch(/label/i);
  });

  test("formats percent from a 0 to 1 value", () => {
    render(
      <NumberField
        label="Rate"
        value={0.125}
        formatOptions={{ style: "percent", maximumFractionDigits: 1 }}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Rate" })).toHaveValue("12.5%");
  });

  test("steps with the arrow keys and respects min and max", async () => {
    const onChange = vi.fn();
    render(
      <NumberField label="Days" defaultValue={1} minValue={0} maxValue={2} onChange={onChange} />,
    );
    const input = screen.getByRole("textbox", { name: "Days" });
    await userEvent.click(input);
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(input).toHaveValue("2");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(input).toHaveValue("0");
  });

  test("marks invalid and required with description and error message", () => {
    render(
      <NumberField
        label="Price"
        description="Per unit"
        errorMessage="Must be positive"
        isInvalid
        isRequired
      />,
    );
    const input = screen.getByRole("textbox", { name: "Price" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toBeRequired();
    expect(input).toHaveAccessibleDescription("Per unit Must be positive");
  });

  test("sets state attributes for hover, keyboard focus and disabled", async () => {
    const { rerender } = render(<NumberField label="Price" />);
    const input = screen.getByRole("textbox", { name: "Price" });
    await userEvent.hover(input);
    expect(input.parentElement).toHaveAttribute("data-hovered");
    await userEvent.tab();
    expect(input).toHaveFocus();
    expect(input.parentElement).toHaveAttribute("data-focus-within");
    rerender(<NumberField label="Price" isDisabled />);
    expect(screen.getByRole("textbox", { name: "Price" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Price" }).parentElement).toHaveAttribute(
      "data-disabled",
    );
  });

  test("keyboard focus shows data-focus-visible on the input, a pointer click does not", async () => {
    const user = userEvent.setup();
    render(<NumberField label="Price" />);
    const input = screen.getByRole("textbox", { name: "Price" });
    await user.tab();
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("data-focus-visible");
    await user.tab();
    expect(input).not.toHaveFocus();
    expect(input).not.toHaveAttribute("data-focus-visible");
    await user.click(input);
    expect(input).toHaveFocus();
    expect(input).not.toHaveAttribute("data-focus-visible");
  });

  test("has no axe violations", async () => {
    const { container } = render(
      <NumberField label="Price" description="Per unit" defaultValue={5} />,
    );
    await expectNoAxeViolations(container);
  });
});
