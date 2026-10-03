import type {
  Assumption,
  Competitor,
  ResearchLogEntry,
  Risk,
  ValidationAnswer,
} from "@moonx/schemas";
import { configure } from "@testing-library/react";
import { IDEA_ID, idea, question, VALIDATION_ID } from "./question-fixtures";
import {
  ASSUMPTIONS,
  COMPETITORS,
  LOG_ENTRIES,
  patternAnswers,
  RISKS,
  usage,
} from "./research-fixtures";
import { type Handler, makeMe, type StubRequest, stubApi, WORKSPACE } from "./support";
import { registerQuestionFormHooks } from "./support-questions";

/**
 * The hooks of the question-form tests, and a longer wait for a screen to appear: these screens
 * load three queries one after another, which a busy machine can stretch past a second.
 */
export function registerResearchHooks() {
  registerQuestionFormHooks();
  configure({ asyncUtilTimeout: 5000 });
}

const RENT_ROW = "99999999-9999-4999-8999-999999999999";

export const V = `/api/v1/validations/${VALIDATION_ID}`;
export const RESEARCH_PATH = (search = "") => `/w/${WORKSPACE}/ideas/${IDEA_ID}/research${search}`;
export const COMPETITORS_PATH = (search = "") =>
  `/w/${WORKSPACE}/ideas/${IDEA_ID}/competitors${search}`;
export const ASSUMPTIONS_PATH = (search = "") =>
  `/w/${WORKSPACE}/ideas/${IDEA_ID}/assumptions${search}`;

export interface ResearchApiOptions {
  me?: ReturnType<typeof makeMe>;
  archived?: boolean;
  entries?: ResearchLogEntry[];
  competitors?: Competitor[];
  patterns?: ValidationAnswer[];
  /** The titles the template gives the survivor and failure pattern questions. */
  patternTitles?: [survivor: string, failure: string];
  assumptions?: Assumption[];
  risks?: Risk[];
}

export const viewerMe = () =>
  makeMe({
    memberships: [
      {
        workspace: { id: WORKSPACE, name: "BCDX", isPersonal: false, currency: "PHP" },
        role: "viewer",
      },
    ],
  });

const patternQuestion = (key: string, title: string) => ({
  ...question("", title),
  key,
  sectionKey: "04",
});

/** The stub of every request screens 14, 15 and 16 make, with the fixtures' rows by default. */
export function researchApi(extra: Record<string, Handler> = {}, options: ResearchApiOptions = {}) {
  const entries = options.entries ?? LOG_ENTRIES;
  const detailHandlers = Object.fromEntries(
    entries.map((entry): [string, Handler] => [
      `GET /api/v1/research-log/${entry.id}`,
      () => ({
        body: {
          ...entry,
          usages:
            entry.usedAsEvidenceCount > 0
              ? [
                  usage(),
                  usage({
                    target: { type: "cost_item", id: RENT_ROW },
                    label: "Rent",
                    link: { screen: 17, workspaceId: WORKSPACE, ideaId: IDEA_ID, rowId: RENT_ROW },
                    isOnlyEvidenceOfFact: true,
                  }),
                ]
              : [],
        },
      }),
    ]),
  );
  return stubApi({
    "GET /api/v1/me": () => ({ body: options.me ?? makeMe() }),
    "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
    [`GET /api/v1/ideas/${IDEA_ID}`]: () => ({
      body: { ...idea, archived: options.archived ?? false },
    }),
    [`GET ${V}/research-log`]: ({ url }) => {
      const supports = url.searchParams.get("supports");
      const source = url.searchParams.get("sourceType");
      const items = entries.filter(
        (entry) =>
          (!supports || (entry.supportsChecks as string[]).includes(supports)) &&
          (!source || entry.sourceType === source),
      );
      return { body: { items, nextCursor: null } };
    },
    ...detailHandlers,
    [`GET ${V}/competitors`]: () => ({
      body: {
        items: options.competitors ?? COMPETITORS,
        patterns: options.patterns ?? patternAnswers(),
        guidance: { min: 3, max: 5 },
      },
    }),
    [`GET ${V}/questions/04`]: () => ({
      body: {
        section: {
          key: "04",
          part: null,
          title: "Competitors & Substitutes",
          guidance: null,
          questions: [
            patternQuestion(
              "V.04.SURVIVOR_PATTERNS",
              options.patternTitles?.[0] ?? "Survivor Patterns",
            ),
            patternQuestion(
              "V.04.FAILURE_PATTERNS",
              options.patternTitles?.[1] ?? "Failure Patterns",
            ),
          ],
        },
        answers: options.patterns ?? patternAnswers(),
      },
    }),
    [`GET ${V}/assumptions`]: () => ({ body: { items: options.assumptions ?? ASSUMPTIONS } }),
    [`GET ${V}/risks`]: () => ({ body: { items: options.risks ?? RISKS } }),
    ...extra,
  });
}

/** Answers a PATCH with the row as it would be after the change, one version on. */
export const patched =
  <Row extends { lockVersion: number }>(row: Row, patch: Partial<Row> = {}): Handler =>
  ({ body }) => {
    const { lockVersion: _lock, force: _force, ...fields } = body as Record<string, unknown>;
    return { body: { ...row, ...fields, ...patch, lockVersion: row.lockVersion + 1 } };
  };

/** The requests that changed something. */
export const writes = (calls: StubRequest[]) => calls.filter((c) => c.method !== "GET");
