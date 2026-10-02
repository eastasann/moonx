import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestionCard } from "../src/components/QuestionCard";
import {
  CardComparePattern,
  DiffColumns,
  FocusPattern,
  HubPattern,
  ListDetailPattern,
  PresentationPattern,
  PublicPattern,
  QuestionFormPattern,
  SettingsPattern,
  StepsPattern,
  WorksheetPattern,
} from "../src/layout";
import { expectNoAxeViolations } from "./axe";
import { mockNarrow } from "./matchMedia";

const pinned = (name: string) => screen.getByRole("button", { name }).parentElement as HTMLElement;
const precedes = (a: Node, b: Node) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("A HubPattern", () => {
  const hub = (props = {}) => (
    <HubPattern
      header={<h1>Idea</h1>}
      summary={<p>summary</p>}
      nextSteps={<p>next</p>}
      status={<p>status</p>}
      entries={<p>entries</p>}
      history={<p>history</p>}
      actions={<button type="button">Record</button>}
      {...props}
    />
  );

  test("renders every slot and the actions", () => {
    render(hub());
    for (const text of ["Idea", "summary", "next", "status", "entries", "history"]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Record" })).toBeInTheDocument();
  });

  test("stacks in DOM order: summary, next steps, status, entries, history", () => {
    render(hub());
    const order = ["summary", "next", "status", "entries", "history"].map((t) =>
      screen.getByText(t),
    );
    for (let i = 0; i < order.length - 1; i++) {
      expect(precedes(order[i] as Node, order[i + 1] as Node)).toBe(true);
    }
  });

  test("keeps summary, next steps and status in the left column, entries and history in the right", () => {
    render(hub());
    const left = screen.getByText("summary").parentElement?.parentElement as HTMLElement;
    const right = screen.getByText("entries").parentElement?.parentElement as HTMLElement;
    expect(left).toContainElement(screen.getByText("next"));
    expect(left).toContainElement(screen.getByText("status"));
    expect(left).not.toContainElement(screen.getByText("entries"));
    expect(right).toContainElement(screen.getByText("history"));
  });

  test("omits optional slots", () => {
    render(<HubPattern status={<p>status</p>} entries={<p>entries</p>} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("has no axe violations", async () => {
    const { container } = render(hub());
    await expectNoAxeViolations(container);
  });
});

describe("pinned actions and hasTabBar", () => {
  const actions = <button type="button">Go</button>;

  test("sit above the tab bar by default and drop to the bottom without one", () => {
    const { rerender } = render(<FocusPattern actions={actions}>body</FocusPattern>);
    expect(pinned("Go")).toHaveAttribute("data-tab-bar", "true");
    rerender(
      <FocusPattern actions={actions} hasTabBar={false}>
        body
      </FocusPattern>,
    );
    expect(pinned("Go")).toHaveAttribute("data-tab-bar", "false");
  });

  test.each([
    [
      "A",
      (p: object) => (
        <HubPattern status="s" entries="e" actions={<button type="button">Go</button>} {...p} />
      ),
    ],
    [
      "C",
      (p: object) => (
        <QuestionFormPattern actions={<button type="button">Go</button>} {...p}>
          q
        </QuestionFormPattern>
      ),
    ],
    [
      "G",
      (p: object) => (
        <StepsPattern steps="steps" actions={<button type="button">Go</button>} {...p}>
          c
        </StepsPattern>
      ),
    ],
  ])("pattern %s forwards hasTabBar", (_name, make) => {
    const { rerender } = render(make({}));
    expect(pinned("Go")).toHaveAttribute("data-tab-bar", "true");
    rerender(make({ hasTabBar: false }));
    expect(pinned("Go")).toHaveAttribute("data-tab-bar", "false");
  });

  test("render nothing when there are no actions", () => {
    const { container } = render(<FocusPattern>body</FocusPattern>);
    expect(container.querySelector("[data-tab-bar]")).toBeNull();
  });
});

describe("B FocusPattern", () => {
  test("renders header, evidence above the input, and actions", async () => {
    const { container } = render(
      <FocusPattern
        header={<h1>Decide</h1>}
        evidence={<p>evidence</p>}
        actions={<button type="button">Save</button>}
      >
        <p>input</p>
      </FocusPattern>,
    );
    expect(screen.getByText("Decide")).toBeInTheDocument();
    expect(precedes(screen.getByText("evidence"), screen.getByText("input"))).toBe(true);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});

describe("C QuestionFormPattern", () => {
  const form = (focused: number | null, extra = {}) => (
    <QuestionFormPattern
      header={<h1>Self analysis</h1>}
      actions={<button type="button">Next</button>}
      {...extra}
    >
      {[0, 1, 2].map((i) => (
        <QuestionCard key={i} title={`Q${i}`} emptyLabel="Empty" isFocused={focused === i} />
      ))}
    </QuestionFormPattern>
  );

  test("renders header, questions and actions", () => {
    render(form(0));
    expect(screen.getByText("Self analysis")).toBeInTheDocument();
    expect(screen.getByText("Q2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
  });

  test("sees the QuestionCard contract: exactly the focused card is data-focused=true", () => {
    const { container } = render(form(1));
    const cards = [...container.querySelectorAll("[data-question-card]")];
    expect(cards.map((c) => c.getAttribute("data-focused"))).toEqual(["false", "true", "false"]);
  });

  test("with no focused card every card is data-focused=false, which the frame leaves visible", () => {
    const { container } = render(form(null));
    const cards = [...container.querySelectorAll("[data-question-card]")];
    expect(cards).toHaveLength(3);
    expect(container.querySelector('[data-focused="true"]')).toBeNull();
  });

  test("has no axe violations", async () => {
    const { container } = render(form(0));
    await expectNoAxeViolations(container);
  });
});

describe("D ListDetailPattern", () => {
  const pane = (text: string) => screen.getByText(text).parentElement as HTMLElement;

  test("toggles the hidden pane with detailOpen", () => {
    const { rerender } = render(
      <ListDetailPattern header={<h1>Ideas</h1>} list={<p>list</p>} detail={<p>detail</p>} />,
    );
    expect(screen.getByText("Ideas")).toBeInTheDocument();
    expect(pane("list")).toHaveAttribute("data-hidden", "false");
    expect(pane("detail")).toHaveAttribute("data-hidden", "true");
    rerender(<ListDetailPattern list={<p>list</p>} detail={<p>detail</p>} detailOpen />);
    expect(pane("list")).toHaveAttribute("data-hidden", "true");
    expect(pane("detail")).toHaveAttribute("data-hidden", "false");
  });

  test("has no axe violations", async () => {
    const { container } = render(<ListDetailPattern list={<p>list</p>} detail={<p>detail</p>} />);
    await expectNoAxeViolations(container);
  });
});

describe("E CardComparePattern", () => {
  test("renders toolbar and cards", async () => {
    const { container } = render(
      <CardComparePattern header={<h1>Competitors</h1>} toolbar={<p>toolbar</p>}>
        <p>card 1</p>
        <p>card 2</p>
      </CardComparePattern>,
    );
    expect(screen.getByText("toolbar")).toBeInTheDocument();
    expect(precedes(screen.getByText("toolbar"), screen.getByText("card 1"))).toBe(true);
    expect(screen.getByText("card 2")).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});

describe("F WorksheetPattern", () => {
  const sheet = () => (
    <WorksheetPattern
      header={<h1>Costs</h1>}
      input={<p>input</p>}
      result={<p>full result</p>}
      resultSummary={<span>Total 1,000</span>}
      resultLabel="Result"
    />
  );

  test("on desktop shows the result pane and no summary bar", async () => {
    mockNarrow(false);
    const { container } = render(sheet());
    expect(screen.getByText("full result")).toBeInTheDocument();
    expect(screen.queryByText("Total 1,000")).toBeNull();
    await expectNoAxeViolations(container);
  });

  test("below desktop the summary opens the result in a tray", async () => {
    mockNarrow(true);
    const user = userEvent.setup();
    const { container } = render(sheet());
    expect(screen.queryByText("full result")).toBeNull();
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("button", { name: "Total 1,000" }));
    const dialog = await screen.findByRole("dialog", { name: "Result" });
    expect(dialog).toHaveTextContent("full result");
    expect(screen.getAllByText("full result")).toHaveLength(1);
  });

  test("the summary bar follows hasTabBar", () => {
    mockNarrow(true);
    const { rerender } = render(sheet());
    expect(screen.getByRole("button", { name: "Total 1,000" }).parentElement).toHaveAttribute(
      "data-tab-bar",
      "true",
    );
    rerender(
      <WorksheetPattern
        input="i"
        result="r"
        resultSummary={<span>Total 1,000</span>}
        resultLabel="Result"
        hasTabBar={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Total 1,000" }).parentElement).toHaveAttribute(
      "data-tab-bar",
      "false",
    );
  });
});

describe("G StepsPattern and DiffColumns", () => {
  test("renders steps above the content, and actions", async () => {
    const { container } = render(
      <StepsPattern
        header={<h1>Import</h1>}
        steps={
          <ol>
            <li>Paste</li>
          </ol>
        }
        actions={<button type="button">Continue</button>}
      >
        <p>content</p>
      </StepsPattern>,
    );
    expect(precedes(screen.getByText("Paste"), screen.getByText("content"))).toBe(true);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  test("DiffColumns renders before then after", async () => {
    const { container } = render(<DiffColumns before={<p>old</p>} after={<p>new</p>} />);
    expect(precedes(screen.getByText("old"), screen.getByText("new"))).toBe(true);
    await expectNoAxeViolations(container);
  });
});

describe("H SettingsPattern", () => {
  test("renders header and groups", async () => {
    const { container } = render(
      <SettingsPattern header={<h1>Account</h1>}>
        <p>group</p>
      </SettingsPattern>,
    );
    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByText("group")).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});

describe("I PresentationPattern", () => {
  test("renders thumbnails before the slides", async () => {
    const { container } = render(
      <PresentationPattern header={<h1>Deck</h1>} thumbnails={<p>thumbs</p>}>
        <p>slide</p>
      </PresentationPattern>,
    );
    expect(precedes(screen.getByText("thumbs"), screen.getByText("slide"))).toBe(true);
    await expectNoAxeViolations(container);
  });
});

describe("J PublicPattern", () => {
  test("renders its children", async () => {
    const { container } = render(
      <PublicPattern>
        <h1>moonx</h1>
      </PublicPattern>,
    );
    expect(screen.getByRole("heading", { name: "moonx" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});
