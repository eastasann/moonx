import { render, screen } from "@testing-library/react";
import { Steps } from "../src/components/Steps";
import { expectNoAxeViolations } from "./axe";

const items = [
  { id: "invite", label: "Invitation" },
  { id: "profile", label: "Profile" },
  { id: "done", label: "Done" },
];

test("marks the current step and the finished ones", () => {
  render(<Steps aria-label="Progress" items={items} current="profile" />);
  const [invite, profile, done] = screen.getAllByRole("listitem");
  expect(invite).toHaveAttribute("data-status", "done");
  expect(profile).toHaveAttribute("data-status", "current");
  expect(profile).toHaveAttribute("aria-current", "step");
  expect(done).toHaveAttribute("data-status", "upcoming");
  expect(done).not.toHaveAttribute("aria-current");
});

test("is a named navigation", () => {
  render(<Steps aria-label="Progress" items={items} current="invite" />);
  expect(screen.getByRole("navigation", { name: "Progress" })).toBeInTheDocument();
});

test("has no axe violations", async () => {
  const { container } = render(<Steps aria-label="Progress" items={items} current="done" />);
  await expectNoAxeViolations(container);
});

test("says a finished step is completed to screen readers, and only a finished one", () => {
  render(<Steps aria-label="Progress" items={items} current="profile" doneLabel="completed" />);
  const [invite, profile, done] = screen.getAllByRole("listitem");
  expect(invite).toHaveTextContent("Invitation, completed");
  expect(profile).not.toHaveTextContent("completed");
  expect(done).not.toHaveTextContent("completed");
});
