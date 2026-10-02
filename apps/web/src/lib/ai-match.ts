import { type MatchState, type MatchTarget, matchBlocks, type ReplyBlock } from "@moonx/domain";
import type { ImportContext } from "./ai-exchange";

/** What the person decided on the Match step; everything else follows from the pasted blocks. */
export interface MatchChoices {
  /** Block index to the question it was sent to by hand. */
  assigned: Readonly<Record<number, string>>;
  /** Block indexes thrown away. */
  discarded: ReadonlySet<number>;
  /** Question key to the block index used when several blocks name it. */
  chosen: Readonly<Record<string, number>>;
}

export const NO_CHOICES: MatchChoices = { assigned: {}, discarded: new Set(), chosen: {} };

/** The questions of an import target as `matchBlocks` wants them. */
export function matchTargets(context: ImportContext, inScope: ReadonlySet<string>): MatchTarget[] {
  return context.questions.map((q) => ({
    key: q.questionKey,
    title: q.title,
    sectionKey: q.sectionKey,
    answerType: q.answerType,
    importable: q.importable,
    hidden: q.hidden,
    inScope: inScope.has(q.sectionKey),
  }));
}

/** The questions a block can be sent to by hand: in scope, importable and showing. */
export const pickableTargets = (targets: readonly MatchTarget[]) =>
  targets.filter((t) => t.inScope && t.importable && !t.hidden);

/** One line of the Match step. */
export interface MatchRow {
  /** The block; for a group of duplicates the first one. */
  block: ReplyBlock;
  state: MatchState | "discarded";
  /** Where the block goes now (by its ID or by hand), when it goes anywhere. */
  questionKey: string | null;
  /** Sent to this question by hand, not by its ID. */
  isManual: boolean;
  /** Blocks naming the same question, in paste order; set for duplicates. */
  group?: ReplyBlock[];
  /** The member of `group` that is used. */
  usedIndex?: number;
}

/** A block that will be reviewed and applied. */
export interface ResolvedBlock {
  questionKey: string;
  block: ReplyBlock;
}

export interface MatchOutcome {
  rows: MatchRow[];
  resolved: ResolvedBlock[];
}

/**
 * Applies the person's choices to `matchBlocks` (design-spec 6.7). A block sent to a question by
 * hand is matched under that question's ID, so two blocks sent to one question become duplicates
 * like two blocks that name it. Discarded blocks drop out of the matching altogether. Blocks left
 * unmatched are not in `resolved`: moving on from the Match step discards them.
 */
export function resolveMatches(
  blocks: readonly ReplyBlock[],
  targets: readonly MatchTarget[],
  choices: MatchChoices,
): MatchOutcome {
  const byKey = new Map(targets.map((t) => [t.key, t]));
  const effective = blocks
    .filter((b) => !choices.discarded.has(b.index))
    .map((b) =>
      choices.assigned[b.index] ? { ...b, id: choices.assigned[b.index] as string } : b,
    );
  const matched = matchBlocks(effective, [...targets]);
  const stateOf = new Map(matched.map((m) => [m.block.index, m]));

  const rows: MatchRow[] = [];
  const resolved: ResolvedBlock[] = [];
  const grouped = new Set<number>();
  for (const original of blocks) {
    const m = stateOf.get(original.index);
    if (!m) {
      rows.push({ block: original, state: "discarded", questionKey: null, isManual: false });
      continue;
    }
    const isManual = choices.assigned[original.index] !== undefined;
    if (m.state !== "duplicate") {
      rows.push({ block: original, state: m.state, questionKey: m.questionKey, isManual });
      if (m.state === "matched" && m.questionKey) {
        resolved.push({ questionKey: m.questionKey, block: original });
      }
      continue;
    }
    if (grouped.has(original.index)) continue;
    const key = m.questionKey as string;
    const indexes = [original.index, ...(m.duplicateOf ?? [])].sort((a, b) => a - b);
    for (const i of indexes) grouped.add(i);
    const group = indexes.map((i) => blocks[i] as ReplyBlock);
    const requested = choices.chosen[key];
    const used = indexes.includes(requested as number)
      ? (requested as number)
      : (indexes[0] as number);
    const target = byKey.get(key);
    rows.push({
      block: group[0] as ReplyBlock,
      state: "duplicate",
      questionKey: key,
      isManual,
      group,
      usedIndex: used,
    });
    if (target?.importable && !target.hidden) {
      resolved.push({ questionKey: key, block: blocks[used] as ReplyBlock });
    }
  }
  return { rows, resolved };
}
