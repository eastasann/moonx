import type { TemplateVersionDetail } from "@moonx/schemas";
import { ADMIN_ME } from "./support-admin";

export const V_SELF = "bbbbbbbb-0000-4000-8000-000000000001";
export const V_VAL_1 = "bbbbbbbb-0000-4000-8000-000000000011";
export const V_VAL_2 = "bbbbbbbb-0000-4000-8000-000000000012";
export const V_VAL_3 = "bbbbbbbb-0000-4000-8000-000000000013";
export const V_NEW = "bbbbbbbb-0000-4000-8000-000000000099";

const admin = { id: ADMIN_ME.id, displayName: "Moonx Admin", avatarUrl: null, badge: null };

export const TEMPLATES = {
  items: [
    {
      kind: "self_analysis",
      name: "Self Analysis",
      versions: [
        {
          id: V_SELF,
          versionNumber: 1,
          status: "published",
          publishedAt: "2026-03-01T00:00:00.000Z",
          publishedBy: admin,
          usageCount: 3,
        },
      ],
    },
    {
      kind: "validation",
      name: "Validation",
      versions: [
        {
          id: V_VAL_1,
          versionNumber: 1,
          status: "published",
          publishedAt: "2026-03-01T00:00:00.000Z",
          publishedBy: admin,
          usageCount: 4,
        },
        {
          id: V_VAL_2,
          versionNumber: 2,
          status: "published",
          publishedAt: "2026-06-01T00:00:00.000Z",
          publishedBy: admin,
          usageCount: 1,
        },
        {
          id: V_VAL_3,
          versionNumber: 3,
          status: "draft",
          publishedAt: null,
          publishedBy: null,
          usageCount: 0,
        },
      ],
    },
    { kind: "business_plan", name: "Business Plan", versions: [] },
  ],
};

export const Q_WHO = "cccccccc-0000-4000-8000-000000000001";
export const Q_OCEAN = "cccccccc-0000-4000-8000-000000000002";
export const Q_NEXT = "cccccccc-0000-4000-8000-000000000003";
export const S_01 = "dddddddd-0000-4000-8000-000000000001";
export const S_10 = "dddddddd-0000-4000-8000-000000000002";

const question = (
  id: string,
  key: string,
  sectionKey: string,
  overrides: Partial<TemplateVersionDetail["sections"][number]["questions"][number]> = {},
): TemplateVersionDetail["sections"][number]["questions"][number] => ({
  id,
  key,
  sectionKey,
  title: key.split(".")[2] ?? key,
  prompt: `Prompt of ${key}`,
  example: null,
  hint: null,
  answerType: "long_text",
  options: null,
  displayCondition: null,
  hasFau: true,
  sortOrder: 0,
  copyFrom: null,
  reference: null,
  ...overrides,
});

export const makeDetail = (
  overrides: Partial<TemplateVersionDetail> = {},
): TemplateVersionDetail => ({
  id: V_VAL_3,
  kind: "validation",
  versionNumber: 3,
  status: "draft",
  aiPrompt: "",
  sections: [
    {
      id: S_01,
      key: "01",
      part: null,
      title: "Customer & Problem",
      guidance: "Who is it for?",
      sortOrder: 0,
      questions: [
        question(Q_WHO, "V.01.WHO", "01", { title: "WHO" }),
        question(Q_OCEAN, "V.01.OCEAN", "01", {
          title: "OCEAN",
          answerType: "choice",
          options: { kind: "choice", choices: ["Red", "Blue", "Mixed"] },
        }),
      ],
    },
    {
      id: S_10,
      key: "10",
      part: null,
      title: "Final Assessment",
      guidance: null,
      sortOrder: 1,
      questions: [question(Q_NEXT, "V.10.NEXT_STEP", "10", { title: "NEXT STEP" })],
    },
  ],
  costDefaults: [
    {
      id: "ee000000-0000-4000-8000-000000000001",
      category: "initial",
      key: "initial.permits",
      name: "Permits",
      sortOrder: 0,
    },
    {
      id: "ee000000-0000-4000-8000-000000000002",
      category: "monthly_fixed",
      key: "monthly.rent",
      name: "Rent",
      sortOrder: 1,
    },
  ],
  checkRules: [{ checkKey: "competitors", params: { min: 3, max: 5 } }],
  executionPresets: [],
  ...overrides,
});
