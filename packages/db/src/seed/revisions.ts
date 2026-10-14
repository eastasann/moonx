import type { HistorySource } from "@moonx/schemas";
import type {
  HistoryContainer,
  HistoryInput,
  HistoryLog,
  UserKey,
} from "./context";

/** Who saved something and when, in days (and hours) before the run. */
export interface When {
  daysAgo: number;
  hoursAgo?: number;
  by: UserKey;
  /** Screen width when saved (SDD 5.1「クライアントの種類」). Defaults to web. */
  client?: "web" | "web_mobile";
}

/** One save of a keyed item (an answer or a number), as its history row records it. */
export interface Edit extends When {
  source?: Extract<
    HistorySource,
    "manual" | "ai_import" | "revert" | "duplicate" | "plan_draft"
  >;
  /** Names the operation that made it (an AI import, a draft); one name is one operation. */
  batch?: string;
  /** For a revert: the earlier save it restores (an index into `earlier`). */
  revertTo?: number;
}

/**
 * A keyed item's earlier saves, oldest first. Each states the fields that differ from the
 * current state; a revert states none and restores the save it points at.
 */
export type Earlier<State> = (Partial<State> & Edit)[];

/**
 * Writes the history of one keyed item: a create row for its first save, then an update
 * row for each later one, ending with its current state. Returns every save in order with
 * the state it left (a revert leaves the state it restores).
 *
 * @throws when a save is not later than the one before it (the history would have no
 *   order), when a revert points at a save that is not earlier, or when the current
 *   state is a revert that does not match the save it restores.
 */
export function recordRevisions<State>(
  history: HistoryLog,
  at: (when: When) => Date,
  target: {
    container: HistoryContainer;
    sectionKey: string | null;
    target: HistoryInput["target"];
  },
  current: { state: State; edit: Edit },
  earlier: Earlier<State>,
  payload: (state: State) => unknown,
): { state: State; at: Date; by: UserKey }[] {
  const saves = [
    ...earlier.map((step) => ({
      state: { ...current.state, ...step } as State,
      edit: step as Edit,
    })),
    current,
  ];
  const resolved = saves.map(({ state }) => state);
  saves.forEach(({ edit }, index) => {
    if (edit.revertTo === undefined) return;
    const restored = resolved[edit.revertTo];
    if (edit.revertTo >= index || restored === undefined)
      throw new Error(`Save ${index} reverts to ${edit.revertTo}, not earlier`);
    resolved[index] = restored;
  });
  const states = resolved.map(payload);
  if (
    current.edit.revertTo !== undefined &&
    JSON.stringify(states.at(-1)) !== JSON.stringify(payload(current.state))
  )
    throw new Error("The current state does not match the save it restores");

  saves.forEach(({ edit }, index) => {
    const previous = saves[index - 1];
    if (previous !== undefined && at(edit) <= at(previous.edit))
      throw new Error(`Save ${index} is not later than the save before it`);
  });
  const ids: string[] = [];
  saves.forEach(({ edit }, index) => {
    ids.push(
      history.add({
        ...target,
        action: index === 0 ? "create" : "update",
        before: index === 0 ? null : states[index - 1],
        after: states[index],
        source: edit.source ?? "manual",
        batch: edit.batch,
        revertedFromId:
          edit.revertTo === undefined ? undefined : ids[edit.revertTo],
        by: edit.by,
        at: at(edit),
        client: edit.client,
      }),
    );
  });
  return saves.map(({ edit }, index) => ({
    state: resolved[index] as State,
    at: at(edit),
    by: edit.by,
  }));
}

/** The moments of the first and the last of `saves`. */
export function firstAndLast(saves: readonly { at: Date }[]): {
  first: Date;
  last: Date;
} {
  const first = saves[0];
  const last = saves.at(-1);
  if (first === undefined || last === undefined)
    throw new Error("No saves recorded");
  return { first: first.at, last: last.at };
}
