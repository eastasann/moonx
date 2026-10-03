import { render, screen } from "@testing-library/react-native";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { Heading, type HeadingVariant } from "../src/components/Heading";

afterEach(resetMockUnistyles);

test.each([1, 2, 3, 4] as const)("level %s is a heading with that aria-level", (level) => {
  render(<Heading level={level}>Plan</Heading>);
  expect(screen.getByRole("heading", { name: "Plan" }).props["aria-level"]).toBe(level);
});

test("the look follows the level unless variant is given", () => {
  const { rerender } = render(<Heading level={2}>Plan</Heading>);
  const sizeOf = () => screen.getByRole("heading").props.style.fontSize;
  const level2 = sizeOf();
  rerender(
    <Heading level={2} variant="display">
      Plan
    </Heading>,
  );
  expect(sizeOf()).toBeGreaterThan(level2);
  rerender(<Heading level={1}>Plan</Heading>);
  expect(sizeOf()).toBeGreaterThan(level2);
});

test.each<HeadingVariant>(["display", "heading-1", "heading-2", "heading-3", "heading-4"])(
  "variant %s uses the display typeface",
  (variant) => {
    render(
      <Heading level={1} variant={variant}>
        Plan
      </Heading>,
    );
    expect(screen.getByRole("heading").props.style.fontFamily).toBe("Fraunces");
  },
);

test("id becomes the native id", () => {
  render(
    <Heading level={1} id="title">
      Plan
    </Heading>,
  );
  expect(screen.getByRole("heading").props.nativeID).toBe("title");
});

test("the color follows the theme", () => {
  render(<Heading level={1}>Plan</Heading>);
  const light = screen.getByRole("heading").props.style.color;
  mockUnistyles({ theme: "dark" });
  screen.rerender(<Heading level={1}>Plan</Heading>);
  expect(screen.getByRole("heading").props.style.color).not.toBe(light);
});
