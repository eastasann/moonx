import { render, screen } from "@testing-library/react";
import { DiffText } from "../src/components/DiffText";
import { expectNoAxeViolations } from "./axe";

const segments = [
  { kind: "same", text: "Sell " },
  { kind: "removed", text: "cakes" },
  { kind: "added", text: "gift boxes" },
  { kind: "same", text: " daily" },
] as const;

test("before draws the removed run and after the added run", () => {
  const { container, rerender } = render(<DiffText segments={segments} side="before" />);
  expect(container).toHaveTextContent("Sell cakes daily");
  expect(container.querySelector("del")).toHaveTextContent("cakes");
  expect(container.querySelector("ins")).toBeNull();
  rerender(<DiffText segments={segments} side="after" />);
  expect(container).toHaveTextContent("Sell gift boxes daily");
  expect(container.querySelector("ins")).toHaveTextContent("gift boxes");
  expect(screen.queryByText("cakes")).toBeNull();
});

test("has no axe violations", async () => {
  const { container } = render(<DiffText segments={segments} side="after" />);
  await expectNoAxeViolations(container);
});
