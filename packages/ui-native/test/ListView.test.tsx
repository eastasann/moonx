import { themes } from "@moonx/ui-tokens/native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { ListView, ListViewItem, type ListViewProps } from "../src/components/ListView";
import { hostsWithRole } from "./collectionHelpers";

afterEach(resetMockUnistyles);

function Rows(props: Partial<ListViewProps<object>>) {
  return (
    <ListView aria-label="Ideas" {...props}>
      <ListViewItem id="a" textValue="Alpha">
        Alpha
      </ListViewItem>
      <ListViewItem id="b" textValue="Beta">
        Beta
      </ListViewItem>
      <ListViewItem id="c" textValue="Gamma" isDisabled>
        Gamma
      </ListViewItem>
    </ListView>
  );
}

test("a named list of rows", () => {
  render(<Rows />);
  expect(screen.getByLabelText("Ideas")).toBeTruthy();
  expect(hostsWithRole("listitem")).toHaveLength(3);
  expect(screen.getByText("Alpha")).toBeTruthy();
});

test("density sets the row height, never below the touch target", () => {
  const heights: Record<string, number> = {};
  for (const density of ["compact", "regular", "spacious"] as const) {
    const { unmount } = render(<Rows density={density} onAction={() => {}} />);
    heights[density] = screen.getByRole("button", { name: "Alpha" }).props.style.minHeight;
    unmount();
  }
  expect(heights.compact).toBeGreaterThanOrEqual(44);
  expect(heights.compact).toBe(
    Math.max(
      themes.light.density.compact["row-height"],
      themes.light.scale.component["target-min"],
    ),
  );
  expect(heights.regular).toBe(themes.light.density.regular["row-height"]);
  expect(heights.spacious).toBe(themes.light.density.spacious["row-height"]);
});

test("onAction fires with the row id and a disabled row blocks it", () => {
  const onAction = jest.fn();
  render(<Rows onAction={onAction} disabledKeys={["b"]} />);
  fireEvent.press(screen.getByRole("button", { name: "Alpha" }));
  expect(onAction).toHaveBeenCalledWith("a");
  fireEvent.press(screen.getByRole("button", { name: "Beta" }));
  fireEvent.press(screen.getByRole("button", { name: "Gamma" }));
  expect(onAction).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Gamma" }).props.accessibilityState.disabled).toBe(
    true,
  );
});

test("a row's own onAction overrides the list's", () => {
  const list = jest.fn();
  const own = jest.fn();
  render(
    <ListView aria-label="Ideas" onAction={list}>
      <ListViewItem id="a" textValue="Alpha" onAction={own}>
        Alpha
      </ListViewItem>
    </ListView>,
  );
  fireEvent.press(screen.getByRole("button", { name: "Alpha" }));
  expect(own).toHaveBeenCalledTimes(1);
  expect(list).not.toHaveBeenCalled();
});

test("single selection selects one row, shows it and moves on the next press", () => {
  const onSelectionChange = jest.fn();
  render(<Rows selectionMode="single" onSelectionChange={onSelectionChange} />);
  fireEvent.press(screen.getByRole("button", { name: "Alpha" }));
  expect(screen.getByRole("button", { name: "Alpha" }).props.accessibilityState.selected).toBe(
    true,
  );
  expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(["a"]));
  fireEvent.press(screen.getByRole("button", { name: "Beta" }));
  expect(screen.getByRole("button", { name: "Alpha" }).props.accessibilityState.selected).toBe(
    false,
  );
  expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(["b"]));
  fireEvent.press(screen.getByRole("button", { name: "Beta" }));
  expect(onSelectionChange).toHaveBeenLastCalledWith(new Set());
});

test("disallowEmptySelection keeps the last selected row", () => {
  render(
    <Rows selectionMode="single" defaultSelectedKeys={new Set(["a"])} disallowEmptySelection />,
  );
  fireEvent.press(screen.getByRole("button", { name: "Alpha" }));
  expect(screen.getByRole("button", { name: "Alpha" }).props.accessibilityState.selected).toBe(
    true,
  );
});

test("multiple selection toggles rows as checkboxes", () => {
  const onSelectionChange = jest.fn();
  render(<Rows selectionMode="multiple" onSelectionChange={onSelectionChange} />);
  fireEvent.press(screen.getByRole("checkbox", { name: "Alpha" }));
  fireEvent.press(screen.getByRole("checkbox", { name: "Beta" }));
  expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(["a", "b"]));
  expect(screen.getByRole("checkbox", { name: "Alpha" }).props.accessibilityState.checked).toBe(
    true,
  );
  fireEvent.press(screen.getByRole("checkbox", { name: "Alpha" }));
  expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(["b"]));
});

test("multiple selection with onAction has a separate checkbox and an action area", () => {
  const onAction = jest.fn();
  const onSelectionChange = jest.fn();
  render(
    <Rows selectionMode="multiple" onAction={onAction} onSelectionChange={onSelectionChange} />,
  );
  const checkbox = screen.getByRole("checkbox", { name: "Alpha" });
  expect(checkbox.props.style.minHeight).toBeGreaterThanOrEqual(44);
  fireEvent.press(checkbox);
  expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(["a"]));
  expect(onAction).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole("button", { name: "Alpha" }));
  expect(onAction).toHaveBeenCalledWith("a");
});

test("selectedKeys controls the selection and 'all' selects every enabled row", () => {
  const { rerender } = render(<Rows selectionMode="multiple" selectedKeys={new Set(["b"])} />);
  fireEvent.press(screen.getByRole("checkbox", { name: "Alpha" }));
  expect(screen.getByRole("checkbox", { name: "Alpha" }).props.accessibilityState.checked).toBe(
    false,
  );
  rerender(<Rows selectionMode="multiple" selectedKeys="all" />);
  expect(screen.getByRole("checkbox", { name: "Alpha" }).props.accessibilityState.checked).toBe(
    true,
  );
  expect(screen.getByRole("checkbox", { name: "Gamma" }).props.accessibilityState.checked).toBe(
    false,
  );
});

test("pressing a row of 'all' unselects it and keeps the rest", () => {
  const onSelectionChange = jest.fn();
  render(
    <Rows
      selectionMode="multiple"
      defaultSelectedKeys="all"
      onSelectionChange={onSelectionChange}
    />,
  );
  fireEvent.press(screen.getByRole("checkbox", { name: "Alpha" }));
  expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(["b"]));
});

test("dynamic items render through the render function", () => {
  const items = [
    { id: "x", name: "Xray" },
    { id: "y", name: "Yankee" },
  ];
  render(
    <ListView aria-label="Dynamic" items={items}>
      {(item: { id: string; name: string }) => (
        <ListViewItem id={item.id} textValue={item.name}>
          {item.name}
        </ListViewItem>
      )}
    </ListView>,
  );
  expect(screen.getByText("Xray")).toBeTruthy();
  expect(screen.getByText("Yankee")).toBeTruthy();
});

test("a long list is virtualized: only the first rows are mounted", () => {
  const items = Array.from({ length: 500 }, (_, i) => ({ id: `r${i}` }));
  render(
    <ListView aria-label="Long" items={items}>
      {(item: { id: string }) => (
        <ListViewItem id={item.id} textValue={item.id}>
          {item.id}
        </ListViewItem>
      )}
    </ListView>,
  );
  expect(hostsWithRole("listitem").length).toBeLessThan(100);
  expect(screen.getByText("r0")).toBeTruthy();
  expect(screen.queryByText("r499")).toBeNull();
});

test("the empty state shows when there are no rows", () => {
  render(
    <ListView aria-label="Empty" emptyState={<Text>Nothing yet</Text>}>
      {[]}
    </ListView>,
  );
  expect(screen.getByText("Nothing yet")).toBeTruthy();
});

test("dark theme colors the selected row", () => {
  mockUnistyles({ theme: "dark" });
  render(<Rows selectionMode="single" defaultSelectedKeys={new Set(["a"])} />);
  expect(screen.getByRole("button", { name: "Alpha" }).props.style.backgroundColor).toBe(
    themes.dark.color.surface.selected,
  );
});
