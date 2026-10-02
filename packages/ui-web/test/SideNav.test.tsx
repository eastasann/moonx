import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Bell, LayoutDashboard, Lightbulb, Settings } from "lucide-react";
import { SideNav, type SideNavItem } from "../src/components/SideNav";
import { expectNoAxeViolations } from "./axe";
import { mockMatchMedia } from "./matchMedia";
import { expectKeyPressedLifecycle, expectPointerPressedLifecycle } from "./pressed";

const items: SideNavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/", icon: LayoutDashboard, isCurrent: true },
  { id: "ideas", label: "Ideas", href: "/ideas", icon: Lightbulb },
  {
    id: "notifications",
    label: "Notifications",
    href: "/notifications",
    icon: Bell,
    badge: <span>3 unread</span>,
  },
];
const secondary: SideNavItem[] = [
  { id: "settings", label: "Settings", href: "/settings", icon: Settings },
];

function renderNav(props: Partial<Parameters<typeof SideNav>[0]> = {}) {
  return render(
    <SideNav
      aria-label="Main"
      items={items}
      secondaryItems={secondary}
      workspaceSwitcher={({ isCollapsed }) => (
        <button type="button">{isCollapsed ? "B" : "BCDX"}</button>
      )}
      userMenu={<button type="button">Ana</button>}
      {...props}
    />,
  );
}

describe("SideNav", () => {
  test("renders the slots and both link groups in a named navigation", () => {
    renderNav();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("link")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "BCDX" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ana" })).toBeInTheDocument();
    expect(within(nav).getByRole("separator")).toBeInTheDocument();
  });

  test("marks the current page and exposes the badge slot", () => {
    renderNav();
    const current = screen.getByRole("link", { name: "Dashboard" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current).toHaveAttribute("data-current");
    expect(screen.getByRole("link", { name: /Notifications/ })).toHaveTextContent("3 unread");
    expect(screen.getByRole("link", { name: "Ideas" })).not.toHaveAttribute("aria-current");
  });

  test("full width by default and passes collapsed state to slots", () => {
    const { container } = renderNav();
    expect(container.firstElementChild).toHaveAttribute("data-collapsed", "false");
  });

  test("isCollapsed keeps names for assistive technology and shows a tooltip on focus", async () => {
    const { container } = renderNav({ isCollapsed: true });
    expect(container.firstElementChild).toHaveAttribute("data-collapsed", "true");
    expect(screen.getByRole("button", { name: "B" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ideas" })).toBeInTheDocument();
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.getByRole("link", { name: "Ideas" })).toHaveAttribute("data-focus-visible");
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Ideas");
  });

  test("follows the tablet media query when isCollapsed is not given", () => {
    mockMatchMedia((query) => query.includes("max-width: 1023px"));
    const { container } = renderNav();
    expect(container.firstElementChild).toHaveAttribute("data-collapsed", "true");
  });

  test("links respond to hover and keyboard focus through data attributes", async () => {
    renderNav();
    const ideas = screen.getByRole("link", { name: "Ideas" });
    await userEvent.hover(ideas);
    expect(ideas).toHaveAttribute("data-hovered");
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("data-focus-visible");
  });

  test.each([false, true])(
    "a link is pressed while held and released after, by pointer and Enter (collapsed: %s)",
    async (isCollapsed) => {
      const user = userEvent.setup();
      renderNav({ isCollapsed });
      const ideas = screen.getByRole("link", { name: "Ideas" });
      await expectPointerPressedLifecycle(ideas, user);
      ideas.focus();
      await expectKeyPressedLifecycle(ideas, user, "Enter");
    },
  );

  test("a pointer click on a link does not show data-focus-visible", async () => {
    const user = userEvent.setup();
    renderNav();
    const ideas = screen.getByRole("link", { name: "Ideas" });
    await user.click(ideas);
    expect(ideas).not.toHaveAttribute("data-focus-visible");
  });

  test.each([false, true])("has no axe violations (collapsed: %s)", async (isCollapsed) => {
    const { container } = renderNav({ isCollapsed });
    await expectNoAxeViolations(container);
  });
});
