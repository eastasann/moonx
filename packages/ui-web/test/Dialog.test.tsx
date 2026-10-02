import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../src";
import { Dialog } from "../src/components/Dialog";
import { expectNoAxeViolations } from "./axe";
import { mockNarrow } from "./matchMedia";
import { expectOverlayTriggerPressedLifecycle, expectPressedClearsOnLeave } from "./pressed";

type Size = "small" | "medium" | "large" | "fullscreen";

function Sample({ size, onOpenChange }: { size?: Size; onOpenChange?: (o: boolean) => void }) {
  return (
    <Dialog
      trigger={<Button>Open</Button>}
      title="New idea"
      closeLabel="Close dialog"
      size={size}
      onOpenChange={onOpenChange}
      actions={({ close }) => <Button onPress={close}>Create</Button>}
    >
      <p>Body</p>
    </Dialog>
  );
}

describe("Dialog", () => {
  test.each(["small", "medium", "large", "fullscreen"] as const)(
    "renders a dialog named by its title at size %s",
    async (size) => {
      render(<Sample size={size} />);
      await userEvent.click(screen.getByRole("button", { name: "Open" }));
      expect(await screen.findByRole("dialog", { name: "New idea" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "New idea", level: 2 })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Close dialog" })).toBeInTheDocument();
    },
  );

  test.each(["medium", "fullscreen"] as const)(
    "renders on a narrow viewport at size %s",
    async (size) => {
      mockNarrow(true);
      render(<Sample size={size} />);
      await userEvent.click(screen.getByRole("button", { name: "Open" }));
      expect(await screen.findByRole("dialog", { name: "New idea" })).toBeInTheDocument();
    },
  );

  test("the close button, the actions and Escape close it and return focus", async () => {
    const onOpenChange = vi.fn();
    render(<Sample onOpenChange={onOpenChange} />);
    const trigger = screen.getByRole("button", { name: "Open" });

    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("button", { name: "Close dialog" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(trigger).toHaveFocus());

    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("button", { name: "Create" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(trigger);
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  test("an outside press does not close it unless isDismissable", async () => {
    const { rerender } = render(<Sample />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByRole("dialog");
    await userEvent.click(document.body);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    rerender(
      <Dialog
        trigger={<Button>Open</Button>}
        title="New idea"
        closeLabel="Close dialog"
        isDismissable
      >
        Body
      </Dialog>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByRole("dialog");
    await userEvent.click(document.body);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("Escape is ignored while isKeyboardDismissDisabled", async () => {
    render(
      <Dialog
        trigger={<Button>Open</Button>}
        title="Saving"
        closeLabel="Close dialog"
        isKeyboardDismissDisabled
      >
        Body
      </Dialog>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  test("the close button exposes hover and focus-visible state", async () => {
    render(<Sample />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    const close = await screen.findByRole("button", { name: "Close dialog" });
    await userEvent.hover(close);
    expect(close).toHaveAttribute("data-hovered");
    await userEvent.tab();
    expect(close).toHaveFocus();
    expect(close).toHaveAttribute("data-focus-visible");
  });

  test.each(["pointer", "Enter", "Space"] as const)(
    "%s press sets data-pressed on the trigger, kept while open and removed on close",
    async (way) => {
      const user = userEvent.setup();
      render(<Sample />);
      await expectOverlayTriggerPressedLifecycle(
        screen.getByRole("button", { name: "Open" }),
        user,
        way,
      );
    },
  );

  // Why: releasing a press on the close button closes the dialog and unmounts the button, so the
  // attribute cannot be read after the release. The pointer is moved off with the button held
  // instead, which clears the state on a node that is still mounted, and the keyboard check stops
  // at the held key.
  test("the close button is pressed while held and clears when the pointer leaves", async () => {
    const user = userEvent.setup();
    render(<Sample />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    const close = await screen.findByRole("button", { name: "Close dialog" });
    await expectPressedClearsOnLeave(close, user);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    close.focus();
    await user.keyboard("{Enter>}");
    expect(close).toHaveAttribute("data-pressed");
  });

  test("an open dialog has no axe violations", async () => {
    render(<Sample />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByRole("dialog");
    await expectNoAxeViolations(document.body);
  });
});

describe("without a trigger", () => {
  test("is driven by isOpen and raises no React Aria warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onOpenChange = vi.fn();
    render(
      <Dialog isOpen onOpenChange={onOpenChange} title="Switch workspace" closeLabel="Close">
        Body
      </Dialog>,
    );
    expect(screen.getByRole("dialog", { name: "Switch workspace" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
