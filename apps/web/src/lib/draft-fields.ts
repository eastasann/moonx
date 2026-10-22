import { createContext, useContext, useEffect, useState } from "react";
import type { z } from "zod";
import type { SaveTarget } from "./autosave";
import { useAutosave, useSaveItem } from "./autosave-react";
import { inputIssueMessage } from "./input-issues";

type Issue = z.core.$ZodIssue;

/** How a node's fields on 27 are checked and carried (design-spec 6.0.8, SDD 5.13). */
export interface DraftFieldsSpec<V extends object> {
  /**
   * Why `value` breaks the rules of `field`, each issue at its path inside the value (a
   * list's row, a row's column); none when it keeps them.
   */
  issuesOf: <F extends keyof V>(field: F, value: V[F]) => Issue[];
  /** A field's value as the API takes it. */
  toWire: <F extends keyof V>(field: F, value: V[F]) => unknown;
  /** A value on its way back in its field's form. */
  fromWire: <F extends keyof V>(field: F, value: unknown) => V[F];
  /** A field whose change is a choice, saved when made (6.0.2). */
  isChoice: (field: keyof V) => boolean;
}

/**
 * Where a screen hears which items hold input that breaks its rules: such input is not
 * sent, so autosave does not know of it, yet it is not saved either (27's Publish waits
 * for it, design-spec 6.17).
 */
export const HeldInputContext = createContext<
  ((itemKey: string, isHeld: boolean) => void) | null
>(null);

/**
 * A node's fields on 27 saved as they are typed (design-spec 6.0.2・6.17): a value that
 * breaks its rules (6.0.8) is not sent and says why at its place, as does one the API
 * refused (SDD 8.2's last guard). A list keeps a row just added quiet until the list is
 * left, so a new empty row does not open in red; it is not sent meanwhile either. What is
 * typed shows as typed while the field has focus; after, what waits to be saved shows
 * over what was saved. Leaving the node sends what waits (6.0.2「画面を離れるとき」).
 */
export function useDraftFields<V extends object>(
  target: SaveTarget,
  saved: V,
  spec: DraftFieldsSpec<V>,
) {
  const autosave = useAutosave();
  const saving = useSaveItem(target.key);
  const [invalid, setInvalid] = useState<Partial<V>>({});
  const [typed, setTyped] = useState<Partial<V>>({});
  const [quiet, setQuiet] = useState<ReadonlySet<keyof V>>(new Set());
  useEffect(() => () => autosave.flush(target.key), [autosave, target.key]);
  const reportHeld = useContext(HeldInputContext);
  const isHeld = Object.keys(invalid).length > 0;
  useEffect(() => {
    reportHeld?.(target.key, isHeld);
  }, [reportHeld, target.key, isHeld]);
  // Leaving the node drops what was held with its fields.
  useEffect(
    () => () => reportHeld?.(target.key, false),
    [reportHeld, target.key],
  );

  const fields = Object.keys(saved) as (keyof V)[];
  const shownValue = <F extends keyof V>(field: F): V[F] => {
    if (Object.hasOwn(invalid, field)) return invalid[field] as V[F];
    if (Object.hasOwn(typed, field)) return typed[field] as V[F];
    if (saving !== undefined && Object.hasOwn(saving.unsaved, field)) {
      return spec.fromWire(field, saving.unsaved[field as string]);
    }
    return saved[field];
  };
  const values = Object.fromEntries(
    fields.map((field) => [field, shownValue(field)]),
  ) as V;

  const failure = saving?.status === "rejected" ? saving.failure : null;
  /** The API refused the field (a 422 naming it): "Check the format" on the field. */
  const isRefused = (field: keyof V) => {
    const details = failure?.detail.details;
    return (
      failure?.code === "VALIDATION_FAILED" &&
      Array.isArray(details) &&
      details.some((detail) => {
        const path = (detail as { path?: unknown }).path;
        return (
          typeof path === "string" &&
          (path === field || path.startsWith(`${String(field)}.`))
        );
      })
    );
  };

  /** The reasons a field shows: at their paths inside its value, `[]` for the field. */
  const issues = (field: keyof V): readonly Issue[] => {
    if (quiet.has(field)) return [];
    if (Object.hasOwn(invalid, field)) {
      return spec.issuesOf(field, invalid[field] as V[typeof field]);
    }
    return isRefused(field)
      ? [
          {
            code: "invalid_format",
            format: "refused",
            path: [],
            message: "Refused",
            input: undefined,
          },
        ]
      : [];
  };

  /**
   * Takes new values of one field or several (a new answer type with its settings
   * cleared): those that keep their rules wait to be saved together; the others stay
   * on screen with their reasons. `quietly`: a row was just added, its reasons wait.
   */
  const change = (next: Partial<V>, { quietly = false } = {}) => {
    const changed = Object.keys(next) as (keyof V)[];
    const valid: Record<string, unknown> = {};
    const broken: Partial<V> = {};
    for (const field of changed) {
      const value = next[field] as V[typeof field];
      if (spec.issuesOf(field, value).length === 0) {
        valid[field as string] = spec.toWire(field, value);
      } else {
        broken[field] = value;
      }
    }
    setQuiet((current) => {
      const updated = new Set(current);
      for (const field of changed) {
        if (quietly) updated.add(field);
        else updated.delete(field);
      }
      return updated;
    });
    setInvalid((current) => {
      const updated = { ...current, ...broken };
      for (const field of Object.keys(valid)) delete updated[field as keyof V];
      return updated;
    });
    const brokenFields = Object.keys(broken);
    if (brokenFields.length > 0) autosave.discard(target.key, brokenFields);
    if (Object.keys(valid).length === 0) return;
    autosave.change(target, 0, valid);
    // A choice saves when made, with what goes along (a new type's cleared settings).
    const isChoice = changed.some((field) => spec.isChoice(field));
    if (isChoice) {
      autosave.flush(target.key);
    } else {
      setTyped((current) => {
        const updated = { ...current };
        for (const field of changed) {
          if (Object.hasOwn(valid, field)) updated[field] = next[field];
        }
        return updated;
      });
    }
  };

  /** A field was left: its reasons show, and what waits is saved (6.0.2). */
  const blur = (field: keyof V) => {
    setQuiet((current) => {
      if (!current.has(field)) return current;
      const updated = new Set(current);
      updated.delete(field);
      return updated;
    });
    setTyped(({ [field]: _, ...rest }) => rest as Partial<V>);
    autosave.flush(target.key);
  };

  return { values, issues, change, blur };
}

/** The message of the first issue at `path` inside a field, or undefined. */
export function messageAt(
  issues: readonly Issue[],
  path: readonly PropertyKey[] = [],
): string | undefined {
  const issue = issues.find(
    (candidate) =>
      candidate.path.length === path.length &&
      candidate.path.every((part, index) => part === path[index]),
  );
  // A refusal and a question ID out of form read "Check the format".
  return issue === undefined ? undefined : inputIssueMessage(issue);
}
