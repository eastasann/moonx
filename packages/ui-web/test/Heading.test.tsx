import { render, screen } from "@testing-library/react";
import { Heading } from "../src/components/Heading";
import { expectNoAxeViolations } from "./axe";

test("renders the element of its level", () => {
  render(<Heading level={2}>Validation</Heading>);
  expect(screen.getByRole("heading", { level: 2, name: "Validation" })).toBeInTheDocument();
});

test("the look can differ from the level", () => {
  render(
    <Heading level={1} variant="display">
      Start
    </Heading>,
  );
  expect(screen.getByRole("heading", { level: 1, name: "Start" })).toBeInTheDocument();
});

test("has no axe violations", async () => {
  const { container } = render(<Heading level={1}>Title</Heading>);
  await expectNoAxeViolations(container);
});
