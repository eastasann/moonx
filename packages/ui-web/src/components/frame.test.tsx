import { i18n } from "@moonx/i18n";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Bell, Lightbulb, ScrollText } from "lucide-react";
import { describe, expect, test, vi } from "vitest";
import { QuestionFormPattern } from "../patterns/QuestionFormPattern";
import { setPhoneWidth, settle } from "../test/helpers";
import { AppFrame, type AppFrameProps } from "./AppFrame";
import { Breadcrumb, Breadcrumbs } from "./Breadcrumbs";
import { Link } from "./Link";
import { MenuItem } from "./Menu";
import { PageFrame } from "./PageFrame";
import { RouterProvider } from "./RouterProvider";
import { type NavItem, SideNav } from "./SideNav";
import { TabBar } from "./TabBar";

const follows = (first: Element, second: Element) =>
  Boolean(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
  );

// The app's frame (design-spec 4.5・6.0.1): SideNav, TabBar, AppFrame, PageFrame and
// RouterProvider. Their places at each width are checked in e2e/components.spec.ts.

const pages: NavItem[] = [
  { id: "ideas", label: "Ideas", icon: <Lightbulb />, href: "/w/1/ideas" },
  {
    id: "notifications",
    label: "Notifications",
    icon: <Bell />,
    href: "/notifications",
    badge: 3,
  },
];
const decisions: NavItem = {
  id: "decisions",
  label: "Decision Log",
  icon: <ScrollText />,
  href: "/w/1/decisions",
};

describe("RouterProvider", () => {
  test("a link's href goes to the router, not to the browser", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    render(
      <RouterProvider navigate={navigate}>
        <Link href="/w/1/ideas">Ideas</Link>
      </RouterProvider>,
    );
    await user.click(screen.getByRole("link", { name: "Ideas" }));
    expect(navigate).toHaveBeenCalledWith("/w/1/ideas", undefined);
  });

  test("the header's ← goes to the router", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    setPhoneWidth();
    render(
      <RouterProvider navigate={navigate}>
        <AppFrame
          sideNav={null}
          tabBar={null}
          back={{ href: "/w/1/ideas/2", label: "Validation" }}
        >
          <p>Body</p>
        </AppFrame>
      </RouterProvider>,
    );
    await user.click(screen.getByRole("link", { name: "Back to Validation" }));
    expect(navigate).toHaveBeenLastCalledWith("/w/1/ideas/2", undefined);
  });

  test("a Breadcrumb's link goes to the router", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    render(
      <RouterProvider navigate={navigate}>
        <Breadcrumbs>
          <Breadcrumb href="/w/1/ideas">Ideas</Breadcrumb>
          <Breadcrumb>05 Costs</Breadcrumb>
        </Breadcrumbs>
      </RouterProvider>,
    );
    await user.click(screen.getByRole("link", { name: "Ideas" }));
    expect(navigate).toHaveBeenLastCalledWith("/w/1/ideas", undefined);
  });

  test("useHref turns the href into the link's URL", () => {
    render(
      <RouterProvider navigate={() => {}} useHref={(href) => `/app${href}`}>
        <Link href="/w/1">Dashboard</Link>
      </RouterProvider>,
    );
    expect(
      screen.getByRole("link", { name: "Dashboard" }).getAttribute("href"),
    ).toBe("/app/w/1");
  });
});

describe("SideNav", () => {
  const sideNav = (onWorkspacePress = vi.fn()) =>
    render(
      <SideNav
        workspaceName="BCDX"
        onWorkspacePress={onWorkspacePress}
        items={[...pages, decisions]}
        secondaryItems={[
          {
            id: "settings",
            label: "Settings",
            icon: <Bell />,
            href: "/w/1/settings",
          },
        ]}
        currentId="ideas"
        user={{ name: "Ana Reyes" }}
        userMenu={
          <>
            <MenuItem id="account" href="/account">
              Account
            </MenuItem>
            <MenuItem id="logout">Log out</MenuItem>
          </>
        }
      />,
    );

  test("the pages are links; the current one is marked; a count is in the name", () => {
    sideNav();
    const nav = screen.getByRole("navigation", { name: "Main" });
    const ideas = within(nav).getByRole("link", { name: "Ideas" });
    expect(ideas.getAttribute("aria-current")).toBe("page");
    expect(ideas.getAttribute("href")).toBe("/w/1/ideas");
    const notifications = within(nav).getByRole("link", {
      name: "Notifications, 3 unread",
    });
    expect(notifications.hasAttribute("aria-current")).toBe(false);
    expect(within(notifications).getByText("3")).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Settings" })).toBeTruthy();
    // The two groups: pages, then settings after a rule.
    expect(within(nav).getAllByRole("list")).toHaveLength(2);
    expect(within(nav).getByRole("separator")).toBeTruthy();
  });

  test("the workspace opens M7; the account opens its menu", async () => {
    const user = userEvent.setup();
    const onWorkspacePress = vi.fn();
    sideNav(onWorkspacePress);
    await user.click(
      screen.getByRole("button", { name: "BCDX, switch workspace" }),
    );
    expect(onWorkspacePress).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Ana Reyes" }));
    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Account", "Log out"]);
  });

  test("no count, no badge", () => {
    const { container } = render(
      <SideNav
        workspaceName="BCDX"
        onWorkspacePress={() => {}}
        items={[{ ...decisions, badge: 0 }]}
        user={{ name: "Ana Reyes" }}
        userMenu={<MenuItem id="logout">Log out</MenuItem>}
      />,
    );
    const link = screen.getByRole("link", { name: "Decision Log" });
    expect(link.textContent).toBe("Decision Log");
    expect(container.querySelector("[aria-hidden='true'] span")).toBeNull();
  });
});

describe("TabBar", () => {
  const more = (
    <>
      <MenuItem id="decisions" href="/w/1/decisions">
        Decision Log
      </MenuItem>
      <MenuItem id="logout">Log out</MenuItem>
    </>
  );

  test("a link per tab, the current one marked, then More", () => {
    render(<TabBar items={pages} currentId="ideas" more={more} />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(
      within(nav)
        .getByRole("link", { name: "Ideas" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      within(nav).getByRole("link", { name: "Notifications, 3 unread" }),
    ).toBeTruthy();
    const moreButton = within(nav).getByRole("button", { name: "More" });
    expect(moreButton.hasAttribute("aria-current")).toBe(false);
  });

  test("a page behind More marks More; More opens the rest in a tray", async () => {
    const user = userEvent.setup();
    setPhoneWidth();
    render(<TabBar items={pages} currentId="decisions" more={more} />);
    const moreButton = screen.getByRole("button", { name: "More" });
    expect(moreButton.getAttribute("aria-current")).toBe("true");
    await user.click(moreButton);
    await settle();
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(2);
  });
});

describe("AppFrame", () => {
  const frame = (props: Partial<Omit<AppFrameProps, "children">> = {}) =>
    render(
      <AppFrame
        sideNav={<nav aria-label="Side">side</nav>}
        tabBar={<nav aria-label="Tabs">tabs</nav>}
        {...props}
      >
        <p>Body</p>
      </AppFrame>,
    );

  test("the skip link moves focus to the body without leaving the page", async () => {
    const user = userEvent.setup();
    frame();
    const skip = screen.getByRole("link", { name: "Skip to content" });
    await user.click(skip);
    const main = screen.getByRole("main");
    expect(document.activeElement).toBe(main);
    expect(main.textContent).toBe("Body");
    expect(window.location.hash).toBe("");
  });

  test("without breadcrumbs, ←, a save state or panels, there is no header", () => {
    frame();
    expect(document.querySelector("header")).toBeNull();
    expect(screen.getByRole("navigation", { name: "Side" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Tabs" })).toBeTruthy();
  });

  test("the header: breadcrumbs, ← with where it leads, and the panels' buttons", async () => {
    const user = userEvent.setup();
    const onComments = vi.fn();
    const onHistory = vi.fn();
    frame({
      breadcrumbs: (
        <Breadcrumbs>
          <Breadcrumb href="/w/1/ideas">Ideas</Breadcrumb>
          <Breadcrumb>05 Costs</Breadcrumb>
        </Breadcrumbs>
      ),
      back: { href: "/w/1/ideas/2", label: "Validation" },
      comments: { count: 2, isOpen: true, onPress: onComments },
      history: { isOpen: false, onPress: onHistory },
    });
    const header = document.querySelector("header") as HTMLElement;
    expect(
      within(header).getByRole("list", { name: "Breadcrumbs" }),
    ).toBeTruthy();
    const back = within(header).getByRole("link", {
      name: "Back to Validation",
    });
    expect(back.getAttribute("href")).toBe("/w/1/ideas/2");
    expect(back.textContent).toBe("Validation");
    const comments = within(header).getByRole("button", {
      name: "Comments, 2 unresolved threads",
    });
    expect(comments.getAttribute("aria-expanded")).toBe("true");
    await user.click(comments);
    expect(onComments).toHaveBeenCalledOnce();
    const history = within(header).getByRole("button", { name: "History" });
    expect(history.getAttribute("aria-expanded")).toBe("false");
    await user.click(history);
    expect(onHistory).toHaveBeenCalledOnce();
  });

  test("the save state: Saving… and Saved; Couldn't save with Retry", async () => {
    const user = userEvent.setup();
    const onRetrySave = vi.fn();
    const { rerender } = frame({ saveState: "saving" });
    expect(screen.getByRole("status").textContent).toBe("Saving…");
    rerender(
      <AppFrame sideNav={null} tabBar={null} saveState="saved">
        <p>Body</p>
      </AppFrame>,
    );
    expect(screen.getByRole("status").textContent).toBe("Saved");
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    rerender(
      <AppFrame
        sideNav={null}
        tabBar={null}
        saveState="save-failed"
        onRetrySave={onRetrySave}
      >
        <p>Body</p>
      </AppFrame>,
    );
    expect(screen.getByRole("status").textContent).toBe(
      i18n.t("components:appFrame.saveFailed"),
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetrySave).toHaveBeenCalledOnce();
  });

  test("no unresolved threads: 💬 is named alone, with no count", () => {
    frame({ comments: { count: 0, isOpen: false, onPress: () => {} } });
    expect(screen.getByRole("button", { name: "Comments" })).toBeTruthy();
  });

  test("bands go under the header, offline first; the panel beside the body", () => {
    frame({
      saveState: "saved",
      // Given in another order: the frame keeps 6.0.1's.
      banners: {
        addToHomeScreen: <p role="note">Add to Home Screen</p>,
        newVersion: <p role="note">New version</p>,
        offline: <div role="alert">You're offline.</div>,
      },
      panel: <aside aria-label="Comments panel">Threads</aside>,
    });
    const header = document.querySelector("header") as HTMLElement;
    const alert = screen.getByRole("alert");
    const [newVersion, install] = screen.getAllByRole("note");
    expect(newVersion?.textContent).toBe("New version");
    expect(install?.textContent).toBe("Add to Home Screen");
    expect(follows(alert, newVersion as Element)).toBe(true);
    const main = screen.getByRole("main");
    const panel = screen.getByRole("complementary", { name: "Comments panel" });
    // Document order is reading order: header, bands, body, panel.
    expect(
      header.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      alert.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(main.contains(panel)).toBe(false);
    expect(
      main.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("a pattern's tools go in the header: 11's Focus switch", () => {
    render(
      <AppFrame sideNav={null} tabBar={null} saveState="saved">
        <QuestionFormPattern
          header={<h1>01 Customer & Problem</h1>}
          questionIds={["WHO"]}
          currentId="WHO"
          onCurrentChange={() => {}}
          renderQuestion={(id) => <p>{id}</p>}
        />
      </AppFrame>,
    );
    const header = document.querySelector("header") as HTMLElement;
    expect(within(header).getByRole("switch", { name: "Focus" })).toBeTruthy();
    expect(within(screen.getByRole("main")).queryByRole("switch")).toBeNull();
  });
});

describe("PageFrame", () => {
  test("the bands at the top of the main landmark, offline first", () => {
    render(
      <PageFrame
        banners={{
          newVersion: <p role="note">New version</p>,
          offline: <div role="alert">You're offline.</div>,
        }}
      >
        <h1>Sign in</h1>
      </PageFrame>,
    );
    const main = screen.getByRole("main");
    const alert = within(main).getByRole("alert");
    expect(follows(alert, within(main).getByRole("note"))).toBe(true);
    expect(
      follows(within(main).getByRole("note"), screen.getByRole("heading")),
    ).toBe(true);
  });

  test("the main landmark of a screen without the app's frame", () => {
    render(
      <PageFrame>
        <h1>Sign in</h1>
      </PageFrame>,
    );
    expect(within(screen.getByRole("main")).getByRole("heading")).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
