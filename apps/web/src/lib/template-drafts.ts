import {
  type AnswerType,
  type CostCategory,
  checkThresholdSchema,
  guidanceSchema,
  isQuestionKey,
  numberTextSchema,
  optionalText,
  plainText,
  planCopySourceSchema,
  type QuestionOptions,
  requiredText,
  TEMPLATE_ANSWER_TYPES,
  TEXT_LIMITS,
  type TemplateKind,
  type TemplateVersionDetail,
  THRESHOLD_CHECK_KEYS,
  templateCostDefaultsSchema,
  templateExecutionPresetsSchema,
  templateFileOptionsSchema,
} from "@moonx/schemas";
import { notifyManager, type QueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { api, inPath, unwrap } from "./api";
import type { SaveFields, SaveTarget } from "./autosave";
import { adminKey, templateVersionKey } from "./queries";

// 27's draft editing (design-spec 6.17): the items its fields save as (6.0.2) and the
// rules each field keeps (6.0.8 for 27). Template rows carry no version (SDD 5.13), so a
// save never meets someone else's: the version numbers autosave asks for are 0.

export type Section = TemplateVersionDetail["sections"][number];
export type Question = Section["questions"][number];
export type ExecutionPreset = TemplateVersionDetail["executionPresets"][number];

/** The start of the key of every item of the version on 27: the header's save scope. */
export const draftScope = (versionId: string) => `template:${versionId}:`;

/** The items of 27 whose save is the whole version's (AD3) or a whole list's (AD5). */
export type VersionItem =
  | "name"
  | "ai-prompt"
  | "cost-defaults"
  | "check-rules"
  | "execution-presets";

export const sectionItemKey = (versionId: string, sectionId: string) =>
  `${draftScope(versionId)}section:${sectionId}`;
export const questionItemKey = (versionId: string, questionId: string) =>
  `${draftScope(versionId)}question:${questionId}`;
export const versionItemKey = (versionId: string, item: VersionItem) =>
  `${draftScope(versionId)}${item}`;

/**
 * Puts the version AD3–AD5 answered with in 27's data, then reads the version and its
 * check again (design-spec 6.17: the check follows every edit). Read again because saves
 * of two items may cross: the answer of the one sent first can arrive last.
 */
export function putVersion(
  queryClient: QueryClient,
  version: TemplateVersionDetail,
) {
  queryClient.setQueryData(templateVersionKey(version.id), version);
  void queryClient.invalidateQueries({
    queryKey: templateVersionKey(version.id),
  });
}

const admin = () => api().api.v1.admin;

/**
 * Sends `fields` and puts the answer in 27's data; no version to return (0). It settles
 * once the screens have been told of the answer: the query cache tells them a task later,
 * and a save settled before would show what was saved before for a moment, taking a
 * list's new row out of the page and the keyboard with it.
 */
const sending =
  (
    queryClient: QueryClient,
    send: (fields: SaveFields) => Promise<TemplateVersionDetail>,
  ) =>
  async (fields: SaveFields) => {
    putVersion(queryClient, await send(fields));
    await new Promise<void>((resolve) => notifyManager.schedule(resolve));
    return 0;
  };

/** No one else's save is ever met (no versions); a reload is all there is to load. */
const reloading = (queryClient: QueryClient, versionId: string) => () =>
  void queryClient.invalidateQueries({
    queryKey: templateVersionKey(versionId),
  });

/** The save of a section's fields (AD4 PATCH). */
export function sectionTarget(
  queryClient: QueryClient,
  versionId: string,
  sectionId: string,
  noun: string,
): SaveTarget {
  return {
    key: sectionItemKey(versionId, sectionId),
    noun,
    send: sending(queryClient, (fields) =>
      unwrap(
        admin()
          ["template-sections"]({ id: inPath(sectionId) })
          .patch(fields as never),
      ),
    ),
    loadTheirs: reloading(queryClient, versionId),
  };
}

/** The save of a question's fields (AD4 PATCH). */
export function questionTarget(
  queryClient: QueryClient,
  versionId: string,
  questionId: string,
  noun: string,
): SaveTarget {
  return {
    key: questionItemKey(versionId, questionId),
    noun,
    send: sending(queryClient, (fields) =>
      unwrap(
        admin()
          ["template-questions"]({ id: inPath(questionId) })
          .patch(fields as never),
      ),
    ),
    loadTheirs: reloading(queryClient, versionId),
  };
}

/**
 * The save of the template's name or the AI prompt (AD3 PATCH), or of a list AD5
 * replaces whole: its field is `items`.
 */
export function versionTarget(
  queryClient: QueryClient,
  versionId: string,
  item: VersionItem,
  noun: string,
): SaveTarget {
  const version = () =>
    admin()["template-versions"]({ versionId: inPath(versionId) });
  const send = (fields: SaveFields): Promise<TemplateVersionDetail> => {
    switch (item) {
      case "name":
      case "ai-prompt":
        return unwrap(version().patch(fields as never));
      case "cost-defaults":
        return unwrap(version()["cost-defaults"].put(fields as never));
      case "check-rules":
        return unwrap(version()["check-rules"].put(fields as never));
      case "execution-presets":
        return unwrap(version()["execution-presets"].put(fields as never));
    }
  };
  return {
    key: versionItemKey(versionId, item),
    noun,
    send: sending(queryClient, async (fields) => {
      const version = await send(fields);
      // The name is the template's: 26's list and the other versions show it too.
      if (item === "name") {
        void queryClient.invalidateQueries({ queryKey: adminKey });
      }
      return version;
    }),
    loadTheirs: reloading(queryClient, versionId),
  };
}

// ---- The rules of the fields (design-spec 6.0.8, the 27 rows) ----

type Issue = z.core.$ZodIssue;

/** Why `value` breaks the rule `schema` holds, as the schema's issues; none if it keeps it. */
export const schemaIssues = (schema: z.ZodType, value: unknown): Issue[] =>
  schema.safeParse(value).error?.issues ?? [];

const custom = (
  rule: "unique" | "required",
  path: PropertyKey[] = [],
): Issue => ({
  code: "custom",
  path,
  message: rule,
  input: undefined,
  params: { rule },
});

const formatIssue = (path: PropertyKey[] = []): Issue => ({
  code: "invalid_format",
  format: "question_key",
  path,
  message: "Not a question ID of this template",
  input: undefined,
});

const shortText = TEXT_LIMITS.short;
const longText = TEXT_LIMITS.long;

export const keySchema = requiredText(shortText);
export const titleSchema = requiredText(shortText);
export const promptSchema = requiredText(longText);
export const subtitleSchema = optionalText(shortText);
export const exampleSchema = optionalText(longText);
export const hintSchema = guidanceSchema;
export const nameSchema = requiredText(shortText);
export const aiPromptSchema = plainText(longText);

/** The issues of a section key: required, short, and no other section's (6.0.8). */
export function sectionKeyIssues(
  version: TemplateVersionDetail,
  sectionId: string | null,
  key: string,
): Issue[] {
  const issues = schemaIssues(keySchema, key);
  if (issues.length > 0) return issues;
  return version.sections.some(
    (section) => section.id !== sectionId && section.key === key,
  )
    ? [custom("unique")]
    : [];
}

/**
 * The issues of a question ID: required, of design-spec 6.6's form for the kind, and no
 * other question's in the version (6.0.8).
 */
export function questionKeyIssues(
  version: TemplateVersionDetail,
  questionId: string | null,
  key: string,
): Issue[] {
  const required = schemaIssues(keySchema, key);
  if (required.length > 0) return required;
  if (!isQuestionKey(key, version.kind)) return [formatIssue()];
  return version.sections.some((section) =>
    section.questions.some(
      (question) => question.id !== questionId && question.key === key,
    ),
  )
    ? [custom("unique")]
    : [];
}

/** The answer types a question of `kind` may take (AD6), and `current` if it is not one. */
export function answerTypesFor(
  kind: TemplateKind,
  current?: AnswerType,
): readonly AnswerType[] {
  const types = TEMPLATE_ANSWER_TYPES[kind];
  return current === undefined || types.includes(current)
    ? types
    : [...types, current];
}

/** Whether a question holds settings its answer type gives (6.17: a new type drops them). */
export const hasOptions = (options: QuestionOptions | null) => {
  if (options === null) return false;
  switch (options.kind) {
    case "choice":
      return options.choices.length > 0;
    case "table":
      return options.columns.length > 0;
    case "linked_metric":
      return options.metricKeys.length > 0;
    case "execution_view":
      return true;
  }
};

/** The issues of a question's settings, at their paths inside the options. */
export const optionsIssues = (options: QuestionOptions | null): Issue[] =>
  options === null ? [] : schemaIssues(templateFileOptionsSchema, options);

/** One condition of "Shown when" as 27 edits it (design-spec 6.17). */
export interface ConditionRow {
  /** The question whose answer decides; null until one is chosen. */
  key: string | null;
  /** The answers it shows on, when that question is a choice: its ticked choices. */
  values: string[];
  /** The answers it shows on otherwise: one per line. */
  text: string;
}

const linesOf = (text: string) =>
  text.split("\n").filter((line) => line.trim() !== "");

/** Whether the version's question `key` is a choice, whose choices are ticked. */
export const isChoiceKey = (version: TemplateVersionDetail, key: string) =>
  version.sections.some((section) =>
    section.questions.some(
      (question) => question.key === key && question.options?.kind === "choice",
    ),
  );

/** The values a condition shows on, as it is sent. */
export const conditionValues = (
  version: TemplateVersionDetail,
  row: ConditionRow,
) =>
  row.key !== null && isChoiceKey(version, row.key)
    ? row.values
    : linesOf(row.text);

/** "Shown when" as 27 edits it, from the stored conditions. */
export const conditionRowsOf = (
  condition: Record<string, string[]> | null,
): ConditionRow[] =>
  Object.entries(condition ?? {}).map(([key, values]) => ({
    key,
    values,
    text: values.join("\n"),
  }));

/**
 * "Shown when" as AD4 takes it: null for none. Sent only once every condition keeps its
 * rules (conditionIssues), so each names its question.
 */
export const conditionOf = (
  version: TemplateVersionDetail,
  rows: readonly ConditionRow[],
): Record<string, string[]> | null =>
  rows.length === 0
    ? null
    : Object.fromEntries(
        rows.map((row) => {
          if (row.key === null)
            throw new Error("A condition names no question");
          return [row.key, conditionValues(version, row)];
        }),
      );

const conditionValueSchema = requiredText(shortText);

/**
 * The issues of "Shown when", at `[row, "key"]` and `[row, "values"]`: each names a
 * question once, in the template's form, and shows on one or more short texts (6.0.8).
 */
export function conditionIssues(
  version: TemplateVersionDetail,
  rows: readonly ConditionRow[],
): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    if (row.key === null) {
      issues.push(custom("required", [index, "key"]));
    } else {
      if (!isQuestionKey(row.key, version.kind)) {
        issues.push(formatIssue([index, "key"]));
      }
      if (seen.has(row.key)) issues.push(custom("unique", [index, "key"]));
      seen.add(row.key);
    }
    const values = conditionValues(version, row);
    // With no answer to show on, the question would never show (6.0.8).
    if (values.length === 0) issues.push(custom("required", [index, "values"]));
    const broken = values.flatMap((value) =>
      schemaIssues(conditionValueSchema, value),
    );
    const [first] = broken;
    if (first !== undefined) issues.push({ ...first, path: [index, "values"] });
  });
  return issues;
}

/** The issues of what a plan's draft copies, at each source's index. */
export const copyFromIssues = (sources: readonly string[]): Issue[] =>
  sources.flatMap((source, index) =>
    schemaIssues(planCopySourceSchema, source).map((issue) => ({
      ...issue,
      path: [index],
    })),
  );

/** The starting cost rows as AD5 takes them, and their issues at `[row, field]`. */
export const costDefaultsIssues = (rows: readonly CostRowValues[]): Issue[] =>
  schemaIssues(templateCostDefaultsSchema, { items: rows }).map((issue) => ({
    ...issue,
    path: issue.path.slice(1),
  }));

/** A starting cost row as 27 edits it. */
export interface CostRowValues {
  category: CostCategory;
  key: string;
  name: string;
}

/** A starting execution row as 27 edits it: area for KPIs, timing for launch rows. */
export interface PresetValues {
  type: ExecutionPreset["type"];
  title: string;
  area: string;
  launchTiming: ExecutionPreset["launchTiming"];
}

/** The starting execution rows as AD5 takes them. */
export const presetsWire = (rows: readonly PresetValues[]) =>
  rows.map((row) => ({
    type: row.type,
    title: row.title,
    ...(row.type === "kpi" ? { area: row.area } : {}),
    ...(row.type === "launch" ? { launchTiming: row.launchTiming } : {}),
  }));

/**
 * The issues of the starting execution rows, at `[row, field]`. A launch row needs its
 * timing, which is chosen, not typed: "Can't be empty" until one is.
 */
export const presetsIssues = (rows: readonly PresetValues[]): Issue[] => [
  ...rows.flatMap((row, index) =>
    row.type === "launch" && row.launchTiming === null
      ? [custom("required", [index, "launchTiming"])]
      : [],
  ),
  ...schemaIssues(templateExecutionPresetsSchema, {
    items: presetsWire(rows),
  })
    .map((issue) => ({ ...issue, path: issue.path.slice(1) }))
    .filter((issue) => issue.path[1] !== "launchTiming"),
];

/** The thresholds as typed: by check, by parameter (design-spec 6.1). */
export type ThresholdValues = Record<string, Record<string, string>>;

const thresholdSchema = numberTextSchema(checkThresholdSchema);

/** The thresholds as AD5 takes them: every rule of the version, the typed ones changed. */
export function thresholdsWire(
  version: TemplateVersionDetail,
  values: ThresholdValues,
) {
  const kept = version.checkRules.filter(
    (rule) =>
      !(THRESHOLD_CHECK_KEYS as readonly string[]).includes(rule.checkKey),
  );
  return [
    ...kept,
    ...THRESHOLD_CHECK_KEYS.map((checkKey) => ({
      checkKey,
      params: Object.fromEntries(
        Object.entries(values[checkKey] ?? {}).map(([param, text]) => [
          param,
          // Sent only once every threshold keeps its rule (thresholdsIssues).
          thresholdSchema.parse(text),
        ]),
      ),
    })),
  ];
}

/** The issues of the thresholds, at `[check, param]`: whole numbers 1–99 (6.0.8). */
export const thresholdsIssues = (values: ThresholdValues): Issue[] =>
  Object.entries(values).flatMap(([checkKey, params]) =>
    Object.entries(params).flatMap(([param, text]) =>
      text.trim() === ""
        ? [custom("required", [checkKey, param])]
        : schemaIssues(thresholdSchema, text).map((issue) => ({
            ...issue,
            path: [checkKey, param],
          })),
    ),
  );

/**
 * The question ID 27 suggests for a new question of `section` (design-spec 6.17): the
 * last one's with its last number one higher, or its start up to the last ".".
 */
export function suggestedQuestionKey(section: Section): string {
  const last = section.questions.at(-1)?.key;
  if (last === undefined) return "";
  const dot = last.lastIndexOf(".");
  const head = last.slice(0, dot + 1);
  const tail = last.slice(dot + 1);
  return /^[0-9]+$/.test(tail) ? `${head}${Number(tail) + 1}` : head;
}
