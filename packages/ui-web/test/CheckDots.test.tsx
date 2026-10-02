import { render, screen } from "@testing-library/react";
import { CheckDots } from "../src/components/CheckDots";
import { expectNoAxeViolations } from "./axe";

const items = [
  { label: "Competitors", state: "done", stateLabel: "Done" },
  { label: "Permits", state: "partial", stateLabel: "Partial" },
  { label: "Demand signal", state: "not-started", stateLabel: "Not started" },
] as const;

test("draws one glyph per check by shape: filled, half, empty", () => {
  render(<CheckDots items={[...items]} />);
  expect(screen.getByRole("img")).toHaveTextContent("●◐○");
});

test("names every check and its state for assistive technology", () => {
  render(<CheckDots items={[...items]} />);
  expect(screen.getByRole("img")).toHaveAccessibleName(
    "Competitors: Done, Permits: Partial, Demand signal: Not started",
  );
});

test("has no axe violations", async () => {
  const { container } = render(<CheckDots items={[...items]} size="S" />);
  await expectNoAxeViolations(container);
});
