import { render, screen } from "@testing-library/react";
import { Well } from "../src/components/Well";
import { expectNoAxeViolations } from "./axe";

test("renders its content", () => {
  render(<Well>Summary</Well>);
  expect(screen.getByText("Summary")).toBeInTheDocument();
  expect(screen.queryByRole("group")).toBeNull();
});

test("becomes a named group with aria-label", () => {
  render(<Well aria-label="Basis for the decision">Summary</Well>);
  expect(screen.getByRole("group", { name: "Basis for the decision" })).toBeInTheDocument();
});

test("becomes a named group with aria-labelledby", () => {
  render(
    <>
      <h2 id="h">Export preview</h2>
      <Well aria-labelledby="h">Text</Well>
    </>,
  );
  expect(screen.getByRole("group", { name: "Export preview" })).toBeInTheDocument();
});

test("has no axe violations", async () => {
  const { container } = render(<Well aria-label="Summary">Text</Well>);
  await expectNoAxeViolations(container);
});
