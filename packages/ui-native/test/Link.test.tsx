import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { Link } from "../src/components/Link";

test("primary is a named link at least as tall as the touch target", () => {
  render(<Link>Edit in validation</Link>);
  const link = screen.getByRole("link", { name: "Edit in validation" });
  expect(link.props.style.minHeight).toBeGreaterThanOrEqual(44);
});

test("secondary is a nested text link without a minimum height", () => {
  render(
    <Text>
      See <Link variant="secondary">the notes</Link> for more
    </Text>,
  );
  const link = screen.getByRole("link", { name: "the notes" });
  expect(link.props.style.minHeight).toBeUndefined();
  expect(link.props.style.textDecorationLine).toBe("underline");
});

test("primary fires onPress and disabled blocks it", () => {
  const onPress = jest.fn();
  const { rerender } = render(<Link onPress={onPress}>Open</Link>);
  fireEvent.press(screen.getByRole("link", { name: "Open" }));
  expect(onPress).toHaveBeenCalledTimes(1);
  rerender(
    <Link isDisabled onPress={onPress}>
      Open
    </Link>,
  );
  const link = screen.getByRole("link", { name: "Open" });
  fireEvent.press(link);
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(link.props.accessibilityState.disabled).toBe(true);
});

test("secondary fires onPress and disabled removes the handler", () => {
  const onPress = jest.fn();
  const { rerender } = render(
    <Link variant="secondary" onPress={onPress}>
      Open
    </Link>,
  );
  fireEvent.press(screen.getByRole("link", { name: "Open" }));
  expect(onPress).toHaveBeenCalledTimes(1);
  rerender(
    <Link variant="secondary" isDisabled onPress={onPress}>
      Open
    </Link>,
  );
  const link = screen.getByRole("link", { name: "Open" });
  expect(link.props.onPress).toBeUndefined();
  expect(link.props["aria-disabled"]).toBe(true);
});

test("a disabled link loses its underline and uses the disabled color", () => {
  render(<Link isDisabled>Open</Link>);
  const text = screen.getByText("Open");
  expect(text.props.style.textDecorationLine).toBe("none");
});

test("aria-label overrides the visible text", () => {
  render(<Link aria-label="Open validation">Edit</Link>);
  expect(screen.getByRole("link", { name: "Open validation" })).toBeTruthy();
});
