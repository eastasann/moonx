import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { afterEach, beforeEach } from "vitest";
import { QuestionCard, useFocusAnchor } from "../src/components/QuestionCard";
import { expectNoAxeViolations } from "./axe";
import { mockMatchMedia } from "./matchMedia";
import { expectPressedLifecycle } from "./pressed";

const ANCHOR = "--moonx-layout-focus-anchor";
const TRANSITION = "--moonx-motion-transition-focus-scroll";

function setReducedMotion(reduced: boolean) {
  mockMatchMedia((query) => reduced && query.includes("prefers-reduced-motion"));
}

beforeEach(() => {
  document.documentElement.style.setProperty(ANCHOR, "0.5");
  document.documentElement.style.setProperty(
    TRANSITION,
    "400ms cubic-bezier(0.45, 0, 0.25, 1) 0ms",
  );
});

afterEach(() => {
  document.documentElement.style.removeProperty(ANCHOR);
  document.documentElement.style.removeProperty(TRANSITION);
  vi.useRealTimers();
});

function renderCard(props: Partial<Parameters<typeof QuestionCard>[0]> = {}) {
  return render(
    <QuestionCard
      title="BEHAVIOR"
      prompt="What do they currently do?"
      isFocused={false}
      answer="They buy boxed piaya at the airport"
      emptyLabel="Empty"
      status={<span>Assumption</span>}
      meta={<span>1 comment</span>}
      actions={<button type="button">History</button>}
      {...props}
    >
      <textarea aria-label="Answer" />
    </QuestionCard>,
  );
}

describe("QuestionCard", () => {
  test("compact form shows title, answer start and labels but not the body", () => {
    renderCard();
    const button = screen.getByRole("button", { name: /BEHAVIOR/ });
    expect(button).toHaveTextContent("They buy boxed piaya at the airport");
    expect(button).toHaveTextContent("Assumption");
    expect(button).toHaveTextContent("1 comment");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText("What do they currently do?")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "History" })).not.toBeInTheDocument();
  });

  test("compact form shows the empty label for a blank answer", () => {
    renderCard({ answer: "   " });
    expect(screen.getByRole("button", { name: /BEHAVIOR/ })).toHaveTextContent("Empty");
  });

  test("focused form opens the body, prompt and actions in a named group", () => {
    renderCard({ isFocused: true });
    expect(screen.getByRole("group", { name: "BEHAVIOR" })).toBeInTheDocument();
    expect(screen.getByText("What do they currently do?")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Answer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "History" })).toBeInTheDocument();
    expect(screen.getByText("Assumption")).toBeInTheDocument();
  });

  test("pressing the compact form requests focus", async () => {
    const onFocusRequest = vi.fn();
    renderCard({ onFocusRequest });
    await userEvent.click(screen.getByRole("button", { name: /BEHAVIOR/ }));
    expect(onFocusRequest).toHaveBeenCalled();
  });

  test("tabbing into the card requests focus, and Enter on it does too", async () => {
    const onFocusRequest = vi.fn();
    renderCard({ onFocusRequest });
    await userEvent.tab();
    expect(onFocusRequest).toHaveBeenCalledTimes(1);
    onFocusRequest.mockClear();
    await userEvent.keyboard("{Enter}");
    expect(onFocusRequest).toHaveBeenCalled();
  });

  test("the compact form shows hover and keyboard focus through data attributes", async () => {
    renderCard();
    const button = screen.getByRole("button", { name: /BEHAVIOR/ });
    await userEvent.hover(button);
    expect(button).toHaveAttribute("data-hovered");
    await userEvent.tab();
    expect(button).toHaveAttribute("data-focus-visible");
  });

  test("the compact form is pressed while held and released after, by pointer and keyboard", async () => {
    const user = userEvent.setup();
    renderCard();
    await expectPressedLifecycle(screen.getByRole("button", { name: /BEHAVIOR/ }), user);
  });

  test("a pointer click on the compact form does not show data-focus-visible", async () => {
    const user = userEvent.setup();
    renderCard();
    const button = screen.getByRole("button", { name: /BEHAVIOR/ });
    await user.click(button);
    expect(button).not.toHaveAttribute("data-focus-visible");
  });

  test("Ctrl+Arrow keys navigate between questions and plain arrows do not", async () => {
    const onNavigate = vi.fn();
    renderCard({ isFocused: true, onNavigate });
    await userEvent.click(screen.getByRole("textbox", { name: "Answer" }));
    await userEvent.keyboard("{Control>}{ArrowDown}{/Control}");
    expect(onNavigate).toHaveBeenLastCalledWith("next");
    await userEvent.keyboard("{Control>}{ArrowUp}{/Control}");
    expect(onNavigate).toHaveBeenLastCalledWith("previous");
    onNavigate.mockClear();
    await userEvent.keyboard("{ArrowDown}");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  test("the root carries the selector contract for layouts", () => {
    const { container, rerender } = renderCard();
    const root = container.firstElementChild;
    expect(root).toHaveAttribute("data-question-card");
    expect(root).toHaveAttribute("data-focused", "false");
    rerender(
      <QuestionCard title="BEHAVIOR" isFocused emptyLabel="Empty">
        <textarea aria-label="Answer" />
      </QuestionCard>,
    );
    expect(container.firstElementChild).toHaveAttribute("data-focused", "true");
  });

  test("a card that mounts focused does not take focus", () => {
    renderCard({ isFocused: true });
    expect(document.body).toHaveFocus();
  });

  test("focus already on another element is not taken when the card opens", () => {
    const { rerender } = render(
      <>
        <input aria-label="Elsewhere" />
        <QuestionCard title="A" isFocused={false} emptyLabel="Empty" />
      </>,
    );
    screen.getByRole("textbox", { name: "Elsewhere" }).focus();
    rerender(
      <>
        <input aria-label="Elsewhere" />
        <QuestionCard title="A" isFocused emptyLabel="Empty">
          <textarea aria-label="Answer" />
        </QuestionCard>
      </>,
    );
    expect(screen.getByRole("textbox", { name: "Elsewhere" })).toHaveFocus();
  });

  test("opening a card with nothing focusable in its body focuses the group", () => {
    const { rerender } = render(<QuestionCard title="A" isFocused={false} emptyLabel="Empty" />);
    rerender(
      <QuestionCard title="A" isFocused emptyLabel="Empty">
        <p>No controls</p>
      </QuestionCard>,
    );
    expect(screen.getByRole("group", { name: "A" })).toHaveFocus();
  });

  describe("in a form that moves focus between cards", () => {
    function Form({ requestOnFocus = true }: { requestOnFocus?: boolean }) {
      const [focused, setFocused] = useState(-1);
      const names = ["WHO", "WHY", "WHAT"];
      const armed = useRef(requestOnFocus);
      return (
        <div
          onKeyDownCapture={(event) => {
            if (!requestOnFocus) armed.current = event.key === "Enter";
          }}
        >
          {names.map((name, index) => (
            <QuestionCard
              key={name}
              title={name}
              isFocused={focused === index}
              emptyLabel="Empty"
              actions={<button type="button">{`${name} history`}</button>}
              onFocusRequest={() => armed.current && setFocused(index)}
              onNavigate={(direction) =>
                setFocused((current) =>
                  Math.min(Math.max(current + (direction === "next" ? 1 : -1), 0), 2),
                )
              }
            >
              <textarea aria-label={`${name} answer`} />
            </QuestionCard>
          ))}
        </div>
      );
    }

    test("tabbing into a compact card opens it with focus inside, and Ctrl+Arrow keeps working", async () => {
      const user = userEvent.setup();
      render(<Form />);
      await user.tab();
      expect(screen.getByRole("textbox", { name: "WHO answer" })).toHaveFocus();
      await user.keyboard("{Control>}{ArrowDown}{/Control}");
      expect(screen.getByRole("textbox", { name: "WHY answer" })).toHaveFocus();
      await user.keyboard("{Control>}{ArrowDown}{/Control}");
      expect(screen.getByRole("textbox", { name: "WHAT answer" })).toHaveFocus();
      await user.keyboard("{Control>}{ArrowUp}{/Control}");
      expect(screen.getByRole("textbox", { name: "WHY answer" })).toHaveFocus();
    });

    test("pressing a compact card with Enter opens it, then Ctrl+ArrowDown twice moves on", async () => {
      const user = userEvent.setup();
      render(<Form requestOnFocus={false} />);
      await user.tab();
      expect(screen.getByRole("button", { name: /WHO/ })).toHaveFocus();
      await user.keyboard("{Enter}");
      expect(screen.getByRole("textbox", { name: "WHO answer" })).toHaveFocus();
      await user.keyboard("{Control>}{ArrowDown}{/Control}");
      expect(screen.getByRole("textbox", { name: "WHY answer" })).toHaveFocus();
      await user.keyboard("{Control>}{ArrowDown}{/Control}");
      expect(screen.getByRole("textbox", { name: "WHAT answer" })).toHaveFocus();
    });
  });

  test.each([false, true])("has no axe violations (focused: %s)", async (isFocused) => {
    const { container } = renderCard({ isFocused });
    await expectNoAxeViolations(container);
  });
});

describe("useFocusAnchor", () => {
  function Scroller({ isFocused }: { isFocused: boolean }) {
    const ref = useFocusAnchor<HTMLDivElement>(isFocused);
    return (
      <div data-testid="scroller" style={{ overflowY: "auto" }}>
        <div ref={ref}>card</div>
      </div>
    );
  }

  /** Lays the card out at `top` px inside a 400px viewport container with 2000px of content. */
  function layout(top: number, height = 100) {
    const scroller = screen.getByTestId("scroller");
    const card = screen.getByText("card");
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 2000 });
    scroller.getBoundingClientRect = () => ({ top: 0, height: 400 }) as DOMRect;
    card.getBoundingClientRect = () => ({ top, height }) as DOMRect;
    return scroller;
  }

  test("jumps so the card center lands on the anchor when motion is reduced", () => {
    setReducedMotion(true);
    const { rerender } = render(<Scroller isFocused={false} />);
    const scroller = layout(600);
    rerender(<Scroller isFocused />);
    // center = 650, anchor = 200, so scroll by 450
    expect(scroller.scrollTop).toBe(450);
  });

  test("animates over the focus-scroll duration and settles on the target", () => {
    setReducedMotion(false);
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const { rerender } = render(<Scroller isFocused={false} />);
    const scroller = layout(600);
    rerender(<Scroller isFocused />);
    expect(scroller.scrollTop).toBe(0);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(scroller.scrollTop).toBeGreaterThan(0);
    expect(scroller.scrollTop).toBeLessThan(450);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(scroller.scrollTop).toBeCloseTo(450, 5);
  });

  test.each(["PageDown", "PageUp", "ArrowDown", "ArrowUp", "Home", "End", " "])(
    "the %s key interrupts the animation",
    (key) => {
      setReducedMotion(false);
      vi.useFakeTimers({
        toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"],
      });
      const { rerender } = render(<Scroller isFocused={false} />);
      const scroller = layout(600);
      rerender(<Scroller isFocused />);
      act(() => {
        vi.advanceTimersByTime(100);
      });
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key }));
      });
      const stopped = scroller.scrollTop;
      expect(stopped).toBeGreaterThan(0);
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(scroller.scrollTop).toBe(stopped);
    },
  );

  test("other keys do not interrupt the animation", () => {
    setReducedMotion(false);
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const { rerender } = render(<Scroller isFocused={false} />);
    const scroller = layout(600);
    rerender(<Scroller isFocused />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
      vi.advanceTimersByTime(600);
    });
    expect(scroller.scrollTop).toBeCloseTo(450, 5);
  });

  test.each([
    ["ctrlKey", { ctrlKey: true }],
    ["metaKey", { metaKey: true }],
    ["altKey", { altKey: true }],
  ])("%s with a scroll key does not interrupt the animation", (_name, modifier) => {
    setReducedMotion(false);
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const { rerender } = render(<Scroller isFocused={false} />);
    const scroller = layout(600);
    rerender(<Scroller isFocused />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", ...modifier }));
      vi.advanceTimersByTime(600);
    });
    expect(scroller.scrollTop).toBeCloseTo(450, 5);
  });

  test("does not scroll while not focused", () => {
    setReducedMotion(true);
    render(<Scroller isFocused={false} />);
    const scroller = layout(600);
    expect(scroller.scrollTop).toBe(0);
  });

  test("keeps the top edge visible for a card taller than the container", () => {
    setReducedMotion(true);
    const { rerender } = render(<Scroller isFocused={false} />);
    const scroller = layout(300, 900);
    rerender(<Scroller isFocused />);
    // centering would scroll by 550 and hide the top; the top edge allows 300
    expect(scroller.scrollTop).toBe(300);
  });

  test("does nothing when the theme tokens are not loaded", () => {
    setReducedMotion(true);
    document.documentElement.style.removeProperty(ANCHOR);
    const { rerender } = render(<Scroller isFocused={false} />);
    const scroller = layout(600);
    rerender(<Scroller isFocused />);
    expect(scroller.scrollTop).toBe(0);
  });
});
