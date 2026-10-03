import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { renderApp, type StubRequest, WORKSPACE } from "./support";
import {
  ANALYSIS,
  answer,
  ME,
  registerSelfAnalysisHooks,
  SECTION_INCOME,
  SECTION_WHY,
  sectionAnswers,
  selfAnalysisApi,
} from "./support-self-analysis";

registerSelfAnalysisHooks();

const PATH = (section: string, search = "") => `/w/${WORKSPACE}/self-analysis/${section}${search}`;
const ANSWER = (key: string) => `PUT ${ME}/answers/${key}`;
const writes = (calls: StubRequest[]) => calls.filter((c) => c.method !== "GET");

const saved =
  (key: string, patch: Record<string, unknown> = {}, lockVersion = 1) =>
  ({ body }: { body: unknown }) => {
    const { lockVersion: _lock, ...fields } = body as Record<string, unknown>;
    return { body: answer(key, { ...fields, lockVersion, ...patch } as never) };
  };

test("the form shows the section, its guidance and the count, and has no F/A/U controls", async () => {
  selfAnalysisApi(
    {},
    {
      answers: {
        WHY: sectionAnswers(SECTION_WHY, {
          "SA.WHY.1": { text: "Time with family", lockVersion: 1 },
        }),
      },
    },
  );
  await renderApp(PATH("WHY"));
  expect(await screen.findByRole("heading", { level: 1, name: "WHY" })).toBeInTheDocument();
  expect(screen.getByText("Start with motivation.")).toBeInTheDocument();
  expect(screen.getByText("1/2 answered")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Fact" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Assumption" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Unknown" })).toBeNull();
});

test("it opens on the first unanswered question with its example and hint", async () => {
  selfAnalysisApi(
    {},
    {
      answers: {
        WHY: sectionAnswers(SECTION_WHY, {
          "SA.WHY.1": { text: "Time with family", lockVersion: 1 },
        }),
      },
    },
  );
  await renderApp(PATH("WHY"));
  expect(await screen.findByRole("textbox", { name: "Prompt of WHY 2" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Hint" })).toBeInTheDocument();
});

test("?q= opens on that question, whose example starts open", async () => {
  selfAnalysisApi();
  await renderApp(PATH("WHY", "?q=SA.WHY.1"));
  expect(await screen.findByRole("textbox", { name: "Prompt of WHY 1" })).toBeInTheDocument();
  expect(screen.getByText("I want more time with family.")).toBeInTheDocument();
});

test("a typed answer is saved after a pause with the answer's version and the header says Saved", async () => {
  const { calls } = selfAnalysisApi({ [ANSWER("SA.WHY.1")]: saved("SA.WHY.1") });
  await renderApp(PATH("WHY", "?q=SA.WHY.1"));
  const field = await screen.findByRole("textbox", { name: "Prompt of WHY 1" });
  await userEvent.type(field, "To work near home");
  await waitFor(() => expect(writes(calls)).toHaveLength(1), { timeout: 4000 });
  expect(writes(calls)[0]).toMatchObject({
    method: "PUT",
    body: { text: "To work near home", lockVersion: 0 },
  });
  expect(await screen.findByText("Saved")).toBeInTheDocument();
  expect(await screen.findByText("1/2 answered")).toBeInTheDocument();
}, 15_000);

test("an amount question has an amount and a reason, saved as the number and the text", async () => {
  const { calls } = selfAnalysisApi({
    [ANSWER("SA.INCOME.1")]: saved("SA.INCOME.1"),
  });
  const user = userEvent.setup();
  await renderApp(PATH("INCOME", "?q=SA.INCOME.1"));
  const amount = await screen.findByRole("textbox", { name: "Amount" });
  await user.click(amount);
  await user.type(amount, "40000");
  await user.tab();
  await waitFor(() => expect(writes(calls).length).toBeGreaterThan(0), { timeout: 4000 });
  const last = writes(calls).at(-1);
  expect(last).toMatchObject({ method: "PUT", body: { amount: 40000 } });
  const reason = screen.getByRole("textbox", { name: "Why this amount?" });
  await user.type(reason, "Rent and food");
  await user.tab();
  await waitFor(() =>
    expect(writes(calls).at(-1)).toMatchObject({ body: { text: "Rent and food" } }),
  );
}, 15_000);

test("an amount outside the range says why and is not sent", async () => {
  const { calls } = selfAnalysisApi({ [ANSWER("SA.INCOME.1")]: saved("SA.INCOME.1") });
  const user = userEvent.setup();
  await renderApp(PATH("INCOME", "?q=SA.INCOME.1"));
  const amount = await screen.findByRole("textbox", { name: "Amount" });
  await user.click(amount);
  await user.type(amount, "-5");
  await user.tab();
  expect(await screen.findByText("Enter a number from 0 to 1,000,000,000,000")).toBeInTheDocument();
  await new Promise((resolve) => setTimeout(resolve, 1300));
  expect(writes(calls)).toHaveLength(0);
}, 15_000);

test("an answer with an amount shows it with the reason in the quiet form of an unfocused question", async () => {
  selfAnalysisApi(
    {},
    {
      answers: {
        INCOME: sectionAnswers(SECTION_INCOME, {
          "SA.INCOME.1": { text: "Rent and food", amount: 40000, lockVersion: 2 },
        }),
      },
    },
  );
  await renderApp(PATH("INCOME", "?q=SA.INCOME.2"));
  await screen.findByRole("textbox", { name: "Amount" });
  expect(screen.getByText("₱40,000 — Rent and food")).toBeInTheDocument();
});

test("a 409 asks what to do; loading theirs replaces the field", async () => {
  selfAnalysisApi({
    [ANSWER("SA.WHY.1")]: () => ({
      status: 409,
      body: {
        error: {
          code: "CONFLICT",
          message: "x",
          requestId: "abcdef12",
          current: {
            value: answer("SA.WHY.1", { text: "From my phone", lockVersion: 4 }),
            lockVersion: 4,
            updatedAt: new Date().toISOString(),
            updatedBy: null,
          },
        },
      },
    }),
  });
  const user = userEvent.setup();
  await renderApp(PATH("WHY", "?q=SA.WHY.1"));
  const field = await screen.findByRole("textbox", { name: "Prompt of WHY 1" });
  await user.type(field, "From my laptop");
  await user.tab();
  const dialog = await screen.findByRole("dialog", { name: "Someone updated this first" });
  expect(within(dialog).getByText("From my phone")).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Load theirs" }));
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Prompt of WHY 1" })).toHaveValue("From my phone"),
  );
});

test("each answer has comments with the total over the workspaces it is shared with, and a history", async () => {
  selfAnalysisApi(
    {},
    {
      answers: {
        WHY: sectionAnswers(SECTION_WHY, {
          "SA.WHY.1": {
            text: "x",
            lockVersion: 1,
            commentCounts: [
              { workspaceId: WORKSPACE, workspaceName: "BCDX", count: 2 },
              {
                workspaceId: "33333333-3333-4333-8333-333333333333",
                workspaceName: "Side",
                count: 1,
              },
            ],
          },
        }),
      },
    },
  );
  const user = userEvent.setup();
  const { router } = await renderApp(PATH("WHY", "?q=SA.WHY.1"));
  await screen.findByRole("textbox", { name: "Prompt of WHY 1" });
  const card = screen.getAllByRole("group", { name: "WHY 1" })[0] as HTMLElement;
  expect(within(card).getByText("3")).toBeInTheDocument();
  await user.click(within(card).getByRole("button", { name: "History" }));
  await waitFor(() =>
    expect(router.state.location.search).toMatchObject({
      panel: "history",
      target: `self_analysis_answer:${ANALYSIS}:SA.WHY.1`,
    }),
  );
});

test("the section switcher lists the sections of the template and Next section moves on", async () => {
  selfAnalysisApi();
  const user = userEvent.setup();
  const { router } = await renderApp(PATH("WHY"));
  await screen.findByRole("heading", { level: 1, name: "WHY" });
  expect(screen.getByRole("button", { name: "← Previous section" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Switch section" }));
  expect(await screen.findByRole("menuitem", { name: "PERSONAL INCOME" })).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/self-analysis/INCOME`,
  );
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Next section →" }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe(`/w/${WORKSPACE}/self-analysis/INCOME`),
  );
});

test("the AI menu exports and imports this section of the self analysis", async () => {
  selfAnalysisApi();
  const user = userEvent.setup();
  await renderApp(PATH("WHY"));
  await screen.findByRole("heading", { level: 1, name: "WHY" });
  await user.click(screen.getByRole("button", { name: "AI" }));
  const returnTo = encodeURIComponent(PATH("WHY"));
  expect(await screen.findByRole("menuitem", { name: "Export for AI" })).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/ai/export?source=self_analysis&scope=WHY&returnTo=${returnTo}`,
  );
  // An import covers the whole self analysis, so it carries no scope (design-spec 6.7).
  expect(screen.getByRole("menuitem", { name: "Import from AI" })).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/ai/import?target=self_analysis&returnTo=${returnTo}`,
  );
});

test("a section that does not exist says it was not found", async () => {
  selfAnalysisApi({
    [`GET ${ME}/sections/NOPE`]: () => ({
      status: 404,
      body: { error: { code: "NOT_FOUND", message: "x", requestId: "abcdef12-0000" } },
    }),
  });
  await renderApp(PATH("NOPE"));
  expect(await screen.findByText("Not found. Check the link.")).toBeInTheDocument();
});

test("leaving the form after a save reads the home again, so its counts are not 30 seconds old", async () => {
  const { calls } = selfAnalysisApi({ [ANSWER("SA.WHY.1")]: saved("SA.WHY.1") });
  const { router } = await renderApp(PATH("WHY", "?q=SA.WHY.1"));
  const field = await screen.findByRole("textbox", { name: "Prompt of WHY 1" });
  await userEvent.type(field, "To work near home");
  await waitFor(() => expect(writes(calls)).toHaveLength(1), { timeout: 4000 });
  const homeReads = () => calls.filter((c) => c.method === "GET" && c.url.pathname === ME).length;
  const before = homeReads();
  router.history.push(`/w/${WORKSPACE}/self-analysis`);
  await screen.findByRole("heading", { level: 1, name: "My Self Analysis" });
  await waitFor(() => expect(homeReads()).toBeGreaterThan(before));
}, 15_000);
