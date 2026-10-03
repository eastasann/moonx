import { COMPONENT_SIZES } from "@moonx/ui-tokens";
import { themes } from "@moonx/ui-tokens/native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, StyleSheet } from "react-native";
import type { ReactTestRendererJSON } from "react-test-renderer";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { Switch } from "../src/components/Switch";

type Json = ReactTestRendererJSON;
const rowJson = () => {
  const root = screen.toJSON() as Json;
  return (root.children as Json[])[0] as Json;
};
const trackJson = () => (rowJson().children as Json[])[0] as Json;
const flat = (n: Json) => StyleSheet.flatten(n.props.style as never) as Record<string, unknown>;

beforeEach(() => {
  // Never settles, so the hook does not update state outside act.
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockReturnValue(new Promise(() => {}));
});
afterEach(() => {
  act(resetMockUnistyles);
  jest.restoreAllMocks();
});

test("is a named switch with checked state and a tall enough target", () => {
  render(<Switch>Focus mode</Switch>);
  const sw = screen.getByRole("switch", { name: "Focus mode" });
  expect(sw.props.accessibilityState.checked).toBe(false);
  expect(sw.props.style.minHeight).toBeGreaterThanOrEqual(44);
});

test.each(COMPONENT_SIZES)("size %s draws the track at the theme size", (size) => {
  render(<Switch size={size}>Focus</Switch>);
  const t = themes.light.scale.component.switch;
  expect(flat(trackJson())).toMatchObject({
    width: t["control-width"][size],
    height: t["control-height"][size],
  });
  expect(rowJson().props.style.minHeight).toBeGreaterThanOrEqual(44);
});

test("uncontrolled: a press toggles and reports", () => {
  const onChange = jest.fn();
  render(<Switch onChange={onChange}>Focus</Switch>);
  fireEvent.press(screen.getByRole("switch"));
  expect(onChange).toHaveBeenLastCalledWith(true);
  expect(screen.getByRole("switch").props.accessibilityState.checked).toBe(true);
  fireEvent.press(screen.getByRole("switch"));
  expect(onChange).toHaveBeenLastCalledWith(false);
});

test("controlled follows isSelected", () => {
  const onChange = jest.fn();
  const { rerender } = render(
    <Switch isSelected={false} onChange={onChange}>
      Focus
    </Switch>,
  );
  fireEvent.press(screen.getByRole("switch"));
  expect(onChange).toHaveBeenCalledWith(true);
  expect(screen.getByRole("switch").props.accessibilityState.checked).toBe(false);
  rerender(
    <Switch isSelected onChange={onChange}>
      Focus
    </Switch>,
  );
  expect(screen.getByRole("switch").props.accessibilityState.checked).toBe(true);
});

test("defaultSelected starts on", () => {
  render(<Switch defaultSelected>Focus</Switch>);
  expect(screen.getByRole("switch").props.accessibilityState.checked).toBe(true);
});

test("the handle is a presentational child of the track", () => {
  render(<Switch>Focus</Switch>);
  expect(trackJson().children).toHaveLength(1);
});

test("disabled and read-only block presses", () => {
  const onChange = jest.fn();
  const { rerender } = render(
    <Switch isDisabled onChange={onChange}>
      Focus
    </Switch>,
  );
  fireEvent.press(screen.getByRole("switch"));
  expect(screen.getByRole("switch").props.accessibilityState.disabled).toBe(true);
  rerender(
    <Switch isReadOnly onChange={onChange}>
      Focus
    </Switch>,
  );
  fireEvent.press(screen.getByRole("switch"));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole("switch").props.accessibilityState.checked).toBe(false);
});

test("description is shown and used as the hint", () => {
  render(<Switch description="Hides the sidebar">Focus</Switch>);
  expect(screen.getByText("Hides the sidebar")).toBeTruthy();
  expect(screen.getByRole("switch").props.accessibilityHint).toBe("Hides the sidebar");
});

test("aria-label overrides the text name", () => {
  render(<Switch aria-label="Focus toggle">F</Switch>);
  expect(screen.getByRole("switch", { name: "Focus toggle" })).toBeTruthy();
});

test("track color follows state and theme", () => {
  const { rerender } = render(<Switch>Focus</Switch>);
  expect(flat(trackJson()).backgroundColor).toBe(themes.light.color.control.track);
  rerender(<Switch isSelected>Focus</Switch>);
  expect(flat(trackJson()).backgroundColor).toBe(themes.light.color.control["track-fill"]);
  act(() => mockUnistyles({ theme: "dark" }));
  rerender(<Switch isSelected>Focus</Switch>);
  expect(flat(trackJson()).backgroundColor).toBe(themes.dark.color.control["track-fill"]);
});
