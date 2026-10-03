import { BUTTON_VARIANTS, COMPONENT_SIZES } from "@moonx/ui-tokens";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Button } from "../src";

test.each(BUTTON_VARIANTS)("renders the %s variant as a named button", (variant) => {
  render(<Button variant={variant}>Save</Button>);
  expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
});

test.each(COMPONENT_SIZES)("renders size %s at least as tall as the touch target", (size) => {
  render(<Button size={size}>Save</Button>);
  const style = screen.getByRole("button", { name: "Save" }).props.style;
  expect(style.minHeight).toBeGreaterThanOrEqual(44);
});

test("press handler fires and disabled blocks it", () => {
  const onPress = jest.fn();
  const { rerender } = render(<Button onPress={onPress}>Save</Button>);
  fireEvent.press(screen.getByRole("button", { name: "Save" }));
  expect(onPress).toHaveBeenCalledTimes(1);
  rerender(
    <Button isDisabled onPress={onPress}>
      Save
    </Button>,
  );
  fireEvent.press(screen.getByRole("button", { name: "Save" }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("pending shows a progress indicator and blocks presses", () => {
  const onPress = jest.fn();
  render(
    <Button isPending pendingLabel="Saving" onPress={onPress}>
      Save
    </Button>,
  );
  expect(screen.getByRole("progressbar", { name: "Saving" })).toBeTruthy();
  fireEvent.press(screen.getByRole("button"));
  expect(onPress).not.toHaveBeenCalled();
});
