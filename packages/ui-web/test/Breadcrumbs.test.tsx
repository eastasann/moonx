import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Breadcrumb, Breadcrumbs } from "../src/components/Breadcrumbs";
import { expectNoAxeViolations } from "./axe";

function Example({ onAction }: { onAction?: (key: React.Key) => void }) {
  return (
    <Breadcrumbs aria-label="Breadcrumbs" onAction={onAction}>
      <Breadcrumb id="ideas" href="/ideas">
        Ideas
      </Breadcrumb>
      <Breadcrumb id="cafe" href="/ideas/cafe">
        Cafe
      </Breadcrumb>
      <Breadcrumb id="validation">Validation</Breadcrumb>
    </Breadcrumbs>
  );
}

test("renders a named list with links and the current page", () => {
  render(<Example />);
  expect(screen.getByRole("list", { name: "Breadcrumbs" })).toBeInTheDocument();
  expect(screen.getAllByRole("listitem")).toHaveLength(3);
  expect(screen.getByRole("link", { name: "Ideas" })).toHaveAttribute("href", "/ideas");
  expect(screen.getByRole("link", { name: "Cafe" })).toHaveAttribute("href", "/ideas/cafe");
  expect(screen.getByText("Validation")).toHaveAttribute("aria-current", "page");
});

test("separators are icons hidden from assistive technology and absent after the last item", () => {
  const { container } = render(<Example />);
  const separators = container.querySelectorAll("svg[aria-hidden=true]");
  expect(separators).toHaveLength(2);
});

test("keyboard: Tab reaches links and Enter activates", async () => {
  const onAction = vi.fn();
  render(<Example onAction={onAction} />);
  await userEvent.tab();
  expect(screen.getByRole("link", { name: "Ideas" })).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  expect(onAction).toHaveBeenCalledWith("ideas");
  await userEvent.tab();
  expect(screen.getByRole("link", { name: "Cafe" })).toHaveFocus();
});

test("hover and focus-visible set data attributes", async () => {
  render(<Example />);
  const link = screen.getByRole("link", { name: "Ideas" });
  await userEvent.hover(link);
  expect(link).toHaveAttribute("data-hovered");
  await userEvent.tab();
  expect(link).toHaveAttribute("data-focus-visible");
});

test("has no axe violations", async () => {
  const { container } = render(<Example />);
  await expectNoAxeViolations(container);
});
