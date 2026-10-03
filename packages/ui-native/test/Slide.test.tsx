import { print } from "@moonx/ui-tokens/print";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { Slide, type SlideProps } from "../src/components/Slide";

afterEach(resetMockUnistyles);

const footer = { businessName: "Piaya Gift Box", versionLabel: "Draft", date: "Oct 2, 2026" };
const base = { footer, emptyLabel: "Not written yet" };

const cases: Record<SlideProps["type"], SlideProps> = {
  title: { ...base, type: "title", title: "Piaya Gift Box", subtitle: "Boxed pasalubong" },
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
      { label: "Break-even per day", value: null },
    ],
    notes: [{ text: "Based on the expected scenario" }],
  },
  table: {
    ...base,
    type: "table",
    title: "Competition",
    columns: ["Name", "Price"],
    rows: [
      ["Bacolod Sweets", "PHP 300.00"],
      ["Airport stall", null],
    ],
    notes: [{ text: "", isEmpty: true }],
  },
};

const frame = (type: string) => screen.getByTestId(`slide-${type}`);
const measure = (type: string, width: number) =>
  act(() => {
    fireEvent(frame(type), "layout", { nativeEvent: { layout: { width, height: 0, x: 0, y: 0 } } });
  });
const canvas = (type: string) =>
  (frame(type).children[0] as unknown as { props: { style: Record<string, unknown> } }).props.style;

test.each(Object.values(cases))("$type slide has a level 3 title and the footer", (props) => {
  render(<Slide {...props} />);
  expect(screen.getByRole("heading", { name: props.title }).props["aria-level"]).toBe(3);
  expect(screen.getAllByText("Piaya Gift Box").length).toBeGreaterThan(0);
  expect(screen.getByText("Draft")).toBeTruthy();
  expect(screen.getByText("Oct 2, 2026")).toBeTruthy();
});

test("the slide is a region named by its title", () => {
  render(<Slide {...cases.text} />);
  const heading = screen.getByRole("heading", { name: "Problem" });
  const region = (screen.toJSON() as unknown as { props: Record<string, string> }).props;
  expect(region.role).toBe("region");
  expect(region["aria-labelledby"]).toBe(heading.props.nativeID);
});

test("title slide shows the subtitle", () => {
  render(<Slide {...cases.title} />);
  expect(screen.getByText("Boxed pasalubong")).toBeTruthy();
});

test("text slide shows bullets and the empty label for an empty source", () => {
  render(<Slide {...cases.text} />);
  expect(screen.getByText("Gifts are hard to find")).toBeTruthy();
  expect(screen.getByText("Not written yet")).toBeTruthy();
});

test("number slide shows figures, the empty label for a null value and notes", () => {
  render(<Slide {...cases.number} />);
  expect(screen.getByText("PHP 350.00")).toBeTruthy();
  expect(screen.getByText("Price")).toBeTruthy();
  expect(screen.getByText("Not written yet")).toBeTruthy();
  expect(screen.getByText("Based on the expected scenario")).toBeTruthy();
});

test("table slide has column headers, cells and the empty label for a null cell", () => {
  render(<Slide {...cases.table} />);
  expect(screen.getByText("Name")).toBeTruthy();
  expect(screen.getByText("Bacolod Sweets")).toBeTruthy();
  expect(screen.getAllByText("Not written yet")).toHaveLength(2);
});

test("the canvas is drawn at the print size and scaled to the frame width", () => {
  render(<Slide {...cases.text} />);
  expect(canvas("text").width).toBe(print.slide.width);
  expect(canvas("text").height).toBe(print.slide.height);
  expect(canvas("text").opacity).toBe(0);
  measure("text", 480);
  expect(canvas("text").transform).toEqual([{ scale: 0.5 }]);
  expect(canvas("text").opacity).toBe(1);
  measure("text", 240);
  expect(canvas("text").transform).toEqual([{ scale: 0.25 }]);
});

test("the frame keeps 16:9", () => {
  render(<Slide {...cases.title} />);
  const style = (frame("title").props as { style: { aspectRatio: number } }).style;
  expect(style.aspectRatio).toBeCloseTo(16 / 9);
});

test("overflowNotice is shown outside the slide", () => {
  render(<Slide {...cases.text} overflowNotice="Too long for this slide" />);
  expect(screen.getByText("Too long for this slide")).toBeTruthy();
});

test("the slide stays light in the dark theme", () => {
  render(<Slide {...cases.text} />);
  const light = frame("text").props.style.backgroundColor;
  mockUnistyles({ theme: "dark" });
  screen.rerender(<Slide {...cases.text} />);
  expect(frame("text").props.style.backgroundColor).toBe(light);
  expect(light).toBe(print.color.page);
});
