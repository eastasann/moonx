import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextArea } from "../src/components/TextArea";
import { expectNoAxeViolations } from "./axe";

describe("TextArea", () => {
  test.each(["S", "M", "L", "XL"] as const)(
    "renders a labelled multi-line textbox at size %s",
    (size) => {
      render(<TextArea label="Reason" size={size} />);
      const box = screen.getByRole("textbox", { name: "Reason" });
      expect(box.tagName).toBe("TEXTAREA");
    },
  );

  test("sizes its height to the content on every input", async () => {
    render(<TextArea label="Reason" />);
    const box = screen.getByRole("textbox", { name: "Reason" });
    let scrollHeight = 40;
    Object.defineProperty(box, "scrollHeight", { configurable: true, get: () => scrollHeight });
    await userEvent.type(box, "a");
    expect(box.style.height).toBe("40px");
    scrollHeight = 120;
    await userEvent.type(box, "{Enter}b");
    expect(box.style.height).toBe("120px");
  });

  test("sizes itself when the value is set from outside", () => {
    const { rerender } = render(<TextArea label="Reason" value="a" onChange={() => {}} />);
    const box = screen.getByRole("textbox", { name: "Reason" });
    Object.defineProperty(box, "scrollHeight", { configurable: true, get: () => 90 });
    rerender(<TextArea label="Reason" value={"a\nb\nc"} onChange={() => {}} />);
    expect(box.style.height).toBe("90px");
  });

  test("sizes again when the width changes, and stops observing on unmount", () => {
    let notify: ResizeObserverCallback = () => {};
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          notify = callback;
        }
        observe = observe;
        disconnect = disconnect;
        unobserve = vi.fn();
      },
    );
    try {
      const { unmount } = render(<TextArea label="Reason" />);
      const box = screen.getByRole("textbox", { name: "Reason" });
      expect(observe).toHaveBeenCalledWith(box);
      Object.defineProperty(box, "scrollHeight", { configurable: true, get: () => 200 });
      notify([{ contentRect: { width: 120 } } as ResizeObserverEntry], {} as ResizeObserver);
      expect(box.style.height).toBe("200px");
      unmount();
      expect(disconnect).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("connects description and error message, and marks invalid and required", () => {
    render(
      <TextArea
        label="Reason"
        description="Why you chose it"
        errorMessage="Too short"
        isInvalid
        isRequired
      />,
    );
    const box = screen.getByRole("textbox", { name: "Reason" });
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toBeRequired();
    expect(box).toHaveAccessibleDescription("Why you chose it Too short");
  });

  test("sets state attributes for hover, keyboard focus and disabled", async () => {
    const { rerender } = render(<TextArea label="Reason" />);
    const box = screen.getByRole("textbox", { name: "Reason" });
    await userEvent.hover(box);
    expect(box).toHaveAttribute("data-hovered");
    await userEvent.tab();
    expect(box).toHaveAttribute("data-focus-visible");
    rerender(<TextArea label="Reason" isDisabled />);
    expect(screen.getByRole("textbox", { name: "Reason" })).toHaveAttribute("data-disabled");
  });

  test("has no axe violations", async () => {
    const { container } = render(<TextArea label="Reason" description="Hint" />);
    await expectNoAxeViolations(container);
  });
});
