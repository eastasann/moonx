import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { Picker, PickerItem } from "../src/components/Picker";
import { expectNoAxeViolations } from "./axe";
import { mockNarrow } from "./matchMedia";

/** The popover is portaled outside the page landmark, so `region` (a page-level rule) is off for it. */
async function expectNoOverlayViolations() {
  const result = await axe.run(document.body, {
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  expect(result.violations.map((v) => v.id)).toEqual([]);
}

function Currency(props: Partial<React.ComponentProps<typeof Picker>>) {
  return (
    <Picker label="Currency" placeholder="Choose" {...props}>
      <PickerItem id="PHP">PHP</PickerItem>
      <PickerItem id="USD">USD</PickerItem>
      <PickerItem id="JPY">JPY</PickerItem>
    </Picker>
  );
}

describe("Picker", () => {
  test.each(["S", "M", "L", "XL"] as const)(
    "renders a button with a placeholder at size %s",
    (size) => {
      render(<Currency size={size} />);
      const button = screen.getByRole("button", { name: /Currency/ });
      expect(button).toHaveTextContent("Choose");
      expect(button).toHaveAttribute("aria-haspopup", "listbox");
    },
  );

  test("chooses an item with the pointer and reports its id", async () => {
    const onChange = vi.fn();
    render(<Currency onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Currency/ }));
    const list = await screen.findByRole("listbox");
    await userEvent.click(within(list).getByRole("option", { name: "USD" }));
    expect(onChange).toHaveBeenCalledWith("USD");
    expect(screen.getByRole("button", { name: /Currency/ })).toHaveTextContent("USD");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  test("opens with ArrowDown, moves with the arrow keys and chooses with Enter", async () => {
    const onChange = vi.fn();
    render(<Currency onChange={onChange} />);
    await userEvent.tab();
    expect(screen.getByRole("button", { name: /Currency/ })).toHaveAttribute("data-focus-visible");
    await userEvent.keyboard("{ArrowDown}");
    await screen.findByRole("listbox");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("USD");
  });

  test("Escape closes the list without choosing", async () => {
    const onChange = vi.fn();
    render(<Currency onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Currency/ }));
    await screen.findByRole("listbox");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  test("shows the controlled value and marks the chosen option selected", async () => {
    render(<Currency value="JPY" onChange={() => {}} />);
    const button = screen.getByRole("button", { name: /Currency/ });
    expect(button).toHaveTextContent("JPY");
    await userEvent.click(button);
    expect(await screen.findByRole("option", { name: "JPY" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("opens as a tray on a narrow viewport, chooses and reports the id", async () => {
    mockNarrow(true);
    const onChange = vi.fn();
    render(<Currency onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Currency/ }));
    const list = await screen.findByRole("listbox");
    expect(list.closest("[class*='ResponsivePopover_tray']")).not.toBeNull();
    await userEvent.click(within(list).getByRole("option", { name: "PHP" }));
    expect(onChange).toHaveBeenCalledWith("PHP");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Currency/ })).toHaveTextContent("PHP");
  });

  test("closes the tray with Escape without choosing", async () => {
    mockNarrow(true);
    const onChange = vi.fn();
    render(<Currency onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Currency/ }));
    await screen.findByRole("listbox");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: /Currency/ })).toHaveFocus());
  });

  test("marks invalid and required with description and error message", () => {
    render(
      <Currency description="Used in all plans" errorMessage="Pick one" isInvalid isRequired />,
    );
    const button = screen.getByRole("button", { name: /Currency/ });
    expect(button).toHaveAccessibleDescription("Used in all plans Pick one");
    expect(button.closest("[data-invalid]")).not.toBeNull();
    expect(button.closest("[data-required]")).not.toBeNull();
  });

  test("sets state attributes for hover and disabled", async () => {
    const { rerender } = render(<Currency />);
    const button = screen.getByRole("button", { name: /Currency/ });
    await userEvent.hover(button);
    expect(button).toHaveAttribute("data-hovered");
    rerender(<Currency isDisabled />);
    expect(screen.getByRole("button", { name: /Currency/ })).toHaveAttribute("data-disabled");
    await userEvent.click(screen.getByRole("button", { name: /Currency/ }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  test("has no axe violations closed and open", async () => {
    const { container } = render(<Currency description="Hint" />);
    await expectNoAxeViolations(container);
    await userEvent.click(screen.getByRole("button", { name: /Currency/ }));
    await screen.findByRole("listbox");
    await expectNoOverlayViolations();
  });
});
