import type {
  Me,
  Role,
  TemplateSection,
  ValidationAnswer,
} from "@moonx/schemas";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ana, apiError, type Call, renderApp, stubApi } from "../test/api";
import { workspaceId } from "../test/ideas";
import {
  answer,
  evidenceOf,
  home,
  prices,
  section01,
  section02,
  survey,
  validationId,
} from "../test/validation";

// 11 Question form for a validation section and M2 Evidence (design-spec 6.2・6.0.3).

afterEach(() => {
  vi.unstubAllGlobals();
});

const ideaPath = `/api/v1/ideas/${home.idea.id}`;
const base = `/w/${workspaceId}/ideas/${home.idea.id}/questions`;
const validationPath = `/api/v1/validations/${validationId}`;

const as = (role: Role): Me => ({
  ...ana,
  memberships: ana.memberships.map((membership) => ({ ...membership, role })),
});

/** The API of 11, answering saves with `put` and M2's sends with `evidence`. */
function formApi({
  me = ana,
  section = section01,
  answers = section.questions.map(({ key }) => answer(key)),
  archived = false,
  put,
  evidence = (_call: Call): Response | Promise<Response> | undefined =>
    undefined,
}: {
  me?: Me;
  section?: TemplateSection;
  answers?: ValidationAnswer[];
  archived?: boolean;
  put?: (call: Call) => Response;
  evidence?: (call: Call) => Response | Promise<Response> | undefined;
} = {}) {
  // What the fake API holds of each answer, so a later save sees the earlier ones.
  const saved = new Map(answers.map((item) => [item.questionKey, item]));
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
      return Response.json({ ...home, idea: { ...home.idea, archived } });
    }
    if (
      method === "GET" &&
      path === `${validationPath}/questions/${section.key}`
    ) {
      return Response.json({ section, answers });
    }
    if (method === "PUT" && path.startsWith(`${validationPath}/answers/`)) {
      return save(call);
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
    expect(screen.getByRole("region", { name: "RED: SURVIVORS" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "BLUE: GAP" })).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Mixed" }));
    expect(screen.getByText("1/4")).toBeTruthy();
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
