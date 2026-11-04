import type { ResearchLogEntry } from "@moonx/schemas";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ana, apiError, type Call, renderApp, stubApi } from "../test/api";
import { workspaceId } from "../test/ideas";
import {
  answer,
  entry,
  evidenceOf,
  home,
  prices,
  questionsRead,
  section01,
  survey,
  validationId,
} from "../test/validation";

// M2 Evidence's failed sends (design-spec 6.0.3「送り方」, 6.0.6 モーダルの共通の決まり), opened
// on 11's WHO.

afterEach(() => {
  vi.unstubAllGlobals();
});

const validationPath = `/api/v1/validations/${validationId}`;
const openM2 = `/w/${workspaceId}/ideas/${home.idea.id}/questions/01?q=V.01.WHO&modal=evidence&about=validation_answer:${validationId}:V.01.WHO`;

const who = answer("V.01.WHO", {
  text: "Office workers",
  classification: {
    fau: null,
    confidence: null,
    state: "unclassified",
    evidence: [],
  },
  lockVersion: 1,
});

/** V4's answer: Lunch survey attached to WHO. */
const attached = () =>
  Response.json(
    {
      evidence: evidenceOf("7d0f0000-0000-4000-8000-000000000006", survey),
      classification: {
        fau: null,
        confidence: null,
        state: "unclassified",
        evidence: [evidenceOf("7d0f0000-0000-4000-8000-000000000006", survey)],
      },
      lockVersion: 2,
    },
    { status: 201 },
  );

/**
 * The API of 11 with WHO answered; `evidence` answers M2's sends (V4), `logs` is the
 * idea's research log (V6).
 */
function m2Api(
  evidence: (call: Call) => Response | Promise<Response>,
  logs: ResearchLogEntry[] = [survey, prices],
) {
  return stubApi((call) => {
    const { method, path } = call;
    if (method === "GET" && path === "/api/v1/me") return Response.json(ana);
    if (method === "PATCH" && path === "/api/v1/me") return Response.json(ana);
    if (
      method === "GET" &&
      path === `/api/v1/ideas/${home.idea.id}/validation`
    ) {
      return Response.json(home);
    }
    if (method === "GET" && path === `${validationPath}/questions/01`) {
      return Response.json(
        questionsRead(section01, [
          who,
          answer("V.01.PROBLEM"),
          answer("V.01.PROOF"),
        ]),
      );
    }
    if (method === "GET" && path.startsWith(`${validationPath}/research-log`)) {
      return Response.json({ items: logs, nextCursor: null });
    }
    if (method === "POST" && path === `${validationPath}/evidence`) {
      return evidence(call);
    }
    return undefined;
  });
}

const sends = (calls: Call[]) =>
  calls.filter(
    ({ method, path }) =>
      method === "POST" && path === `${validationPath}/evidence`,
  );

/** Opens M2 on WHO and ticks Lunch survey, which sends V4. */
async function attachSurvey() {
  const user = userEvent.setup();
  const sheet = await screen.findByRole("dialog", { name: "Evidence" });
  await user.click(
    await within(sheet).findByRole("checkbox", { name: /Lunch survey/ }),
  );
  return { user, sheet };
}

describe("M2's failed sends (design-spec 6.0.6)", () => {
  test("too many attempts: the wait in M2, without Retry", async () => {
    m2Api(() => apiError(429, "RATE_LIMITED", { retryAfterSeconds: 60 }));
    renderApp(openM2);
    const { sheet } = await attachSurvey();
    expect(
      await within(sheet).findByText(
        "Too many attempts. Try again in 1 minute.",
      ),
    ).toBeTruthy();
    expect(within(sheet).queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("an unexpected failure: the small dialog with its Ref; Retry sends the same again, Close closes M2", async () => {
    let tries = 0;
    const calls = m2Api(() => {
      tries += 1;
      return tries === 1 ? apiError(500, "INTERNAL") : attached();
    });
    renderApp(openM2);
    const { user, sheet } = await attachSurvey();
    const failed = await screen.findByRole("alertdialog", {
      name: /Something went wrong/,
    });
    // The request id's first 8 characters, not all of it (design-spec 6.0.6).
    expect(within(failed).getByText("Ref: 8f14e45f")).toBeTruthy();
    await user.click(within(failed).getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(
        within(sheet).getByRole("row", { name: /Lunch survey/ }),
      ).toBeTruthy(),
    );
    expect(sends(calls).map(({ body }) => body)).toEqual([
      {
        target: {
          type: "validation_answer",
          id: validationId,
          key: "V.01.WHO",
        },
        lockVersion: 1,
        researchLogEntryId: survey.id,
      },
      {
        target: {
          type: "validation_answer",
          id: validationId,
          key: "V.01.WHO",
        },
        lockVersion: 1,
        researchLogEntryId: survey.id,
      },
    ]);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    cleanup();
    vi.unstubAllGlobals();

    m2Api(() => apiError(500, "INTERNAL"));
    const router = renderApp(openM2);
    const again = await attachSurvey();
    await again.user.click(
      within(
        await screen.findByRole("alertdialog", {
          name: /Something went wrong/,
        }),
      ).getByRole("button", { name: "Close" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Evidence" })).toBeNull(),
    );
    expect(router.state.location.search).not.toHaveProperty("modal");
  });

  test("an archived idea refuses it: Couldn't save and It's archived in M2", async () => {
    m2Api(() => apiError(409, "ARCHIVED"));
    renderApp(openM2);
    const { sheet } = await attachSurvey();
    expect(await within(sheet).findByText("Couldn't save")).toBeTruthy();
    expect(within(sheet).getByText("It's archived")).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("M2's Search research (design-spec 6.0.3)", () => {
  test("narrows the research log by topic and finding, whatever their case; nothing left says so", async () => {
    const user = userEvent.setup();
    m2Api(attached, [
      survey,
      prices,
      entry("5e8c1d2a-0000-4000-8000-000000000003", "Mall visit", {
        observation: "Kiosks at SM City sell at ₱45",
      }),
    ]);
    renderApp(openM2);
    const sheet = await screen.findByRole("dialog", { name: "Evidence" });
    const search = await within(sheet).findByRole("searchbox", {
      name: "Search research",
    });
    const listed = () =>
      within(sheet)
        .queryAllByRole("checkbox")
        .map((box) => box.closest("label")?.textContent);
    expect(listed()).toHaveLength(3);
    await user.type(search, "LUNCH");
    expect(listed()).toEqual([expect.stringContaining("Lunch survey")]);
    await user.clear(search);
    await user.type(search, "sm city");
    expect(listed()).toEqual([expect.stringContaining("Mall visit")]);
    await user.clear(search);
    await user.type(search, "bakery");
    expect(listed()).toEqual([]);
    expect(sheet.textContent).toContain("No entries match your search");
  });
});

describe("M2 while New entry or URL is on its way (design-spec 6.0.3「送り方」)", () => {
  test("Add and attach and Attach URL hold M2 open: Escape and its × wait until they are answered", async () => {
    const user = userEvent.setup();
    let release = () => {};
    const calls = m2Api(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(attached());
        }),
    );
    // Back is held by the browser's history (useBlocker), which the memory history of
    // these tests does not hold: Escape and × are what is pressed here.
    const router = renderApp(
      `/w/${workspaceId}/ideas/${home.idea.id}/questions/01?q=V.01.WHO`,
    );
    const card = await screen.findByRole("region", { name: "WHO" });
    await user.click(within(card).getByRole("radio", { name: /Fact/ }));
    const sheet = await screen.findByRole("dialog", { name: "Evidence" });

    /** Presses `send`, then each way to close M2 while it is on its way. */
    const holdsWhileSending = async (send: string, sent: number) => {
      await user.click(within(sheet).getByRole("button", { name: send }));
      await waitFor(() => expect(sends(calls)).toHaveLength(sent));
      await user.keyboard("{Escape}");
      await user.click(within(sheet).getByRole("button", { name: "Close" }));
      expect(screen.getByRole("dialog", { name: "Evidence" })).toBe(sheet);
      expect(router.state.location.search).toMatchObject({
        modal: "evidence",
      });
      await act(release);
      await waitFor(() =>
        expect(
          within(sheet).getByRole("button", { name: send }),
        ).toHaveProperty("disabled", true),
      );
    };

    await user.click(within(sheet).getByRole("radio", { name: "New entry" }));
    await user.type(
      within(sheet).getByRole("textbox", { name: /Topic/ }),
      "Office survey",
    );
    await holdsWhileSending("Add and attach", 1);
    await user.click(within(sheet).getByRole("radio", { name: "URL" }));
    await user.type(
      within(sheet).getByRole("textbox", { name: /URL/ }),
      "https://psa.gov.ph/statistics",
    );
    await holdsWhileSending("Attach URL", 2);
    expect(sends(calls).map(({ body }) => body)).toMatchObject([
      { newResearchLog: { topic: "Office survey" } },
      { url: "https://psa.gov.ph/statistics" },
    ]);
  });
});
