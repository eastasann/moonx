import { render, screen } from "@testing-library/react-native";
import { Button } from "../src/components/Button";
import { ButtonGroup } from "../src/components/ButtonGroup";

/** Containers are not accessible elements (that would hide their children), so find them by role prop. */
const hostsWithRole = (role: string) =>
  screen.UNSAFE_root.findAll((node) => node.props.role === role && typeof node.type === "string");

test("is a named group holding its buttons", () => {
  render(
    <ButtonGroup aria-label="Decision">
      <Button>Cancel</Button>
      <Button>Save</Button>
    </ButtonGroup>,
  );
  expect(hostsWithRole("group")[0]?.props["aria-label"]).toBe("Decision");
  expect(screen.getAllByRole("button")).toHaveLength(2);
});

test.each([
  ["horizontal", "start", { flexDirection: "row", justifyContent: "flex-start" }],
  ["horizontal", "center", { flexDirection: "row", justifyContent: "center" }],
  ["horizontal", "end", { flexDirection: "row", justifyContent: "flex-end" }],
  ["vertical", "start", { flexDirection: "column", alignItems: "flex-start" }],
  ["vertical", "center", { flexDirection: "column", alignItems: "center" }],
  ["vertical", "end", { flexDirection: "column", alignItems: "flex-end" }],
] as const)("%s orientation aligned to %s", (orientation, align, expected) => {
  render(
    <ButtonGroup orientation={orientation} align={align} aria-label="g">
      <Button>One</Button>
    </ButtonGroup>,
  );
  expect(hostsWithRole("group")[0]?.props.style).toMatchObject(expected);
});

test("defaults to a horizontal group starting at the left with a gap", () => {
  render(
    <ButtonGroup aria-label="g">
      <Button>One</Button>
    </ButtonGroup>,
  );
  expect(hostsWithRole("group")[0]?.props.style).toMatchObject({
    flexDirection: "row",
    justifyContent: "flex-start",
    flexWrap: "wrap",
  });
  expect(hostsWithRole("group")[0]?.props.style.gap).toBeGreaterThan(0);
});
