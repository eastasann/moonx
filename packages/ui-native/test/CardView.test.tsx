import { fireEvent, render, screen } from "@testing-library/react-native";
import { Card } from "../src/components/Card";
import { CardView, type CardViewProps } from "../src/components/CardView";

function Cards(props: Partial<CardViewProps>) {
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

const root = () => screen.toJSON() as { props: Record<string, unknown> };

test("a named list of cards, one column whatever `columns` says", () => {
  for (const columns of [1, 2, 3] as const) {
    const { unmount } = render(<Cards columns={columns} />);
    expect(root().props.role).toBe("list");
    expect(root().props["aria-label"]).toBe("Competitors");
    expect(root().props.style).not.toHaveProperty("flexDirection", "row");
    expect(screen.getByText("Alpha")).toBeTruthy();
    unmount();
  }
});

test("onAction fires with the card id on press", () => {
  const onAction = jest.fn();
  render(<Cards onAction={onAction} />);
  fireEvent.press(screen.getByRole("button", { name: "Beta" }));
  expect(onAction).toHaveBeenCalledWith("b");
});

test("single selection marks one card and a second press moves it", () => {
  const onSelectionChange = jest.fn();
  render(<Cards selectionMode="single" onSelectionChange={onSelectionChange} />);
  fireEvent.press(screen.getByRole("button", { name: "Beta" }));
  expect(screen.getByRole("button", { name: "Beta" }).props.accessibilityState.selected).toBe(true);
  expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(["b"]));
  fireEvent.press(screen.getByRole("button", { name: "Alpha" }));
  expect(screen.getByRole("button", { name: "Alpha" }).props.accessibilityState.selected).toBe(
    true,
  );
  expect(screen.getByRole("button", { name: "Beta" }).props.accessibilityState.selected).toBe(
    false,
  );
  fireEvent.press(screen.getByRole("button", { name: "Alpha" }));
  expect(onSelectionChange).toHaveBeenLastCalledWith(new Set());
});

test("multiple selection shows a checkbox on every card and keeps several", () => {
  render(<Cards selectionMode="multiple" />);
  const boxes = screen.getAllByRole("checkbox");
  expect(boxes).toHaveLength(3);
  fireEvent.press(boxes[0] as never);
  fireEvent.press(screen.getAllByRole("checkbox")[2] as never);
  const states = screen.getAllByRole("checkbox").map((box) => box.props.accessibilityState.checked);
  expect(states).toEqual([true, false, true]);
  fireEvent.press(screen.getAllByRole("checkbox")[0] as never);
  expect(screen.getAllByRole("checkbox")[0]?.props.accessibilityState.checked).toBe(false);
});

test("controlled selection follows selectedKeys and only reports changes", () => {
  const onSelectionChange = jest.fn();
  const { rerender } = render(
    <Cards selectionMode="multiple" selectedKeys={["a"]} onSelectionChange={onSelectionChange} />,
  );
  fireEvent.press(screen.getAllByRole("checkbox")[1] as never);
  expect(onSelectionChange).toHaveBeenCalledWith(new Set(["a", "b"]));
  expect(screen.getAllByRole("checkbox")[1]?.props.accessibilityState.checked).toBe(false);
  rerender(
    <Cards
      selectionMode="multiple"
      selectedKeys={["a", "b"]}
      onSelectionChange={onSelectionChange}
    />,
  );
  expect(screen.getAllByRole("checkbox")[1]?.props.accessibilityState.checked).toBe(true);
});

test("defaultSelectedKeys starts the uncontrolled selection", () => {
  render(<Cards selectionMode="single" defaultSelectedKeys={["c"]} />);
  expect(screen.getByRole("button", { name: "Gamma" }).props.accessibilityState.selected).toBe(
    true,
  );
});

test("a disabled card cannot be selected or acted on", () => {
  const onSelectionChange = jest.fn();
  const onAction = jest.fn();
  const { rerender } = render(
    <Cards selectionMode="single" disabledKeys={["b"]} onSelectionChange={onSelectionChange} />,
  );
  const beta = screen.getByRole("button", { name: "Beta" });
  fireEvent.press(beta);
  expect(onSelectionChange).not.toHaveBeenCalled();
  expect(beta.props.accessibilityState.disabled).toBe(true);
  rerender(<Cards disabledKeys={["b"]} onAction={onAction} />);
  fireEvent.press(screen.getByRole("button", { name: "Beta" }));
  expect(onAction).not.toHaveBeenCalled();
});

test("without selection or action the cards are plain list items", () => {
  render(<Cards />);
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByText("Alpha")).toBeTruthy();
});
