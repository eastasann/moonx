import { COMPONENT_SIZES } from "@moonx/ui-tokens";
import { themes } from "@moonx/ui-tokens/native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import type { ReactTestRendererJSON } from "react-test-renderer";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { Radio, RadioGroup, type RadioGroupProps } from "../src/components/RadioGroup";

type Json = ReactTestRendererJSON;
const find = (node: Json | string | null, pred: (n: Json) => boolean): Json | undefined => {
  if (node === null || typeof node === "string") return undefined;
  if (pred(node)) return node;
  for (const child of node.children ?? []) {
    const hit = find(child, pred);
    if (hit) return hit;
  }
  return undefined;
};
const textOf = (node: Json | string): string =>
  typeof node === "string" ? node : (node.children ?? []).map(textOf).join("");
const indicator = (name: string) => {
  const row = find(screen.toJSON() as Json, (n) => n.props.role === "radio" && textOf(n) === name);
  if (!row) throw new Error(`no radio ${name}`);
  return StyleSheet.flatten(((row.children as Json[])[0] as Json).props.style) as Record<
    string,
    unknown
  >;
};
const checked = (name: string) =>
  screen.getByRole("radio", { name }).props.accessibilityState.checked;

const group = (props: Partial<RadioGroupProps> = {}) => (
  <RadioGroup label="Decision" {...props}>
    <Radio value="proceed">Proceed</Radio>
    <Radio value="hold">Hold</Radio>
    <Radio value="drop" isDisabled>
      Drop
    </Radio>
  </RadioGroup>
);

afterEach(() => act(resetMockUnistyles));

test("is a named radiogroup of named radios, each at least the touch target tall", () => {
  render(group());
  expect(screen.getByLabelText("Decision").props.role).toBe("radiogroup");
  expect(screen.getAllByRole("radio")).toHaveLength(3);
  for (const radio of screen.getAllByRole("radio")) {
    expect(radio.props.style.minHeight).toBeGreaterThanOrEqual(44);
  }
});

test("uncontrolled: choosing reports the value and moves the check", () => {
  const onChange = jest.fn();
  render(group({ onChange }));
  expect(checked("Proceed")).toBe(false);
  fireEvent.press(screen.getByRole("radio", { name: "Hold" }));
  expect(onChange).toHaveBeenLastCalledWith("hold");
  expect(checked("Hold")).toBe(true);
  fireEvent.press(screen.getByRole("radio", { name: "Proceed" }));
  expect(checked("Hold")).toBe(false);
  expect(checked("Proceed")).toBe(true);
});

test("defaultValue and controlled value", () => {
  const onChange = jest.fn();
  const { rerender } = render(group({ defaultValue: "hold" }));
  expect(checked("Hold")).toBe(true);
  rerender(group({ value: "proceed", onChange }));
  expect(checked("Proceed")).toBe(true);
  fireEvent.press(screen.getByRole("radio", { name: "Hold" }));
  expect(onChange).toHaveBeenCalledWith("hold");
  expect(checked("Proceed")).toBe(true);
});

test("a disabled radio, a disabled group and a read-only group block choosing", () => {
  const onChange = jest.fn();
  const { rerender } = render(group({ onChange }));
  fireEvent.press(screen.getByRole("radio", { name: "Drop" }));
  rerender(group({ onChange, isDisabled: true }));
  fireEvent.press(screen.getByRole("radio", { name: "Hold" }));
  rerender(group({ onChange, isReadOnly: true }));
  fireEvent.press(screen.getByRole("radio", { name: "Hold" }));
  expect(onChange).not.toHaveBeenCalled();
  expect(checked("Hold")).toBe(false);
});

test("label, description and error text; hidden label keeps the name", () => {
  const { rerender } = render(
    group({ description: "Pick one", isInvalid: true, errorMessage: "Required" }),
  );
  expect(screen.getByText("Decision")).toBeTruthy();
  expect(screen.getByText("Pick one")).toBeTruthy();
  expect(screen.getByText("Required")).toBeTruthy();
  rerender(group({ description: "Pick one", errorMessage: "Required" }));
  expect(screen.queryByText("Required")).toBeNull();
  rerender(group({ isLabelHidden: true }));
  expect(screen.queryByText("Decision")).toBeNull();
  expect(screen.getByLabelText("Decision")).toBeTruthy();
});

test.each(COMPONENT_SIZES)("size %s draws the indicator at the theme size", (size) => {
  render(group({ size }));
  expect(indicator("Proceed")).toMatchObject({
    width: themes.light.scale.component["radio-button"]["control-size"][size],
  });
});

test("the chosen indicator gets the thick track-fill ring; invalid turns it negative", () => {
  const { rerender } = render(group({ value: "hold" }));
  expect(indicator("Hold")).toMatchObject({
    borderColor: themes.light.color.control["track-fill"],
    borderWidth: expect.any(Number),
  });
  expect(indicator("Hold").borderWidth as number).toBeGreaterThan(
    indicator("Proceed").borderWidth as number,
  );
  rerender(group({ value: "hold", isInvalid: true }));
  expect(indicator("Hold").borderColor).toBe(themes.light.color.negative.fg);
});

test("dark theme recolors the ring", () => {
  act(() => mockUnistyles({ theme: "dark" }));
  render(group({ value: "hold" }));
  expect(indicator("Hold").borderColor).toBe(themes.dark.color.control["track-fill"]);
});

test("horizontal orientation lays radios in a row", () => {
  render(group({ orientation: "horizontal" }));
  expect(StyleSheet.flatten(screen.getByLabelText("Decision").props.style).flexDirection).toBe(
    "row",
  );
});

test("a disabled group draws every radio in the disabled color", () => {
  render(group({ isDisabled: true }));
  const label = screen.getByText("Hold").props.style;
  expect(label.color).toBe(themes.light.color.text.disabled);
});
