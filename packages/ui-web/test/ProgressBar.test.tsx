import { COMPONENT_SIZES } from "@moonx/ui-tokens";
import { render, screen } from "@testing-library/react";
import { ProgressBar } from "../src/components/ProgressBar";
import { expectNoAxeViolations } from "./axe";

test("determinate bar exposes name, value and value text", () => {
  render(<ProgressBar label="Preparing PDF…" value={40} valueLabel="40%" />);
  const bar = screen.getByRole("progressbar", { name: "Preparing PDF…" });
  expect(bar).toHaveAttribute("aria-valuenow", "40");
  expect(bar).toHaveAttribute("aria-valuetext", "40%");
  expect(screen.getByText("40%")).toBeInTheDocument();
});

test("fills in proportion to the value", () => {
  const { container } = render(<ProgressBar label="Upload" value={25} maxValue={50} />);
  expect(container.querySelector<HTMLElement>("[style]")?.style.width).toBe("50%");
});

test("indeterminate bar has no value", () => {
  render(<ProgressBar label="Preparing PDF…" isIndeterminate valueLabel="40%" />);
  const bar = screen.getByRole("progressbar");
  expect(bar).not.toHaveAttribute("aria-valuenow");
  expect(screen.queryByText("40%")).toBeNull();
});

test("renders every size", () => {
  for (const size of COMPONENT_SIZES) {
    const { unmount } = render(<ProgressBar label={`Size ${size}`} value={10} size={size} />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    unmount();
  }
});

test("has no axe violations", async () => {
  const { container } = render(
    <>
      <ProgressBar label="Determinate" value={30} />
      <ProgressBar label="Indeterminate" isIndeterminate />
    </>,
  );
  await expectNoAxeViolations(container);
});
