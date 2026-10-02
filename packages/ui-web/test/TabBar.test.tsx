import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Bell, Compass, House, Lightbulb, Menu } from "lucide-react";
import { TabBar, type TabBarItem } from "../src/components/TabBar";
import { expectNoAxeViolations } from "./axe";
import {
  expectKeyPressedLifecycle,
  expectPointerPressedLifecycle,
  expectPressedLifecycle,
} from "./pressed";

function makeItems(onMore = () => {}, isExpanded?: boolean): TabBarItem[] {
  return [
    { id: "dashboard", label: "Dashboard", href: "/", icon: House, isCurrent: true },
    { id: "ideas", label: "Ideas", href: "/ideas", icon: Lightbulb },
    { id: "self", label: "Self Analysis", href: "/self-analysis", icon: Compass },
    {
      id: "notifications",
      label: "Notifications",
      href: "/notifications",
      icon: Bell,
      badge: <span>3 unread</span>,
    },
    { id: "more", label: "More", icon: Menu, onPress: onMore, isExpanded },
  ];
}

describe("TabBar", () => {
  test("renders five tabs in a named navigation", () => {
    render(<TabBar aria-label="Main" items={makeItems()} />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("listitem")).toHaveLength(5);
    expect(within(nav).getAllByRole("link")).toHaveLength(4);
    expect(within(nav).getByRole("button", { name: "More" })).toBeInTheDocument();
  });

  test("marks the current tab and renders the badge slot", () => {
    render(<TabBar aria-label="Main" items={makeItems()} />);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("data-current");
    expect(screen.getByRole("link", { name: /Notifications/ })).toHaveTextContent("3 unread");
  });

  test("the More tab runs its handler from a click and the keyboard", async () => {
    const onMore = vi.fn();
    render(<TabBar aria-label="Main" items={makeItems(onMore)} />);
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    expect(onMore).toHaveBeenCalledTimes(1);
    screen.getByRole("button", { name: "More" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(onMore).toHaveBeenCalledTimes(2);
  });

  test("reports the tray state on the More tab only when it is given", () => {
    const { rerender } = render(<TabBar aria-label="Main" items={makeItems()} />);
    expect(screen.getByRole("button", { name: "More" })).not.toHaveAttribute("aria-expanded");
    rerender(<TabBar aria-label="Main" items={makeItems(() => {}, true)} />);
    expect(screen.getByRole("button", { name: "More" })).toHaveAttribute("aria-expanded", "true");
  });

  test("tabs expose hover and keyboard focus through data attributes", async () => {
    render(<TabBar aria-label="Main" items={makeItems()} />);
    const ideas = screen.getByRole("link", { name: "Ideas" });
    await userEvent.hover(ideas);
    expect(ideas).toHaveAttribute("data-hovered");
    await userEvent.tab();
    await userEvent.tab();
    expect(ideas).toHaveAttribute("data-focus-visible");
  });

  test("a link tab is pressed while held and released after, by pointer and Enter", async () => {
    const user = userEvent.setup();
    render(<TabBar aria-label="Main" items={makeItems()} />);
    const ideas = screen.getByRole("link", { name: "Ideas" });
    await expectPointerPressedLifecycle(ideas, user);
    ideas.focus();
    await expectKeyPressedLifecycle(ideas, user, "Enter");
  });

  test("the More tab is pressed while held and released after, by pointer and keyboard", async () => {
    const user = userEvent.setup();
    render(<TabBar aria-label="Main" items={makeItems()} />);
    await expectPressedLifecycle(screen.getByRole("button", { name: "More" }), user);
  });

  test("the More tab shows hover and keyboard focus, and a click does not show focus-visible", async () => {
    const user = userEvent.setup();
    render(<TabBar aria-label="Main" items={makeItems()} />);
    const more = screen.getByRole("button", { name: "More" });
    await user.hover(more);
    expect(more).toHaveAttribute("data-hovered");
    await user.unhover(more);
    expect(more).not.toHaveAttribute("data-hovered");
    await user.click(more);
    expect(more).toHaveFocus();
    expect(more).not.toHaveAttribute("data-focus-visible");
    await user.tab({ shift: true });
    await user.tab();
    expect(more).toHaveAttribute("data-focus-visible");
  });

  test("has no axe violations", async () => {
    const { container } = render(<TabBar aria-label="Main" items={makeItems()} />);
    await expectNoAxeViolations(container);
  });
});
