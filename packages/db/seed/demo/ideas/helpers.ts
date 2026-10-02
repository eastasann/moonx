import type { AnswerSpec, EvidenceRef, Level } from "../validation";

const LEVELS = { l: "low", m: "medium", h: "high" } as const;

/** Fact: `evidence` is required, a Fact without evidence cannot be made (design-spec 6.0.3). */
export const fact = (key: string, text: string, evidence: EvidenceRef[]): AnswerSpec => ({
  key,
  text,
  fau: "fact",
  evidence,
});

export const assume = (key: string, text: string, confidence: keyof typeof LEVELS): AnswerSpec => ({
  key,
  text,
  fau: "assumption",
  confidence: LEVELS[confidence] satisfies Level,
});

export const unknown = (key: string, text: string | null): AnswerSpec => ({
  key,
  text,
  fau: "unknown",
});

/** A value without a F/A/U label: what an AI import leaves behind. */
export const plain = (key: string, text: string): AnswerSpec => ({ key, text, fau: null });

export const log = (id: string): EvidenceRef => ({ log: id });
export const url = (href: string, note?: string): EvidenceRef =>
  note ? { url: href, note } : { url: href };
