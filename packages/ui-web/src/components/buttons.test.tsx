import { sizes } from "@moonx/ui-tokens";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageSquare } from "lucide-react";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { ActionButton, ActionGroup } from "./ActionButton";
import { Button, ButtonGroup } from "./Button";
import { SegmentedControl, SegmentedControlItem } from "./SegmentedControl";
import { ToggleButton, ToggleButtonGroup } from "./ToggleButtonGroup";

describe("Button", () => {
  test("each variant, quiet and size has its own look", () => {
    render(
      <>
        <Button>primary</Button>
        <Button variant="secondary">secondary</Button>
        <Button variant="negative">negative</Button>
        <Button variant="secondary" isQuiet>
          quiet
        </Button>
        {sizes.map((size) => (
          <Button key={size} size={size}>
            {`size ${size}`}
          </Button>
        ))}
      </>,
    );
    const looks = [
      "primary",
      "secondary",
      "negative",
      "quiet",
      ...sizes.map((size) => `size ${size}`),
    ].map((name) => screen.getByRole("button", { name }).className);
    // "size M" is the default, the same as "primary".
    expect(new Set(looks).size).toBe(looks.length - 1);
  });

  test("presses with pointer, Enter and Space; shows focus only from the keyboard", async () => {
    const onPress = vi.fn();
    const user = userEvent.setup();
    render(<Button onPress={onPress}>Record decision</Button>);
    const button = screen.getByRole("button", { name: "Record decision" });
    await user.click(button);
    expect(button.hasAttribute("data-focus-visible")).toBe(false);
    await user.tab();
    await user.tab({ shift: true });
    expect(button.getAttribute("data-focus-visible")).toBe("true");
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onPress).toHaveBeenCalledTimes(3);
  });

  test("marks hover and press", async () => {
    const user = userEvent.setup();
    render(<Button>Hover me</Button>);
    const button = screen.getByRole("button");
    await user.hover(button);
    expect(button.getAttribute("data-hovered")).toBe("true");
    await user.pointer({ keys: "[MouseLeft>]", target: button });
    expect(button.getAttribute("data-pressed")).toBe("true");
  });

  test("disabled ignores presses", async () => {
    const onPress = vi.fn();
    const user = userEvent.setup();
    render(
      <Button isDisabled onPress={onPress}>
        Apply
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Apply" });
    await user.click(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  test("pending shows the circle, keeps focus and ignores presses", async () => {
    const onPress = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <Button onPress={onPress}>Save version</Button>,
    );
    const button = screen.getByRole("button", { name: "Save version" });
    await user.tab();
    rerender(
      <Button onPress={onPress} isPending>
        Save version
      </Button>,
    );
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.hasAttribute("data-pending")).toBe(true);
    expect(button.querySelector("svg circle")).not.toBeNull();
    expect(document.activeElement).toBe(button);
    await user.keyboard("{Enter}");
    await user.click(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  test("a pending submit button stops being a submit button", () => {
    const { rerender } = render(<Button type="submit">Send</Button>);
    const button = screen.getByRole("button", { name: "Send" });
    expect(button.getAttribute("type")).toBe("submit");
    rerender(
      <Button type="submit" isPending>
        Send
      </Button>,
    );
    // Enter in a field of the form must not send it twice.
    expect(button.getAttribute("type")).toBe("button");
  });

  test("ButtonGroup groups its buttons", () => {
    render(
      <ButtonGroup align="end" aria-label="Actions">
        <Button variant="secondary">Cancel</Button>
        <Button>Apply</Button>
      </ButtonGroup>,
    );
    expect(
      screen.getByRole("group", { name: "Actions" }).querySelectorAll("button"),
    ).toHaveLength(2);
  });
});

describe("ActionButton and ActionGroup", () => {
  test("an icon alone takes the icon-only padding and its aria-label", () => {
    render(
      <>
        <ActionButton aria-label="Comments">
          <MessageSquare />
        </ActionButton>
        <ActionButton>
          <MessageSquare />
          Open comments
        </ActionButton>
      </>,
    );
    const iconOnly = screen.getByRole("button", { name: "Comments" });
    const withText = screen.getByRole("button", { name: "Open comments" });
    expect(iconOnly.className).not.toBe(withText.className);
    expect(iconOnly.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  test("the toolbar moves with arrow keys and passes isQuiet and size down", async () => {
    const user = userEvent.setup();
    render(
      <>
        <ActionGroup aria-label="Tools" isQuiet size="L">
          <ActionButton>One</ActionButton>
          <ActionButton>Two</ActionButton>
        </ActionGroup>
        <ActionButton isQuiet size="L">
          Alone
        </ActionButton>
      </>,
    );
    expect(screen.getByRole("toolbar", { name: "Tools" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "One" }).className).toBe(
      screen.getByRole("button", { name: "Alone" }).className,
    );
    await user.tab();
    expect(document.activeElement?.textContent).toBe("One");
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement?.textContent).toBe("Two");
  });
});

describe("ToggleButtonGroup", () => {
  function Fau() {
    const [selected, setSelected] = useState<Set<string | number>>(new Set());
    return (
      <ToggleButtonGroup
        aria-label="F/A/U"
        selectedKeys={selected}
        onSelectionChange={setSelected}
      >
        <ToggleButton id="fact" isDisabled>
          Fact
        </ToggleButton>
        <ToggleButton id="assumption">Assumption</ToggleButton>
        <ToggleButton id="unknown">Unknown</ToggleButton>
      </ToggleButtonGroup>
    );
  }

  test("pressing the chosen button again clears it (design-spec 6.0.3)", async () => {
    const user = userEvent.setup();
    render(<Fau />);
    const unknown = screen.getByRole("radio", { name: "Unknown" });
    await user.click(unknown);
    expect(unknown.getAttribute("aria-checked")).toBe("true");
    await user.click(unknown);
    expect(unknown.getAttribute("aria-checked")).toBe("false");
  });

  test("a disabled button cannot be chosen; arrows move between the others", async () => {
    const user = userEvent.setup();
    render(<Fau />);
    const fact = screen.getByRole("radio", { name: "Fact" });
    await user.click(fact);
    expect(fact.getAttribute("aria-checked")).toBe("false");
    await user.tab();
    expect(document.activeElement?.textContent).toBe("Assumption");
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement?.textContent).toBe("Unknown");
    await user.keyboard(" ");
    expect(
      screen
        .getByRole("radio", { name: "Unknown" })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });
});

describe("SegmentedControl", () => {
  test("always keeps one chosen and reports the key", async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SegmentedControl
        aria-label="Confidence"
        defaultSelectedKey="medium"
        onSelectionChange={onSelectionChange}
      >
        <SegmentedControlItem id="low">Low</SegmentedControlItem>
        <SegmentedControlItem id="medium">Medium</SegmentedControlItem>
        <SegmentedControlItem id="high">High</SegmentedControlItem>
      </SegmentedControl>,
    );
    const group = screen.getByRole("radiogroup", { name: "Confidence" });
    const medium = screen.getByRole("radio", { name: "Medium" });
    await user.click(medium);
    expect(medium.getAttribute("aria-checked")).toBe("true");
    await user.click(screen.getByRole("radio", { name: "High" }));
    expect(onSelectionChange).toHaveBeenLastCalledWith("high");
    expect(group.querySelectorAll('[aria-checked="true"]')).toHaveLength(1);
  });

  test("Tab enters the group, arrows move between segments, Space chooses", async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SegmentedControl
        aria-label="Format"
        defaultSelectedKey="markdown"
        onSelectionChange={onSelectionChange}
      >
        <SegmentedControlItem id="markdown">Markdown</SegmentedControlItem>
        <SegmentedControlItem id="json">JSON</SegmentedControlItem>
      </SegmentedControl>,
    );
    await user.tab();
    // happy-dom cannot walk focus backwards, so only ArrowRight is checked here;
    // the E2E test presses both in Chromium.
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement?.textContent).toBe("JSON");
    await user.keyboard(" ");
    expect(onSelectionChange).toHaveBeenLastCalledWith("json");
  });

  test("can start with none chosen, then keeps one", async () => {
    const user = userEvent.setup();
    function Confidence() {
      const [key, setKey] = useState<string | null>(null);
      return (
        <SegmentedControl
          aria-label="Confidence"
          selectedKey={key}
          onSelectionChange={setKey}
        >
          <SegmentedControlItem id="low">Low</SegmentedControlItem>
          <SegmentedControlItem id="high">High</SegmentedControlItem>
        </SegmentedControl>
      );
    }
    render(<Confidence />);
    const low = screen.getByRole("radio", { name: "Low" });
    expect(
      screen
        .getAllByRole("radio")
        .filter((r) => r.getAttribute("aria-checked") === "true"),
    ).toHaveLength(0);
    await user.click(low);
    await user.click(low);
    expect(low.getAttribute("aria-checked")).toBe("true");
  });

  test("sizes and isJustified change the look", () => {
    render(
      <>
        <SegmentedControl aria-label="M" defaultSelectedKey="a">
          <SegmentedControlItem id="a">A</SegmentedControlItem>
        </SegmentedControl>
        <SegmentedControl
          aria-label="XL"
          size="XL"
          isJustified
          defaultSelectedKey="a"
        >
          <SegmentedControlItem id="a">A</SegmentedControlItem>
        </SegmentedControl>
      </>,
    );
    expect(screen.getByRole("radiogroup", { name: "M" }).className).not.toBe(
      screen.getByRole("radiogroup", { name: "XL" }).className,
    );
    const [m, xl] = screen.getAllByRole("radio");
    expect(m?.className).not.toBe(xl?.className);
  });
});
