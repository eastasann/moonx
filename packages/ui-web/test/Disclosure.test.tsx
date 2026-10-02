import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Accordion, Disclosure } from "../src/components/Disclosure";
import { expectNoAxeViolations } from "./axe";
import { expectPressedLifecycle } from "./pressed";

describe("Disclosure", () => {
  test("toggles with the mouse and reflects it in data-expanded and aria-expanded", async () => {
    const onExpandedChange = vi.fn();
    const { container } = render(
      <Disclosure title="Example" onExpandedChange={onExpandedChange}>
        Panel text
      </Disclosure>,
    );
    const button = screen.getByRole("button", { name: "Example" });
    const root = container.firstElementChild as HTMLElement;
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(root).not.toHaveAttribute("data-expanded");
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(root).toHaveAttribute("data-expanded");
    expect(onExpandedChange).toHaveBeenCalledWith(true);
    await userEvent.click(button);
    expect(root).not.toHaveAttribute("data-expanded");
  });

  test("toggles with Enter and Space and shows focus-visible", async () => {
    render(<Disclosure title="Example">Panel text</Disclosure>);
    const button = screen.getByRole("button", { name: "Example" });
    await userEvent.tab();
    expect(button).toHaveAttribute("data-focus-visible");
    await userEvent.keyboard("{Enter}");
    expect(button).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard(" ");
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  test("wraps the button in a heading of the given level", () => {
    render(
      <Disclosure title="Example" headingLevel={4}>
        Panel text
      </Disclosure>,
    );
    expect(screen.getByRole("heading", { level: 4 })).toContainElement(
      screen.getByRole("button", { name: "Example" }),
    );
  });

  test("defaultExpanded opens it and isDisabled blocks it", async () => {
    const { unmount } = render(
      <Disclosure title="Example" defaultExpanded>
        Panel text
      </Disclosure>,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
    unmount();
    render(
      <Disclosure title="Example" isDisabled>
        Panel text
      </Disclosure>,
    );
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("data-disabled");
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  test("hover state reaches the toggle and clears on leaving", async () => {
    render(<Disclosure title="Example">Panel text</Disclosure>);
    const button = screen.getByRole("button");
    await userEvent.hover(button);
    expect(button).toHaveAttribute("data-hovered");
    await userEvent.unhover(button);
    expect(button).not.toHaveAttribute("data-hovered");
  });

  test("pressed state reaches the toggle while held and clears on release", async () => {
    const user = userEvent.setup();
    render(<Disclosure title="Example">Panel text</Disclosure>);
    await expectPressedLifecycle(screen.getByRole("button"), user);
  });

  test("has no axe violations open or closed", async () => {
    const { container } = render(
      <Disclosure title="Example" defaultExpanded>
        Panel text
      </Disclosure>,
    );
    await expectNoAxeViolations(container);
  });
});

describe("Accordion", () => {
  function Sample({ multiple }: { multiple?: boolean }) {
    return (
      <Accordion allowsMultipleExpanded={multiple}>
        <Disclosure id="a" title="First">
          One
        </Disclosure>
        <Disclosure id="b" title="Second">
          Two
        </Disclosure>
      </Accordion>
    );
  }

  test("keeps one item open at a time by default", async () => {
    render(<Sample />);
    const first = screen.getByRole("button", { name: "First" });
    const second = screen.getByRole("button", { name: "Second" });
    await userEvent.click(first);
    await userEvent.click(second);
    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(second).toHaveAttribute("aria-expanded", "true");
  });

  test("allowsMultipleExpanded keeps several open", async () => {
    render(<Sample multiple />);
    await userEvent.click(screen.getByRole("button", { name: "First" }));
    await userEvent.click(screen.getByRole("button", { name: "Second" }));
    expect(screen.getByRole("button", { name: "First" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Second" })).toHaveAttribute("aria-expanded", "true");
  });

  test("Tab moves between the toggles, and axe passes", async () => {
    const { container } = render(<Sample />);
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Second" })).toHaveFocus();
    await expectNoAxeViolations(container);
  });
});
