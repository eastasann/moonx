import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../src";
import { AlertDialog } from "../src/components/AlertDialog";
import { expectNoAxeViolations } from "./axe";
import { mockNarrow } from "./matchMedia";

function Sample(props: {
  variant?: "confirmation" | "negative";
  onPrimaryAction?: () => void;
  onCancel?: () => void;
}) {
  return (
    <AlertDialog
      trigger={<Button>Delete</Button>}
      title="Delete this row?"
      primaryActionLabel="Delete row"
      cancelLabel="Cancel"
      {...props}
    >
      It can be restored from History.
    </AlertDialog>
  );
}

describe("AlertDialog", () => {
  test.each(["confirmation", "negative"] as const)(
    "renders an alertdialog (%s)",
    async (variant) => {
      render(<Sample variant={variant} />);
      await userEvent.click(screen.getByRole("button", { name: "Delete" }));
      expect(
        await screen.findByRole("alertdialog", { name: "Delete this row?" }),
      ).toBeInTheDocument();
      expect(screen.getByText("It can be restored from History.")).toBeInTheDocument();
    },
  );

  test("a negative confirmation starts on Cancel, a plain one on the confirm button", async () => {
    const { unmount } = render(<Sample variant="negative" />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());
    unmount();

    render(<Sample />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete row" })).toHaveFocus());
  });

  test("the confirm and cancel buttons call their handlers and close", async () => {
    const onPrimaryAction = vi.fn();
    const onCancel = vi.fn();
    render(<Sample variant="negative" onPrimaryAction={onPrimaryAction} onCancel={onCancel} />);
    const trigger = screen.getByRole("button", { name: "Delete" });

    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("button", { name: "Delete row" }));
    expect(onPrimaryAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(trigger).toHaveFocus());

    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onPrimaryAction).toHaveBeenCalledTimes(1);
  });

  test("Esc closes it and calls onCancel once, not onPrimaryAction", async () => {
    const onPrimaryAction = vi.fn();
    const onCancel = vi.fn();
    render(<Sample onPrimaryAction={onPrimaryAction} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByRole("alertdialog");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onPrimaryAction).not.toHaveBeenCalled();
  });

  test("the primary button does not call onCancel, and a later cancel still does", async () => {
    const onCancel = vi.fn();
    render(<Sample onCancel={onCancel} />);
    const trigger = screen.getByRole("button", { name: "Delete" });
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("button", { name: "Delete row" }));
    expect(onCancel).not.toHaveBeenCalled();
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("an outside press does not close it, and it works on a narrow viewport", async () => {
    mockNarrow(true);
    render(<Sample />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByRole("alertdialog");
    await userEvent.click(document.body);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  test("the buttons are reachable with Tab", async () => {
    render(<Sample variant="negative" />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByRole("alertdialog");
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Delete row" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Delete row" })).toHaveAttribute(
      "data-focus-visible",
    );
  });

  test("the action buttons show data-hovered on hover and clear on leaving", async () => {
    const user = userEvent.setup();
    render(<Sample variant="negative" />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByRole("alertdialog");
    for (const name of ["Delete row", "Cancel"]) {
      const button = screen.getByRole("button", { name });
      await user.hover(button);
      expect(button).toHaveAttribute("data-hovered");
      await user.unhover(button);
      expect(button).not.toHaveAttribute("data-hovered");
    }
  });

  test.each(["confirmation", "negative"] as const)(
    "has no axe violations (%s)",
    async (variant) => {
      render(<Sample variant={variant} />);
      await userEvent.click(screen.getByRole("button", { name: "Delete" }));
      await screen.findByRole("alertdialog");
      await expectNoAxeViolations(document.body);
    },
  );
});
