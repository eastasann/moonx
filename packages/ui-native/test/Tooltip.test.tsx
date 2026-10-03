import { themes } from "@moonx/ui-tokens/native";
import { PortalHost } from "@rn-primitives/portal";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { View } from "react-native";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { Button } from "../src/components/Button";
import { Tooltip } from "../src/components/Tooltip";

afterEach(() => {
  resetMockUnistyles();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

function Example(props: Partial<React.ComponentProps<typeof Tooltip>>) {
  return (
    <>
      <Tooltip content="Add a note" {...props}>
        <Button aria-label="Add">+</Button>
      </Tooltip>
      <PortalHost />
    </>
  );
}

/** Finds the long press recognizer by the id the part gives it. */
function longPress() {
  const detector = screen.UNSAFE_getAllByType(
    require("react-native-gesture-handler").GestureDetector,
  )[0];
  const id = (detector?.props.gesture.config.testId ?? "") as string;
  return getByGestureTestId(id);
}

// The test utility ends a long press by itself after it activates, so one call is a press and
// its release.
function pressAndRelease() {
  fireGestureHandler(longPress(), [{ state: State.BEGAN }, { state: State.ACTIVE }]);
}

test("renders the child and no tooltip until it is long-pressed", () => {
  render(<Example />);
  expect(screen.getByRole("button", { name: "Add" })).toBeTruthy();
  expect(screen.queryByText("Add a note")).toBeNull();
});

test("a long press opens it and it closes closeDelay after the finger lifts", () => {
  jest.useFakeTimers();
  const onOpenChange = jest.fn();
  render(<Example closeDelay={800} onOpenChange={onOpenChange} />);
  act(pressAndRelease);
  expect(screen.getByText("Add a note")).toBeTruthy();
  expect(onOpenChange).toHaveBeenLastCalledWith(true);
  act(() => {
    jest.advanceTimersByTime(700);
  });
  expect(screen.getByText("Add a note")).toBeTruthy();
  act(() => {
    jest.advanceTimersByTime(100);
  });
  expect(screen.queryByText("Add a note")).toBeNull();
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
});

test("a new long press restarts the close delay", () => {
  jest.useFakeTimers();
  render(<Example closeDelay={800} />);
  act(pressAndRelease);
  act(() => {
    jest.advanceTimersByTime(500);
  });
  act(pressAndRelease);
  act(() => {
    jest.advanceTimersByTime(500);
  });
  expect(screen.getByText("Add a note")).toBeTruthy();
  act(() => {
    jest.advanceTimersByTime(300);
  });
  expect(screen.queryByText("Add a note")).toBeNull();
});

test("a short tap reaches the child and does not open it", () => {
  const onPress = jest.fn();
  render(
    <>
      <Tooltip content="Add a note">
        <Button aria-label="Add" onPress={onPress}>
          +
        </Button>
      </Tooltip>
      <PortalHost />
    </>,
  );
  fireEvent.press(screen.getByRole("button", { name: "Add" }));
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("Add a note")).toBeNull();
});

test("the tooltip has the tooltip role and a polite live region", () => {
  render(<Example defaultOpen />);
  const tip = screen.getByRole("tooltip");
  expect(tip.props.accessibilityLiveRegion).toBe("polite");
});

test("isOpen controls it and defaultOpen starts it open", () => {
  const { rerender } = render(<Example isOpen={false} />);
  expect(screen.queryByText("Add a note")).toBeNull();
  rerender(<Example isOpen />);
  expect(screen.getByText("Add a note")).toBeTruthy();
});

test("isDisabled neither opens on long press nor shows an open tooltip", () => {
  const { rerender } = render(<Example isDisabled />);
  act(pressAndRelease);
  expect(screen.queryByText("Add a note")).toBeNull();
  rerender(<Example isDisabled isOpen />);
  expect(screen.queryByText("Add a note")).toBeNull();
});

test("the long press waits for delay", () => {
  render(<Example delay={900} />);
  expect(longPress().config.minDurationMs).toBe(900);
});

test("unmounting stops the close timer", () => {
  jest.useFakeTimers();
  const view = render(<Example />);
  act(pressAndRelease);
  view.unmount();
  expect(jest.getTimerCount()).toBe(0);
});

test("is placed beside the child, on the requested side, once measured", () => {
  // The trigger is at (150, 300); the host layer starts at the window origin.
  jest.spyOn(View.prototype, "measureInWindow" as never).mockImplementation(function (
    this: { props: { pointerEvents?: string } },
    cb: (x: number, y: number, w: number, h: number) => void,
  ) {
    if (this.props.pointerEvents === "none") cb(0, 0, 390, 800);
    else cb(150, 300, 50, 50);
  } as never);
  render(<Example defaultOpen placement="bottom" />);
  const tip = screen.getByRole("tooltip");
  fireEvent(screen.UNSAFE_getByProps({ pointerEvents: "none" }), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 800 } },
  });
  fireEvent(tip, "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 100, height: 30 } } });
  const style =
    screen.getByRole("tooltip").props.style.flat?.() ?? screen.getByRole("tooltip").props.style;
  const merged = Object.assign({}, ...[style].flat());
  expect(merged.top).toBeGreaterThan(300);
  expect(merged.opacity).toBeUndefined();
});

test("uses the theme colors in dark too", () => {
  mockUnistyles({ theme: "dark" });
  render(<Example defaultOpen />);
  const merged = Object.assign({}, ...[screen.getByRole("tooltip").props.style].flat());
  expect(merged.backgroundColor).toBe(themes.dark.color.control.primary);
});

test("flips to the opposite side when the requested one has no room", () => {
  jest.spyOn(View.prototype, "measureInWindow" as never).mockImplementation(function (
    this: { props: { pointerEvents?: string } },
    cb: (x: number, y: number, w: number, h: number) => void,
  ) {
    if (this.props.pointerEvents === "none") cb(0, 0, 390, 800);
    else cb(150, 10, 50, 50);
  } as never);
  render(<Example defaultOpen placement="top" />);
  fireEvent(screen.UNSAFE_getByProps({ pointerEvents: "none" }), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 800 } },
  });
  fireEvent(screen.getByRole("tooltip"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 100, height: 30 } },
  });
  const merged = Object.assign({}, ...[screen.getByRole("tooltip").props.style].flat());
  expect(merged.top).toBeGreaterThan(60);
});
