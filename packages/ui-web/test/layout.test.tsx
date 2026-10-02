import { render, screen } from "@testing-library/react";
import { Container, Flex, Grid, Stack } from "../src/layout";

// jsdom does not load the vanilla-extract CSS, so spacing is checked through the variant class
// names, which carry the token step that the generated rule maps to a `vars.space` value.
describe("layout primitives", () => {
  test("Flex applies gap and padding from token names", () => {
    const { container } = render(
      <Flex gap="space-300" padding="space-100" paddingX="space-200" paddingY="space-400">
        <span>a</span>
      </Flex>,
    );
    const { className } = container.firstElementChild as HTMLElement;
    expect(className).toMatch(/flex_gap_300/);
    expect(className).toMatch(/flex_padding_100/);
    expect(className).toMatch(/flex_paddingX_200/);
    expect(className).toMatch(/flex_paddingY_400/);
  });

  test("Flex applies direction, alignment and justification", () => {
    const { container } = render(
      <Flex direction="column" align="center" justify="between" wrap grow>
        <span>a</span>
      </Flex>,
    );
    const { className } = container.firstElementChild as HTMLElement;
    expect(className).toMatch(/flex_direction_column/);
    expect(className).toMatch(/flex_align_center/);
    expect(className).toMatch(/flex_justify_between/);
    expect(className).toMatch(/flex_wrap_true/);
    expect(className).toMatch(/flex_grow_true/);
  });

  test("Flex without spacing props sets no spacing class", () => {
    const { container } = render(<Flex>a</Flex>);
    expect((container.firstElementChild as HTMLElement).className).not.toMatch(/_gap_|_padding/);
  });

  test("Stack is a column", () => {
    const { container } = render(
      <Stack gap="space-75">
        <span>c</span>
      </Stack>,
    );
    const { className } = container.firstElementChild as HTMLElement;
    expect(className).toMatch(/flex_direction_column/);
    expect(className).toMatch(/flex_gap_75/);
  });

  test("Grid applies columns, gap and padding from token names", () => {
    const { container } = render(
      <Grid columns={3} gap="space-200" padding="space-100" align="center">
        <span>a</span>
        <span>b</span>
      </Grid>,
    );
    const { className } = container.firstElementChild as HTMLElement;
    expect(className).toMatch(/grid_columns_3/);
    expect(className).toMatch(/grid_gap_200/);
    expect(className).toMatch(/grid_padding_100/);
    expect(className).toMatch(/grid_align_center/);
    expect(screen.getByText("b")).toBeInTheDocument();
  });

  test("Container renders the requested element and width", () => {
    render(
      <Container as="main" width="reading">
        body
      </Container>,
    );
    const main = screen.getByRole("main");
    expect(main).toHaveTextContent("body");
    expect(main.className).toMatch(/container_width_reading/);
  });

  test("Container defaults to the content width", () => {
    const { container } = render(<Container>body</Container>);
    expect((container.firstElementChild as HTMLElement).className).toMatch(
      /container_width_content/,
    );
  });
});
