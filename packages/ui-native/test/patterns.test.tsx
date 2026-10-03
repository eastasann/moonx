import { themes } from "@moonx/ui-tokens/native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Keyboard, Text as NativeText, Platform, type ViewStyle } from "react-native";
import { Button } from "../src/components/Button";
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
  useQuestionFocus,
  WorksheetPattern,
} from "../src/layout";

const layout = themes.light.layout;
const T = ({ children }: { children: string }) => <NativeText>{children}</NativeText>;
/** The style of a rendered node; a scroll view's content container counts as its style. */
const flat = (node: { props: { style?: unknown; contentContainerStyle?: unknown } }): ViewStyle => {
  const style = node.props.style ?? node.props.contentContainerStyle;
  if (!style) return {};
  return (Array.isArray(style) ? Object.assign({}, ...style.flat(9)) : style) as ViewStyle;
};
const precedes = (a: string, b: string) => {
  const html = JSON.stringify(screen.toJSON());
  return html.indexOf(`"${a}"`) < html.indexOf(`"${b}"`);
};
/** The bar that wraps a pinned child: the nearest ancestor that is absolutely positioned. */
const bar = (node: { parent: unknown }) => {
  let current = node as { parent: { props?: { style?: unknown } } | null };
  while (current.parent) {
    const next = current.parent as unknown as { props: { style?: unknown }; parent: unknown };
    if (flat(next).position === "absolute") return flat(next);
    current = next as typeof current;
  }
  throw new Error("no pinned bar");
};

const keyboardHandlers = new Map<string, (event: unknown) => void>();
beforeEach(() => {
  keyboardHandlers.clear();
  jest.spyOn(Keyboard, "addListener").mockImplementation(((
    name: string,
    handler: (event: unknown) => void,
  ) => {
    keyboardHandlers.set(name, handler);
    return { remove: () => keyboardHandlers.delete(name) };
  }) as never);
});
afterEach(() => {
  jest.restoreAllMocks();
  Platform.OS = "ios";
});

/** iOS reports the change before the animation (`Will`), Android after it (`Did`). */
function emitKeyboard(event: "show" | "hide", height = 0) {
  const prefix = Platform.OS === "ios" ? "keyboardWill" : "keyboardDid";
  act(() =>
    keyboardHandlers.get(`${prefix}${event === "show" ? "Show" : "Hide"}`)?.({
      endCoordinates: { height },
    }),
  );
}

/** The nearest ancestor (or the node itself) whose style sets `key`. */
const up = (node: unknown, key: keyof ViewStyle): ViewStyle => {
  let current = node as { props: { style?: unknown }; parent: unknown } | null;
  while (current) {
    const style = flat(current);
    if (style[key] !== undefined) return style;
    current = current.parent as typeof current;
  }
  throw new Error(`no ancestor sets ${key}`);
};

describe("A HubPattern", () => {
  const hub = (props = {}) => (
    <HubPattern
      header={<T>Idea</T>}
      summary={<T>summary</T>}
      nextSteps={<T>next</T>}
      status={<T>status</T>}
      entries={<T>entries</T>}
      supplement={<T>supplement</T>}
      history={<T>history</T>}
      actions={<Button>Record</Button>}
      {...props}
    />
  );

  test("stacks summary, next steps, status, entries, supplement, history", () => {
    render(hub());
    const order = ["Idea", "summary", "next", "status", "entries", "supplement", "history"];
    for (let i = 0; i < order.length - 1; i++) {
      expect(precedes(order[i] as string, order[i + 1] as string)).toBe(true);
    }
  });

  test("omits optional slots", () => {
    render(hub({ summary: undefined, supplement: undefined, history: undefined }));
    expect(screen.queryByText("summary")).toBeNull();
    expect(screen.queryByText("supplement")).toBeNull();
    expect(screen.getByText("status")).toBeTruthy();
  });

  test("pins the actions to the bottom of the frame; the tab bar is laid out below it", () => {
    render(hub());
    const pinned = bar(screen.getByText("Record"));
    expect(pinned.bottom).toBe(0);
    expect(pinned.minHeight).toBe(layout["bottom-action-height"]);
    expect(pinned.zIndex).toBe(layout["z-index"]["bottom-action"]);
  });

  test("pins to the bottom edge when the page has no tab bar", () => {
    render(hub({ hasTabBar: false }));
    expect(bar(screen.getByText("Record")).bottom).toBe(0);
  });

  test("renders no bar without actions", () => {
    render(hub({ actions: undefined }));
    expect(screen.queryByText("Record")).toBeNull();
  });
});

describe("pinned bar and the keyboard", () => {
  test("rises above the keyboard and returns when it hides", () => {
    render(
      <FocusPattern actions={<Button>Save</Button>}>
        <T>input</T>
      </FocusPattern>,
    );
    expect(bar(screen.getByText("Save")).bottom).toBe(0);
    emitKeyboard("show", 300);
    // The keyboard covers the tab bar too, so the bar rises only by what is left above it.
    expect(bar(screen.getByText("Save")).bottom).toBe(300 - layout["tab-bar-height"]);
    emitKeyboard("hide");
    expect(bar(screen.getByText("Save")).bottom).toBe(0);
  });

  test("follows the Did events on Android", () => {
    Platform.OS = "android";
    render(
      <FocusPattern actions={<Button>Save</Button>}>
        <T>input</T>
      </FocusPattern>,
    );
    emitKeyboard("show", 250);
    expect(bar(screen.getByText("Save")).bottom).toBe(250 - layout["tab-bar-height"]);
    emitKeyboard("hide");
    expect(bar(screen.getByText("Save")).bottom).toBe(0);
  });

  test("stops listening when it unmounts", () => {
    const { unmount } = render(
      <FocusPattern actions={<Button>Save</Button>}>
        <T>input</T>
      </FocusPattern>,
    );
    expect(keyboardHandlers.size).toBe(2);
    unmount();
    expect(keyboardHandlers.size).toBe(0);
  });

  test("keeps the last content reachable above the keyboard", () => {
    render(
      <FocusPattern actions={<Button>Save</Button>}>
        <T>input</T>
      </FocusPattern>,
    );
    const content = () => up(screen.getByText("input"), "paddingBottom").paddingBottom as number;
    const before = content();
    emitKeyboard("show", 300);
    expect(content()).toBe(before + 300 - layout["tab-bar-height"]);
  });
});

describe("B FocusPattern", () => {
  test("puts the evidence above the input and the actions in the pinned bar", () => {
    render(
      <FocusPattern
        header={<T>Decision</T>}
        evidence={<T>evidence</T>}
        actions={<Button>Go</Button>}
      >
        <T>input</T>
      </FocusPattern>,
    );
    expect(precedes("evidence", "input")).toBe(true);
    expect(bar(screen.getByText("Go")).position).toBe("absolute");
  });

  test("limits the column to the reading width", () => {
    render(
      <FocusPattern>
        <T>input</T>
      </FocusPattern>,
    );
    expect(up(screen.getByText("input"), "maxWidth").maxWidth).toBe(layout["reading-column-max"]);
  });
});

describe("C QuestionFormPattern", () => {
  function Card({ id, focused }: { id: string; focused: boolean }) {
    const visible = useQuestionFocus(focused);
    return visible ? <T>{id}</T> : null;
  }
  const form = (focusedId?: string) => (
    <QuestionFormPattern actions={<Button>Next</Button>}>
      {["q1", "q2", "q3"].map((id) => (
        <Card key={id} id={id} focused={id === focusedId} />
      ))}
    </QuestionFormPattern>
  );

  test("shows every question while none is focused", () => {
    render(form());
    for (const id of ["q1", "q2", "q3"]) expect(screen.getByText(id)).toBeTruthy();
  });

  test("shows only the focused question and follows the focus", () => {
    const { rerender } = render(form("q2"));
    expect(screen.queryByText("q1")).toBeNull();
    expect(screen.getByText("q2")).toBeTruthy();
    expect(screen.queryByText("q3")).toBeNull();
    rerender(form("q3"));
    expect(screen.queryByText("q2")).toBeNull();
    expect(screen.getByText("q3")).toBeTruthy();
    rerender(form());
    expect(screen.getByText("q1")).toBeTruthy();
  });

  test("pins the previous and next controls", () => {
    render(form("q1"));
    expect(bar(screen.getByText("Next")).position).toBe("absolute");
  });

  test("a card outside the form always shows", () => {
    render(<Card id="alone" focused={false} />);
    expect(screen.getByText("alone")).toBeTruthy();
  });
});

describe("D ListDetailPattern", () => {
  const pane = (text: string) =>
    up(screen.getByText(text, { includeHiddenElements: true }), "display");
  const view = (detailOpen?: boolean) => (
    <ListDetailPattern
      header={<T>Ideas</T>}
      list={<T>list</T>}
      detail={<T>detail</T>}
      floatingAction={<Button aria-label="Create">+</Button>}
      detailOpen={detailOpen}
    />
  );

  test("shows the list by default and keeps the detail mounted but hidden", () => {
    render(view());
    expect(pane("list").display).toBe("flex");
    expect(pane("detail").display).toBe("none");
  });

  test("shows only the detail when it is open", () => {
    render(view(true));
    expect(pane("list").display).toBe("none");
    expect(pane("detail").display).toBe("flex");
  });

  test("floats the action at the bottom right of the list area", () => {
    render(view());
    const floating = bar(screen.getByLabelText("Create"));
    expect(floating.right).toBe(layout["page-gutter-mobile"]);
    expect(floating.bottom).toBe(themes.light.space["200"]);
  });

  test("renders no floating action when none is given", () => {
    render(<ListDetailPattern list={<T>list</T>} detail={<T>detail</T>} />);
    expect(screen.queryByLabelText("Create")).toBeNull();
  });
});

test("E CardComparePattern renders the toolbar above the cards", () => {
  render(
    <CardComparePattern header={<T>Competitors</T>} toolbar={<T>toolbar</T>}>
      <T>card 1</T>
      <T>card 2</T>
    </CardComparePattern>,
  );
  expect(precedes("toolbar", "card 1")).toBe(true);
  expect(precedes("card 1", "card 2")).toBe(true);
});

describe("F WorksheetPattern", () => {
  const sheet = (props = {}) => (
    <WorksheetPattern
      header={<T>Costs</T>}
      input={<T>input</T>}
      result={<T>full result</T>}
      resultSummary="Total 1,000"
      resultLabel="Result"
      {...props}
    />
  );

  test("pins the summary bar to the bottom and keeps the result closed", () => {
    render(sheet());
    expect(screen.getByText("input")).toBeTruthy();
    expect(bar(screen.getByText("Total 1,000")).bottom).toBe(0);
    expect(screen.queryByText("full result")).toBeNull();
  });

  test("opens the full result in a tray from the summary", () => {
    render(sheet());
    fireEvent.press(screen.getByRole("button", { name: "Result" }));
    expect(screen.getByText("full result")).toBeTruthy();
  });

  test("the summary button meets the touch target", () => {
    render(sheet());
    const trigger = screen.getByRole("button", { name: "Result" });
    expect(flat(trigger).minHeight).toBeGreaterThanOrEqual(
      themes.light.scale.component["target-min"],
    );
  });

  test("the summary bar rises above the keyboard", () => {
    render(sheet({ hasTabBar: false }));
    expect(bar(screen.getByText("Total 1,000")).bottom).toBe(0);
    emitKeyboard("show", 280);
    expect(bar(screen.getByText("Total 1,000")).bottom).toBe(280);
  });
});

describe("G StepsPattern and DiffColumns", () => {
  test("puts the indicator above the step and pins the actions", () => {
    render(
      <StepsPattern steps={<T>1 2 3</T>} actions={<Button>Continue</Button>}>
        <T>step body</T>
      </StepsPattern>,
    );
    expect(precedes("1 2 3", "step body")).toBe(true);
    expect(bar(screen.getByText("Continue")).position).toBe("absolute");
  });

  test("DiffColumns stacks before above after", () => {
    render(<DiffColumns before={<T>before</T>} after={<T>after</T>} />);
    expect(precedes("before", "after")).toBe(true);
  });
});

test("H SettingsPattern stacks its groups", () => {
  render(
    <SettingsPattern header={<T>Account</T>}>
      <T>profile</T>
      <T>theme</T>
    </SettingsPattern>,
  );
  expect(precedes("profile", "theme")).toBe(true);
});

test("I PresentationPattern stacks the slides and hides the thumbnails", () => {
  render(
    <PresentationPattern thumbnails={<T>thumbs</T>}>
      <T>slide 1</T>
      <T>slide 2</T>
    </PresentationPattern>,
  );
  expect(screen.queryByText("thumbs")).toBeNull();
  expect(precedes("slide 1", "slide 2")).toBe(true);
});

test("J PublicPattern has no pinned bar", () => {
  render(
    <PublicPattern>
      <T>page</T>
    </PublicPattern>,
  );
  expect(screen.getByText("page")).toBeTruthy();
  expect(() => bar(screen.getByText("page") as never)).toThrow("no pinned bar");
});
