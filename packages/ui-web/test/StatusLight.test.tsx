import { CHECK_VARIANTS, COMPONENT_SIZES, FAU_VARIANTS, STATUS_VARIANTS } from "@moonx/ui-tokens";
import { render, screen } from "@testing-library/react";
import { StatusLight } from "../src/components/StatusLight";
import { expectNoAxeViolations } from "./axe";

test("renders every variant and size with its label", () => {
  for (const variant of [...STATUS_VARIANTS, ...FAU_VARIANTS, ...CHECK_VARIANTS]) {
    for (const size of COMPONENT_SIZES) {
      const { unmount } = render(
        <StatusLight variant={variant} size={size}>
          {variant}
        </StatusLight>,
      );
      expect(screen.getByText(variant)).toBeInTheDocument();
      unmount();
    }
  }
});

test("hides the dot from assistive technology so the label carries the meaning", () => {
  const { container } = render(<StatusLight variant="fact">Fact</StatusLight>);
  expect(container.querySelector("[aria-hidden=true]")).toBeInTheDocument();
  expect(container).toHaveTextContent("Fact");
});

test("has no axe violations", async () => {
  const { container } = render(
    <>
      <StatusLight variant="assumption">Assumption</StatusLight>
      <StatusLight variant="not-started">Not started</StatusLight>
    </>,
  );
  await expectNoAxeViolations(container);
});
