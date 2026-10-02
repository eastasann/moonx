import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Radio, RadioGroup } from "../src/components/RadioGroup";
import { expectNoAxeViolations } from "./axe";

function Verdict(props: Partial<React.ComponentProps<typeof RadioGroup>>) {
  return (
    <RadioGroup label="Decision" {...props}>
      <Radio value="proceed">Proceed</Radio>
      <Radio value="hold">Hold</Radio>
      <Radio value="drop" isDisabled>
        Drop
      </Radio>
    </RadioGroup>
  );
}

describe("RadioGroup", () => {
  test.each(["S", "M", "L", "XL"] as const)("renders a labelled radio group at size %s", (size) => {
    render(<Verdict size={size} />);
    expect(screen.getByRole("radiogroup", { name: "Decision" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  test("renders both orientations", () => {
    const { rerender } = render(<Verdict orientation="horizontal" />);
    expect(screen.getByRole("radiogroup")).toHaveAttribute("aria-orientation", "horizontal");
    rerender(<Verdict orientation="vertical" />);
    expect(screen.getByRole("radiogroup", { name: "Decision" })).toBeInTheDocument();
  });

  test("chooses with the pointer and reports the value", async () => {
    const onChange = vi.fn();
    render(<Verdict onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Hold" }));
    expect(onChange).toHaveBeenCalledWith("hold");
    expect(screen.getByRole("radio", { name: "Hold" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Hold" }).closest("label")).toHaveAttribute(
      "data-selected",
    );
  });

  test("moves the choice with the arrow keys and skips disabled radios", async () => {
    const onChange = vi.fn();
    render(<Verdict defaultValue="proceed" onChange={onChange} />);
    await userEvent.tab();
    expect(screen.getByRole("radio", { name: "Proceed" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(onChange).toHaveBeenLastCalledWith("hold");
    await userEvent.keyboard("{ArrowDown}");
    expect(onChange).toHaveBeenLastCalledWith("proceed");
  });

  test("marks invalid and required with description and error message", () => {
    render(<Verdict description="Record one" errorMessage="Choose one" isInvalid isRequired />);
    const group = screen.getByRole("radiogroup", { name: "Decision" });
    expect(group).toHaveAttribute("aria-required", "true");
    expect(group).toHaveAccessibleDescription("Record one Choose one");
    expect(screen.getAllByRole("radio")[0]?.closest("label")).toHaveAttribute("data-invalid");
  });

  test("sets state attributes for hover, keyboard focus and disabled", async () => {
    render(<Verdict />);
    const proceed = screen.getByRole("radio", { name: "Proceed" });
    await userEvent.hover(proceed);
    expect(proceed.closest("label")).toHaveAttribute("data-hovered");
    await userEvent.tab();
    expect(proceed.closest("label")).toHaveAttribute("data-focus-visible");
    expect(screen.getByRole("radio", { name: "Drop" }).closest("label")).toHaveAttribute(
      "data-disabled",
    );
  });

  test("a disabled group blocks choosing", async () => {
    const onChange = vi.fn();
    render(<Verdict isDisabled onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Hold" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  test("has no axe violations", async () => {
    const { container } = render(
      <Verdict description="Record one" errorMessage="Choose one" isInvalid />,
    );
    await expectNoAxeViolations(container);
  });
});
