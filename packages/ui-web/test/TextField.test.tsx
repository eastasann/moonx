import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { TextField } from "../src/components/TextField";
import { expectNoAxeViolations } from "./axe";

describe("TextField", () => {
  test.each(["S", "M", "L", "XL"] as const)("renders a labelled textbox at size %s", (size) => {
    render(<TextField label="Name" size={size} />);
    expect(screen.getByRole("textbox", { name: "Name" })).toBeInTheDocument();
  });

  test("types and reports changes", async () => {
    function Controlled() {
      const [value, setValue] = useState("");
      return <TextField label="Name" value={value} onChange={setValue} />;
    }
    render(<Controlled />);
    const input = screen.getByRole("textbox", { name: "Name" });
    await userEvent.type(input, "Bakery");
    expect(input).toHaveValue("Bakery");
  });

  test("connects description and error message, and marks invalid and required", () => {
    render(
      <TextField
        label="Name"
        description="Shown on the dashboard"
        errorMessage="Name is required"
        isInvalid
        isRequired
      />,
    );
    const input = screen.getByRole("textbox", { name: "Name" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("data-invalid");
    expect(input).toHaveAccessibleDescription("Shown on the dashboard Name is required");
  });

  test("hides the error message while the field is valid", () => {
    render(<TextField label="Name" errorMessage="Name is required" />);
    expect(screen.queryByText("Name is required")).not.toBeInTheDocument();
  });

  test("sets state attributes for hover, keyboard focus and disabled", async () => {
    const { rerender } = render(<TextField label="Name" />);
    const input = screen.getByRole("textbox", { name: "Name" });
    await userEvent.hover(input);
    expect(input).toHaveAttribute("data-hovered");
    await userEvent.tab();
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("data-focus-visible");
    rerender(<TextField label="Name" isDisabled />);
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveAttribute("data-disabled");
    expect(screen.getByRole("textbox", { name: "Name" })).toBeDisabled();
  });

  test("has no axe violations", async () => {
    const { container } = render(
      <TextField label="Name" description="Hint" errorMessage="Required" isInvalid isRequired />,
    );
    await expectNoAxeViolations(container);
  });
});
