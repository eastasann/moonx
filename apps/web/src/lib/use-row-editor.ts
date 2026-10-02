import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { IDEAS_KEY } from "./idea-actions";
import {
  applyBody,
  type Draft,
  draftOf,
  type FieldProblem,
  type FieldSpec,
  type FieldValue,
  fieldBody,
  fullBody,
  isSameDraft,
} from "./row-fields";
import { ME_KEY } from "./session";
import { type SavedItem, useSavedItem } from "./use-saved-item";

export interface RowEditorOptions<Row extends { lockVersion: number }> {
  /** The server's copy of the row. */
  row: Row;
  specs: readonly FieldSpec[];
  /** Names the row in the pending queue, such as `competitor:<id>`. */
  itemKey: string;
  /** The PATCH URL of the row. */
  url: string;
  /** A Viewer, or an idea that is archived: nothing is saved. */
  isReadOnly: boolean;
  /** Receives the server's copy after every save and after "Load theirs", to refresh the screen's caches. */
  onSaved: (row: Row) => void;
  /** Another tab sent this row's queued input; the screen reads the row again. */
  onSentElsewhere: () => void;
}

export interface RowEditor {
  draft: Draft;
  /** Changes with every copy the draft is replaced by, so uncontrolled inputs start over from it. */
  revision: number;
  problems: Partial<Record<string, FieldProblem>>;
  /** `immediate` saves at once (a choice, a date), else the autosave delay applies. */
  change: (key: string, value: FieldValue, options?: { immediate?: boolean }) => void;
  flush: () => Promise<void>;
  /** Tells the editor the row's version moved by a request it did not send (the evidence sheet). */
  acknowledge: (lockVersion: number) => void;
  /** Sends the whole draft again after a save the server refused. */
  retry: () => void;
  item: SavedItem;
  /** The version a request about this row must carry now. */
  getLockVersion: () => number;
}

/**
 * Edits one row of a list (a research log entry, a competitor, an assumption or a risk) with the
 * autosave rules of design-spec 6.0.2. The draft is what the person sees; a field that does not
 * pass its check is not sent and shows its reason (6.0.6), and the other fields still save. A newer
 * copy of the row from a refetch replaces the draft unless the person has unsent input in it.
 */
export function useRowEditor<Row extends { lockVersion: number }>(
  options: RowEditorOptions<Row>,
): RowEditor {
  const { row, specs, itemKey, url, isReadOnly } = options;
  const queryClient = useQueryClient();
  const latest = useRef(options);
  latest.current = options;
  const [draft, setDraft] = useState(() => draftOf(specs, row));
  const [revision, setRevision] = useState(0);
  const [problems, setProblems] = useState<Partial<Record<string, FieldProblem>>>({});
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const known = useRef({ lockVersion: row.lockVersion });
  const dirty = useRef(false);

  const adopt = (source: Row) => {
    known.current = { lockVersion: source.lockVersion };
    dirty.current = false;
    const next = draftOf(specs, source);
    draftRef.current = next;
    setDraft(next);
    setProblems({});
    setRevision((n) => n + 1);
  };

  const item = useSavedItem({
    itemKey,
    method: "PATCH",
    url,
    lockVersion: row.lockVersion,
    isReadOnly,
    onSentElsewhere: () => {
      dirty.current = false;
      latest.current.onSentElsewhere();
    },
    onSaved: (data) => {
      const saved = data as Row;
      known.current = { lockVersion: saved.lockVersion };
      // Input typed while the request was on its way is still unsent.
      dirty.current = !isSameDraft(specs, draftRef.current, draftOf(specs, saved));
      latest.current.onSaved(saved);
    },
    onAdopt: (current) => {
      const source = current.value as Row;
      adopt(source);
      latest.current.onSaved(source);
    },
    onRestore: (patch) => {
      dirty.current = true;
      const next = applyBody(specs, draftRef.current, patch);
      draftRef.current = next;
      setDraft(next);
      setRevision((n) => n + 1);
    },
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: adopt and acknowledge only touch refs and setters
  useEffect(() => {
    if (row.lockVersion <= known.current.lockVersion || dirty.current) return;
    adopt(row);
    item.acknowledge(row.lockVersion);
  }, [row]);

  // A row that lost its right to be saved (archived idea, changed role) is read again (SDD 8.2).
  const failure = item.failure;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reacts to a new failure only
  useEffect(() => {
    if (!failure || failure.willRetry) return;
    const { code } = failure.error;
    if (code === "ARCHIVED" || code === "FORBIDDEN" || code === "NO_ACCESS") {
      void queryClient.invalidateQueries({ queryKey: IDEAS_KEY });
      void queryClient.invalidateQueries({ queryKey: ME_KEY });
    }
  }, [failure]);

  const change: RowEditor["change"] = (key, value, changeOptions) => {
    const spec = specs.find((s) => s.key === key);
    if (!spec) return;
    const next = { ...draftRef.current, [key]: value };
    draftRef.current = next;
    setDraft(next);
    dirty.current = true;
    const result = fieldBody(spec, next);
    if ("problem" in result) {
      setProblems((prev) => ({ ...prev, [key]: result.problem }));
      return;
    }
    setProblems((prev) => {
      if (!(key in prev)) return prev;
      const { [key]: _fixed, ...rest } = prev;
      return rest;
    });
    item.save(result.body, { delay: changeOptions?.immediate ? 0 : undefined });
  };

  return {
    draft,
    revision,
    problems,
    change,
    flush: item.flush,
    acknowledge: (lockVersion) => {
      known.current = { lockVersion };
      item.acknowledge(lockVersion);
    },
    retry: () => item.retry(fullBody(specs, draftRef.current)),
    item,
    getLockVersion: () => known.current.lockVersion,
  };
}
