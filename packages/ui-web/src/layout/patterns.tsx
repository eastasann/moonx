import type { ReactNode } from "react";
import { Button as AriaButton } from "react-aria-components";
import { Tray } from "../components/Tray";
import {
  bottomAction,
  cardGrid,
  detailPane,
  diffColumns,
  floatingActionSlot,
  header,
  hubEntries,
  hubHistory,
  hubLeft,
  hubNext,
  hubRight,
  hubStatus,
  hubSummary,
  hubSupplement,
  listDetail,
  listPane,
  pageFrame,
  presentation,
  questionFrame,
  readingFrame,
  resultBar,
  resultTrigger,
  slides,
  stepsBar,
  thumbnails,
  twoColumns,
  worksheet,
  worksheetResult,
} from "./patterns.css";
import { useBelowDesktop } from "./useBelowDesktop";

interface ActionSlot {
  /** The main actions. Pinned to the bottom on mobile (design-spec 4.1). */
  actions?: ReactNode;
  /**
   * Whether the page sits above the mobile `TabBar`. When true (the default) the pinned bar stops
   * above the tab bar; set false for pages without one, such as sign-in and public pages.
   */
  hasTabBar?: boolean;
}

const Actions = ({ actions, hasTabBar = true }: ActionSlot) =>
  actions ? (
    <div className={bottomAction} data-tab-bar={hasTabBar}>
      {actions}
    </div>
  ) : null;

export interface HubPatternProps extends ActionSlot {
  header?: ReactNode;
  /** Top of the left column: the object's one-line state. First on mobile. */
  summary?: ReactNode;
  /** Recommended next steps. Second on mobile, below `summary` in the left column. */
  nextSteps?: ReactNode;
  /** Left column on desktop: key numbers, checks, F/A/U. Third on mobile. */
  status: ReactNode;
  /** Right column on desktop: the entries to other screens. Fourth on mobile. */
  entries: ReactNode;
  /**
   * Background the object carries, such as its summary. Bottom of the left column on desktop,
   * after `entries` and before `history` on mobile.
   */
  supplement?: ReactNode;
  /** Change history and related items. Below `entries` on desktop, last on mobile. */
  history?: ReactNode;
}

/**
 * Pattern A, the hub. Desktop has two columns, the left holding `summary`, `nextSteps` and
 * `status` and `supplement` and the right holding `entries` and `history`. Below desktop the
 * columns dissolve and the slots stack in DOM order: summary, next steps, status, entries,
 * supplement, history (design-spec 4.1). `supplement` is rendered once, where the width puts it,
 * so the reading and focus order is the visual order.
 */
export function HubPattern({
  header: head,
  summary,
  nextSteps,
  status,
  entries,
  supplement,
  history,
  actions,
  hasTabBar,
}: HubPatternProps) {
  const compact = useBelowDesktop();
  const supplementBlock = supplement ? <div className={hubSupplement}>{supplement}</div> : null;
  return (
    <div className={pageFrame}>
      {head ? <div className={header}>{head}</div> : null}
      <div className={twoColumns}>
        <div className={hubLeft}>
          {summary ? <div className={hubSummary}>{summary}</div> : null}
          {nextSteps ? <div className={hubNext}>{nextSteps}</div> : null}
          <div className={hubStatus}>{status}</div>
          {compact ? null : supplementBlock}
        </div>
        <div className={hubRight}>
          <div className={hubEntries}>{entries}</div>
          {compact ? supplementBlock : null}
          {history ? <div className={hubHistory}>{history}</div> : null}
        </div>
      </div>
      <Actions actions={actions} hasTabBar={hasTabBar} />
    </div>
  );
}

export interface FocusPatternProps extends ActionSlot {
  header?: ReactNode;
  /** What the decision rests on. Placed above the input. */
  evidence?: ReactNode;
  children: ReactNode;
}

/**
 * Pattern B, one decision or form in a centered reading column. `evidence` goes above the input
 * (`children`). The column is the same on mobile, with `actions` pinned to the bottom.
 */
export function FocusPattern({
  header: head,
  evidence,
  children,
  actions,
  hasTabBar,
}: FocusPatternProps) {
  return (
    <div className={readingFrame}>
      {head ? <div className={header}>{head}</div> : null}
      {evidence}
      {children}
      <Actions actions={actions} hasTabBar={hasTabBar} />
    </div>
  );
}

export interface QuestionFormPatternProps extends ActionSlot {
  header?: ReactNode;
  /**
   * The questions as `QuestionCard`s. Below tablet only the focused card shows, once any card is
   * focused. Previous and next controls go in `actions`.
   */
  children: ReactNode;
}

/**
 * Pattern C, the question column. Scrolling and opening the focused question are `QuestionCard`'s
 * job. This frame relies on the root attributes `QuestionCard` sets, `data-question-card` and
 * `data-focused`: below tablet it hides the cards with `data-focused="false"`, but only while a
 * card with `data-focused="true"` exists, so a form with no focused card shows everything.
 */
export function QuestionFormPattern({
  header: head,
  children,
  actions,
  hasTabBar,
}: QuestionFormPatternProps) {
  return (
    <div className={`${readingFrame} ${questionFrame}`}>
      {head ? <div className={header}>{head}</div> : null}
      {children}
      <Actions actions={actions} hasTabBar={hasTabBar} />
    </div>
  );
}

export interface ListDetailPatternProps {
  header?: ReactNode;
  /** Filters and the list. */
  list: ReactNode;
  detail: ReactNode;
  /**
   * The main "create" action as an icon button floating at the bottom right, above the tab bar.
   * Shown below desktop only; on desktop the screen puts the action in its header.
   */
  floatingAction?: ReactNode;
  /**
   * Below desktop only one pane shows: the detail when true, the list otherwise. Desktop shows
   * both; the tablet layout follows mobile (a full-width detail) instead of an overlay.
   */
  detailOpen?: boolean;
}

/**
 * Pattern D, master and detail. Desktop shows `list` on the left and `detail` on the right.
 * Below desktop one pane shows at a time, full width, chosen by `detailOpen`. The hidden pane
 * stays mounted with `data-hidden="true"`.
 */
export function ListDetailPattern({
  header: head,
  list,
  detail,
  floatingAction,
  detailOpen = false,
}: ListDetailPatternProps) {
  return (
    <div className={pageFrame}>
      {head ? <div className={header}>{head}</div> : null}
      <div className={listDetail}>
        <div className={listPane} data-hidden={detailOpen}>
          {list}
        </div>
        <div className={detailPane} data-hidden={!detailOpen}>
          {detail}
        </div>
      </div>
      {floatingAction ? <div className={floatingActionSlot}>{floatingAction}</div> : null}
    </div>
  );
}

export interface CardComparePatternProps {
  header?: ReactNode;
  /** Filters and the cards/table switch, above the grid. */
  toolbar?: ReactNode;
  children: ReactNode;
}

/**
 * Pattern E, cards to compare side by side: 3 columns on desktop, 2 on tablet, 1 on mobile.
 * `children` are the cards.
 */
export function CardComparePattern({ header: head, toolbar, children }: CardComparePatternProps) {
  return (
    <div className={pageFrame}>
      {head ? <div className={header}>{head}</div> : null}
      {toolbar}
      <div className={cardGrid}>{children}</div>
    </div>
  );
}

export interface WorksheetPatternProps {
  header?: ReactNode;
  /** The input table (cards on mobile). */
  input: ReactNode;
  /** The full result. Fixed on the right on desktop, opened in a tray from `resultSummary` below it. */
  result: ReactNode;
  /**
   * The summary shown in the bar pinned to the bottom below desktop. Pressing it opens `result`,
   * so it is rendered inside a button and must be phrasing content (no `div`, no controls).
   */
  resultSummary: ReactNode;
  /** Accessible name of the tray that holds `result`. */
  resultLabel: string;
  /** See `HubPatternProps` `hasTabBar`: raises the summary bar above the tab bar. */
  hasTabBar?: boolean;
}

/**
 * Pattern F, input on the left and the live result fixed on the right (360px). Below desktop the
 * result pane is replaced by a summary bar, and pressing it opens the result full width in a
 * tray. `result` is rendered once, in the pane or in the tray, never both.
 */
export function WorksheetPattern({
  header: head,
  input,
  result,
  resultSummary,
  resultLabel,
  hasTabBar,
}: WorksheetPatternProps) {
  const compact = useBelowDesktop();
  return (
    <div className={pageFrame}>
      {head ? <div className={header}>{head}</div> : null}
      <div className={worksheet}>
        <div>{input}</div>
        {compact ? null : <div className={worksheetResult}>{result}</div>}
      </div>
      {compact ? (
        <div className={resultBar} data-tab-bar={hasTabBar ?? true}>
          <Tray
            aria-label={resultLabel}
            trigger={<AriaButton className={resultTrigger}>{resultSummary}</AriaButton>}
          >
            {result}
          </Tray>
        </div>
      ) : null}
    </div>
  );
}

export interface StepsPatternProps extends ActionSlot {
  header?: ReactNode;
  /** The step indicator (1, 2, 3). */
  steps: ReactNode;
  children: ReactNode;
}

/**
 * Pattern G, a fixed sequence of steps. `steps` is the indicator on top, `children` the current
 * step in one column. The same on mobile, with `actions` pinned to the bottom.
 */
export function StepsPattern({
  header: head,
  steps,
  children,
  actions,
  hasTabBar,
}: StepsPatternProps) {
  return (
    <div className={readingFrame}>
      {head ? <div className={header}>{head}</div> : null}
      <div className={stepsBar}>{steps}</div>
      {children}
      <Actions actions={actions} hasTabBar={hasTabBar} />
    </div>
  );
}

export interface DiffColumnsProps {
  /** The current content. Left on desktop, above `after` below it. */
  before: ReactNode;
  /** The incoming content. */
  after: ReactNode;
}

/** The two-column diff of the import step (G). Stacks below desktop. */
export function DiffColumns({ before, after }: DiffColumnsProps) {
  return (
    <div className={diffColumns}>
      <div>{before}</div>
      <div>{after}</div>
    </div>
  );
}

export interface SettingsPatternProps {
  header?: ReactNode;
  children: ReactNode;
}

/**
 * Pattern H, groups of settings stacked in one centered column. `children` are the groups; the
 * layout is the same on mobile.
 */
export function SettingsPattern({ header: head, children }: SettingsPatternProps) {
  return (
    <div className={readingFrame}>
      {head ? <div className={header}>{head}</div> : null}
      {children}
    </div>
  );
}

export interface PresentationPatternProps {
  header?: ReactNode;
  /** Thumbnail column. Hidden below desktop, where slides stack. */
  thumbnails: ReactNode;
  /** The slides and the speaker notes. */
  children: ReactNode;
}

/**
 * Pattern I, presentation. Desktop shows a thumbnail column beside the slides. Below desktop the
 * thumbnails are hidden and the slides stack at the full width.
 */
export function PresentationPattern({
  header: head,
  thumbnails: thumbs,
  children,
}: PresentationPatternProps) {
  return (
    <div className={pageFrame}>
      {head ? <div className={header}>{head}</div> : null}
      <div className={presentation}>
        <div className={thumbnails}>{thumbs}</div>
        <div className={slides}>{children}</div>
      </div>
    </div>
  );
}

export interface PublicPatternProps {
  children: ReactNode;
}

/**
 * Pattern J, a long public page in one reading column, the same on every width. It has no tab
 * bar and no pinned actions.
 */
export function PublicPattern({ children }: PublicPatternProps) {
  return <div className={readingFrame}>{children}</div>;
}
