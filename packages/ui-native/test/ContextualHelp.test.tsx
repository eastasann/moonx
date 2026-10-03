import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { ContextualHelp } from "../src/components/ContextualHelp";

test.each(["help", "info"] as const)("the %s trigger is a named touch target", (variant) => {
  render(
    <ContextualHelp variant={variant} label="Hint" title="Why we ask">
      Because.
    </ContextualHelp>,
  );
  const trigger = screen.getByRole("button", { name: "Hint" });
  expect(trigger.props.style.minHeight).toBeGreaterThanOrEqual(44);
  expect(trigger.props.style.minWidth).toBeGreaterThanOrEqual(44);
});

test("pressing it opens a tray with a heading and the text", () => {
  const onOpenChange = jest.fn();
  render(
    <ContextualHelp label="Hint" title="Why we ask" onOpenChange={onOpenChange} placement="top">
      Because.
    </ContextualHelp>,
  );
  expect(screen.queryByText("Because.")).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Hint" }));
  expect(screen.getByRole("heading", { name: "Why we ask" })).toBeTruthy();
  expect(screen.getByLabelText("Why we ask")).toBeTruthy();
  expect(screen.getByText("Because.")).toBeTruthy();
  expect(onOpenChange).toHaveBeenLastCalledWith(true);
});

test("controlled isOpen opens and closes it", () => {
  const { rerender } = render(
    <ContextualHelp label="Hint" title="Why we ask" isOpen>
      Because.
    </ContextualHelp>,
  );
  act(() => {});
  expect(screen.getByText("Because.")).toBeTruthy();
  rerender(
    <ContextualHelp label="Hint" title="Why we ask" isOpen={false}>
      Because.
    </ContextualHelp>,
  );
  act(() => {});
  expect(screen.queryByText("Because.")).toBeNull();
});
