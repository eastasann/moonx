import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { MeasureText } from "@moonx/domain";
import type { TemplateFile, TemplateKind } from "@moonx/schemas";
import { eq } from "drizzle-orm";
import type { DatabaseTransaction } from "../client";
import {
  templateCheckRules,
  templateCostDefaults,
  templateExecutionPresets,
  templateQuestions,
  templateSections,
  templates,
  templateVersions,
} from "../schema";
import { importTemplateFile, publishTemplateVersion } from "../templates";
import type { SeedClock } from "./clock";
import { seedIdSequence } from "./ids";

const BCDX_DIR = join(import.meta.dir, "../../../../data/templates/bcdx");

const BCDX_FILES: Record<TemplateKind, string> = {
  self_analysis: "self-analysis.json",
  validation: "validation.json",
  business_plan: "plan.json",
};

/** A BCDX file as raw JSON: the import checks it, as it checks an uploaded file (26). */
const readBcdxFile = (kind: TemplateKind): TemplateFile =>
  JSON.parse(readFileSync(join(BCDX_DIR, BCDX_FILES[kind]), "utf8"));

type TemplateQuestionFile =
  TemplateFile["sections"][number]["questions"][number];

/**
 * The questions validation v2 and v3 add (design-spec 8.4). Not from the original and not
 * in the BCDX file: they exist only so that 27 and M8 have a newer version to show.
 */
const longTextQuestion = (
  key: string,
  title: string,
  prompt: string,
): TemplateQuestionFile => ({
  key,
  title,
  prompt,
  example: null,
  hint: null,
  answerType: "long_text",
  options: null,
  displayCondition: null,
  hasFau: true,
  copyFrom: null,
  reference: null,
});
const V2_ADDED_QUESTION = longTextQuestion(
  "V.01.REACH",
  "REACH",
  "How will you reach this customer?",
);
const V3_ADDED_QUESTION = longTextQuestion(
  "V.10.NEXT_STEP",
  "Next step",
  "What is the next step to reduce the biggest unknown?",
);

/** `file` with `question` appended to the end of section `sectionKey`. */
const withQuestion = (
  file: TemplateFile,
  sectionKey: string,
  question: TemplateQuestionFile,
): TemplateFile => ({
  ...file,
  sections: file.sections.map((section) =>
    section.key === sectionKey
      ? { ...section, questions: [...section.questions, question] }
      : section,
  ),
});

/** The version ids the rest of the seed pins its self-analyses, validations and plans to. */
export interface SeededTemplates {
  selfAnalysis: string;
  validation: { v1: string; v2: string; v3: string };
  plan: string;
}

/** When each version was made and published, in days before the run. */
const VERSION_DAYS = {
  v1: { created: 112, published: 110 },
  validationV2: { created: 5, published: 4 },
  validationV3: { created: 1 },
} as const;

/**
 * Imports and publishes the three BCDX files as v1 with the same functions as 26 (AD10,
 * AD6), then validation v2 (published) and v3 (draft) per design-spec 8.4. The import and
 * publish stamp the real time; the versions are then dated relative to the run, so that
 * Mobile Bike Repair, made a few days ago, is the only validation made on v2.
 */
export async function seedTemplates(
  tx: DatabaseTransaction,
  clock: SeedClock,
  measure: MeasureText,
): Promise<SeededTemplates> {
  const importVersion = async (
    kind: TemplateKind,
    label: string,
    file: TemplateFile,
  ) =>
    (
      await importTemplateFile(tx, kind, file, {
        newId: seedIdSequence("template", kind, label),
      })
    ).versionId;
  const date = async (
    versionId: string,
    days: { created: number; published?: number },
  ) => {
    const createdAt = clock.ago(days.created);
    await tx
      .update(templateVersions)
      .set({
        createdAt,
        updatedAt: createdAt,
        ...(days.published === undefined
          ? {}
          : { publishedAt: clock.ago(days.published) }),
      })
      .where(eq(templateVersions.id, versionId));
    for (const table of [
      templateSections,
      templateQuestions,
      templateCostDefaults,
      templateCheckRules,
      templateExecutionPresets,
    ])
      await tx
        .update(table)
        .set({ createdAt, updatedAt: createdAt })
        .where(eq(table.templateVersionId, versionId));
  };

  const v1 = {} as Record<TemplateKind, string>;
  for (const kind of [
    "self_analysis",
    "validation",
    "business_plan",
  ] as const) {
    v1[kind] = await importVersion(kind, "v1", readBcdxFile(kind));
    await publishTemplateVersion(tx, v1[kind], null, measure);
    await date(v1[kind], VERSION_DAYS.v1);
  }
  const templatesCreatedAt = clock.ago(VERSION_DAYS.v1.created);
  await tx
    .update(templates)
    .set({ createdAt: templatesCreatedAt, updatedAt: templatesCreatedAt });

  const v2File = withQuestion(
    readBcdxFile("validation"),
    "01",
    V2_ADDED_QUESTION,
  );
  const v2 = await importVersion("validation", "v2", v2File);
  await publishTemplateVersion(tx, v2, null, measure);
  await date(v2, VERSION_DAYS.validationV2);

  const v3 = await importVersion(
    "validation",
    "v3",
    withQuestion(v2File, "10", V3_ADDED_QUESTION),
  );
  await date(v3, VERSION_DAYS.validationV3);

  return {
    selfAnalysis: v1.self_analysis,
    validation: { v1: v1.validation, v2, v3 },
    plan: v1.business_plan,
  };
}
