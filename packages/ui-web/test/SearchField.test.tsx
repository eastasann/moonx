import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchField } from "../src/components/SearchField";
import { expectNoAxeViolations } from "./axe";
import { expectPressedClearsOnLeave } from "./pressed";

describe("SearchField", () => {
  test.each(["S", "M", "L", "XL"] as const)("renders a search box at size %s", (size) => {
    render(<SearchField label="Search ideas" clearLabel="Clear" size={size} />);
    expect(screen.getByRole("searchbox", { name: "Search ideas" })).toBeInTheDocument();
  });

  test("shows the clear button only with text, and clearing empties the box", async () => {
    const onClear = vi.fn();
    render(<SearchField label="Search ideas" clearLabel="Clear" onClear={onClear} />);
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
    const input = screen.getByRole("searchbox", { name: "Search ideas" });
    await userEvent.type(input, "bakery");
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(input).toHaveValue("");
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  test("Escape clears and Enter submits", async () => {
    const onSubmit = vi.fn();
    render(<SearchField label="Search ideas" clearLabel="Clear" onSubmit={onSubmit} />);
    const input = screen.getByRole("searchbox", { name: "Search ideas" });
    await userEvent.type(input, "bakery{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("bakery");
    await userEvent.keyboard("{Escape}");
    expect(input).toHaveValue("");
  });

  test("marks invalid and required with description and error message", () => {
    render(
      <SearchField
        label="Search ideas"
        clearLabel="Clear"
        description="Titles and notes"
        errorMessage="Too short"
        isInvalid
        isRequired
      />,
    );
    const input = screen.getByRole("searchbox", { name: "Search ideas" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toBeRequired();
    expect(input).toHaveAccessibleDescription("Titles and notes Too short");
  });

  test("sets state attributes for hover, keyboard focus and disabled", async () => {
    const { rerender } = render(<SearchField label="Search ideas" clearLabel="Clear" />);
    const input = screen.getByRole("searchbox", { name: "Search ideas" });
    await userEvent.hover(input);
    expect(input).toHaveAttribute("data-hovered");
    expect(input.parentElement).toHaveAttribute("data-hovered");
    await userEvent.tab();
    expect(input).toHaveAttribute("data-focus-visible");
    expect(input.parentElement).toHaveAttribute("data-focus-within");
    rerender(<SearchField label="Search ideas" clearLabel="Clear" isDisabled />);
    expect(screen.getByRole("searchbox", { name: "Search ideas" })).toBeDisabled();
    expect(screen.getByRole("searchbox", { name: "Search ideas" }).parentElement).toHaveAttribute(
      "data-disabled",
    );
  });

  // Why: pressing the clear button empties the box, and the button is not rendered for an empty box,
  // so the release cannot show the attribute going away. The pointer leaves with the button held,
  // which clears it on a node that is still mounted; the key check stops at the held key.
  test("the clear button is pressed while held and clears when the pointer leaves", async () => {
    const user = userEvent.setup();
    render(<SearchField label="Search ideas" clearLabel="Clear" defaultValue="piaya" />);
    const clear = screen.getByRole("button", { name: "Clear" });
    await expectPressedClearsOnLeave(clear, user);
    expect(screen.getByRole("searchbox", { name: "Search ideas" })).toHaveValue("piaya");
    clear.focus();
    await user.keyboard("{Enter>}");
    expect(clear).toHaveAttribute("data-pressed");
  });

  test("the clear button shows data-hovered on hover and clears on leaving", async () => {
    const user = userEvent.setup();
    render(<SearchField label="Search ideas" clearLabel="Clear" defaultValue="piaya" />);
    const clear = screen.getByRole("button", { name: "Clear" });
    await user.hover(clear);
    expect(clear).toHaveAttribute("data-hovered");
    await user.unhover(clear);
    expect(clear).not.toHaveAttribute("data-hovered");
  });

  test("has no axe violations", async () => {
    const { container } = render(
      <SearchField
        label="Search ideas"
        clearLabel="Clear"
        defaultValue="bakery"
        description="Titles"
      />,
    );
    await expectNoAxeViolations(container);
  });
});
