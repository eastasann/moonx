import { COMPONENT_SIZES } from "@moonx/ui-tokens";
import { themes } from "@moonx/ui-tokens/native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import {
  SegmentedControl,
  SegmentedControlItem,
  type SegmentedControlProps,
} from "../src/components/SegmentedControl";

const control = (props: Partial<SegmentedControlProps> = {}) => (
  <SegmentedControl aria-label="Confidence" {...props}>
    <SegmentedControlItem value="low">Low</SegmentedControlItem>
    <SegmentedControlItem value="medium">Medium</SegmentedControlItem>
    <SegmentedControlItem value="high" isDisabled>
      High
    </SegmentedControlItem>
  </SegmentedControl>
);
const checked = (name: string) =>
  screen.getByRole("radio", { name }).props.accessibilityState.checked;
const style = (name: string) =>
  StyleSheet.flatten(screen.getByRole("radio", { name }).props.style) as Record<string, unknown>;

afterEach(() => act(resetMockUnistyles));

test("is a named control of named segments", () => {
  render(control());
  expect(screen.getByLabelText("Confidence")).toBeTruthy();
  expect(screen.getAllByRole("radio")).toHaveLength(3);
});

test.each(COMPONENT_SIZES)("size %s keeps every segment at least the touch target", (size) => {
  render(control({ size }));
  for (const item of screen.getAllByRole("radio")) {
    expect(item.props.style.minHeight).toBeGreaterThanOrEqual(44);
    expect(item.props.style.minWidth).toBeGreaterThanOrEqual(44);
  }
});

test("uncontrolled: choosing reports once; pressing the chosen segment does nothing", () => {
  const onChange = jest.fn();
  render(control({ defaultValue: "low", onChange }));
  expect(checked("Low")).toBe(true);
  fireEvent.press(screen.getByRole("radio", { name: "Low" }));
  expect(onChange).not.toHaveBeenCalled();
  expect(checked("Low")).toBe(true);
  fireEvent.press(screen.getByRole("radio", { name: "Medium" }));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith("medium");
  expect(checked("Medium")).toBe(true);
  expect(checked("Low")).toBe(false);
});

test("controlled: value wins over a press", () => {
  const onChange = jest.fn();
  const { rerender } = render(control({ value: "low", onChange }));
  fireEvent.press(screen.getByRole("radio", { name: "Medium" }));
  expect(onChange).toHaveBeenCalledWith("medium");
  expect(checked("Low")).toBe(true);
  rerender(control({ value: "medium", onChange }));
  expect(checked("Medium")).toBe(true);
});

test("a disabled segment and a disabled control block presses", () => {
  const onChange = jest.fn();
  const { rerender } = render(control({ onChange }));
  fireEvent.press(screen.getByRole("radio", { name: "High" }));
  rerender(control({ onChange, isDisabled: true }));
  fireEvent.press(screen.getByRole("radio", { name: "Medium" }));
  expect(onChange).not.toHaveBeenCalled();
});

test("the chosen segment is filled with the primary control color;", () => {
  render(control({ value: "low" }));
  expect(style("Low").backgroundColor).toBe(themes.light.color.control.primary);
  expect(style("Medium").backgroundColor).toBe("transparent");
});

test("vertical orientation stacks the segments", () => {
  render(control({ orientation: "vertical" }));
  expect(StyleSheet.flatten(screen.getByLabelText("Confidence").props.style).flexDirection).toBe(
    "column",
  );
});

test("dark theme recolors the chosen one", () => {
  act(() => mockUnistyles({ theme: "dark" }));
  render(control({ value: "low" }));
  expect(style("Low").backgroundColor).toBe(themes.dark.color.control.primary);
});

test("a disabled control draws every segment label in the disabled color", () => {
  render(control({ isDisabled: true }));
  expect(screen.getByText("Medium").props.style.color).toBe(themes.light.color.text.disabled);
});
