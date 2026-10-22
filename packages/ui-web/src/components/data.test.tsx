import { i18n } from "@moonx/i18n";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { setPhoneWidth, setTabletWidth, settle } from "../test/helpers";
import { Avatar, initialsOf } from "./Avatar";
import { Card, CardView } from "./Card";
import { CheckDots } from "./CheckDots";
import { CommentCount } from "./CommentCount";
import { ListView, ListViewItem } from "./ListView";
import { ActionMenu, MenuItem } from "./Menu";
import { Meter } from "./Meter";
import { MoonGlyph } from "./MoonGlyph";
import { NumberField } from "./NumberField";
import { type TableColumn, TableView } from "./TableView";
import { TextField } from "./TextField";
import { Tree, TreeItem } from "./Tree";

// Data display (design-spec 4.5): TableView, ListView, Card / CardView, Tree, Meter,
// CheckDots, Avatar and MoonGlyph. Their sizes are in variants.test.tsx.

const follows = (first: Element, second: Element) =>
  Boolean(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
  );

interface Row {
  id: string;
  name: string;
  amount: string;
}

const columns: TableColumn[] = [
  { id: "name", name: "Item", isRowHeader: true },
  { id: "amount", name: "Amount", numeric: true },
];

const rows: Row[] = [
  { id: "rent", name: "Rent", amount: "₱15,000" },
  { id: "power", name: "Power", amount: "₱2,400" },
];

/** A cost table whose rows edit in place, as 17 will use it. */
function EditableTable({ onRowAction }: { onRowAction?: () => void }) {
  const [items, setItems] = useState(rows);
  return (
    <>
      <TableView
        aria-label="Costs"
        columns={columns}
        items={items}
        isRowEditable={() => true}
        onRowAction={onRowAction}
        renderCell={(row, column, { isEditing }) => {
          const key = column as "name" | "amount";
          return isEditing ? (
            <TextField
              aria-label={`${column} of ${row.id}`}
              value={row[key]}
              onChange={(text) =>
                setItems((current) =>
                  current.map((each) =>
                    each.id === row.id ? { ...each, [key]: text } : each,
                  ),
                )
              }
            />
          ) : (
            row[key]
          );
        }}
      />
      <button type="button">After</button>
    </>
  );
}

describe("TableView", () => {
  test("under the rows: the action at the start and the figure at the end; a phone's rows keep the action alone (6.3)", () => {
    const table = (layout: "auto" | "cards") => (
      <TableView
        aria-label={`Costs ${layout}`}
        layout={layout}
        columns={columns}
        items={rows}
        renderCell={(row, column) => row[column as "name" | "amount"]}
        footerAction={<button type="button">{`Add row ${layout}`}</button>}
        footerTotal={`Subtotal ${layout}`}
      />
    );
    render(
      <>
        {table("auto")}
        {table("cards")}
      </>,
    );
    const add = screen.getByRole("button", { name: "Add row auto" });
    expect(follows(screen.getByRole("grid", { name: "Costs auto" }), add)).toBe(
      true,
    );
    expect(follows(add, screen.getByText("Subtotal auto"))).toBe(true);
    expect(screen.getByRole("button", { name: "Add row cards" })).toBeTruthy();
    expect(screen.queryByText("Subtotal cards")).toBeNull();
  });

  test("a grid of columns and rows; the row header names the row; numbers align right", () => {
    render(
      <TableView
        aria-label="Costs"
        columns={columns}
        items={rows}
        renderCell={(row, column) => row[column as "name" | "amount"]}
      />,
    );
    const table = screen.getByRole("grid", { name: "Costs" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Item", "Amount"]);
    expect(within(table).getAllByRole("rowheader")[0]?.textContent).toBe(
      "Rent",
    );
    const name = within(table).getAllByRole("rowheader")[0];
    const amount = within(table).getAllByRole("gridcell")[0];
    expect(amount?.className).not.toBe(name?.className);
  });

  test("the arrow keys move from cell to cell", async () => {
    const user = userEvent.setup();
    render(
      <TableView
        aria-label="Costs"
        columns={columns}
        items={rows}
        renderCell={(row, column) => row[column as "name" | "amount"]}
      />,
    );
    // Tab enters on the first row; the arrows move between rows, then into their cells.
    await user.tab();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement?.textContent).toBe("Power₱2,400");
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement?.textContent).toBe("Power");
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement?.textContent).toBe("₱2,400");
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement?.textContent).toBe("₱15,000");
  });

  test("an editable row shows text until touched; a press types in the pressed cell; Escape returns to the cell", async () => {
    const user = userEvent.setup();
    render(<EditableTable />);
    expect(screen.queryByRole("textbox")).toBeNull();
    await user.click(screen.getByText("₱15,000"));
    await settle();
    // Only the touched row turns into inputs, and the pressed cell's takes focus.
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "amount of rent" }),
    );
    // The keys stay in the input: ← moves the caret, it does not leave the cell.
    await user.keyboard("{ArrowLeft}0");
    expect(
      screen.getByRole("textbox", { name: "amount of rent" }),
    ).toHaveProperty("value", "₱15,0000");
    // Escape gives the keys back to the table, on the cell; the row keeps its inputs
    // while focus is in it, and shows its values again once focus moves on.
    await user.keyboard("{Escape}");
    await settle();
    expect(document.activeElement?.getAttribute("data-column")).toBe("amount");
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    await user.keyboard("{ArrowDown}");
    await settle();
    expect(screen.getByText("₱15,0000")).toBeTruthy();
    expect(
      screen
        .getAllByRole("textbox")
        .map((box) => box.getAttribute("aria-label")),
    ).toEqual(["name of power", "amount of power"]);
  });

  test("a focused row shows its inputs; Enter types in them; leaving the row ends it", async () => {
    const user = userEvent.setup();
    render(<EditableTable />);
    await user.tab();
    await user.keyboard("{ArrowDown}");
    await settle();
    // The focused row shows its inputs; the focus stays on the row, so the arrows still move.
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    expect(document.activeElement?.getAttribute("role")).toBe("row");
    await user.keyboard("{ArrowRight}{Enter}");
    await settle();
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "name of power" }),
    );
    // Tab moves between the row's inputs, then out of the table.
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "amount of power" }),
    );
    await user.tab();
    await settle();
    expect(document.activeElement?.textContent).toBe("After");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  test("in a row showing its inputs, ← and → go from cell to cell, not into the inputs", async () => {
    const user = userEvent.setup();
    render(<EditableTable />);
    await user.tab();
    await user.keyboard("{ArrowRight}");
    await settle();
    expect(document.activeElement?.getAttribute("data-column")).toBe("name");
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement?.getAttribute("data-column")).toBe("amount");
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(document.activeElement?.getAttribute("role")).toBe("row");
    // The header has no row: focus there shows every row's values.
    await user.keyboard("{ArrowUp}");
    await settle();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  test("Tab back into the table: the row that shows inputs is the one focus is in", async () => {
    const user = userEvent.setup();
    render(<EditableTable />);
    await user.click(screen.getByText("Power"));
    await settle();
    await user.keyboard("{Escape}");
    await settle();
    // Tab goes through the row's inputs, then out of the table.
    for (
      let step = 0;
      step < 6 && document.activeElement?.textContent !== "After";
      step++
    ) {
      await user.tab();
    }
    await settle();
    expect(document.activeElement?.textContent).toBe("After");
    expect(screen.queryByRole("textbox")).toBeNull();
    await user.tab({ shift: true });
    await settle();
    const row = document.activeElement?.closest('[role="row"]');
    expect(row).not.toBeNull();
    const shown = screen
      .getAllByRole("textbox")
      .map((box) => box.closest('[role="row"]'));
    expect(shown.every((each) => each === row)).toBe(true);
  });

  test("a press dragged off another row ends the typing where focus left", async () => {
    const user = userEvent.setup();
    render(<EditableTable />);
    await user.click(screen.getByText("₱15,000"));
    await settle();
    await user.pointer([
      { keys: "[MouseLeft>]", target: screen.getByText("Power") },
      { target: document.body },
      { keys: "[/MouseLeft]" },
    ]);
    await settle();
    await settle();
    expect(
      screen.queryByRole("textbox", { name: "amount of rent" }),
    ).toBeNull();
  });

  test("pressing another row while one is edited moves the editing to it", async () => {
    const user = userEvent.setup();
    render(<EditableTable />);
    await user.click(screen.getByText("₱15,000"));
    await settle();
    await user.click(screen.getByText("Power"));
    await settle();
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "name of power" }),
    );
    expect(screen.queryByRole("textbox", { name: "name of rent" })).toBeNull();
  });

  test("a single selection marks one row; a row action is called with its key", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    const onRowAction = vi.fn();
    const { unmount } = render(
      <TableView
        aria-label="Decisions"
        columns={columns}
        items={rows}
        selectionMode="single"
        onSelectionChange={onSelectionChange}
        renderCell={(row, column) => row[column as "name" | "amount"]}
      />,
    );
    await user.click(screen.getByText("Power"));
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(["power"]));
    unmount();
    render(
      <TableView
        aria-label="Decisions"
        columns={columns}
        items={rows}
        onRowAction={onRowAction}
        renderCell={(row, column) => row[column as "name" | "amount"]}
      />,
    );
    await user.click(screen.getByText("Rent"));
    expect(onRowAction).toHaveBeenCalledWith("rent");
    // A row that opens something ends in › (design-spec 4.4), in its last cell.
    const [first] = screen.getAllByRole("row").slice(1);
    expect(first?.querySelectorAll("svg")).toHaveLength(1);
  });

  test("on a phone each row is a line: its name, then its one other value at the end; pressing one calls the row action", async () => {
    setPhoneWidth();
    const user = userEvent.setup();
    const onRowAction = vi.fn();
    render(<EditableTable onRowAction={onRowAction} />);
    expect(screen.queryByRole("table")).toBeNull();
    const lines = screen.getAllByRole("row");
    expect(lines).toHaveLength(2);
    // The one value beside the name goes without its label (s17-costs.html).
    const first = within(lines[0] as HTMLElement);
    expect(first.getByText("₱15,000")).toBeTruthy();
    expect(first.queryByText("Amount")).toBeNull();
    await user.click(screen.getByText("Rent"));
    expect(onRowAction).toHaveBeenCalledWith("rent");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  test("on a phone the mark leads, values marked isBelowName go under the name, and hidden and ⋯ columns are left out", () => {
    setPhoneWidth();
    render(
      <TableView
        aria-label="Startup costs"
        columns={[
          { id: "mark", name: "State", isMark: true },
          { id: "name", name: "Item", isRowHeader: true },
          { id: "amount", name: "Amount", numeric: true },
          { id: "fau", name: "F/A/U", isBelowName: true },
          { id: "note", name: "Why needed", isHiddenOnPhone: true },
          { id: "reduce", name: "Can reduce?", isHiddenOnPhone: true },
          { id: "more", name: "Actions", isRowActions: true },
        ]}
        items={[{ id: "rent", name: "Rent" }]}
        onRowAction={() => {}}
        renderCell={(_, column) => `${column} value`}
      />,
    );
    const line = within(screen.getByRole("row"));
    const texts = ["mark value", "name value", "fau value", "amount value"].map(
      (text) => line.getByText(text),
    );
    // In this order: the mark, the name, under it the F/A/U label, the amount at the end.
    for (const [before, after] of texts
      .slice(0, -1)
      .map((text, index) => [text, texts[index + 1] as HTMLElement])) {
      expect(
        (before as HTMLElement).compareDocumentPosition(after as HTMLElement) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    for (const text of ["note value", "reduce value", "more value", "Amount"]) {
      expect(line.queryByText(text)).toBeNull();
    }
  });

  test("on a phone a row with more values than one lists them with their labels", () => {
    setPhoneWidth();
    render(
      <TableView
        aria-label="Scenarios"
        columns={[
          { id: "scenario", name: "Scenario", isRowHeader: true },
          { id: "units", name: "Units / day", numeric: true },
          { id: "profit", name: "Operating profit", numeric: true },
        ]}
        items={[
          { id: "e", scenario: "Expected", units: "15", profit: "₱18,490" },
        ]}
        renderCell={(row, column) => row[column as "scenario"]}
      />,
    );
    const line = within(screen.getByRole("row"));
    expect(line.getByText("Units / day")).toBeTruthy();
    expect(line.getByText("Operating profit")).toBeTruthy();
  });

  test("columns: widths on the header, mark and ⋯ named for screen readers only; a tablet keeps the phone's hidden columns", () => {
    setTabletWidth();
    render(
      <TableView
        aria-label="Startup costs"
        columns={[
          { id: "mark", name: "State", isMark: true },
          { id: "name", name: "Item", isRowHeader: true, width: "31%" },
          { id: "amount", name: "Amount", numeric: true, width: 120 },
          { id: "note", name: "Why needed", isHiddenOnPhone: true },
          { id: "more", name: "Actions", isRowActions: true },
        ]}
        items={[{ id: "rent", name: "Rent" }]}
        renderCell={(_, column) => `${column} value`}
      />,
    );
    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual([
      "State",
      "Item",
      "Amount",
      "Why needed",
      "Actions",
    ]);
    expect(headers[1]?.style.width).toBe("31%");
    expect(headers[2]?.style.width).toBe("120px");
    expect(screen.getByText("note value")).toBeTruthy();
    expect(screen.getByText("more value")).toBeTruthy();
  });

  test("a row that opens ends in › before its ⋯, which keeps its own cell", () => {
    render(
      <TableView
        aria-label="Decisions"
        columns={[
          { id: "name", name: "Item", isRowHeader: true },
          { id: "more", name: "Actions", isRowActions: true },
        ]}
        items={[{ id: "rent", name: "Rent" }]}
        onRowAction={() => {}}
        renderCell={(row, column) =>
          column === "name" ? row.name : <button type="button">More</button>
        }
      />,
    );
    const name = screen.getByRole("rowheader");
    expect(name.querySelector("svg")).not.toBeNull();
    const more = screen.getByRole("button", { name: "More" }).closest("td");
    expect(more?.querySelector("svg")).toBeNull();
  });

  test("a NumberField in a number column holds its digits at the end; elsewhere it does not", async () => {
    const user = userEvent.setup();
    function Table() {
      const [amount, setAmount] = useState("15,000");
      return (
        <TableView
          aria-label="Costs"
          columns={columns}
          items={[{ id: "rent", name: "Rent", amount }]}
          isRowEditable={() => true}
          renderCell={(row, column, { isEditing }) =>
            column === "amount" && isEditing ? (
              <NumberField
                aria-label="Amount of rent"
                currency="PHP"
                value={amount}
                onChange={setAmount}
              />
            ) : (
              row[column as "name" | "amount"]
            )
          }
        />
      );
    }
    render(
      <>
        <Table />
        <NumberField aria-label="Price" currency="PHP" defaultValue="450" />
      </>,
    );
    await user.click(screen.getByText("15,000"));
    await settle();
    const amount = screen.getByRole("textbox", { name: "Amount of rent" });
    // The input sits in a sizer as wide as the symbol and its text; the symbol is drawn
    // in it, before a copy of the text, so it stays beside the digits.
    expect(amount.parentElement?.getAttribute("data-value")).toBe("₱15,000");
    expect(amount.parentElement?.textContent).toBe("₱15,000");
    await user.keyboard("{End}0");
    expect(amount.parentElement?.getAttribute("data-value")).toBe("₱15,0000");
    expect(
      screen
        .getByRole("textbox", { name: "Price" })
        .parentElement?.hasAttribute("data-value"),
    ).toBe(false);
  });

  test('layout="cards" shows the phone\'s rows on a desktop too; the empty state replaces the rows', () => {
    render(
      <>
        <TableView
          aria-label="Cards"
          layout="cards"
          columns={columns}
          items={rows}
          renderCell={(row, column) => row[column as "name" | "amount"]}
        />
        <TableView
          aria-label="Empty"
          columns={columns}
          items={[]}
          renderCell={() => null}
          renderEmptyState={() => "No costs yet."}
        />
      </>,
    );
    const cards = screen.getByRole("grid", { name: "Cards" });
    expect(cards.tagName).not.toBe("TABLE");
    expect(screen.getByText("No costs yet.")).toBeTruthy();
  });
});

describe("ListView", () => {
  const ideas = [
    { id: "a", name: "Piaya Gift Box" },
    { id: "b", name: "Health Bowl" },
  ];

  test("rows move with the arrows; a list that acts ends its rows in ›", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <ListView aria-label="Ideas" items={ideas} onAction={onAction}>
        {(idea) => (
          <ListViewItem id={idea.id} textValue={idea.name}>
            {idea.name}
          </ListViewItem>
        )}
      </ListView>,
    );
    const rows = screen.getAllByRole("row");
    expect(rows.every((row) => row.querySelector("svg") !== null)).toBe(true);
    await user.tab();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onAction).toHaveBeenCalledWith("b");
  });

  test("rows that act one by one: only those with their own action press and end in ›", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <ListView aria-label="Notifications" items={ideas}>
        {(idea) => (
          <ListViewItem
            id={idea.id}
            textValue={idea.name}
            onAction={idea.id === "a" ? onOpen : undefined}
          >
            {idea.name}
          </ListViewItem>
        )}
      </ListView>,
    );
    const [first, second] = screen.getAllByRole("row");
    expect(first?.querySelector("svg")).not.toBeNull();
    expect(second?.querySelector("svg")).toBeNull();
    await user.click(screen.getByText("Health Bowl"));
    expect(onOpen).not.toHaveBeenCalled();
    await user.click(screen.getByText("Piaya Gift Box"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  test("a row's ⋯ opens its menu without choosing the row; after the ›", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    const onAction = vi.fn();
    render(
      <ListView
        aria-label="Ideas"
        items={ideas}
        selectionMode="single"
        onSelectionChange={onSelectionChange}
      >
        {(idea) => (
          <ListViewItem
            id={idea.id}
            textValue={idea.name}
            actions={
              <ActionMenu
                aria-label={`More for ${idea.name}`}
                onAction={onAction}
              >
                <MenuItem id="duplicate">Duplicate</MenuItem>
              </ActionMenu>
            }
          >
            {idea.name}
          </ListViewItem>
        )}
      </ListView>,
    );
    const more = screen.getByRole("button", { name: "More for Health Bowl" });
    const chevron = screen.getAllByRole("row")[1]?.querySelector("svg");
    expect(chevron && follows(chevron, more)).toBe(true);
    await user.click(more);
    await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    expect(onAction.mock.calls[0]?.[0]).toBe("duplicate");
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  test('layout="cards" frames each item', () => {
    render(
      <>
        <ListView aria-label="Rows" items={ideas}>
          {(idea) => (
            <ListViewItem id={idea.id} textValue={idea.name}>
              {idea.name}
            </ListViewItem>
          )}
        </ListView>
        <ListView aria-label="Cards" items={ideas} layout="cards">
          {(idea) => (
            <ListViewItem id={idea.id} textValue={idea.name}>
              {idea.name}
            </ListViewItem>
          )}
        </ListView>
      </>,
    );
    const row = within(screen.getByRole("grid", { name: "Rows" })).getAllByRole(
      "row",
    )[0];
    const card = within(
      screen.getByRole("grid", { name: "Cards" }),
    ).getAllByRole("row")[0];
    expect(card?.className).not.toBe(row?.className);
  });

  test("single selection, density and an empty state", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <>
        <ListView
          aria-label="Members"
          items={ideas}
          selectionMode="single"
          onSelectionChange={onSelectionChange}
          density="compact"
        >
          {(idea) => (
            <ListViewItem id={idea.id} textValue={idea.name}>
              {idea.name}
            </ListViewItem>
          )}
        </ListView>
        <ListView aria-label="Spacious" items={ideas} density="spacious">
          {(idea) => (
            <ListViewItem id={idea.id} textValue={idea.name}>
              {idea.name}
            </ListViewItem>
          )}
        </ListView>
        <ListView aria-label="None" renderEmptyState={() => "No ideas yet."}>
          {[]}
        </ListView>
      </>,
    );
    await user.click(screen.getAllByText("Health Bowl")[0] as HTMLElement);
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(["b"]));
    expect(screen.getByRole("grid", { name: "Members" }).className).not.toBe(
      screen.getByRole("grid", { name: "Spacious" }).className,
    );
    expect(screen.getByText("No ideas yet.")).toBeTruthy();
    // A list that neither acts nor selects has no › on its rows.
    const spacious = screen.getByRole("grid", { name: "Spacious" });
    expect(spacious.querySelector("svg")).toBeNull();
  });
});

describe("Tree", () => {
  const tree = (props: { onAction?: (key: unknown) => void } = {}) => (
    <Tree aria-label="Template" {...props}>
      <TreeItem id="01" textValue="01 Customer" title="01 Customer">
        <TreeItem id="who" textValue="WHO" title="WHO" />
      </TreeItem>
      <TreeItem id="02" textValue="02 Market" title="02 Market" />
    </Tree>
  );

  test("the arrow keys open and close a branch; its button is named from the catalog", async () => {
    const user = userEvent.setup();
    render(tree());
    expect(screen.queryByText("WHO")).toBeNull();
    // The branch's button is named by its label and the item's.
    const expand = screen.getByRole("button", {
      name: `${i18n.t("components:tree.expand")} 01 Customer`,
    });
    await user.click(expand);
    expect(screen.getByText("WHO")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: `${i18n.t("components:tree.collapse")} 01 Customer`,
      }),
    ).toBeTruthy();
    await user.keyboard("{ArrowLeft}");
    expect(screen.queryByText("WHO")).toBeNull();
    await user.keyboard("{ArrowRight}{ArrowDown}");
    expect(document.activeElement?.textContent).toContain("WHO");
  });

  test("pressing an item calls the action with its key; items that open end in ›", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(tree({ onAction }));
    await user.click(screen.getByText("02 Market"));
    expect(onAction).toHaveBeenCalledWith("02");
    const row = screen.getByRole("row", { name: "02 Market" });
    expect(row.querySelectorAll("svg")).toHaveLength(1);
  });
});

describe("Card and CardView", () => {
  test("a Card alone is a frame with its preview, title, description and content", () => {
    render(
      <Card preview="slide" title="Airport kiosk" description="Direct">
        ₱450
      </Card>,
    );
    for (const text of ["slide", "Airport kiosk", "Direct", "₱450"]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(screen.queryByRole("grid")).toBeNull();
  });

  test("open threads: the comments' mark and their count after the footer, none for zero", () => {
    const { rerender } = render(
      <Card title="Bowl & Co" footer="No sources" openThreadCount={2} />,
    );
    expect(screen.getByText("2 open comment threads")).toBeTruthy();
    rerender(
      <Card title="Bowl & Co" footer="No sources" openThreadCount={0} />,
    );
    expect(screen.queryByText(/open comment thread/)).toBeNull();
  });

  test("in a CardView the cards are its items: pressed, chosen, moved between by arrows", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const onSelectionChange = vi.fn();
    render(
      <>
        <CardView aria-label="Competitors" onAction={onAction}>
          <Card id="a" textValue="A" title="A" />
          <Card id="b" textValue="B" title="B" />
        </CardView>
        <CardView
          aria-label="Slides"
          selectionMode="single"
          onSelectionChange={onSelectionChange}
        >
          <Card id="s1" textValue="Slide 1" title="Slide 1" />
          <Card id="s2" textValue="Slide 2" title="Slide 2" />
        </CardView>
      </>,
    );
    await user.click(screen.getByText("B"));
    expect(onAction).toHaveBeenCalledWith("b");
    await user.click(screen.getByText("Slide 2"));
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(["s2"]));
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement?.textContent).toBe("Slide 1");
  });

  test("a Card's eyebrow, figure with its note, details, footer and actions", () => {
    render(
      <Card
        eyebrow="Direct competitor"
        title="Salad Station"
        figure="₱240"
        figureDescription="per bowl"
        details={[
          { id: "target", label: "Target customer", value: "Office workers" },
          { id: "offer", label: "Offering", value: "Salad bowls" },
        ]}
        footer="1 source"
        actions={<button type="button">Card actions</button>}
      />,
    );
    for (const text of [
      "Direct competitor",
      "Salad Station",
      "₱240",
      "per bowl",
      "1 source",
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(screen.getAllByRole("term").map((term) => term.textContent)).toEqual(
      ["Target customer", "Offering"],
    );
    expect(screen.getByRole("button", { name: "Card actions" })).toBeTruthy();
  });

  test("in a CardView a card's ⋯ is its one button: Tab reaches it, and pressing it does not open the card", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const onMore = vi.fn();
    render(
      <CardView aria-label="Competitors" onAction={onAction}>
        <Card
          id="a"
          textValue="Salad Station"
          title="Salad Station"
          actions={
            <button type="button" onClick={onMore}>
              Card actions
            </button>
          }
        />
      </CardView>,
    );
    await user.tab();
    expect(document.activeElement?.getAttribute("role")).toBe("row");
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Card actions" }),
    );
    await user.click(screen.getByRole("button", { name: "Card actions" }));
    expect(onMore).toHaveBeenCalledTimes(1);
    expect(onAction).not.toHaveBeenCalled();
    await user.click(screen.getByText("Salad Station"));
    expect(onAction).toHaveBeenCalledWith("a");
  });

  test("a Card in a CardView needs its key and text", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(
        <CardView aria-label="Broken">
          <Card title="No id" />
        </CardView>,
      ),
    ).toThrow("needs an id and a textValue");
    vi.restoreAllMocks();
  });
});

describe("CommentCount", () => {
  test("the mark and the number, read as how many comments; none shows nothing", () => {
    const { container, rerender } = render(<CommentCount count={2} />);
    expect(container.textContent).toBe("22 comments");
    expect(
      screen.getByText("2", { exact: true }).getAttribute("aria-hidden"),
    ).toBe("true");
    rerender(<CommentCount count={1} />);
    expect(container.textContent).toBe("11 comment");
    rerender(<CommentCount count={0} />);
    expect(container.textContent).toBe("");
  });
});

describe("Meter", () => {
  test("the band shares its width by the counts; the legend names every segment with its count", () => {
    render(
      <Meter
        label="F/A/U"
        segments={[
          { state: "fact", label: "Fact", count: 12 },
          {
            state: "assumption",
            label: "Assumption",
            count: 9,
            detail: "(L3 M4 H2)",
          },
          { state: "unknown", label: "Unknown", count: 0 },
          { state: "empty", label: "Empty", count: 18 },
        ]}
      />,
    );
    const meter = screen.getByRole("figure");
    expect(meter.querySelector("figcaption")?.textContent).toBe("F/A/U");
    const band = meter.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(
      [...band.children].map(
        (segment) => (segment as HTMLElement).style.flexGrow,
      ),
    ).toEqual(["12", "9", "18"]);
    const legend = within(meter).getAllByRole("listitem");
    expect(legend.map((entry) => entry.textContent)).toEqual([
      "Fact12",
      "Assumption9(L3 M4 H2)",
      "Unknown0",
      "Empty18",
    ]);
    // Each state has its own shade, Empty's swatch an edge of its own.
    const swatches = legend.map(
      (entry) => entry.querySelector('[aria-hidden="true"]')?.className,
    );
    expect(new Set(swatches).size).toBe(4);
  });
});

test("Meter: named for screen readers alone where the block's heading shows the name (13)", () => {
  render(
    <Meter
      aria-label="Answers by F/A/U"
      segments={[
        {
          state: "assumption",
          label: "Assumption",
          count: 29,
          detail: "L9 M17 H3",
        },
      ]}
    />,
  );
  const meter = screen.getByRole("figure", { name: "Answers by F/A/U" });
  expect(meter.querySelector("figcaption")).toBeNull();
  expect(screen.queryByText("Answers by F/A/U")).toBeNull();
});

describe("CheckDots", () => {
  test("one image read as every check's name and state", () => {
    render(
      <CheckDots
        checks={[
          { name: "Competitors (3–5)", state: "done" },
          { name: "Permits", state: "not-started" },
          { name: "Costs", state: "partial" },
        ]}
      />,
    );
    const image = screen.getByRole("img");
    expect(image.getAttribute("aria-label")).toBe(
      "Competitors (3–5): Done, Permits: Not started, Costs: Partial",
    );
    expect(image.querySelectorAll("svg")).toHaveLength(3);
  });
});

describe("Avatar", () => {
  test("initials: the first letters of the first and last word, whole characters", () => {
    expect(initialsOf("Ana Reyes")).toBe("AR");
    expect(initialsOf("Kenji")).toBe("K");
    expect(initialsOf("  maria de la cruz ")).toBe("MC");
    expect(initialsOf("Émile Zola")).toBe("ÉZ");
    expect(initialsOf("田中 太郎")).toBe("田太");
    expect(initialsOf("")).toBe("");
  });

  test("the photo, or the initials when it fails; decorative unless given alt", async () => {
    const { container } = render(
      <>
        <Avatar name="Ana Reyes" src="/ana.png" alt="Ana Reyes" />
        <Avatar name="Kenji Sato" />
      </>,
    );
    const photo = screen.getByRole("img", { name: "Ana Reyes" });
    expect(photo.tagName).toBe("IMG");
    expect(container.textContent).toBe("KS");
    expect(screen.getAllByRole("img")).toHaveLength(1);
    act(() => {
      photo.dispatchEvent(new Event("error"));
    });
    const initials = screen.getByRole("img", { name: "Ana Reyes" });
    expect(initials.tagName).toBe("SPAN");
    expect(initials.textContent).toBe("AR");
  });
});

describe("MoonGlyph", () => {
  test("each state has its shape: full, half, new, diamond, dotted ring", () => {
    const { container } = render(
      <div>
        {(
          ["fact", "assumption", "unknown", "unclassified", "empty"] as const
        ).map((state) => (
          <MoonGlyph key={state} state={state} />
        ))}
      </div>,
    );
    const marks = [...container.querySelectorAll("svg")];
    expect(
      marks.every((mark) => mark.getAttribute("aria-hidden") === "true"),
    ).toBe(true);
    // Fact: ring and full disc; Assumption: ring and half; Unknown: the ring alone.
    expect(marks[0]?.querySelectorAll("circle")).toHaveLength(2);
    expect(marks[1]?.querySelector("path")).not.toBeNull();
    expect(marks[2]?.children).toHaveLength(1);
    // Unclassified: a square with rounded corners turned 45° (moon-base.css .dot-attn).
    const diamond = marks[3]?.querySelector("rect");
    expect(diamond?.getAttribute("transform")).toBe("rotate(45 10 10)");
    expect(Number(diamond?.getAttribute("rx"))).toBeGreaterThan(0);
    // Empty: twelve even dashes round the ring (.dot-empty).
    const ring = marks[4]?.querySelector("circle");
    expect(ring?.getAttribute("stroke-dasharray")).toBe("1 1");
    expect(ring?.getAttribute("pathLength")).toBe("24");
  });

  test("a value is the share lit, held to 0–1; isCurrent rings it", () => {
    const { container } = render(
      <>
        <MoonGlyph value={0} />
        <MoonGlyph value={0.8} />
        <MoonGlyph value={1.5} />
        <MoonGlyph value={-1} isCurrent />
      </>,
    );
    const marks = [...container.querySelectorAll("svg")];
    expect(marks[0]?.children).toHaveLength(1);
    expect(marks[1]?.querySelector("path")).not.toBeNull();
    expect(marks[2]?.querySelectorAll("circle")).toHaveLength(2);
    expect(marks[3]?.children).toHaveLength(1);
    expect(marks[3]?.parentElement?.tagName).toBe("SPAN");
    expect(marks[0]?.parentElement?.tagName).not.toBe("SPAN");
  });
});
