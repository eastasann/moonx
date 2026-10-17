import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { BottomBar } from "../internal/frame";
import { ListDetailPattern } from "../patterns/ListDetailPattern";
import { QuestionList, QuestionListItem } from "../patterns/QuestionList";
import { SettingsList, SettingsListItem } from "../patterns/SettingsPattern";
import { setPhoneWidth, setTabletWidth, settle } from "../test/helpers";
import { AlertBanner } from "./AlertBanner";
import { AppFrame } from "./AppFrame";
import { Button } from "./Button";
import { Card, CardView } from "./Card";
import { DiffTextArea } from "./DiffTextArea";
import { ListView, ListViewItem } from "./ListView";
import { MetricGroup, MetricTile } from "./MetricTile";
import { Picker } from "./Picker";
import { QuestionCard } from "./QuestionCard";
import { Switch } from "./Switch";
import { TextArea, TextField } from "./TextField";

afterEach(() => setTabletWidth());

describe("AlertBanner (design-spec 4.5・6.0.1)", () => {
  test("an alert with its kind named, its bold start, its action and Close", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <AlertBanner
        variant="notice"
        title="You're offline."
        action={<a href="#retry">Retry</a>}
        onDismiss={onDismiss}
      >
        Changes can't be saved until you reconnect.
      </AlertBanner>,
    );
    const band = screen.getByRole("alert");
    expect(within(band).getByRole("img", { name: "Warning" })).toBeTruthy();
    expect(band.textContent).toContain(
      "You're offline. Changes can't be saved until you reconnect.",
    );
    expect(within(band).getByRole("link", { name: "Retry" })).toBeTruthy();
    await user.click(within(band).getByRole("button", { name: "Close" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  test("neutral has no icon", () => {
    render(<AlertBanner variant="neutral">Plain.</AlertBanner>);
    expect(screen.getByRole("alert").querySelector("svg")).toBeNull();
  });
});

describe("DiffTextArea (design-spec 4.5・6.7)", () => {
  test("an ordinary text area; what it adds to the old text is underlined, the marks not read", async () => {
    const user = userEvent.setup();
    function Field() {
      const [value, setValue] = useState("Office workers.");
      return (
        <DiffTextArea
          label="Imported"
          before="Office workers."
          value={value}
          onChange={setValue}
        />
      );
    }
    render(<Field />);
    const field = screen.getByRole("textbox", { name: "Imported" });
    await user.click(field);
    await user.keyboard("{End} in Bacolod");
    await settle();
    expect((field as HTMLTextAreaElement).value).toBe(
      "Office workers. in Bacolod",
    );
    const marks = field.parentElement?.querySelector("[aria-hidden]");
    expect(marks?.querySelector("ins")?.textContent).toContain("in Bacolod");
  });
});

describe("FieldLabel and the help text's tone (design-spec 4.5 TextField)", () => {
  test("a required field says Required after its label, in its name too", () => {
    render(<TextArea label="Why?" isRequired />);
    expect(screen.getByRole("textbox", { name: "Why? Required" })).toBeTruthy();
  });

  test("notice help text carries its warning icon", () => {
    render(
      <TextField
        label="Currency"
        description="Changing the currency does not convert amounts."
        descriptionTone="notice"
      />,
    );
    const help = screen.getByText(
      "Changing the currency does not convert amounts.",
    );
    expect(help.parentElement?.querySelector("svg")).not.toBeNull();
  });
});

describe("Picker with its label inside (design-spec 4.5)", () => {
  test("the button reads its label, then its value, as it shows them", () => {
    render(
      <Picker
        label="Stage"
        labelPosition="inside"
        items={[
          { id: "all", label: "All" },
          { id: "validation", label: "Validation" },
        ]}
        defaultValue="all"
      />,
    );
    const button = screen.getByRole("button", { name: "Stage All" });
    expect(button.textContent?.replace(/\s+/g, " ").trim()).toContain(
      "Stage All",
    );
  });
});

describe("CardView's add tile (design-spec 4.5 Card)", () => {
  test("pressing it adds; pressing a card opens it", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const onAdd = vi.fn();
    render(
      <CardView
        aria-label="Rivals"
        onAction={onAction}
        addItem={{ label: "Add competitor", onAction: onAdd }}
      >
        <Card id="kiosk" textValue="Airport kiosk" title="Airport kiosk" />
      </CardView>,
    );
    await user.click(screen.getByText("Add competitor"));
    expect(onAdd).toHaveBeenCalledOnce();
    expect(onAction).not.toHaveBeenCalled();
    await user.click(screen.getByText("Airport kiosk"));
    expect(onAction).toHaveBeenCalledWith("kiosk");
  });
});

describe("BottomBar on a phone (design-spec 4.3・4.5 Button)", () => {
  test("its buttons take XL, the ones not quiet share the width", () => {
    setPhoneWidth();
    render(
      <BottomBar>
        <Button variant="secondary" isQuiet>
          Cancel
        </Button>
        <Button variant="primary">Record decision</Button>
      </BottomBar>,
    );
    const record = screen.getByRole("button", { name: "Record decision" });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(record.className).toMatch(/size_XL/);
    expect(cancel.className).toMatch(/size_XL/);
    expect(record.className).toMatch(/fills_true/);
    expect(cancel.className).not.toMatch(/fills_true/);
  });

  test("from the tablet breakpoint up its buttons keep their own size", () => {
    setTabletWidth();
    render(
      <BottomBar>
        <Button variant="primary">Apply</Button>
      </BottomBar>,
    );
    const apply = screen.getByRole("button", { name: "Apply" });
    expect(apply.className).toMatch(/size_M/);
    expect(apply.className).not.toMatch(/fills_true/);
  });
});

describe("SettingsList (design-spec 4.5・6.16 の 9)", () => {
  test("a member's name, note and email, the role and the actions in one row", () => {
    render(
      <SettingsList aria-label="Members">
        <SettingsListItem
          avatar={<span>AV</span>}
          title="Ana Villanueva"
          titleNote="(you)"
          description="ana@example.com"
          control={<button type="button">Owner</button>}
          actions={<button type="button">More</button>}
          note="This workspace needs at least one Owner"
        />
      </SettingsList>,
    );
    const row = within(screen.getByRole("list", { name: "Members" })).getByRole(
      "listitem",
    );
    expect(row.textContent).toContain("Ana Villanueva (you)");
    expect(within(row).getByText("ana@example.com")).toBeTruthy();
    expect(within(row).getByRole("button", { name: "Owner" })).toBeTruthy();
    expect(
      within(row).getByText("This workspace needs at least one Owner"),
    ).toBeTruthy();
  });
});

describe("QuestionList (design-spec 4.5・6.10)", () => {
  test("the questions in an ordered list, each a QuestionCard in its item", () => {
    render(
      <QuestionList>
        <QuestionListItem>
          <QuestionCard
            title="Survivor Patterns"
            question="Survivor Patterns"
            mode="quiet"
            status={{ state: "empty", label: "Empty" }}
          />
        </QuestionListItem>
        <QuestionListItem>
          <QuestionCard
            title="Failure Patterns"
            question="Failure Patterns"
            mode="quiet"
            status={{ state: "empty", label: "Empty" }}
          />
        </QuestionListItem>
      </QuestionList>,
    );
    const list = screen.getByRole("list");
    expect(list.tagName).toBe("OL");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(
      within(items[0] as HTMLElement).getByRole("region", {
        name: "Survivor Patterns",
      }),
    ).toBeTruthy();
    // An empty answer says "Empty" once.
    expect(within(items[1] as HTMLElement).getAllByText("Empty")).toHaveLength(
      1,
    );
  });
});

describe("MetricGroup's pair (design-spec 4.5, s06-ideas.html)", () => {
  test("the group and each tile take the pair's look; the unit beside the number", () => {
    render(
      <MetricGroup aria-label="Key numbers" variant="pair">
        <MetricTile label="Break-even" value="14.4+" unit="/ day" />
        <MetricTile label="Payback" value="3.9+" unit="months" />
      </MetricGroup>,
    );
    const group = screen.getByRole("group", { name: "Key numbers" });
    expect(group.className).toMatch(/pair/);
    for (const tile of group.querySelectorAll("dl")) {
      expect(tile.className).toMatch(/pair/);
    }
    expect(screen.getByText("/ day").className).toMatch(/pair/);
    expect(group.textContent).toContain("14.4+");
    expect(group.textContent).toContain("/ day");
  });
});

describe("ListDetailPattern's note under the list (design-spec 6.8)", () => {
  test("the note follows the list inside the list's pane", () => {
    render(
      <ListDetailPattern
        list={
          <ListView aria-label="Ideas" selectionMode="single">
            <ListViewItem id="a" textValue="A">
              A
            </ListViewItem>
          </ListView>
        }
        listNote={<span>1 dropped idea hidden</span>}
        detail={null}
        listLabel="Ideas"
        onBack={() => {}}
      />,
    );
    const grid = screen.getByRole("grid", { name: "Ideas" });
    const note = screen.getByText("1 dropped idea hidden");
    expect(
      grid.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // The list's pane holds the list's wrapper and the note.
    expect(grid.parentElement?.parentElement?.contains(note)).toBe(true);
  });
});

describe("Switch's label position (design-spec 4.5 Switch)", () => {
  test("start puts the label before the track, still naming the switch", () => {
    render(<Switch labelPosition="start">Focus</Switch>);
    expect(screen.getByRole("switch", { name: "Focus" })).toBeTruthy();
    // The track follows the label's text.
    expect(screen.getByText("Focus").nextElementSibling).not.toBeNull();
  });
});

describe("AppFrame's title on a phone (design-spec 6.0.1)", () => {
  test("a screen with no ← shows its title; one that switches is a button", async () => {
    setPhoneWidth();
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(
      <AppFrame sideNav={null} tabBar={null} title={{ label: "BCDX", onPress }}>
        <p>Body</p>
      </AppFrame>,
    );
    await user.click(screen.getByRole("button", { name: /BCDX/ }));
    expect(onPress).toHaveBeenCalledOnce();
  });
});
