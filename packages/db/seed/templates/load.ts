import { uid } from "../lib/ids";
import type { World } from "../lib/rows";
import type { Clock } from "../lib/time";
import { seedTemplates } from "./index";
import type { SeedTemplate } from "./types";

type Kind = SeedTemplate["kind"];

export const templateVersionId = (kind: Kind, versionNumber: number) =>
  uid("template-version", kind, String(versionNumber));

/** Template v1 (all three), validation v2 and the v3 draft (design-spec 8.4). */
export function addTemplates(world: World, clock: Clock, publishedById: string) {
  for (const template of seedTemplates) {
    const templateId = uid("template", template.kind);
    world.templates.push({ id: templateId, kind: template.kind, name: template.name });

    for (const version of template.versions) {
      const versionId = templateVersionId(template.kind, version.versionNumber);
      const published = version.status === "published";
      const publishedAt = published ? clock.ago(version.versionNumber === 1 ? 118 : 60) : null;
      world.templateVersions.push({
        id: versionId,
        templateId,
        versionNumber: version.versionNumber,
        status: version.status,
        aiPrompt: version.aiPrompt,
        publishedAt,
        publishedById: published ? publishedById : null,
      });

      let sectionOrder = 0;
      for (const section of version.sections) {
        const sectionId = uid(
          "template-section",
          template.kind,
          String(version.versionNumber),
          section.key,
        );
        world.templateSections.push({
          id: sectionId,
          templateVersionId: versionId,
          key: section.key,
          part: section.part,
          title: section.title,
          guidance: section.guidance,
          sortOrder: sectionOrder++,
        });
        section.questions.forEach((q, index) => {
          world.templateQuestions.push({
            id: uid("template-question", template.kind, String(version.versionNumber), q.key),
            templateVersionId: versionId,
            templateSectionId: sectionId,
            questionKey: q.key,
            title: q.title,
            prompt: q.prompt,
            example: q.example,
            hint: q.hint,
            answerType: q.answerType,
            options: q.options,
            displayCondition: q.displayCondition,
            hasFau: q.hasFau,
            copyFrom: q.copyFrom,
            reference: q.reference,
            sortOrder: index,
          });
        });
      }

      version.costDefaults.forEach((row, index) => {
        world.templateCostDefaults.push({
          id: uid("template-cost-default", template.kind, String(version.versionNumber), row.key),
          templateVersionId: versionId,
          category: row.category,
          key: row.key,
          name: row.name,
          sortOrder: index,
        });
      });
      for (const rule of version.checkRules) {
        world.templateCheckRules.push({
          id: uid(
            "template-check-rule",
            template.kind,
            String(version.versionNumber),
            rule.checkKey,
          ),
          templateVersionId: versionId,
          checkKey: rule.checkKey,
          params: rule.params,
        });
      }
      version.executionPresets.forEach((preset, index) => {
        world.templateExecutionPresets.push({
          id: uid(
            "template-execution-preset",
            template.kind,
            String(version.versionNumber),
            String(index),
          ),
          templateVersionId: versionId,
          type: preset.type,
          title: preset.title,
          area: preset.area,
          launchTiming: preset.launchTiming,
          sortOrder: index,
        });
      });
    }
  }
}
