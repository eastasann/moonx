import type { CheckVariant } from "@moonx/ui-tokens";
import { themes } from "@moonx/ui-tokens/native";
import { render, screen } from "@testing-library/react-native";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { CheckDots, type CheckDotsItem } from "../src/components/CheckDots";

afterEach(resetMockUnistyles);

const hidden = { includeHiddenElements: true };

const labels: Record<CheckVariant, string> = {
  done: "Done",
  partial: "Partial",
  "not-started": "Not started",
};
const items: CheckDotsItem[] = (
  [
    ["Problem", "done"],
    ["Customer", "partial"],
    ["Price", "not-started"],
  ] as const
).map(([label, state]) => ({ label, state, stateLabel: labels[state] }));

test("one image named by every check and its state, in order", () => {
  render(<CheckDots items={items} />);
  expect(
    screen.getByRole("img", { name: "Problem: Done, Customer: Partial, Price: Not started" }),
  ).toBeTruthy();
});

test("the shape carries the state", () => {
  render(<CheckDots items={items} />);
  expect(screen.getByText("●", hidden)).toBeTruthy();
  expect(screen.getByText("◐", hidden)).toBeTruthy();
  expect(screen.getByText("○", hidden)).toBeTruthy();
});

test("the glyphs are hidden individually and take the check colors", () => {
  render(<CheckDots items={items} />);
  const done = screen.getByText("●", hidden);
  expect(done.props["aria-hidden"]).toBe(true);
  expect(done.props.style.color).toBe(themes.light.color.check.done.strong);
});

test("size S is smaller than M", () => {
  const { rerender } = render(<CheckDots items={items} size="S" />);
  const small = screen.getByText("●", hidden).props.style.fontSize;
  rerender(<CheckDots items={items} size="M" />);
  expect(screen.getByText("●", hidden).props.style.fontSize).toBeGreaterThan(small);
});

test("the dark theme uses the dark check colors", () => {
  mockUnistyles({ theme: "dark" });
  render(<CheckDots items={items} />);
  expect(screen.getByText("◐", hidden).props.style.color).toBe(
    themes.dark.color.check.partial.strong,
  );
});
