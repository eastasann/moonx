import data from "./self-analysis.json";
import { question, type SeedTemplate } from "./types";

/** Self Analysis v1, transcribed from `docs/drive-templates/self-analysis.txt` and `initialize-prompt.txt` (design-spec 9.3). */
export const selfAnalysisTemplate: SeedTemplate = {
  kind: "self_analysis",
  name: "Self Analysis",
  versions: [
    {
      versionNumber: 1,
      status: "published",
      aiPrompt: data.aiPrompt,
      sections: data.sections.map((section) => {
        const amounts = section.key === "INCOME";
        return {
          key: section.key,
          part: null,
          title: section.title,
          guidance: section.guidance,
          questions: section.questions.map((q, i) =>
            question({
              key: `SA.${section.key}.${i + 1}`,
              title: `Q${q.n}`,
              prompt: q.prompt,
              example: q.example,
              answerType: amounts ? "amount_with_reason" : "long_text",
            }),
          ),
        };
      }),
      costDefaults: [],
      checkRules: [],
      executionPresets: [],
    },
  ],
};
