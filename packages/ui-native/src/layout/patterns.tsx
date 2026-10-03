import { type ReactNode, useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Tray } from "../components/Tray";
import { Content } from "../internal/Content";
import { fontStyle } from "../internal/typography";
import { QuestionFocusContext, type QuestionFocusContextValue } from "./QuestionFocus";
import { useKeyboardHeight } from "./useKeyboardHeight";

interface ActionSlot {
  /** The main actions. Pinned to the bottom (design-spec 4.1). */
  actions?: ReactNode;
  /**
   * Whether the screen has a `TabBar` below the page. When true (the default) the tab bar owns
   * the bottom safe-area inset; set false for pages without one, such as sign-in and public pages,
   * so the pinned bar pads for the inset itself.
   */
  hasTabBar?: boolean;
}

interface FrameProps extends ActionSlot {
  header?: ReactNode;
  /** The single reading column instead of the wide page content. */
  reading?: boolean;
  /**
   * Whether the frame scrolls its content. Off for pattern D, whose panes own their scrolling
   * (a list inside a scroll view would lose its virtualization).
   */
  scroll?: boolean;
  /** A bar pinned to the bottom, already laid out. It replaces `actions`. */
  pinned?: ReactNode;
  children: ReactNode;
}

/**
 * The shared body of the pattern frames: the page column, and a bar pinned to the bottom of the
 * frame that rises above the keyboard so inputs and the main action stay visible (design-spec
 * 4.3). The `TabBar` takes its own space below the frame (design-spec 4.3), so the frame has to
 * fill the area above it: `PageFrame` or the screen's root must give it a height.
 */
function Frame({
  header,
  reading = false,
  scroll = true,
  actions,
  pinned,
  hasTabBar = true,
  children,
}: FrameProps) {
  styles.useVariants({ reading });
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const [barHeight, setBarHeight] = useState<number>(theme.layout["bottom-action-height"]);

  const bar = pinned ?? (actions ? <View style={styles.actions}>{actions}</View> : null);
  const keyboardOpen = keyboard > 0;
  // The keyboard covers the tab bar too, so only what rises above the tab bar lifts the bar.
  const tabBarSpace = hasTabBar ? theme.layout["tab-bar-height"] + insets.bottom : 0;
  const barBottom = keyboardOpen ? Math.max(0, keyboard - tabBarSpace) : 0;
  const barSafePadding = keyboardOpen || hasTabBar ? 0 : insets.bottom;
  // Scrolling must be able to bring the last content above the bar, and above the keyboard.
  const contentBottom = bar ? barBottom + barHeight : hasTabBar ? 0 : insets.bottom;

  const page = (
    <>
      {header ? <View style={styles.header}>{header}</View> : null}
      {children}
    </>
  );

  return (
    <View style={styles.root}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={styles.page(contentBottom)}
        >
          {page}
        </ScrollView>
      ) : (
        <View style={styles.fill}>{page}</View>
      )}
      {bar ? (
        <View
          style={styles.bar(barBottom, barSafePadding)}
          onLayout={(event) => setBarHeight(event.nativeEvent.layout.height)}
        >
          {bar}
        </View>
      ) : null}
    </View>
  );
}

export interface HubPatternProps extends ActionSlot {
  header?: ReactNode;
  /** Top of the page: the object's one-line state. First. */
  summary?: ReactNode;
  /** Recommended next steps. Second, below `summary`. */
  nextSteps?: ReactNode;
  /** Key numbers, checks, F/A/U. Third. */
  status: ReactNode;
  /** The entries to other screens. Fourth. */
  entries: ReactNode;
  /** Background the object carries, such as its summary. After `entries` and before `history`. */
  supplement?: ReactNode;
  /** Change history and related items. Last. */
  history?: ReactNode;
}

/**
 * Pattern A, the hub. On a phone the slots stack in one column: summary, next steps, status,
 * entries, supplement, history (design-spec 4.1), with `actions` pinned to the bottom.
 */
export function HubPattern({
  header,
  summary,
  nextSteps,
  status,
  entries,
  supplement,
  history,
  actions,
  hasTabBar,
}: HubPatternProps) {
  return (
    <Frame header={header} actions={actions} hasTabBar={hasTabBar}>
      {summary ? <View style={styles.block}>{summary}</View> : null}
      {nextSteps ? <View style={styles.block}>{nextSteps}</View> : null}
      <View style={styles.block}>{status}</View>
      <View style={styles.block}>{entries}</View>
      {supplement ? <View style={styles.block}>{supplement}</View> : null}
      {history ? <View style={styles.block}>{history}</View> : null}
    </Frame>
  );
}

export interface FocusPatternProps extends ActionSlot {
  header?: ReactNode;
  /** What the decision rests on. Placed above the input. */
  evidence?: ReactNode;
  children: ReactNode;
}

/** Pattern B, one decision or form in one column. `evidence` goes above the input (`children`). */
export function FocusPattern({
  header,
  evidence,
  children,
  actions,
  hasTabBar,
}: FocusPatternProps) {
  return (
    <Frame reading header={header} actions={actions} hasTabBar={hasTabBar}>
      {evidence}
      {children}
    </Frame>
  );
}

export interface QuestionFormPatternProps extends ActionSlot {
  header?: ReactNode;
  /**
   * The questions as `QuestionCard`s. Only the focused card shows, once any card is focused.
   * Previous and next controls go in `actions`.
   */
  children: ReactNode;
}

/**
 * Pattern C, one question per screen. The cards report their focus through `useQuestionFocus`
 * (the phone twin of the `data-question-card` / `data-focused` attributes the Web frame reads),
 * and the cards that are not focused render nothing while some card is focused. A form with no
 * focused card shows every question.
 */
export function QuestionFormPattern({
  header,
  children,
  actions,
  hasTabBar,
}: QuestionFormPatternProps) {
  const [focused, setFocusedIds] = useState<ReadonlySet<string>>(() => new Set());
  const setFocused = useCallback((id: string, isFocused: boolean) => {
    setFocusedIds((current) => {
      if (current.has(id) === isFocused) return current;
      const next = new Set(current);
      if (isFocused) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const context = useMemo<QuestionFocusContextValue>(
    () => ({ hasFocus: focused.size > 0, setFocused }),
    [focused, setFocused],
  );
  return (
    <QuestionFocusContext.Provider value={context}>
      <Frame reading header={header} actions={actions} hasTabBar={hasTabBar}>
        {children}
      </Frame>
    </QuestionFocusContext.Provider>
  );
}

export interface ListDetailPatternProps {
  header?: ReactNode;
  /** Filters and the list. */
  list: ReactNode;
  detail: ReactNode;
  /**
   * The main "create" action as an icon button floating at the bottom right, in the list area (the tab bar is laid out below it).
   */
  floatingAction?: ReactNode;
  /** One pane shows at a time, full width: the detail when true, the list otherwise. */
  detailOpen?: boolean;
}

/**
 * Pattern D, master and detail. One pane shows at a time, chosen by `detailOpen`. The hidden
 * pane stays mounted (`display: none`) so its state survives. The panes fill the screen and own
 * their scrolling, so put a `FlatList` or `ScrollView` in `list` and `detail`.
 */
export function ListDetailPattern({
  header,
  list,
  detail,
  floatingAction,
  detailOpen = false,
}: ListDetailPatternProps) {
  return (
    <View style={styles.root}>
      <Frame header={header} scroll={false}>
        <View style={styles.pane(!detailOpen)}>{list}</View>
        <View style={styles.pane(detailOpen)}>{detail}</View>
      </Frame>
      {floatingAction ? <View style={styles.floating}>{floatingAction}</View> : null}
    </View>
  );
}

export interface CardComparePatternProps {
  header?: ReactNode;
  /** Filters and the cards/table switch, above the cards. */
  toolbar?: ReactNode;
  children: ReactNode;
}

/** Pattern E, the cards in one column. The comparison table is not offered on a phone. */
export function CardComparePattern({ header, toolbar, children }: CardComparePatternProps) {
  return (
    <Frame header={header}>
      {toolbar}
      <View style={styles.cards}>{children}</View>
    </Frame>
  );
}

export interface WorksheetPatternProps {
  header?: ReactNode;
  /** The input table (cards on a phone). */
  input: ReactNode;
  /** The full result. Opened in a tray from `resultSummary`. */
  result: ReactNode;
  /**
   * The summary shown in the bar pinned to the bottom. Pressing it opens `result`. Bare strings
   * are wrapped in text; it must not contain controls, as it sits inside a button.
   */
  resultSummary: ReactNode;
  /** Accessible name of the tray that holds `result` and of the summary button. */
  resultLabel: string;
  /** See `HubPatternProps` `hasTabBar`: lets the summary bar pad for the safe-area inset itself when there is no tab bar. */
  hasTabBar?: boolean;
}

/**
 * Pattern F. The input fills the screen, a summary bar is pinned at the bottom, and pressing it
 * opens the result in a tray.
 */
export function WorksheetPattern({
  header,
  input,
  result,
  resultSummary,
  resultLabel,
  hasTabBar,
}: WorksheetPatternProps) {
  return (
    <Frame
      header={header}
      hasTabBar={hasTabBar}
      pinned={
        <Tray
          aria-label={resultLabel}
          trigger={<ResultTrigger label={resultLabel}>{resultSummary}</ResultTrigger>}
        >
          {result}
        </Tray>
      }
    >
      {input}
    </Frame>
  );
}

/** The summary bar button. `Tray` clones its trigger to add `onPress`. */
function ResultTrigger({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress?: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      role="button"
      aria-label={label}
      onPress={onPress}
      style={({ pressed }) => styles.trigger(pressed)}
    >
      <Content textStyle={styles.triggerText} iconSize={styles.triggerIcon.width}>
        {children}
      </Content>
    </Pressable>
  );
}

export interface StepsPatternProps extends ActionSlot {
  header?: ReactNode;
  /** The step indicator (1, 2, 3). */
  steps: ReactNode;
  children: ReactNode;
}

/** Pattern G, a fixed sequence of steps: the indicator on top, the current step below. */
export function StepsPattern({ header, steps, children, actions, hasTabBar }: StepsPatternProps) {
  return (
    <Frame reading header={header} actions={actions} hasTabBar={hasTabBar}>
      <View style={styles.steps}>{steps}</View>
      {children}
    </Frame>
  );
}

export interface DiffColumnsProps {
  /** The current content. Above `after`. */
  before: ReactNode;
  /** The incoming content. */
  after: ReactNode;
}

/** The diff of the import step (G). Stacks, `before` above `after`. */
export function DiffColumns({ before, after }: DiffColumnsProps) {
  return (
    <View style={styles.block}>
      <View>{before}</View>
      <View>{after}</View>
    </View>
  );
}

export interface SettingsPatternProps {
  header?: ReactNode;
  children: ReactNode;
}

/** Pattern H, groups of settings stacked in one column. */
export function SettingsPattern({ header, children }: SettingsPatternProps) {
  return (
    <Frame reading header={header}>
      {children}
    </Frame>
  );
}

export interface PresentationPatternProps {
  header?: ReactNode;
  /** Not shown on a phone, where the thumbnail column is hidden. */
  thumbnails: ReactNode;
  /** The slides and the speaker notes. */
  children: ReactNode;
}

/**
 * Pattern I, presentation. The slides stack at the full width; `thumbnails` is accepted for the
 * same props as the Web part and is not rendered.
 */
export function PresentationPattern({ header, children }: PresentationPatternProps) {
  return (
    <Frame header={header}>
      <View style={styles.block}>{children}</View>
    </Frame>
  );
}

export interface PublicPatternProps {
  children: ReactNode;
}

/** Pattern J, a long public page in one column. It has no tab bar and no pinned actions. */
export function PublicPattern({ children }: PublicPatternProps) {
  return (
    <Frame reading hasTabBar={false}>
      {children}
    </Frame>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1 },
  fill: {
    flex: 1,
    gap: theme.density.regular["section-gap"],
    paddingHorizontal: theme.layout["page-gutter-mobile"],
    paddingVertical: theme.space["400"],
  },
  page: (bottom: number) => ({
    width: "100%",
    alignSelf: "center",
    gap: theme.density.regular["section-gap"],
    paddingHorizontal: theme.layout["page-gutter-mobile"],
    paddingTop: theme.space["400"],
    paddingBottom: theme.space["400"] + bottom,
    variants: {
      reading: {
        true: { maxWidth: theme.layout["reading-column-max"] },
        false: { maxWidth: theme.layout["content-max"] },
      },
    },
  }),
  header: { gap: theme.space["200"] },
  block: { gap: theme.density.regular["block-gap"] },
  cards: { gap: theme.density.regular.gap },
  steps: { alignItems: "center" },
  pane: (visible: boolean) => ({
    flex: 1,
    gap: theme.density.regular.gap,
    display: visible ? "flex" : "none",
  }),
  bar: (bottom: number, safePadding: number) => ({
    position: "absolute",
    left: 0,
    right: 0,
    bottom,
    zIndex: theme.layout["z-index"]["bottom-action"],
    minHeight: theme.layout["bottom-action-height"],
    justifyContent: "center",
    backgroundColor: theme.color.surface.raised,
    borderTopWidth: theme["border-width"].hairline,
    borderTopColor: theme.color.border.hairline,
    paddingHorizontal: theme.layout["page-gutter-mobile"],
    paddingTop: theme.space["200"],
    paddingBottom: theme.space["200"] + safePadding,
  }),
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: theme.space["200"],
  },
  floating: {
    position: "absolute",
    right: theme.layout["page-gutter-mobile"],
    bottom: theme.space["200"],
    zIndex: theme.layout["z-index"]["bottom-action"],
  },
  trigger: (pressed: boolean) => ({
    minHeight: theme.layout["bottom-action-height"],
    justifyContent: "center",
    backgroundColor: pressed ? theme.color.surface.hover : "transparent",
  }),
  triggerText: { ...fontStyle(theme, "body"), color: theme.color.text.primary },
  triggerIcon: { width: theme.scale.component.icon.size.M },
}));
