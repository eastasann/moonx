import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tree, TreeItem } from "../src/components/Tree";
import { expectNoAxeViolations } from "./axe";
import { expectPressedLifecycle } from "./pressed";

function Outline(props: { defaultExpandedKeys?: string[]; onAction?: (k: unknown) => void }) {
  return (
    <Tree aria-label="Template outline" selectionMode="single" {...props}>
      <TreeItem id="s1" textValue="01 Customer" title="01 Customer" trailing="3">
        <TreeItem id="q1" textValue="WHO" title="WHO" />
        <TreeItem id="q2" textValue="WHY THEM" title="WHY THEM" />
      </TreeItem>
      <TreeItem id="s2" textValue="02 Offer" title="02 Offer">
        <TreeItem id="q3" textValue="CATEGORY" title="CATEGORY" />
      </TreeItem>
      <TreeItem id="s3" textValue="Disabled" title="Disabled" isDisabled />
    </Tree>
  );
}

describe("Tree", () => {
  test("renders a tree with its top-level nodes and the trailing slot", () => {
    render(<Outline />);
    expect(screen.getByRole("treegrid", { name: "Template outline" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  test("a node with children has an expand control and leaves do not", () => {
    render(<Outline />);
    const rows = screen.getAllByRole("row");
    expect(rows[0]).toHaveAttribute("aria-expanded", "false");
    expect(rows[2]).not.toHaveAttribute("aria-expanded");
  });

  test.each([
    ["false", false],
    ["an empty array", []],
    ["null", null],
  ])("a node whose children are %s is a leaf", (_name, children) => {
    render(
      <Tree aria-label="Outline">
        <TreeItem id="a" textValue="A" title="A">
          {children}
        </TreeItem>
      </Tree>,
    );
    expect(screen.getByRole("row")).not.toHaveAttribute("aria-expanded");
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("clicking the chevron expands and collapses", async () => {
    render(<Outline />);
    const [first] = screen.getAllByRole("row");
    const chevron = screen.getAllByRole("button")[0] as HTMLElement;
    await userEvent.click(chevron);
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("row", { name: "WHO" })).toBeInTheDocument();
    await userEvent.click(chevron);
    expect(first).toHaveAttribute("aria-expanded", "false");
  });

  test("arrow keys expand, collapse and move through nodes", async () => {
    render(<Outline />);
    await userEvent.tab();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getAllByRole("row")[0]).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("row", { name: "WHO" })).toHaveAttribute("data-focus-visible");
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getAllByRole("row")[0]).toHaveAttribute("data-focus-visible");
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getAllByRole("row")[0]).toHaveAttribute("aria-expanded", "false");
  });

  test("selection marks the row and disabled rows ignore it", async () => {
    render(<Outline />);
    await userEvent.click(screen.getByRole("row", { name: "02 Offer" }));
    expect(screen.getByRole("row", { name: "02 Offer" })).toHaveAttribute("data-selected");
    const disabled = screen.getByRole("row", { name: "Disabled" });
    expect(disabled).toHaveAttribute("data-disabled");
    await userEvent.click(disabled);
    expect(disabled).not.toHaveAttribute("data-selected");
  });

  test("hover is reflected as a data attribute", async () => {
    render(<Outline />);
    const row = screen.getByRole("row", { name: "02 Offer" });
    await userEvent.hover(row);
    expect(row).toHaveAttribute("data-hovered");
  });

  test("a row is pressed while held and released after, by pointer and keyboard", async () => {
    const user = userEvent.setup();
    render(<Outline />);
    await expectPressedLifecycle(screen.getByRole("row", { name: "02 Offer" }), user);
  });

  test("a disabled row is never pressed", async () => {
    const user = userEvent.setup();
    render(<Outline />);
    const disabled = screen.getByRole("row", { name: "Disabled" });
    await user.pointer({ keys: "[MouseLeft>]", target: disabled });
    expect(disabled).not.toHaveAttribute("data-pressed");
    await user.pointer({ keys: "[/MouseLeft]" });
  });

  test("a pointer click does not show data-focus-visible", async () => {
    const user = userEvent.setup();
    render(<Outline />);
    const row = screen.getByRole("row", { name: "02 Offer" });
    await user.click(row);
    expect(row).toHaveFocus();
    expect(row).not.toHaveAttribute("data-focus-visible");
  });

  test("shows the empty state", () => {
    render(
      <Tree aria-label="Outline" emptyState="No sections">
        {[]}
      </Tree>,
    );
    expect(screen.getByText("No sections")).toBeInTheDocument();
  });

  test("has no axe violations", async () => {
    const { container } = render(<Outline defaultExpandedKeys={["s1"]} />);
    await expectNoAxeViolations(container);
  });
});
