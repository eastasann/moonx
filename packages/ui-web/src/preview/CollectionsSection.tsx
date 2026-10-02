/** Gallery section: tables, lists, cards, trees, disclosure, tabs and the other containers. */
import { CARD_VIEW_COLUMNS, DENSITIES, DIVIDER_SIZES } from "@moonx/ui-tokens";
import { Inbox } from "lucide-react";
import { useState } from "react";
import type { SortDescriptor } from "react-aria-components";
import { Badge } from "../components/Badge";
import { Breadcrumb, Breadcrumbs } from "../components/Breadcrumbs";
import { Card } from "../components/Card";
import { CardView } from "../components/CardView";
import { Accordion, Disclosure } from "../components/Disclosure";
import { Divider } from "../components/Divider";
import { IllustratedMessage } from "../components/IllustratedMessage";
import { ListView, ListViewItem } from "../components/ListView";
import { TableView, type TableViewColumn, type TableViewRow } from "../components/TableView";
import { Tab, TabList, TabPanel, Tabs } from "../components/Tabs";
import { Tree, TreeItem } from "../components/Tree";
import { Well } from "../components/Well";
import { bySize, Case, Cases, Component, GallerySection } from "./parts";
import { verticalBox, widthFull } from "./preview.css";

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
    />
  );
}

const LIST = ["Bakery in Cebu", "Coffee cart", "Surf school"];

export function CollectionsSection() {
  return (
    <GallerySection id="collections" title="Collections and containers">
      <Component name="TableView">
        <Cases label="Density" layout="column">
          {DENSITIES.map((density) => (
            <Case key={density} label={`Density ${density}`} scrollX>
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
          <Case label="Sortable, sorted by Amount descending" scrollX>
            <SortableTable />
          </Case>
          <Case label="Multiple selection, first row selected" scrollX>
            <TableView
              aria-label="Costs selectable"
              columns={COLUMNS}
              rows={ROWS}
              selectionMode="multiple"
              defaultSelectedKeys={new Set(["1"])}
            />
          </Case>
          <Case label="Single selection" scrollX>
            <TableView
              aria-label="Costs single"
              columns={COLUMNS}
              rows={ROWS}
              selectionMode="single"
              defaultSelectedKeys={new Set(["2"])}
            />
          </Case>
          <Case label="Cards layout (below the tablet width)">
            <TableView aria-label="Costs as cards" columns={COLUMNS} rows={ROWS} layout="cards" />
          </Case>
          <Case label="Cards layout with selection">
            <TableView
              aria-label="Costs as selectable cards"
              columns={COLUMNS}
              rows={ROWS}
              layout="cards"
              selectionMode="multiple"
            />
          </Case>
          <Case label="Empty" scrollX>
            <TableView
              aria-label="No costs"
              columns={COLUMNS}
              rows={[]}
              emptyState={<IllustratedMessage icon={Inbox} heading="No costs" headingLevel={3} />}
            />
          </Case>
        </Cases>
      </Component>

      <Component name="ListView">
        <Cases label="Density" layout="column">
          {DENSITIES.map((density) => (
            <Case key={density} label={`Density ${density}`}>
              <ListView aria-label={`Ideas ${density}`} density={density}>
                {LIST.map((name) => (
                  <ListViewItem key={name} id={name} textValue={name}>
                    {name}
                  </ListViewItem>
                ))}
              </ListView>
            </Case>
          ))}
        </Cases>
        <Cases label="States" layout="column">
          <Case label="Multiple selection, first selected">
            <ListView
              aria-label="Ideas multiple"
              selectionMode="multiple"
              defaultSelectedKeys={[LIST[0] ?? ""]}
            >
              {LIST.map((name) => (
                <ListViewItem key={name} id={name} textValue={name}>
                  {name}
                </ListViewItem>
              ))}
            </ListView>
          </Case>
          <Case label="Single selection with a disabled row">
            <ListView
              aria-label="Ideas single"
              selectionMode="single"
              defaultSelectedKeys={[LIST[1] ?? ""]}
              disabledKeys={[LIST[2] ?? ""]}
            >
              {LIST.map((name) => (
                <ListViewItem key={name} id={name} textValue={name}>
                  {name}
                </ListViewItem>
              ))}
            </ListView>
          </Case>
          <Case label="Empty">
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

      <Component name="CardView and Card" note="Columns collapse to one on narrow screens.">
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
          <Case label="Multiple selection, first selected, one disabled">
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
          <Case label="Cards as links">
            <CardView aria-label="Competitors linked" columns={2}>
              <Card id="a" textValue="Bakery A" href="#collections">
                Bakery A
              </Card>
              <Card id="b" textValue="Bakery B" href="#collections">
                Bakery B
              </Card>
            </CardView>
          </Case>
        </Cases>
      </Component>

      <Component name="Tree">
        <Cases layout="column">
          <Case label="Nested, first branch expanded, one item disabled">
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
          <Case label="Selection (multiple)">
            <Tree
              aria-label="Template outline selectable"
              selectionMode="multiple"
              defaultSelectedKeys={["a"]}
            >
              <TreeItem id="a" textValue="Item A" title="Item A" />
              <TreeItem id="b" textValue="Item B" title="Item B" />
            </Tree>
          </Case>
          <Case label="Empty">
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
        <Cases>
          <Case label="Plain">
            <Well>Summary of the evidence</Well>
          </Case>
          <Case label="Named (role group)">
            <Well aria-label="AI export preview">Preview of the export</Well>
          </Case>
        </Cases>
      </Component>

      <Component name="Divider">
        <Cases label="Horizontal sizes" layout="column">
          {DIVIDER_SIZES.map((size) => (
            <Case key={size} label={`Size ${size}`}>
              <Divider size={size} />
            </Case>
          ))}
        </Cases>
        <Cases label="Vertical sizes">
          {DIVIDER_SIZES.map((size) => (
            <Case key={size} label={`Size ${size}`}>
              <div className={verticalBox}>
                <Divider size={size} orientation="vertical" />
              </div>
            </Case>
          ))}
        </Cases>
      </Component>

      <Component name="Disclosure and Accordion">
        <Cases label="Disclosure" layout="column">
          <Case label="Collapsed">
            <Disclosure title="Example">The example text.</Disclosure>
          </Case>
          <Case label="Expanded">
            <Disclosure title="Example" defaultExpanded>
              The example text.
            </Disclosure>
          </Case>
          <Case label="Disabled">
            <Disclosure title="Resolved threads" isDisabled>
              Hidden text.
            </Disclosure>
          </Case>
        </Cases>
        <Cases label="Accordion" layout="column">
          <Case label="One open at a time">
            <Accordion defaultExpandedKeys={["a"]}>
              <Disclosure id="a" title="First">
                First content.
              </Disclosure>
              <Disclosure id="b" title="Second">
                Second content.
              </Disclosure>
            </Accordion>
          </Case>
          <Case label="Several open (allowsMultipleExpanded)">
            <Accordion allowsMultipleExpanded defaultExpandedKeys={["a", "b"]}>
              <Disclosure id="a" title="First">
                First content.
              </Disclosure>
              <Disclosure id="b" title="Second">
                Second content.
              </Disclosure>
            </Accordion>
          </Case>
          <Case label="Disabled accordion">
            <Accordion isDisabled>
              <Disclosure id="a" title="First">
                First content.
              </Disclosure>
            </Accordion>
          </Case>
        </Cases>
      </Component>

      <Component name="Tabs">
        <Cases label="By size" layout="column">
          {bySize((size) => (
            <div className={widthFull}>
              <Tabs size={size} defaultSelectedKey="assumptions">
                <TabList aria-label={`Sections ${size}`}>
                  <Tab id="assumptions">Assumptions</Tab>
                  <Tab id="risks">Risks</Tab>
                  <Tab id="archived" isDisabled>
                    Archived
                  </Tab>
                </TabList>
                <TabPanel id="assumptions">Assumptions panel</TabPanel>
                <TabPanel id="risks">Risks panel</TabPanel>
                <TabPanel id="archived">Archived panel</TabPanel>
              </Tabs>
            </div>
          ))}
        </Cases>
      </Component>

      <Component name="Breadcrumbs" note="The last item is the current page and is not a link.">
        <Cases layout="column">
          <Case label="Three levels">
            <Breadcrumbs aria-label="Breadcrumbs">
              <Breadcrumb id="ideas" href="#collections">
                Ideas
              </Breadcrumb>
              <Breadcrumb id="idea" href="#collections">
                Bakery in Cebu
              </Breadcrumb>
              <Breadcrumb id="validation">Validation</Breadcrumb>
            </Breadcrumbs>
          </Case>
          <Case label="One level">
            <Breadcrumbs aria-label="Breadcrumbs one level">
              <Breadcrumb id="ideas">Ideas</Breadcrumb>
            </Breadcrumbs>
          </Case>
        </Cases>
      </Component>
    </GallerySection>
  );
}
