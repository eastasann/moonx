import { INLINE_ALERT_VARIANTS } from "@moonx/ui-tokens";
import { render, screen } from "@testing-library/react";
import { InlineAlert } from "../src/components/InlineAlert";
import { expectNoAxeViolations } from "./axe";

test("renders every variant with heading and body", () => {
  for (const variant of INLINE_ALERT_VARIANTS) {
    const { unmount } = render(
      <InlineAlert variant={variant} heading={`Heading ${variant}`}>
        Body {variant}
      </InlineAlert>,
    );
    expect(screen.getByText(`Heading ${variant}`)).toBeInTheDocument();
    expect(screen.getByText(`Body ${variant}`)).toBeInTheDocument();
    unmount();
  }
});

test("negative defaults to role alert and the others to status", () => {
  const { rerender } = render(<InlineAlert variant="negative" heading="Margin is negative" />);
  expect(screen.getByRole("alert")).toBeInTheDocument();
  rerender(<InlineAlert variant="notice" heading="Over capacity" />);
  expect(screen.getByRole("status")).toBeInTheDocument();
});

test("role can be overridden", () => {
  render(<InlineAlert variant="negative" role="note" heading="Archived" />);
  expect(screen.getByRole("note")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("has no axe violations", async () => {
  const { container } = render(
    <InlineAlert variant="notice" heading="Latest decision is Hold">
      Plans stay editable.
    </InlineAlert>,
  );
  await expectNoAxeViolations(container);
});
