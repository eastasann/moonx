import { render, screen, within } from "@testing-library/react-native";
import { Text } from "react-native";
import { Link } from "../src/components/Link";
import { RowList, RowListItem } from "../src/components/RowList";

const tree = () =>
  screen.toJSON() as unknown as {
    props: { role: string; "aria-label": string };
    children: unknown[];
  };

test("a named list of rows", () => {
  render(
    <RowList aria-label="Next steps">
      <RowListItem>Talk to five customers</RowListItem>
      <RowListItem>Price the box</RowListItem>
    </RowList>,
  );
  expect(tree().props.role).toBe("list");
  expect(tree().props["aria-label"]).toBe("Next steps");
  expect(screen.getByText("Talk to five customers")).toBeTruthy();
  expect(screen.getByText("Price the box")).toBeTruthy();
});

test("unordered rows have no numbers", () => {
  render(
    <RowList aria-label="Summary">
      <RowListItem>One</RowListItem>
      <RowListItem>Two</RowListItem>
    </RowList>,
  );
  expect(screen.queryByText("1.")).toBeNull();
});

test("ordered rows are numbered from 1", () => {
  render(
    <RowList aria-label="Next steps" ordered>
      <RowListItem>One</RowListItem>
      <RowListItem>Two</RowListItem>
      <RowListItem>Three</RowListItem>
    </RowList>,
  );
  expect(screen.getByText("1.")).toBeTruthy();
  expect(screen.getByText("2.")).toBeTruthy();
  expect(screen.getByText("3.")).toBeTruthy();
});

test("a hairline separates rows but not above the first", () => {
  render(
    <RowList aria-label="Summary">
      <RowListItem>One</RowListItem>
      <RowListItem>Two</RowListItem>
    </RowList>,
  );
  const items = (
    tree().children as { props: { role: string; style: { borderTopWidth: number } } }[]
  ).filter((child) => child.props.role === "listitem");
  expect(items).toHaveLength(2);
  expect(items[0]?.props.style.borderTopWidth).toBe(0);
  expect(items[1]?.props.style.borderTopWidth).toBeGreaterThan(0);
});

test("a row can hold a pressable link and other nodes", () => {
  render(
    <RowList aria-label="Checks">
      <RowListItem>
        <Link>Edit in validation</Link>
      </RowListItem>
      <RowListItem>
        <Text>Custom</Text>
      </RowListItem>
    </RowList>,
  );
  expect(within(screen.root).getByRole("link", { name: "Edit in validation" })).toBeTruthy();
  expect(screen.getByText("Custom")).toBeTruthy();
});
