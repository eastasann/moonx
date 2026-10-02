import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../src";
import { ButtonGroup } from "../src/components/ButtonGroup";
import { expectNoAxeViolations } from "./axe";

describe("ButtonGroup", () => {
  test.each([
    ["horizontal", "start"],
    ["horizontal", "end"],
    ["vertical", "center"],
  ] as const)("renders its buttons (%s, %s)", (orientation, align) => {
    render(
      <ButtonGroup aria-label="Decision" orientation={orientation} align={align}>
        <Button>Hold</Button>
        <Button variant="accent">Proceed</Button>
      </ButtonGroup>,
    );
    const group = screen.getByRole("group", { name: "Decision" });
    expect(group.querySelectorAll("button")).toHaveLength(2);
  });

  test("moves focus through the buttons with Tab", async () => {
    render(
      <ButtonGroup aria-label="Decision">
        <Button>Hold</Button>
        <Button>Proceed</Button>
      </ButtonGroup>,
    );
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Hold" })).toHaveAttribute("data-focus-visible");
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Proceed" })).toHaveFocus();
  });

  test("moves focus forward and back with Tab and Shift+Tab, skipping a disabled button", async () => {
    const user = userEvent.setup();
    render(
      <ButtonGroup aria-label="Decision">
        <Button>Hold</Button>
        <Button isDisabled>Park</Button>
        <Button>Proceed</Button>
      </ButtonGroup>,
    );
    await user.tab();
    expect(screen.getByRole("button", { name: "Hold" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Proceed" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Hold" })).toHaveFocus();
  });

  test("Enter and Space press the focused button, and only that one", async () => {
    const user = userEvent.setup();
    const onHold = vi.fn();
    const onProceed = vi.fn();
    render(
      <ButtonGroup aria-label="Decision">
        <Button onPress={onHold}>Hold</Button>
        <Button onPress={onProceed}>Proceed</Button>
      </ButtonGroup>,
    );
    await user.tab();
    await user.keyboard("{Enter}");
    await user.tab();
    await user.keyboard(" ");
    expect(onHold).toHaveBeenCalledTimes(1);
    expect(onProceed).toHaveBeenCalledTimes(1);
  });

  test("each button shows data-hovered while hovered, independently", async () => {
    const user = userEvent.setup();
    render(
      <ButtonGroup aria-label="Decision">
        <Button>Hold</Button>
        <Button>Proceed</Button>
      </ButtonGroup>,
    );
    const hold = screen.getByRole("button", { name: "Hold" });
    const proceed = screen.getByRole("button", { name: "Proceed" });
    await user.hover(hold);
    expect(hold).toHaveAttribute("data-hovered");
    expect(proceed).not.toHaveAttribute("data-hovered");
    await user.hover(proceed);
    expect(hold).not.toHaveAttribute("data-hovered");
    expect(proceed).toHaveAttribute("data-hovered");
  });

  test("has no axe violations", async () => {
    const { container } = render(
      <ButtonGroup aria-label="Decision">
        <Button>Hold</Button>
        <Button>Proceed</Button>
      </ButtonGroup>,
    );
    await expectNoAxeViolations(container);
  });
});
