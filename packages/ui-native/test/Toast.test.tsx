import { TOAST_VARIANTS } from "@moonx/ui-tokens";
import { themes } from "@moonx/ui-tokens/native";
import { PortalHost } from "@rn-primitives/portal";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Home } from "lucide-react-native";
import { StyleSheet as RNStyleSheet } from "react-native";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { TabBar } from "../src/components/TabBar";
import { createToastQueue, ToastRegion } from "../src/components/Toast";

afterEach(() => {
  resetMockUnistyles();
  jest.useRealTimers();
});

function setup(options?: { maxVisibleToasts?: number }) {
  const queue = createToastQueue(options);
  render(
    <>
      <ToastRegion queue={queue} label="Notifications" closeLabel="Dismiss" />
      <PortalHost />
    </>,
  );
  return queue;
}

test.each(TOAST_VARIANTS)("shows a %s toast with its title, description and colors", (variant) => {
  const queue = setup();
  act(() => {
    queue.add({ title: "Decision recorded", description: "Saved to the log", variant });
  });
  expect(screen.getByLabelText("Notifications")).toBeTruthy();
  expect(screen.getByText("Decision recorded")).toBeTruthy();
  expect(screen.getByText("Saved to the log")).toBeTruthy();
  const title = screen.getByText("Decision recorded").props.style;
  expect(title.color).toBe(themes.light.color[variant]["on-strong"]);
});

test("a toast without a variant is neutral", () => {
  const queue = setup();
  act(() => {
    queue.add({ title: "Hello" });
  });
  expect(screen.getByText("Hello").props.style.color).toBe(themes.light.color.neutral["on-strong"]);
});

test("dark theme changes the toast colors", () => {
  mockUnistyles({ theme: "dark" });
  const queue = setup();
  act(() => {
    queue.add({ title: "Hello", variant: "positive" });
  });
  expect(screen.getByText("Hello").props.style.color).toBe(themes.dark.color.positive["on-strong"]);
});

test("negative toasts are alerts announced at once; others are polite status", () => {
  const queue = setup();
  act(() => {
    queue.add({ title: "Failed", variant: "negative" });
    queue.add({ title: "Saved", variant: "positive" });
  });
  const [failed, saved] = screen.getAllByTestId("toast");
  expect(saved?.props.role).toBe("status");
  expect(saved?.props.accessibilityLiveRegion).toBe("polite");
  expect(failed?.props.role).toBe("alert");
  expect(failed?.props.accessibilityLiveRegion).toBe("assertive");
});

test("the close button, named by closeLabel, removes the toast and calls onClose", () => {
  const queue = setup();
  const onClose = jest.fn();
  act(() => {
    queue.add({ title: "Decision recorded" }, { onClose });
  });
  const close = screen.getByRole("button", { name: "Dismiss" });
  expect(close.props.style.minHeight).toBeGreaterThanOrEqual(44);
  expect(close.props.style.minWidth).toBeGreaterThanOrEqual(44);
  fireEvent.press(close);
  expect(screen.queryByText("Decision recorded")).toBeNull();
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("closes by itself after the default timeout and honors an explicit one", () => {
  jest.useFakeTimers();
  const queue = setup();
  act(() => {
    queue.add({ title: "Default" });
    queue.add({ title: "Short" }, { timeout: 1000 });
  });
  act(() => {
    jest.advanceTimersByTime(1000);
  });
  expect(screen.queryByText("Short")).toBeNull();
  expect(screen.getByText("Default")).toBeTruthy();
  act(() => {
    jest.advanceTimersByTime(4000);
  });
  expect(screen.queryByText("Default")).toBeNull();
});

test("a touch holds the timer and the toast keeps the time it had left", () => {
  jest.useFakeTimers();
  const queue = setup();
  act(() => {
    queue.add({ title: "Held" }, { timeout: 1000 });
  });
  const toast = screen.getByTestId("toast");
  act(() => {
    jest.advanceTimersByTime(600);
  });
  fireEvent(toast, "touchStart");
  act(() => {
    jest.advanceTimersByTime(5000);
  });
  expect(screen.getByText("Held")).toBeTruthy();
  fireEvent(toast, "touchEnd");
  act(() => {
    jest.advanceTimersByTime(300);
  });
  expect(screen.getByText("Held")).toBeTruthy();
  act(() => {
    jest.advanceTimersByTime(200);
  });
  expect(screen.queryByText("Held")).toBeNull();
});

test("unmounting the region stops the timers and removes the toasts", () => {
  jest.useFakeTimers();
  const queue = createToastQueue();
  const onClose = jest.fn();
  const view = render(
    <>
      <ToastRegion queue={queue} label="Notifications" closeLabel="Dismiss" />
      <PortalHost />
    </>,
  );
  act(() => {
    queue.add({ title: "Gone" }, { onClose });
  });
  view.unmount();
  act(() => {
    jest.advanceTimersByTime(10000);
  });
  expect(onClose).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test("stacks several toasts, limited by maxVisibleToasts, and renders nothing when empty", () => {
  const queue = setup({ maxVisibleToasts: 2 });
  expect(screen.queryByLabelText("Notifications")).toBeNull();
  act(() => {
    queue.add({ title: "One" });
    queue.add({ title: "Two" });
    queue.add({ title: "Three" });
  });
  expect(screen.queryByText("One")).toBeNull();
  expect(screen.getByText("Two")).toBeTruthy();
  expect(screen.getByText("Three")).toBeTruthy();
});

test("clear closes every toast", () => {
  const queue = setup();
  act(() => {
    queue.add({ title: "One" });
    queue.add({ title: "Two" });
  });
  act(() => {
    queue.clear();
  });
  expect(screen.queryByText("One")).toBeNull();
  expect(screen.queryByText("Two")).toBeNull();
});

test("the region clears the tab bar only while one is on screen", () => {
  const queue = createToastQueue();
  const region = () =>
    (RNStyleSheet.flatten(screen.getByLabelText("Notifications").props.style) as { bottom: number })
      .bottom;
  const { space, layout } = themes.light;
  const tree = (withTabs: boolean) => (
    <>
      <ToastRegion queue={queue} label="Notifications" closeLabel="Dismiss" />
      <PortalHost />
      {withTabs ? (
        <TabBar
          aria-label="Main"
          items={[{ id: "a", label: "A", icon: Home, onPress: () => {} }]}
        />
      ) : null}
    </>
  );
  const { rerender } = render(tree(false));
  act(() => {
    queue.add({ title: "Hello" });
  });
  expect(region()).toBe(space["200"]);
  rerender(tree(true));
  expect(region()).toBe(layout["tab-bar-height"] + space["200"]);
  rerender(tree(false));
  expect(region()).toBe(space["200"]);
});
