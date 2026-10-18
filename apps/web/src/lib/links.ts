import type { LinkTarget } from "@moonx/schemas";

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
    default:
      return undefined;
  }
}
