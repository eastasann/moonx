import type {
  Classification,
  TemplateQuestion,
  TemplateSection,
  ValidationAnswer,
} from "@moonx/schemas";

export const IDEA_ID = "55555555-5555-4555-8555-555555555555";
export const VALIDATION_ID = "66666666-6666-4666-8666-666666666666";

export const idea = {
  id: IDEA_ID,
  name: "Piaya Gift Box Delivery",
  workspaceId: "11111111-1111-4111-8111-111111111111",
  validationId: VALIDATION_ID,
  archived: false,
};

export const emptyClassification = (): Classification => ({
  fau: null,
  confidence: null,
  state: "empty",
  evidence: [],
});

export function question(
  key: string,
  title: string,
  overrides: Partial<TemplateQuestion> = {},
): TemplateQuestion {
  return {
    key: `V.01.${key}`,
    sectionKey: "01",
    title,
    prompt: `Prompt of ${title}`,
    example: null,
    hint: null,
    answerType: "long_text",
    options: null,
    displayCondition: null,
    hasFau: true,
    ...overrides,
  };
}

export function answer(
  questionKey: string,
  overrides: Partial<ValidationAnswer> = {},
): ValidationAnswer {
  return {
    questionKey,
    text: null,
    classification: emptyClassification(),
    hidden: false,
    commentCount: 0,
    lockVersion: 0,
    updatedAt: null,
    updatedBy: null,
    ...overrides,
  };
}

export const section01: TemplateSection = {
  key: "01",
  part: null,
  title: "Customer & Problem",
  guidance: "Be specific about who pays.",
  questions: [
    question("WHO", "WHO"),
    question("WHY_THEM", "WHY THEM"),
    question("BEHAVIOR", "BEHAVIOR", {
      example: "They buy boxed piaya at the airport.",
      hint: "Think of today's habit.",
    }),
  ],
};

export const answers01 = (): ValidationAnswer[] => [
  answer("V.01.WHO", {
    text: "Office workers in Bacolod",
    lockVersion: 2,
    classification: { fau: "assumption", confidence: "medium", state: "assumption", evidence: [] },
  }),
  answer("V.01.WHY_THEM", { text: "They travel often", lockVersion: 1 }),
  answer("V.01.BEHAVIOR"),
];

const ocean = (key: string, overrides: Partial<TemplateQuestion>): TemplateQuestion => ({
  ...question(key, key, { sectionKey: "02" }),
  key: `V.02.${key}`,
  ...overrides,
});

export const section02: TemplateSection = {
  key: "02",
  part: null,
  title: "Market",
  guidance: null,
  questions: [
    ocean("CATEGORY", { answerType: "short_text" }),
    ocean("OCEAN", {
      answerType: "choice",
      options: { kind: "choice", choices: ["Red", "Blue", "Mixed"] },
    }),
    ocean("RED_1", { displayCondition: { "V.02.OCEAN": ["Red", "Mixed"] } }),
    ocean("BLUE_1", { displayCondition: { "V.02.OCEAN": ["Blue", "Mixed"] } }),
  ],
};

export const answers02 = (oceanText: string | null = null): ValidationAnswer[] => {
  const red = oceanText === "Red" || oceanText === "Mixed";
  const blue = oceanText === "Blue" || oceanText === "Mixed";
  return [
    answer("V.02.CATEGORY"),
    answer("V.02.OCEAN", { text: oceanText, lockVersion: oceanText ? 1 : 0 }),
    answer("V.02.RED_1", { hidden: !red }),
    answer("V.02.BLUE_1", { hidden: !blue }),
  ];
};
