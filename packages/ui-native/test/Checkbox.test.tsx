import { COMPONENT_SIZES } from "@moonx/ui-tokens";
import { themes } from "@moonx/ui-tokens/native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import type { ReactTestRendererJSON } from "react-test-renderer";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { Checkbox } from "../src/components/Checkbox";
import { CheckboxGroup } from "../src/components/CheckboxGroup";

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
const boxOf = (name: string) => {
  const root = screen.toJSON() as Json | Json[];
  const trees = Array.isArray(root) ? root : [root];
  for (const tree of trees) {
    const row = find(tree, (n) => n.props.role === "checkbox" && textOf(n) === name);
    if (row)
      return StyleSheet.flatten(((row.children as Json[])[0] as Json).props.style) as Record<
        string,
        unknown
      >;
  }
  throw new Error(`no checkbox ${name}`);
};
const state = () => screen.getByRole("checkbox").props.accessibilityState;

afterEach(resetMockUnistyles);

test("is a named checkbox with checked state and a tall enough target", () => {
  render(<Checkbox>Accept</Checkbox>);
  const box = screen.getByRole("checkbox", { name: "Accept" });
  expect(box.props.accessibilityState.checked).toBe(false);
  expect(box.props.style.minHeight).toBeGreaterThanOrEqual(44);
});

test.each(COMPONENT_SIZES)(
  "size %s draws the box at the theme control size but keeps the target",
  (size) => {
    render(<Checkbox size={size}>Accept</Checkbox>);
    expect(screen.getByRole("checkbox").props.style.minHeight).toBeGreaterThanOrEqual(44);
    expect(boxOf("Accept").width).toBe(themes.light.scale.component.checkbox["control-size"][size]);
  },
);

test("uncontrolled: a press toggles and reports", () => {
  const onChange = jest.fn();
  render(<Checkbox onChange={onChange}>Accept</Checkbox>);
  fireEvent.press(screen.getByRole("checkbox"));
  expect(onChange).toHaveBeenLastCalledWith(true);
  expect(state().checked).toBe(true);
  fireEvent.press(screen.getByRole("checkbox"));
  expect(onChange).toHaveBeenLastCalledWith(false);
});

test("defaultSelected starts checked", () => {
  render(<Checkbox defaultSelected>Accept</Checkbox>);
  expect(state().checked).toBe(true);
});

test("controlled: reports but follows isSelected", () => {
  const onChange = jest.fn();
  const { rerender } = render(
    <Checkbox isSelected={false} onChange={onChange}>
      Accept
    </Checkbox>,
  );
  fireEvent.press(screen.getByRole("checkbox"));
  expect(onChange).toHaveBeenCalledWith(true);
  expect(state().checked).toBe(false);
  rerender(
    <Checkbox isSelected onChange={onChange}>
      Accept
    </Checkbox>,
  );
  expect(state().checked).toBe(true);
});

test("disabled and read-only block presses", () => {
  const onChange = jest.fn();
  const { rerender } = render(
    <Checkbox isDisabled onChange={onChange}>
      Accept
    </Checkbox>,
  );
  fireEvent.press(screen.getByRole("checkbox"));
  expect(state().disabled).toBe(true);
  rerender(
    <Checkbox isReadOnly onChange={onChange}>
      Accept
    </Checkbox>,
  );
  fireEvent.press(screen.getByRole("checkbox"));
  expect(onChange).not.toHaveBeenCalled();
  expect(state().checked).toBe(false);
});

test("indeterminate is announced as mixed", () => {
  render(<Checkbox isIndeterminate>Some</Checkbox>);
  expect(state().checked).toBe("mixed");
});

test("description is the hint; the error shows only while invalid", () => {
  const { rerender } = render(
    <Checkbox description="We keep it private" errorMessage="Required">
      Accept
    </Checkbox>,
  );
  expect(screen.getByText("We keep it private")).toBeTruthy();
  expect(screen.queryByText("Required")).toBeNull();
  expect(screen.getByRole("checkbox").props.accessibilityHint).toBe("We keep it private");
  rerender(
    <Checkbox isInvalid description="We keep it private" errorMessage="Required">
      Accept
    </Checkbox>,
  );
  expect(screen.getByText("Required")).toBeTruthy();
  expect(screen.getByRole("checkbox").props.accessibilityHint).toBe("We keep it private. Required");
});

test("aria-label overrides the text name", () => {
  render(<Checkbox aria-label="Agree">✓</Checkbox>);
  expect(screen.getByRole("checkbox", { name: "Agree" })).toBeTruthy();
});

test("selected box uses the track-fill color, in the dark theme too", () => {
  render(<Checkbox defaultSelected>Accept</Checkbox>);
  expect(boxOf("Accept").backgroundColor).toBe(themes.light.color.control["track-fill"]);
  mockUnistyles({ theme: "dark" });
  render(<Checkbox defaultSelected>Dark</Checkbox>);
  expect(boxOf("Dark").backgroundColor).toBe(themes.dark.color.control["track-fill"]);
});

test("invalid unselected box has the negative border", () => {
  render(<Checkbox isInvalid>Accept</Checkbox>);
  expect(boxOf("Accept").borderColor).toBe(themes.light.color.negative.fg);
});

describe("CheckboxGroup", () => {
  const group = (props = {}) => (
    <CheckboxGroup label="Scope" {...props}>
      <Checkbox value="a">Alpha</Checkbox>
      <Checkbox value="b">Beta</Checkbox>
    </CheckboxGroup>
  );

  test("is a named group of checkboxes", () => {
    render(group());
    expect(screen.getByLabelText("Scope")).toBeTruthy();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });

  test("uncontrolled: collects values and reports the array", () => {
    const onChange = jest.fn();
    render(group({ onChange }));
    fireEvent.press(screen.getByRole("checkbox", { name: "Beta" }));
    expect(onChange).toHaveBeenLastCalledWith(["b"]);
    fireEvent.press(screen.getByRole("checkbox", { name: "Alpha" }));
    expect(onChange).toHaveBeenLastCalledWith(["b", "a"]);
    fireEvent.press(screen.getByRole("checkbox", { name: "Beta" }));
    expect(onChange).toHaveBeenLastCalledWith(["a"]);
  });

  test("defaultValue and controlled value set the checked items", () => {
    const { rerender } = render(group({ defaultValue: ["a"] }));
    expect(screen.getByRole("checkbox", { name: "Alpha" }).props.accessibilityState.checked).toBe(
      true,
    );
    expect(screen.getByRole("checkbox", { name: "Beta" }).props.accessibilityState.checked).toBe(
      false,
    );
    rerender(group({ value: ["b"] }));
    expect(screen.getByRole("checkbox", { name: "Beta" }).props.accessibilityState.checked).toBe(
      true,
    );
    fireEvent.press(screen.getByRole("checkbox", { name: "Alpha" }));
    expect(screen.getByRole("checkbox", { name: "Alpha" }).props.accessibilityState.checked).toBe(
      false,
    );
  });

  test("isDisabled and isReadOnly reach the items", () => {
    const onChange = jest.fn();
    const { rerender } = render(group({ isDisabled: true, onChange }));
    fireEvent.press(screen.getByRole("checkbox", { name: "Alpha" }));
    rerender(group({ isReadOnly: true, onChange }));
    fireEvent.press(screen.getByRole("checkbox", { name: "Alpha" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  test("label, description and error text; hidden label keeps the name", () => {
    const { rerender } = render(
      group({ description: "Pick some", isInvalid: true, errorMessage: "Pick one" }),
    );
    expect(screen.getByText("Scope")).toBeTruthy();
    expect(screen.getByText("Pick some")).toBeTruthy();
    expect(screen.getByText("Pick one")).toBeTruthy();
    rerender(group({ isLabelHidden: true }));
    expect(screen.queryByText("Scope")).toBeNull();
    expect(screen.getByLabelText("Scope")).toBeTruthy();
  });

  test("a group size is handed to the items", () => {
    render(group({ size: "XL" }));
    expect(screen.getAllByRole("checkbox")[0]?.props.style.minHeight).toBeGreaterThanOrEqual(44);
  });

  test("horizontal orientation lays items in a row", () => {
    render(group({ orientation: "horizontal" }));
    expect(StyleSheet.flatten(screen.getByLabelText("Scope").props.style).flexDirection).toBe(
      "row",
    );
  });
});

test("a standalone checkbox reports each press to onChange once", () => {
  const onChange = jest.fn();
  render(<Checkbox onChange={onChange}>Agree</Checkbox>);
  fireEvent.press(screen.getByRole("checkbox", { name: "Agree" }));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(true);
  expect(screen.getByRole("checkbox", { name: "Agree" }).props.accessibilityState.checked).toBe(
    true,
  );
});

test("a checkbox without a value inside a group still toggles on its own", () => {
  const onChange = jest.fn();
  render(
    <CheckboxGroup label="Options">
      <Checkbox onChange={onChange}>Loose</Checkbox>
    </CheckboxGroup>,
  );
  fireEvent.press(screen.getByRole("checkbox", { name: "Loose" }));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("checkbox", { name: "Loose" }).props.accessibilityState.checked).toBe(
    true,
  );
});
