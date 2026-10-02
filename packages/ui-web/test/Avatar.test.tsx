import { render, screen } from "@testing-library/react";
import { Avatar, initialsOf } from "../src/components/Avatar";
import { expectNoAxeViolations } from "./axe";

test("is an image named by the full name, showing initials", () => {
  render(<Avatar name="Maria Santos" />);
  const avatar = screen.getByRole("img", { name: "Maria Santos" });
  expect(avatar).toHaveTextContent("MS");
});

test("renders both sizes", () => {
  for (const size of ["S", "M"] as const) {
    const { unmount } = render(<Avatar name={`Name ${size}`} size={size} />);
    expect(screen.getByRole("img")).toBeInTheDocument();
    unmount();
  }
});

test("initials use at most two words and survive non-latin names", () => {
  expect(initialsOf("juan")).toBe("J");
  expect(initialsOf("  juan  dela  cruz ")).toBe("JD");
  expect(initialsOf("山田 太郎")).toBe("山太");
  expect(initialsOf("")).toBe("");
});

test("has no axe violations", async () => {
  const { container } = render(<Avatar name="Maria Santos" />);
  await expectNoAxeViolations(container);
});
