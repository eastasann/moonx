import { DIVIDER_SIZES } from "@moonx/ui-tokens";
import { themes } from "@moonx/ui-tokens/native";
import { render, screen } from "@testing-library/react-native";
import { Divider } from "../src/components/Divider";

/** A separator is not an accessibility element, so the test reads the rendered tree. */
const separator = () => {
  const root = screen.toJSON() as unknown as {
    props: { role: string; style: Record<string, unknown> };
  };
  expect(root.props.role).toBe("separator");
  return root.props.style;
};

test.each(DIVIDER_SIZES)("horizontal size %s is as thick as its token and stretches", (size) => {
  render(<Divider size={size} />);
  expect(separator().height).toBe(themes.light["border-width"].divider[size]);
  expect(separator().width).toBeUndefined();
});

test.each(DIVIDER_SIZES)("vertical size %s sets the width instead", (size) => {
  render(<Divider size={size} orientation="vertical" />);
  expect(separator().width).toBe(themes.light["border-width"].divider[size]);
  expect(separator().height).toBeUndefined();
});

test("defaults to a thin horizontal line in the hairline color", () => {
  render(<Divider />);
  expect(separator().height).toBe(themes.light["border-width"].divider.S);
  expect(separator().backgroundColor).toBe(themes.light.color.border.hairline);
});
