import { themes } from "@moonx/ui-tokens/native";
import { render, screen } from "@testing-library/react-native";
import { Text as NativeText, type ViewStyle } from "react-native";
import { Container, Flex, Grid, Stack } from "../src/layout";

const style = (id: string) => screen.getByTestId(id).props.style as ViewStyle;
const space = themes.light.space;

test("Flex applies gap and padding from token names", () => {
  render(
    <Flex testID="f" gap="space-300" padding="space-100" paddingX="space-200" paddingY="space-400">
      <NativeText>a</NativeText>
    </Flex>,
  );
  expect(style("f")).toMatchObject({
    gap: space["300"],
    padding: space["100"],
    paddingHorizontal: space["200"],
    paddingVertical: space["400"],
  });
});

test("Flex defaults to a row without spacing", () => {
  render(<Flex testID="f" />);
  const flex = style("f");
  expect(flex.flexDirection).toBe("row");
  expect(flex.flexWrap).toBe("nowrap");
  expect(flex).not.toHaveProperty("gap");
  expect(flex).not.toHaveProperty("padding");
});

test("Flex applies direction, alignment, justification, wrap and grow", () => {
  render(<Flex testID="f" direction="column" align="center" justify="between" wrap grow />);
  expect(style("f")).toMatchObject({
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    flexGrow: 1,
  });
});

test("Stack is a column and keeps the spacing props", () => {
  render(<Stack testID="s" gap="space-75" />);
  expect(style("s")).toMatchObject({ flexDirection: "column", gap: space["75"] });
});

test("Grid lays children in rows of equal cells and pads the last row", () => {
  render(
    <Grid testID="g" columns={3} gap="space-200" padding="space-100" align="center">
      <NativeText key="a">a</NativeText>
      <NativeText key="b">b</NativeText>
      <NativeText key="c">c</NativeText>
      <NativeText key="d">d</NativeText>
    </Grid>,
  );
  const tree = screen.toJSON() as unknown as {
    props: { style: ViewStyle };
    children: { props: { style: ViewStyle }; children: unknown[] }[];
  };
  expect(tree.props.style).toMatchObject({ padding: space["100"] });
  expect(tree.children).toHaveLength(2);
  const [first, second] = tree.children;
  expect(first?.props.style).toMatchObject({
    flexDirection: "row",
    gap: space["200"],
    alignItems: "center",
  });
  expect(first?.children).toHaveLength(3);
  expect(second?.children).toHaveLength(3);
  for (const text of ["a", "b", "c", "d"]) expect(screen.getByText(text)).toBeTruthy();
});

test("Container caps the width at the reading column or the content width", () => {
  render(
    <>
      <Container testID="r" width="reading" />
      <Container testID="c" />
    </>,
  );
  expect(style("r").maxWidth).toBe(themes.light.layout["reading-column-max"]);
  expect(style("c").maxWidth).toBe(themes.light.layout["content-max"]);
});
