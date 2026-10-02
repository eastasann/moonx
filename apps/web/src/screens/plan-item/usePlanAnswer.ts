import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { planKey } from "../../lib/ai-exchange";
import { IDEAS_KEY } from "../../lib/idea-actions";
import { planAnswerUrl } from "../../lib/plan-item";
import type { PlanAnswer } from "../../lib/plans";
import { ME_KEY } from "../../lib/session";
import { type SavedItem, useSavedItem } from "../../lib/use-saved-item";

export interface PlanAnswerEditorOptions<Draft> {
  planId: string;
  /** The server's copy of the answer; `lockVersion` 0 means nobody has answered yet. */
  answer: PlanAnswer;
  isReadOnly: boolean;
  /** What the editor holds for an answer: the text, or the rows. */
  initial: (answer: PlanAnswer) => Draft;
  /** The request body of a draft. */
  body: (draft: Draft) => Record<string, unknown>;
  /** Whether a draft says what a saved copy says, ignoring the blanks the API drops. */
  matches: (draft: Draft, saved: PlanAnswer) => boolean;
  /** The draft that input an earlier visit left unsent makes, or null when it holds nothing of this kind. */
  restore: (patch: Record<string, unknown>, current: Draft) => Draft | null;
  /** Receives the server's copy after every save and after "Load theirs", to refresh the screen's caches. */
  onSaved: (saved: PlanAnswer) => void;
}

export interface PlanAnswerEditor<Draft> {
  draft: Draft;
  /** `send: false` keeps a draft the API would refuse on the screen without sending it. */
  change: (next: Draft, options?: { delay?: number; send?: boolean }) => void;
  flush: () => Promise<void>;
  item: SavedItem;
}

/**
 * Edits one sub-item of a plan item with the autosave rules of design-spec 6.0.2 (P5, PUT with
 * the answer's `lockVersion`). A newer copy from a refetch replaces the draft unless the person
 * has unsent input in it; with unsent input the old version stays so the save reports the
 * conflict instead of hiding it.
 */
export function usePlanAnswer<Draft>(
  options: PlanAnswerEditorOptions<Draft>,
): PlanAnswerEditor<Draft> {
  const { planId, answer, isReadOnly } = options;
  const queryClient = useQueryClient();
  const latest = useRef(options);
  latest.current = options;
  const [draft, setDraft] = useState(() => options.initial(answer));
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const known = useRef(answer.lockVersion);
  const dirty = useRef(false);

  const adopt = (source: PlanAnswer) => {
    known.current = source.lockVersion;
    dirty.current = false;
    const next = latest.current.initial(source);
    draftRef.current = next;
    setDraft(next);
  };

  const item = useSavedItem({
    itemKey: `plan-answer:${planId}:${answer.questionKey}`,
    method: "PUT",
    url: planAnswerUrl(planId, answer.questionKey),
    lockVersion: answer.lockVersion,
    isReadOnly,
    onSentElsewhere: () => {
      dirty.current = false;
      void queryClient.invalidateQueries({ queryKey: planKey(planId) });
    },
    onSaved: (data) => {
      const saved = data as PlanAnswer;
      known.current = saved.lockVersion;
      // Input typed while the request was on its way is still unsent.
      dirty.current = !latest.current.matches(draftRef.current, saved);
      latest.current.onSaved(saved);
    },
    onAdopt: (current) => {
      const source = current.value as PlanAnswer;
      adopt(source);
      latest.current.onSaved(source);
    },
    onRestore: (patch) => {
      const next = latest.current.restore(patch, draftRef.current);
      if (!next) return;
      dirty.current = true;
      draftRef.current = next;
      setDraft(next);
    },
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: adopt and acknowledge only touch refs and setters
  useEffect(() => {
    if (answer.lockVersion <= known.current || dirty.current) return;
    adopt(answer);
    item.acknowledge(answer.lockVersion);
  }, [answer]);

  // An answer that lost its right to be saved (archived plan, changed role) is read again (SDD 8.2).
  const failure = item.failure;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reacts to a new failure only
  useEffect(() => {
    if (!failure || failure.willRetry) return;
    const { code } = failure.error;
    if (code === "ARCHIVED" || code === "FORBIDDEN" || code === "NO_ACCESS") {
      void queryClient.invalidateQueries({ queryKey: planKey(planId) });
      void queryClient.invalidateQueries({ queryKey: IDEAS_KEY });
      void queryClient.invalidateQueries({ queryKey: ME_KEY });
    }
  }, [failure]);

  const change: PlanAnswerEditor<Draft>["change"] = (next, changeOptions) => {
    dirty.current = true;
    draftRef.current = next;
    setDraft(next);
    if (changeOptions?.send === false) return;
    item.save(latest.current.body(next), { delay: changeOptions?.delay });
  };

  return { draft, change, flush: item.flush, item };
}
