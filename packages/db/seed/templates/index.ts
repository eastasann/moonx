import { businessPlanTemplate } from "./business-plan";
import { selfAnalysisTemplate } from "./self-analysis";
import type { SeedTemplate } from "./types";
import { validationTemplate } from "./validation";

export const seedTemplates: SeedTemplate[] = [
  selfAnalysisTemplate,
  validationTemplate,
  businessPlanTemplate,
];

export type * from "./types";
