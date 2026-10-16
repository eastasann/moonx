import { sizes } from "@moonx/ui-tokens";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NumberField } from "./NumberField";
import { SearchField } from "./SearchField";
import { TextArea, TextField } from "./TextField";

/** input → frame → the field's outer element. */
const rootOf = (input: HTMLElement) =>
  input.parentElement?.parentElement as HTMLElement;

describe("TextField", () => {
  test("labels the input and describes it with its help and its error", () => {
    render(
      <TextField
        label="Email"
        description="We send the invitation here."
        errorMessage="Enter an email address."
      />,
    );
    const input = screen.getByRole("textbox", { name: "Email" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedBy = (input.getAttribute("aria-describedby") ?? "").split(
      " ",
    );
    const help = screen.getByText("We send the invitation here.");
    const error = screen.getByText("Enter an email address.").closest("[id]");
    expect(describedBy).toContain(help.id);
    expect(describedBy).toContain(error?.id);
    // The error carries an icon, not colour alone.
    expect(error?.querySelector("svg")).not.toBeNull();
  });

  test("no error, no invalid state", () => {
    render(<TextField label="Name" description="Shown to members." />);
    expect(screen.getByRole("textbox").getAttribute("aria-invalid")).toBeNull();
    expect(screen.queryByText("Shown to members.")).not.toBeNull();
  });

  test("types, and reports each change", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TextField label="Idea name" onChange={onChange} />);
    await user.type(screen.getByRole("textbox"), "Kape");
    expect(onChange).toHaveBeenLastCalledWith("Kape");
  });

  test("disabled and read-only", async () => {
    const user = userEvent.setup();
    render(
      <>
        <TextField label="Disabled" defaultValue="a" isDisabled />
        <TextField label="Read only" defaultValue="b" isReadOnly />
      </>,
    );
    const disabled = screen.getByRole("textbox", { name: "Disabled" });
    const readOnly = screen.getByRole("textbox", { name: "Read only" });
    expect(disabled.hasAttribute("disabled")).toBe(true);
    await user.type(readOnly, "x");
    expect((readOnly as HTMLInputElement).value).toBe("b");
  });

  test("each size and the full width have their own look", () => {
    render(
      <>
        {sizes.map((size) => (
          <TextField key={size} size={size} label={size} />
        ))}
        <TextField label="Full" width="full" />
      </>,
    );
    const looks = [...sizes, "Full"].map(
      (name) => rootOf(screen.getByRole("textbox", { name })).className,
    );
    expect(new Set(looks).size).toBe(5);
  });
});

describe("keeping a focused field above the keyboard (design-spec 4.3)", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "visualViewport");
  });

  function installViewport(height: number) {
    const viewport = Object.assign(new EventTarget(), {
      height,
      offsetTop: 0,
      width: 390,
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport,
    });
    return viewport;
  }

  test("scrolls up by the part the keyboard covers when the viewport shrinks", async () => {
    const viewport = installViewport(800);
    const scrollBy = vi.fn();
    const scroller = document.scrollingElement as HTMLElement;
    scroller.scrollBy = scrollBy;
    const user = userEvent.setup();
    render(<TextField label="Reason" />);
    const input = screen.getByRole("textbox");
    const frame = input.parentElement as HTMLElement;
    frame.getBoundingClientRect = () =>
      ({ top: 560, bottom: 600, left: 0, right: 300 }) as DOMRect;
    await user.click(input);
    expect(scrollBy).not.toHaveBeenCalled();

    // The keyboard opens: 400px of the 800 stay visible.
    viewport.height = 400;
    act(() => {
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(scrollBy).toHaveBeenCalledWith({ top: 200 });
  });

  test("leaves fields alone that are not focused", () => {
    const viewport = installViewport(400);
    const scrollBy = vi.fn();
    (document.scrollingElement as HTMLElement).scrollBy = scrollBy;
    render(<TextField label="Reason" />);
    const frame = screen.getByRole("textbox").parentElement as HTMLElement;
    frame.getBoundingClientRect = () => ({ bottom: 600 }) as DOMRect;
    act(() => {
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(scrollBy).not.toHaveBeenCalled();
  });
});

describe("TextArea", () => {
  test("grows with its text", async () => {
    const user = userEvent.setup();
    render(<TextArea label="Answer" />);
    const area = screen.getByRole("textbox", { name: "Answer" });
    expect(area.tagName).toBe("TEXTAREA");
    Object.defineProperty(area, "scrollHeight", {
      configurable: true,
      get: () => 120,
    });
    await user.type(area, "line one{Enter}line two{Enter}line three");
    expect(area.style.height).toBe("120px");
  });

  test("shows its error like the other fields", () => {
    render(<TextArea label="Reason" errorMessage="Enter a reason." />);
    expect(
      screen
        .getByRole("textbox", { name: "Reason" })
        .getAttribute("aria-invalid"),
    ).toBe("true");
  });
});

describe("NumberField", () => {
  function Margin({ initial }: { initial: string }) {
    const [text, setText] = useState(initial);
    return (
      <>
        <NumberField
          label="Target margin"
          isPercent
          value={text}
          onChange={setText}
        />
        <output>{text}</output>
      </>
    );
  }

  test("regroups a plain number when it loses focus, keeping its decimals", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberField label="Price" currency="PHP" onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: "Price" });
    await user.type(input, "1500.505");
    await user.tab();
    expect((input as HTMLInputElement).value).toBe("1,500.505");
    expect(onChange).toHaveBeenLastCalledWith("1,500.505");
  });

  test("keeps '1,5' as typed instead of reading it as 15 (design-spec 6.0.8)", async () => {
    const user = userEvent.setup();
    render(<Margin initial="" />);
    await user.type(screen.getByRole("textbox"), "1,5");
    await user.tab();
    expect(screen.getByRole("status").textContent).toBe("1,5");
  });

  test("shows the currency symbol or the percent sign and reads it out", () => {
    render(
      <>
        <NumberField label="Price" currency="PHP" />
        <NumberField label="Margin" isPercent />
        <NumberField label="Units" />
      </>,
    );
    const describedText = (name: string) => {
      const input = screen.getByRole("textbox", { name });
      return (input.getAttribute("aria-describedby") ?? "")
        .split(" ")
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent)
        .join(" ");
    };
    expect(describedText("Price")).toBe("₱");
    expect(describedText("Margin")).toBe("%");
    expect(describedText("Units")).toBe("");
  });

  test("decimal keypad, or numeric for whole numbers; no autofill", () => {
    render(
      <>
        <NumberField label="Price" />
        <NumberField label="Days" isInteger />
      </>,
    );
    const price = screen.getByRole("textbox", { name: "Price" });
    expect(price.getAttribute("inputmode")).toBe("decimal");
    expect(price.getAttribute("autocomplete")).toBe("off");
    expect(
      screen.getByRole("textbox", { name: "Days" }).getAttribute("inputmode"),
    ).toBe("numeric");
  });

  test("a read-only field reports nothing when it loses focus", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <NumberField label="Price" value="1500" onChange={onChange} isReadOnly />,
    );
    await user.click(screen.getByRole("textbox"));
    await user.tab();
    expect(onChange).not.toHaveBeenCalled();
  });

  test("an error marks it invalid", () => {
    render(<NumberField label="Price" errorMessage="Enter a number." />);
    expect(
      screen
        .getByRole("textbox", { name: "Price" })
        .getAttribute("aria-invalid"),
    ).toBe("true");
  });
});

describe("SearchField", () => {
  test("Enter submits; the clear button and Escape empty it", async () => {
    const onSubmit = vi.fn();
    const onClear = vi.fn();
    const user = userEvent.setup();
    render(
      <SearchField
        aria-label="Search ideas"
        onSubmit={onSubmit}
        onClear={onClear}
      />,
    );
    const input = screen.getByRole("searchbox", { name: "Search ideas" });
    expect(screen.queryByRole("button")).toBeNull();
    await user.type(input, "kape{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("kape");
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect((input as HTMLInputElement).value).toBe("");
    await user.type(input, "x{Escape}");
    expect((input as HTMLInputElement).value).toBe("");
    expect(onClear).toHaveBeenCalledTimes(2);
  });
});
