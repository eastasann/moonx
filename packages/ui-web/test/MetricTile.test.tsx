import { render, screen } from "@testing-library/react";
import { MetricTile } from "../src/components/MetricTile";
import { expectNoAxeViolations } from "./axe";

test("names the value by its label", () => {
  render(<MetricTile label="Startup cost" value="₱450,000+" />);
  expect(screen.getByRole("term")).toHaveTextContent("Startup cost");
  expect(screen.getByRole("definition")).toHaveTextContent("₱450,000+");
});

test("shows the note under the value when given", () => {
  render(<MetricTile label="Break-even" value="—" note="Needs price" />);
  expect(screen.getByText("Needs price")).toBeInTheDocument();
});

test("has no axe violations", async () => {
  const { container } = render(<MetricTile label="Payback" value="9.2" note="months" />);
  await expectNoAxeViolations(container);
});
