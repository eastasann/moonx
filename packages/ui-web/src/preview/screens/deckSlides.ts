import type { PitchSlide } from "@moonx/schemas";
import { businessModel } from "../MockupDataSection";

/** The footer s23's slide shows. */
export const deckFooter =
  "Piaya Gift Box Delivery · v1 For advisors · Oct 12, 2026";

const exact = (value: number) => ({
  value,
  bound: "exact" as const,
  reason: null,
});

const written = (label: string, text: string) => ({
  label,
  text,
  empty: false,
});

const slide = (
  key: PitchSlide["key"],
  type: PitchSlide["type"],
  title: string,
  rest: Partial<PitchSlide>,
): PitchSlide => ({
  key,
  type,
  title: { text: title, empty: false },
  subtitle: null,
  bullets: [],
  numbers: [],
  table: null,
  emptySources: [],
  shrink: 0,
  overflow: false,
  editSource: null,
  editInValidation: null,
  commentCount: 0,
  ...rest,
});

/**
 * Plan A's five-minute deck of Piaya Gift Box Delivery, in packages/domain's order (14
 * slides): s23 shows the first eight in its column, Business model the seventh.
 */
export const deckSlides: PitchSlide[] = [
  slide("title", "title", "Piaya Gift Box Delivery", {
    subtitle: {
      text: "Corporate gift boxes of Bacolod piaya, delivered the same day.",
      empty: false,
    },
    bullets: [
      written("Prepared by", "Ana Villanueva"),
      written("Date", "Oct 12, 2026"),
      written("Version", "v1 For advisors"),
    ],
  }),
  slide("problem", "text", "Problem", {
    bullets: [
      written(
        "Primary problem",
        "Gift boxes bought at the airport are crushed and stale.",
      ),
      written("Frequency", "Every client visit and holiday season."),
    ],
  }),
  slide("customer", "text", "Customer", {
    bullets: [
      written("Who pays", "HR and admin teams at Bacolod offices."),
      written("Why they buy", "Client gifts and holiday giveaways."),
    ],
  }),
  slide("solution", "text", "Solution", {
    bullets: [
      written(
        "What we offer",
        "Fresh piaya boxes ordered online and delivered the same day.",
      ),
      written(
        "Why it is better",
        "Packed to arrive whole, with the company's card inside.",
      ),
    ],
  }),
  slide("market", "text", "Market", {
    bullets: [
      written("Market type", "Mixed"),
      written("Reachable market", "About 300 offices in Bacolod."),
    ],
  }),
  slide("competition", "table", "Competition", {
    bullets: [
      written(
        "What must we do differently or better?",
        "Deliver fresh boxes the same day.",
      ),
    ],
    table: {
      columns: [
        { label: "Name", numeric: false, width: 0.25 },
        { label: "Type", numeric: false, width: 0.18 },
        { label: "Price", numeric: true, width: 0.15 },
        { label: "Strength", numeric: false, width: 0.42 },
      ],
      rows: [
        ["Airport kiosk", "Direct", "₱450", "Open every day"],
        ["Bakeshop boxes", "Indirect", "₱380", null],
      ],
    },
  }),
  { ...businessModel, commentCount: 1 },
  slide("economics", "table", "Economics", {
    numbers: [
      {
        label: "Startup cost",
        metricKey: "initial_cost_total",
        value: exact(180000),
      },
      {
        label: "Break-even / day",
        metricKey: "break_even_units_day",
        value: exact(7),
      },
      { label: "Payback", metricKey: "payback_months", value: exact(9) },
      { label: "ROI", metricKey: "simple_roi", value: exact(1.2) },
    ],
    table: {
      columns: [
        { label: "Scenario", numeric: false, width: 0.28 },
        { label: "Units / day", numeric: true, width: 0.2 },
        { label: "Revenue / month", numeric: true, width: 0.26 },
        { label: "Operating profit / month", numeric: true, width: 0.26 },
      ],
      rows: [
        ["Low", "6", "₱67,500", "−₱4,500"],
        ["Base", "10", "₱112,500", "₱22,000"],
        ["High", "15", "₱168,750", "₱54,000"],
      ],
    },
  }),
  slide("funding", "text", "Funding plan", {
    bullets: [
      written("Funding", "Owner savings of ₱120,000 and a ₱60,000 loan."),
    ],
  }),
  slide("why_us", "text", "Why us", {
    bullets: [
      written("Experience", "Ten years supplying piaya to Bacolod bakeshops."),
      written("Founders", "Ana Villanueva (Owner)"),
    ],
  }),
  slide("execution", "table", "Execution plan", {
    table: {
      columns: [
        { label: "Milestone", numeric: false, width: 0.4 },
        { label: "Assignee", numeric: false, width: 0.3 },
        { label: "Deadline", numeric: false, width: 0.3 },
      ],
      rows: [
        ["Kitchen permit", "Ana Villanueva", "Nov 15"],
        ["First 20 offices", "Kenji Mori", "Dec 1"],
      ],
    },
  }),
  slide("launch", "text", "Launch plan", {
    bullets: [
      written("Before opening", "Tasting boxes for 20 HR teams."),
      written("First month", "Holiday orders from the first offices."),
    ],
  }),
  slide("risks", "table", "Risks", {
    table: {
      columns: [
        { label: "Risk", numeric: false, width: 0.4 },
        { label: "Impact", numeric: false, width: 0.2 },
        { label: "Mitigation", numeric: false, width: 0.4 },
      ],
      rows: [["Boxes crushed in delivery", "High", "Rigid inserts"]],
    },
  }),
  slide("ask", "text", "Ask / next step", {
    bullets: [
      written("Ask", "Introductions to HR teams at three offices."),
      written("Next step", "Run the tasting boxes in November."),
    ],
  }),
];
