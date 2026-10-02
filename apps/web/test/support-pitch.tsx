import type { PitchDeck, PitchSlide, PitchVariant } from "@moonx/schemas";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PlanHome } from "../src/lib/plans";
import { renderApp, stubApi, WORKSPACE } from "./support";
import { IDEA, IDEA_PATH, makeDetail, meOf, PLAN, type Role } from "./support-validation-home";

export type { Role };

// `Slide` scales itself to its container with a ResizeObserver, which jsdom does not have.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

export { IDEA, IDEA_PATH, PLAN, WORKSPACE };

export const VERSION = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
export const PLAN_PATH = `/api/v1/plans/${PLAN}`;
export const DECK_PATH = `${PLAN_PATH}/pitch-deck`;
export const PDF_PATH = `${PLAN_PATH}/pitch-deck.pdf`;
export const PITCH_URL = `/w/${WORKSPACE}/ideas/${IDEA}/plans/${PLAN}/pitch`;

const ana = {
  id: "44444444-4444-4444-8444-444444444444",
  displayName: "Ana Villanueva",
  avatarUrl: null,
  badge: null,
} as const;

export function makePlanHome(overrides: Partial<PlanHome> = {}): PlanHome {
  return {
    id: PLAN,
    name: "Plan A",
    archived: false,
    latestVersion: null,
    hasChangesSinceVersion: false,
    latestGoNoGo: null,
    ideaId: IDEA,
    workspaceId: WORKSPACE,
    businessName: "Piaya Box",
    preparedBy: "Ana",
    date: "2026-10-01",
    latestDecision: null,
    viewingVersion: null,
    versions: [
      {
        id: VERSION,
        versionNumber: 1,
        name: "v1 For advisors",
        savedBy: ana,
        savedAt: "2026-09-28T02:00:00.000Z",
      },
    ],
    lockVersion: 1,
    ...overrides,
  } as PlanHome;
}

const metric = (value: number | null, reason?: string) =>
  ({ value, ...(reason ? { reason } : {}) }) as PitchSlide["numbers"] extends
    | { value: infer V }[]
    | undefined
    ? V
    : never;

const slide = (
  s: Partial<PitchSlide> & Pick<PitchSlide, "key" | "type" | "title">,
): PitchSlide => ({
  emptySources: [],
  overflow: false,
  editSource: null,
  editInValidation: null,
  commentCount: 0,
  ...s,
});

const text = (t: string) => ({ text: t, empty: false });
const blank = { text: "", empty: true };

const title = slide({
  key: "title",
  type: "title",
  title: "Piaya Box",
  subtitle: "Corporate gift boxes of Bacolod piaya",
  editSource: { itemNo: 1 },
});
const problem = slide({
  key: "problem",
  type: "text",
  title: "Problem",
  bullets: [text("Gifts are hard to source"), blank],
  emptySources: ["Frequency"],
  editSource: { itemNo: 4 },
  commentCount: 2,
});
const model = (variant: PitchVariant) =>
  slide({
    key: "business_model",
    type: "number",
    title: "Business model",
    numbers: [
      { label: "Price", metricKey: "selling_price", value: metric(450) },
      { label: "Break-even", metricKey: "break_even_units_day", value: metric(6.9) },
      { label: "Payback", metricKey: "payback_months", value: metric(null, "empty") },
    ],
    bullets: variant === "five" ? [text("Boxes sold to offices")] : [],
    editSource: { itemNo: 8 },
    editInValidation: "economics",
  });
const competition = slide({
  key: "competition",
  type: "table",
  title: "Competition",
  table: {
    columns: ["Name", "Type"],
    rows: [
      ["Pasalubong stalls", "Direct"],
      ["Online shops", null],
    ],
  },
  bullets: [text("Be faster")],
  editSource: { itemNo: 6 },
});

/** A deck with all four slide types, as P12 returns it. */
export function makeDeck(variant: PitchVariant, overrides: Partial<PitchDeck> = {}): PitchDeck {
  const slides =
    variant === "one"
      ? [title, problem, model("one")]
      : [
          title,
          problem,
          model("five"),
          competition,
          slide({
            key: "economics",
            type: "table",
            title: "Economics",
            table: { columns: ["Metric", "Expected"], rows: [["Units / day", "10"]] },
            editSource: { itemNo: 20 },
            editInValidation: "costs",
            overflow: true,
          }),
        ];
  return {
    variant,
    source: { kind: "latest" },
    businessName: "Piaya Box",
    generatedAt: "2026-10-02T02:00:00.000Z",
    footer: { businessName: "Piaya Box", versionLabel: "Draft", date: "2026-10-01" },
    speakerNotes: variant === "one" ? "Hello.\nWe sell piaya boxes." : null,
    slides,
    ...overrides,
  };
}

export const signedIn = (role: Role = "owner") => ({
  "GET /api/v1/me": () => ({ body: meOf(role) }),
  "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
});

/** Opens screen 23 with P2, I2 and P12 stubbed; `extra` replaces or adds handlers. */
export async function openPitch(
  options: {
    role?: Role;
    path?: string;
    home?: PlanHome;
    ideaArchived?: boolean;
    extra?: Parameters<typeof stubApi>[0];
    /** False for a state in which the screen's own heading never shows. */
    waitForHeading?: boolean;
  } = {},
) {
  const home = options.home ?? makePlanHome();
  const api = stubApi({
    ...signedIn(options.role),
    [`GET ${PLAN_PATH}`]: () => ({
      body: { ...home, ideaArchived: options.ideaArchived ?? home.ideaArchived },
    }),
    [`GET ${IDEA_PATH}`]: () => ({ body: makeDetail({ archived: options.ideaArchived ?? false }) }),
    [`GET ${DECK_PATH}`]: ({ url }) => ({
      body: makeDeck(url.searchParams.get("variant") === "five" ? "five" : "one"),
    }),
    ...options.extra,
  });
  const view = await renderApp(options.path ?? PITCH_URL);
  if (options.waitForHeading !== false) {
    await screen.findByRole("heading", { level: 1, name: "Pitch Deck" });
  }
  return { api, user: userEvent.setup(), ...view };
}
