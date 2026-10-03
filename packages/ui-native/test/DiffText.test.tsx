import { themes } from "@moonx/ui-tokens/native";
import { render, screen } from "@testing-library/react-native";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { type DiffSegment, DiffText } from "../src/components/DiffText";

afterEach(resetMockUnistyles);

const segments: DiffSegment[] = [
  { kind: "same", text: "We sell " },
  { kind: "removed", text: "cakes" },
  { kind: "added", text: "piaya" },
  { kind: "same", text: " boxes" },
];

test("before draws unchanged and removed runs; removed is struck through", () => {
  render(<DiffText segments={segments} side="before" />);
  expect(screen.getByText("cakes").props.style.textDecorationLine).toBe("line-through");
  expect(screen.queryByText("piaya")).toBeNull();
  expect(screen.getByText(/We sell/)).toBeTruthy();
});

test("after draws unchanged and added runs; added is underlined", () => {
  render(<DiffText segments={segments} side="after" />);
  expect(screen.getByText("piaya").props.style.textDecorationLine).toBe("underline");
  expect(screen.queryByText("cakes")).toBeNull();
});

test("the marks come with their own colors from the theme, in both modes", () => {
  render(<DiffText segments={segments} side="after" />);
  expect(screen.getByText("piaya").props.style.color).toBe(themes.light.color.positive.fg);
  mockUnistyles({ theme: "dark" });
  screen.rerender(<DiffText segments={segments} side="before" />);
  expect(screen.getByText("cakes").props.style.color).toBe(themes.dark.color.negative.fg);
});

test("unchanged runs carry no mark", () => {
  render(<DiffText segments={segments} side="after" />);
  expect(screen.getByText(" boxes").props.style).toBeUndefined();
});

test("the text reads in order with the hidden side left out", () => {
  render(<DiffText segments={segments} side="after" />);
  const root = screen.toJSON() as { children: { children: string[] }[] };
  expect(root.children.map((child) => child.children.join("")).join("")).toBe(
    "We sell piaya boxes",
  );
});
