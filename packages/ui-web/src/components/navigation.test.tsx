import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { Breadcrumb, Breadcrumbs } from "./Breadcrumbs";
import { Accordion, Disclosure } from "./Disclosure";
import { Tab, TabList, TabPanel, Tabs } from "./Tabs";

describe("Disclosure and Accordion", () => {
  test("the title is a button in a heading that opens and closes the panel", async () => {
    const user = userEvent.setup();
    const onExpandedChange = vi.fn();
    render(
      <Disclosure title="EXAMPLE" onExpandedChange={onExpandedChange}>
        They buy boxed piaya at the airport.
      </Disclosure>,
    );
    const heading = screen.getByRole("heading", { level: 3 });
    const button = within(heading).getByRole("button", { name: "EXAMPLE" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    await user.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(onExpandedChange).toHaveBeenLastCalledWith(true);
    const panel = document.getElementById(
      button.getAttribute("aria-controls") ?? "",
    );
    expect(panel?.textContent).toBe("They buy boxed piaya at the airport.");
    expect(panel?.hasAttribute("hidden")).toBe(false);
    await user.keyboard("{Enter}");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    await user.keyboard(" ");
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  test("headingLevel sets the title's level", () => {
    render(
      <Disclosure title="Hint" headingLevel={4}>
        Body
      </Disclosure>,
    );
    expect(
      screen.getByRole("heading", { level: 4, name: "Hint" }),
    ).toBeTruthy();
  });

  test("an Accordion keeps one open; allowsMultipleExpanded keeps both", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <Accordion defaultExpandedKeys={["a"]}>
        <Disclosure id="a" title="First">
          One
        </Disclosure>
        <Disclosure id="b" title="Second">
          Two
        </Disclosure>
      </Accordion>,
    );
    const first = screen.getByRole("button", { name: "First" });
    const second = screen.getByRole("button", { name: "Second" });
    expect(first.getAttribute("aria-expanded")).toBe("true");
    await user.click(second);
    expect(second.getAttribute("aria-expanded")).toBe("true");
    expect(first.getAttribute("aria-expanded")).toBe("false");
    unmount();
    render(
      <Accordion allowsMultipleExpanded>
        <Disclosure id="a" title="First">
          One
        </Disclosure>
        <Disclosure id="b" title="Second">
          Two
        </Disclosure>
      </Accordion>,
    );
    await user.click(screen.getByRole("button", { name: "First" }));
    await user.click(screen.getByRole("button", { name: "Second" }));
    for (const name of ["First", "Second"]) {
      expect(
        screen.getByRole("button", { name }).getAttribute("aria-expanded"),
      ).toBe("true");
    }
  });

  test("an Accordion's size and isQuiet reach its disclosures unless they set their own", () => {
    render(
      <div>
        <Accordion size="L" isQuiet>
          <Disclosure id="a" title="From group">
            a
          </Disclosure>
          <Disclosure id="b" title="Own" size="S" isQuiet={false}>
            b
          </Disclosure>
        </Accordion>
        <Disclosure title="Alone L" size="L" isQuiet>
          c
        </Disclosure>
        <Disclosure title="Alone S" size="S">
          d
        </Disclosure>
      </div>,
    );
    const look = (name: string) =>
      screen.getByRole("button", { name }).className;
    expect(look("From group")).toBe(look("Alone L"));
    expect(look("Own")).toBe(look("Alone S"));
  });
});

describe("Tabs", () => {
  const renderTabs = (onSelectionChange = vi.fn()) => {
    render(
      <Tabs onSelectionChange={onSelectionChange}>
        <TabList aria-label="Assumptions and risks">
          <Tab id="assumptions">Assumptions</Tab>
          <Tab id="risks">Risks</Tab>
          <Tab id="later" isDisabled>
            Later
          </Tab>
        </TabList>
        <TabPanel id="assumptions">Assumption rows</TabPanel>
        <TabPanel id="risks">Risk rows</TabPanel>
        <TabPanel id="later">Never</TabPanel>
      </Tabs>,
    );
    return onSelectionChange;
  };

  test("a tablist named by its label; the first tab and its panel show", () => {
    renderTabs();
    const list = screen.getByRole("tablist", { name: "Assumptions and risks" });
    expect(within(list).getAllByRole("tab")).toHaveLength(3);
    expect(
      screen
        .getByRole("tab", { name: "Assumptions" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toBe("Assumption rows");
  });

  test("the right arrow selects the next tab and shows its panel", async () => {
    const user = userEvent.setup();
    const onSelectionChange = renderTabs();
    await user.click(screen.getByRole("tab", { name: "Assumptions" }));
    await user.keyboard("{ArrowRight}");
    expect(onSelectionChange).toHaveBeenLastCalledWith("risks");
    expect(screen.getByRole("tabpanel").textContent).toBe("Risk rows");
  });

  test("a disabled tab cannot be selected", async () => {
    const user = userEvent.setup();
    const onSelectionChange = renderTabs();
    await user.click(screen.getByRole("tab", { name: "Later" }));
    expect(onSelectionChange).not.toHaveBeenCalledWith("later");
  });
});

describe("Breadcrumbs", () => {
  test("links up the levels; the last is the current page as text", () => {
    render(
      <Breadcrumbs>
        <Breadcrumb href="/ideas">Ideas</Breadcrumb>
        <Breadcrumb href="/ideas/1">Piaya Gift Box</Breadcrumb>
        <Breadcrumb>05 Costs</Breadcrumb>
      </Breadcrumbs>,
    );
    const list = screen.getByRole("list", { name: "Breadcrumbs" });
    const links = within(list).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/ideas",
      "/ideas/1",
    ]);
    const current = screen.getByText("05 Costs");
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(current.closest("a")).toBeNull();
  });
});

describe("disabled", () => {
  test("Disclosure, Accordion and Tabs disable their buttons and tabs", () => {
    render(
      <div>
        <Disclosure title="Alone" isDisabled>
          a
        </Disclosure>
        <Accordion isDisabled>
          <Disclosure id="x" title="In group">
            b
          </Disclosure>
        </Accordion>
        <Tabs isDisabled>
          <TabList aria-label="Views">
            <Tab id="t">Tasks</Tab>
          </TabList>
          <TabPanel id="t">Rows</TabPanel>
        </Tabs>
      </div>,
    );
    for (const name of ["Alone", "In group"]) {
      expect(
        screen.getByRole("button", { name }).hasAttribute("disabled"),
      ).toBe(true);
    }
    expect(
      screen.getByRole("tab", { name: "Tasks" }).getAttribute("aria-disabled"),
    ).toBe("true");
  });
});
