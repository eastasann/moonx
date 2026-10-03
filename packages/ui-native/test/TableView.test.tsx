import { themes } from "@moonx/ui-tokens/native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import {
  TableView,
  type TableViewColumn,
  type TableViewProps,
  type TableViewRow,
} from "../src/components/TableView";
import { hostsWithRole } from "./collectionHelpers";

afterEach(resetMockUnistyles);

const columns: TableViewColumn[] = [
  { id: "item", label: "Item", isRowHeader: true, allowsSorting: true },
  { id: "cost", label: "Cost", isNumeric: true, allowsSorting: true },
  { id: "note", label: "Note" },
];
const rows: TableViewRow[] = [
  { id: "r1", cells: { item: "Boxes", cost: "₱1,200", note: "Local" } },
  { id: "r2", cells: { item: "Ribbon", cost: "₱300" }, textValue: "Ribbon row" },
  { id: "r3", cells: { item: "Tape", cost: "₱90" }, isDisabled: true },
];

function Table(props: Partial<TableViewProps>) {
  return <TableView aria-label="Costs" columns={columns} rows={rows} {...props} />;
}

test("every row is a card with the column labels inside, whatever layout says", () => {
  for (const layout of ["auto", "table", "cards"] as const) {
    const { unmount } = render(<Table layout={layout} />);
    expect(screen.getByLabelText("Costs").props.role).toBe("grid");
    expect(hostsWithRole("row")).toHaveLength(3);
    expect(screen.getAllByText("Cost").length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText("₱1,200")).toBeTruthy();
    unmount();
  }
});

test("a numeric column right-aligns and uses tabular numerals", () => {
  render(<Table />);
  const value = screen.getByText("₱1,200");
  expect(value.props.style).toMatchObject({
    textAlign: "right",
    fontVariant: themes.light.typography.number.fontVariant,
  });
  expect(screen.getByText("Local").props.style.textAlign).toBeUndefined();
});

test("no horizontal scroll: nothing in the table is a horizontal ScrollView", () => {
  render(<Table />);
  expect(JSON.stringify(screen.toJSON())).not.toContain('"horizontal":true');
});

test("density sets the card height, never below the touch target", () => {
  const heights: Record<string, number> = {};
  for (const density of ["compact", "regular", "spacious"] as const) {
    const { unmount } = render(<Table density={density} onRowAction={() => {}} />);
    heights[density] = screen.getByRole("button", { name: "Ribbon row" }).props.style.minHeight;
    unmount();
  }
  expect(heights.compact).toBeGreaterThanOrEqual(44);
  expect(heights.spacious).toBe(themes.light.density.spacious["row-height"]);
  expect(heights.regular).toBe(themes.light.density.regular["row-height"]);
});

test("sort controls name the column, are 44 high and flip the direction", () => {
  const onSortChange = jest.fn();
  const { rerender } = render(<Table onSortChange={onSortChange} />);
  const cost = screen.getByRole("button", { name: "Cost" });
  expect(cost.props.style.minHeight).toBeGreaterThanOrEqual(44);
  expect(screen.queryByRole("button", { name: "Note" })).toBeNull();
  fireEvent.press(cost);
  expect(onSortChange).toHaveBeenLastCalledWith({ column: "cost", direction: "ascending" });
  rerender(
    <Table
      onSortChange={onSortChange}
      sortDescriptor={{ column: "cost", direction: "ascending" }}
    />,
  );
  expect(screen.getByRole("button", { name: "Cost" }).props.accessibilityState.selected).toBe(true);
  expect(screen.getByRole("button", { name: "Item" }).props.accessibilityState.selected).toBe(
    false,
  );
  fireEvent.press(screen.getByRole("button", { name: "Cost" }));
  expect(onSortChange).toHaveBeenLastCalledWith({ column: "cost", direction: "descending" });
});

test("the sorted column's direction is spoken from sortLabels", () => {
  render(
    <Table
      sortLabels={{ ascending: "ascending", descending: "descending" }}
      sortDescriptor={{ column: "cost", direction: "descending" }}
    />,
  );
  expect(screen.getByRole("button", { name: "Cost" }).props.accessibilityValue.text).toBe(
    "descending",
  );
  expect(
    screen.getByRole("button", { name: "Item" }).props.accessibilityValue?.text,
  ).toBeUndefined();
});

test("onRowAction fires with the row id and a disabled row blocks it", () => {
  const onRowAction = jest.fn();
  render(<Table onRowAction={onRowAction} />);
  fireEvent.press(screen.getByRole("button", { name: "Ribbon row" }));
  expect(onRowAction).toHaveBeenCalledWith("r2");
  fireEvent.press(screen.getByRole("button", { name: /Item: Tape/ }));
  expect(onRowAction).toHaveBeenCalledTimes(1);
});

test("a card without textValue is named from its labelled text cells", () => {
  render(<Table onRowAction={() => {}} />);
  expect(
    screen.getByRole("button", { name: "Item: Boxes, Cost: ₱1,200, Note: Local" }),
  ).toBeTruthy();
});

test("single selection selects the pressed card", () => {
  const onSelectionChange = jest.fn();
  render(<Table selectionMode="single" onSelectionChange={onSelectionChange} />);
  fireEvent.press(screen.getByRole("button", { name: "Ribbon row" }));
  expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(["r2"]));
  expect(screen.getByRole("button", { name: "Ribbon row" }).props.accessibilityState.selected).toBe(
    true,
  );
});

test("multiple selection toggles cards and the select-all control reflects them", () => {
  const onSelectionChange = jest.fn();
  render(
    <Table
      selectionMode="multiple"
      selectAllLabel="Select all"
      onSelectionChange={onSelectionChange}
    />,
  );
  const all = () => screen.getByRole("checkbox", { name: "Select all" });
  expect(all().props.accessibilityState.checked).toBe(false);
  fireEvent.press(screen.getByRole("checkbox", { name: "Ribbon row" }));
  expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(["r2"]));
  expect(all().props.accessibilityState.checked).toBe("mixed");
  fireEvent.press(all());
  expect(onSelectionChange).toHaveBeenLastCalledWith("all");
  expect(all().props.accessibilityState.checked).toBe(true);
  expect(
    screen.getByRole("checkbox", { name: /Item: Tape/ }).props.accessibilityState.checked,
  ).toBe(false);
  fireEvent.press(all());
  expect(onSelectionChange).toHaveBeenLastCalledWith(new Set());
});

test("select-all is drawn only when the screen gives its label", () => {
  render(<Table selectionMode="multiple" />);
  expect(screen.queryByRole("checkbox", { name: "Select all" })).toBeNull();
  expect(screen.getAllByRole("checkbox")).toHaveLength(3);
});

test("multiple selection with onRowAction splits the checkbox from the action area", () => {
  const onRowAction = jest.fn();
  const onSelectionChange = jest.fn();
  render(
    <Table
      selectionMode="multiple"
      onRowAction={onRowAction}
      onSelectionChange={onSelectionChange}
    />,
  );
  const checkbox = screen.getByRole("checkbox", { name: "Ribbon row" });
  expect(checkbox.props.style.minHeight).toBeGreaterThanOrEqual(44);
  fireEvent.press(checkbox);
  expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(["r2"]));
  expect(onRowAction).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole("button", { name: "Ribbon row" }));
  expect(onRowAction).toHaveBeenCalledWith("r2");
});

test("selectedKeys controls the selection", () => {
  render(<Table selectionMode="multiple" selectedKeys={new Set(["r1"])} />);
  fireEvent.press(screen.getByRole("checkbox", { name: "Ribbon row" }));
  expect(
    screen.getByRole("checkbox", { name: "Ribbon row" }).props.accessibilityState.checked,
  ).toBe(false);
  expect(
    screen.getByRole("checkbox", { name: /Item: Boxes/ }).props.accessibilityState.checked,
  ).toBe(true);
});

test("the empty state shows when there are no rows", () => {
  render(<Table rows={[]} emptyState={<Text>No costs</Text>} />);
  expect(screen.getByText("No costs")).toBeTruthy();
});

test("dark theme colors the selected card", () => {
  mockUnistyles({ theme: "dark" });
  render(<Table selectionMode="single" defaultSelectedKeys={new Set(["r2"])} />);
  expect(screen.getByRole("button", { name: "Ribbon row" }).props.style.backgroundColor).toBe(
    themes.dark.color.surface.selected,
  );
});
