import { render, screen } from "@testing-library/react";
import { RowList, RowListItem } from "../src/components/RowList";
import { expectNoAxeViolations } from "./axe";

test("is an unordered list by default", () => {
  render(
    <RowList aria-label="Checks">
      <RowListItem>One</RowListItem>
      <RowListItem>Two</RowListItem>
    </RowList>,
  );
  const list = screen.getByRole("list", { name: "Checks" });
  expect(list.tagName).toBe("UL");
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
});

test("numbers the rows when ordered", () => {
  render(
    <RowList aria-label="Next steps" ordered>
      <RowListItem>One</RowListItem>
    </RowList>,
  );
  expect(screen.getByRole("list", { name: "Next steps" }).tagName).toBe("OL");
});

test("has no axe violations", async () => {
  const { container } = render(
    <RowList aria-label="Checks">
      <RowListItem>One</RowListItem>
    </RowList>,
  );
  await expectNoAxeViolations(container);
});
