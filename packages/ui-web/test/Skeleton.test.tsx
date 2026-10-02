import { render } from "@testing-library/react";
import { Skeleton } from "../src/components/Skeleton";
import { expectNoAxeViolations } from "./axe";

test("renders every shape hidden from assistive technology", () => {
  for (const shape of ["text", "block", "circle"] as const) {
    const { container, unmount } = render(<Skeleton shape={shape} />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    unmount();
  }
});

test("takes width and height as space tokens", () => {
  const { container } = render(<Skeleton shape="block" width="space-1000" height="space-800" />);
  const el = container.firstElementChild as HTMLElement;
  expect(el.style.width).toContain("var(");
  expect(el.style.height).toContain("var(");
});

test("a circle ignores width and height", () => {
  const { container } = render(<Skeleton shape="circle" width="space-1000" height="space-800" />);
  const el = container.firstElementChild as HTMLElement;
  expect(el.style.width).toBe("");
  expect(el.style.height).toBe("");
});

test("has no axe violations", async () => {
  const { container } = render(
    <div aria-busy="true">
      <Skeleton />
      <Skeleton shape="block" height="space-800" />
    </div>,
  );
  await expectNoAxeViolations(container);
});
