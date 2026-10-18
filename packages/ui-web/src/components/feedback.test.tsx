import { formatProgress } from "@moonx/i18n";
import { statusLightVariants, statusVariants } from "@moonx/ui-tokens";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Inbox } from "lucide-react";
import { afterEach, describe, expect, expectTypeOf, test, vi } from "vitest";
import { settle } from "../test/helpers";
import { Badge, type BadgeProps } from "./Badge";
import { Heading } from "./Heading";
import { IllustratedMessage } from "./IllustratedMessage";
import { InlineAlert } from "./InlineAlert";
import { ProgressBar } from "./ProgressBar";
import { Skeleton } from "./Skeleton";
import * as skeleton from "./Skeleton.css";
import { StatusLight } from "./StatusLight";
import { Text } from "./Text";
import { ToastContainer, ToastQueue } from "./Toast";

describe("InlineAlert", () => {
  test("each variant is an alert with its own look; only neutral has no icon", () => {
    render(
      <div>
        {statusVariants.map((variant) => (
          <InlineAlert key={variant} variant={variant} title={variant}>
            {`Body ${variant}`}
          </InlineAlert>
        ))}
      </div>,
    );
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(statusVariants.length);
    expect(new Set(alerts.map((alert) => alert.className)).size).toBe(
      statusVariants.length,
    );
    for (const [index, variant] of statusVariants.entries()) {
      const icons = alerts[index]?.querySelectorAll("svg").length;
      expect({ variant, icons }).toEqual({
        variant,
        icons: variant === "neutral" ? 0 : 1,
      });
    }
  });

  test("onDismiss adds a close button that calls it", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<InlineAlert onDismiss={onDismiss}>A new version</InlineAlert>);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("Toast", () => {
  const closers: (() => void)[] = [];
  afterEach(async () => {
    for (const close of closers.splice(0)) act(close);
    vi.useRealTimers();
    await settle();
  });
  const show = (...args: Parameters<typeof ToastQueue.neutral>) => {
    let close = () => {};
    act(() => {
      close = ToastQueue.neutral(...args);
    });
    closers.push(close);
    return close;
  };

  test("shows in the region, named with the count, until closed", async () => {
    const user = userEvent.setup();
    render(<ToastContainer />);
    show("Decision recorded");
    const region = screen.getByRole("region", { name: "1 notification." });
    const toast = within(region).getByRole("alertdialog");
    expect(toast.textContent).toContain("Decision recorded");
    await user.click(within(toast).getByRole("button", { name: "Close" }));
    await settle();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("the returned function closes it", async () => {
    render(<ToastContainer />);
    const close = show("2 answers updated · 1 needs F/A/U");
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    act(close);
    await settle();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("an action calls back and, with shouldCloseOnAction, closes", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<ToastContainer />);
    show("Duplicated from Piaya Gift Box", {
      actionLabel: "Undo",
      onAction,
      shouldCloseOnAction: true,
    });
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    await settle();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("a timeout is at least Spectrum's 5 seconds; an action ignores it", () => {
    vi.useFakeTimers();
    render(<ToastContainer />);
    show("Decision recorded", { timeout: 1000 });
    show("Duplicated", { actionLabel: "Undo", timeout: 5000 });
    act(() => vi.advanceTimersByTime(4900));
    expect(screen.getAllByRole("alertdialog")).toHaveLength(2);
    act(() => vi.advanceTimersByTime(200));
    const left = screen.getAllByRole("alertdialog");
    expect(left).toHaveLength(1);
    expect(left[0]?.textContent).toContain("Duplicated");
  });

  test("the region counts every toast it shows", () => {
    render(<ToastContainer />);
    show("One");
    show("Two");
    expect(
      screen.getByRole("region", { name: "2 notifications." }),
    ).toBeTruthy();
  });
});

describe("ProgressBar", () => {
  test("reads its value through the shared formatter and shows it", () => {
    render(<ProgressBar label="Uploading" value={40} />);
    const bar = screen.getByRole("progressbar", { name: "Uploading" });
    expect(bar.getAttribute("aria-valuetext")).toBe(formatProgress(0.4));
    expect(bar.textContent).toContain(formatProgress(0.4));
  });

  test("clamps outside its range and handles an empty range", () => {
    render(
      <>
        <ProgressBar aria-label="Over" value={150} />
        <ProgressBar
          aria-label="Empty range"
          minValue={5}
          maxValue={5}
          value={5}
        />
      </>,
    );
    expect(
      screen
        .getByRole("progressbar", { name: "Over" })
        .getAttribute("aria-valuetext"),
    ).toBe(formatProgress(1));
    expect(
      screen
        .getByRole("progressbar", { name: "Empty range" })
        .getAttribute("aria-valuetext"),
    ).toBe(formatProgress(0));
  });

  test("indeterminate has no value", () => {
    render(<ProgressBar label="Preparing PDF…" isIndeterminate />);
    const bar = screen.getByRole("progressbar", { name: "Preparing PDF…" });
    expect(bar.hasAttribute("aria-valuenow")).toBe(false);
    expect(bar.textContent).toBe("Preparing PDF…");
  });
});

describe("Skeleton", () => {
  test("while loading, Text and Heading draw bars and the block is inert", () => {
    const { rerender } = render(
      <Skeleton isLoading>
        <Heading level={2}>Piaya Gift Box</Heading>
        <Text>Office workers in Bacolod</Text>
      </Skeleton>,
    );
    const heading = screen.getByText("Piaya Gift Box");
    expect(heading.className).toBe(skeleton.text);
    expect(heading.closest("[inert]")).not.toBeNull();
    expect(screen.getByText("Office workers in Bacolod").className).toBe(
      skeleton.text,
    );
    rerender(
      <Skeleton isLoading={false}>
        <Heading level={2}>Piaya Gift Box</Heading>
        <Text>Office workers in Bacolod</Text>
      </Skeleton>,
    );
    expect(
      screen
        .getByRole("heading", { name: "Piaya Gift Box" })
        .closest("[inert]"),
    ).toBeNull();
    expect(document.querySelector(`.${skeleton.text}`)).toBeNull();
  });
});

describe("IllustratedMessage", () => {
  test("a heading at its level, an icon kept from screen readers, the actions", () => {
    render(
      <IllustratedMessage
        icon={<Inbox />}
        heading="No ideas yet"
        headingLevel={3}
        actions={<button type="button">New idea</button>}
      >
        Ideas you validate show up here.
      </IllustratedMessage>,
    );
    expect(
      screen.getByRole("heading", { level: 3, name: "No ideas yet" }),
    ).toBeTruthy();
    expect(screen.getByText("Ideas you validate show up here.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New idea" })).toBeTruthy();
    expect(
      document.querySelector("svg")?.closest('[aria-hidden="true"]'),
    ).not.toBeNull();
  });
});

describe("StatusLight", () => {
  test("every variant shows its label beside a mark screen readers skip", () => {
    render(
      <div>
        {statusLightVariants.map((variant) => (
          <StatusLight key={variant} variant={variant}>
            {`label-${variant}`}
          </StatusLight>
        ))}
      </div>,
    );
    for (const variant of statusLightVariants) {
      const label = screen.getByText(`label-${variant}`);
      const light = label.parentElement as HTMLElement;
      const mark = light.querySelector("svg");
      expect(mark?.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  test("F/A/U and check states share moons; the save states draw icons", () => {
    render(
      <div>
        <StatusLight variant="fact">a</StatusLight>
        <StatusLight variant="done">b</StatusLight>
        <StatusLight variant="assumption">c</StatusLight>
        <StatusLight variant="partial">d</StatusLight>
        <StatusLight variant="saved">e</StatusLight>
      </div>,
    );
    const markOf = (text: string) =>
      (screen.getByText(text).parentElement as HTMLElement).querySelector("svg")
        ?.innerHTML;
    expect(markOf("a")).toBe(markOf("b"));
    expect(markOf("c")).toBe(markOf("d"));
    expect(markOf("a")).not.toBe(markOf("c"));
    expect(
      (screen.getByText("e").parentElement as HTMLElement)
        .querySelector("svg")
        ?.getAttribute("class"),
    ).toContain("lucide-check");
  });

  test("role status for the one light that changes (the save state)", () => {
    render(
      <StatusLight variant="saving" role="status">
        Saving…
      </StatusLight>,
    );
    expect(screen.getByRole("status").textContent).toBe("Saving…");
  });
});

describe("Badge", () => {
  test("outline, dashed, bold and notice each look different", () => {
    render(
      <div>
        <Badge>Proceed</Badge>
        <Badge fillStyle="dashed">Undecided</Badge>
        <Badge fillStyle="bold">3</Badge>
        <Badge variant="notice">Overdue</Badge>
      </div>,
    );
    const looks = ["Proceed", "Undecided", "3", "Overdue"].map(
      // The text sits in the badge's ellipsis span; the look is on the badge.
      (text) => screen.getByText(text).parentElement?.className,
    );
    expect(new Set(looks).size).toBe(4);
  });

  test("notice takes only the outline frame (design-spec 4.5)", () => {
    expectTypeOf<{
      variant: "notice";
      fillStyle: "outline";
      children: string;
    }>().toExtend<BadgeProps>();
    for (const fillStyle of ["bold", "dashed"] as const) {
      expectTypeOf<{
        variant: "notice";
        fillStyle: typeof fillStyle;
        children: string;
      }>().not.toExtend<BadgeProps>();
    }
  });
});

describe("more states", () => {
  test("InlineAlert names its icon by its kind", () => {
    render(
      <div>
        <InlineAlert variant="informative">a</InlineAlert>
        <InlineAlert variant="notice">b</InlineAlert>
        <InlineAlert variant="negative">c</InlineAlert>
      </div>,
    );
    for (const name of ["Information", "Warning", "Error"]) {
      expect(screen.getByRole("img", { name })).toBeTruthy();
    }
  });

  test("ProgressBar: showValueLabel={false} hides the value; a bar alone has no text row", () => {
    render(
      <div>
        <ProgressBar label="Quiet" value={30} showValueLabel={false} />
        <ProgressBar aria-label="Alone" isIndeterminate />
        <ProgressBar aria-label="Value only" value={30} />
      </div>,
    );
    expect(screen.getByRole("progressbar", { name: "Quiet" }).textContent).toBe(
      "Quiet",
    );
    expect(
      screen.getByRole("progressbar", { name: "Alone" }).className,
    ).not.toBe(
      screen.getByRole("progressbar", { name: "Value only" }).className,
    );
  });
});

describe("Toast, the rest", () => {
  afterEach(async () => {
    vi.useRealTimers();
    await settle();
  });

  test("every toast shows until it closes; onClose reports the close", async () => {
    const onClose = vi.fn();
    render(<ToastContainer />);
    const closers: (() => void)[] = [];
    act(() => {
      closers.push(ToastQueue.neutral("One", { onClose }));
      for (const message of ["Two", "Three", "Four"]) {
        closers.push(ToastQueue.neutral(message));
      }
    });
    expect(screen.getAllByRole("alertdialog")).toHaveLength(4);
    for (const close of closers) act(close);
    await settle();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("aboveTabBar changes where the region sits", () => {
    let close = () => {};
    const { rerender } = render(<ToastContainer />);
    act(() => {
      close = ToastQueue.neutral("Decision recorded");
    });
    const plain = screen.getByRole("region").className;
    rerender(<ToastContainer aboveTabBar />);
    expect(screen.getByRole("region").className).not.toBe(plain);
    act(close);
  });
});
