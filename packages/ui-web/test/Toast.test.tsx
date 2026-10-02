import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createToastQueue, ToastRegion } from "../src/components/Toast";
import { expectNoAxeViolations } from "./axe";
import { expectPressedClearsOnLeave } from "./pressed";

function setup() {
  const queue = createToastQueue();
  render(<ToastRegion queue={queue} label="Notifications" closeLabel="Dismiss" />);
  return queue;
}

describe("Toast", () => {
  test.each(["informative", "positive", "negative", "neutral"] as const)(
    "shows a %s toast with its title and description",
    (variant) => {
      const queue = setup();
      act(() => {
        queue.add({ title: "Decision recorded", description: "Saved to the log", variant });
      });
      const region = screen.getByRole("region", { name: "Notifications" });
      expect(region).toHaveTextContent("Decision recorded");
      expect(region).toHaveTextContent("Saved to the log");
    },
  );

  test("the close button, named by closeLabel, removes the toast", async () => {
    const queue = setup();
    act(() => {
      queue.add({ title: "Decision recorded" });
    });
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Decision recorded")).toBeNull();
  });

  test("the close button works from the keyboard and shows focus-visible", async () => {
    const queue = setup();
    act(() => {
      queue.add({ title: "Decision recorded" });
    });
    const close = screen.getByRole("button", { name: "Dismiss" });
    close.focus();
    await userEvent.tab({ shift: true });
    await userEvent.tab();
    expect(close).toHaveAttribute("data-focus-visible");
    await userEvent.keyboard("{Enter}");
    expect(screen.queryByText("Decision recorded")).toBeNull();
  });

  // Why: releasing a press on the close button removes the toast and the button with it, so the
  // release cannot show the attribute going away. The pointer leaves with the button held instead,
  // which clears it on a node that is still mounted; the key check stops at the held key.
  test("the close button is pressed while held and clears when the pointer leaves", async () => {
    const user = userEvent.setup();
    const queue = setup();
    act(() => {
      queue.add({ title: "Decision recorded" });
    });
    const close = screen.getByRole("button", { name: "Dismiss" });
    await expectPressedClearsOnLeave(close, user);
    expect(screen.getByText("Decision recorded")).toBeInTheDocument();
    close.focus();
    await user.keyboard("{Enter>}");
    expect(close).toHaveAttribute("data-pressed");
  });

  test("the close button shows data-hovered on hover and clears on leaving", async () => {
    const user = userEvent.setup();
    const queue = setup();
    act(() => {
      queue.add({ title: "Decision recorded" });
    });
    const close = screen.getByRole("button", { name: "Dismiss" });
    await user.hover(close);
    expect(close).toHaveAttribute("data-hovered");
    await user.unhover(close);
    expect(close).not.toHaveAttribute("data-hovered");
  });

  test("a pointer click on the close button does not show data-focus-visible", async () => {
    const user = userEvent.setup();
    const queue = setup();
    act(() => {
      queue.add({ title: "Decision recorded" });
    });
    const close = screen.getByRole("button", { name: "Dismiss" });
    await user.pointer({ keys: "[MouseLeft>]", target: close });
    expect(close).not.toHaveAttribute("data-focus-visible");
    await user.pointer({ keys: "[/MouseLeft]" });
  });

  test("closes by itself after the default timeout and honors an explicit one", () => {
    vi.useFakeTimers();
    try {
      const queue = setup();
      act(() => {
        queue.add({ title: "Default" });
        queue.add({ title: "Short" }, { timeout: 1000 });
      });
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.queryByText("Short")).toBeNull();
      expect(screen.getByText("Default")).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(screen.queryByText("Default")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test("stacks several toasts and renders nothing when empty", () => {
    const queue = setup();
    expect(screen.queryByRole("region")).toBeNull();
    act(() => {
      queue.add({ title: "One" });
      queue.add({ title: "Two" });
    });
    expect(screen.getByText("One")).toBeInTheDocument();
    expect(screen.getByText("Two")).toBeInTheDocument();
  });

  test("has no axe violations", async () => {
    const queue = setup();
    act(() => {
      queue.add({ title: "Decision recorded", description: "Saved", variant: "positive" });
    });
    await expectNoAxeViolations(document.body);
  });
});
