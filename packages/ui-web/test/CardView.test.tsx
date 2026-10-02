import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Card } from "../src/components/Card";
import { CardView } from "../src/components/CardView";
import { expectNoAxeViolations } from "./axe";

function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at ${index}`);
  return item;
}

function Cards(props: Partial<React.ComponentProps<typeof CardView>>) {
  return (
    <CardView aria-label="Competitors" {...props}>
      <Card id="a" textValue="Alpha">
        Alpha
      </Card>
      <Card id="b" textValue="Beta">
        Beta
      </Card>
      <Card id="c" textValue="Gamma">
        Gamma
      </Card>
    </CardView>
  );
}

test("renders a named grid of cards for one to three columns", () => {
  for (const columns of [1, 2, 3] as const) {
    const { unmount } = render(<Cards columns={columns} />);
    const grid = screen.getByRole("grid", { name: "Competitors" });
    expect(within(grid).getAllByRole("row")).toHaveLength(3);
    unmount();
  }
});

test("different column counts use different styles", () => {
  const { unmount } = render(<Cards columns={1} />);
  const one = screen.getByRole("grid").className;
  unmount();
  render(<Cards columns={3} />);
  expect(screen.getByRole("grid").className).not.toBe(one);
});

test("arrow keys move focus between cards", async () => {
  render(<Cards columns={3} />);
  await userEvent.tab();
  const rows = screen.getAllByRole("row");
  expect(nth(rows, 0)).toHaveFocus();
  await userEvent.keyboard("{ArrowRight}");
  expect(nth(rows, 1)).toHaveFocus();
  await userEvent.keyboard("{ArrowRight}");
  expect(nth(rows, 2)).toHaveFocus();
});

test("single selection marks the card with data-selected and aria-selected", async () => {
  const onSelectionChange = vi.fn();
  render(<Cards selectionMode="single" onSelectionChange={onSelectionChange} />);
  const rows = screen.getAllByRole("row");
  await userEvent.click(nth(rows, 1));
  expect(nth(rows, 1)).toHaveAttribute("aria-selected", "true");
  expect(nth(rows, 1)).toHaveAttribute("data-selected");
  expect(onSelectionChange).toHaveBeenCalledTimes(1);
  await userEvent.keyboard("{ArrowLeft}{ }");
  expect(nth(rows, 0)).toHaveAttribute("aria-selected", "true");
  expect(nth(rows, 1)).toHaveAttribute("aria-selected", "false");
});

test("multiple selection shows a checkbox on every card", async () => {
  render(<Cards selectionMode="multiple" />);
  const boxes = screen.getAllByRole("checkbox");
  expect(boxes).toHaveLength(3);
  await userEvent.click(nth(boxes, 0));
  await userEvent.click(nth(boxes, 2));
  const rows = screen.getAllByRole("row");
  expect(nth(rows, 0)).toHaveAttribute("aria-selected", "true");
  expect(nth(rows, 1)).toHaveAttribute("aria-selected", "false");
  expect(nth(rows, 2)).toHaveAttribute("aria-selected", "true");
});

test("a card can be a link", () => {
  render(
    <CardView aria-label="Competitors">
      <Card id="a" textValue="Alpha" href="/ideas/a">
        Alpha
      </Card>
    </CardView>,
  );
  expect(screen.getByRole("row")).toHaveAttribute("data-href", "/ideas/a");
});

test("onAction fires on press and Enter", async () => {
  const onAction = vi.fn();
  render(<Cards onAction={onAction} />);
  await userEvent.click(nth(screen.getAllByRole("row"), 0));
  expect(onAction).toHaveBeenCalledWith("a");
  await userEvent.keyboard("{ArrowRight}{Enter}");
  expect(onAction).toHaveBeenLastCalledWith("b");
});

test("a disabled card is marked and cannot be selected", async () => {
  render(
    <CardView aria-label="Competitors" selectionMode="single" disabledKeys={["b"]}>
      <Card id="a" textValue="Alpha">
        Alpha
      </Card>
      <Card id="b" textValue="Beta">
        Beta
      </Card>
    </CardView>,
  );
  const beta = nth(screen.getAllByRole("row"), 1);
  expect(beta).toHaveAttribute("data-disabled");
  await userEvent.click(beta);
  expect(beta).not.toHaveAttribute("aria-selected", "true");
});

test("hover and focus-visible set data attributes", async () => {
  render(<Cards selectionMode="single" />);
  const first = nth(screen.getAllByRole("row"), 0);
  await userEvent.hover(first);
  expect(first).toHaveAttribute("data-hovered");
  await userEvent.unhover(first);
  expect(first).not.toHaveAttribute("data-hovered");
  await userEvent.tab();
  expect(first).toHaveAttribute("data-focus-visible");
});

test("has no axe violations", async () => {
  const { container } = render(
    <>
      <Cards columns={2} />
      <Cards columns={2} selectionMode="multiple" />
    </>,
  );
  await expectNoAxeViolations(container);
});
