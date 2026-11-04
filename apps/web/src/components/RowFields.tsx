import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../lib/api";
import { rejectionReason, type SaveTarget } from "../lib/autosave";
import { useAutosave, useSaveItem } from "../lib/autosave-react";

/** How a row's fields are checked and carried (design-spec 6.0.8, SDD 5.7). */
export interface RowFieldsSpec<V extends object> {
  /** Why `value` breaks the rule of `field`, or undefined. */
  errorOf: <F extends keyof V>(field: F, value: V[F]) => string | undefined;
  /** A field's value as the API takes it: an amount's text as its number. */
  toWire: <F extends keyof V>(field: F, value: V[F]) => unknown;
  /** A value on its way back in its field's form. */
  fromWire: <F extends keyof V>(field: F, value: unknown) => V[F];
  /** A field whose change is a choice, saved when made (6.0.2). */
  isChoice: (field: keyof V) => boolean;
}

/** Whether every field keeps its rule: what a new row needs before it is added. */
export const isRowValid = <V extends object>(
  spec: RowFieldsSpec<V>,
  values: V,
) =>
  (Object.keys(values) as (keyof V)[]).every(
    (field) => spec.errorOf(field, values[field]) === undefined,
  );

/**
 * The fields of a new row a refused send names (SDD 8.2's last guard: a 422
 * `VALIDATION_FAILED` whose `details` give their paths), which show "Check the format"
 * under them while "Couldn't save" and its reason show by the form's buttons (6.0.2).
 */
export function refusedFieldsOf<F extends string>(
  error: unknown,
  fields: readonly F[],
): F[] {
  const details =
    error instanceof ApiError && error.code === "VALIDATION_FAILED"
      ? error.detail.details
      : undefined;
  if (!Array.isArray(details)) return [];
  const paths = (details as { path?: unknown }[]).map(({ path }) => path);
  return fields.filter((field) => paths.includes(field));
}

/**
 * Whether a send was refused for a reason 6.0.2 names that the screen shows once it is
 * read again: archived, no access, gone.
 */
export function isRefusedForGood(error: unknown): boolean {
  const reason = error instanceof ApiError ? rejectionReason(error) : null;
  return reason === "archived" || reason === "noAccess" || reason === "gone";
}

/**
 * Reads the screen again once a new row's send is {@link isRefusedForGood refused for
 * good}, as a refused save and a refused row action do (design-spec 6.0.6): the screen
 * then shows why, archived or read only. Call it from `mutate`'s `onError`, which runs
 * only while the form is open: once it is closed, its failure goes to a toast that reads
 * the screen again itself (useFailureOnceClosed). The form itself stays, read only,
 * until it is closed (6.10): the screen keeps it open past the `canEdit` it read again.
 */
export function useReadAgainWhenRefused(): (error: unknown) => void {
  const queryClient = useQueryClient();
  return useCallback(
    (error) => {
      if (isRefusedForGood(error)) void queryClient.invalidateQueries();
    },
    [queryClient],
  );
}

/**
 * A row's fields saved as they are typed (design-spec 6.0.2, an item per row; 15's
 * competitor, 16's assumption and risk): a field that breaks its rule (6.0.8) is not sent
 * and says why under it, as does a field the API refused (SDD 8.2's last guard). What is
 * typed shows as typed while the field has focus (an amount is not rewritten as it is
 * typed); after, what waits to be saved shows over what was saved. Leaving the row any
 * way sends what waits (6.0.2「画面を離れるとき」).
 */
export function useRowFields<V extends object>(
  target: SaveTarget,
  lockVersion: number,
  saved: V,
  spec: RowFieldsSpec<V>,
) {
  const { t } = useTranslation(["errors"]);
  const autosave = useAutosave();
  const saving = useSaveItem(target.key);
  const [invalid, setInvalid] = useState<Partial<V>>({});
  const [typed, setTyped] = useState<Partial<V>>({});
  useEffect(() => () => autosave.flush(target.key), [autosave, target.key]);

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
  const refused = (field: keyof V) => {
    const details = failure?.detail.details;
    return failure?.code === "VALIDATION_FAILED" &&
      Array.isArray(details) &&
      details.some((detail) => (detail as { path?: unknown }).path === field)
      ? t("errors:input.format")
      : undefined;
  };
  const errors = Object.fromEntries(
    fields.flatMap((field) => {
      const error = Object.hasOwn(invalid, field)
        ? spec.errorOf(field, invalid[field] as V[typeof field])
        : refused(field);
      return error === undefined ? [] : [[field, error]];
    }),
  ) as Partial<Record<keyof V, string>>;

  const change = <F extends keyof V>(field: F, value: V[F]) => {
    if (spec.errorOf(field, value) === undefined) {
      setInvalid(({ [field]: _, ...rest }) => rest as Partial<V>);
      autosave.change(target, lockVersion, {
        [field]: spec.toWire(field, value),
      });
      if (spec.isChoice(field)) autosave.flush(target.key);
      else setTyped((current) => ({ ...current, [field]: value }));
    } else {
      setInvalid((current) => ({ ...current, [field]: value }));
      autosave.discard(target.key, [field as string]);
    }
  };
  const blur = (field: keyof V) => {
    setTyped(({ [field]: _, ...rest }) => rest as Partial<V>);
    autosave.flush(target.key);
  };
  return { values, errors, change, blur };
}
