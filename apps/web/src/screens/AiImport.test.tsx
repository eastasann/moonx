import type { Classification, ImportContext, Me, Role } from "@moonx/schemas";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  planContext,
  prices,
  selfAnalysisContext,
  survey,
  validationContext,
} from "../test/ai";
import { ana, apiError, type Call, renderApp, stubApi } from "../test/api";
import { workspaceId } from "../test/ideas";
import { home, validationId } from "../test/validation";

// 25 Import from AI (design-spec 6.7, s25-import.html).

afterEach(() => {
  vi.unstubAllGlobals();
});

const ideaHref = `/w/${workspaceId}/ideas/${home.idea.id}`;
const questionsHref = `${ideaHref}/questions/01`;
const importPath = (search = `target=validation&id=${validationId}`) =>
  `/w/${workspaceId}/ai/import?${search}`;
const applyPath = "/api/v1/ai/import/apply";

const as = (role: Role): Me => ({
  ...ana,
  memberships: ana.memberships.map((membership) => ({ ...membership, role })),
});

/** The API of 25: X2 answers `context()` (read each time), X3 `applyCall` or success. */
function importApi({
  me = ana,
  context = () => validationContext(),
  applyCall,
  evidence,
}: {
  me?: Me;
  context?: () => ImportContext;
  applyCall?: (call: Call) => Response | undefined;
  /** M2's sends (V4 POST, V5 DELETE). */
  evidence?: (call: Call) => Response | undefined;
} = {}) {
  return stubApi((call) => {
    const { method, path } = call;
    if (method === "GET" && path === "/api/v1/me") return Response.json(me);
    if (method === "PATCH" && path === "/api/v1/me") return Response.json(me);
    if (method === "GET" && path.startsWith("/api/v1/ai/import/context?")) {
      return Response.json(context());
    }
    if (
      method === "GET" &&
      path === `/api/v1/ideas/${home.idea.id}/validation`
    ) {
      return Response.json(home);
    }
    if (
      method === "GET" &&
      path.startsWith(`/api/v1/validations/${validationId}/research-log`)
    ) {
      return Response.json({ items: [survey, prices], nextCursor: null });
    }
    if (
      (method === "POST" &&
        path === `/api/v1/validations/${validationId}/evidence`) ||
      (method === "DELETE" && path.startsWith("/api/v1/evidence/"))
    ) {
      return evidence?.(call);
    }
    if (method === "POST" && path === applyPath) {
      return (
        applyCall?.(call) ??
        Response.json({
          applied: (call.body as { changes: unknown[] }).changes.length,
          needsClassification: 1,
          batchId: "4f3e2d1c-0000-4000-8000-000000000001",
        })
      );
    }
    return undefined;
  });
}

const applyCalls = (calls: Call[]) =>
  calls.filter(({ method, path }) => method === "POST" && path === applyPath);

const paste = async (
  user: ReturnType<typeof userEvent.setup>,
  text: string,
) => {
  const field = await screen.findByRole("textbox", {
    name: /Reply from your AI/,
  });
  // Typed as a paste is: in one go (user.type reads brackets as keys).
  fireEvent.change(field, { target: { value: text } });
  await user.click(screen.getByRole("button", { name: "Next" }));
};

const reply = [
  "## [V.01.WHO]",
  "Office workers aged 25–45 near Lacson St.",
  "",
  "## [V.01.PROBLEM]",
  "Lunch takes too long.",
  "",
  "## [V.01.FREQUENCY]",
  "Every working day.",
].join("\n");

const item = (code: RegExp) => screen.getByRole("region", { name: code });

describe("25 Import from AI (design-spec 6.7)", () => {
  test("① → ② → ③: changes beside the answers, F/A/U set again, applied at once, back with the count", async () => {
    const user = userEvent.setup();
    const calls = importApi();
    const router = renderApp(
      importPath(
        `target=validation&id=${validationId}&returnTo=${encodeURIComponent(questionsHref)}`,
      ),
    );
    expect(
      await screen.findByText(`${home.idea.name} · validation questions`),
    ).toBeTruthy();
    await paste(user, reply);
    // ②: every block on its question.
    expect(await screen.findByText("[V.01.WHO] WHO")).toBeTruthy();
    expect(screen.getAllByText("Matched")).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Next" }));
    // ③
    expect(
      await screen.findByText(
        "to apply. Changed answers go back to Unclassified so you can check them.",
        { exact: false },
      ),
    ).toBeTruthy();
    expect(screen.getByText("2 changes")).toBeTruthy();
    const who = item(/01 · WHO/);
    expect(
      within(who).getByText("Who is the primary paying customer?"),
    ).toBeTruthy();
    expect(within(who).getByText("Assumption · Medium")).toBeTruthy();
    expect(within(who).getByText("Unclassified")).toBeTruthy();
    expect(
      (
        within(who).getByRole("textbox", {
          name: "Imported answer to 01 · WHO",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("Office workers aged 25–45 near Lacson St.");
    // "Current ○ Empty" and the empty answer under it.
    expect(within(item(/01 · PROBLEM/)).getAllByText("Empty")).toHaveLength(2);
    // The unchanged answer is folded (6.7 ③).
    expect(
      screen.getByRole("button", { name: "1 unchanged answer" }),
    ).toBeTruthy();
    expect(screen.queryByRole("region", { name: /01 · FREQUENCY/ })).toBeNull();
    // F/A/U again for WHO; PROBLEM left Unclassified.
    await user.click(within(who).getByRole("radio", { name: /Assumption/ }));
    await user.click(within(who).getByRole("radio", { name: "High" }));
    expect(
      screen.getByText("Each change is saved in history as an AI import."),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Apply 2 changes" }));
    await waitFor(() => expect(applyCalls(calls)).toHaveLength(1));
    expect(applyCalls(calls)[0]?.body).toEqual({
      target: { type: "validation", id: validationId },
      changes: [
        {
          questionKey: "V.01.WHO",
          text: "Office workers aged 25–45 near Lacson St.",
          classification: { fau: "assumption", confidence: "high" },
          baseLockVersion: 3,
        },
        {
          questionKey: "V.01.PROBLEM",
          text: "Lunch takes too long.",
          baseLockVersion: 0,
        },
      ],
    });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(questionsHref),
    );
    expect(
      (await screen.findAllByText("2 answers updated · 1 needs F/A/U")).length,
    ).toBeGreaterThan(0);
  });

  test("an edited answer and an unchecked one: only what is checked is applied, as edited", async () => {
    const user = userEvent.setup();
    const calls = importApi();
    renderApp(importPath());
    await paste(user, reply);
    await user.click(await screen.findByRole("button", { name: "Next" }));
    const problem = await screen.findByRole("region", { name: /01 · PROBLEM/ });
    const field = within(problem).getByRole("textbox", {
      name: "Imported answer to 01 · PROBLEM",
    });
    await user.clear(field);
    await user.type(field, "Lunch takes an hour.");
    await user.click(
      within(item(/01 · WHO/)).getByRole("checkbox", {
        name: "Apply the change to 01 · WHO",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Apply 1 change" }));
    await waitFor(() => expect(applyCalls(calls)).toHaveLength(1));
    expect(applyCalls(calls)[0]?.body).toMatchObject({
      changes: [{ questionKey: "V.01.PROBLEM", text: "Lunch takes an hour." }],
    });
  });

  test("① needs a reply, refuses one too long, and finds no IDs in plain text", async () => {
    const user = userEvent.setup();
    importApi();
    renderApp(importPath());
    await screen.findByRole("textbox", { name: /Reply from your AI/ });
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Can't be empty")).toBeTruthy();
    await paste(user, "x".repeat(200_001));
    expect(
      screen.getByText("This is too long. Import fewer questions at a time."),
    ).toBeTruthy();
    await paste(user, "Customers are office workers.");
    expect(screen.getByText("No question IDs found")).toBeTruthy();
    // The example reads as a block itself (6.7 ①).
    expect(screen.getByText(/## \[V\.01\.WHO\]/)).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Continue without IDs" }),
    );
    expect(
      await screen.findByText(
        "Unmatched block “Customers are office workers.”",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Nothing to import")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Next" }).hasAttribute("disabled"),
    ).toBe(true);
    // Put on a question, it goes on.
    await user.type(
      screen.getByRole("combobox", { name: /Question for Unmatched block/ }),
      "PROBLEM",
    );
    await user.click(
      await screen.findByRole("option", { name: /01 · PROBLEM/ }),
    );
    expect(screen.getByText("Matched")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Next" }).hasAttribute("disabled"),
    ).toBe(false);
  });

  test("② unknown, hidden and duplicate blocks; Use this one and Discard", async () => {
    const user = userEvent.setup();
    importApi();
    renderApp(importPath());
    await paste(
      user,
      [
        "## [V.01.WHO]",
        "First",
        "## [V.01.WHO]",
        "Second",
        "## [V.99.NOPE]",
        "Elsewhere",
        "## [V.02.RED_1]",
        "Hidden",
      ].join("\n"),
    );
    expect(
      await screen.findByText(
        "No question V.99.NOPE here. Choose one, or it is discarded.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("This question is hidden")).toBeTruthy();
    expect(
      screen.getAllByText("Another block is for this question too. Keep one."),
    ).toHaveLength(2);
    expect(
      screen.getByText("Keep one block for each question to go on."),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Next" }).hasAttribute("disabled"),
    ).toBe(true);
    await user.click(
      screen.getAllByRole("button", { name: "Use this one" })[1] as HTMLElement,
    );
    expect(screen.getByText("Discarded")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Next" }).hasAttribute("disabled"),
    ).toBe(false);
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.queryByText("Discarded")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Next" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  test("③ a choice that is none of the question's holds Apply until it is fixed", async () => {
    const user = userEvent.setup();
    importApi();
    renderApp(importPath());
    await paste(user, "## [V.02.OCEAN]\nPurple");
    await user.click(await screen.findByRole("button", { name: "Next" }));
    expect(
      await screen.findByText("Use one of: Red, Blue, Mixed"),
    ).toBeTruthy();
    const apply = screen.getByRole("button", { name: "Apply 1 change" });
    expect(apply.hasAttribute("disabled")).toBe(true);
    const field = screen.getByRole("textbox", {
      name: "Imported answer to 02 · OCEAN",
    });
    await user.clear(field);
    await user.type(field, "mixed");
    expect(screen.queryByText("Use one of: Red, Blue, Mixed")).toBeNull();
    expect(apply.hasAttribute("disabled")).toBe(false);
  });

  test("③ Fact: kept evidence makes it a Fact; none opens M2; an empty answer is applied first", async () => {
    const user = userEvent.setup();
    const calls = importApi();
    const router = renderApp(importPath());
    await paste(
      user,
      [
        "## [V.01.PROOF]",
        "A survey of 40 office workers.",
        "## [V.01.PROBLEM]",
        "Slow lunches.",
        "## [V.01.WHO]",
        "BPO staff.",
      ].join("\n"),
    );
    await user.click(await screen.findByRole("button", { name: "Next" }));
    const proof = await screen.findByRole("region", { name: /01 · PROOF/ });
    expect(within(proof).getByText("Fact · 1 source")).toBeTruthy();
    await user.click(within(proof).getByRole("radio", { name: /Fact/ }));
    expect(
      within(proof)
        .getByRole("radio", { name: /Fact/ })
        .getAttribute("aria-checked"),
    ).toBe("true");
    const problem = item(/01 · PROBLEM/);
    await user.click(within(problem).getByRole("radio", { name: /Fact/ }));
    expect(
      within(problem).getByText(
        "Apply first, then attach evidence in the question",
      ),
    ).toBeTruthy();
    await user.click(
      within(item(/01 · WHO/)).getByRole("radio", { name: /Fact/ }),
    );
    expect(
      await screen.findByRole("dialog", { name: /Evidence/ }),
    ).toBeTruthy();
    expect(router.state.location.search).toMatchObject({
      modal: "evidence",
      about: `validation_answer:${validationId}:V.01.WHO`,
    });
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /Evidence/ })).toBeNull(),
    );
    await user.click(screen.getByRole("button", { name: "Apply 3 changes" }));
    await waitFor(() => expect(applyCalls(calls)).toHaveLength(1));
    expect(applyCalls(calls)[0]?.body).toHaveProperty("changes", [
      {
        questionKey: "V.01.WHO",
        text: "BPO staff.",
        baseLockVersion: 3,
      },
      {
        questionKey: "V.01.PROBLEM",
        text: "Slow lunches.",
        baseLockVersion: 0,
      },
      {
        questionKey: "V.01.PROOF",
        text: "A survey of 40 office workers.",
        classification: { fau: "fact", confidence: null },
        baseLockVersion: 2,
      },
    ]);
  });

  test("③ M2 from Fact: evidence attached makes it a Fact, removed again it is not one", async () => {
    const user = userEvent.setup();
    const link = {
      id: "7d0f0000-0000-4000-8000-000000000009",
      kind: "research_log" as const,
      researchLog: {
        id: survey.id,
        observedOn: survey.observedOn,
        topic: survey.topic,
        sourceType: survey.sourceType,
        deleted: false,
      },
      url: null,
      note: null,
    };
    // What the API holds of WHO's F/A/U, as M2 changes it, saved by the user.
    let saved: { classification: Classification; lockVersion: number } | null =
      null;
    const byAna = {
      updatedAt: new Date().toISOString(),
      updatedBy: {
        id: ana.id,
        displayName: ana.displayName,
        avatarUrl: null,
        badge: null,
      },
    };
    const calls = importApi({
      context: () => {
        const context = validationContext();
        return {
          ...context,
          questions: context.questions.map((question) =>
            question.questionKey === "V.01.WHO" && saved !== null
              ? {
                  ...question,
                  current: { ...question.current, ...saved, ...byAna },
                }
              : question,
          ),
        };
      },
      evidence: (call) => {
        if (call.method === "POST") {
          saved = {
            classification: {
              fau: "fact",
              confidence: null,
              state: "fact",
              evidence: [link],
            },
            lockVersion: 4,
          };
          return Response.json({ evidence: link, ...saved }, { status: 201 });
        }
        saved = {
          classification: {
            fau: null,
            confidence: null,
            state: "unclassified",
            evidence: [],
          },
          lockVersion: 5,
        };
        return Response.json(saved);
      },
    });
    renderApp(importPath());
    await paste(user, "## [V.01.WHO]\nBPO staff.");
    await user.click(await screen.findByRole("button", { name: "Next" }));
    const who = await screen.findByRole("region", { name: /01 · WHO/ });
    const fact = () => within(who).getByRole("radio", { name: /Fact/ });
    await user.click(fact());
    const sheet = await screen.findByRole("dialog", { name: "Evidence" });
    await user.click(
      await within(sheet).findByRole("checkbox", { name: /Lunch survey/ }),
    );
    await waitFor(() =>
      expect(fact().getAttribute("aria-checked")).toBe("true"),
    );
    // Saved by the user: not "Updated by" anyone.
    expect(within(who).queryByText(/Updated/)).toBeNull();
    await user.click(within(sheet).getByRole("button", { name: /Remove/ }));
    const ask = await screen.findByRole("alertdialog", {
      name: "Remove the last evidence?",
    });
    await user.click(within(ask).getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(calls.some(({ method }) => method === "DELETE")).toBe(true),
    );
    await waitFor(() =>
      expect(fact().getAttribute("aria-checked")).toBe("false"),
    );
    await user.click(within(sheet).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Apply 1 change" }));
    await waitFor(() => expect(applyCalls(calls)).toHaveLength(1));
    expect(applyCalls(calls)[0]?.body).not.toHaveProperty([
      "changes",
      0,
      "classification",
    ]);
  });

  test("a read of an earlier visit is not used when this one fails", async () => {
    let failing = false;
    stubApi((call) => {
      const { method, path } = call;
      if (method === "GET" && path === "/api/v1/me") return Response.json(ana);
      if (method === "GET" && path.startsWith("/api/v1/ai/import/context?")) {
        return failing
          ? apiError(500, "INTERNAL")
          : Response.json(validationContext());
      }
      return undefined;
    });
    const router = renderApp(
      `/w/${workspaceId}/ai/export?source=validation&id=${validationId}`,
    );
    expect(await screen.findByRole("group", { name: "Sections" })).toBeTruthy();
    failing = true;
    await router.navigate({ href: importPath() });
    expect(
      await screen.findByRole("heading", { name: "Something went wrong" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("textbox", { name: /Reply from your AI/ }),
    ).toBeNull();
  });

  test("someone changed an answer meanwhile: Current is the latest, Updated by …, the edits stay", async () => {
    const user = userEvent.setup();
    let later = false;
    let refused = false;
    const latest = () => {
      const context = validationContext();
      if (!later) return context;
      return {
        ...context,
        questions: context.questions.map((question) =>
          question.questionKey === "V.01.WHO"
            ? {
                ...question,
                current: {
                  ...question.current,
                  text: "Bank staff.",
                  lockVersion: 4,
                  updatedAt: new Date().toISOString(),
                },
              }
            : question,
        ),
      };
    };
    const calls = importApi({
      context: latest,
      applyCall: (call) => {
        const [change] = (
          call.body as { changes: { baseLockVersion: number }[] }
        ).changes;
        if (change?.baseLockVersion === 3) {
          refused = true;
          later = true;
          return apiError(409, "CONFLICT_MULTI", { conflicts: [] });
        }
        return undefined;
      },
    });
    renderApp(importPath());
    await paste(user, "## [V.01.WHO]\nBPO staff.");
    await user.click(await screen.findByRole("button", { name: "Next" }));
    const field = await screen.findByRole("textbox", {
      name: "Imported answer to 01 · WHO",
    });
    await user.type(field, " Mostly.");
    await user.click(screen.getByRole("button", { name: "Apply 1 change" }));
    expect(
      await screen.findByText("Some answers changed while you were reviewing"),
    ).toBeTruthy();
    expect(refused).toBe(true);
    expect(await screen.findByText(/Updated by Kenji Mori/)).toBeTruthy();
    expect(item(/01 · WHO/).textContent).toContain("Bank staff.");
    expect(
      (
        screen.getByRole("textbox", {
          name: "Imported answer to 01 · WHO",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("BPO staff. Mostly.");
    await user.click(screen.getByRole("button", { name: "Apply 1 change" }));
    await waitFor(() => expect(applyCalls(calls)).toHaveLength(2));
    expect(applyCalls(calls)[1]?.body).toMatchObject({
      changes: [{ baseLockVersion: 4, text: "BPO staff. Mostly." }],
    });
  });

  test("a question the template lost meanwhile stays, with why, until it is unchecked", async () => {
    const user = userEvent.setup();
    let migrated = false;
    const calls = importApi({
      context: () => {
        const context = validationContext();
        return migrated
          ? {
              ...context,
              questions: context.questions.filter(
                ({ questionKey }) => questionKey !== "V.01.PROBLEM",
              ),
            }
          : context;
      },
      applyCall: (call) => {
        const { changes } = call.body as { changes: unknown[] };
        if (changes.length === 2) {
          migrated = true;
          return apiError(422, "QUESTION_NOT_FOUND");
        }
        return undefined;
      },
    });
    renderApp(importPath());
    await paste(
      user,
      "## [V.01.WHO]\nBPO staff.\n## [V.01.PROBLEM]\nSlow lunches.",
    );
    await user.click(await screen.findByRole("button", { name: "Next" }));
    await user.click(
      await screen.findByRole("button", { name: "Apply 2 changes" }),
    );
    expect(await screen.findByText("Couldn't apply")).toBeTruthy();
    expect(
      screen.getByText(
        "Some questions can no longer be imported. Uncheck them and apply again.",
      ),
    ).toBeTruthy();
    const problem = await screen.findByRole("region", { name: /01 · PROBLEM/ });
    expect(
      await within(problem).findByText(
        "This question is no longer in the template",
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Apply 2 changes" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await user.click(
      within(problem).getByRole("checkbox", {
        name: "Apply the change to 01 · PROBLEM",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Apply 1 change" }));
    await waitFor(() => expect(applyCalls(calls)).toHaveLength(2));
    expect(applyCalls(calls)[1]?.body).toMatchObject({
      changes: [{ questionKey: "V.01.WHO" }],
    });
  });

  test("a failed apply keeps what was edited and offers Retry", async () => {
    const user = userEvent.setup();
    let failing = true;
    const calls = importApi({
      applyCall: () => (failing ? apiError(500, "INTERNAL") : undefined),
    });
    renderApp(importPath());
    await paste(user, "## [V.01.WHO]\nBPO staff.");
    await user.click(await screen.findByRole("button", { name: "Next" }));
    await user.click(
      await screen.findByRole("button", { name: "Apply 1 change" }),
    );
    expect(await screen.findByText("Couldn't apply")).toBeTruthy();
    expect(screen.getByText("Ref: 8f14e45f")).toBeTruthy();
    failing = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(applyCalls(calls)).toHaveLength(2));
  });

  test("nothing different from the answers now: No changes found and Close", async () => {
    const user = userEvent.setup();
    importApi();
    const router = renderApp(importPath());
    await paste(user, "## [V.01.FREQUENCY]\nEvery working day.");
    await user.click(await screen.findByRole("button", { name: "Next" }));
    expect(await screen.findByText("No changes found")).toBeTruthy();
    // The toasts of the tests before stay in the page's one queue, with their Close.
    await user.click(
      within(screen.getByRole("main")).getByRole("button", { name: "Close" }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe(ideaHref));
  });

  test("a self-analysis's amount: read with its currency, refused until it reads; applied, back to 10", async () => {
    const user = userEvent.setup();
    const calls = importApi({ context: selfAnalysisContext });
    const router = renderApp(importPath("target=self_analysis"));
    expect(await screen.findByText("Self analysis")).toBeTruthy();
    // Inside Self Analysis (6.0.1): its crumb, and the navigation's page.
    const selfAnalysis = `/w/${workspaceId}/self-analysis`;
    expect(
      within(screen.getByRole("list", { name: "Breadcrumbs" }))
        .getByRole("link", { name: "Self Analysis" })
        .getAttribute("href"),
    ).toBe(selfAnalysis);
    expect(
      screen
        .getAllByRole("link", { name: "Self Analysis" })
        .some((link) => link.getAttribute("aria-current") === "page"),
    ).toBe(true);
    await paste(
      user,
      "## [SA.INCOME.1]\n### Amount\n30k\n\n### Why this amount?\nRent, food and savings.",
    );
    await user.click(await screen.findByRole("button", { name: "Next" }));
    expect(await screen.findByText("1 change")).toBeTruthy();
    expect(screen.getByText("to apply.", { exact: false })).toBeTruthy();
    expect(screen.getByText("Couldn't read the amount")).toBeTruthy();
    // No F/A/U on a self-analysis.
    expect(screen.queryByText("Unclassified")).toBeNull();
    const apply = screen.getByRole("button", { name: "Apply 1 change" });
    expect(apply.hasAttribute("disabled")).toBe(true);
    const amount = screen.getByRole("textbox", { name: "Amount" });
    await user.clear(amount);
    await user.type(amount, "₱32,000");
    expect(apply.hasAttribute("disabled")).toBe(false);
    await user.click(apply);
    await waitFor(() => expect(applyCalls(calls)).toHaveLength(1));
    expect(applyCalls(calls)[0]?.body).toEqual({
      target: { type: "self_analysis" },
      changes: [
        {
          questionKey: "SA.INCOME.1",
          text: "Rent, food and savings.",
          amount: 32000,
          baseLockVersion: 1,
        },
      ],
    });
    // Without returnTo, back to the target's home: 10 (SDD 4章).
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(selfAnalysis),
    );
  });

  test("a file: read as UTF-8, refused when larger than 1 MB or not UTF-8", async () => {
    const user = userEvent.setup();
    importApi();
    renderApp(importPath());
    await screen.findByRole("textbox", { name: /Reply from your AI/ });
    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]');
    if (input === null) throw new Error("no file input");
    await user.upload(
      input,
      new File(["## [V.01.WHO]\nFrom a file."], "reply.md", {
        type: "text/markdown",
      }),
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole("textbox", {
            name: /Reply from your AI/,
          }) as HTMLTextAreaElement
        ).value,
      ).toBe("## [V.01.WHO]\nFrom a file."),
    );
    await user.upload(
      input,
      new File([new Uint8Array([0xff, 0xfe, 0x41])], "reply.md", {
        type: "text/markdown",
      }),
    );
    expect(
      await screen.findByText(
        "Couldn't read this file. Use a .md or .json file in UTF-8.",
      ),
    ).toBeTruthy();
    await user.upload(
      input,
      new File([new Uint8Array(1_000_001)], "reply.md", {
        type: "text/markdown",
      }),
    );
    expect(
      await screen.findByText(
        "This is too long. Import fewer questions at a time.",
      ),
    ).toBeTruthy();
    // Refused before it is read: the field keeps what it had.
    expect(
      (
        screen.getByRole("textbox", {
          name: /Reply from your AI/,
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("## [V.01.WHO]\nFrom a file.");
  });

  test("② choices go to the row chosen, after an empty block the reply left out", async () => {
    const user = userEvent.setup();
    const calls = importApi();
    renderApp(importPath());
    await paste(
      user,
      [
        "## [V.01.PROBLEM]",
        "(empty)",
        "## [V.01.WHO]",
        "First",
        "## [V.01.WHO]",
        "Second",
      ].join("\n"),
    );
    await screen.findAllByText(
      "Another block is for this question too. Keep one.",
    );
    await user.click(
      screen.getAllByRole("button", { name: "Use this one" })[0] as HTMLElement,
    );
    // Focus stays in the row kept, which now offers Discard.
    await waitFor(() =>
      expect(document.activeElement?.textContent).toBe("Discard"),
    );
    expect(screen.getByText("Matched")).toBeTruthy();
    expect(screen.getByText("Discarded")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(
      await screen.findByRole("button", { name: "Apply 1 change" }),
    );
    await waitFor(() => expect(applyCalls(calls)).toHaveLength(1));
    expect(applyCalls(calls)[0]?.body).toMatchObject({
      changes: [{ questionKey: "V.01.WHO", text: "First" }],
    });
  });

  test("③ clearing the imported text clears the F/A/U chosen for it, as on 11", async () => {
    const user = userEvent.setup();
    const calls = importApi();
    renderApp(importPath());
    await paste(user, "## [V.01.WHO]\nBPO staff.");
    await user.click(await screen.findByRole("button", { name: "Next" }));
    const who = await screen.findByRole("region", { name: /01 · WHO/ });
    await user.click(within(who).getByRole("radio", { name: /Assumption/ }));
    await user.click(within(who).getByRole("radio", { name: "High" }));
    await user.clear(
      within(who).getByRole("textbox", { name: "Imported answer to 01 · WHO" }),
    );
    expect(
      within(who)
        .getByRole("radio", { name: /Assumption/ })
        .getAttribute("aria-checked"),
    ).toBe("false");
    await user.click(screen.getByRole("button", { name: "Apply 1 change" }));
    await waitFor(() => expect(applyCalls(calls)).toHaveLength(1));
    expect(applyCalls(calls)[0]?.body).toMatchObject({
      changes: [{ questionKey: "V.01.WHO", text: null, baseLockVersion: 3 }],
    });
    expect(applyCalls(calls)[0]?.body).not.toHaveProperty([
      "changes",
      0,
      "classification",
    ]);
  });

  test("an archived idea: the notice and no field to paste into", async () => {
    importApi({ context: () => validationContext({ archived: true }) });
    renderApp(importPath());
    expect(await screen.findByText("This idea is archived")).toBeTruthy();
    expect(
      screen.queryByRole("textbox", { name: /Reply from your AI/ }),
    ).toBeNull();
  });

  test("a Viewer cannot enter", async () => {
    const calls = importApi({ me: as("viewer") });
    renderApp(importPath());
    expect(
      await screen.findByRole("heading", {
        name: "You don't have access to this",
      }),
    ).toBeTruthy();
    expect(calls.some(({ path }) => path.startsWith("/api/v1/ai/"))).toBe(
      false,
    );
  });
});

test("a plan's crumb leads to its 20 (SDD 4章: 25's home is the plan's)", async () => {
  const plan = planContext();
  importApi({ context: () => plan });
  renderApp(importPath(`target=business_plan&id=${plan.target.id}`));
  expect(
    (await screen.findByRole("link", { name: "Plan A" })).getAttribute("href"),
  ).toBe(`${ideaHref}/plans/${plan.target.id}`);
});
