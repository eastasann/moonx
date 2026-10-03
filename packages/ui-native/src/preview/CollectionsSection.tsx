/** Gallery section: tables, lists, cards, trees, disclosure, tabs and the other containers. */
import { CARD_VIEW_COLUMNS, DENSITIES, DIVIDER_SIZES } from "@moonx/ui-tokens";
import { Inbox } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { Badge } from "../components/Badge";
import { Breadcrumb, Breadcrumbs } from "../components/Breadcrumbs";
import { Card } from "../components/Card";
import { CardView } from "../components/CardView";
import { DiffText } from "../components/DiffText";
import { Accordion, Disclosure } from "../components/Disclosure";
import { Divider } from "../components/Divider";
import { IllustratedMessage } from "../components/IllustratedMessage";
import { ListView, ListViewItem } from "../components/ListView";
import { RowList, RowListItem } from "../components/RowList";
import {
  type SortDescriptor,
  TableView,
  type TableViewColumn,
  type TableViewRow,
} from "../components/TableView";
import { Tab, TabList, TabPanel, Tabs } from "../components/Tabs";
import { Text } from "../components/Text";
import { Tree, TreeItem } from "../components/Tree";
import { Well } from "../components/Well";
import { Case, Cases, Component, GallerySection, SIZES } from "./parts";
import { styles } from "./preview.styles";

export const COLLECTIONS_COVERAGE = [
  "TableView",
  "ListView",
  "ListViewItem",
  "CardView",
  "Card",
  "Tree",
  "TreeItem",
  "Well",
  "DiffText",
  "RowList",
  "RowListItem",
  "Divider",
  "Disclosure",
  "Accordion",
  "Tabs",
  "TabList",
  "Tab",
  "TabPanel",
  "Breadcrumbs",
  "Breadcrumb",
] as const;

const DIFF = [
  { kind: "same", text: "Sell " },
  { kind: "removed", text: "cakes" },
  { kind: "added", text: "gift boxes" },
  { kind: "same", text: " daily" },
] as const;

const COLUMNS: TableViewColumn[] = [
  { id: "name", label: "Cost", isRowHeader: true, allowsSorting: true },
  { id: "kind", label: "Kind" },
  { id: "amount", label: "Amount", isNumeric: true, allowsSorting: true },
];

const ROWS: TableViewRow[] = [
  { id: "1", textValue: "Rent", cells: { name: "Rent", kind: "Fixed", amount: "₱ 25,000.00" } },
  { id: "2", textValue: "Flour", cells: { name: "Flour", kind: "Variable", amount: "₱ 4,200.50" } },
  {
    id: "3",
    textValue: "Oven",
    isDisabled: true,
    cells: { name: "Oven (disabled row)", kind: "Initial", amount: "₱ 80,000.00" },
  },
];

function SortableTable() {
  const [sort, setSort] = useState<SortDescriptor>({ column: "amount", direction: "descending" });
  return (
    <TableView
      aria-label="Costs sorted"
      columns={COLUMNS}
      rows={ROWS}
      sortDescriptor={sort}
      onSortChange={setSort}
      sortLabels={{ ascending: "Ascending", descending: "Descending" }}
    />
  );
}

const LIST = ["Bakery in Cebu", "Coffee cart", "Surf school"];

function ListItems() {
  return LIST.map((name) => (
    <ListViewItem key={name} id={name} textValue={name}>
      {name}
    </ListViewItem>
  ));
}

export function CollectionsSection() {
  return (
    <GallerySection id="collections" title="Collections and containers">
      <Component
        name="TableView"
        note="One card per row with the column labels inside; there is no horizontal scroll."
      >
        <Cases label="Density" layout="column">
          {DENSITIES.map((density) => (
            <Case key={density} label={`Density ${density}`} fill>
              <TableView
                aria-label={`Costs ${density}`}
                columns={COLUMNS}
                rows={ROWS}
                density={density}
              />
            </Case>
          ))}
        </Cases>
        <Cases label="States" layout="column">
          <Case label="Sortable, sorted by Amount descending" fill>
            <SortableTable />
          </Case>
          <Case label="Multiple selection, first row selected" fill>
            <TableView
              aria-label="Costs selectable"
              columns={COLUMNS}
              rows={ROWS}
              selectionMode="multiple"
              selectAllLabel="Select all"
              defaultSelectedKeys={new Set(["1"])}
            />
          </Case>
          <Case label="Single selection" fill>
            <TableView
              aria-label="Costs single"
              columns={COLUMNS}
              rows={ROWS}
              selectionMode="single"
              defaultSelectedKeys={new Set(["2"])}
            />
          </Case>
          <Case label="Empty" fill>
            <TableView
              aria-label="No costs"
              columns={COLUMNS}
              rows={[]}
              emptyState={<IllustratedMessage icon={Inbox} heading="No costs" headingLevel={3} />}
            />
          </Case>
        </Cases>
      </Component>

      <Component name="ListView" includes={["ListViewItem"]}>
        <Cases label="Density" layout="column">
          {DENSITIES.map((density) => (
            <Case key={density} label={`Density ${density}`} fill>
              <ListView aria-label={`Ideas ${density}`} density={density}>
                <ListItems />
              </ListView>
            </Case>
          ))}
        </Cases>
        <Cases label="States" layout="column">
          <Case label="Multiple selection, first selected" fill>
            <ListView
              aria-label="Ideas multiple"
              selectionMode="multiple"
              defaultSelectedKeys={new Set([LIST[0] ?? ""])}
            >
              <ListItems />
            </ListView>
          </Case>
          <Case label="Single selection with a disabled row" fill>
            <ListView
              aria-label="Ideas single"
              selectionMode="single"
              defaultSelectedKeys={new Set([LIST[1] ?? ""])}
              disabledKeys={[LIST[2] ?? ""]}
            >
              <ListItems />
            </ListView>
          </Case>
          <Case label="Empty" fill>
            <ListView
              aria-label="No ideas"
              items={[] as { id: string }[]}
              emptyState={<IllustratedMessage icon={Inbox} heading="No ideas" headingLevel={3} />}
            >
              {(item) => (
                <ListViewItem id={item.id} textValue={item.id}>
                  {item.id}
                </ListViewItem>
              )}
            </ListView>
          </Case>
        </Cases>
      </Component>

      <Component
        name="CardView"
        note="Columns collapse to one on narrow screens."
        includes={["Card"]}
      >
        {CARD_VIEW_COLUMNS.map((columns) => (
          <Cases
            key={columns}
            label={`${columns} column${columns === 1 ? "" : "s"}`}
            layout="column"
          >
            <CardView aria-label={`Competitors ${columns}`} columns={columns}>
              {["Bakery A", "Bakery B", "Bakery C"].map((name) => (
                <Card key={name} id={name} textValue={name}>
                  {name}
                </Card>
              ))}
            </CardView>
          </Cases>
        ))}
        <Cases label="States" layout="column">
          <Case label="Multiple selection, first selected, one disabled" fill>
            <CardView
              aria-label="Competitors selectable"
              columns={3}
              selectionMode="multiple"
              defaultSelectedKeys={["a"]}
              disabledKeys={["c"]}
            >
              <Card id="a" textValue="Bakery A">
                Bakery A
              </Card>
              <Card id="b" textValue="Bakery B">
                Bakery B
              </Card>
              <Card id="c" textValue="Bakery C">
                Bakery C (disabled)
              </Card>
            </CardView>
          </Case>
          <Case label="Cards that act when pressed" fill>
            <CardView aria-label="Competitors pressable" columns={2}>
              <Card id="a" textValue="Bakery A" onAction={() => {}}>
                Bakery A
              </Card>
              <Card id="b" textValue="Bakery B" onAction={() => {}}>
                Bakery B
              </Card>
            </CardView>
          </Case>
        </Cases>
      </Component>

      <Component name="Tree" includes={["TreeItem"]}>
        <Cases layout="column">
          <Case label="Nested, first branch expanded, one item disabled" fill>
            <Tree aria-label="Template outline" defaultExpandedKeys={["s1"]} disabledKeys={["q3"]}>
              <TreeItem
                id="s1"
                textValue="Self analysis"
                title="Self analysis"
                trailing={<Badge>2</Badge>}
              >
                <TreeItem id="q1" textValue="Behavior" title="Behavior" />
                <TreeItem id="q2" textValue="Values" title="Values" />
              </TreeItem>
              <TreeItem id="s2" textValue="Validation" title="Validation">
                <TreeItem id="q3" textValue="Customers (disabled)" title="Customers (disabled)" />
              </TreeItem>
              <TreeItem id="s3" textValue="Leaf" title="Leaf section" />
            </Tree>
          </Case>
          <Case label="Selection (multiple)" fill>
            <Tree
              aria-label="Template outline selectable"
              selectionMode="multiple"
              defaultSelectedKeys={new Set(["a"])}
            >
              <TreeItem id="a" textValue="Item A" title="Item A" />
              <TreeItem id="b" textValue="Item B" title="Item B" />
            </Tree>
          </Case>
          <Case label="Empty" fill>
            <Tree
              aria-label="Empty outline"
              items={[] as { id: string }[]}
              emptyState={
                <IllustratedMessage icon={Inbox} heading="No sections" headingLevel={3} />
              }
            >
              {(item) => <TreeItem id={item.id} textValue={item.id} title={item.id} />}
            </Tree>
          </Case>
        </Cases>
      </Component>

      <Component name="Well">
        <Cases layout="column">
          <Case label="Plain" fill>
            <Well>Summary of the evidence</Well>
          </Case>
          <Case label="Named (role group)" fill>
            <Well aria-label="AI export preview">Preview of the export</Well>
          </Case>
          <Case label="Preformatted (scrolls)" fill>
            <Well aria-label="Export text" preformatted>
              {"# Idea\nBakery in Cebu\n\n## Problem\nBread is sold out by 9 am"}
            </Well>
          </Case>
        </Cases>
      </Component>

      <Component name="DiffText">
        <Cases layout="column">
          <Case label="Before">
            <DiffText side="before" segments={DIFF} />
          </Case>
          <Case label="After">
            <DiffText side="after" segments={DIFF} />
          </Case>
        </Cases>
      </Component>

      <Component
        name="RowList"
        note="A static list of rows separated by hairlines."
        includes={["RowListItem"]}
      >
        <Cases label="Unordered and ordered" layout="column">
          <Case label="Unordered" fill>
            <RowList aria-label="Checks">
              <RowListItem>Competitors (3–5)</RowListItem>
              <RowListItem>Local price range</RowListItem>
            </RowList>
          </Case>
          <Case label="Ordered" fill>
            <RowList aria-label="Next steps" ordered>
              <RowListItem>Classify answers (3)</RowListItem>
              <RowListItem>Find 3 competitors</RowListItem>
            </RowList>
          </Case>
        </Cases>
      </Component>

      <Component name="Divider">
        <Cases label="Horizontal sizes" layout="column">
          {DIVIDER_SIZES.map((size) => (
            <Case key={size} label={`Size ${size}`} fill>
              <Divider size={size} />
            </Case>
          ))}
        </Cases>
        <Cases label="Vertical sizes">
          {DIVIDER_SIZES.map((size) => (
            <Case key={size} label={`Size ${size}`}>
              <View style={styles.verticalBox}>
                <Divider size={size} orientation="vertical" />
              </View>
            </Case>
          ))}
        </Cases>
      </Component>

      <Component name="Disclosure" includes={["Accordion"]}>
        <Cases label="Disclosure" layout="column">
          <Case label="Collapsed" fill>
            <Disclosure title="Example">The example text.</Disclosure>
          </Case>
          <Case label="Expanded" fill>
            <Disclosure title="Example" defaultExpanded>
              The example text.
            </Disclosure>
          </Case>
          <Case label="Disabled" fill>
            <Disclosure title="Resolved threads" isDisabled>
              Hidden text.
            </Disclosure>
          </Case>
        </Cases>
        <Cases label="Accordion" layout="column">
          <Case label="One open at a time" fill>
            <Accordion defaultExpandedKeys={["a"]}>
              <Disclosure id="a" title="First">
                First content.
              </Disclosure>
              <Disclosure id="b" title="Second">
                Second content.
              </Disclosure>
            </Accordion>
          </Case>
          <Case label="Several open (allowsMultipleExpanded)" fill>
            <Accordion allowsMultipleExpanded defaultExpandedKeys={["a", "b"]}>
              <Disclosure id="a" title="First">
                First content.
              </Disclosure>
              <Disclosure id="b" title="Second">
                Second content.
              </Disclosure>
            </Accordion>
          </Case>
          <Case label="Disabled accordion" fill>
            <Accordion isDisabled>
              <Disclosure id="a" title="First">
                First content.
              </Disclosure>
            </Accordion>
          </Case>
        </Cases>
      </Component>

      <Component name="Tabs" includes={["TabList", "Tab", "TabPanel"]}>
        <Cases label="By size" layout="column">
          {SIZES.map((size) => (
            <Case key={size} label={`Size ${size}`} fill>
              <Tabs size={size} defaultSelectedKey="assumptions">
                <TabList aria-label={`Sections ${size}`}>
                  <Tab id="assumptions">Assumptions</Tab>
                  <Tab id="risks">Risks</Tab>
                  <Tab id="archived" isDisabled>
                    Archived
                  </Tab>
                </TabList>
                <TabPanel id="assumptions">
                  <Text>Assumptions panel</Text>
                </TabPanel>
                <TabPanel id="risks">
                  <Text>Risks panel</Text>
                </TabPanel>
                <TabPanel id="archived">
                  <Text>Archived panel</Text>
                </TabPanel>
              </Tabs>
            </Case>
          ))}
        </Cases>
      </Component>

      <Component
        name="Breadcrumbs"
        note="Draws nothing on the phone: the screen shows a back control instead. Shown for the shared vocabulary only."
        includes={["Breadcrumb"]}
      >
        <Cases layout="column">
          <Case label="Three levels (nothing is drawn)">
            <Breadcrumbs aria-label="Breadcrumbs">
              <Breadcrumb id="ideas" href="/ideas">
                Ideas
              </Breadcrumb>
              <Breadcrumb id="idea" href="/ideas/1">
                Bakery in Cebu
              </Breadcrumb>
              <Breadcrumb id="validation">Validation</Breadcrumb>
            </Breadcrumbs>
          </Case>
        </Cases>
      </Component>
    </GallerySection>
  );
}
