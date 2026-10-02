import { render, screen } from "@testing-library/react";
import { ProgressCircle } from "../src/components/ProgressCircle";
import { expectNoAxeViolations } from "./axe";

test("determinate circle exposes name and value", () => {
  render(<ProgressCircle aria-label="Sending" value={60} />);
  const bar = screen.getByRole("progressbar", { name: "Sending" });
  expect(bar).toHaveAttribute("aria-valuenow", "60");
});

test("indeterminate circle has no value", () => {
  render(<ProgressCircle aria-label="Sending" isIndeterminate />);
  expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
});

test("renders every size", () => {
  for (const size of ["S", "M", "L"] as const) {
    const { unmount } = render(<ProgressCircle aria-label={size} value={10} size={size} />);
    expect(screen.getByRole("progressbar", { name: size })).toBeInTheDocument();
    unmount();
  }
});

test("has no axe violations", async () => {
  const { container } = render(
    <>
      <ProgressCircle aria-label="Determinate" value={30} />
      <ProgressCircle aria-label="Indeterminate" isIndeterminate />
    </>,
  );
  await expectNoAxeViolations(container);
});
