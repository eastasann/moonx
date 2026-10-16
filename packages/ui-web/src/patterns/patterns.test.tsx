import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AppFrame } from "../components/AppFrame";
import { QuestionCard } from "../components/QuestionCard";
import { TextArea } from "../components/TextField";
import { setPhoneWidth, setTabletWidth, settle } from "../test/helpers";
import { CardComparePattern } from "./CardComparePattern";
import { FocusPattern } from "./FocusPattern";
import { HubPattern } from "./HubPattern";
import { ListDetailPattern } from "./ListDetailPattern";
import { PresentationPattern } from "./PresentationPattern";
import { PublicPattern } from "./PublicPattern";
import { QuestionFormPattern } from "./QuestionFormPattern";
import { SettingsPattern } from "./SettingsPattern";
import { StepsPattern } from "./StepsPattern";
import { WorksheetPattern } from "./WorksheetPattern";

// The layout patterns of design-spec 4.1: what each puts where at each width, and the
// operations they own. Their measured places in a browser are in e2e/components.spec.ts.

const follows = (first: Element, second: Element) =>
  Boolean(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
  );

describe("HubPattern (A)", () => {
  const hub = () =>
    render(
      <HubPattern
        header={<h1>Piaya Gift Box</h1>}
        actions={<button type="button">Edit summary</button>}
        primaryAction={<button type="button">Record decision</button>}
        metrics={<p>Metrics</p>}
        blocks={[
          { id: "next", column: "main", content: <p>Next steps</p> },
          { id: "sections", column: "aside", content: <p>Sections</p> },
          { id: "summary", column: "main", content: <p>Summary</p> },
        ]}
      />,
    );
  const block = (name: string) =>
    screen.getByText(name).parentElement as HTMLElement;

  test("desktop: the main action beside the title; each block in its column", () => {
    hub();
    const decide = screen.getByRole("button", { name: "Record decision" });
    const edit = screen.getByRole("button", { name: "Edit summary" });
    expect(decide.parentElement).toBe(edit.parentElement);
    expect(block("Next steps").parentElement).toBe(
      block("Summary").parentElement,
    );
    expect(block("Sections").parentElement).not.toBe(
      block("Next steps").parentElement,
    );
    expect(follows(screen.getByText("Metrics"), block("Next steps"))).toBe(
      true,
    );
  });

  test("tablet: one column whose document order is the listed order", () => {
    setTabletWidth();
    hub();
    // Reading and Tab order follow the document, so it must be the order shown.
    expect(follows(block("Next steps"), block("Sections"))).toBe(true);
    expect(follows(block("Sections"), block("Summary"))).toBe(true);
    expect(block("Next steps").parentElement).toBe(
      block("Sections").parentElement,
    );
    const decide = screen.getByRole("button", { name: "Record decision" });
    expect(decide.parentElement).toBe(
      screen.getByRole("button", { name: "Edit summary" }).parentElement,
    );
  });

  test("phone: the main action fixed under the content", () => {
    setPhoneWidth();
    hub();
    const decide = screen.getByRole("button", { name: "Record decision" });
    const edit = screen.getByRole("button", { name: "Edit summary" });
    expect(decide.parentElement).not.toBe(edit.parentElement);
    expect(follows(screen.getByText("Summary"), decide)).toBe(true);
  });

  test("phone: the bottom bar rises by the height the keyboard covers (4.3)", async () => {
    setPhoneWidth();
    const viewport = Object.assign(new EventTarget(), {
      height: window.innerHeight - 300,
      offsetTop: 0,
      width: 390,
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport,
    });
    try {
      hub();
      const bar = screen.getByRole("button", { name: "Record decision" })
        .parentElement as HTMLElement;
      // The inset is the one variable the bar's style attribute sets.
      const inset = () =>
        /:\s*(\d+px)/.exec(bar.getAttribute("style") ?? "")?.[1];
      expect(inset()).toBe("300px");
      viewport.height = window.innerHeight;
      viewport.dispatchEvent(new Event("resize"));
      await settle();
      await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));
      expect(inset()).toBe("0px");
    } finally {
      Reflect.deleteProperty(window, "visualViewport");
    }
  });
});

describe("FocusPattern (B)", () => {
  test("the material, the fields, then the one main action", () => {
    render(
      <FocusPattern
        header={<h1>Decide</h1>}
        primaryAction={<button type="button">Record decision</button>}
      >
        <p>Material</p>
        <p>Fields</p>
      </FocusPattern>,
    );
    const fields = screen.getByText("Fields");
    expect(follows(screen.getByText("Material"), fields)).toBe(true);
    expect(
      follows(fields, screen.getByRole("button", { name: "Record decision" })),
    ).toBe(true);
  });
});

describe("QuestionFormPattern (C)", () => {
  afterEach(() => window.localStorage.clear());

  const ids = ["WHO", "WHY", "PROBLEM"];

  function Form({
    isReadOnly,
    onEnd,
  }: {
    isReadOnly?: boolean;
    onEnd?: () => void;
  }) {
    const [current, setCurrent] = useState<string | null>("WHO");
    return (
      <QuestionFormPattern
        header={<h1>01 Customer & Problem</h1>}
        questionIds={ids}
        currentId={current}
        onCurrentChange={setCurrent}
        isReadOnly={isReadOnly}
        onEnd={onEnd}
        footer={<button type="button">Next: 02 Market</button>}
        progress={<span>dots</span>}
        renderQuestion={(id, mode) => (
          <QuestionCard
            title={id}
            question={`Question ${id}`}
            mode={mode}
            excerpt={null}
            onFocusRequest={() => setCurrent(id)}
          >
            <TextArea aria-label={`Answer ${id}`} />
          </QuestionCard>
        )}
      />
    );
  }

  test("Focus on: the current question open, the others quiet", () => {
    render(<Form />);
    expect(screen.getByRole("textbox", { name: "Answer WHO" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Answer WHY" })).toBeNull();
    expect(screen.getByRole("button", { name: "WHY" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Focus" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Next: 02 Market" }),
    ).toBeTruthy();
  });

  test("Focus off opens every question, and the device keeps the choice", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Form />);
    const focus = screen.getByRole("switch", { name: "Focus" });
    expect((focus as HTMLInputElement).checked).toBe(true);
    await user.click(focus);
    expect(screen.getAllByRole("textbox")).toHaveLength(3);
    expect(window.localStorage.getItem("moonx:question-form:focus")).toBe(
      "off",
    );
    unmount();
    render(<Form />);
    expect(
      (screen.getByRole("switch", { name: "Focus" }) as HTMLInputElement)
        .checked,
    ).toBe(false);
    expect(screen.getAllByRole("textbox")).toHaveLength(3);
  });

  test("read-only: every question open and no Focus switch (6.2 Viewer)", () => {
    render(<Form isReadOnly />);
    expect(screen.getAllByRole("textbox")).toHaveLength(3);
    expect(screen.queryByRole("switch")).toBeNull();
  });

  test("Ctrl+↓ and Ctrl+↑ move to the next and previous question", async () => {
    const user = userEvent.setup();
    render(<Form />);
    await user.click(screen.getByRole("textbox", { name: "Answer WHO" }));
    await user.keyboard("{Control>}{ArrowDown}{/Control}");
    // The quiet WHY took focus, opened, and gave focus to its answer.
    await settle();
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Answer WHY" }),
    );
    await user.keyboard("{Control>}{ArrowUp}{/Control}");
    await settle();
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Answer WHO" }),
    );
  });

  test("Ctrl+↓ with Focus off moves to the next answer", async () => {
    const user = userEvent.setup();
    render(<Form />);
    await user.click(screen.getByRole("switch", { name: "Focus" }));
    await user.click(screen.getByRole("textbox", { name: "Answer WHY" }));
    await user.keyboard("{Control>}{ArrowDown}{/Control}");
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Answer PROBLEM" }),
    );
  });

  test("phone: one question at a time, ← and → at the bottom", async () => {
    const user = userEvent.setup();
    setPhoneWidth();
    const onEnd = vi.fn();
    render(<Form onEnd={onEnd} />);
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.queryByRole("switch")).toBeNull();
    // The footer stays, under the one question (6.2's AI ▼ is on a phone too).
    expect(
      screen.getByRole("button", { name: "Next: 02 Market" }),
    ).toBeTruthy();
    expect(screen.getByText("dots")).toBeTruthy();
    const previous = screen.getByRole("button", { name: "Previous question" });
    const next = screen.getByRole("button", { name: "Next question" });
    expect(previous.hasAttribute("disabled")).toBe(true);
    await user.click(next);
    expect(screen.getByRole("textbox", { name: "Answer WHY" })).toBeTruthy();
    await user.click(next);
    await user.click(next);
    expect(onEnd).toHaveBeenCalledOnce();
    await user.click(previous);
    expect(screen.getByRole("textbox", { name: "Answer WHY" })).toBeTruthy();
  });

  test("phone: the footer stays under the one question", () => {
    setPhoneWidth();
    render(
      <QuestionFormPattern
        header={<h1>Section</h1>}
        questionIds={["WHO", "WHY"]}
        currentId={null}
        onCurrentChange={() => {}}
        footer={<button type="button">AI</button>}
        renderQuestion={(id) => (
          <TextArea aria-label={`Answer ${id}`} defaultValue={`About ${id}`} />
        )}
      />,
    );
    expect(screen.getByRole("button", { name: "AI" })).toBeTruthy();
    expect(
      (
        screen.getByRole("textbox", {
          name: "Answer WHO",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("About WHO");
  });

  test("phone: → shows the next question's own field, not the last one's", async () => {
    const user = userEvent.setup();
    setPhoneWidth();
    function Answers() {
      const [current, setCurrent] = useState<string | null>("WHO");
      return (
        <QuestionFormPattern
          header={<h1>Section</h1>}
          questionIds={["WHO", "WHY"]}
          currentId={current}
          onCurrentChange={setCurrent}
          renderQuestion={(id) => (
            <TextArea
              aria-label={`Answer ${id}`}
              defaultValue={`About ${id}`}
            />
          )}
        />
      );
    }
    render(<Answers />);
    await user.click(screen.getByRole("button", { name: "Next question" }));
    expect(
      (
        screen.getByRole("textbox", {
          name: "Answer WHY",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("About WHY");
  });

  test("Ctrl+Shift+↓ is left to the field (selecting to the paragraph's end)", async () => {
    const user = userEvent.setup();
    render(<Form />);
    await user.click(screen.getByRole("textbox", { name: "Answer WHO" }));
    await user.keyboard("{Control>}{Shift>}{ArrowDown}{/Shift}{/Control}");
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Answer WHO" }),
    );
  });

  test("phone, last question, no end: → is off", () => {
    setPhoneWidth();
    render(
      <QuestionFormPattern
        header={<h1>Section</h1>}
        questionIds={["ONE"]}
        currentId="ONE"
        onCurrentChange={() => {}}
        renderQuestion={(id) => <p>{id}</p>}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: "Next question" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
});

describe("ListDetailPattern (D)", () => {
  function List() {
    const [selected, setSelected] = useState<string | null>("piaya");
    return (
      <ListDetailPattern
        header={<h1>Ideas</h1>}
        list={
          <ul>
            <li>
              <button type="button" onClick={() => setSelected("piaya")}>
                Piaya
              </button>
            </li>
          </ul>
        }
        detail={selected === null ? null : <p>Detail of {selected}</p>}
        listLabel="Ideas"
        onBack={() => setSelected(null)}
        floatingAction={<button type="button">New idea</button>}
      />
    );
  }

  test("desktop: the header over both panes, the new item at its end", () => {
    render(<List />);
    expect(screen.getByRole("button", { name: "Piaya" })).toBeTruthy();
    expect(screen.getByText("Detail of piaya")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back to Ideas" })).toBeNull();
    const row = screen.getByRole("button", { name: "New idea" }).parentElement;
    expect(row?.contains(screen.getByRole("heading", { name: "Ideas" }))).toBe(
      true,
    );
    // Above the panes, not inside the list's.
    expect(row?.contains(screen.getByRole("button", { name: "Piaya" }))).toBe(
      false,
    );
  });

  test("tablet: one pane; ← goes back to the list; focus follows the pane", async () => {
    const user = userEvent.setup();
    setTabletWidth();
    render(<List />);
    expect(screen.queryByRole("button", { name: "Piaya" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Back to Ideas" }));
    const piaya = screen.getByRole("button", { name: "Piaya" });
    expect(screen.queryByText(/Detail of/)).toBeNull();
    await user.click(piaya);
    const detail = screen.getByText("Detail of piaya").parentElement;
    // The list item that had focus went with the list: the detail takes it.
    expect(document.activeElement).toBe(detail);
    await user.click(screen.getByRole("button", { name: "Back to Ideas" }));
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Piaya" }),
    );
  });

  test("phone in AppFrame: the header's ← goes back to the list, the only ←", async () => {
    const user = userEvent.setup();
    setPhoneWidth();
    render(
      <AppFrame sideNav={null} tabBar={null}>
        <List />
      </AppFrame>,
    );
    const back = screen.getAllByRole("button", { name: "Back to Ideas" });
    expect(back).toHaveLength(1);
    expect(document.querySelector("header")?.contains(back[0] as Node)).toBe(
      true,
    );
    await user.click(back[0] as HTMLElement);
    // The ← went with the detail: focus is on the list, not lost.
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Piaya" }),
    );
    // Back on the list, the header has nothing left to show.
    expect(document.querySelector("header")).toBeNull();
  });

  test("phone: the new item floats after the list, with the list only", async () => {
    const user = userEvent.setup();
    setPhoneWidth();
    render(<List />);
    expect(screen.queryByRole("button", { name: "New idea" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Back to Ideas" }));
    const action = screen.getByRole("button", { name: "New idea" });
    expect(follows(screen.getByRole("list"), action)).toBe(true);
  });

  test("no detail area (8): the list alone", () => {
    render(
      <ListDetailPattern
        hasDetail={false}
        header={<h1>Notifications</h1>}
        list={<p>Notifications list</p>}
      />,
    );
    expect(screen.getByText("Notifications list")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("CardComparePattern (E)", () => {
  function Compare() {
    const [view, setView] = useState<"cards" | "table">("cards");
    return (
      <CardComparePattern
        header={<h1>Competitors</h1>}
        view={view}
        onViewChange={setView}
        cards={<p>Cards</p>}
        table={<p>Table</p>}
      />
    );
  }

  test("Cards / Table switches between the cards and the table", async () => {
    const user = userEvent.setup();
    render(<Compare />);
    const group = screen.getByRole("radiogroup", { name: "View" });
    expect(screen.getByText("Cards", { selector: "p" })).toBeTruthy();
    await user.click(within(group).getByRole("radio", { name: "Table" }));
    expect(screen.getByText("Table", { selector: "p" })).toBeTruthy();
    expect(screen.queryByText("Cards", { selector: "p" })).toBeNull();
  });

  test("phone: the cards only, no switch", () => {
    setPhoneWidth();
    render(
      <CardComparePattern
        header={<h1>Competitors</h1>}
        primaryAction={<button type="button">Add competitor</button>}
        view="table"
        onViewChange={() => {}}
        cards={<p>Cards</p>}
        table={<p>Table</p>}
      />,
    );
    expect(screen.queryByRole("radiogroup")).toBeNull();
    // The main action under the cards, fixed to the bottom.
    expect(
      follows(
        screen.getByText("Cards"),
        screen.getByRole("button", { name: "Add competitor" }),
      ),
    ).toBe(true);
    expect(screen.getByText("Cards")).toBeTruthy();
    expect(screen.queryByText("Table")).toBeNull();
  });
});

describe("WorksheetPattern (F)", () => {
  const worksheet = () =>
    render(
      <WorksheetPattern
        header={<h1>05 Costs</h1>}
        inputs={<p>Inputs</p>}
        results={<p>Totals in full</p>}
        resultsTitle="Totals"
        summary={<span>Startup ₱19,500</span>}
      />,
    );

  test("desktop: the results beside the inputs, no summary bar", () => {
    worksheet();
    const results = screen.getByRole("complementary", { name: "Totals" });
    expect(results.textContent).toBe("Totals in full");
    expect(screen.queryByText("Startup ₱19,500")).toBeNull();
  });

  for (const [width, setWidth] of [
    ["tablet", setTabletWidth],
    ["phone", setPhoneWidth],
  ] as const) {
    test(`${width}: the summary bar opens the results`, async () => {
      const user = userEvent.setup();
      setWidth();
      worksheet();
      expect(screen.queryByText("Totals in full")).toBeNull();
      const summary = screen.getByRole("button", { name: /Startup ₱19,500/ });
      expect(summary.getAttribute("aria-expanded")).toBe("false");
      await user.click(summary);
      await settle();
      const dialog = await screen.findByRole("dialog", { name: "Totals" });
      expect(within(dialog).getByText("Totals in full")).toBeTruthy();
    });
  }
});

test("WorksheetPattern: a drawer left open closes on a desktop and stays closed", async () => {
  const user = userEvent.setup();
  setTabletWidth();
  render(
    <WorksheetPattern
      inputs={<p>Inputs</p>}
      results={<p>Totals in full</p>}
      resultsTitle="Totals"
      summary={<span>Startup ₱19,500</span>}
    />,
  );
  await user.click(screen.getByRole("button", { name: /Startup/ }));
  await screen.findByRole("dialog", { name: "Totals" });
  act(() => window.happyDOM.setViewport({ width: 1280, height: 900 }));
  await settle();
  expect(screen.queryByRole("dialog")).toBeNull();
  setTabletWidth();
  await settle();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    screen
      .getByRole("button", { name: /Startup/ })
      .getAttribute("aria-expanded"),
  ).toBe("false");
});

describe("StepsPattern (G)", () => {
  test("steps, content, the diff's two sides, then the step's buttons", () => {
    render(
      <StepsPattern
        header={<h1>Import from AI</h1>}
        steps={<ol aria-label="Steps" />}
        comparison={{ before: <p>Current</p>, after: <p>From AI</p> }}
        actions={<button type="button">Apply</button>}
      >
        <p>Review</p>
      </StepsPattern>,
    );
    const steps = screen.getByRole("list", { name: "Steps" });
    const before = screen.getByText("Current");
    expect(follows(steps, screen.getByText("Review"))).toBe(true);
    expect(follows(before, screen.getByText("From AI"))).toBe(true);
    expect(
      follows(
        screen.getByText("From AI"),
        screen.getByRole("button", { name: "Apply" }),
      ),
    ).toBe(true);
  });
});

describe("SettingsPattern (H)", () => {
  test("each group a region named by its heading", () => {
    render(
      <SettingsPattern
        header={<h1>Account</h1>}
        groups={[
          { id: "profile", title: "Profile", content: <p>Name</p> },
          { id: "display", title: "Display", content: <p>Theme</p> },
        ]}
      />,
    );
    const profile = screen.getByRole("region", { name: "Profile" });
    expect(
      within(profile).getByRole("heading", { level: 2, name: "Profile" }),
    ).toBeTruthy();
    expect(within(profile).getByText("Name")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Display" })).toBeTruthy();
  });
});

describe("PresentationPattern (I)", () => {
  const deck = () =>
    render(
      <PresentationPattern
        header={<h1>Pitch Deck</h1>}
        primaryAction={<button type="button">Download PDF</button>}
        thumbnails={<p>Thumbnails</p>}
        slide={<p>Slide 3</p>}
        notes={<p>Notes</p>}
        slides={<p>Every slide</p>}
      />,
    );

  test("desktop and tablet: thumbnails, the slide and its notes", () => {
    setTabletWidth();
    deck();
    expect(screen.getByText("Thumbnails")).toBeTruthy();
    expect(
      follows(screen.getByText("Slide 3"), screen.getByText("Notes")),
    ).toBe(true);
    expect(screen.queryByText("Every slide")).toBeNull();
    // The main action beside the title, before the slides.
    expect(
      follows(
        screen.getByRole("button", { name: "Download PDF" }),
        screen.getByText("Thumbnails"),
      ),
    ).toBe(true);
  });

  test("phone: every slide, one under another, then the notes", () => {
    setPhoneWidth();
    deck();
    expect(screen.getByText("Every slide")).toBeTruthy();
    expect(screen.queryByText("Thumbnails")).toBeNull();
    expect(
      follows(screen.getByText("Every slide"), screen.getByText("Notes")),
    ).toBe(true);
    expect(
      follows(
        screen.getByText("Notes"),
        screen.getByRole("button", { name: "Download PDF" }),
      ),
    ).toBe(true);
  });
});

describe("PublicPattern (J)", () => {
  test("the top bar, the sections, the foot", () => {
    render(
      <PublicPattern header={<p>moonx</p>} footer={<p>Privacy</p>}>
        <h1>Start a local business</h1>
      </PublicPattern>,
    );
    const heading = screen.getByRole("heading", { level: 1 });
    expect(follows(screen.getByText("moonx"), heading)).toBe(true);
    expect(follows(heading, screen.getByText("Privacy"))).toBe(true);
  });
});
