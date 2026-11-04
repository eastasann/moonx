import {
  conditionAnswersOutside,
  decidesElsewhere,
  isQuestionShown,
  VALIDATION_SECTION_KEYS,
} from "@moonx/domain";
import type {
  Evidence,
  Me,
  Role,
  TemplateSection,
  ValidationAnswer,
} from "@moonx/schemas";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { RETRY_DELAYS_MS } from "../lib/autosave";
import { ana, apiError, type Call, renderApp, stubApi } from "../test/api";
import { workspaceId } from "../test/ideas";
import {
  answer,
  evidenceOf,
  home,
  prices,
  question,
  questionsRead,
  section01,
  section02,
  survey,
  validationId,
} from "../test/validation";

// 11 Question form for a validation section and M2 Evidence (design-spec 6.2・6.0.3).

/** happy-dom's window, whose viewport a test sets. */
const setViewport = (width: number) =>
  act(() =>
    (
      window as unknown as {
        happyDOM: {
          setViewport: (size: { width: number; height: number }) => void;
        };
      }
    ).happyDOM.setViewport({ width, height: 900 }),
  );

afterEach(() => {
  vi.unstubAllGlobals();
  setViewport(1024);
});

const ideaPath = `/api/v1/ideas/${home.idea.id}`;
const ideaBase = `/w/${workspaceId}/ideas/${home.idea.id}`;
const base = `${ideaBase}/questions`;
const validationPath = `/api/v1/validations/${validationId}`;

const sectionOrder: readonly string[] = VALIDATION_SECTION_KEYS;

/** V1 with its ten sections, as the API returns them: the fixture leaves out 02 and 10. */
const hub = {
  ...home,
  sections: [
    ...home.sections,
    {
      key: "02",
      title: "02 Market",
      answered: 0,
      total: 8,
      count: null,
      fau: null,
    },
    {
      key: "10",
      title: "10 Final Assessment",
      answered: 0,
      total: 6,
      count: null,
      fau: null,
    },
  ].sort((a, b) => sectionOrder.indexOf(a.key) - sectionOrder.indexOf(b.key)),
};

const as = (role: Role): Me => ({
  ...ana,
  memberships: ana.memberships.map((membership) => ({ ...membership, role })),
});

/** An answer with `text` and no F/A/U yet: Unclassified. */
const written = (key: string, text: string) =>
  answer(key, {
    text,
    classification: {
      fau: null,
      confidence: null,
      state: "unclassified",
      evidence: [],
    },
    lockVersion: 1,
  });

const puts = (calls: Call[]) =>
  calls.filter(({ method }) => method === "PUT").map(({ body }) => body);

/** The API of 11, answering saves with `put` and M2's sends with `evidence`. */
function formApi({
  me = ana,
  section = section01,
  answers = section.questions.map(({ key }) => answer(key)),
  others = [],
  elsewhere = [],
  beforeSave,
  archived = false,
  put,
  evidence = (_call: Call): Response | Promise<Response> | undefined =>
    undefined,
}: {
  me?: Me;
  section?: TemplateSection;
  answers?: ValidationAnswer[];
  /** The version's other sections V2 reads too, their display conditions included. */
  others?: TemplateSection[];
  /** The answers to the questions of `others`. */
  elsewhere?: ValidationAnswer[];
  /** Holds a save back before the fake applies it, as a slow V3 would. */
  beforeSave?: () => Promise<void>;
  archived?: boolean;
  put?: (call: Call) => Response;
  evidence?: (call: Call) => Response | Promise<Response> | undefined;
} = {}) {
  // What the fake API holds of each answer, so a later save sees the earlier ones.
  const saved = new Map(
    [...answers, ...elsewhere].map((item) => [item.questionKey, item]),
  );
  const version = [section, ...others].flatMap(({ questions }) => questions);
  /** V2 of `read`: `answers` for the section opened, what the fake holds for others. */
  const questionsOf = (read: TemplateSection) =>
    questionsRead(
      read,
      read === section
        ? answers
        : read.questions.map(({ key }) => saved.get(key) ?? answer(key)),
      {
        conditionAnswers: conditionAnswersOutside(
          read.questions,
          version,
          saved,
        ),
        decidesElsewhere: decidesElsewhere(read.questions, version),
      },
    );
  const save =
    put ??
    ((call: Call) => {
      const key = decodeURIComponent(call.path.split("/").at(-1) ?? "");
      const before = saved.get(key) ?? answer(key);
      const body = call.body as {
        text?: string;
        classification?: ValidationAnswer["classification"];
        lockVersion: number;
      };
      const text = body.text ?? before.text;
      const fau = body.classification?.fau ?? null;
      const after = answer(key, {
        text,
        classification: {
          fau:
            body.classification === undefined ? before.classification.fau : fau,
          confidence:
            body.classification === undefined
              ? before.classification.confidence
              : (body.classification.confidence ?? null),
          state:
            (body.classification === undefined
              ? before.classification.fau
              : fau) ?? (text ? "unclassified" : "empty"),
          evidence: before.classification.evidence,
        },
        lockVersion: body.lockVersion + 1,
      });
      saved.set(key, after);
      return Response.json(after);
    });
  return stubApi((call) => {
    const { method, path } = call;
    if (method === "GET" && path === "/api/v1/me") return Response.json(me);
    if (method === "PATCH" && path === "/api/v1/me") return Response.json(me);
    if (method === "GET" && path === `${ideaPath}/validation`) {
      return Response.json({ ...hub, idea: { ...hub.idea, archived } });
    }
    const read = [section, ...others].find(
      ({ key }) => path === `${validationPath}/questions/${key}`,
    );
    if (method === "GET" && read !== undefined) {
      return Response.json(questionsOf(read));
    }
    if (method === "PUT" && path.startsWith(`${validationPath}/answers/`)) {
      return beforeSave === undefined
        ? save(call)
        : beforeSave().then(() => save(call));
    }
    if (method === "GET" && path.startsWith(`${validationPath}/research-log`)) {
      return Response.json({ items: [survey, prices], nextCursor: null });
    }
    if (
      (method === "POST" && path === `${validationPath}/evidence`) ||
      (method === "DELETE" && path.startsWith("/api/v1/evidence/"))
    ) {
      return evidence(call);
    }
    return undefined;
  });
}

const card = (title: string) => screen.getByRole("region", { name: title });

describe("11 Question form (design-spec 6.2)", () => {
  test("opens on the first question not answered, its field focused, and counts what is answered", async () => {
    formApi({
      answers: [
        answer("V.01.WHO", {
          text: "Office workers",
          classification: {
            fau: "assumption",
            confidence: "medium",
            state: "assumption",
            evidence: [],
          },
          lockVersion: 2,
        }),
        answer("V.01.PROBLEM"),
        answer("V.01.PROOF", {
          classification: {
            fau: "unknown",
            confidence: null,
            state: "unknown",
            evidence: [],
          },
          lockVersion: 1,
        }),
      ],
    });
    renderApp(`${base}/01`);
    const problem = await screen.findByRole("textbox", {
      name: "Answer to PROBLEM",
    });
    await waitFor(() => expect(document.activeElement).toBe(problem));
    // WHO is answered, PROOF is Unknown: both count (6.1's way of counting).
    expect(screen.getByText("2/3")).toBeTruthy();
    expect(card("WHO").textContent).toContain("Assumption · Medium");
    expect(card("WHO").textContent).toContain("Office workers");
    expect(screen.queryByRole("textbox", { name: "Answer to WHO" })).toBeNull();
    await waitFor(() =>
      expect(document.title).toBe("01 Customer & Problem · BCDX · moonx"),
    );
  });

  test("every question answered: it opens on the first one, its field focused", async () => {
    formApi({
      answers: [
        written("V.01.WHO", "Office workers"),
        written("V.01.PROBLEM", "No lunch nearby"),
        written("V.01.PROOF", "Lunch survey"),
      ],
    });
    renderApp(`${base}/01`);
    const who = await screen.findByRole("textbox", { name: "Answer to WHO" });
    await waitFor(() => expect(document.activeElement).toBe(who));
    expect(screen.getByText("3/3")).toBeTruthy();
  });

  test("a save that failed: Couldn't save and Retry in its card, the input kept, and Retry sends it", async () => {
    let isFailing = true;
    let answerFirstSave: () => void = () => {};
    const firstSaveAnswered = new Promise<void>((resolve) => {
      answerFirstSave = resolve;
    });
    const calls = formApi({
      beforeSave: () => firstSaveAnswered,
      put: (call) =>
        isFailing
          ? apiError(503, "UPSTREAM_UNAVAILABLE")
          : Response.json(
              written("V.01.WHO", (call.body as { text: string }).text),
            ),
    });
    renderApp(`${base}/01?q=V.01.WHO`);
    await userEvent
      .setup()
      .type(
        await screen.findByRole("textbox", { name: "Answer to WHO" }),
        "Tourists",
      );
    await waitFor(() => expect(puts(calls)).toHaveLength(1), {
      timeout: 3000,
    });
    // The store schedules its own re-send when the 503 lands: on a clock only the test
    // moves from here, so no send but Retry's can come before RETRY_DELAYS_MS[0]. (No
    // userEvent on it: its act waits on a timer of that clock.)
    vi.useFakeTimers();
    try {
      await act(async () => {
        answerFirstSave();
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(card("WHO").textContent).toContain("Couldn't save");
      expect(
        within(card("WHO")).getByRole("textbox", { name: "Answer to WHO" }),
      ).toHaveProperty("value", "Tourists");
      expect(puts(calls)).toHaveLength(1);
      isFailing = false;
      fireEvent.click(
        within(card("WHO")).getByRole("button", { name: "Retry" }),
      );
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(puts(calls)).toEqual([
        { text: "Tourists", lockVersion: 0 },
        { text: "Tourists", lockVersion: 0 },
      ]);
      expect(card("WHO").textContent).not.toContain("Couldn't save");
      await act(() => vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0] ?? 0));
      expect(puts(calls)).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test("?q= focuses that question; EXAMPLE opens with it, and Hint opens its help when pressed", async () => {
    const user = userEvent.setup();
    formApi();
    renderApp(`${base}/01?q=V.01.WHO`);
    const who = await screen.findByRole("textbox", { name: "Answer to WHO" });
    await waitFor(() => expect(document.activeElement).toBe(who));
    const whoCard = card("WHO");
    expect(
      within(whoCard)
        .getByRole("button", { name: "EXAMPLE" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      within(whoCard).getByText("Office workers near Lacson St."),
    ).toBeTruthy();
    // Hint is a ContextualHelp (design-spec 4.5): its help opens over the form.
    expect(screen.queryByText("Name who pays, not who uses.")).toBeNull();
    await user.click(
      within(whoCard).getByRole("button", { name: "Hint for WHO" }),
    );
    const help = await screen.findByRole("dialog", { name: "Hint" });
    expect(help.textContent).toContain("Name who pays, not who uses.");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // No research yet: how to add some, and the way to 14's new entry.
    expect(whoCard.textContent).toContain(
      "No research linked to this answer. Mark it Fact to attach a source.",
    );
    expect(
      within(whoCard)
        .getByRole("link", { name: "Log research" })
        .getAttribute("href"),
    ).toBe(`/w/${workspaceId}/ideas/${home.idea.id}/research?new=1`);
  });

  test("typing saves once it pauses; Assumption waits for a confidence; Unknown saves at once", async () => {
    const user = userEvent.setup();
    const calls = formApi();
    renderApp(`${base}/01?q=V.01.WHO`);
    const who = await screen.findByRole("textbox", { name: "Answer to WHO" });
    const whoCard = card("WHO");
    // Without content only Unknown can be chosen (6.0.3).
    expect(
      within(whoCard)
        .getByRole("radio", { name: /Fact/ })
        .hasAttribute("disabled"),
    ).toBe(true);
    await user.type(who, "Tourists");
    expect(whoCard.textContent).toContain("Not classified yet");
    await waitFor(
      () =>
        expect(
          calls
            .filter(({ method }) => method === "PUT")
            .map(({ body }) => body),
        ).toEqual([{ text: "Tourists", lockVersion: 0 }]),
      { timeout: 3000 },
    );
    await user.click(
      within(whoCard).getByRole("radio", { name: /Assumption/ }),
    );
    // Nothing is sent until a confidence is chosen.
    expect(calls.filter(({ method }) => method === "PUT")).toHaveLength(1);
    await user.click(within(whoCard).getByRole("radio", { name: "High" }));
    await waitFor(() =>
      expect(
        calls.filter(({ method }) => method === "PUT").at(-1)?.body,
      ).toEqual({
        classification: { fau: "assumption", confidence: "high" },
        lockVersion: 1,
      }),
    );
    expect(card("WHO").textContent).toContain("Assumption · High");
    await user.click(
      within(card("WHO")).getByRole("radio", { name: /Unknown/ }),
    );
    await waitFor(() =>
      expect(
        calls.filter(({ method }) => method === "PUT").at(-1)?.body,
      ).toEqual({
        classification: { fau: "unknown", confidence: null },
        lockVersion: 2,
      }),
    );
  });

  test("the Focus switch off opens every question with its answer to write", async () => {
    const user = userEvent.setup();
    formApi();
    renderApp(`${base}/01?q=V.01.WHO`);
    await screen.findByRole("textbox", { name: "Answer to WHO" });
    expect(
      screen.queryByRole("textbox", { name: "Answer to PROBLEM" }),
    ).toBeNull();
    const focus = screen.getByRole("switch", { name: "Focus" });
    expect((focus as HTMLInputElement).checked).toBe(true);
    await user.click(focus);
    for (const title of ["WHO", "PROBLEM", "PROOF"]) {
      expect(
        screen.getByRole("textbox", { name: `Answer to ${title}` }),
      ).toBeTruthy();
    }
  });

  test("text over its length leaves Fact and Assumption closed to an empty answer", async () => {
    const user = userEvent.setup();
    formApi({ section: section02 });
    renderApp(`${base}/02?q=V.02.CATEGORY`);
    const category = await screen.findByRole("textbox", {
      name: "Answer to CATEGORY",
    });
    await user.click(category);
    await user.paste("x".repeat(201));
    // Never sent, so the answer still has no value (6.0.3).
    expect(
      within(card("CATEGORY"))
        .getByRole("radio", { name: /Fact/ })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(card("CATEGORY").textContent).not.toContain("Not classified yet");
  });

  test("an answer over its length is not sent and says why", async () => {
    const user = userEvent.setup();
    const calls = formApi({ section: section02 });
    renderApp(`${base}/02?q=V.02.CATEGORY`);
    const category = await screen.findByRole("textbox", {
      name: "Answer to CATEGORY",
    });
    await user.click(category);
    await user.paste("x".repeat(201));
    expect(card("CATEGORY").textContent).toMatch(/200/);
    await new Promise((resolve) => setTimeout(resolve, 1300));
    expect(calls.filter(({ method }) => method === "PUT")).toEqual([]);
  });

  test("02: OCEAN decides which questions show, as it is chosen", async () => {
    const user = userEvent.setup();
    formApi({ section: section02 });
    renderApp(`${base}/02?q=V.02.OCEAN`);
    await screen.findByRole("radiogroup", { name: "Answer to OCEAN" });
    expect(screen.getByText("0/2")).toBeTruthy();
    expect(card("OCEAN").textContent).toContain(
      "Answer OCEAN to see the next questions",
    );
    expect(screen.queryByRole("region", { name: "RED: SURVIVORS" })).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Red" }));
    expect(screen.getByText("1/3")).toBeTruthy();
    // OCEAN has a value: the hint is gone.
    expect(card("OCEAN").textContent).not.toContain(
      "to see the next questions",
    );
    expect(screen.getByRole("region", { name: "RED: SURVIVORS" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "BLUE: GAP" })).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Mixed" }));
    expect(screen.getByText("1/4")).toBeTruthy();
  });

  test("02: an answer OCEAN hides is kept but not counted, and shows and counts once chosen back", async () => {
    const user = userEvent.setup();
    const calls = formApi({
      section: section02,
      answers: [
        written("V.02.CATEGORY", "Food delivery"),
        written("V.02.OCEAN", "Red"),
        written("V.02.RED_1", "Two kiosks survive on price"),
        answer("V.02.BLUE_1"),
      ],
    });
    renderApp(`${base}/02?q=V.02.OCEAN`);
    await screen.findByRole("radiogroup", { name: "Answer to OCEAN" });
    expect(screen.getByText("3/3")).toBeTruthy();
    expect(card("OCEAN").textContent).not.toContain(
      "to see the next questions",
    );
    await user.click(screen.getByRole("radio", { name: "Blue" }));
    // RED's answer is hidden: BLUE's question is the only one not answered, of three.
    expect(screen.getByText("2/3")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "RED: SURVIVORS" })).toBeNull();
    expect(card("BLUE: GAP")).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: "Red" }));
    expect(screen.getByText("3/3")).toBeTruthy();
    expect(card("RED: SURVIVORS")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "BLUE: GAP" })).toBeNull();
    // Only OCEAN was sent: the hidden answer is never cleared.
    await waitFor(() =>
      expect(puts(calls)).toEqual([
        { text: "Blue", lockVersion: 1 },
        { text: "Red", lockVersion: 2 },
      ]),
    );
  });

  /** 10 with a question shown once 01 WHO is "Offices": a condition on another section. */
  const section10: TemplateSection = {
    key: "10",
    part: null,
    title: "Synthesis",
    subtitle: null,
    guidance: null,
    questions: [
      question("V.10.WHY_WORK", "WHY WORK", "Why would this work?"),
      question("V.10.OFFICES", "OFFICE ORDERS", "How do offices order?", {
        displayCondition: { "V.01.WHO": ["Offices"] },
      }),
    ],
  };

  test.each([
    ["Offices", true],
    ["Students", false],
  ])(
    "10 shows a question by 01 WHO's answer (%s) and counts as 13 does",
    async (who, isShown) => {
      formApi({
        section: section10,
        others: [section01],
        elsewhere: [answer("V.01.WHO", { text: who, lockVersion: 1 })],
      });
      renderApp(`${base}/10`);
      await screen.findByRole("region", { name: "WHY WORK" });
      // 13 counts the questions shown on all of the validation's answers (6.1・6.2).
      const hub = section10.questions.filter((item) =>
        isQuestionShown(item, new Map([["V.01.WHO", { text: who }]])),
      );
      expect(hub).toHaveLength(isShown ? 2 : 1);
      expect(screen.getByText(`0/${hub.length}`)).toBeTruthy();
      expect(
        screen.queryByRole("region", { name: "OFFICE ORDERS" }) !== null,
      ).toBe(isShown);
    },
  );

  test("a question another section's condition names says how to reveal it while unanswered", async () => {
    const user = userEvent.setup();
    const calls = formApi({ others: [section10] });
    renderApp(`${base}/01?q=V.01.WHO`);
    const who = await screen.findByRole("textbox", { name: "Answer to WHO" });
    expect(card("WHO").textContent).toContain(
      "Answer WHO to see the next questions",
    );
    expect(card("PROBLEM").textContent).not.toContain("to see the next");
    await user.type(who, "Offices");
    expect(card("WHO").textContent).not.toContain("to see the next");
    await waitFor(
      () =>
        expect(calls.filter(({ method }) => method === "PUT")).toHaveLength(1),
      { timeout: 3000 },
    );
  });

  test("a save sent on leaving reads the next section again, whose condition names it", async () => {
    const user = userEvent.setup();
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls = formApi({ others: [section10], beforeSave: () => held });
    const router = renderApp(`${base}/01?q=V.01.WHO`);
    const who = await screen.findByRole("textbox", { name: "Answer to WHO" });
    await user.type(who, "Offices");
    await router.navigate({ href: `${base}/10` });
    // Read before the save of WHO landed: what it shows is not shown yet.
    expect(await screen.findByText("0/1")).toBeTruthy();
    release();
    expect(await screen.findByText("0/2")).toBeTruthy();
    expect(card("OFFICE ORDERS")).toBeTruthy();
    expect(
      calls.filter(
        ({ method, path }) =>
          method === "GET" && path === `${validationPath}/questions/10`,
      ),
    ).toHaveLength(2);
  });

  test("the sections run 01 → 02 → 03 (14) and 09 (16) → 10: nothing before 01, nothing after 10", async () => {
    const user = userEvent.setup();
    formApi({ others: [section02, section10] });
    const router = renderApp(`${base}/01`);
    await screen.findByRole("heading", {
      level: 1,
      name: "01 Customer & Problem",
    });
    expect(
      screen.queryByRole("button", { name: "Previous section" }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Next: 02 Market" }));
    await screen.findByRole("heading", { level: 1, name: "02 Market" });
    expect(router.state.location.pathname).toBe(`${base}/02`);
    await user.click(
      screen.getByRole("button", { name: "Next: 03 Research Log" }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`${ideaBase}/research`),
    );
    await router.navigate({ href: `${base}/02` });
    await user.click(
      await screen.findByRole("button", { name: "Previous section" }),
    );
    await screen.findByRole("heading", {
      level: 1,
      name: "01 Customer & Problem",
    });
    expect(router.state.location.pathname).toBe(`${base}/01`);
    await router.navigate({ href: `${base}/10` });
    await screen.findByRole("heading", {
      level: 1,
      name: "10 Final Assessment",
    });
    expect(screen.queryByRole("button", { name: /^Next: / })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Previous section" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`${ideaBase}/assumptions`),
    );
  });

  test("on a phone, → on the last question shows the section's card with Next: the next section; 10's has none", async () => {
    setViewport(390);
    const user = userEvent.setup();
    formApi({ others: [section02, section10] });
    const router = renderApp(`${base}/01?q=V.01.PROOF`);
    await screen.findByRole("textbox", { name: "Answer to PROOF" });
    await user.click(screen.getByRole("button", { name: "Next question" }));
    expect(
      await screen.findByRole("heading", { name: "01: 0/3 answered" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Back to Validation" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Next: 02 Market" }));
    await screen.findByRole("heading", { level: 1, name: "02 Market" });
    expect(router.state.location.pathname).toBe(`${base}/02`);
    await router.navigate({ href: `${base}/10` });
    await screen.findByRole("textbox", { name: "Answer to WHY WORK" });
    await user.click(screen.getByRole("button", { name: "Next question" }));
    expect(
      await screen.findByRole("heading", { name: "10: 0/1 answered" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Back to Validation" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Next: / })).toBeNull();
  });

  test("a Viewer reads every question open, F/A/U as labels, without Focus or a way to add research", async () => {
    formApi({
      me: as("viewer"),
      answers: [
        answer("V.01.WHO", {
          text: "Office workers",
          classification: {
            fau: "fact",
            confidence: null,
            state: "fact_no_evidence",
            evidence: [
              evidenceOf("7d0f0000-0000-4000-8000-000000000001", survey, true),
            ],
          },
          lockVersion: 2,
        }),
        answer("V.01.PROBLEM"),
        answer("V.01.PROOF"),
      ],
    });
    renderApp(`${base}/01`);
    await screen.findByRole("heading", {
      level: 1,
      name: "01 Customer & Problem",
    });
    expect(screen.queryAllByRole("textbox")).toEqual([]);
    expect(screen.queryByRole("switch", { name: "Focus" })).toBeNull();
    expect(screen.queryByRole("button", { name: "AI" })).toBeNull();
    expect(screen.queryByRole("radio", { name: /Fact/ })).toBeNull();
    expect(card("WHO").textContent).toContain("Fact · No evidence");
    expect(card("WHO").textContent).toContain(
      "No research linked to this answer.",
    );
    expect(card("WHO").textContent).not.toContain("Mark it Fact");
    expect(screen.queryByRole("link", { name: "Log research" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Add evidence" })).toBeNull();
    expect(card("PROBLEM").textContent).toContain("Empty");
  });

  test("a Fact whose research log was deleted: its warning, and Add evidence opens M2 on it", async () => {
    const user = userEvent.setup();
    formApi({
      answers: [
        answer("V.01.WHO", {
          text: "Office workers",
          classification: {
            fau: "fact",
            confidence: null,
            state: "fact_no_evidence",
            evidence: [
              evidenceOf("7d0f0000-0000-4000-8000-000000000001", survey, true),
            ],
          },
          lockVersion: 2,
        }),
        answer("V.01.PROBLEM"),
        answer("V.01.PROOF"),
      ],
    });
    renderApp(`${base}/01?q=V.01.WHO`);
    await screen.findByRole("textbox", { name: "Answer to WHO" });
    const whoCard = card("WHO");
    expect(whoCard.textContent).toContain("Fact · No evidence");
    expect(whoCard.querySelector(".lucide-triangle-alert")).not.toBeNull();
    // Pressing Fact would clear it (6.0.3): the way back to M2 is Add evidence, beside
    // the way to 14's new entry.
    expect(whoCard.textContent).toContain("No research linked to this answer.");
    expect(whoCard.textContent).not.toContain("Mark it Fact");
    expect(
      within(whoCard).getByRole("link", { name: "Log research" }),
    ).toBeTruthy();
    await user.click(
      within(whoCard).getByRole("link", { name: "Add evidence" }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Evidence" });
    expect(
      within(sheet).getByRole("row", { name: /Lunch survey \(deleted\)/ }),
    ).toBeTruthy();
  });

  test("Related research counts the evidence that counts: not a deleted research log's", async () => {
    const url: Evidence = {
      id: "7d0f0000-0000-4000-8000-000000000009",
      kind: "url",
      researchLog: null,
      url: "https://psa.gov.ph/report",
      note: null,
    };
    formApi({
      answers: [
        answer("V.01.WHO", {
          text: "Office workers",
          classification: {
            fau: "fact",
            confidence: null,
            state: "fact",
            evidence: [
              evidenceOf("7d0f0000-0000-4000-8000-000000000001", survey),
              evidenceOf("7d0f0000-0000-4000-8000-000000000008", prices, true),
              url,
            ],
          },
          lockVersion: 2,
        }),
        answer("V.01.PROBLEM"),
        answer("V.01.PROOF"),
      ],
    });
    renderApp(`${base}/01?q=V.01.WHO`);
    await screen.findByRole("textbox", { name: "Answer to WHO" });
    expect(
      within(card("WHO")).getByRole("button", { name: "Related research (2)" }),
    ).toBeTruthy();
    expect(card("WHO").textContent).toContain("Fact · 2 sources");
  });

  test.each(["owner", "member"] as const)(
    "an archived idea reads only for its %s: no fields, F/A/U, Focus or ways to add research; Restore",
    async (role) => {
      formApi({
        me: as(role),
        archived: true,
        answers: [
          // Editable, these would offer Mark it Fact and Log research, and Add evidence.
          written("V.01.WHO", "Office workers"),
          answer("V.01.PROBLEM", {
            text: "No lunch nearby",
            classification: {
              fau: "fact",
              confidence: null,
              state: "fact",
              evidence: [
                evidenceOf("7d0f0000-0000-4000-8000-000000000001", survey),
              ],
            },
            lockVersion: 2,
          }),
          answer("V.01.PROOF"),
        ],
      });
      renderApp(`${base}/01`);
      await screen.findByRole("heading", {
        level: 1,
        name: "01 Customer & Problem",
      });
      expect(screen.getByText("This idea is archived")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy();
      expect(screen.queryAllByRole("textbox")).toEqual([]);
      expect(screen.queryAllByRole("radio")).toEqual([]);
      expect(screen.queryByRole("switch", { name: "Focus" })).toBeNull();
      expect(document.body.textContent).not.toContain("Mark it Fact");
      expect(screen.queryByRole("link", { name: "Log research" })).toBeNull();
      expect(screen.queryByRole("link", { name: "Add evidence" })).toBeNull();
      // Every question open, its answer as text and its F/A/U as a label.
      expect(card("WHO").textContent).toContain("Office workers");
      expect(card("WHO").textContent).toContain("Unclassified");
      expect(card("WHO").textContent).toContain(
        "No research linked to this answer.",
      );
      expect(card("PROBLEM").textContent).toContain("No lunch nearby");
      expect(card("PROBLEM").textContent).toContain("Fact · 1 source");
      expect(card("PROOF").textContent).toContain("Empty");
    },
  );

  test("an answer V2 left out is the API's fault: Something went wrong", async () => {
    formApi({ answers: [answer("V.01.WHO"), answer("V.01.PROBLEM")] });
    renderApp(`${base}/01`);
    expect(
      await screen.findByRole("heading", { name: "Something went wrong" }),
    ).toBeTruthy();
  });

  test("a section 11 does not ask: Not found", async () => {
    formApi();
    renderApp(`${base}/05`);
    expect(
      await screen.findByRole("heading", {
        name: "Not found. Check the link.",
      }),
    ).toBeTruthy();
  });
});

describe("M2 Evidence (design-spec 6.0.3)", () => {
  /** V4's answer: `log` attached to WHO, at version `lockVersion`. */
  const attached = (log: typeof survey, lockVersion: number) =>
    Response.json(
      {
        evidence: evidenceOf("7d0f0000-0000-4000-8000-000000000006", log),
        classification: {
          fau: null,
          confidence: null,
          state: "unclassified",
          evidence: [evidenceOf("7d0f0000-0000-4000-8000-000000000006", log)],
        },
        lockVersion,
      },
      { status: 201 },
    );
  const conflict = () =>
    apiError(409, "CONFLICT", {
      current: {
        value: { text: "Theirs", fau: null, confidence: null, evidenceIds: [] },
        lockVersion: 5,
        updatedAt: "2026-10-18T01:00:00.000Z",
        updatedBy: null,
      },
    });
  const openM2 = `${base}/01?q=V.01.WHO&modal=evidence&about=validation_answer:${validationId}:V.01.WHO`;

  const withText = (key: string, extra: Partial<ValidationAnswer> = {}) =>
    answer(key, {
      text: "Office workers",
      classification: {
        fau: null,
        confidence: null,
        state: "unclassified",
        evidence: [],
      },
      lockVersion: 1,
      ...extra,
    });

  test("Fact opens M2; a research log ticked there is attached and makes it a Fact", async () => {
    const user = userEvent.setup();
    const calls = formApi({
      answers: [
        withText("V.01.WHO"),
        answer("V.01.PROBLEM"),
        answer("V.01.PROOF"),
      ],
      evidence: () =>
        Response.json(
          {
            evidence: evidenceOf(
              "7d0f0000-0000-4000-8000-000000000002",
              survey,
            ),
            classification: {
              fau: "fact",
              confidence: null,
              state: "fact",
              evidence: [
                evidenceOf("7d0f0000-0000-4000-8000-000000000002", survey),
              ],
            },
            lockVersion: 2,
          },
          { status: 201 },
        ),
    });
    renderApp(`${base}/01?q=V.01.WHO`);
    await screen.findByRole("textbox", { name: "Answer to WHO" });
    await user.click(within(card("WHO")).getByRole("radio", { name: /Fact/ }));
    const sheet = await screen.findByRole("dialog", { name: "Evidence" });
    expect(sheet.textContent).toContain(
      "01 WHO · Who is the primary paying customer?",
    );
    await user.click(
      await within(sheet).findByRole("checkbox", { name: /Lunch survey/ }),
    );
    await waitFor(() =>
      expect(calls.find(({ method }) => method === "POST")?.body).toEqual({
        target: {
          type: "validation_answer",
          id: validationId,
          key: "V.01.WHO",
        },
        lockVersion: 1,
        setFact: true,
        researchLogEntryId: survey.id,
      }),
    );
    await waitFor(() =>
      expect(
        within(sheet).getByRole("row", { name: /Lunch survey/ }),
      ).toBeTruthy(),
    );
    await user.click(within(sheet).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(card("WHO").textContent).toContain("Fact · 1 source");
    // Related research holds its chip (6.0.3).
    const related = within(card("WHO")).getByRole("grid", {
      name: "Related research",
    });
    expect(
      within(related).getByRole("row", { name: /Lunch survey/ }),
    ).toBeTruthy();
  });

  test("Done after Fact on an answer that has evidence already saves it as a Fact", async () => {
    const user = userEvent.setup();
    const calls = formApi({
      answers: [
        withText("V.01.WHO", {
          classification: {
            fau: "assumption",
            confidence: "low",
            state: "assumption",
            evidence: [
              evidenceOf("7d0f0000-0000-4000-8000-000000000003", prices),
            ],
          },
          lockVersion: 4,
        }),
        answer("V.01.PROBLEM"),
        answer("V.01.PROOF"),
      ],
    });
    renderApp(`${base}/01?q=V.01.WHO`);
    await screen.findByRole("textbox", { name: "Answer to WHO" });
    await user.click(within(card("WHO")).getByRole("radio", { name: /Fact/ }));
    const sheet = await screen.findByRole("dialog", { name: "Evidence" });
    await user.click(within(sheet).getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(
        calls.filter(({ method }) => method === "PUT").at(-1)?.body,
      ).toEqual({
        classification: { fau: "fact", confidence: null },
        lockVersion: 4,
      }),
    );
  });

  test("closed without evidence, the answer stays as it was", async () => {
    const user = userEvent.setup();
    const calls = formApi({
      answers: [
        withText("V.01.WHO"),
        answer("V.01.PROBLEM"),
        answer("V.01.PROOF"),
      ],
    });
    renderApp(`${base}/01?q=V.01.WHO`);
    await screen.findByRole("textbox", { name: "Answer to WHO" });
    await user.click(within(card("WHO")).getByRole("radio", { name: /Fact/ }));
    const sheet = await screen.findByRole("dialog", { name: "Evidence" });
    await user.click(within(sheet).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      calls.filter(({ method }) => method !== "GET" && method !== "PATCH"),
    ).toEqual([]);
    expect(card("WHO").textContent).toContain("Unclassified");
  });

  test("removing a Fact's last evidence asks first, then sends V5", async () => {
    const user = userEvent.setup();
    const link = evidenceOf("7d0f0000-0000-4000-8000-000000000004", survey);
    const calls = formApi({
      answers: [
        withText("V.01.WHO", {
          classification: {
            fau: "fact",
            confidence: null,
            state: "fact",
            evidence: [link],
          },
          lockVersion: 3,
        }),
        answer("V.01.PROBLEM"),
        answer("V.01.PROOF"),
      ],
      evidence: () =>
        Response.json({
          classification: {
            fau: null,
            confidence: null,
            state: "unclassified",
            evidence: [],
          },
          lockVersion: 4,
        }),
    });
    renderApp(`${base}/01?q=V.01.WHO`);
    await screen.findByRole("textbox", { name: "Answer to WHO" });
    await user.click(
      within(card("WHO")).getByRole("link", { name: "Add evidence" }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Evidence" });
    await user.click(within(sheet).getByRole("button", { name: /Remove/ }));
    const ask = await screen.findByRole("alertdialog", {
      name: "Remove the last evidence?",
    });
    expect(ask.textContent).toContain("This answer will become Unclassified.");
    await user.click(within(ask).getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(calls.find(({ method }) => method === "DELETE")?.path).toBe(
        `/api/v1/evidence/${link.id}?lockVersion=3`,
      ),
    );
    await waitFor(() => expect(sheet.textContent).toContain("No evidence yet"));
  });

  test("someone saved the answer first: their name, and Overwrite with mine sends again with force", async () => {
    const user = userEvent.setup();
    let sent = 0;
    const calls = formApi({
      answers: [
        withText("V.01.WHO"),
        answer("V.01.PROBLEM"),
        answer("V.01.PROOF"),
      ],
      evidence: () => {
        sent += 1;
        if (sent === 1) {
          return apiError(409, "CONFLICT", {
            current: {
              value: {
                text: "Theirs",
                fau: null,
                confidence: null,
                evidenceIds: [],
              },
              lockVersion: 5,
              updatedAt: "2026-10-18T01:00:00.000Z",
              updatedBy: {
                id: "11111111-1111-4111-8111-111111111111",
                displayName: "Paolo Gonzaga",
                avatarUrl: null,
                badge: null,
              },
            },
          });
        }
        return Response.json(
          {
            evidence: evidenceOf(
              "7d0f0000-0000-4000-8000-000000000005",
              prices,
            ),
            classification: {
              fau: null,
              confidence: null,
              state: "unclassified",
              evidence: [
                evidenceOf("7d0f0000-0000-4000-8000-000000000005", prices),
              ],
            },
            lockVersion: 6,
          },
          { status: 201 },
        );
      },
    });
    renderApp(
      `${base}/01?q=V.01.WHO&modal=evidence&about=validation_answer:${validationId}:V.01.WHO`,
    );
    const sheet = await screen.findByRole("dialog", { name: "Evidence" });
    await user.click(
      await within(sheet).findByRole("checkbox", { name: /Prices downtown/ }),
    );
    const conflict = await screen.findByRole("alertdialog", {
      name: /Paolo Gonzaga updated this answer/,
    });
    await user.click(
      within(conflict).getByRole("button", { name: "Overwrite with mine" }),
    );
    await waitFor(() =>
      expect(
        calls.filter(({ method }) => method === "POST").at(-1)?.body,
      ).toEqual({
        target: {
          type: "validation_answer",
          id: validationId,
          key: "V.01.WHO",
        },
        lockVersion: 5,
        force: true,
        researchLogEntryId: prices.id,
      }),
    );
    await waitFor(() =>
      expect(
        within(sheet).getByRole("row", { name: /Prices downtown/ }),
      ).toBeTruthy(),
    );
  });

  test("the answer's own save failed: M2 says so and sends nothing until it goes through", async () => {
    const user = userEvent.setup();
    let refused = true;
    const calls = formApi({
      answers: [
        withText("V.01.WHO"),
        answer("V.01.PROBLEM"),
        answer("V.01.PROOF"),
      ],
      put: (call) =>
        refused
          ? apiError(409, "ARCHIVED")
          : Response.json(
              answer("V.01.WHO", {
                text: (call.body as { text: string }).text,
                classification: {
                  fau: null,
                  confidence: null,
                  state: "unclassified",
                  evidence: [],
                },
                lockVersion: 2,
              }),
            ),
    });
    renderApp(`${base}/01?q=V.01.WHO`);
    const who = await screen.findByRole("textbox", { name: "Answer to WHO" });
    await user.type(who, " downtown");
    await user.tab();
    await waitFor(() =>
      expect(card("WHO").textContent).toContain("It's archived"),
    );
    await user.click(within(card("WHO")).getByRole("radio", { name: /Fact/ }));
    const sheet = await screen.findByRole("dialog", { name: "Evidence" });
    expect(sheet.textContent).toContain("Couldn't save");
    expect(sheet.textContent).toContain("It's archived");
    const tick = await within(sheet).findByRole("checkbox", {
      name: /Lunch survey/,
    });
    expect(tick.hasAttribute("disabled")).toBe(true);
    expect(calls.filter(({ method }) => method === "POST")).toEqual([]);
    // Its Retry, here in M2, saves it; then evidence goes out on the version it left.
    refused = false;
    await user.click(within(sheet).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(tick.hasAttribute("disabled")).toBe(false));
    await user.click(tick);
    await waitFor(() =>
      expect(calls.find(({ method }) => method === "POST")?.body).toMatchObject(
        {
          lockVersion: 2,
          setFact: true,
        },
      ),
    );
  });

  test("while a change is on its way M2 stays open: Done waits, Escape does nothing", async () => {
    const user = userEvent.setup();
    let release = (_response: Response) => {};
    formApi({
      answers: [
        withText("V.01.WHO"),
        answer("V.01.PROBLEM"),
        answer("V.01.PROOF"),
      ],
      evidence: () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    });
    renderApp(openM2);
    const sheet = await screen.findByRole("dialog", { name: "Evidence" });
    await user.click(
      await within(sheet).findByRole("checkbox", { name: /Lunch survey/ }),
    );
    await waitFor(() =>
      expect(
        within(sheet)
          .getByRole("button", { name: /Done/ })
          .getAttribute("data-pending"),
      ).toBe("true"),
    );
    await user.keyboard("{Escape}");
    await user.click(within(sheet).getByRole("button", { name: /Done/ }));
    expect(screen.getByRole("dialog", { name: "Evidence" })).toBeTruthy();
    release(attached(survey, 2));
    await waitFor(() =>
      expect(
        within(sheet).getByRole("row", { name: /Lunch survey/ }),
      ).toBeTruthy(),
    );
    await user.click(within(sheet).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("Retry after an overwrite that failed for now sends the overwrite again", async () => {
    const user = userEvent.setup();
    let sent = 0;
    const calls = formApi({
      answers: [
        withText("V.01.WHO"),
        answer("V.01.PROBLEM"),
        answer("V.01.PROOF"),
      ],
      evidence: () => {
        sent += 1;
        if (sent === 1) return conflict();
        if (sent === 2) return apiError(503, "UPSTREAM_UNAVAILABLE");
        return attached(prices, 6);
      },
    });
    renderApp(openM2);
    const sheet = await screen.findByRole("dialog", { name: "Evidence" });
    await user.click(
      await within(sheet).findByRole("checkbox", { name: /Prices downtown/ }),
    );
    const question = await screen.findByRole("alertdialog", {
      name: /Someone updated this answer/,
    });
    // A plain attach drops nothing typed: no Copy my input.
    expect(
      within(question).queryByRole("button", { name: "Copy my input" }),
    ).toBeNull();
    await user.click(
      within(question).getByRole("button", { name: "Overwrite with mine" }),
    );
    await waitFor(() => expect(sheet.textContent).toContain("Couldn't save"));
    await user.click(within(sheet).getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(
        calls.filter(({ method }) => method === "POST").at(-1)?.body,
      ).toEqual({
        target: {
          type: "validation_answer",
          id: validationId,
          key: "V.01.WHO",
        },
        lockVersion: 5,
        force: true,
        researchLogEntryId: prices.id,
      }),
    );
    await waitFor(() =>
      expect(
        within(sheet).getByRole("row", { name: /Prices downtown/ }),
      ).toBeTruthy(),
    );
  });

  test("Retry sends the new entry as corrected since it failed", async () => {
    const user = userEvent.setup();
    let sent = 0;
    const calls = formApi({
      answers: [
        withText("V.01.WHO"),
        answer("V.01.PROBLEM"),
        answer("V.01.PROOF"),
      ],
      evidence: () => {
        sent += 1;
        return sent === 1
          ? apiError(503, "UPSTREAM_UNAVAILABLE")
          : attached(survey, 2);
      },
    });
    renderApp(openM2);
    const sheet = await screen.findByRole("dialog", { name: "Evidence" });
    await user.click(within(sheet).getByRole("radio", { name: "New entry" }));
    const topic = within(sheet).getByRole("textbox", { name: /Topic/ });
    await user.type(topic, "Airprot survey");
    await user.click(
      within(sheet).getByRole("button", { name: "Add and attach" }),
    );
    await waitFor(() => expect(sheet.textContent).toContain("Couldn't save"));
    await user.clear(topic);
    await user.type(topic, "Airport survey");
    await user.click(within(sheet).getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(
        calls.filter(({ method }) => method === "POST").at(-1)?.body,
      ).toMatchObject({ newResearchLog: { topic: "Airport survey" } }),
    );
  });

  test("a send that meets an ended session leaves M2 for the sign-in screen", async () => {
    const user = userEvent.setup();
    formApi({
      answers: [
        withText("V.01.WHO"),
        answer("V.01.PROBLEM"),
        answer("V.01.PROOF"),
      ],
      // Answered later, as a network does: M2 holds the screen while it waits.
      evidence: () =>
        new Promise<Response>((resolve) =>
          setTimeout(() => resolve(apiError(401, "UNAUTHENTICATED")), 100),
        ),
    });
    const router = renderApp(openM2);
    const sheet = await screen.findByRole("dialog", { name: "Evidence" });
    await user.click(
      await within(sheet).findByRole("checkbox", { name: /Lunch survey/ }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  });

  test("Load theirs drops the URL typed for it, after Copy my input is offered", async () => {
    const user = userEvent.setup();
    formApi({
      answers: [
        withText("V.01.WHO"),
        answer("V.01.PROBLEM"),
        answer("V.01.PROOF"),
      ],
      evidence: () => conflict(),
    });
    renderApp(openM2);
    const sheet = await screen.findByRole("dialog", { name: "Evidence" });
    await user.click(within(sheet).getByRole("radio", { name: "URL" }));
    await user.type(
      within(sheet).getByRole("textbox", { name: /URL/ }),
      "https://psa.gov.ph/report",
    );
    await user.click(within(sheet).getByRole("button", { name: "Attach URL" }));
    const question = await screen.findByRole("alertdialog", {
      name: /Someone updated this answer/,
    });
    expect(
      within(question).getByRole("button", { name: "Copy my input" }),
    ).toBeTruthy();
    await user.click(
      within(question).getByRole("button", { name: "Load theirs" }),
    );
    await waitFor(() =>
      expect(
        (
          within(sheet).getByRole("textbox", {
            name: /URL/,
          }) as HTMLInputElement
        ).value,
      ).toBe(""),
    );
  });

  test("a 422 naming the new entry's topic says why under it", async () => {
    const user = userEvent.setup();
    formApi({
      answers: [
        withText("V.01.WHO"),
        answer("V.01.PROBLEM"),
        answer("V.01.PROOF"),
      ],
      evidence: () =>
        apiError(422, "VALIDATION_FAILED", {
          details: [{ path: "newResearchLog.topic", code: "too_big" }],
        }),
    });
    renderApp(openM2);
    const sheet = await screen.findByRole("dialog", { name: "Evidence" });
    await user.click(within(sheet).getByRole("radio", { name: "New entry" }));
    await user.type(
      within(sheet).getByRole("textbox", { name: /Topic/ }),
      "Airport survey",
    );
    await user.click(
      within(sheet).getByRole("button", { name: "Add and attach" }),
    );
    await waitFor(() =>
      expect(
        within(sheet)
          .getByRole("textbox", { name: /Topic/ })
          .getAttribute("aria-invalid"),
      ).toBe("true"),
    );
    expect(sheet.textContent).toContain("Check the format");
  });

  test("evidence removed already: the answer is read again", async () => {
    const user = userEvent.setup();
    const link = evidenceOf("7d0f0000-0000-4000-8000-000000000007", prices);
    const calls = formApi({
      answers: [
        withText("V.01.WHO", {
          classification: {
            fau: "assumption",
            confidence: "low",
            state: "assumption",
            evidence: [link],
          },
          lockVersion: 3,
        }),
        answer("V.01.PROBLEM"),
        answer("V.01.PROOF"),
      ],
      evidence: () => apiError(404, "NOT_FOUND"),
    });
    renderApp(openM2);
    const sheet = await screen.findByRole("dialog", { name: "Evidence" });
    const reads = () =>
      calls.filter(
        ({ method, path }) =>
          method === "GET" && path === `${validationPath}/questions/01`,
      ).length;
    const before = reads();
    await user.click(within(sheet).getByRole("button", { name: /Remove/ }));
    await waitFor(() => expect(reads()).toBeGreaterThan(before));
  });

  test("M2's URL opens nothing for an archived idea", async () => {
    formApi({ archived: true });
    renderApp(
      `${base}/01?modal=evidence&about=validation_answer:${validationId}:V.01.WHO`,
    );
    await screen.findByRole("heading", {
      level: 1,
      name: "01 Customer & Problem",
    });
    expect(screen.getByText("This idea is archived")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    // No AI round trip on an archived idea (design-spec 6.8).
    expect(screen.queryByRole("button", { name: "AI" })).toBeNull();
  });

  test("AI ▼ exports this section and imports into this validation, both back to this section", async () => {
    formApi();
    renderApp(`${base}/01`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "AI" }));
    const back = encodeURIComponent(`${base}/01`);
    expect(
      (
        await screen.findByRole("menuitem", { name: "Export for AI" })
      ).getAttribute("href"),
    ).toBe(
      `/w/${workspaceId}/ai/export?source=validation&id=${validationId}&scope=01&returnTo=${back}`,
    );
    expect(
      screen
        .getByRole("menuitem", { name: "Import from AI" })
        .getAttribute("href"),
    ).toBe(
      `/w/${workspaceId}/ai/import?target=validation&id=${validationId}&returnTo=${back}`,
    );
  });

  test("M2's URL about an item not on the screen opens nothing", async () => {
    formApi();
    renderApp(
      `${base}/01?q=V.01.WHO&modal=evidence&about=validation_answer:${validationId}:V.02.OCEAN`,
    );
    // The editable form is in place: only then is "no dialog" an answer.
    await screen.findByRole("textbox", { name: "Answer to WHO" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("M2's URL about a question without F/A/U opens nothing", async () => {
    formApi({
      section: {
        ...section01,
        questions: section01.questions.map((question) =>
          question.key === "V.01.PROOF"
            ? { ...question, hasFau: false }
            : question,
        ),
      },
    });
    renderApp(
      `${base}/01?q=V.01.WHO&modal=evidence&about=validation_answer:${validationId}:V.01.PROOF`,
    );
    await screen.findByRole("textbox", { name: "Answer to WHO" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
