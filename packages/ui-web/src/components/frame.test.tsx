import { i18n } from "@moonx/i18n";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Bell, Lightbulb, ScrollText } from "lucide-react";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useTwoColumns, useTwoColumnsNow } from "../internal/frame";
import { HubPattern } from "../patterns/HubPattern";
import { ListDetailPattern } from "../patterns/ListDetailPattern";
import { PresentationPattern } from "../patterns/PresentationPattern";
import { QuestionFormPattern } from "../patterns/QuestionFormPattern";
import { setPhoneWidth, settle } from "../test/helpers";
import { AppFrame, type AppFrameProps } from "./AppFrame";
import { Breadcrumb, Breadcrumbs } from "./Breadcrumbs";
import { Link } from "./Link";
import { ListView, ListViewItem } from "./ListView";
import { MenuItem } from "./Menu";
import { PageFrame } from "./PageFrame";
import { RouterProvider } from "./RouterProvider";
import { type NavItem, SideNav } from "./SideNav";
import { TabBar, useMoreMenu } from "./TabBar";

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

describe("← More (design-spec 6.0.1)", () => {
  function MoreScreen() {
    const moreMenu = useMoreMenu();
    return (
      <AppFrame
        sideNav={null}
        tabBar={
          <TabBar
            items={pages}
            currentId="decisions"
            moreMenu={moreMenu.tabBar}
            more={
              <>
                <MenuItem id="decisions">Decision Log</MenuItem>
                <MenuItem id="logout">Log out</MenuItem>
              </>
            }
          />
        }
        back={moreMenu.back}
      >
        <p>Body</p>
      </AppFrame>
    );
  }

  test("a press on ← More opens the More menu; closing it gives focus back to ← More", async () => {
    const user = userEvent.setup();
    setPhoneWidth();
    render(<MoreScreen />);
    const header = document.querySelector("header") as HTMLElement;
    const back = within(header).getByRole("button", { name: "Back to More" });
    expect(back.textContent).toBe("More");
    expect(back.getAttribute("aria-haspopup")).toBe("menu");
    expect(back.getAttribute("aria-expanded")).toBe("false");
    await user.click(back);
    await settle();
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(2);
    expect(back.getAttribute("aria-expanded")).toBe("true");
    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(back);
    await user.click(screen.getByRole("button", { name: "More" }));
    await settle();
    expect(await screen.findByRole("menu")).toBeTruthy();
  });

  test("from the keyboard, focus lands on the first item, as from More", async () => {
    const user = userEvent.setup();
    setPhoneWidth();
    render(<MoreScreen />);
    const header = document.querySelector("header") as HTMLElement;
    within(header).getByRole("button", { name: "Back to More" }).focus();
    await user.keyboard("{Enter}");
    await settle();
    const menu = await screen.findByRole("menu");
    expect(document.activeElement).toBe(
      within(menu).getByRole("menuitem", { name: "Decision Log" }),
    );
    // Closed, a click on More focuses the menu itself again, as React Aria does for a
    // pointer: the keyboard's first item does not carry over.
    await user.keyboard("{Escape}");
    await settle();
    await user.click(screen.getByRole("button", { name: "More" }));
    await settle();
    expect(document.activeElement).toBe(await screen.findByRole("menu"));
  });

  test("↓ and ↑ open it on its first and last item, as on More", async () => {
    const user = userEvent.setup();
    setPhoneWidth();
    render(<MoreScreen />);
    const header = document.querySelector("header") as HTMLElement;
    const back = within(header).getByRole("button", { name: "Back to More" });
    back.focus();
    await user.keyboard("{ArrowUp}");
    await settle();
    let menu = await screen.findByRole("menu");
    expect(document.activeElement).toBe(
      within(menu).getByRole("menuitem", { name: "Log out" }),
    );
    await user.keyboard("{Escape}");
    await settle();
    expect(document.activeElement).toBe(back);
    await user.keyboard("{ArrowDown}");
    await settle();
    menu = await screen.findByRole("menu");
    expect(document.activeElement).toBe(
      within(menu).getByRole("menuitem", { name: "Decision Log" }),
    );
  });

  test("a press that is not a link: the back button calls it", async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(
      <AppFrame sideNav={null} tabBar={null} back={{ label: "Plan", onPress }}>
        <p>Body</p>
      </AppFrame>,
    );
    const back = screen.getByRole("button", { name: "Back to Plan" });
    expect(back.hasAttribute("aria-haspopup")).toBe(false);
    await user.click(back);
    expect(onPress).toHaveBeenCalledOnce();
    // Its keys go on to the page, as a link's do.
    const onPageKey = vi.fn();
    document.addEventListener("keydown", onPageKey);
    back.focus();
    await user.keyboard("{ArrowDown}");
    document.removeEventListener("keydown", onPageKey);
    expect(onPageKey).toHaveBeenCalled();
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

  test("bands go under the header, offline, new version, Home Screen, template; the panel beside the body", () => {
    frame({
      saveState: "saved",
      // Given in another order: the frame keeps 6.0.1's.
      banners: {
        template: <p role="note">A newer template</p>,
        addToHomeScreen: <p role="note">Add to Home Screen</p>,
        newVersion: <p role="note">New version</p>,
        offline: <div role="alert">You're offline.</div>,
      },
      panel: <aside aria-label="Comments panel">Threads</aside>,
    });
    const header = document.querySelector("header") as HTMLElement;
    const alert = screen.getByRole("alert");
    const [newVersion, install, template] = screen.getAllByRole("note");
    expect(newVersion?.textContent).toBe("New version");
    expect(install?.textContent).toBe("Add to Home Screen");
    expect(template?.textContent).toBe("A newer template");
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

describe("AppFrame: a docked panel and the body's width (design-spec 4.1)", () => {
  // happy-dom lays nothing out: the body's and the panel column's widths are given here,
  // and the observers run when the test says the sizes changed.
  const observers: (() => void)[] = [];
  let bodyWidth = 784;
  afterEach(() => {
    observers.length = 0;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubLayout() {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          observers.push(callback);
        }
        observe() {}
        disconnect() {}
      },
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        // The body's probe: the empty first child of main.
        const isBodyProbe =
          this.parentElement?.tagName === "MAIN" &&
          this === this.parentElement.firstElementChild &&
          this.childElementCount === 0;
        const width = isBodyProbe
          ? bodyWidth
          : this.querySelector(":scope > [data-docked]")
            ? 360
            : 0;
        return new DOMRect(0, 0, width, 0);
      },
    );
  }

  const resized = (width: number) =>
    act(() => {
      bodyWidth = width;
      for (const observer of observers) observer();
    });

  const ideas = [
    { id: "piaya", name: "Piaya" },
    { id: "bowl", name: "Bowl" },
  ];
  const list = () => screen.queryByRole("grid", { name: "Ideas list" });

  function Screen() {
    const [isOpen, setOpen] = useState(false);
    const [selected, setSelected] = useState<string | null>("piaya");
    return (
      <AppFrame
        sideNav={null}
        tabBar={null}
        comments={{ count: 0, isOpen, onPress: () => setOpen(!isOpen) }}
        panel={
          isOpen ? (
            <aside data-docked aria-label="Comments">
              Threads
            </aside>
          ) : null
        }
      >
        <ListDetailPattern
          list={
            <>
              <input aria-label="Search ideas" />
              <button type="button">Sort ideas</button>
              <ListView
                aria-label="Ideas list"
                items={ideas}
                selectionMode="single"
                selectedKeys={selected === null ? [] : [selected]}
                onSelectionChange={(keys) =>
                  setSelected(([...keys][0] as string | undefined) ?? null)
                }
              >
                {(idea) => (
                  <ListViewItem id={idea.id} textValue={idea.name}>
                    {idea.name}
                  </ListViewItem>
                )}
              </ListView>
            </>
          }
          detail={
            selected === null ? null : (
              <input key={selected} aria-label={`Summary of ${selected}`} />
            )
          }
          listLabel="Ideas"
          onBack={() => setSelected(null)}
        />
      </AppFrame>
    );
  }

  test("an effect reads two columns as laid out before the docked panel is observed", async () => {
    stubLayout();
    const user = userEvent.setup();
    const seen: [rendered: boolean, now: boolean][] = [];
    function Probe() {
      const isTwoColumns = useTwoColumns();
      const isTwoColumnsNow = useTwoColumnsNow();
      useEffect(() => {
        seen.push([isTwoColumns, isTwoColumnsNow()]);
      });
      return null;
    }
    function WithPanel() {
      const [isOpen, setOpen] = useState(false);
      return (
        <AppFrame
          sideNav={null}
          tabBar={null}
          comments={{ count: 0, isOpen, onPress: () => setOpen(!isOpen) }}
          panel={
            isOpen ? (
              <aside data-docked aria-label="Comments">
                Threads
              </aside>
            ) : null
          }
        >
          <Probe />
        </AppFrame>
      );
    }
    render(<WithPanel />);
    resized(784);
    seen.length = 0;
    await user.click(screen.getByRole("button", { name: "Comments" }));
    // The render that docks the panel still says two columns; the layout no longer does.
    expect(seen[0]).toEqual([true, false]);
    resized(784);
    expect(seen.at(-1)).toEqual([false, false]);
  });

  test("too narrow beside the panel: one pane; the field keeps its focus and text", async () => {
    stubLayout();
    const user = userEvent.setup();
    render(<Screen />);
    resized(784);
    expect(list()).toBeTruthy();
    const field = screen.getByRole("textbox", { name: "Summary of piaya" });
    await user.type(field, "Same-day boxes");

    await user.click(screen.getByRole("button", { name: "Comments" }));
    // 1024px: the panel leaves the body 424px.
    resized(424);
    expect(list()).toBeNull();
    expect(screen.getByRole("button", { name: "Back to Ideas" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Summary of piaya" })).toBe(
      field,
    );

    field.focus();
    // The window widens to 1440px: 840px beside the panel is room enough.
    resized(840);
    expect(list()).toBeTruthy();
    expect(document.activeElement).toBe(field);
    resized(424);
    expect(document.activeElement).toBe(field);
    expect((field as HTMLInputElement).value).toBe("Same-day boxes");

    // Closed, the panel gives the two columns back, the same detail beside the list.
    await user.click(screen.getByRole("button", { name: "Comments" }));
    resized(784);
    expect(list()).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Summary of piaya" })).toBe(
      field,
    );
  });

  test("focus on the list's side keeps the list, until another item is selected", async () => {
    stubLayout();
    const user = userEvent.setup();
    render(<Screen />);
    resized(840);
    await user.click(screen.getByRole("button", { name: "Comments" }));
    resized(840);
    const search = screen.getByRole("textbox", { name: "Search ideas" });
    await user.type(search, "piaya");
    // The window narrows to 1024px while the filter is being typed in.
    resized(424);
    expect(document.activeElement).toBe(search);
    expect((search as HTMLInputElement).value).toBe("piaya");
    expect(
      screen.queryByRole("textbox", { name: "Summary of piaya" }),
    ).toBeNull();
    // A press that selects nothing (a sort, a tree's chevron, a filter's option) keeps it.
    await user.click(screen.getByRole("button", { name: "Sort ideas" }));
    expect(list()).toBeTruthy();
    // The chosen item is still selected; choosing another opens its detail in place of
    // the list.
    expect(
      screen.getByRole("row", { name: "Piaya" }).getAttribute("aria-selected"),
    ).toBe("true");
    await user.click(screen.getByRole("row", { name: "Bowl" }));
    expect(list()).toBeNull();
    expect(
      screen.getByRole("textbox", { name: "Summary of bowl" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to Ideas" })).toBeTruthy();
  });

  test("focus elsewhere: the detail takes the width; focus stays where it is", async () => {
    stubLayout();
    const user = userEvent.setup();
    render(<Screen />);
    resized(784);
    await user.click(screen.getByRole("button", { name: "Comments" }));
    // On the 💬 that opened the panel, focus stays.
    resized(424);
    expect(list()).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Comments" }),
    );
  });

  test("two columns coming back take the detail's ←; focus on it goes to the detail", async () => {
    stubLayout();
    const user = userEvent.setup();
    render(<Screen />);
    resized(784);
    await user.click(screen.getByRole("button", { name: "Comments" }));
    resized(424);
    screen.getByRole("button", { name: "Back to Ideas" }).focus();
    resized(840);
    expect(screen.queryByRole("button", { name: "Back to Ideas" })).toBeNull();
    const detail = screen.getByRole("textbox", {
      name: "Summary of piaya",
    }).parentElement;
    expect(document.activeElement).toBe(detail);
  });

  test("A takes one column below two-column-min-width, I the slide alone below its own", () => {
    stubLayout();
    render(
      <AppFrame
        sideNav={null}
        tabBar={null}
        panel={<aside data-docked aria-label="Comments" />}
      >
        <HubPattern
          header={<h1>Piaya</h1>}
          blocks={[
            { id: "next", column: "main", content: <p>Next steps</p> },
            { id: "sections", column: "aside", content: <p>Sections</p> },
          ]}
        />
        <PresentationPattern
          header={<h1>Pitch Deck</h1>}
          slides={[{ id: "title", title: "Title", thumbnail: null }]}
          currentId="title"
          onCurrentChange={() => {}}
          slide={<p>Slide</p>}
        />
      </AppFrame>,
    );
    const isOneColumn = () =>
      screen.getByText("Next steps").parentElement?.parentElement ===
      screen.getByText("Sections").parentElement?.parentElement;
    const thumbnails = () => screen.queryByRole("listbox", { name: "Slides" });
    // 1440px: the body has room for both.
    resized(844);
    expect(isOneColumn()).toBe(false);
    expect(thumbnails()).toBeTruthy();
    // 1340px: under 788, over 704.
    resized(744);
    expect(isOneColumn()).toBe(true);
    expect(thumbnails()).toBeTruthy();
    // 1024px.
    resized(428);
    expect(isOneColumn()).toBe(true);
    expect(thumbnails()).toBeNull();
    expect(screen.getByRole("button", { name: "Next slide" })).toBeTruthy();
    // The thresholds themselves have room.
    resized(704);
    expect(thumbnails()).toBeTruthy();
    resized(788);
    expect(isOneColumn()).toBe(false);
  });

  test("a narrow body without a panel keeps two columns", () => {
    stubLayout();
    render(<Screen />);
    // A desktop at its breakpoint less a classic scrollbar: no panel, no change.
    resized(767);
    expect(list()).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back to Ideas" })).toBeNull();
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
