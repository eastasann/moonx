import { render, screen } from "@testing-library/react";
import { Text } from "../src/components/Text";
import { expectNoAxeViolations } from "./axe";

test("is a paragraph by default and can be a span", () => {
  const { rerender, container } = render(<Text>First</Text>);
  expect(container.querySelector("p")).toHaveTextContent("First");
  rerender(<Text as="span">Second</Text>);
  expect(container.querySelector("span")).toHaveTextContent("Second");
});

test("renders every variant and tone", () => {
  for (const variant of ["body", "body-long", "body-sm", "caption", "label"] as const) {
    for (const tone of ["primary", "secondary", "negative"] as const) {
      const { unmount } = render(
        <Text variant={variant} tone={tone}>
          {variant}-{tone}
        </Text>,
      );
      expect(screen.getByText(`${variant}-${tone}`)).toBeInTheDocument();
      unmount();
    }
  }
});

test("has no axe violations", async () => {
  const { container } = render(<Text>Body</Text>);
  await expectNoAxeViolations(container);
});
