import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Checkbox } from "../src/components/Checkbox";
import { CheckboxGroup } from "../src/components/CheckboxGroup";
import { expectNoAxeViolations } from "./axe";

function Scope(props: Partial<React.ComponentProps<typeof CheckboxGroup>>) {
  return (
    <CheckboxGroup label="Share with" {...props}>
      <Checkbox value="team">Team</Checkbox>
      <Checkbox value="advisors">Advisors</Checkbox>
      <Checkbox value="public" isDisabled>
        Public
      </Checkbox>
    </CheckboxGroup>
  );
}

describe("CheckboxGroup", () => {
  test.each(["S", "M", "L", "XL"] as const)("renders a labelled group at size %s", (size) => {
    render(<Scope size={size} />);
    expect(screen.getByRole("group", { name: "Share with" })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });

  test("renders both orientations", () => {
    const { rerender } = render(<Scope orientation="horizontal" />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    rerender(<Scope orientation="vertical" />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });

  test("reports the checked values as an array", async () => {
    const onChange = vi.fn();
    render(<Scope defaultValue={["team"]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Advisors" }));
    expect(onChange).toHaveBeenLastCalledWith(["team", "advisors"]);
    await userEvent.click(screen.getByRole("checkbox", { name: "Team" }));
    expect(onChange).toHaveBeenLastCalledWith(["advisors"]);
  });

  test("moves through the boxes with Tab and toggles with Space", async () => {
    const onChange = vi.fn();
    render(<Scope onChange={onChange} />);
    await userEvent.tab();
    expect(screen.getByRole("checkbox", { name: "Team" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("checkbox", { name: "Advisors" })).toHaveFocus();
    await userEvent.keyboard(" ");
    expect(onChange).toHaveBeenLastCalledWith(["advisors"]);
  });

  test("marks invalid and required with description and error message", () => {
    render(
      <Scope
        description="Who sees the plan"
        errorMessage="Pick at least one"
        isInvalid
        isRequired
      />,
    );
    const group = screen.getByRole("group", { name: /Share with/ });
    expect(group).toHaveAccessibleDescription("Who sees the plan Pick at least one");
    expect(group.closest("[data-invalid]")).not.toBeNull();
    expect(screen.getByRole("checkbox", { name: "Team" }).closest("label")).toHaveAttribute(
      "data-invalid",
    );
  });

  test("sets state attributes for hover, keyboard focus and disabled", async () => {
    render(<Scope />);
    await userEvent.hover(screen.getByText("Team"));
    expect(screen.getByRole("checkbox", { name: "Team" }).closest("label")).toHaveAttribute(
      "data-hovered",
    );
    await userEvent.tab();
    expect(screen.getByRole("checkbox", { name: "Team" }).closest("label")).toHaveAttribute(
      "data-focus-visible",
    );
    expect(screen.getByRole("checkbox", { name: "Public" }).closest("label")).toHaveAttribute(
      "data-disabled",
    );
  });

  test("a disabled group blocks toggling", async () => {
    const onChange = vi.fn();
    render(<Scope isDisabled onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Team" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  test("has no axe violations", async () => {
    const { container } = render(
      <Scope description="Who sees the plan" errorMessage="Pick one" isInvalid />,
    );
    await expectNoAxeViolations(container);
  });
});
