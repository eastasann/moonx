import type { LinkTarget, TargetRef } from "@moonx/schemas";

/** Options of {@link linkTargetPath}. */
export interface LinkTargetContext {
  /** Used when the target names no workspace of its own. */
  workspaceId?: string;
}

const targetParam = (target: TargetRef) =>
  [target.type, target.id, target.key].filter((part) => part != null && part !== "").join(":");

/**
 * The Web path (SDD 4) for a `LinkTarget` the API sends in checks, next steps, evidence usages
 * and notifications. `screen` is the design-spec screen number; the other fields become the path
 * parameters and the search string of that screen. Returns null when the target lacks what its
 * screen needs (a workspace, an idea, a plan) or the screen has no Web route to open, so the
 * caller shows plain text instead of a dead link.
 */
export function linkTargetPath(target: LinkTarget, context: LinkTargetContext = {}): string | null {
  const workspaceId = target.workspaceId ?? context.workspaceId;
  const { ideaId, planId } = target;
  const search = new URLSearchParams();
  const set = (name: string, value: string | number | undefined) => {
    if (value !== undefined && value !== "") search.set(name, String(value));
  };

  let path: string | null = null;
  const inWorkspace = (rest = "") => (workspaceId ? `/w/${workspaceId}${rest}` : null);
  const inIdea = (rest = "") => (ideaId ? inWorkspace(`/ideas/${ideaId}${rest}`) : null);
  const inPlan = (rest = "") => (planId ? inIdea(`/plans/${planId}${rest}`) : null);

  switch (target.screen) {
    case 5:
      path = inWorkspace();
      break;
    case 6:
      path = inWorkspace("/ideas");
      break;
    case 7:
      path = inWorkspace("/decisions");
      set("idea", ideaId);
      break;
    case 8:
      path = "/notifications";
      break;
    case 9:
      path = inWorkspace("/settings");
      break;
    case 10:
      path = inWorkspace("/self-analysis");
      break;
    case 11:
      path = target.sectionKey
        ? ideaId
          ? inIdea(`/questions/${target.sectionKey}`)
          : inWorkspace(`/self-analysis/${target.sectionKey}`)
        : null;
      set("q", target.questionKey);
      break;
    case 12:
      path = inWorkspace(target.userId ? `/team/${target.userId}` : "/team");
      break;
    case 13:
      path = inIdea();
      break;
    case 14:
      path = inIdea("/research");
      set("entry", target.rowId);
      if (target.tab === "new") set("new", 1);
      break;
    case 15:
      path = inIdea("/competitors");
      set("q", target.questionKey);
      set("row", target.rowId);
      break;
    case 16:
      path = inIdea("/assumptions");
      set("tab", target.tab);
      set("row", target.rowId);
      break;
    case 17:
      path = inIdea("/costs");
      set("tab", target.tab);
      set("row", target.rowId);
      break;
    case 18:
      path = inIdea("/economics");
      set("field", target.field);
      break;
    case 19:
      path = inIdea("/decide");
      break;
    case 20:
      path = inPlan();
      break;
    case 21:
      path = target.itemNo === undefined ? null : inPlan(`/items/${target.itemNo}`);
      set("q", target.questionKey);
      break;
    case 22:
      path = inPlan("/execution");
      set("tab", target.tab);
      set("item", target.rowId);
      break;
    case 23:
      path = inPlan("/pitch");
      break;
    case 24:
      path = inWorkspace("/ai/export");
      break;
    case 25:
      path = inWorkspace("/ai/import");
      break;
    default:
      return null;
  }
  if (path === null) return null;

  if (target.panel) {
    search.set("panel", target.panel);
    if (target.target) search.set("target", targetParam(target.target));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
