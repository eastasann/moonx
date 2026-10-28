import type { Me, PitchDeck, PlanHome, Role } from "@moonx/schemas";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ana, apiError, type Call, renderApp, stubApi } from "../test/api";
import { workspaceId } from "../test/ideas";
import {
  ideaId,
  pitchDeck,
  planHome,
  planId,
  planPath,
  versionId,
} from "../test/plans";
import { home as ideaHome } from "../test/validation";

// 23 Pitch Deck (design-spec 6.14, SDD 5.9 P12・P13).

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const api = `/api/v1/plans/${planId}`;
const base = planPath("/pitch");

const as = (role: Role): Me => ({
  ...ana,
  memberships: ana.memberships.map((membership) => ({ ...membership, role })),
});

/** What P12 answers to `variant` and `versionId` (a promise holds it back); Plan A's deck by default. */
type DeckOf = (
  variant: "one" | "five",
  versionId: string | null,
) => PitchDeck | Promise<PitchDeck>;

/** The API of 23: the plan, its decks, their PDF and the comments. */
function deckApi({
  me = ana,
  home = planHome(),
  deck = (variant) => pitchDeck(variant),
  pdf = () =>
    new Response(new Blob(["%PDF-1.7"], { type: "application/pdf" }), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="Health Bowl Co.-one-draft-2026-10-01.pdf"; filename*=UTF-8''Health%20Bowl%20Co.-one-draft-2026-10-01.pdf`,
      },
    }),
}: {
  me?: Me;
  home?: PlanHome;
  deck?: DeckOf;
  pdf?: (call: Call) => Response | Promise<Response>;
} = {}) {
  return stubApi((call) => {
    const { method, path } = call;
    if (method === "GET" && path === "/api/v1/me") return Response.json(me);
    if (method === "PATCH" && path === "/api/v1/me") return Response.json(me);
    if (method === "GET" && path === `/api/v1/ideas/${ideaId}/validation`) {
      return Response.json(ideaHome);
    }
    if (method === "GET" && path === api) return Response.json(home);
    const url = new URL(path, "http://localhost");
    if (method === "GET" && url.pathname === `${api}/pitch-deck`) {
      const variant =
        url.searchParams.get("variant") === "five" ? "five" : "one";
      return Promise.resolve(
        deck(variant, url.searchParams.get("versionId")),
      ).then((answer) => Response.json(answer));
    }
    if (method === "GET" && url.pathname === `${api}/pitch-deck.pdf`) {
      return pdf(call);
    }
    if (method === "GET" && path.startsWith("/api/v1/comments?")) {
      return Response.json({ threads: [], unresolvedCount: 0 });
    }
    return undefined;
  });
}

const deckCalls = (calls: Call[], file = "pitch-deck") =>
  calls.filter(
    (call) =>
      call.method === "GET" &&
      new URL(call.path, "http://localhost").pathname === `${api}/${file}`,
  );

/** The slide on screen: the region its title names. */
const shownSlide = (name: string) =>
  screen.findByRole("region", {
    name: (accessibleName) => accessibleName === name,
  });

describe("23 Pitch Deck (design-spec 6.14)", () => {
  test("opens the one-minute deck of the plan now on its title slide, with the slides beside it", async () => {
    const calls = deckApi();
    renderApp(base);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Pitch Deck" }),
    ).toBeTruthy();
    const title = await shownSlide("Health Bowl Co.");
    expect(
      within(title).getByText("Fresh grain bowls for office lunches."),
    ).toBeTruthy();
    expect(title.textContent).toContain("Health Bowl Co. · Draft · Oct 1");
    const slides = screen.getByRole("listbox", { name: "Slides" });
    const names = [
      "Title",
      "Problem",
      "Customer",
      "Solution",
      "Why now",
      "Business model",
      "Why us",
      "Next step",
    ];
    expect(within(slides).getAllByRole("option")).toHaveLength(names.length);
    for (const [index, name] of names.entries()) {
      expect(
        within(slides).getByRole("option", { name: `${index + 1} ${name}` }),
      ).toBeTruthy();
    }
    expect(
      screen
        .getByRole("radio", { name: "One-minute" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen.getByRole("link", { name: "Edit source" }).getAttribute("href"),
    ).toBe(planPath("/items/1"));
    // The title slide has no numbers to edit in the validation.
    expect(
      screen.queryByRole("link", { name: "Edit in validation" }),
    ).toBeNull();
    expect(
      screen.getByRole("heading", { level: 2, name: "What to say" }),
    ).toBeTruthy();
    expect(
      screen.getByText("We sell healthy bowls to office workers at lunch."),
    ).toBeTruthy();
    expect(deckCalls(calls).map(({ path }) => path)).toEqual([
      `${api}/pitch-deck?variant=one`,
    ]);
  });

  test("the slides by type: a number slide's figures and its link to 18, a cut slide's warning, empty sources", async () => {
    const user = userEvent.setup();
    deckApi();
    renderApp(base);
    await shownSlide("Health Bowl Co.");
    const slides = screen.getByRole("listbox", { name: "Slides" });
    await user.click(within(slides).getByRole("option", { name: "2 Problem" }));
    const problem = await shownSlide("Problem");
    expect(within(problem).getByText("Not written yet")).toBeTruthy();
    expect(problem.textContent).toContain("Frequency: ");
    expect(
      screen.getByRole("button", { name: "Comments on Problem, 2 comments" }),
    ).toBeTruthy();
    await user.click(
      within(slides).getByRole("option", { name: "6 Business model" }),
    );
    const model = await shownSlide("Business model");
    const figures = within(model).getAllByRole("definition");
    expect(figures.map((figure) => figure.textContent)).toEqual([
      "₱220",
      "₱118.00",
      "6.9",
    ]);
    expect(
      screen
        .getByRole("link", { name: "Edit in validation" })
        .getAttribute("href"),
    ).toBe(`/w/${workspaceId}/ideas/${ideaId}/economics`);
    expect(
      screen.getByRole("link", { name: "Edit source" }).getAttribute("href"),
    ).toBe(planPath("/items/8"));
    expect(
      screen.queryByText("Too long for this slide. Shorten it in the plan."),
    ).toBeNull();
    await user.click(within(slides).getByRole("option", { name: "7 Why us" }));
    await shownSlide("Why us");
    expect(
      screen.getByText("Too long for this slide. Shorten it in the plan."),
    ).toBeTruthy();
  });

  test("five-minute: the deck asked for and kept in the URL, the slide shown kept; a table slide; a version chosen", async () => {
    const user = userEvent.setup();
    const calls = deckApi({
      deck: (variant, version) =>
        version === null
          ? pitchDeck(variant)
          : pitchDeck(variant, {
              source: {
                kind: "version",
                versionId,
                name: "v1 For advisors",
                savedAt: "2026-09-20T02:00:00.000Z",
              },
              footer: {
                businessName: "Health Bowl Co.",
                versionLabel: "v1 For advisors",
                date: "2026-09-20",
              },
              slides: pitchDeck(variant).slides.map((slide) => ({
                ...slide,
                editSource: null,
                editInValidation: null,
              })),
            }),
    });
    const router = renderApp(base);
    await shownSlide("Health Bowl Co.");
    const slides = screen.getByRole("listbox", { name: "Slides" });
    await user.click(
      within(slides).getByRole("option", { name: "6 Business model" }),
    );
    await shownSlide("Business model");
    await user.click(screen.getByRole("radio", { name: "Five-minute" }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ variant: "five" }),
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole("listbox", { name: "Slides" })).getAllByRole(
          "option",
        ),
      ).toHaveLength(14),
    );
    // The same slide, now the seventh of fourteen.
    expect(
      within(screen.getByRole("listbox", { name: "Slides" }))
        .getByRole("option", { name: "7 Business model" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    await user.click(
      within(screen.getByRole("listbox", { name: "Slides" })).getByRole(
        "option",
        { name: "6 Competition" },
      ),
    );
    const competition = await shownSlide("Competition");
    expect(
      within(competition)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Name", "Type", "Price", "Strength"]);
    expect(within(competition).getByText("Lacson Eats")).toBeTruthy();
    expect(
      screen.getByText("Five minutes on why offices will buy our bowls."),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /^From/ }));
    await user.click(
      await screen.findByRole("option", { name: "v1 For advisors" }),
    );
    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        variant: "five",
        version: versionId,
      }),
    );
    const fromVersion = await shownSlide("Competition");
    await waitFor(() =>
      expect(fromVersion.textContent).toContain(
        "Health Bowl Co. · v1 For advisors · Sep 20",
      ),
    );
    // A version is read only: no way to edit what it saved.
    expect(screen.queryByRole("link", { name: "Edit source" })).toBeNull();
    expect(deckCalls(calls).map(({ path }) => path)).toEqual([
      `${api}/pitch-deck?variant=one`,
      `${api}/pitch-deck?variant=five`,
      `${api}/pitch-deck?variant=five&versionId=${versionId}`,
    ]);
  });

  test("a Viewer reads the deck without the edit links the API leaves out", async () => {
    deckApi({
      me: as("viewer"),
      deck: (variant) => ({
        ...pitchDeck(variant),
        slides: pitchDeck(variant).slides.map((slide) => ({
          ...slide,
          editSource: null,
          editInValidation: null,
        })),
      }),
    });
    renderApp(base);
    await shownSlide("Health Bowl Co.");
    expect(screen.queryByRole("link", { name: "Edit source" })).toBeNull();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Comments on Title" }),
    ).toBeTruthy();
  });

  test("Download PDF asks P13 for the deck shown and saves it under the API's name", async () => {
    const user = userEvent.setup();
    const saved: { name: string; type: string }[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      saved.push({ name: "", type: (blob as Blob).type });
      return "blob:pdf";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clicked = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        const last = saved.at(-1);
        if (last !== undefined) last.name = this.download;
      });
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls = deckApi({
      pdf: async () => {
        await held;
        return new Response(
          new Blob(["%PDF-1.7"], { type: "application/pdf" }),
          {
            headers: {
              "content-type": "application/pdf",
              "content-disposition": `attachment; filename="Health Bowl Co.-one-draft-2026-10-01.pdf"; filename*=UTF-8''Health%20Bowl%20Co.%E3%83%BB-one-draft-2026-10-01.pdf`,
            },
          },
        );
      },
    });
    renderApp(base);
    await shownSlide("Health Bowl Co.");
    await user.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(await screen.findByText("Preparing PDF…")).toBeTruthy();
    release();
    await waitFor(() => expect(clicked).toHaveBeenCalledTimes(1));
    expect(saved).toEqual([
      {
        name: "Health Bowl Co.・-one-draft-2026-10-01.pdf",
        type: "application/pdf",
      },
    ]);
    await waitFor(() =>
      expect(screen.queryByText("Preparing PDF…")).toBeNull(),
    );
    expect(deckCalls(calls, "pitch-deck.pdf").map(({ path }) => path)).toEqual([
      `${api}/pitch-deck.pdf?variant=one`,
    ]);
  });

  test("a PDF that fails says so with Retry; the rate limit gives its wait", async () => {
    const user = userEvent.setup();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clicked = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    let answers = [
      apiError(500, "INTERNAL"),
      apiError(429, "RATE_LIMITED", { retryAfterSeconds: 600 }),
    ];
    const calls = deckApi({
      pdf: () => {
        const [next, ...rest] = answers;
        answers = rest;
        return (
          next ??
          new Response(new Blob(["%PDF-1.7"]), {
            headers: { "content-type": "application/pdf" },
          })
        );
      },
    });
    renderApp(base);
    await shownSlide("Health Bowl Co.");
    await user.click(screen.getByRole("button", { name: "Download PDF" }));
    const failed = await screen.findByText("Couldn't make the PDF");
    const alert = failed.closest("[role=alert]") as HTMLElement;
    expect(within(alert).getByText("Something went wrong")).toBeTruthy();
    expect(within(alert).getByText("Ref: 8f14e45f")).toBeTruthy();
    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    // The alert goes while it sends again; focus waits on what Retry does again.
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Download PDF" }),
    );
    expect(
      await screen.findByText("Too many attempts. Try again in 10 minutes."),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(clicked).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Couldn't make the PDF")).toBeNull();
    expect(deckCalls(calls, "pitch-deck.pdf")).toHaveLength(3);
  });

  test("a slide's 💬 opens its thread; a link to a slide's comment opens that deck and slide", async () => {
    const user = userEvent.setup();
    deckApi();
    const router = renderApp(base);
    await shownSlide("Health Bowl Co.");
    await user.click(screen.getByRole("button", { name: "Comments on Title" }));
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        panel: "comments",
        target: `pitch_slide:${planId}:one.title`,
      }),
    );
    expect(await screen.findByText("No comments yet")).toBeTruthy();
    cleanup();

    deckApi();
    renderApp(
      `${base}?variant=five&panel=comments&target=${encodeURIComponent(`pitch_slide:${planId}:five.competition`)}`,
    );
    expect(await shownSlide("Competition")).toBeTruthy();
    expect(
      within(screen.getByRole("listbox", { name: "Slides" }))
        .getByRole("option", { name: "6 Competition" })
        .getAttribute("aria-selected"),
    ).toBe("true");
  });

  test("switching back to a length shows the slide on screen, the title slide when the other lacked it", async () => {
    const user = userEvent.setup();
    deckApi();
    renderApp(`${base}?variant=five`);
    await shownSlide("Health Bowl Co.");
    await user.click(
      within(screen.getByRole("listbox", { name: "Slides" })).getByRole(
        "option",
        { name: "5 Market" },
      ),
    );
    await shownSlide("Market");
    await user.click(screen.getByRole("radio", { name: "One-minute" }));
    // The one-minute deck has no Market: its title slide.
    await waitFor(() =>
      expect(
        within(screen.getByRole("listbox", { name: "Slides" })).getAllByRole(
          "option",
        ),
      ).toHaveLength(8),
    );
    await shownSlide("Health Bowl Co.");
    await user.click(screen.getByRole("radio", { name: "Five-minute" }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("listbox", { name: "Slides" })).getAllByRole(
          "option",
        ),
      ).toHaveLength(14),
    );
    expect(await shownSlide("Health Bowl Co.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Market" })).toBeNull();
  });

  test("while another length loads, the tools stay in use and the slides are a skeleton", async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    deckApi({
      deck: async (variant) => {
        if (variant === "five") await held;
        return pitchDeck(variant);
      },
    });
    renderApp(base);
    await shownSlide("Health Bowl Co.");
    const five = screen.getByRole("radio", { name: "Five-minute" });
    await user.click(five);
    await waitFor(() =>
      expect(document.querySelector("[aria-busy=true]")?.textContent).toContain(
        "Pitch Deck",
      ),
    );
    expect(document.activeElement).toBe(
      screen.getByRole("radio", { name: "Five-minute" }),
    );
    expect(
      screen.getByRole("radio", { name: "Five-minute" }).closest("[inert]"),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Download PDF" }).closest("[inert]"),
    ).toBeNull();
    // The fourteen blank slides of the five-minute deck, out of reach.
    const slides = document.querySelector("[role=listbox]") as HTMLElement;
    expect(slides.closest("[inert]")).not.toBeNull();
    expect(slides.querySelectorAll("[role=option]")).toHaveLength(14);
    release();
    await waitFor(() =>
      expect(document.querySelector("[aria-busy=true]")).toBeNull(),
    );
    expect(
      screen.getByText("Five minutes on why offices will buy our bowls."),
    ).toBeTruthy();
  });

  test("an archived plan: the deck without the plan's notice; a slide's thread read only", async () => {
    const user = userEvent.setup();
    deckApi({
      home: planHome({ archived: true }),
      deck: (variant) => ({
        ...pitchDeck(variant),
        slides: pitchDeck(variant).slides.map((slide) => ({
          ...slide,
          editSource: null,
          editInValidation: null,
        })),
      }),
    });
    renderApp(base);
    await shownSlide("Health Bowl Co.");
    expect(screen.queryByText("This plan is archived")).toBeNull();
    expect(screen.queryByRole("link", { name: "Edit source" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Comments on Title" }));
    expect(
      await screen.findByText(
        "This plan is archived. Restore it to make changes.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Add a comment" })).toBeNull();
  });

  test("a version that is not the plan's is not found", async () => {
    stubApi((call) => {
      const { method, path } = call;
      if (method === "GET" && path === "/api/v1/me") return Response.json(ana);
      if (method === "GET" && path === `/api/v1/ideas/${ideaId}/validation`) {
        return Response.json(ideaHome);
      }
      if (method === "GET" && path === api) return Response.json(planHome());
      if (path.startsWith(`${api}/pitch-deck?`)) {
        return apiError(404, "NOT_FOUND");
      }
      if (path.startsWith("/api/v1/comments?")) {
        return Response.json({ threads: [], unresolvedCount: 0 });
      }
      return undefined;
    });
    renderApp(`${base}?version=${versionId}`);
    expect(await screen.findByText("Not found. Check the link.")).toBeTruthy();
  });
});
