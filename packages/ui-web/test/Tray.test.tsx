import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../src";
import { Tray } from "../src/components/Tray";
import { expectNoAxeViolations } from "./axe";
import { expectOverlayTriggerPressedLifecycle } from "./pressed";

function Sample() {
  return (
    <Tray trigger={<Button>Open</Button>} aria-label="Panel">
      {({ close }) => <Button onPress={close}>Done</Button>}
    </Tray>
  );
}

test("is a bottom sheet even on a wide viewport", async () => {
  render(<Sample />);
  await userEvent.click(screen.getByRole("button", { name: "Open" }));
  const dialog = await screen.findByRole("dialog", { name: "Panel" });
  expect(dialog.closest("[data-placement]")).toBeNull();
});

test("closes with Escape, an outside press and the render prop", async () => {
  render(<Sample />);
  const trigger = screen.getByRole("button", { name: "Open" });
  await userEvent.click(trigger);
  await screen.findByRole("dialog");
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  await waitFor(() => expect(trigger).toHaveFocus());

  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole("button", { name: "Done" }));
  expect(screen.queryByRole("dialog")).toBeNull();
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

test("keyboard focus shows data-focus-visible on the trigger, a pointer click does not", async () => {
  const user = userEvent.setup();
  render(<Sample />);
  const trigger = screen.getByRole("button", { name: "Open" });
  await user.tab();
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute("data-focus-visible");
  await user.tab();
  expect(trigger).not.toHaveAttribute("data-focus-visible");
  await user.click(trigger);
  await screen.findByRole("dialog");
  await user.click(await screen.findByRole("button", { name: "Done" }));
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(trigger).not.toHaveAttribute("data-focus-visible");
});

test("the trigger exposes hover and disabled state", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<Sample />);
  const trigger = screen.getByRole("button", { name: "Open" });
  await user.hover(trigger);
  expect(trigger).toHaveAttribute("data-hovered");
  await user.unhover(trigger);
  expect(trigger).not.toHaveAttribute("data-hovered");
  rerender(
    <Tray trigger={<Button isDisabled>Open</Button>} aria-label="Panel">
      x
    </Tray>,
  );
  expect(screen.getByRole("button", { name: "Open" })).toHaveAttribute("data-disabled");
  await user.click(screen.getByRole("button", { name: "Open" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("an open tray has no axe violations", async () => {
  render(<Sample />);
  await userEvent.click(screen.getByRole("button", { name: "Open" }));
  await screen.findByRole("dialog");
  await expectNoAxeViolations(document.body);
});

test("without a trigger it is driven by isOpen and raises no React Aria warning", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  render(
    <Tray isOpen aria-label="More">
      Content
    </Tray>,
  );
  expect(screen.getByRole("dialog", { name: "More" })).toBeInTheDocument();
  expect(warn).not.toHaveBeenCalled();
  warn.mockRestore();
});
