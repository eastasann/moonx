import {
  conditionAnswersOutside,
  decidesElsewhere,
  isQuestionShown,
  selfAnalysisProgress,
} from "@moonx/domain";
import type {
  Me,
  SelfAnalysisAnswer,
  SelfAnalysisHome,
  TemplateQuestion,
  TemplateSection,
} from "@moonx/schemas";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ana, apiError, type Call, renderApp, stubApi } from "../test/api";
import { workspaceId } from "../test/ideas";
import {
  answer,
  incomeSection,
  otherTeam,
  personal,
  sectionRead,
  selfAnalysisId,
  selfHome,
  viewerOfBcdx,
  whySection,
} from "../test/selfAnalysis";

// 11 Question form for a self-analysis section (design-spec 6.2・6.11, SDD 5.8 S2・S3).

afterEach(() => {
  vi.unstubAllGlobals();
});

const base = `/w/${workspaceId}/self-analysis`;
const api = "/api/v1/me/self-analysis";

/** The API of 11: S1, S2 of `sections`, and S3 saving onto what it holds. */
function formApi({
  me = ana,
  home = selfHome(),
  read,
  sections = [whySection, incomeSection],
  answers = {},
  threads = [],
  write = (_call: Call): Response | undefined => undefined,
  beforeSave,
}: {
  me?: Me;
  home?: SelfAnalysisHome;
  /** Answers S1 GET in place of `home`. */
  read?: () => Response;
  sections?: TemplateSection[];
  answers?: Record<string, Partial<SelfAnalysisAnswer>>;
  threads?: unknown[];
  /** Answers the comment writes (C1 POST). */
  write?: (call: Call) => Response | undefined;
  /** Holds a save back before the fake applies it, as a slow S3 would. */
  beforeSave?: () => Promise<void>;
} = {}) {
  const saved = new Map<string, SelfAnalysisAnswer>();
  for (const section of sections) {
    for (const { key } of section.questions) {
      saved.set(key, answer(key, answers[key]));
    }
  }
  return stubApi((call: Call) => {
    const { method, path } = call;
    if (method === "GET" && path === "/api/v1/me") return Response.json(me);
    if (method === "PATCH" && path === "/api/v1/me") return Response.json(me);
    if (method === "GET" && path === api) {
      return read?.() ?? Response.json(home);
    }
    const section = sections.find(
      ({ key }) => path === `${api}/sections/${key}`,
    );
    if (method === "GET" && section !== undefined) {
      // What S2 reads of the other sections, from what this fake holds now.
      const version = sections.flatMap(({ questions }) => questions);
      return Response.json(
        sectionRead(
          section,
          section.questions.map(({ key }) => saved.get(key) ?? answer(key)),
          {
            conditionAnswers: conditionAnswersOutside(
              section.questions,
              version,
              saved,
            ),
            decidesElsewhere: decidesElsewhere(section.questions, version),
          },
        ),
      );
    }
    if (method === "PUT" && path.startsWith(`${api}/answers/`)) {
      const apply = () => {
        const key = decodeURIComponent(path.split("/").at(-1) ?? "");
        const before = saved.get(key) ?? answer(key);
        const body = call.body as {
          text?: string;
          amount?: number | null;
          lockVersion: number;
        };
        const after = answer(key, {
          ...before,
          text: body.text ?? before.text,
          amount: body.amount === undefined ? before.amount : body.amount,
          lockVersion: body.lockVersion + 1,
        });
        saved.set(key, after);
        return Response.json(after);
      };
      return beforeSave === undefined ? apply() : beforeSave().then(apply);
    }
    if (method === "GET" && path.startsWith("/api/v1/comments?")) {
      return Response.json({ threads, unresolvedCount: threads.length });
    }
    if (method === "GET" && path.includes("/mention-candidates?")) {
      return Response.json({ items: [] });
    }
    if (path.startsWith("/api/v1/comments")) return write(call);
    return undefined;
  });
}

const card = (title: string) => screen.getByRole("region", { name: title });
const puts = (calls: Call[]) =>
  calls.filter(({ method }) => method === "PUT").map(({ body }) => body);

describe("11 Question form for a self analysis (design-spec 6.2・6.11)", () => {
  test("opens on the first question not answered, with EXAMPLE, no F/A/U, and saves as typed", async () => {
    const user = userEvent.setup();
    const calls = formApi({
      answers: { "SA.WHY.2": { text: "More time at home", lockVersion: 1 } },
    });
    renderApp(`${base}/WHY`);
    const first = await screen.findByRole("textbox", { name: "Answer to Q1" });
    await waitFor(() => expect(document.activeElement).toBe(first));
    expect(screen.getByText("1/2")).toBeTruthy();
    expect(card("Q2").textContent).toContain("More time at home");
    expect(
      within(card("Q1"))
        .getByRole("button", { name: "EXAMPLE" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    // A self-analysis has no F/A/U and no research (6.2).
    expect(screen.queryByRole("radiogroup", { name: /Fact/ })).toBeNull();
    expect(screen.queryByText("Related research")).toBeNull();
    await user.type(first, "For my family");
    await waitFor(
      () =>
        expect(puts(calls)).toEqual([
          { text: "For my family", lockVersion: 0 },
        ]),
      { timeout: 3000 },
    );
    expect(await screen.findByText("2/2")).toBeTruthy();
    await waitFor(() => expect(document.title).toBe("WHY · BCDX · moonx"));
  });

  test("Q15–17: an amount in the self analysis's currency and why; a bad amount says so and is not sent", async () => {
    const user = userEvent.setup();
    const calls = formApi();
    renderApp(`${base}/INCOME`);
    const amount = await screen.findByRole("textbox", { name: "Amount" });
    await user.type(amount, "1,5");
    expect(
      await within(card("Q15")).findByText("Enter a number such as 1,500.50"),
    ).toBeTruthy();
    await user.clear(amount);
    await user.type(amount, "30000");
    await user.type(
      screen.getByRole("textbox", { name: "Why this amount?" }),
      "Rent",
    );
    // Leaving the amount sent it; the reason goes once typing pauses.
    await waitFor(
      () =>
        expect(puts(calls)).toEqual([
          { amount: 30000, lockVersion: 0 },
          { text: "Rent", lockVersion: 1 },
        ]),
      { timeout: 3000 },
    );
    expect(card("Q15").textContent).toContain("₱");
  });

  test("the bottom bar: AI ▼ on this section, and the next section", async () => {
    const user = userEvent.setup();
    formApi();
    const router = renderApp(`${base}/WHY`);
    await screen.findByRole("textbox", { name: "Answer to Q1" });
    await user.click(screen.getByRole("button", { name: /AI/ }));
    expect(
      screen
        .getByRole("menuitem", { name: "Export for AI" })
        .getAttribute("href"),
    ).toBe(
      `/w/${workspaceId}/ai/export?source=self_analysis&scope=WHY&returnTo=${encodeURIComponent(`${base}/WHY`)}`,
    );
    await user.keyboard("{Escape}");
    await user.click(
      screen.getByRole("button", { name: "Next: PERSONAL INCOME" }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`${base}/INCOME`),
    );
  });

  test("a section the template does not have is not found", async () => {
    formApi();
    renderApp(`${base}/NOPE`);
    expect(
      await screen.findByRole("heading", {
        name: "Not found. Check the link.",
      }),
    ).toBeTruthy();
  });

  test("no published template: says so in the form's place, the navigation kept (6.0.6)", async () => {
    formApi({ read: () => apiError(409, "TEMPLATE_NOT_PUBLISHED") });
    renderApp(`${base}/WHY`);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Templates aren't ready yet. Ask your administrator.",
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(
      screen
        .getAllByRole("link", { name: "Self Analysis" })
        .some((link) => link.getAttribute("aria-current") === "page"),
    ).toBe(true);
  });

  test("a Viewer of this workspace is taken to their personal workspace's 11", async () => {
    formApi({ me: viewerOfBcdx });
    const router = renderApp(`${base}/WHY?q=SA.WHY.2`);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/w/${personal.id}/self-analysis/WHY`,
      ),
    );
    expect(router.state.location.search).toMatchObject({ q: "SA.WHY.2" });
  });

  test("an answer's 💬: its threads say the workspace each is from; a new one goes where it is shared", async () => {
    const author = {
      id: "6f1c2b3a-0000-4000-8000-000000000002",
      displayName: "Paolo Gonzaga",
      avatarUrl: null,
      badge: null,
    };
    const target = {
      type: "self_analysis_answer",
      id: selfAnalysisId,
      key: "SA.WHY.1",
    };
    const calls = formApi({
      answers: {
        "SA.WHY.1": {
          commentCounts: [
            { workspaceId, workspaceName: "BCDX", count: 1 },
            {
              workspaceId: otherTeam.id,
              workspaceName: otherTeam.name,
              count: 1,
            },
          ],
        },
      },
      threads: [
        {
          root: {
            id: "c0000000-0000-4000-8000-000000000001",
            workspace: otherTeam,
            target,
            parentId: null,
            author,
            body: "A strong reason.",
            mentions: [],
            resolvedAt: null,
            resolvedBy: null,
            editedAt: null,
            deleted: false,
            createdAt: "2026-10-20T01:00:00Z",
          },
          replies: [],
        },
      ],
    });
    const user = userEvent.setup();
    renderApp(`${base}/WHY?q=SA.WHY.1`);
    await screen.findByRole("textbox", { name: "Answer to Q1" });
    await user.click(
      within(card("Q1")).getByRole("button", {
        name: "Comments on WHY Q1, 2 comments",
      }),
    );
    const panel = await screen.findByRole("complementary", {
      name: "Comments",
    });
    expect(
      await within(panel).findByText(`From ${otherTeam.name}`),
    ).toBeTruthy();
    // BCDX, open now, is shared: a new thread goes there.
    expect(
      within(panel).getByRole("textbox", { name: "Add a comment" }),
    ).toBeTruthy();
    // A reply's mentions come from the thread's own workspace (W8).
    await user.click(within(panel).getByRole("button", { name: "Reply" }));
    await waitFor(() =>
      expect(
        calls.some(({ path }) =>
          path.startsWith(
            `/api/v1/workspaces/${otherTeam.id}/mention-candidates?`,
          ),
        ),
      ).toBe(true),
    );
  });

  test("open where it is not shared: a new thread goes to a workspace it is shared with, chosen", async () => {
    const user = userEvent.setup();
    const me: Me = {
      ...ana,
      lastWorkspaceId: personal.id,
      memberships: [...ana.memberships, { workspace: personal, role: "owner" }],
    };
    const calls = formApi({
      me,
      write: (call) =>
        call.method === "POST" && call.path === "/api/v1/comments"
          ? Response.json({}, { status: 201 })
          : undefined,
    });
    renderApp(`/w/${personal.id}/self-analysis/WHY?q=SA.WHY.1`);
    await screen.findByRole("textbox", { name: "Answer to Q1" });
    await user.click(
      within(card("Q1")).getByRole("button", { name: "Comments on WHY Q1" }),
    );
    const panel = await screen.findByRole("complementary", {
      name: "Comments",
    });
    const postTo = await within(panel).findByRole("button", {
      name: /Post to/,
    });
    expect(postTo.textContent).toContain("BCDX");
    // Who can be mentioned follows the workspace chosen (W8).
    await waitFor(() =>
      expect(
        calls.some(({ path }) =>
          path.startsWith(
            `/api/v1/workspaces/${workspaceId}/mention-candidates?`,
          ),
        ),
      ).toBe(true),
    );
    await user.type(
      within(panel).getByRole("textbox", { name: "Add a comment" }),
      "Still true.",
    );
    await user.click(within(panel).getByRole("button", { name: "Post" }));
    await waitFor(() =>
      expect(
        calls.find(
          ({ method, path }) =>
            method === "POST" && path === "/api/v1/comments",
        )?.body,
      ).toMatchObject({
        workspaceId,
        target: {
          type: "self_analysis_answer",
          id: selfAnalysisId,
          key: "SA.WHY.1",
        },
        body: "Still true.",
      }),
    );
  });

  test("Post to another workspace: who can be mentioned follows it", async () => {
    const user = userEvent.setup();
    const me: Me = {
      ...ana,
      lastWorkspaceId: personal.id,
      memberships: [...ana.memberships, { workspace: personal, role: "owner" }],
    };
    const calls = formApi({
      me,
      home: selfHome({
        shares: [
          {
            workspace: { id: workspaceId, name: "BCDX" },
            sharedAt: "2026-10-01T01:00:00Z",
          },
          { workspace: otherTeam, sharedAt: "2026-10-02T01:00:00Z" },
        ],
      }),
    });
    renderApp(`/w/${personal.id}/self-analysis/WHY?q=SA.WHY.1`);
    await screen.findByRole("textbox", { name: "Answer to Q1" });
    await user.click(
      within(card("Q1")).getByRole("button", { name: "Comments on WHY Q1" }),
    );
    const panel = await screen.findByRole("complementary", {
      name: "Comments",
    });
    await user.click(
      await within(panel).findByRole("button", { name: /Post to/ }),
    );
    await user.click(
      await screen.findByRole("option", { name: otherTeam.name }),
    );
    await waitFor(() =>
      expect(
        calls.some(({ path }) =>
          path.startsWith(
            `/api/v1/workspaces/${otherTeam.id}/mention-candidates?`,
          ),
        ),
      ).toBe(true),
    );
  });

  test("shared nowhere: no new thread, and how to start one", async () => {
    const user = userEvent.setup();
    const me: Me = {
      ...ana,
      lastWorkspaceId: personal.id,
      memberships: [...ana.memberships, { workspace: personal, role: "owner" }],
    };
    formApi({ me, home: selfHome({ shares: [] }) });
    renderApp(`/w/${personal.id}/self-analysis/WHY?q=SA.WHY.1`);
    await screen.findByRole("textbox", { name: "Answer to Q1" });
    await user.click(
      within(card("Q1")).getByRole("button", { name: "Comments on WHY Q1" }),
    );
    const panel = await screen.findByRole("complementary", {
      name: "Comments",
    });
    expect(
      await within(panel).findByText(
        "Share your self analysis with a team workspace to start a thread.",
      ),
    ).toBeTruthy();
    expect(within(panel).queryByRole("textbox")).toBeNull();
  });
});

describe("a display condition naming another section's question (design-spec 6.2・6.11)", () => {
  /** LATER, whose first question shows once WHY's Q1 is "Yes". */
  const laterSection: TemplateSection = {
    key: "LATER",
    part: null,
    title: "LATER",
    subtitle: null,
    guidance: null,
    questions: [
      {
        ...(whySection.questions[1] as TemplateQuestion),
        key: "SA.LATER.1",
        sectionKey: "LATER",
        title: "Q3",
        prompt: "What would you do first?",
        displayCondition: { "SA.WHY.1": ["Yes"] },
      },
      {
        ...(whySection.questions[1] as TemplateQuestion),
        key: "SA.LATER.2",
        sectionKey: "LATER",
        title: "Q4",
        prompt: "Who would help?",
      },
    ],
  };
  const sections = [whySection, laterSection];
  /** S1 as 10 counts it on all of `answers` (packages/domain, as the API does). */
  const hubOf = (answers: Record<string, string>) =>
    selfHome(
      selfAnalysisProgress(
        sections,
        new Map(
          Object.entries(answers).map(([key, text]) => [
            key,
            { text, amount: null },
          ]),
        ),
      ),
    );

  test.each([
    ["Yes", true],
    ["No", false],
  ])(
    "LATER shows a question by WHY's Q1 (%s) and counts as 10 does",
    async (why, isShown) => {
      const home = hubOf({ "SA.WHY.1": why });
      formApi({
        home,
        sections,
        answers: { "SA.WHY.1": { text: why, lockVersion: 1 } },
      });
      renderApp(`${base}/LATER`);
      await screen.findByRole("region", { name: "Q4" });
      const hub = home.sections.find(({ key }) => key === "LATER");
      expect(hub?.total).toBe(isShown ? 2 : 1);
      expect(screen.getByText(`${hub?.answered}/${hub?.total}`)).toBeTruthy();
      expect(screen.queryByRole("region", { name: "Q3" }) !== null).toBe(
        isShown,
      );
      expect(
        laterSection.questions.filter((question) =>
          isQuestionShown(question, new Map([["SA.WHY.1", { text: why }]])),
        ),
      ).toHaveLength(hub?.total ?? 0);
    },
  );

  test("a question another section's condition names says how to reveal it while unanswered", async () => {
    const user = userEvent.setup();
    const calls = formApi({ home: hubOf({}), sections });
    renderApp(`${base}/WHY?q=SA.WHY.1`);
    const first = await screen.findByRole("textbox", { name: "Answer to Q1" });
    expect(card("Q1").textContent).toContain(
      "Answer Q1 to see the next questions",
    );
    await user.type(first, "Yes");
    expect(card("Q1").textContent).not.toContain("to see the next");
    await waitFor(() => expect(puts(calls)).toHaveLength(1), {
      timeout: 3000,
    });
  });

  test("a save sent on leaving reads the next section again, whose condition names it", async () => {
    const user = userEvent.setup();
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls = formApi({
      home: hubOf({}),
      sections,
      beforeSave: () => held,
    });
    const router = renderApp(`${base}/WHY?q=SA.WHY.1`);
    const first = await screen.findByRole("textbox", { name: "Answer to Q1" });
    await user.type(first, "Yes");
    await router.navigate({ href: `${base}/LATER` });
    // Read before the save of Q1 landed: what it shows is not shown yet.
    expect(await screen.findByText("0/1")).toBeTruthy();
    release();
    expect(await screen.findByText("0/2")).toBeTruthy();
    expect(card("Q3")).toBeTruthy();
    expect(
      calls.filter(
        ({ method, path }) =>
          method === "GET" && path === `${api}/sections/LATER`,
      ),
    ).toHaveLength(2);
  });
});
