import type {
  CostCategory,
  DecisionLogKind,
  EconomicsField,
  ExecutionStatus,
  ExecutionType,
  LinkTarget,
  PitchVariant,
  SourceType,
  SupportsCheck,
  TargetRef,
  TemplateKind,
} from "@moonx/schemas";
import { pitchVariantSchema } from "@moonx/schemas";
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

/** 10 Self Analysis (SDD 4章): the user's own, the same in every workspace. */
export const selfAnalysisHref = (workspaceId: string) =>
  `/w/${workspaceId}/self-analysis`;

/** 11 Question form of a self-analysis section, focused on `questionKey` (SDD 4章 `?q=`). */
export const selfAnalysisSectionHref = (
  workspaceId: string,
  sectionKey: string,
  questionKey?: string,
) =>
  `${selfAnalysisHref(workspaceId)}/${encodeURIComponent(sectionKey)}${
    questionKey === undefined
      ? ""
      : `?${new URLSearchParams({ q: questionKey })}`
  }`;

/** 12 Team Self Analyses (SDD 4章), with the member whose self-analysis is open. */
export const teamHref = (workspaceId: string, userId?: string) =>
  `/w/${workspaceId}/team${userId === undefined ? "" : `/${userId}`}`;

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

/** What 20's URL may open with (SDD 4章): a saved version, read only. */
export interface PlanSearch {
  /** The `plan_version` shown read only. */
  version?: string;
}

/** 20 Plan home (SDD 4章), or a saved version of it read only. */
export const planHref = (
  workspaceId: string,
  ideaId: string,
  planId: string,
  search: PlanSearch = {},
) =>
  `${ideaHref(workspaceId, ideaId)}/plans/${planId}${
    search.version === undefined
      ? ""
      : `?${new URLSearchParams({ version: search.version })}`
  }`;

/** What 21's URL may open with (SDD 4章). */
export interface PlanItemSearch {
  /** The sub-item to focus: its ID ("P.01.2"). */
  q?: string;
  /** The `plan_version` shown read only. */
  version?: string;
}

/** 21 Plan item, `itemNo` 1–30 (SDD 4章), or a saved version of it read only. */
export const planItemHref = (
  workspaceId: string,
  ideaId: string,
  planId: string,
  itemNo: number,
  search: PlanItemSearch = {},
) => {
  const query = new URLSearchParams();
  if (search.q !== undefined) query.set("q", search.q);
  if (search.version !== undefined) query.set("version", search.version);
  const text = query.toString();
  return `${planHref(workspaceId, ideaId, planId)}/items/${itemNo}${text === "" ? "" : `?${text}`}`;
};

/** 22's tabs (SDD 4章 `?tab=`), each the list of an execution type, in 6.13's order. */
export const EXECUTION_TABS = {
  milestones: "milestone",
  launch: "launch",
  kpis: "kpi",
  questions: "open_question",
  actions: "next_action",
} as const satisfies Record<string, ExecutionType>;
export type ExecutionTab = keyof typeof EXECUTION_TABS;

/** Whether `tab` names one of 22's tabs. */
export const isExecutionTab = (tab: unknown): tab is ExecutionTab =>
  typeof tab === "string" && Object.hasOwn(EXECUTION_TABS, tab);

/** The tab of 22 that lists items of `type`. */
export const executionTabOf = (type: ExecutionType): ExecutionTab =>
  (Object.keys(EXECUTION_TABS) as ExecutionTab[]).find(
    (tab) => EXECUTION_TABS[tab] === type,
  ) ?? "milestones";

/** What 22's URL may open with (SDD 4章). */
export interface ExecutionSearch {
  tab?: ExecutionTab;
  /** The execution item shown beside the list. */
  item?: string;
  /** Next Actions' filter by assignee: `me` or a member's user id. */
  assignee?: string;
  /**
   * Next Actions' filter by an assignee typed as a name, in any case. Not with `assignee`:
   * an item has one or the other.
   */
  assigneeName?: string;
  /** Next Actions' filter by status. */
  status?: ExecutionStatus;
}

/** 22 Execution (SDD 4章). */
export const executionHref = (
  workspaceId: string,
  ideaId: string,
  planId: string,
  search: ExecutionSearch = {},
) => {
  const query = new URLSearchParams();
  for (const key of [
    "tab",
    "item",
    "assignee",
    "assigneeName",
    "status",
  ] as const) {
    const value = search[key];
    if (value !== undefined) query.set(key, value);
  }
  const text = query.toString();
  return `${planHref(workspaceId, ideaId, planId)}/execution${text === "" ? "" : `?${text}`}`;
};

/** What 23's URL may open with (SDD 4章). */
export interface PitchSearch {
  /** The one-minute or five-minute deck; the one-minute when left out. */
  variant?: PitchVariant;
  /** The `plan_version` the deck is made from; the plan now when left out. */
  version?: string;
}

/** 23 Pitch Deck (SDD 4章). */
export const pitchHref = (
  workspaceId: string,
  ideaId: string,
  planId: string,
  search: PitchSearch = {},
) => {
  const query = new URLSearchParams();
  if (search.variant !== undefined) query.set("variant", search.variant);
  if (search.version !== undefined) query.set("version", search.version);
  const text = query.toString();
  return `${planHref(workspaceId, ideaId, planId)}/pitch${text === "" ? "" : `?${text}`}`;
};

/**
 * The deck a slide's comment target names (`{variant}.{slide}`, SDD 5.1 TargetRef), or
 * undefined for any other target.
 */
export function pitchVariantOf(
  target: TargetRef | undefined,
): PitchVariant | undefined {
  if (target?.type !== "pitch_slide") return undefined;
  return pitchVariantSchema.safeParse(target.key?.split(".")[0]).data;
}

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

/** The screens whose panels are built: PNL-1 on 10–18 and 20–23, PNL-2 on 10, 11, 13–18 and 20–22. */
const PANEL_SCREENS = {
  comments: new Set([10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 21, 22, 23]),
  history: new Set([10, 11, 13, 14, 15, 16, 17, 18, 20, 21, 22]),
};

/**
 * The route of a screen the API names (SDD 5.2 LinkTarget), or undefined while that screen
 * is not built, or the way it opens (a panel) is not: no way into a screen before it
 * exists (docs/claude-code-prompts.md). Each screen's step adds its route here. A link
 * with a panel opens it on the item (`?panel=comments|history&target=`, SDD 4章).
 */
export function hrefOf(target: LinkTarget): string | undefined {
  if (target.panel === undefined) return screenHrefOf(target);
  if (
    target.target === undefined ||
    !PANEL_SCREENS[target.panel].has(target.screen)
  ) {
    return undefined;
  }
  const base = screenHrefOf({ ...target, panel: undefined });
  if (base === undefined) return undefined;
  const [path, query = ""] = base.split("?");
  const search = new URLSearchParams(query);
  search.set("panel", target.panel);
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
    case 10:
      return selfAnalysisHref(workspaceId);
    case 11:
      // Without an idea, it is the user's own self-analysis.
      if (ideaId === undefined) {
        return target.sectionKey === undefined
          ? undefined
          : selfAnalysisSectionHref(
              workspaceId,
              target.sectionKey,
              target.questionKey,
            );
      }
      return isQuestionSection(target.sectionKey)
        ? questionsHref(
            workspaceId,
            ideaId,
            target.sectionKey,
            target.questionKey,
          )
        : undefined;
    case 12:
      return teamHref(workspaceId, target.userId);
    case 13:
      return ideaId === undefined ? undefined : ideaHref(workspaceId, ideaId);
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
    case 20:
      return ideaId === undefined || target.planId === undefined
        ? undefined
        : planHref(workspaceId, ideaId, target.planId);
    case 21:
      return ideaId === undefined ||
        target.planId === undefined ||
        target.itemNo === undefined
        ? undefined
        : planItemHref(workspaceId, ideaId, target.planId, target.itemNo, {
            q: target.questionKey,
          });
    case 22:
      // An item's link names it alone: 22 opens the tab of its type.
      return ideaId === undefined || target.planId === undefined
        ? undefined
        : executionHref(workspaceId, ideaId, target.planId, {
            tab: isExecutionTab(target.tab) ? target.tab : undefined,
            item: target.rowId,
          });
    case 23:
      // A slide's comment opens the deck it is on.
      return ideaId === undefined || target.planId === undefined
        ? undefined
        : pitchHref(workspaceId, ideaId, target.planId, {
            variant: pitchVariantOf(target.target),
          });
    default:
      return undefined;
  }
}
