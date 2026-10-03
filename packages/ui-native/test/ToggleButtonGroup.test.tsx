import { COMPONENT_SIZES } from "@moonx/ui-tokens";
import { themes } from "@moonx/ui-tokens/native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import {
  ToggleButtonGroup,
  ToggleButtonGroupItem,
  type ToggleButtonGroupProps,
} from "../src/components/ToggleButtonGroup";

const group = (props: Partial<ToggleButtonGroupProps> = {}) => (
  <ToggleButtonGroup aria-label="Answer type" {...props}>
    <ToggleButtonGroupItem value="fact">F</ToggleButtonGroupItem>
    <ToggleButtonGroupItem value="assumption" aria-label="Assumption">
      A
    </ToggleButtonGroupItem>
    <ToggleButtonGroupItem value="unknown" isDisabled>
      U
    </ToggleButtonGroupItem>
  </ToggleButtonGroup>
);
const checked = (name: string) =>
  screen.getByRole("radio", { name }).props.accessibilityState.checked;
const style = (name: string) =>
  StyleSheet.flatten(screen.getByRole("radio", { name }).props.style) as Record<string, unknown>;

afterEach(() => act(resetMockUnistyles));

test("is a named group of named toggle items", () => {
  render(group());
  expect(screen.getByLabelText("Answer type")).toBeTruthy();
  expect(screen.getByRole("radio", { name: "F" })).toBeTruthy();
  expect(screen.getByRole("radio", { name: "Assumption" })).toBeTruthy();
});

test.each(COMPONENT_SIZES)("size %s keeps every item at least the touch target", (size) => {
  render(group({ size }));
  for (const item of screen.getAllByRole("radio")) {
    expect(item.props.style.minHeight).toBeGreaterThanOrEqual(44);
    expect(item.props.style.minWidth).toBeGreaterThanOrEqual(44);
  }
});

test("uncontrolled: choosing, switching and pressing the chosen one again clears it", () => {
  const onChange = jest.fn();
  render(group({ onChange }));
  fireEvent.press(screen.getByRole("radio", { name: "F" }));
  expect(onChange).toHaveBeenLastCalledWith("fact");
  expect(checked("F")).toBe(true);
  fireEvent.press(screen.getByRole("radio", { name: "Assumption" }));
  expect(onChange).toHaveBeenLastCalledWith("assumption");
  expect(checked("F")).toBe(false);
  fireEvent.press(screen.getByRole("radio", { name: "Assumption" }));
  expect(onChange).toHaveBeenLastCalledWith(null);
  expect(checked("Assumption")).toBe(false);
});

test("defaultValue starts chosen", () => {
  render(group({ defaultValue: "fact" }));
  expect(checked("F")).toBe(true);
});

test("controlled: value wins; null means none", () => {
  const onChange = jest.fn();
  const { rerender } = render(group({ value: null, onChange }));
  fireEvent.press(screen.getByRole("radio", { name: "F" }));
  expect(onChange).toHaveBeenCalledWith("fact");
  expect(checked("F")).toBe(false);
  rerender(group({ value: "fact", onChange }));
  expect(checked("F")).toBe(true);
  fireEvent.press(screen.getByRole("radio", { name: "F" }));
  expect(onChange).toHaveBeenLastCalledWith(null);
  expect(checked("F")).toBe(true);
});

test("a disabled item and a disabled group block presses", () => {
  const onChange = jest.fn();
  const { rerender } = render(group({ onChange }));
  fireEvent.press(screen.getByRole("radio", { name: "U" }));
  rerender(group({ onChange, isDisabled: true }));
  fireEvent.press(screen.getByRole("radio", { name: "F" }));
  expect(onChange).not.toHaveBeenCalled();
});

test("the chosen item has the selected surface and track-fill border;", () => {
  render(group({ value: "fact" }));
  expect(style("F")).toMatchObject({
    backgroundColor: themes.light.color.surface.selected,
    borderColor: themes.light.color.control["track-fill"],
  });
  expect(style("Assumption").backgroundColor).toBe(themes.light.color.surface.raised);
});

test("vertical orientation stacks the items", () => {
  render(group({ orientation: "vertical" }));
  expect(StyleSheet.flatten(screen.getByLabelText("Answer type").props.style).flexDirection).toBe(
    "column",
  );
});

test("dark theme recolors the chosen one", () => {
  act(() => mockUnistyles({ theme: "dark" }));
  render(group({ value: "fact" }));
  expect(style("F").backgroundColor).toBe(themes.dark.color.surface.selected);
});

test("a disabled group draws every item label in the disabled color", () => {
  render(group({ isDisabled: true }));
  expect(screen.getByText("F").props.style.color).toBe(themes.light.color.text.disabled);
});
