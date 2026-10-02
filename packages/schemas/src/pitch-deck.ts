import type { MetricValue, Versioned } from "./common";
import type { ExecutionStatus, ExecutionType, LaunchTiming } from "./enums";

/** The two Pitch Deck lengths (design-spec 6.14). */
export type PitchVariant = "one" | "five";

/** What a Pitch Deck is generated from: today's plan or a saved version. */
export type PitchSource =
  | { kind: "latest" }
  | { kind: "version"; versionId: string; name: string; savedAt: string };

export type PitchSlideType = "title" | "text" | "number" | "table";

/** SDD 5.9 PitchDeck slide. */
export interface PitchSlide {
  key: string;
  type: PitchSlideType;
  title: string;
  subtitle?: string | null;
  bullets?: { text: string; empty: boolean }[];
  numbers?: { label: string; metricKey: string; value: MetricValue }[];
  table?: { columns: string[]; rows: (string | null)[][] };
  emptySources: string[];
  overflow: boolean;
  editSource: { itemNo: number } | null;
  editInValidation: "costs" | "economics" | null;
  commentCount: number;
}

/** SDD 5.9 PitchDeck. */
export interface PitchDeck {
  variant: PitchVariant;
  source: PitchSource;
  businessName: string;
  generatedAt: string;
  footer: { businessName: string; versionLabel: string; date: string };
  speakerNotes: string | null;
  slides: PitchSlide[];
}

export type { ExecutionStatus, ExecutionType, LaunchTiming, Versioned };
