import { COMPONENT_SIZES } from "@moonx/ui-tokens";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text, View } from "react-native";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { ActionButton } from "../src/components/ActionButton";

afterEach(resetMockUnistyles);

const Icon = () => <View testID="icon" />;

test.each(COMPONENT_SIZES)("size %s is at least the touch target high", (size) => {
  render(<ActionButton size={size}>Reply</ActionButton>);
  const style = screen.getByRole("button", { name: "Reply" }).props.style;
  expect(style.minHeight).toBeGreaterThanOrEqual(44);
});

test.each(COMPONENT_SIZES)(
  "icon-only size %s is a square touch target with icon padding",
  (size) => {
    render(<ActionButton size={size} icon={<Icon />} aria-label="Comments" />);
    const style = screen.getByRole("button", { name: "Comments" }).props.style;
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
    expect(style.padding).toBeGreaterThan(0);
    expect(style.paddingHorizontal).toBeUndefined();
  },
);

test("a text button has horizontal padding and shows its icon before the text", () => {
  render(
    <ActionButton icon={<Icon />}>
      <Text>Reply</Text>
    </ActionButton>,
  );
  const button = screen.getByRole("button", { name: "Reply" });
  expect(button.props.style.paddingHorizontal).toBeGreaterThan(0);
  expect(screen.getByTestId("icon", { includeHiddenElements: true })).toBeTruthy();
});

test("quiet drops the filled background", () => {
  const { rerender } = render(<ActionButton>Reply</ActionButton>);
  const filled = screen.getByRole("button").props.style.backgroundColor;
  expect(filled).not.toBe("transparent");
  rerender(<ActionButton isQuiet>Reply</ActionButton>);
  expect(screen.getByRole("button").props.style.backgroundColor).toBe("transparent");
});

test("the filled background follows the dark theme", () => {
  const { rerender } = render(<ActionButton>Reply</ActionButton>);
  const light = screen.getByRole("button").props.style.backgroundColor;
  mockUnistyles({ theme: "dark" });
  rerender(<ActionButton>Reply</ActionButton>);
  expect(screen.getByRole("button").props.style.backgroundColor).not.toBe(light);
});

test("press fires, disabled blocks and is reported", () => {
  const onPress = jest.fn();
  const { rerender } = render(<ActionButton onPress={onPress}>Reply</ActionButton>);
  fireEvent.press(screen.getByRole("button", { name: "Reply" }));
  expect(onPress).toHaveBeenCalledTimes(1);
  rerender(
    <ActionButton isDisabled onPress={onPress}>
      Reply
    </ActionButton>,
  );
  const button = screen.getByRole("button", { name: "Reply" });
  expect(button.props.accessibilityState).toMatchObject({ disabled: true });
  fireEvent.press(button);
  expect(onPress).toHaveBeenCalledTimes(1);
});
