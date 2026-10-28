import {
  isLinkedMetricKey,
  type MeasureText,
  type PitchSection,
  pitchTemplateOverflows,
  SCENARIO_METRIC_KEYS,
} from "@moonx/domain";
import {
  type AnswerType,
  type ErrorCode,
  type ErrorDetail,
  isQuestionKey,
  issueDetails,
  PLAN_LIST_COLUMNS,
  planReferenceSpecSchema,
  type QuestionOptions,
  questionOptionsSchema,
  TEMPLATE_ANSWER_TYPES,
  type TemplateFile,
  type TemplateKind,
  templateFileSchema,
} from "@moonx/schemas";
import { print } from "@moonx/ui-tokens/print";
import { and, asc, desc, eq, lt } from "drizzle-orm";
import type { PgColumn, PgInsertValue, PgTable } from "drizzle-orm/pg-core";
import type { Database, DatabaseTransaction } from "./client";
import {
  templateCheckRules,
  templateCostDefaults,
  templateExecutionPresets,
  templateQuestions,
  templateSections,
  templates,
  templateVersions,
} from "./schema";

// Importing a template file (AD10), checking a version before it is published and
// publishing it (AD6), as SDD 5.13 specifies them. The operator API and the seed both
// call these, so a template reaches every environment through the same checks.
//
// The check of a plan template sets its Pitch Deck in the PDF's fonts, which only the API
// loads (ADR-012). So the check takes their measure as an argument, which no caller can
// leave out: the seed gets the API's from `make db-seed` (apps/api/scripts/seed.ts).
//
// Locks the operator API must take as well: an edit of a draft (AD3 to AD5) locks the
// version row, as publishing does, so a publish never checks content that changes before
// it commits; making a draft (AD2) locks the template row, as the import does, so two
// drafts of one template take turns instead of failing on a unique index.

// A transaction nests as a savepoint: the seed writes every table in one transaction.
type Executor = Database | DatabaseTransaction;

/** A template operation refused for a reason the API answers with `code` (SDD 8.1). */
export class TemplateError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    /** For VALIDATION_FAILED: where the file breaks the format. */
    readonly details: ErrorDetail[] = [],
  ) {
    super(message);
    this.name = "TemplateError";
  }
}

/**
 * Reads `input` as a template file of `kind`.
 *
 * @throws {TemplateError} VALIDATION_FAILED, with the place of each problem in `details`.
 *   A file of another kind fails on `kind` alone, so 26 can tell it apart from a file it
 *   cannot read (design-spec 6.17).
 */
export function parseTemplateFile(
  kind: TemplateKind,
  input: unknown,
): TemplateFile {
  const fileKind =
    typeof input === "object" && input !== null && "kind" in input
      ? input.kind
      : undefined;
  if (typeof fileKind === "string" && fileKind !== kind) {
    throw new TemplateError(
      "VALIDATION_FAILED",
      `The file is not a ${kind} template`,
      [{ path: "kind", code: "invalid_value", message: `Expected ${kind}` }],
    );
  }
  const parsed = templateFileSchema.safeParse(input);
  if (!parsed.success) {
    throw new TemplateError(
      "VALIDATION_FAILED",
      "The file does not follow the template file format",
      issueDetails(parsed.error.issues),
    );
  }
  return parsed.data;
}

export interface ImportOptions {
  /**
   * Makes the id of each row the import writes, in a fixed order: the template (when it
   * did not exist as the import began; if a concurrent import creates it first, that id
   * goes unused), the version, the sections, the questions, then the cost rows, check
   * rules and execution rows. The seed passes ids derived from names (SDD 6.5).
   */
  newId?: () => string;
}

export interface ImportedTemplateVersion {
  versionId: string;
  kind: TemplateKind;
  versionNumber: number;
}

// postgres.js refuses a statement of 65,534 parameters or more, and a 1 MB file can hold
// thousands of questions of 16 columns each.
const ROWS_PER_INSERT = 1000;

const insertRows = async <T extends PgTable>(
  tx: DatabaseTransaction,
  table: T,
  rows: PgInsertValue<T>[],
) => {
  for (let start = 0; start < rows.length; start += ROWS_PER_INSERT)
    await tx.insert(table).values(rows.slice(start, start + ROWS_PER_INSERT));
};

const lockTemplate = async (tx: DatabaseTransaction, kind: TemplateKind) => {
  const [template] = await tx
    .select({ id: templates.id })
    .from(templates)
    .where(eq(templates.kind, kind))
    .for("update");
  return template;
};

/**
 * Inserts the draft version of `template`, which the caller has locked
 * ({@link lockTemplate}): v1 when the template has no version, else the next number.
 *
 * @throws {TemplateError} DRAFT_EXISTS when the template already has a draft.
 */
const insertDraft = async (
  tx: DatabaseTransaction,
  template: { id: string; kind: TemplateKind },
  draft: { id: string; aiPrompt: string },
) => {
  const versions = await tx
    .select({
      versionNumber: templateVersions.versionNumber,
      status: templateVersions.status,
    })
    .from(templateVersions)
    .where(eq(templateVersions.templateId, template.id));
  if (versions.some((version) => version.status === "draft")) {
    throw new TemplateError(
      "DRAFT_EXISTS",
      `The ${template.kind} template already has a draft`,
    );
  }
  const versionNumber =
    Math.max(0, ...versions.map((version) => version.versionNumber)) + 1;
  await tx.insert(templateVersions).values({
    id: draft.id,
    templateId: template.id,
    versionNumber,
    aiPrompt: draft.aiPrompt,
  });
  return versionNumber;
};

/**
 * Creates the draft version of the `kind` template from a template file (AD10). Creates
 * the template first when there is none, named by the file. The draft is v1 when the
 * template has no version, else the next number; it holds the file's content only.
 *
 * @throws {TemplateError} VALIDATION_FAILED when the file is not a `kind` template file
 *   (`parseTemplateFile`); DRAFT_EXISTS when the template already has a draft.
 */
export async function importTemplateFile(
  db: Executor,
  kind: TemplateKind,
  input: unknown,
  { newId = () => crypto.randomUUID() }: ImportOptions = {},
): Promise<ImportedTemplateVersion> {
  const file = parseTemplateFile(kind, input);
  return db.transaction(async (tx) => {
    // The lock on the template row makes concurrent imports take turns, so the second
    // one sees the first one's draft instead of failing on a unique index.
    let template = await lockTemplate(tx, kind);
    if (template === undefined) {
      await tx
        .insert(templates)
        .values({ id: newId(), kind, name: file.name })
        .onConflictDoNothing({ target: templates.kind });
      template = await lockTemplate(tx, kind);
    }
    if (template === undefined) throw new Error(`No ${kind} template row`);
    const versionId = newId();
    const versionNumber = await insertDraft(
      tx,
      { id: template.id, kind },
      { id: versionId, aiPrompt: file.aiPrompt },
    );

    const sections = file.sections.map((section, index) => ({
      section,
      row: {
        id: newId(),
        templateVersionId: versionId,
        key: section.key,
        part: section.part,
        title: section.title,
        subtitle: section.subtitle,
        guidance: section.guidance,
        sortOrder: index,
      },
    }));
    const questions = sections.flatMap(({ section, row }) =>
      section.questions.map((question, index) => ({
        id: newId(),
        templateVersionId: versionId,
        templateSectionId: row.id,
        questionKey: question.key,
        title: question.title,
        prompt: question.prompt,
        example: question.example,
        hint: question.hint,
        answerType: question.answerType,
        options: question.options,
        displayCondition: question.displayCondition,
        hasFau: question.hasFau,
        copyFrom: question.copyFrom,
        reference: question.reference,
        sortOrder: index,
      })),
    );
    const costDefaults = file.costDefaults.map((row, index) => ({
      id: newId(),
      templateVersionId: versionId,
      category: row.category,
      key: row.key,
      name: row.name,
      sortOrder: index,
    }));
    const checkRules = file.checkRules.map((rule) => ({
      id: newId(),
      templateVersionId: versionId,
      checkKey: rule.checkKey,
      params: rule.params,
    }));
    const presets = file.executionPresets.map((preset, index) => ({
      id: newId(),
      templateVersionId: versionId,
      type: preset.type,
      title: preset.title,
      area: preset.area,
      launchTiming: preset.launchTiming,
      sortOrder: index,
    }));
    await insertRows(
      tx,
      templateSections,
      sections.map(({ row }) => row),
    );
    await insertRows(tx, templateQuestions, questions);
    await insertRows(tx, templateCostDefaults, costDefaults);
    await insertRows(tx, templateCheckRules, checkRules);
    await insertRows(tx, templateExecutionPresets, presets);

    return { versionId, kind, versionNumber };
  });
}

/** The codes of the problems that block publishing (SDD 5.13 AD6). */
export type TemplateProblemCode =
  | "no_questions"
  | "invalid_part"
  | "invalid_question_key"
  | "question_key_section_mismatch"
  | "duplicate_question_key"
  | "answer_type_mismatch"
  | "options_mismatch"
  | "unknown_condition_key"
  | "copy_from_mismatch"
  | "unknown_metric_key"
  | "pitch_deck_overflow";

/** The AD6 validate response. */
export interface TemplateCheck {
  errors: {
    code: TemplateProblemCode;
    message: string;
    /** The section or question 27 moves to; null for the version as a whole. */
    nodeId: string | null;
  }[];
  /** Question IDs the previous version had and this one drops. Does not block. */
  warnings: { code: "removed_keys"; keys: string[] }[];
}

/** What `checkTemplateContent` reads of a stored version. */
export interface TemplateContent {
  kind: TemplateKind;
  sections: {
    id: string;
    key: string;
    part: "a" | "b" | null;
    questions: {
      id: string;
      questionKey: string;
      /** The name a Pitch Deck bullet shows it by. */
      title: string;
      answerType: AnswerType;
      options: unknown;
      displayCondition: unknown;
      /** Plans only: what the draft copies (SDD 6.3 `copy_from`). */
      copyFrom?: unknown;
      /** Plans only: what the sub-item shows beside it (SDD 6.3 `reference`). */
      reference?: unknown;
    }[];
  }[];
  /** The question IDs of the version before it; null when it is the first. */
  previousQuestionKeys: readonly string[] | null;
  /**
   * Plans only: the template keys of the starting cost rows of published validation
   * templates, which a number sub-item's `cost_row:*` may name.
   */
  costRowKeys?: ReadonlySet<string>;
}

const optionsKindOf: Record<AnswerType, QuestionOptions["kind"] | null> = {
  long_text: null,
  short_text: null,
  amount_with_reason: null,
  choice: "choice",
  table: "table",
  linked_metric: "linked_metric",
  execution_view: "execution_view",
};

const optionsFit = (answerType: AnswerType, options: unknown) => {
  const kind = optionsKindOf[answerType];
  if (kind === null) return options === null;
  const parsed = questionOptionsSchema.safeParse(options);
  if (!parsed.success || parsed.data.kind !== kind) return false;
  switch (parsed.data.kind) {
    case "choice":
      return parsed.data.choices.length > 0;
    case "table":
      return parsed.data.columns.length > 0;
    case "linked_metric":
      return parsed.data.metricKeys.length > 0;
    case "execution_view":
      return true;
  }
};

/**
 * Whether a plan sub-item can hold what its `copy_from` copies (SDD 6.3): texts go to a
 * long or short text, and `LIST.ASSUMPTIONS` or `LIST.RISKS`, alone, to a table with
 * the columns the draft fills.
 */
const copyFromFits = (
  answerType: AnswerType,
  options: unknown,
  copyFrom: unknown,
) => {
  if (copyFrom == null) return true;
  if (!Array.isArray(copyFrom) || copyFrom.length === 0) return false;
  const list = copyFrom.find(
    (source): source is keyof typeof PLAN_LIST_COLUMNS =>
      typeof source === "string" && source in PLAN_LIST_COLUMNS,
  );
  if (list === undefined)
    return answerType === "long_text" || answerType === "short_text";
  const parsed = questionOptionsSchema.safeParse(options);
  if (copyFrom.length !== 1 || !parsed.success) return false;
  if (parsed.data.kind !== "table") return false;
  const columns = new Set(parsed.data.columns.map((column) => column.key));
  return PLAN_LIST_COLUMNS[list].every((key) => columns.has(key));
};

const conditionKeys = (condition: unknown) =>
  typeof condition === "object" && condition !== null
    ? Object.keys(condition)
    : [];

const DECK_NAMES = { one: "one-minute", five: "five-minute" } as const;

/**
 * The slides of a plan template's decks that the most material runs past the bottom of
 * (`pitch_deck_overflow`, design-spec 6.14), each at the section its Edit source goes to.
 */
const pitchDeckErrors = (
  content: TemplateContent,
  measure: MeasureText,
): TemplateCheck["errors"] => {
  const sections: PitchSection[] = content.sections.map((section) => ({
    key: section.key,
    questions: section.questions.map((question) => ({
      key: question.questionKey,
      title: question.title,
      answerType: question.answerType,
    })),
  }));
  return pitchTemplateOverflows(sections, { print, measure }).map(
    (overflow) => ({
      code: "pitch_deck_overflow",
      message: `The ${overflow.slide} slide of the ${DECK_NAMES[overflow.variant]} deck runs past the bottom of its body with the most material`,
      // Plan items are numbered by their section keys, as 21 opens them.
      nodeId:
        content.sections.find(
          (section) => Number(section.key) === overflow.itemNo,
        )?.id ?? null,
    }),
  );
};

/** The keys of the key numbers a sub-item's references list (SDD 6.3 `metrics`). */
const referencedMetricKeysOf = (reference: unknown): string[] => {
  const parsed = planReferenceSpecSchema.array().safeParse(reference);
  return parsed.success
    ? parsed.data.flatMap((spec) => (spec.kind === "metrics" ? spec.keys : []))
    : [];
};

/** The keys a number sub-item names; none for options of any other kind. */
const linkedMetricKeysOf = (options: unknown): string[] => {
  const parsed = questionOptionsSchema.safeParse(options);
  return parsed.success && parsed.data.kind === "linked_metric"
    ? parsed.data.metricKeys
    : [];
};

/**
 * The starting cost rows of the published validation templates (design-spec 6.4
 * `cost_row:*`): each key once, by the name of the newest version that has it, in that
 * version's order, newer versions first.
 */
export async function loadPublishedCostRows(
  db: Executor,
): Promise<{ key: string; name: string }[]> {
  const rows = await db
    .select({ key: templateCostDefaults.key, name: templateCostDefaults.name })
    .from(templateCostDefaults)
    .innerJoin(
      templateVersions,
      eq(templateVersions.id, templateCostDefaults.templateVersionId),
    )
    .innerJoin(templates, eq(templates.id, templateVersions.templateId))
    .where(
      and(
        eq(templates.kind, "validation"),
        eq(templateVersions.status, "published"),
      ),
    )
    .orderBy(
      desc(templateVersions.versionNumber),
      asc(templateCostDefaults.sortOrder),
      asc(templateCostDefaults.id),
    );
  const seen = new Set<string>();
  return rows.filter(({ key }) => {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The checks of AD6 validate on a version's content (SDD 5.13).
 *
 * @param measure The width of a text in the PDF's fonts, to set a plan template's Pitch
 *   Deck as the PDF does.
 */
export function checkTemplateContent(
  content: TemplateContent,
  measure: MeasureText,
): TemplateCheck {
  const errors: TemplateCheck["errors"] = [];
  const questions = content.sections.flatMap((section) =>
    section.questions.map((question) => ({ section, question })),
  );
  if (questions.length === 0)
    errors.push({
      code: "no_questions",
      message: "The template has no questions",
      nodeId: null,
    });

  const needsPart = content.kind === "business_plan";
  for (const section of content.sections) {
    if (needsPart !== (section.part !== null))
      errors.push({
        code: "invalid_part",
        message: needsPart
          ? `Section ${section.key} needs part a or b`
          : `Section ${section.key} must not have a part`,
        nodeId: section.id,
      });
  }

  const keys = new Set(questions.map(({ question }) => question.questionKey));
  const seen = new Set<string>();
  for (const { section, question } of questions) {
    const key = question.questionKey;
    if (!isQuestionKey(key, content.kind)) {
      errors.push({
        code: "invalid_question_key",
        message: `${key} is not a question ID of this template`,
        nodeId: question.id,
      });
    } else if (key.split(".")[1] !== section.key) {
      errors.push({
        code: "question_key_section_mismatch",
        message: `${key} is not a question ID of section ${section.key}`,
        nodeId: question.id,
      });
    }
    if (seen.has(key))
      errors.push({
        code: "duplicate_question_key",
        message: `${key} appears more than once`,
        nodeId: question.id,
      });
    seen.add(key);
    if (!TEMPLATE_ANSWER_TYPES[content.kind].includes(question.answerType))
      errors.push({
        code: "answer_type_mismatch",
        message: `${key} is ${question.answerType}, which answers of this template cannot hold`,
        nodeId: question.id,
      });
    if (!optionsFit(question.answerType, question.options))
      errors.push({
        code: "options_mismatch",
        message: `The options of ${key} do not fit ${question.answerType}`,
        nodeId: question.id,
      });
    if (
      content.kind === "business_plan" &&
      !copyFromFits(question.answerType, question.options, question.copyFrom)
    )
      errors.push({
        code: "copy_from_mismatch",
        message: `${key} cannot hold what it copies from the validation`,
        nodeId: question.id,
      });
    if (content.kind === "business_plan") {
      const costRowKeys = content.costRowKeys ?? new Set<string>();
      for (const metricKey of linkedMetricKeysOf(question.options)) {
        if (!isLinkedMetricKey(metricKey, costRowKeys))
          errors.push({
            code: "unknown_metric_key",
            message: `${key} shows ${metricKey}, which is not a key number a prompt can show`,
            nodeId: question.id,
          });
      }
      // A reference lists single values, never a scenario's column (P4 `metrics`).
      for (const metricKey of referencedMetricKeysOf(question.reference)) {
        if (
          !isLinkedMetricKey(metricKey, costRowKeys) ||
          (SCENARIO_METRIC_KEYS as readonly string[]).includes(metricKey)
        )
          errors.push({
            code: "unknown_metric_key",
            message: `${key} refers to ${metricKey}, which is not a key number a reference can show`,
            nodeId: question.id,
          });
      }
    }
    for (const conditionKey of conditionKeys(question.displayCondition)) {
      if (!keys.has(conditionKey))
        errors.push({
          code: "unknown_condition_key",
          message: `${key} shows on ${conditionKey}, which is not in the template`,
          nodeId: question.id,
        });
    }
  }

  if (content.kind === "business_plan")
    errors.push(...pitchDeckErrors(content, measure));

  const removed = (content.previousQuestionKeys ?? []).filter(
    (key) => !keys.has(key),
  );
  return {
    errors,
    warnings:
      removed.length > 0 ? [{ code: "removed_keys", keys: removed }] : [],
  };
}

// Any other id names no version, and querying the uuid column with it would fail in the
// database instead.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const loadVersion = async (
  db: Executor,
  versionId: string,
  { lock = false } = {},
) => {
  if (!UUID_PATTERN.test(versionId))
    throw new TemplateError("NOT_FOUND", `No template version ${versionId}`);
  const query = db
    .select({
      id: templateVersions.id,
      templateId: templateVersions.templateId,
      versionNumber: templateVersions.versionNumber,
      status: templateVersions.status,
      kind: templates.kind,
    })
    .from(templateVersions)
    .innerJoin(templates, eq(templates.id, templateVersions.templateId))
    .where(eq(templateVersions.id, versionId));
  const [version] = await (lock
    ? query.for("update", { of: templateVersions })
    : query);
  if (version === undefined)
    throw new TemplateError("NOT_FOUND", `No template version ${versionId}`);
  return version;
};

/** A version's question IDs in the order 27 shows them. */
const questionKeysOf = async (db: Executor, versionId: string) =>
  (
    await db
      .select({ key: templateQuestions.questionKey })
      .from(templateQuestions)
      .innerJoin(
        templateSections,
        eq(templateSections.id, templateQuestions.templateSectionId),
      )
      .where(eq(templateQuestions.templateVersionId, versionId))
      .orderBy(
        asc(templateSections.sortOrder),
        asc(templateQuestions.sortOrder),
      )
  ).map((row) => row.key);

const checkStoredVersion = async (
  db: Executor,
  versionId: string,
  version: Awaited<ReturnType<typeof loadVersion>>,
  measure: MeasureText,
) => {
  const sections = await db
    .select({
      id: templateSections.id,
      key: templateSections.key,
      part: templateSections.part,
    })
    .from(templateSections)
    .where(eq(templateSections.templateVersionId, versionId))
    .orderBy(asc(templateSections.sortOrder));
  const questions = await db
    .select({
      id: templateQuestions.id,
      sectionId: templateQuestions.templateSectionId,
      questionKey: templateQuestions.questionKey,
      title: templateQuestions.title,
      answerType: templateQuestions.answerType,
      options: templateQuestions.options,
      displayCondition: templateQuestions.displayCondition,
      copyFrom: templateQuestions.copyFrom,
      reference: templateQuestions.reference,
    })
    .from(templateQuestions)
    .where(eq(templateQuestions.templateVersionId, versionId))
    .orderBy(asc(templateQuestions.sortOrder));
  const [previous] = await db
    .select({ id: templateVersions.id })
    .from(templateVersions)
    .where(
      and(
        eq(templateVersions.templateId, version.templateId),
        lt(templateVersions.versionNumber, version.versionNumber),
      ),
    )
    .orderBy(desc(templateVersions.versionNumber))
    .limit(1);
  return checkTemplateContent(
    {
      kind: version.kind,
      sections: sections.map((section) => ({
        ...section,
        questions: questions.filter(
          (question) => question.sectionId === section.id,
        ),
      })),
      previousQuestionKeys:
        previous === undefined ? null : await questionKeysOf(db, previous.id),
      costRowKeys:
        version.kind === "business_plan"
          ? new Set((await loadPublishedCostRows(db)).map(({ key }) => key))
          : undefined,
    },
    measure,
  );
};

/**
 * Checks a version before it is published (AD6 validate). Writes nothing, so it also runs
 * on a published version.
 *
 * @param measure As {@link checkTemplateContent} takes it.
 * @throws {TemplateError} NOT_FOUND when there is no such version.
 */
export async function validateTemplateVersion(
  db: Executor,
  versionId: string,
  measure: MeasureText,
): Promise<TemplateCheck> {
  return checkStoredVersion(
    db,
    versionId,
    await loadVersion(db, versionId),
    measure,
  );
}

/**
 * Publishes a draft (AD6 publish). Existing answers keep the version they were made with
 * (design-spec 6.0.7).
 *
 * @param publishedById The operator who publishes; null when no user does (the seed).
 * @param measure As {@link checkTemplateContent} takes it.
 * @throws {TemplateError} NOT_FOUND when there is no such version; PUBLISHED_READ_ONLY
 *   when it is already published; TEMPLATE_INVALID when AD6 validate finds errors.
 */
export async function publishTemplateVersion(
  db: Executor,
  versionId: string,
  publishedById: string | null,
  measure: MeasureText,
): Promise<{ versionNumber: number; publishedAt: Date }> {
  return db.transaction(async (tx) => {
    // Locked so a concurrent publish of the same draft waits, then sees it published.
    const version = await loadVersion(tx, versionId, { lock: true });
    if (version.status === "published")
      throw new TemplateError(
        "PUBLISHED_READ_ONLY",
        `Template version ${versionId} is already published`,
      );
    const check = await checkStoredVersion(tx, versionId, version, measure);
    if (check.errors.length > 0)
      throw new TemplateError(
        "TEMPLATE_INVALID",
        `Template version ${versionId} has errors: ${[
          ...new Set(check.errors.map((error) => error.code)),
        ].join(", ")}`,
      );
    const [published] = await tx
      .update(templateVersions)
      .set({ status: "published", publishedAt: new Date(), publishedById })
      .where(eq(templateVersions.id, versionId))
      .returning({
        versionNumber: templateVersions.versionNumber,
        publishedAt: templateVersions.publishedAt,
      });
    if (published?.publishedAt == null)
      throw new Error(`Template version ${versionId} was not published`);
    return {
      versionNumber: published.versionNumber,
      publishedAt: published.publishedAt,
    };
  });
}

/**
 * Creates the draft of a template as a copy of its version `versionId` (AD2): the AI
 * prompt, the sections and questions, and the cost rows, check rules and execution rows,
 * each with a new id. The draft takes the next version number, as an import does.
 *
 * @throws {TemplateError} NOT_FOUND when there is no such version; DRAFT_EXISTS when the
 *   template already has a draft.
 */
export async function copyTemplateVersion(
  db: Executor,
  versionId: string,
  { newId = () => crypto.randomUUID() }: ImportOptions = {},
): Promise<ImportedTemplateVersion> {
  return db.transaction(async (tx) => {
    const source = await loadVersion(tx, versionId);
    const template = await lockTemplate(tx, source.kind);
    if (template === undefined) throw new Error(`No ${source.kind} template`);
    const [content] = await tx
      .select({ aiPrompt: templateVersions.aiPrompt })
      .from(templateVersions)
      .where(eq(templateVersions.id, versionId));
    if (content === undefined) throw new Error(`No version ${versionId}`);
    const draftId = newId();
    const versionNumber = await insertDraft(
      tx,
      { id: template.id, kind: source.kind },
      { id: draftId, aiPrompt: content.aiPrompt },
    );

    const ofSource = <T extends { templateVersionId: PgColumn }>(table: T) =>
      eq(table.templateVersionId, versionId);
    const sections = await tx
      .select()
      .from(templateSections)
      .where(ofSource(templateSections))
      .orderBy(asc(templateSections.sortOrder), asc(templateSections.id));
    const sectionIds = new Map(
      sections.map((section) => [section.id, newId()]),
    );
    const questions = await tx
      .select()
      .from(templateQuestions)
      .where(ofSource(templateQuestions))
      .orderBy(asc(templateQuestions.sortOrder), asc(templateQuestions.id));
    const costDefaults = await tx
      .select()
      .from(templateCostDefaults)
      .where(ofSource(templateCostDefaults))
      .orderBy(
        asc(templateCostDefaults.sortOrder),
        asc(templateCostDefaults.id),
      );
    const checkRules = await tx
      .select()
      .from(templateCheckRules)
      .where(ofSource(templateCheckRules))
      .orderBy(asc(templateCheckRules.checkKey));
    const presets = await tx
      .select()
      .from(templateExecutionPresets)
      .where(ofSource(templateExecutionPresets))
      .orderBy(
        asc(templateExecutionPresets.sortOrder),
        asc(templateExecutionPresets.id),
      );

    const fresh = { templateVersionId: draftId };
    await insertRows(
      tx,
      templateSections,
      sections.map(({ createdAt, updatedAt, ...section }) => ({
        ...section,
        ...fresh,
        id: sectionIds.get(section.id) as string,
      })),
    );
    await insertRows(
      tx,
      templateQuestions,
      questions.map(({ createdAt, updatedAt, ...question }) => ({
        ...question,
        ...fresh,
        id: newId(),
        templateSectionId: sectionIds.get(question.templateSectionId) as string,
      })),
    );
    await insertRows(
      tx,
      templateCostDefaults,
      costDefaults.map(({ createdAt, updatedAt, ...row }) => ({
        ...row,
        ...fresh,
        id: newId(),
      })),
    );
    await insertRows(
      tx,
      templateCheckRules,
      checkRules.map(({ createdAt, updatedAt, ...rule }) => ({
        ...rule,
        ...fresh,
        id: newId(),
      })),
    );
    await insertRows(
      tx,
      templateExecutionPresets,
      presets.map(({ createdAt, updatedAt, ...preset }) => ({
        ...preset,
        ...fresh,
        id: newId(),
      })),
    );
    return { versionId: draftId, kind: source.kind, versionNumber };
  });
}

/**
 * Locks the draft `versionId` for an edit of its content (AD3 PATCH, AD4, AD5) until the
 * transaction ends, as publishing locks it: a publish never checks content that changes
 * before it commits, and no edit lands on a version once it is published.
 *
 * @throws {TemplateError} NOT_FOUND when there is no such version; PUBLISHED_READ_ONLY
 *   when it is published.
 */
export async function lockTemplateDraft(
  tx: DatabaseTransaction,
  versionId: string,
): Promise<{
  /** As stored: lowercase, whatever case `versionId` was written in. */
  id: string;
  templateId: string;
  kind: TemplateKind;
}> {
  const version = await loadVersion(tx, versionId, { lock: true });
  if (version.status === "published") {
    throw new TemplateError(
      "PUBLISHED_READ_ONLY",
      `Template version ${versionId} is published and cannot change`,
    );
  }
  return { id: version.id, templateId: version.templateId, kind: version.kind };
}
