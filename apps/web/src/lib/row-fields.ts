import { amountSchema } from "@moonx/schemas";
import { z } from "zod";

/** Why a typed value is not saved (design-spec 6.0.6): the row keeps the server's copy meanwhile. */
export type FieldProblem = "required" | "url" | "range";

/** What a field holds while it is edited. Text kinds hold "" for none, the others hold null. */
export type FieldValue = string | string[] | number | null;
export type Draft = Record<string, FieldValue>;

interface FieldBase {
  /** The API field name; the draft and the request body use the same name. */
  key: string;
  label: string;
}

export interface ChoiceOption {
  id: string;
  label: string;
}

export type FieldSpec =
  | (FieldBase & { kind: "text"; required?: boolean })
  | (FieldBase & { kind: "longText" })
  | (FieldBase & { kind: "date" })
  | (FieldBase & { kind: "url" })
  | (FieldBase & { kind: "money" })
  | (FieldBase & {
      kind: "choice";
      control: "picker" | "segmented";
      options: readonly ChoiceOption[];
    })
  | (FieldBase & { kind: "checks"; options: readonly ChoiceOption[] });

/** Longest short text of a row (`rowName` in the API). */
export const MAX_ROW_NAME = 200;
/** Longest URL (`httpUrlSchema` in the API). */
export const MAX_URL = 2000;

const urlSchema = z.url({ protocol: /^https?$/ }).max(MAX_URL);

/** The value of a field that holds nothing. */
export function blankValue(spec: FieldSpec): FieldValue {
  switch (spec.kind) {
    case "money":
    case "choice":
      return null;
    case "checks":
      return [];
    default:
      return "";
  }
}

function draftValue(spec: FieldSpec, raw: unknown): FieldValue {
  switch (spec.kind) {
    case "money":
      return typeof raw === "number" ? raw : null;
    case "choice":
      return typeof raw === "string" ? raw : null;
    case "checks":
      return Array.isArray(raw) ? raw.map(String) : [];
    default:
      return typeof raw === "string" ? raw : "";
  }
}

/** The draft of a row as the server holds it. */
export function draftOf(specs: readonly FieldSpec[], row: object): Draft {
  const fields = row as Record<string, unknown>;
  return Object.fromEntries(specs.map((spec) => [spec.key, draftValue(spec, fields[spec.key])]));
}

/** A draft with the fields of a request body put in, for input an earlier visit left unsent. */
export function applyBody(
  specs: readonly FieldSpec[],
  draft: Draft,
  body: Record<string, unknown>,
): Draft {
  const next = { ...draft };
  for (const spec of specs) {
    if (spec.key in body) next[spec.key] = draftValue(spec, body[spec.key]);
  }
  return next;
}

export type FieldBody = { body: Record<string, unknown> } | { problem: FieldProblem };

/**
 * The request fragment for one field, or the problem that keeps it from being sent. A blank text
 * goes as null because the API stores no text for it.
 */
export function fieldBody(spec: FieldSpec, draft: Draft): FieldBody {
  const value = draft[spec.key] ?? blankValue(spec);
  switch (spec.kind) {
    case "text": {
      const text = String(value);
      if (spec.required && text.trim() === "") return { problem: "required" };
      return { body: { [spec.key]: spec.required ? text : text.trim() === "" ? null : text } };
    }
    case "longText":
    case "date":
      return { body: { [spec.key]: String(value).trim() === "" ? null : String(value) } };
    case "url": {
      const text = String(value).trim();
      if (text === "") return { body: { [spec.key]: null } };
      return urlSchema.safeParse(text).success
        ? { body: { [spec.key]: text } }
        : { problem: "url" };
    }
    case "money": {
      if (value === null) return { body: { [spec.key]: null } };
      return amountSchema.safeParse(value).success
        ? { body: { [spec.key]: value } }
        : { problem: "range" };
    }
    default:
      return { body: { [spec.key]: value } };
  }
}

/** Every valid field of a draft as one request body, for a retry the server refused. */
export function fullBody(specs: readonly FieldSpec[], draft: Draft): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const spec of specs) {
    const result = fieldBody(spec, draft);
    if ("body" in result) Object.assign(body, result.body);
  }
  return body;
}

const normalized = (specs: readonly FieldSpec[], draft: Draft) =>
  JSON.stringify(
    specs.map((spec) => {
      const value = draft[spec.key] ?? blankValue(spec);
      return typeof value === "string" ? value.trim() : value;
    }),
  );

/** Whether a draft says what a saved copy says, ignoring the blanks the API drops. */
export function isSameDraft(specs: readonly FieldSpec[], a: Draft, b: Draft): boolean {
  return normalized(specs, a) === normalized(specs, b);
}

/** The text fields of a row or of an unsent save as one line, for the conflict dialog. */
export function describeFields(
  specs: readonly FieldSpec[],
  fields: Record<string, unknown> | undefined,
): string | null {
  if (!fields) return null;
  const parts = specs
    .filter((spec) => spec.kind === "text" || spec.kind === "longText")
    .map((spec) => fields[spec.key])
    .filter((value): value is string => typeof value === "string" && value.trim() !== "");
  return parts.length > 0 ? parts.join(" · ") : null;
}
