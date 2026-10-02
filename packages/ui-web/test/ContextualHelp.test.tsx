import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContextualHelp } from "../src/components/ContextualHelp";
import { expectNoAxeViolations } from "./axe";
import { mockNarrow } from "./matchMedia";
import { expectOverlayTriggerPressedLifecycle } from "./pressed";

function Sample({ variant }: { variant?: "help" | "info" }) {
  return (
    <ContextualHelp variant={variant} label="Hint" title="About this question">
      Write what you saw, not what you hope.
    </ContextualHelp>
  );
}

describe("ContextualHelp", () => {
  test.each(["help", "info"] as const)(
    "opens a popover named by its title (%s)",
    async (variant) => {
      render(<Sample variant={variant} />);
      await userEvent.click(screen.getByRole("button", { name: "Hint" }));
      const dialog = await screen.findByRole("dialog", { name: "About this question" });
      expect(dialog.closest("[data-placement]")).not.toBeNull();
      expect(dialog).toHaveTextContent("Write what you saw");
    },
  );

  test("opens as a tray on a narrow viewport", async () => {
    mockNarrow(true);
    render(<Sample />);
    await userEvent.click(screen.getByRole("button", { name: "Hint" }));
    const dialog = await screen.findByRole("dialog", { name: "About this question" });
    expect(dialog.closest("[data-placement]")).toBeNull();
  });

  test("opens with Enter, closes with Escape and restores focus", async () => {
    render(<Sample />);
    const button = screen.getByRole("button", { name: "Hint" });
    await userEvent.tab();
    expect(button).toHaveAttribute("data-focus-visible");
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(button).toHaveFocus());
  });

  test("the button exposes hover state", async () => {
    render(<Sample />);
    const button = screen.getByRole("button", { name: "Hint" });
    await userEvent.hover(button);
    expect(button).toHaveAttribute("data-hovered");
  });

  test.each(["pointer", "Enter", "Space"] as const)(
    "%s press sets data-pressed on the button, kept while open and removed on close",
    async (way) => {
      const user = userEvent.setup();
      render(<Sample />);
      await expectOverlayTriggerPressedLifecycle(
        screen.getByRole("button", { name: "Hint" }),
        user,
        way,
      );
    },
  );

  test("an open help has no axe violations", async () => {
    render(<Sample />);
    await userEvent.click(screen.getByRole("button", { name: "Hint" }));
    await screen.findByRole("dialog");
    await expectNoAxeViolations(document.body);
  });
});
