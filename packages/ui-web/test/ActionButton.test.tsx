import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pencil } from "lucide-react";
import { ActionButton } from "../src/components/ActionButton";
import { expectNoAxeViolations } from "./axe";
import { expectPressedLifecycle } from "./pressed";

describe("ActionButton", () => {
  test.each(["S", "M", "L", "XL"] as const)("renders a text button at size %s", (size) => {
    render(<ActionButton size={size}>History</ActionButton>);
    expect(screen.getByRole("button", { name: "History" })).toBeInTheDocument();
  });

  test("renders quiet, with an icon, and icon-only named by aria-label", () => {
    render(
      <>
        <ActionButton isQuiet>Quiet</ActionButton>
        <ActionButton icon={<Pencil />}>Edit</ActionButton>
        <ActionButton isQuiet icon={<Pencil />} aria-label="Rename" />
      </>,
    );
    expect(screen.getByRole("button", { name: "Quiet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    const iconOnly = screen.getByRole("button", { name: "Rename" });
    expect(iconOnly.querySelector("svg")?.closest("[aria-hidden='true']")).not.toBeNull();
  });

  test("sets state attributes for hover, press, keyboard focus and disabled", async () => {
    const onPress = vi.fn();
    const { rerender } = render(<ActionButton onPress={onPress}>History</ActionButton>);
    const button = screen.getByRole("button", { name: "History" });

    await userEvent.tab();
    expect(button).toHaveAttribute("data-focus-visible");
    await userEvent.hover(button);
    expect(button).toHaveAttribute("data-hovered");
    expect(button).not.toHaveAttribute("data-pressed");

    rerender(
      <ActionButton isDisabled onPress={onPress}>
        History
      </ActionButton>,
    );
    expect(button).toHaveAttribute("data-disabled");
    await userEvent.click(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  test("pressed is set while held and removed on release, by pointer and keyboard", async () => {
    const user = userEvent.setup();
    render(<ActionButton>History</ActionButton>);
    await expectPressedLifecycle(screen.getByRole("button", { name: "History" }), user);
  });

  test("activates with Enter and Space", async () => {
    const onPress = vi.fn();
    render(<ActionButton onPress={onPress}>History</ActionButton>);
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  test("has no axe violations", async () => {
    const { container } = render(
      <>
        <ActionButton>History</ActionButton>
        <ActionButton isQuiet icon={<Pencil />} aria-label="Rename" />
      </>,
    );
    await expectNoAxeViolations(container);
  });
});
