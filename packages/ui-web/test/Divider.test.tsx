import { DIVIDER_SIZES } from "@moonx/ui-tokens";
import { render, screen } from "@testing-library/react";
import { Divider } from "../src/components/Divider";
import { expectNoAxeViolations } from "./axe";

test("renders every size as a separator", () => {
  for (const size of DIVIDER_SIZES) {
    const { unmount } = render(<Divider size={size} />);
    expect(screen.getByRole("separator")).toBeInTheDocument();
    unmount();
  }
});

test("vertical divider reports its orientation", () => {
  render(<Divider orientation="vertical" size="L" />);
  expect(screen.getByRole("separator")).toHaveAttribute("aria-orientation", "vertical");
});

test("has no axe violations", async () => {
  const { container } = render(
    <div>
      <Divider />
      <Divider size="M" />
      <Divider size="L" />
    </div>,
  );
  await expectNoAxeViolations(container);
});
