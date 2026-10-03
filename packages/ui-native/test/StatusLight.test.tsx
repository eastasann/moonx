import { COMPONENT_SIZES, STATUS_LIGHT_VARIANTS } from "@moonx/ui-tokens";
import { themes } from "@moonx/ui-tokens/native";
import { render, screen } from "@testing-library/react-native";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { StatusLight } from "../src/components/StatusLight";
import { strongColors } from "../src/components/StatusLight/colors";

afterEach(resetMockUnistyles);

const dotOf = () => {
  const dot = screen
    .UNSAFE_getAllByProps({ "aria-hidden": true })
    .find((node) => typeof node.type === "string");
  if (!dot) throw new Error("no dot");
  return dot;
};

test.each(STATUS_LIGHT_VARIANTS)(
  "variant %s draws a dot in its strong color with a label",
  (variant) => {
    render(<StatusLight variant={variant}>Label</StatusLight>);
    expect(dotOf().props.style.backgroundColor).toBe(strongColors(themes.light)[variant]);
    expect(screen.getByText("Label")).toBeTruthy();
  },
);

test("the dot is hidden from assistive technology so the label carries the meaning", () => {
  render(<StatusLight variant="fact">Label</StatusLight>);
  expect(dotOf().props["aria-hidden"]).toBe(true);
});

test.each(COMPONENT_SIZES)("size %s sets the dot size from the token", (size) => {
  render(
    <StatusLight variant="done" size={size}>
      Label
    </StatusLight>,
  );
  expect(dotOf().props.style.width).toBe(
    themes.light.scale.component["status-light"]["dot-size"][size],
  );
});

test("the dark theme uses the dark colors", () => {
  mockUnistyles({ theme: "dark" });
  render(<StatusLight variant="negative">Label</StatusLight>);
  expect(dotOf().props.style.backgroundColor).toBe(themes.dark.color.negative.strong);
});
