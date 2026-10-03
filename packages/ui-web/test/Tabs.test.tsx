import { COMPONENT_SIZES } from "@moonx/ui-tokens";
import { User } from "@react-aria/test-utils";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Tab, TabList, TabPanel, Tabs } from "../src/components/Tabs";
import { expectNoAxeViolations } from "./axe";

function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at ${index}`);
  return item;
}

function Example(props: Partial<React.ComponentProps<typeof Tabs>>) {
  return (
    <Tabs {...props}>
      <TabList aria-label="Sections">
        <Tab id="assumptions">Assumptions</Tab>
        <Tab id="risks">Risks</Tab>
        <Tab id="locked" isDisabled>
          Locked
        </Tab>
      </TabList>
      <TabPanel id="assumptions">Assumption list</TabPanel>
      <TabPanel id="risks">Risk list</TabPanel>
      <TabPanel id="locked">Locked content</TabPanel>
    </Tabs>
  );
}

test("renders every size with a tablist and one panel", () => {
  for (const size of COMPONENT_SIZES) {
    const { unmount } = render(<Example size={size} />);
    expect(screen.getByRole("tablist", { name: "Sections" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Assumption list");
    unmount();
  }
});

test("keyboard: arrows move between tabs and select them, skipping disabled ones", async () => {
  render(<Example />);
  await userEvent.tab();
  const tabs = screen.getAllByRole("tab");
  const assumptions = nth(tabs, 0);
  const risks = nth(tabs, 1);
  expect(assumptions).toHaveFocus();
  await userEvent.keyboard("{ArrowRight}");
  expect(risks).toHaveFocus();
  expect(risks).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tabpanel")).toHaveTextContent("Risk list");
  await userEvent.keyboard("{ArrowRight}");
  expect(assumptions).toHaveFocus();
});

test("selecting through the test util changes the panel", async () => {
  render(<Example />);
  const tester = new User({ interactionType: "mouse" }).createTester("Tabs", {
    root: screen.getByRole("tablist").parentElement as HTMLElement,
  });
  await tester.triggerTab({ tab: "Risks" });
  expect(tester.getSelectedTab()).toHaveTextContent("Risks");
  expect(tester.getActiveTabpanel()).toHaveTextContent("Risk list");
});

test("selected, hovered, focus-visible and disabled tabs set data attributes", async () => {
  render(<Example />);
  const tabs = screen.getAllByRole("tab");
  const assumptions = nth(tabs, 0);
  const risks = nth(tabs, 1);
  const locked = nth(tabs, 2);
  expect(assumptions).toHaveAttribute("data-selected");
  expect(locked).toHaveAttribute("data-disabled");
  await userEvent.hover(risks);
  expect(risks).toHaveAttribute("data-hovered");
  await userEvent.tab();
  expect(assumptions).toHaveAttribute("data-focus-visible");
});

test("supports a controlled selection", async () => {
  const onSelectionChange = vi.fn();
  render(<Example selectedKey="assumptions" onSelectionChange={onSelectionChange} />);
  await userEvent.click(screen.getByRole("tab", { name: "Risks" }));
  expect(onSelectionChange).toHaveBeenCalledWith("risks");
  expect(screen.getByRole("tabpanel")).toHaveTextContent("Assumption list");
});

test("has no axe violations", async () => {
  const { container } = render(<Example />);
  await expectNoAxeViolations(container);
});

test("a single panel whose id follows the selected tab stays the target of aria-controls", async () => {
  function Follower() {
    const [tab, setTab] = useState("assumptions");
    return (
      <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(String(key))}>
        <TabList aria-label="Sections">
          <Tab id="assumptions">Assumptions</Tab>
          <Tab id="risks">Risks</Tab>
        </TabList>
        <TabPanel id={tab}>{tab} list</TabPanel>
      </Tabs>
    );
  }
  render(<Follower />);
  await userEvent.click(screen.getByRole("tab", { name: "Risks" }));
  const controlled = screen.getByRole("tab", { name: "Risks" }).getAttribute("aria-controls");
  expect(controlled).toBe(screen.getByRole("tabpanel").id);
});
