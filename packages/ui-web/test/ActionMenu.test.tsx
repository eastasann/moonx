import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionMenu } from "../src/components/ActionMenu";
import { MenuItem } from "../src/components/Menu";
import { expectNoAxeViolations } from "./axe";
import { mockNarrow } from "./matchMedia";
import { expectOverlayTriggerPressedLifecycle } from "./pressed";

function Sample(props: {
  size?: "S" | "M" | "L" | "XL";
  isDisabled?: boolean;
  onAction?: (k: React.Key) => void;
}) {
  return (
    <ActionMenu label="More actions" {...props}>
      <MenuItem id="duplicate">Duplicate</MenuItem>
      <MenuItem id="delete" variant="negative">
        Delete
      </MenuItem>
    </ActionMenu>
  );
}

describe("ActionMenu", () => {
  test.each(["S", "M", "L", "XL"] as const)("renders an icon-only button at size %s", (size) => {
    render(<Sample size={size} />);
    const button = screen.getByRole("button", { name: "More actions" });
    expect(button).toHaveAttribute("aria-haspopup", "true");
    expect(button).toHaveTextContent("");
  });

  test("opens the menu named by label and runs an action", async () => {
    const onAction = vi.fn();
    render(<Sample onAction={onAction} />);
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(await screen.findByRole("menu", { name: "More actions" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    expect(onAction.mock.calls[0]?.[0]).toBe("duplicate");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  test("opens as a tray on a narrow viewport", async () => {
    mockNarrow(true);
    render(<Sample />);
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    const menu = await screen.findByRole("menu");
    expect(menu.closest("[data-placement]")).toBeNull();
  });

  test("the button exposes hover, focus-visible and disabled state", async () => {
    const { rerender } = render(<Sample />);
    const button = screen.getByRole("button", { name: "More actions" });
    await userEvent.hover(button);
    expect(button).toHaveAttribute("data-hovered");
    await userEvent.tab();
    expect(button).toHaveAttribute("data-focus-visible");
    rerender(<Sample isDisabled />);
    expect(screen.getByRole("button", { name: "More actions" })).toHaveAttribute("data-disabled");
  });

  test.each(["pointer", "Enter", "Space"] as const)(
    "%s press sets data-pressed on the button, kept while open and removed on close",
    async (way) => {
      const user = userEvent.setup();
      render(<Sample />);
      await expectOverlayTriggerPressedLifecycle(
        screen.getByRole("button", { name: "More actions" }),
        user,
        way,
      );
    },
  );

  test("ArrowDown on the button opens the menu", async () => {
    render(<Sample />);
    screen.getByRole("button", { name: "More actions" }).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
  });

  test("has no axe violations closed or open", async () => {
    const { container } = render(<Sample />);
    await expectNoAxeViolations(container);
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await screen.findByRole("menu");
    await expectNoAxeViolations(document.body);
  });
});
