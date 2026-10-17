import { i18n } from "@moonx/i18n";
import type { FauState, PitchSlide } from "@moonx/schemas";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BodyRoomContext } from "../internal/frame";
import { mockTextMeasure, setPhoneWidth, settle } from "../test/helpers";
import { DescriptionList, DescriptionListItem } from "./DescriptionList";
import { Dialog } from "./Dialog";
import { DiffText } from "./DiffText";
import { type FauChange, FauPicker, fauLabel } from "./FauPicker";
import { type MentionCandidate, MentionTextArea } from "./MentionTextArea";
import { MetricGroup, MetricTile } from "./MetricTile";
import * as metricStyles from "./MetricTile.css";
import { Panel } from "./Panel";
import { QuestionCard } from "./QuestionCard";
import { Radio, RadioGroup } from "./RadioGroup";
import { RowList, RowListItem } from "./RowList";
import { Slide } from "./Slide";
import { Steps } from "./Steps";
import { TableView } from "./TableView";
import { TextArea } from "./TextField";
import { ToggleButton, ToggleButtonGroup } from "./ToggleButtonGroup";

// moonx's own components (design-spec 4.5): FauPicker, MetricTile, RowList, QuestionCard,
// DiffText, MentionTextArea, Panel, Slide and Steps. Sizes are in variants.test.tsx.

describe("fauLabel", () => {
  test("the labels of 6.0.3", () => {
    expect(fauLabel("fact", { evidenceCount: 2 })).toBe("Fact · 2 sources");
    expect(fauLabel("fact", { evidenceCount: 1 })).toBe("Fact · 1 source");
    expect(fauLabel("fact_no_evidence")).toBe("Fact · No evidence");
    expect(fauLabel("assumption", { confidence: "medium" })).toBe(
      "Assumption · Medium",
    );
    expect(fauLabel("unknown")).toBe("Unknown");
    expect(fauLabel("unclassified")).toBe("Unclassified");
    expect(fauLabel("empty")).toBe("Empty");
  });
});

describe("FauPicker", () => {
  const picker = (
    props: Partial<Parameters<typeof FauPicker>[0]> & { state: FauState },
  ) => {
    const onChange = vi.fn<(change: FauChange) => void>();
    const onFactPress = vi.fn();
    render(
      <FauPicker
        aria-label="Rent"
        confidence={null}
        hasValue
        onChange={onChange}
        onFactPress={onFactPress}
        {...props}
      />,
    );
    return { onChange, onFactPress };
  };
  const open = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: /^Rent: / }));
    return screen.getByRole("dialog", { name: "Rent" });
  };

  test("the cell shows the state; pressing it opens the three buttons", async () => {
    const user = userEvent.setup();
    picker({ state: "assumption", confidence: "medium" });
    expect(
      screen.getByRole("button", { name: "Rent: Assumption · Medium" }),
    ).toBeTruthy();
    const dialog = await open(user);
    const group = within(dialog).getByRole("radiogroup", { name: "Rent" });
    expect(
      within(group)
        .getAllByRole("radio")
        .map((radio) => radio.textContent),
    ).toEqual(["Fact", "Assumption", "Unknown"]);
    expect(
      within(group)
        .getByRole("radio", { name: "Assumption" })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });

  test("Fact opens M2 and closes the popover; nothing is saved until evidence is", async () => {
    const user = userEvent.setup();
    const { onChange, onFactPress } = picker({ state: "unclassified" });
    const dialog = await open(user);
    await user.click(within(dialog).getByRole("radio", { name: "Fact" }));
    expect(onFactPress).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("Assumption waits for a confidence, then saves both", async () => {
    const user = userEvent.setup();
    const { onChange } = picker({ state: "unclassified" });
    const dialog = await open(user);
    await user.click(within(dialog).getByRole("radio", { name: "Assumption" }));
    expect(onChange).not.toHaveBeenCalled();
    const confidence = within(dialog).getByRole("radiogroup", {
      name: "Confidence",
    });
    await user.click(within(confidence).getByRole("radio", { name: "High" }));
    expect(onChange).toHaveBeenCalledWith({
      fau: "assumption",
      confidence: "high",
    });
  });

  test("pressing the chosen button again clears it", async () => {
    const user = userEvent.setup();
    const { onChange } = picker({ state: "assumption", confidence: "low" });
    const dialog = await open(user);
    await user.click(within(dialog).getByRole("radio", { name: "Assumption" }));
    expect(onChange).toHaveBeenCalledWith({ fau: null, confidence: null });
  });

  test("Unknown on a number with a value asks first; Cancel keeps it, Mark Unknown clears it", async () => {
    const user = userEvent.setup();
    const { onChange } = picker({ state: "unclassified" });
    let dialog = await open(user);
    await user.click(within(dialog).getByRole("radio", { name: "Unknown" }));
    let alert = screen.getByRole("alertdialog");
    // 6.0.3: it says the value goes, and that Assumption (Low) keeps it.
    expect(alert.textContent).toContain(
      i18n.t("components:fauPicker.unknownTitle"),
    );
    expect(alert.textContent).toContain(
      i18n.t("components:fauPicker.unknownBody"),
    );
    await user.click(
      within(alert).getByRole("button", {
        name: i18n.t("components:fauPicker.cancel"),
      }),
    );
    expect(onChange).not.toHaveBeenCalled();
    await settle();
    dialog = screen.queryByRole("dialog") ?? (await open(user));
    await user.click(within(dialog).getByRole("radio", { name: "Unknown" }));
    alert = screen.getByRole("alertdialog");
    await user.click(
      within(alert).getByRole("button", {
        name: i18n.t("components:fauPicker.markUnknown"),
      }),
    );
    expect(onChange).toHaveBeenLastCalledWith({
      fau: "unknown",
      confidence: null,
    });
  });

  test("without a value only Unknown can be chosen, and it needs no question", async () => {
    const user = userEvent.setup();
    const { onChange } = picker({ state: "empty", hasValue: false });
    const dialog = await open(user);
    expect(
      within(dialog)
        .getByRole("radio", { name: "Fact" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      within(dialog)
        .getByRole("radio", { name: "Assumption" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await user.click(within(dialog).getByRole("radio", { name: "Unknown" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onChange).toHaveBeenCalledWith({ fau: "unknown", confidence: null });
  });

  test("a Fact without evidence carries its warning; read only shows the label alone", () => {
    render(
      <>
        <FauPicker
          aria-label="Price"
          state="fact_no_evidence"
          confidence={null}
          hasValue
          onChange={() => {}}
          onFactPress={() => {}}
        />
        <FauPicker
          aria-label="Days"
          isReadOnly
          state="assumption"
          confidence="high"
          hasValue
          onChange={() => {}}
          onFactPress={() => {}}
        />
      </>,
    );
    const button = screen.getByRole("button", {
      name: "Price: Fact · No evidence",
    });
    expect(button.querySelectorAll("svg")).toHaveLength(2);
    expect(screen.getByText("Assumption · High")).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  test("in a table, focus comes back to the button after the popover, and after M2", async () => {
    const user = userEvent.setup();
    function Row() {
      const [isEvidenceOpen, setEvidenceOpen] = useState(false);
      return (
        <>
          <TableView
            aria-label="Costs"
            columns={[
              { id: "name", name: "Item", isRowHeader: true },
              { id: "fau", name: "F/A/U" },
            ]}
            items={[{ id: "rent", name: "Rent" }]}
            renderCell={(row, column) =>
              column === "name" ? (
                row.name
              ) : (
                <FauPicker
                  aria-label="Rent"
                  state="unclassified"
                  confidence={null}
                  hasValue
                  onChange={() => {}}
                  onFactPress={() => setEvidenceOpen(true)}
                />
              )
            }
          />
          <Dialog
            title="Evidence"
            isOpen={isEvidenceOpen}
            onOpenChange={setEvidenceOpen}
          >
            M2
          </Dialog>
        </>
      );
    }
    render(<Row />);
    const trigger = screen.getByRole("button", { name: "Rent: Unclassified" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    await settle();
    expect(document.activeElement).toBe(trigger);
    await user.click(trigger);
    await user.click(
      within(screen.getByRole("dialog", { name: "Rent" })).getByRole("radio", {
        name: "Fact",
      }),
    );
    await settle();
    expect(screen.getByRole("dialog", { name: "Evidence" })).toBeTruthy();
    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  test("in a table cell the label stands alone (the mark has its own column), with ▾ once the row is edited", async () => {
    const user = userEvent.setup();
    render(
      <TableView
        aria-label="Costs"
        columns={[
          { id: "name", name: "Item", isRowHeader: true },
          { id: "fau", name: "F/A/U" },
        ]}
        items={[{ id: "rent", name: "Rent" }]}
        isRowEditable={() => true}
        renderCell={(row, column) =>
          column === "name" ? (
            row.name
          ) : (
            <FauPicker
              aria-label="Rent"
              state="assumption"
              confidence="medium"
              hasValue
              onChange={() => {}}
              onFactPress={() => {}}
            />
          )
        }
      />,
    );
    const trigger = () =>
      screen.getByRole("button", { name: "Rent: Assumption · Medium" });
    expect(trigger().querySelectorAll("svg")).toHaveLength(0);
    await user.click(screen.getByText("Rent"));
    await settle();
    // The one icon is the ▾.
    expect(trigger().querySelectorAll("svg")).toHaveLength(1);
  });

  test("the popover asks how the amount is known; the confidence is named by its heading", async () => {
    const user = userEvent.setup();
    picker({ state: "assumption", confidence: "medium" });
    const dialog = await open(user);
    expect(
      within(dialog).getByText(i18n.t("components:fauPicker.question")),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole("radiogroup", {
        name: i18n.t("components:fauPicker.confidence"),
      }),
    ).toBeTruthy();
  });

  test("Add evidence opens M2 and closes the popover; a Fact keeps the link without the hint", async () => {
    const user = userEvent.setup();
    const { onFactPress } = picker({ state: "unclassified" });
    let dialog = await open(user);
    expect(
      within(dialog).getByText(i18n.t("components:fauPicker.evidenceHint")),
    ).toBeTruthy();
    await user.click(
      within(dialog).getByRole("link", {
        name: i18n.t("components:fauPicker.addEvidence"),
      }),
    );
    expect(onFactPress).toHaveBeenCalledTimes(1);
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    // A Fact that lost its evidence finds the way to M2 here.
    render(
      <FauPicker
        aria-label="Price"
        state="fact_no_evidence"
        confidence={null}
        hasValue
        onChange={() => {}}
        onFactPress={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: /^Price: / }));
    dialog = screen.getByRole("dialog", { name: "Price" });
    expect(
      within(dialog).queryByText(i18n.t("components:fauPicker.evidenceHint")),
    ).toBeNull();
    expect(
      within(dialog).getByRole("link", {
        name: i18n.t("components:fauPicker.addEvidence"),
      }),
    ).toBeTruthy();
  });

  test("without a value there is no way to evidence (Fact needs a value)", async () => {
    const user = userEvent.setup();
    picker({ state: "empty", hasValue: false });
    const dialog = await open(user);
    expect(within(dialog).queryByRole("link")).toBeNull();
  });

  test("on a phone the buttons sit in the sheet, without a popover", async () => {
    setPhoneWidth();
    const user = userEvent.setup();
    const { onChange } = picker({ state: "unclassified" });
    const group = screen.getByRole("group", { name: "Rent" });
    await user.click(within(group).getByRole("radio", { name: "Assumption" }));
    await user.click(within(group).getByRole("radio", { name: "Medium" }));
    expect(onChange).toHaveBeenCalledWith({
      fau: "assumption",
      confidence: "medium",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("MetricTile", () => {
  test("its name and value as a term and its detail; a notice supplement has a sign", () => {
    render(
      <>
        <MetricTile label="Startup cost" value="₱169,500+" />
        <MetricTile
          label="Break-even"
          value="Needs price"
          isPlaceholder
          supplement="Contribution margin is zero or negative"
          supplementTone="notice"
        />
      </>,
    );
    const terms = screen.getAllByRole("term");
    expect(terms.map((term) => term.textContent)).toEqual([
      "Startup cost",
      "Break-even",
    ]);
    const [value, placeholder, supplement] = screen.getAllByRole("definition");
    expect(value?.textContent).toBe("₱169,500+");
    expect(placeholder?.className).not.toBe(value?.className);
    expect(supplement?.querySelector("svg")).not.toBeNull();
  });
});

describe("MetricGroup", () => {
  test("a group of tiles; a unit follows its number in the same value", () => {
    render(
      <>
        <MetricGroup aria-label="Key numbers">
          <MetricTile label="Break-even" value="14.4+" unit="/ day" />
          <MetricTile label="Payback" value="3.9+" unit="months" />
        </MetricGroup>
        <MetricGroup aria-label="Key numbers compact" variant="compact">
          <MetricTile label="ROI" value="≤ 306.2%" />
        </MetricGroup>
      </>,
    );
    const band = screen.getByRole("group", { name: "Key numbers" });
    const compact = screen.getByRole("group", { name: "Key numbers compact" });
    expect(band.className).not.toBe(compact.className);
    const [breakEven] = within(band).getAllByRole("definition");
    expect(breakEven?.textContent).toBe("14.4+ / day");
    // The number and its unit are apart, so the unit can move to the next line alone.
    expect(within(band).getByText("14.4+").tagName).toBe("SPAN");
    expect(within(band).getByText("/ day").tagName).toBe("SPAN");
    expect(within(compact).getByRole("term").className).not.toBe(
      within(band).getAllByRole("term")[0]?.className,
    );
  });

  test("a band beside a docked panel that leaves the body too narrow is 2×2 (4.1 A)", () => {
    const tiles = (
      <>
        <MetricTile label="Startup costs" value="₱169,500" />
        <MetricTile label="Payback" value="9.2" unit="months" />
      </>
    );
    render(
      <>
        <MetricGroup aria-label="Row band">{tiles}</MetricGroup>
        <BodyRoomContext.Provider
          value={{ hasTwoColumns: false, hasThumbnails: false }}
        >
          <MetricGroup aria-label="Square band">{tiles}</MetricGroup>
          <MetricGroup aria-label="Pair" variant="pair">
            {tiles}
          </MetricGroup>
        </BodyRoomContext.Provider>
      </>,
    );
    const row = screen.getByRole("group", { name: "Row band" });
    const square = screen.getByRole("group", { name: "Square band" });
    expect(row.classList.contains(metricStyles.squareBand)).toBe(false);
    expect(square.classList.contains(metricStyles.squareBand)).toBe(true);
    expect(square.firstElementChild?.className).not.toBe(
      row.firstElementChild?.className,
    );
    // Only a band changes: the pair is 2×2 at every width already.
    expect(
      screen
        .getByRole("group", { name: "Pair" })
        .classList.contains(metricStyles.squareBand),
    ).toBe(false);
  });
});

describe("DescriptionList", () => {
  test("labels as terms and the values as their definitions, in order", () => {
    render(
      <DescriptionList>
        <DescriptionListItem label="Customer">
          Office workers
        </DescriptionListItem>
        <DescriptionListItem label="Market type">Red</DescriptionListItem>
      </DescriptionList>,
    );
    const list = screen.getByText("Customer").closest("dl") as HTMLElement;
    expect(list).not.toBeNull();
    expect(
      within(list)
        .getAllByRole("term")
        .map((term) => term.textContent),
    ).toEqual(["Customer", "Market type"]);
    expect(
      within(list)
        .getAllByRole("definition")
        .map((definition) => definition.textContent),
    ).toEqual(["Office workers", "Red"]);
  });
});

describe("RowList", () => {
  test("ordered rows are a numbered list; a row with href is one link ending in ›", async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(
      <RowList ordered aria-label="Next steps">
        <RowListItem href="#a" isEmphasized description="Why">
          Classify answers (3)
        </RowListItem>
        <RowListItem onPress={onPress} end="8/10">
          Start 02 Market
        </RowListItem>
        <RowListItem>Check permits</RowListItem>
      </RowList>,
    );
    const list = screen.getByRole("list", { name: "Next steps" });
    expect(list.tagName).toBe("OL");
    const link = screen.getByRole("link");
    expect(link.textContent).toBe("Classify answers (3)Why");
    expect(link.querySelector("svg")).not.toBeNull();
    await user.click(screen.getByRole("button"));
    expect(onPress).toHaveBeenCalledTimes(1);
    const items = within(list).getAllByRole("listitem");
    expect(items[2]?.querySelector("a, button, svg")).toBeNull();
    expect(items[0]?.className).not.toBe(items[1]?.className);
  });

  test("unordered rows are a plain list", () => {
    render(
      <RowList aria-label="Sections">
        <RowListItem>01</RowListItem>
      </RowList>,
    );
    expect(screen.getByRole("list").tagName).toBe("UL");
  });
});

describe("QuestionCard", () => {
  function Form() {
    const [focused, setFocused] = useState("WHO");
    return (
      <>
        {["WHO", "PROBLEM"].map((key) => (
          <QuestionCard
            key={key}
            title={key}
            question={`Question ${key}`}
            mode={focused === key ? "focused" : "quiet"}
            status={{ state: "assumption", label: "Assumption · Medium" }}
            excerpt={key === "WHO" ? "Office workers" : null}
            commentCount={key === "PROBLEM" ? 2 : 0}
            onFocusRequest={() => setFocused(key)}
          >
            <TextArea aria-label={`Answer ${key}`} />
          </QuestionCard>
        ))}
      </>
    );
  }

  beforeEach(() => {
    window.scrollBy = vi.fn();
  });

  test("focused: the title, its state, the question and the answer; quiet: the start of the answer", () => {
    render(<Form />);
    const who = screen.getByRole("region", { name: "WHO" });
    expect(within(who).getByText("Question WHO")).toBeTruthy();
    expect(within(who).getByRole("textbox")).toBeTruthy();
    const problem = screen.getByRole("region", { name: "PROBLEM" });
    expect(within(problem).queryByText("Question PROBLEM")).toBeNull();
    expect(within(problem).getByText("Empty")).toBeTruthy();
    const press = within(problem).getByRole("button", { name: "PROBLEM" });
    expect(press.closest("h2")).not.toBeNull();
    // Its description reads the state, the comments and the excerpt.
    const described = (press.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent)
      .join(" ");
    expect(described).toContain("Assumption · Medium");
    expect(described).toContain("2 comments");
    expect(described).toContain("Empty");
  });

  test("pressing a quiet card focuses it: its answer takes the focus and it scrolls to the middle", async () => {
    const user = userEvent.setup();
    render(<Form />);
    await user.click(screen.getByRole("button", { name: "PROBLEM" }));
    await settle();
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Answer PROBLEM" }),
    );
    expect(screen.queryByRole("textbox", { name: "Answer WHO" })).toBeNull();
    expect(window.scrollBy).toHaveBeenCalled();
  });

  test("Tab into a quiet question opens it with its answer focused", async () => {
    const user = userEvent.setup();
    render(<Form />);
    await user.click(screen.getByRole("textbox", { name: "Answer WHO" }));
    await user.tab();
    await settle();
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Answer PROBLEM" }),
    );
  });

  test("an open card moves when its answer is entered (Focus off), not for a Viewer's buttons", async () => {
    const user = userEvent.setup();
    render(
      <>
        <QuestionCard title="WHO" question="Who?" mode="open">
          <TextArea aria-label="Answer" />
        </QuestionCard>
        <QuestionCard
          title="WHY"
          question="Why?"
          mode="open"
          actions={<button type="button">Comments WHY</button>}
        >
          <TextArea aria-label="Read only" isReadOnly />
        </QuestionCard>
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Comments WHY" }));
    await user.click(screen.getByRole("textbox", { name: "Read only" }));
    expect(window.scrollBy).not.toHaveBeenCalled();
    await user.click(screen.getByRole("textbox", { name: "Answer" }));
    expect(window.scrollBy).toHaveBeenCalledTimes(1);
  });

  test("the F/A/U buttons and a read-only choice move nothing", async () => {
    const user = userEvent.setup();
    render(
      <>
        <QuestionCard title="WHO" question="Who?" mode="focused">
          <ToggleButtonGroup aria-label="F/A/U">
            <ToggleButton id="fact">Fact</ToggleButton>
          </ToggleButtonGroup>
        </QuestionCard>
        <QuestionCard title="OCEAN" question="Which ocean?" mode="open">
          <RadioGroup label="Ocean" isReadOnly defaultValue="red">
            <Radio value="red">Red</Radio>
            <Radio value="blue">Blue</Radio>
          </RadioGroup>
        </QuestionCard>
      </>,
    );
    await user.click(screen.getByRole("radio", { name: "Fact" }));
    await user.click(screen.getByRole("radio", { name: "Red" }));
    expect(window.scrollBy).not.toHaveBeenCalled();
  });

  test("open: the content without the frame; no status without F/A/U", () => {
    render(
      <QuestionCard title="WHY" question="Why?" mode="open" headingLevel={3}>
        <span>answer</span>
      </QuestionCard>,
    );
    expect(screen.getByRole("heading", { level: 3, name: "WHY" })).toBeTruthy();
    expect(screen.getByText("answer")).toBeTruthy();
    expect(screen.queryByText(/Assumption/)).toBeNull();
  });
});

describe("DiffText", () => {
  test("before strikes out what was removed, after underlines what was added", () => {
    render(
      <>
        <DiffText
          before="Office workers."
          after="Office staff in Bacolod."
          variant="before"
        />
        <DiffText
          before="Office workers."
          after="Office staff in Bacolod."
          variant="after"
        />
      </>,
    );
    const removed = [...document.querySelectorAll("del")].map(
      (node) => node.textContent,
    );
    const added = [...document.querySelectorAll("ins")].map(
      (node) => node.textContent,
    );
    const before = document.querySelector("del")?.parentElement?.textContent;
    const after = document.querySelector("ins")?.parentElement?.textContent;
    expect(removed.join("")).not.toBe("");
    expect(added.join("")).not.toBe("");
    expect(before).toBe("Office workers.");
    expect(after).toBe("Office staff in Bacolod.");
  });
});

test("DiffText: a long rewrite shows its text at once and its marks once worked out", async () => {
  const letters = (seed: number) =>
    Array.from(
      { length: 3000 },
      (_, index) => "abcdefgh "[(index * seed) % 9],
    ).join("");
  const before = letters(7);
  const after = letters(5);
  render(<DiffText before={before} after={after} variant="after" />);
  expect(screen.getByText(after)).toBeTruthy();
  expect(document.querySelector("ins")).toBeNull();
  await waitFor(() => expect(document.querySelector("ins")).not.toBeNull(), {
    timeout: 5000,
  });
  expect(document.querySelector("ins")?.parentElement?.textContent).toBe(after);
});

test("DiffText: many changes on one panel all get their marks", async () => {
  const letters = (seed: number) =>
    Array.from(
      { length: 2500 },
      (_, index) => "abcdefgh "[(index * seed) % 9],
    ).join("");
  const long = letters(5);
  render(
    <>
      <DiffText before={letters(7)} after={long} variant="after" />
      {Array.from({ length: 45 }, (_, index) => `Answer ${index}`).map(
        (answer) => (
          <span key={answer}>
            <DiffText
              before={answer}
              after={`${answer} edited`}
              variant="before"
            />
            <DiffText
              before={answer}
              after={`${answer} edited`}
              variant="after"
            />
          </span>
        ),
      )}
    </>,
  );
  await waitFor(
    () => {
      const added = [...document.querySelectorAll("ins")];
      expect(
        added.filter((mark) => mark.textContent === " edited"),
      ).toHaveLength(45);
      expect(
        added.some((mark) => mark.parentElement?.textContent === long),
      ).toBe(true);
    },
    { timeout: 4000 },
  );
});

describe("MentionTextArea", () => {
  const members: MentionCandidate[] = [
    { id: "u1", name: "Ana Reyes" },
    { id: "u2", name: "Kenji Sato" },
  ];

  function Comment({ initial = "" }: { initial?: string }) {
    const [text, setText] = useState(initial);
    const [mentions, setMentions] = useState<MentionCandidate[]>(
      initial.includes("@Ana Reyes") ? [members[0] as MentionCandidate] : [],
    );
    return (
      <>
        <MentionTextArea
          aria-label="Comment"
          value={text}
          onChange={setText}
          mentions={mentions}
          onMentionsChange={setMentions}
          candidates={members}
        />
        <output>{mentions.map((mention) => mention.id).join(",")}</output>
      </>
    );
  }

  test("@ and letters list the members; ↓ and Enter write @Name and record the mention", async () => {
    const user = userEvent.setup();
    render(<Comment />);
    const area = screen.getByRole("textbox", { name: "Comment" });
    await user.type(area, "Thanks @");
    const list = screen.getByRole("listbox", { name: "Members" });
    expect(within(list).getAllByRole("option")).toHaveLength(2);
    await user.keyboard("k");
    expect(
      within(list)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Kenji Sato"]);
    expect(area.getAttribute("aria-activedescendant")).toBe(
      within(list).getByRole("option").id,
    );
    await user.keyboard("{Enter}");
    expect(area).toHaveProperty("value", "Thanks @Kenji Sato ");
    expect(screen.getByRole("status").textContent).toBe("u2");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("Escape closes the list and keeps the text; ↑ wraps to the last member", async () => {
    const user = userEvent.setup();
    render(<Comment />);
    const area = screen.getByRole("textbox", { name: "Comment" });
    await user.type(area, "@");
    await user.keyboard("{ArrowUp}");
    const options = screen.getAllByRole("option");
    expect(options[1]?.getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(area).toHaveProperty("value", "@");
  });

  test("removing the name from the text drops the mention", async () => {
    const user = userEvent.setup();
    render(<Comment initial="Hi @Ana Reyes" />);
    expect(screen.getByRole("status").textContent).toBe("u1");
    const area = screen.getByRole("textbox", { name: "Comment" });
    await user.click(area);
    await user.keyboard("{End}{Backspace}");
    expect(screen.getByRole("status").textContent).toBe("");
  });

  test("after a name is chosen, typing on keeps the list closed; @ and a space is no mention", async () => {
    const user = userEvent.setup();
    render(<Comment />);
    const area = screen.getByRole("textbox", { name: "Comment" });
    await user.type(area, "@ana");
    await user.keyboard("{Enter}");
    expect(area).toHaveProperty("value", "@Ana Reyes ");
    await user.keyboard("and");
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.keyboard(" @ ");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("the caret moved onto a written name opens nothing; a read-only field never lists", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Comment initial="Hi @Ana Reyes" />);
    const area = screen.getByRole("textbox", {
      name: "Comment",
    }) as HTMLTextAreaElement;
    await user.click(area);
    await user.keyboard("{End}{ArrowLeft}");
    expect(screen.queryByRole("listbox")).toBeNull();
    unmount();
    render(
      <MentionTextArea
        aria-label="Locked"
        isReadOnly
        value="@"
        onChange={() => {}}
        mentions={[]}
        onMentionsChange={() => {}}
        candidates={members}
      />,
    );
    await user.click(screen.getByRole("textbox", { name: "Locked" }));
    await user.keyboard("{End}");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("the highlighted member follows the list as it narrows", async () => {
    const user = userEvent.setup();
    render(<Comment />);
    const area = screen.getByRole("textbox", { name: "Comment" });
    await user.type(area, "@");
    await user.keyboard("{ArrowDown}");
    await user.keyboard("a");
    const option = screen.getByRole("option");
    expect(option.getAttribute("aria-selected")).toBe("true");
    expect(area.getAttribute("aria-activedescendant")).toBe(option.id);
  });

  test("an @ inside a word is not a mention", async () => {
    const user = userEvent.setup();
    render(<Comment />);
    await user.type(screen.getByRole("textbox"), "mail@k");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("on a phone a tray opens on @, its input starting with the letters typed", async () => {
    setPhoneWidth();
    const user = userEvent.setup();
    render(<Comment />);
    await user.type(screen.getByRole("textbox", { name: "Comment" }), "@");
    const tray = screen.getByRole("dialog", { name: "Members" });
    const search = within(tray).getByRole("textbox", {
      name: i18n.t("components:mentionTextArea.search"),
    });
    await user.type(search, "an");
    expect(
      within(tray)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Ana Reyes"]);
    await user.click(within(tray).getByRole("option"));
    await settle();
    expect(screen.getByRole("textbox", { name: "Comment" })).toHaveProperty(
      "value",
      "@Ana Reyes ",
    );
    expect(screen.getByRole("status").textContent).toBe("u1");
  });
});

describe("Panel", () => {
  function Host() {
    const [isOpen, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(!isOpen)}>
          Comments
        </button>
        <Panel title="Comments" isOpen={isOpen} onOpenChange={setOpen}>
          <p>No comments yet</p>
        </Panel>
      </>
    );
  }

  afterEach(() => {
    window.happyDOM.setViewport({ width: 1024, height: 768 });
  });

  test("on a desktop a column beside the body: focus moves in; Escape closes and returns it", async () => {
    window.happyDOM.setViewport({ width: 1280, height: 900 });
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole("button", { name: "Comments" }));
    const panel = screen.getByRole("complementary", { name: "Comments" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(panel);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Comments" }),
    );
  });

  test("on a desktop its close button returns focus; another panel takes focus from its own button", async () => {
    window.happyDOM.setViewport({ width: 1280, height: 900 });
    const user = userEvent.setup();
    function Two() {
      const [open, setOpen] = useState<"Comments" | "History" | null>(null);
      return (
        <>
          <button type="button" onClick={() => setOpen("Comments")}>
            Open comments
          </button>
          <button type="button" onClick={() => setOpen("History")}>
            Open history
          </button>
          <Panel
            title={open ?? "Comments"}
            isOpen={open !== null}
            onOpenChange={(isOpen) => {
              if (!isOpen) setOpen(null);
            }}
          >
            <p>Body</p>
          </Panel>
        </>
      );
    }
    render(<Two />);
    await user.click(screen.getByRole("button", { name: "Open comments" }));
    await user.click(screen.getByRole("button", { name: "Open history" }));
    const history = screen.getByRole("complementary", { name: "History" });
    expect(document.activeElement).toBe(history);
    await user.click(
      within(history).getByRole("button", {
        name: i18n.t("components:panel.close"),
      }),
    );
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Open history" }),
    );
  });

  test("on a tablet a drawer and on a phone a tray, both modal with a close button", async () => {
    window.happyDOM.setViewport({ width: 820, height: 1180 });
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole("button", { name: "Comments" }));
    let dialog = screen.getByRole("dialog", { name: "Comments" });
    expect(within(dialog).getByText("No comments yet")).toBeTruthy();
    await user.click(
      within(dialog).getByRole("button", {
        name: i18n.t("components:panel.close"),
      }),
    );
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    setPhoneWidth();
    await user.click(screen.getByRole("button", { name: "Comments" }));
    dialog = screen.getByRole("dialog", { name: "Comments" });
    expect(dialog).toBeTruthy();
  });
});

const slide = (overrides: Partial<PitchSlide>): PitchSlide => ({
  key: "problem",
  type: "text",
  title: { text: "Problem", empty: false },
  subtitle: null,
  bullets: [],
  numbers: [],
  table: null,
  emptySources: [],
  shrink: 0,
  overflow: false,
  editSource: null,
  editInValidation: null,
  commentCount: 0,
  ...overrides,
});

describe("Slide", () => {
  // happy-dom drops lengths in cqw, so the sizes in shares of the slide's width are
  // checked in e2e/components.spec.ts.
  beforeEach(mockTextMeasure);
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("a text slide: its title at the level given, its bullets named, Not written yet grey", () => {
    render(
      <Slide
        headingLevel={2}
        footer="Piaya · Draft · Oct 16"
        currency="PHP"
        slide={slide({
          bullets: [
            { label: "Primary problem", text: "Stale boxes", empty: false },
            { label: "Frequency", text: "Not written yet", empty: true },
          ],
        })}
      />,
    );
    const region = screen.getByRole("region", { name: "Problem" });
    expect(within(region).getByRole("heading", { level: 2 })).toBeTruthy();
    const bullets = within(region).getAllByRole("listitem");
    expect(bullets.map((bullet) => bullet.textContent)).toEqual([
      `${i18n.t("pitch:bullet")}${i18n.t("pitch:label", { label: "Primary problem" })}Stale boxes`,
      `${i18n.t("pitch:bullet")}${i18n.t("pitch:label", { label: "Frequency" })}Not written yet`,
    ]);
    const empty = within(region).getByText("Not written yet");
    expect(empty.className).not.toBe(
      within(region).getByText("Stale boxes").className,
    );
    expect(within(region).getByText("Piaya · Draft · Oct 16")).toBeTruthy();
  });

  test("a number slide's figures share the width as the PDF's do; a reason replaces a missing value", () => {
    render(
      <Slide
        footer=""
        currency="PHP"
        slide={slide({
          key: "business_model",
          type: "number",
          title: { text: "Business model", empty: false },
          numbers: [
            {
              label: "Price",
              metricKey: "selling_price",
              value: { value: 450, bound: "exact", reason: null },
            },
            {
              label: "Break-even / day",
              metricKey: "break_even_units_day",
              value: { value: null, bound: "exact", reason: "needs_price" },
            },
          ],
        })}
      />,
    );
    const terms = screen.getAllByRole("term").map((term) => term.textContent);
    expect(terms).toEqual(["Price", "Break-even / day"]);
    const values = screen.getAllByRole("definition");
    expect(values[0]?.textContent).toBe("₱450");
    expect(values[1]?.textContent).toBe(
      i18n.t("common:metricReason.needs_price"),
    );
    expect(values[1]?.className).not.toBe(values[0]?.className);
  });

  test("a table slide: its columns, numbers in their own cells, no rows as Not written yet", () => {
    const table = {
      columns: [
        { label: "Name", numeric: false, width: 0.6 },
        { label: "Price", numeric: true, width: 0.4 },
      ],
      rows: [["Kiosk", "₱450"]],
    };
    const { rerender } = render(
      <Slide
        footer=""
        currency="PHP"
        slide={slide({
          type: "table",
          title: { text: "Competition", empty: false },
          table,
        })}
      />,
    );
    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent),
    ).toEqual(["Name", "Price"]);
    const [name, price] = screen.getAllByRole("cell");
    expect(price?.className).not.toBe(name?.className);
    rerender(
      <Slide
        footer=""
        currency="PHP"
        slide={slide({
          type: "table",
          title: { text: "Competition", empty: false },
          table: { ...table, rows: [] },
        })}
      />,
    );
    expect(screen.getByRole("cell").textContent).toBe(
      i18n.t("pitch:notWrittenYet"),
    );
  });

  test("a number column's heading is set apart from its numbers' face", () => {
    render(
      <Slide
        footer=""
        currency="PHP"
        slide={slide({
          type: "table",
          title: { text: "Competition", empty: false },
          table: {
            columns: [{ label: "Price", numeric: true, width: 1 }],
            rows: [["₱450"]],
          },
        })}
      />,
    );
    expect(screen.getByRole("columnheader").className).not.toBe(
      screen.getByRole("cell").className,
    );
  });

  test("the title slide: the name, the subtitle, the rule and the three lines", () => {
    render(
      <Slide
        footer=""
        currency="PHP"
        slide={slide({
          key: "title",
          type: "title",
          title: { text: "Not written yet", empty: true },
          subtitle: { text: "Gift boxes", empty: false },
          bullets: [{ label: "Prepared by", text: "Ana", empty: false }],
        })}
      />,
    );
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe(
      "Not written yet",
    );
    expect(screen.getByRole("separator")).toBeTruthy();
    expect(screen.getByRole("listitem").textContent).not.toContain(
      i18n.t("pitch:bullet"),
    );
    // Its lines sit together, without the gap between bullets.
    expect(screen.getByRole("list").style.rowGap).toBe("0");
  });
});

describe("Steps", () => {
  const steps = [
    { id: "paste", label: "Paste" },
    { id: "sort", label: "Sort" },
    { id: "review", label: "Review" },
  ];

  test("the current step is marked; the done ones read their label after the name", () => {
    render(
      <Steps
        aria-label="Import"
        steps={steps}
        currentId="sort"
        doneLabel="completed"
      />,
    );
    const items = within(
      screen.getByRole("list", { name: "Import" }),
    ).getAllByRole("listitem");
    expect(items.map((item) => item.getAttribute("aria-current"))).toEqual([
      null,
      "step",
      null,
    ]);
    expect(items[0]?.textContent).toContain("Paste completed");
    expect(items[0]?.querySelector("svg")).not.toBeNull();
    expect(items[2]?.textContent).toBe("3Review");
  });

  test("an unknown current step is an error", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(<Steps steps={steps} currentId="apply" doneLabel="completed" />),
    ).toThrow('no step "apply"');
    vi.restoreAllMocks();
  });
});
