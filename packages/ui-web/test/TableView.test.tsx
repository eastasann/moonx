import { User } from "@react-aria/test-utils";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { Selection, SortDescriptor } from "react-aria-components";
import { TableView, type TableViewColumn, type TableViewRow } from "../src/components/TableView";
import { expectNoAxeViolations } from "./axe";
import { mockNarrow } from "./matchMedia";

const columns: TableViewColumn[] = [
  { id: "name", label: "Item", isRowHeader: true, allowsSorting: true },
  { id: "amount", label: "Amount", isNumeric: true, allowsSorting: true },
];
const rows: TableViewRow[] = [
  { id: "a", textValue: "Rent", cells: { name: "Rent", amount: "10,000.00" } },
  { id: "b", textValue: "Flour", cells: { name: "Flour", amount: "2,500.00" } },
  { id: "c", textValue: "Boxes", isDisabled: true, cells: { name: "Boxes", amount: "900.00" } },
];

const user = new User({ interactionType: "mouse" });

describe("TableView", () => {
  test.each(["compact", "regular", "spacious"] as const)(
    "renders a grid at %s density",
    (density) => {
      render(<TableView aria-label="Costs" columns={columns} rows={rows} density={density} />);
      const grid = screen.getByRole("grid", { name: "Costs" });
      expect(within(grid).getAllByRole("row")).toHaveLength(4);
      expect(within(grid).getByRole("columnheader", { name: /Amount/ })).toBeInTheDocument();
      expect(within(grid).getByRole("rowheader", { name: "Rent" })).toBeInTheDocument();
    },
  );

  test.each(["table", "cards"] as const)("keeps grid semantics in the %s layout", (layout) => {
    render(<TableView aria-label="Costs" columns={columns} rows={rows} layout={layout} />);
    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(screen.getAllByRole("gridcell").length).toBeGreaterThan(0);
  });

  describe("auto layout", () => {
    test.each([
      [true, undefined, "cards"],
      [false, undefined, "table"],
      [true, "table", "table"],
      [false, "cards", "cards"],
      [true, "auto", "cards"],
    ] as const)("narrow=%s layout=%s resolves to %s", (narrow, layout, expected) => {
      mockNarrow(narrow);
      render(<TableView aria-label="Costs" columns={columns} rows={rows} layout={layout} />);
      expect(screen.getByRole("grid")).toHaveAttribute("data-layout", expected);
    });
  });

  test("the selection column takes its width from the stylesheet, not an inline pixel value", () => {
    render(<TableView aria-label="Costs" columns={columns} rows={rows} selectionMode="multiple" />);
    const [selectionHeader] = screen.getAllByRole("columnheader");
    expect(selectionHeader?.getAttribute("style") ?? "").not.toMatch(/width/);
  });

  test("cards label each value with its column header", () => {
    render(<TableView aria-label="Costs" columns={columns} rows={rows} layout="cards" />);
    const cell = screen.getByRole("gridcell", { name: "10,000.00" });
    expect(cell).toHaveAttribute("data-label", "Amount");
  });

  test("shows the empty state when there are no rows", () => {
    render(<TableView aria-label="Costs" columns={columns} rows={[]} emptyState="No costs" />);
    expect(screen.getByText("No costs")).toBeInTheDocument();
  });

  test("multiple selection toggles rows and select all, and skips disabled rows", async () => {
    render(<TableView aria-label="Costs" columns={columns} rows={rows} selectionMode="multiple" />);
    const tester = user.createTester("Table", { root: screen.getByRole("grid") });
    await tester.toggleRowSelection({ row: 0 });
    expect(tester.findRow({ indexOrText: 0 })).toHaveAttribute("data-selected");
    await tester.toggleSelectAll();
    const selected = within(tester.getTable())
      .getAllByRole("row")
      .filter((r) => r.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(2);
    expect(tester.findRow({ indexOrText: "Boxes" })).toHaveAttribute("data-disabled");
  });

  test("single selection selects a row on click", async () => {
    render(<TableView aria-label="Costs" columns={columns} rows={rows} selectionMode="single" />);
    await userEvent.click(screen.getByRole("rowheader", { name: "Flour" }));
    expect(screen.getAllByRole("row")[2]).toHaveAttribute("aria-selected", "true");
  });

  test("sorting reports the new descriptor from a click and the keyboard", async () => {
    const onSort = vi.fn();
    function Sortable() {
      const [sort, setSort] = useState<SortDescriptor>({ column: "name", direction: "ascending" });
      return (
        <TableView
          aria-label="Costs"
          columns={columns}
          rows={rows}
          sortDescriptor={sort}
          onSortChange={(d) => {
            onSort(d);
            setSort(d);
          }}
        />
      );
    }
    render(<Sortable />);
    const amount = screen.getByRole("columnheader", { name: /Amount/ });
    await userEvent.click(amount);
    expect(onSort).toHaveBeenLastCalledWith({ column: "amount", direction: "ascending" });
    expect(amount).toHaveAttribute("aria-sort", "ascending");
    await userEvent.keyboard("{Enter}");
    expect(onSort).toHaveBeenLastCalledWith({ column: "amount", direction: "descending" });
  });

  test("numeric columns get their own cell styling", () => {
    render(<TableView aria-label="Costs" columns={columns} rows={rows} />);
    const amount = screen.getByRole("gridcell", { name: "10,000.00" });
    const name = screen.getByRole("rowheader", { name: "Rent" });
    expect(amount.className).not.toBe(name.className);
  });

  test("row hover and focus-visible data attributes appear with pointer and keyboard", async () => {
    render(<TableView aria-label="Costs" columns={columns} rows={rows} selectionMode="single" />);
    const first = screen.getAllByRole("row")[1] as HTMLElement;
    await userEvent.hover(first);
    expect(first).toHaveAttribute("data-hovered");
    await userEvent.tab();
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement?.closest("[role=row]")).toHaveAttribute("data-focus-visible");
  });

  test("onRowAction fires on Enter", async () => {
    const onAction = vi.fn();
    render(<TableView aria-label="Costs" columns={columns} rows={rows} onRowAction={onAction} />);
    await userEvent.tab();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onAction).toHaveBeenCalledWith("b");
  });

  test.each(["table", "cards"] as const)(
    "has no axe violations in the %s layout",
    async (layout) => {
      const selected: Selection = new Set(["a"]);
      const { container } = render(
        <TableView
          aria-label="Costs"
          columns={columns}
          rows={rows}
          layout={layout}
          selectionMode="multiple"
          selectedKeys={selected}
        />,
      );
      await expectNoAxeViolations(container);
    },
  );
});
