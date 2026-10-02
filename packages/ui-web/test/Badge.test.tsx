import { BADGE_VARIANTS, COMPONENT_SIZES } from "@moonx/ui-tokens";
import { render, screen } from "@testing-library/react";
import { Badge } from "../src/components/Badge";
import { expectNoAxeViolations } from "./axe";

test("renders every variant and size", () => {
  for (const variant of BADGE_VARIANTS) {
    for (const size of COMPONENT_SIZES) {
      const { unmount } = render(
        <Badge variant={variant} size={size}>
          {variant}
        </Badge>,
      );
      expect(screen.getByText(variant)).toBeInTheDocument();
      unmount();
    }
  }
});

test("defaults to neutral", () => {
  const { container: neutral } = render(<Badge>Overdue</Badge>);
  const { container: explicit } = render(<Badge variant="neutral">Overdue</Badge>);
  expect(neutral.firstElementChild?.className).toBe(explicit.firstElementChild?.className);
});

test("the drop decision does not share the negative style", () => {
  const { container: drop } = render(<Badge variant="drop">Drop</Badge>);
  const { container: negative } = render(<Badge variant="negative">Overdue</Badge>);
  expect(drop.firstElementChild?.className).not.toBe(negative.firstElementChild?.className);
});

test("has no axe violations", async () => {
  const { container } = render(<Badge variant="proceed">Proceed</Badge>);
  await expectNoAxeViolations(container);
});
