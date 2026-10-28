import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SaveTarget } from "../lib/autosave";
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
