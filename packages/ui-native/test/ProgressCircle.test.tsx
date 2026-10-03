import { render, screen } from "@testing-library/react-native";
import { ProgressCircle } from "../src/components/ProgressCircle";

const circle = () => screen.getByRole("progressbar");

test("is a named progressbar with its value and spoken text", () => {
  render(<ProgressCircle aria-label="Upload" value={40} valueLabel="40%" />);
  expect(circle().props.accessibilityLabel).toBe("Upload");
  expect(circle().props.accessibilityValue).toEqual({ min: 0, max: 100, now: 40, text: "40%" });
});

test("an indeterminate circle reports no value", () => {
  render(<ProgressCircle aria-label="Saving" isIndeterminate value={40} />);
  expect(circle().props.accessibilityValue).toEqual({});
});

test.each([
  ["S", 16],
  ["M", 32],
  ["L", 64],
] as const)("size %s is %i points wide", (size, width) => {
  render(<ProgressCircle aria-label="Upload" size={size} value={10} />);
  expect(circle().props.style.width).toBe(width);
});

test("a range with no span draws an empty arc instead of NaN", () => {
  render(<ProgressCircle aria-label="Upload" value={0} minValue={0} maxValue={0} />);
  const json = JSON.stringify(screen.toJSON());
  expect(json).not.toContain("NaN");
});
