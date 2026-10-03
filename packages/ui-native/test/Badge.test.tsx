import { BADGE_VARIANTS, COMPONENT_SIZES, DECISION_VARIANTS } from "@moonx/ui-tokens";
import { themes } from "@moonx/ui-tokens/native";
import { render, screen } from "@testing-library/react-native";
import type { ReactTestInstance } from "react-test-renderer";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { Badge } from "../src/components/Badge";

afterEach(resetMockUnistyles);

/** The badge's own box is the nearest ancestor that draws a background. */
function backgroundOf(node: ReactTestInstance): string | undefined {
  for (let current = node.parent; current; current = current.parent) {
    const color = current.props.style?.backgroundColor;
    if (color) return color;
  }
  return undefined;
}

const palette = (theme: keyof typeof themes, variant: (typeof BADGE_VARIANTS)[number]) =>
  (DECISION_VARIANTS as readonly string[]).includes(variant)
    ? themes[theme].color.decision[variant as (typeof DECISION_VARIANTS)[number]]
    : themes[theme].color[
        variant as Exclude<(typeof BADGE_VARIANTS)[number], (typeof DECISION_VARIANTS)[number]>
      ];

test.each(BADGE_VARIANTS)("variant %s shows its label in its own colors", (variant) => {
  render(<Badge variant={variant}>Label</Badge>);
  expect(screen.getByText("Label").props.style.color).toBe(palette("light", variant).fg);
  expect(backgroundOf(screen.getByText("Label"))).toBe(palette("light", variant).bg);
});

test("defaults to neutral and M", () => {
  render(<Badge>Overdue</Badge>);
  expect(screen.getByText("Overdue").props.style.color).toBe(themes.light.color.neutral.fg);
});

test("drop is not the negative color", () => {
  render(<Badge variant="drop">Drop</Badge>);
  expect(screen.getByText("Drop").props.style.color).not.toBe(themes.light.color.negative.fg);
});

test("sizes grow the label", () => {
  const sizes = COMPONENT_SIZES.map((size) => {
    const { unmount } = render(<Badge size={size}>Label</Badge>);
    const fontSize = screen.getByText("Label").props.style.fontSize;
    unmount();
    return fontSize;
  });
  expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
  expect(new Set(sizes).size).toBe(COMPONENT_SIZES.length);
});

test("the dark theme swaps the colors", () => {
  mockUnistyles({ theme: "dark" });
  render(<Badge variant="proceed">Proceed</Badge>);
  expect(screen.getByText("Proceed").props.style.color).toBe(palette("dark", "proceed").fg);
  expect(palette("dark", "proceed").fg).not.toBe(palette("light", "proceed").fg);
});
