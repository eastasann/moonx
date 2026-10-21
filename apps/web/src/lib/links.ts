import type { LinkTarget, SourceType, SupportsCheck } from "@moonx/schemas";

/** An idea's 13 Validation home (SDD 4章). */
export const ideaHref = (workspaceId: string, ideaId: string) =>
  `/w/${workspaceId}/ideas/${ideaId}`;

/** 6 Ideas, with the filters given (SDD 4章). */
export const ideasHref = (
  workspaceId: string,
  search: Record<string, string> = {},
) => {
  const query = new URLSearchParams(search).toString();
  return `/w/${workspaceId}/ideas${query === "" ? "" : `?${query}`}`;
};

/** The validation sections 11 asks its questions in (SDD 5.7 V2). */
const QUESTION_SECTIONS = ["01", "02", "10"] as const;

/** A validation section of questions: 01, 02 or 10. */
export type QuestionSection = (typeof QUESTION_SECTIONS)[number];

/** Whether `key` names a section 11 asks (the others have screens of their own). */
export const isQuestionSection = (key: unknown): key is QuestionSection =>
  QUESTION_SECTIONS.some((section) => section === key);

/** 11 Question form of a validation section, focused on `questionKey` (SDD 4章 `?q=`). */
export const questionsHref = (
  workspaceId: string,
  ideaId: string,
  sectionKey: QuestionSection,
  questionKey?: string,
) =>
  `${ideaHref(workspaceId, ideaId)}/questions/${sectionKey}${
    questionKey === undefined
      ? ""
      : `?${new URLSearchParams({ q: questionKey })}`
  }`;

/** What 14's URL may open with (SDD 4章): an entry, or a new one with its tags. */
export interface ResearchSearch {
  supports?: SupportsCheck;
  source?: SourceType;
  /** The research log entry shown. */
  entry?: string;
  /** The new entry's input is open (`new=1`, as `/welcome` writes it). */
  new?: 1;
  /** The Supports check tags the new entry starts with. */
  presetSupports?: readonly SupportsCheck[];
}

/** 14 Research log (SDD 4章). */
export const researchHref = (
  workspaceId: string,
  ideaId: string,
  search: ResearchSearch = {},
) => {
  const query = new URLSearchParams();
  if (search.supports !== undefined) query.set("supports", search.supports);
  if (search.source !== undefined) query.set("source", search.source);
  if (search.entry !== undefined) query.set("entry", search.entry);
  if (search.new === 1) query.set("new", "1");
  if (search.presetSupports !== undefined && search.presetSupports.length > 0) {
    query.set("presetSupports", search.presetSupports.join(","));
  }
  const text = query.toString();
  return `${ideaHref(workspaceId, ideaId)}/research${text === "" ? "" : `?${text}`}`;
};

/**
 * Where a section of 13 opens (design-spec 6.1「セクションを開く」), while its screen is
 * built (docs/claude-code-prompts.md: no way into a screen before it exists): 01, 02 and
 * 10 on 11, 03 on 14. Each screen's step adds its sections here.
 */
export function sectionHref(
  workspaceId: string,
  ideaId: string,
  key: string,
): string | undefined {
  if (isQuestionSection(key)) return questionsHref(workspaceId, ideaId, key);
  if (key === "03") return researchHref(workspaceId, ideaId);
  return undefined;
}

/**
 * The route of a screen the API names (SDD 5.2 LinkTarget), or undefined while that screen
 * is not built, or the way it opens (a panel) is not: no way into a screen before it
 * exists (docs/claude-code-prompts.md). Each screen's step adds its route here.
 */
export function hrefOf(target: LinkTarget): string | undefined {
  const { workspaceId, ideaId } = target;
  if (workspaceId === undefined || target.panel !== undefined) return undefined;
  switch (target.screen) {
    case 5:
      return `/w/${workspaceId}`;
    case 6:
      return ideasHref(workspaceId);
    case 13:
      return ideaId === undefined ? undefined : ideaHref(workspaceId, ideaId);
    case 11:
      // The self-analysis's 11 has no idea; it comes with its own screens.
      return ideaId === undefined || !isQuestionSection(target.sectionKey)
        ? undefined
        : questionsHref(
            workspaceId,
            ideaId,
            target.sectionKey,
            target.questionKey,
          );
    case 14:
      return ideaId === undefined
        ? undefined
        : researchHref(workspaceId, ideaId, {
            entry: target.rowId,
            new: target.newEntry === true ? 1 : undefined,
            presetSupports: target.presetSupports,
          });
    default:
      return undefined;
  }
}
