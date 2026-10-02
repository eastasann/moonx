import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { Slide, type SlideProps } from "../src/components/Slide";
import { expectNoAxeViolations } from "./axe";

const footer = { businessName: "Piaya Gift Box", versionLabel: "Draft", date: "Oct 2, 2026" };
const base = { footer, emptyLabel: "Not written yet" };

const cases: Record<SlideProps["type"], SlideProps> = {
  title: {
    ...base,
    type: "title",
    title: "Piaya Gift Box",
    subtitle: "Boxed pasalubong for Bacolod",
  },
  text: {
    ...base,
    type: "text",
    title: "Problem",
    bullets: [{ text: "Gifts are hard to find" }, { text: "", isEmpty: true }],
  },
  number: {
    ...base,
    type: "number",
    title: "Business model",
    figures: [
      { label: "Price", value: "PHP 350.00" },
      { label: "Gross profit per order", value: "PHP 120.00" },
      { label: "Break-even per day", value: null },
    ],
    notes: [{ text: "Based on the expected scenario" }],
  },
  table: {
    ...base,
    type: "table",
    title: "Competition",
    columns: ["Name", "Type", "Price"],
    rows: [
      ["Bacolod Sweets", "Direct", "PHP 300.00"],
      ["Airport stall", "Indirect", null],
    ],
    notes: [{ text: "", isEmpty: true }],
  },
};

type Observed = { callback: ResizeObserverCallback; target: Element | null };
const observers: Observed[] = [];
const originalObserver = globalThis.ResizeObserver;
const offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");

beforeEach(() => {
  observers.length = 0;
  globalThis.ResizeObserver = class {
    private readonly entry: Observed;
    constructor(callback: ResizeObserverCallback) {
      this.entry = { callback, target: null };
      observers.push(this.entry);
    }
    observe(target: Element) {
      this.entry.target = target;
    }
    unobserve() {}
    disconnect() {
      this.entry.target = null;
    }
  } as unknown as typeof ResizeObserver;
  // jsdom has no layout: the canvas is 960 wide and the frame starts at 480.
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, value: 960 });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 480 });
});

afterEach(() => {
  globalThis.ResizeObserver = originalObserver;
  if (offsetWidth) Object.defineProperty(HTMLElement.prototype, "offsetWidth", offsetWidth);
  if (clientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", clientWidth);
});

function resizeFrame(width: number) {
  const observer = observers[0];
  act(() => {
    observer?.callback(
      [{ contentRect: { width } } as ResizeObserverEntry],
      observer as unknown as ResizeObserver,
    );
  });
}

describe("Slide", () => {
  test("scales the canvas to the frame width and follows later resizes", () => {
    const { container } = render(<Slide {...cases.text} />);
    const frame = container.querySelector("[data-slide-type]") as HTMLElement;
    const canvas = frame.firstElementChild as HTMLElement;
    expect(observers[0]?.target).toBe(frame);
    expect(canvas.style.transform).toBe("scale(0.5)");
    resizeFrame(720);
    expect(canvas.style.transform).toBe("scale(0.75)");
    resizeFrame(240);
    expect(canvas.style.transform).toBe("scale(0.25)");
  });

  test("stops observing on unmount", () => {
    const { unmount } = render(<Slide {...cases.text} />);
    unmount();
    expect(observers[0]?.target).toBeNull();
  });

  test.each(Object.keys(cases) as SlideProps["type"][])("renders the %s type", (type) => {
    const props = cases[type];
    const { container } = render(<Slide {...props} />);
    const region = screen.getByRole("region", { name: props.title });
    expect(within(region).getByRole("heading", { name: props.title })).toBeInTheDocument();
    expect(container.querySelector(`[data-slide-type="${type}"]`)).not.toBeNull();
    expect(within(region).getByText("Piaya Gift Box", { selector: "span" })).toBeInTheDocument();
    expect(within(region).getByText("Draft")).toBeInTheDocument();
    expect(within(region).getByText("Oct 2, 2026")).toBeInTheDocument();
  });

  test("title slide shows the subtitle and omits it when absent", () => {
    const { rerender } = render(<Slide {...(cases.title as SlideProps)} />);
    expect(screen.getByText("Boxed pasalubong for Bacolod")).toBeInTheDocument();
    rerender(<Slide {...base} type="title" title="Piaya Gift Box" subtitle={null} />);
    expect(screen.queryByText("Boxed pasalubong for Bacolod")).not.toBeInTheDocument();
  });

  test("text slide lists bullets and shows the empty label for empty sources", () => {
    render(<Slide {...cases.text} />);
    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Gifts are hard to find",
      "Not written yet",
    ]);
  });

  test("number slide pairs each label with its figure and marks missing values", () => {
    render(<Slide {...cases.number} />);
    const terms = screen.getAllByRole("term");
    const definitions = screen.getAllByRole("definition");
    expect(terms.map((t) => t.textContent)).toEqual([
      "Price",
      "Gross profit per order",
      "Break-even per day",
    ]);
    expect(definitions.map((d) => d.textContent)).toEqual([
      "PHP 350.00",
      "PHP 120.00",
      "Not written yet",
    ]);
    expect(screen.getByText("Based on the expected scenario")).toBeInTheDocument();
  });

  test("table slide has column headers, cells and empty-label cells", () => {
    render(<Slide {...cases.table} />);
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Name",
      "Type",
      "Price",
    ]);
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByRole("cell", { name: "Bacolod Sweets" })).toBeInTheDocument();
    expect(screen.getAllByText("Not written yet")).toHaveLength(2);
  });

  test("shows the overflow notice outside the slide only when given", () => {
    const { container, rerender } = render(<Slide {...cases.text} />);
    expect(screen.queryByText("Too long for this slide")).not.toBeInTheDocument();
    rerender(<Slide {...cases.text} overflowNotice="Too long for this slide" />);
    const notice = screen.getByText("Too long for this slide");
    expect(container.querySelector("[data-slide-type]")?.contains(notice)).toBe(false);
  });

  test.each(Object.keys(cases) as SlideProps["type"][])(
    "has no axe violations (%s)",
    async (type) => {
      const { container } = render(<Slide {...cases[type]} />);
      await expectNoAxeViolations(container);
    },
  );
});
