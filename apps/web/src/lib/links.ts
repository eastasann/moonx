import type {
  CostCategory,
  DecisionLogKind,
  EconomicsField,
  LinkTarget,
  SourceType,
  SupportsCheck,
  TemplateKind,
} from "@moonx/schemas";
import type { CompareView } from "@moonx/ui-tokens";
import { formatPanelTarget } from "./panel-target";

/** An idea's 13 Validation home (SDD 4章). */
export const ideaHref = (workspaceId: string, ideaId: string) =>
  `/w/${workspaceId}/ideas/${ideaId}`;

/** 8 Notifications (SDD 4章), across the workspaces; `unread` filters to the unread. */
export const notificationsHref = (filter?: "unread") =>
  `/notifications${filter === undefined ? "" : `?filter=${filter}`}`;

/** What 7's URL holds (SDD 4章): the filters, and the entry shown beside the list. */
export interface DecisionsSearch {
  kind?: DecisionLogKind;
  /** The idea whose decisions are listed. */
  idea?: string;
  /** Who recorded them: a user's id. */
  recordedBy?: string;
  /** The first day of the period, `YYYY-MM-DD`. */
  from?: string;
  /** Its last day. */
  to?: string;
  /** The entry shown beside the list. */
  selected?: string;
}

/** 7 Decision Log (SDD 4章), with its filters and entry. */
export const decisionsHref = (
  workspaceId: string,
  search: DecisionsSearch = {},
) => {
  const query = new URLSearchParams();
  for (const key of [
    "kind",
    "idea",
    "recordedBy",
    "from",
    "to",
    "selected",
  ] as const) {
    const value = search[key];
    if (value !== undefined) query.set(key, value);
  }
  const text = query.toString();
  return `/w/${workspaceId}/decisions${text === "" ? "" : `?${text}`}`;
};

/** 9 Workspace Settings (SDD 4章), which only an Owner opens. */
export const settingsHref = (workspaceId: string) =>
  `/w/${workspaceId}/settings`;

/** 26 Admin: Templates (SDD 4章), with the template chosen; the nav's Admin opens it. */
export const adminTemplatesHref = (kind?: TemplateKind) =>
  `/admin/templates${kind === undefined ? "" : `?kind=${kind}`}`;

/**
 * The nodes of 27 that are no section or question (SDD 4章 `?node=`): the template's name
 * and a kind's settings at the end of the tree.
 */
export const SETTINGS_NODES = [
  "name",
  "ai-prompt",
  "cost-defaults",
  "check-rules",
  "execution-presets",
] as const;
export type SettingsNode = (typeof SETTINGS_NODES)[number];

/** 27 Admin: Edit Template (SDD 4章), with the node of the tree chosen. */
export const templateVersionHref = (versionId: string, node?: string) =>
  `/admin/templates/versions/${versionId}${node === undefined ? "" : `?node=${encodeURIComponent(node)}`}`;

/** The tabs of 28 Admin: Users & Workspaces (SDD 4章 `?tab=`). */
export type AdminUsersTab = "users" | "workspaces" | "invitations";

/** 28 Admin: Users & Workspaces (SDD 4章), on its tab. */
export const adminUsersHref = (tab?: AdminUsersTab) =>
  `/admin/users${tab === undefined ? "" : `?tab=${tab}`}`;

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

/** What 15's URL may open with (SDD 4章). */
export interface CompetitorsSearch {
  /** Cards or the table. */
  view?: CompareView;
  /** The pattern question to focus: its ID ("V.04.SURVIVOR_PATTERNS"). */
  q?: string;
  /** The competitor whose dialog is open. */
  row?: string;
}

/** 15 Competitors (SDD 4章). */
export const competitorsHref = (
  workspaceId: string,
  ideaId: string,
  search: CompetitorsSearch = {},
) => {
  const query = new URLSearchParams();
  if (search.view !== undefined) query.set("view", search.view);
  if (search.q !== undefined) query.set("q", search.q);
  if (search.row !== undefined) query.set("row", search.row);
  const text = query.toString();
  return `${ideaHref(workspaceId, ideaId)}/competitors${text === "" ? "" : `?${text}`}`;
};

/** The two lists of 16. */
export type AssumptionsTab = "assumptions" | "risks";

/** Whether `tab` names one of 16's lists. */
export const isAssumptionsTab = (tab: unknown): tab is AssumptionsTab =>
  tab === "assumptions" || tab === "risks";

/** What 16's URL may open with (SDD 4章): a row, or a new one, of a list. */
export interface AssumptionsSearch {
  tab?: AssumptionsTab;
  /** The assumption or risk shown. */
  row?: string;
  /** The new row's input is open (`new=1`, as 14's). */
  new?: 1;
}

/** 16 Assumptions & Risks (SDD 4章). */
export const assumptionsHref = (
  workspaceId: string,
  ideaId: string,
  search: AssumptionsSearch = {},
) => {
  const query = new URLSearchParams();
  if (search.tab !== undefined) query.set("tab", search.tab);
  if (search.row !== undefined) query.set("row", search.row);
  if (search.new === 1) query.set("new", "1");
  const text = query.toString();
  return `${ideaHref(workspaceId, ideaId)}/assumptions${text === "" ? "" : `?${text}`}`;
};

/** What 17's URL may open with (SDD 4章). */
export interface CostsSearch {
  /** The cost row to bring into view: its id, or its template key ("initial.permits"). */
  row?: string;
  /** The table to bring into view. */
  tab?: CostCategory;
}

/** 17 Costs (SDD 4章). */
export const costsHref = (
  workspaceId: string,
  ideaId: string,
  search: CostsSearch = {},
) => {
  const query = new URLSearchParams();
  if (search.row !== undefined) query.set("row", search.row);
  if (search.tab !== undefined) query.set("tab", search.tab);
  const text = query.toString();
  return `${ideaHref(workspaceId, ideaId)}/costs${text === "" ? "" : `?${text}`}`;
};

/** What 18's URL may open with (SDD 4章). */
export interface EconomicsSearch {
  /** The number to bring into view. */
  field?: EconomicsField;
  /** The question to open and focus: V.08.WORTH. */
  q?: string;
}

/** 18 Unit Economics & Scenarios (SDD 4章). */
export const economicsHref = (
  workspaceId: string,
  ideaId: string,
  search: EconomicsSearch = {},
) => {
  const query = new URLSearchParams();
  if (search.field !== undefined) query.set("field", search.field);
  if (search.q !== undefined) query.set("q", search.q);
  const text = query.toString();
  return `${ideaHref(workspaceId, ideaId)}/economics${text === "" ? "" : `?${text}`}`;
};

/** 19 Decision (SDD 4章). */
export const decideHref = (workspaceId: string, ideaId: string) =>
  `${ideaHref(workspaceId, ideaId)}/decide`;

/**
 * Where a section of 13 opens (design-spec 6.1「セクションを開く」): 01, 02 and 10 on
 * 11, 03 on 14, 04 on 15, 05 on 17, 06–08 on 18, 09 on 16.
 */
export function sectionHref(
  workspaceId: string,
  ideaId: string,
  key: string,
): string | undefined {
  if (isQuestionSection(key)) return questionsHref(workspaceId, ideaId, key);
  if (key === "03") return researchHref(workspaceId, ideaId);
  if (key === "04") return competitorsHref(workspaceId, ideaId);
  if (key === "05") return costsHref(workspaceId, ideaId);
  if (key === "06-08") return economicsHref(workspaceId, ideaId);
  if (key === "09") return assumptionsHref(workspaceId, ideaId);
  return undefined;
}

/** The screens whose comments panel is built (PNL-1 on 11 and 13–18). */
const COMMENTED_SCREENS = new Set([11, 13, 14, 15, 16, 17, 18]);

/**
 * The route of a screen the API names (SDD 5.2 LinkTarget), or undefined while that screen
 * is not built, or the way it opens (a panel) is not: no way into a screen before it
 * exists (docs/claude-code-prompts.md). Each screen's step adds its route here. A link
 * with the comments panel opens it on the item (`?panel=comments&target=`, SDD 4章).
 */
export function hrefOf(target: LinkTarget): string | undefined {
  if (target.panel === undefined) return screenHrefOf(target);
  if (
    target.panel !== "comments" ||
    target.target === undefined ||
    !COMMENTED_SCREENS.has(target.screen)
  ) {
    return undefined;
  }
  const base = screenHrefOf({ ...target, panel: undefined, target: undefined });
  if (base === undefined) return undefined;
  const [path, query = ""] = base.split("?");
  const search = new URLSearchParams(query);
  search.set("panel", "comments");
  search.set(
    "target",
    formatPanelTarget({ kind: "item", item: target.target }),
  );
  return `${path}?${search}`;
}

function screenHrefOf(target: LinkTarget): string | undefined {
  const { workspaceId, ideaId } = target;
  if (workspaceId === undefined) return undefined;
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
    case 15:
      return ideaId === undefined
        ? undefined
        : competitorsHref(workspaceId, ideaId, {
            q: target.questionKey,
            row: target.rowId,
          });
    case 16:
      return ideaId === undefined
        ? undefined
        : assumptionsHref(workspaceId, ideaId, {
            tab: isAssumptionsTab(target.tab) ? target.tab : undefined,
            row: target.rowId,
          });
    case 17:
      return ideaId === undefined
        ? undefined
        : costsHref(workspaceId, ideaId, { row: target.rowId });
    case 18:
      return ideaId === undefined
        ? undefined
        : economicsHref(workspaceId, ideaId, {
            field: target.field,
            q: target.questionKey,
          });
    case 19:
      return ideaId === undefined ? undefined : decideHref(workspaceId, ideaId);
    default:
      return undefined;
  }
}
