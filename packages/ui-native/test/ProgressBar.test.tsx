import { COMPONENT_SIZES } from "@moonx/ui-tokens";
import { themes } from "@moonx/ui-tokens/native";
import { act, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, StyleSheet } from "react-native";
import type { ReactTestRendererJSON } from "react-test-renderer";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { ProgressBar } from "../src/components/ProgressBar";

type Json = ReactTestRendererJSON;
const root = () => screen.toJSON() as Json;
const trackOf = () => (root().children as Json[])[1] as Json;
const fillOf = () => (trackOf().children as Json[])[0] as Json;
const flat = (element: Json) =>
  StyleSheet.flatten(element.props.style as never) as Record<string, unknown>;

test("is a named progressbar carrying min, max, now and the value text", () => {
  render(<ProgressBar label="Preparing PDF…" valueLabel="40%" value={40} />);
  const bar = screen.getByRole("progressbar", { name: "Preparing PDF…" });
  expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 40, text: "40%" });
  expect(screen.getByText("40%")).toBeTruthy();
});

test("takes its name from the text of a node label", () => {
  render(<ProgressBar label={["Uploading ", "photo"]} value={1} maxValue={4} />);
  expect(screen.getByRole("progressbar", { name: "Uploading photo" })).toBeTruthy();
});

test.each([
  [0, "0%"],
  [25, "25%"],
  [100, "100%"],
])("value %s fills %s of the track", (value, width) => {
  render(<ProgressBar label="Work" value={value} testID="bar" />);
  expect(flat(fillOf())).toMatchObject({ width });
});

test("honors minValue and maxValue and clamps the fill into the track", () => {
  render(<ProgressBar label="Work" value={500} minValue={0} maxValue={200} />);
  expect(screen.getByRole("progressbar").props.accessibilityValue).toMatchObject({
    min: 0,
    max: 200,
    now: 500,
  });
});

test("indeterminate drops the value and the value text", () => {
  render(<ProgressBar label="Work" valueLabel="40%" value={40} isIndeterminate />);
  expect(screen.getByRole("progressbar").props.accessibilityValue).toEqual({});
  expect(screen.queryByText("40%")).toBeNull();
});

test.each(COMPONENT_SIZES)("size %s sets the track to the meter thickness of the theme", (size) => {
  render(<ProgressBar label="Work" size={size} value={10} testID="bar" />);
  expect(flat(trackOf()).height).toBe(themes.light.scale.component.meter.thickness[size]);
});

test("the dark theme draws the fill with the dark track-fill color", () => {
  act(() => mockUnistyles({ theme: "dark" }));
  render(<ProgressBar label="Work" value={10} testID="bar" />);
  expect(flat(fillOf()).backgroundColor).toBe(themes.dark.color.control["track-fill"]);
  expect(flat(trackOf()).backgroundColor).toBe(themes.dark.color.control.track);
});

beforeEach(() => {
  // Never settles, so the hook does not update state outside act.
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockReturnValue(new Promise(() => {}));
});
afterEach(() => {
  act(resetMockUnistyles);
  jest.restoreAllMocks();
});
