import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link } from "../src/components/Link";
import { expectNoAxeViolations } from "./axe";

describe("Link", () => {
  test.each(["primary", "secondary"] as const)("renders an anchor (%s)", (variant) => {
    render(
      <Link href="/ideas/1/validation" variant={variant}>
        Edit in validation
      </Link>,
    );
    expect(screen.getByRole("link", { name: "Edit in validation" })).toHaveAttribute(
      "href",
      "/ideas/1/validation",
    );
  });

  test("without href it is a focusable link role that fires onPress", async () => {
    const onPress = vi.fn();
    render(<Link onPress={onPress}>Open</Link>);
    const link = screen.getByRole("link", { name: "Open" });
    expect(link.tagName).not.toBe("A");
    await userEvent.click(link);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test("sets state attributes for hover, press, keyboard focus and disabled", async () => {
    const { rerender } = render(<Link href="/a">Next</Link>);
    const link = screen.getByRole("link", { name: "Next" });
    await userEvent.tab();
    expect(link).toHaveAttribute("data-focus-visible");
    await userEvent.hover(link);
    expect(link).toHaveAttribute("data-hovered");
    await userEvent.pointer({ keys: "[MouseLeft>]", target: link });
    expect(link).toHaveAttribute("data-pressed");
    await userEvent.pointer({ keys: "[/MouseLeft]", target: link });
    rerender(
      <Link href="/a" isDisabled>
        Next
      </Link>,
    );
    expect(screen.getByText("Next")).toHaveAttribute("data-disabled");
  });

  test("Enter follows the link", async () => {
    const onPress = vi.fn();
    render(
      <Link href="#target" onPress={onPress}>
        Next
      </Link>,
    );
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test("has no axe violations", async () => {
    const { container } = render(<Link href="/a">Next</Link>);
    await expectNoAxeViolations(container);
  });
});
