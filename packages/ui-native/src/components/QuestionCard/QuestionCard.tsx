import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { fontStyle } from "../../internal/typography";
import { useQuestionFocus } from "../../layout";

export interface QuestionCardProps {
  /** Question title, such as "BEHAVIOR". */
  title: string;
  /** Question text. Shown only while the card is focused. */
  prompt?: string;
  /** The card showing its full body. */
  isFocused: boolean;
  /** Start of the saved answer, shown in the compact form. Empty or missing shows `emptyLabel`. */
  answer?: string;
  /** Text for an unanswered question ("Empty"). */
  emptyLabel: string;
  /** F/A/U label and confidence, shown in both forms. */
  status?: ReactNode;
  /** Comment count and similar markers, shown in both forms. */
  meta?: ReactNode;
  /** Header controls shown only while focused, such as the comment and history buttons. */
  actions?: ReactNode;
  /** The focused body: answer field, EXAMPLE, hint and F/A/U controls. */
  children?: ReactNode;
  /** Called when the user presses the compact form to move into the card. */
  onFocusRequest?: () => void;
  testID?: string;
}

/**
 * One question of the question form (layout pattern C). The focused card is open with its input
 * controls, the others show only the title, the start of the answer and their labels.
 *
 * Inside a `QuestionFormPattern` only the focused card shows while any card is focused
 * (`useQuestionFocus`); the others render nothing and stay mounted in the screen's tree. So the
 * phone needs no scroll-to-center: the focused card is the only thing on screen.
 *
 * Web props with no phone meaning: `autoScroll` (no scrolling to an anchor), `onNavigate`
 * (Ctrl+Arrow keys; a phone has no hardware-keyboard navigation between cards).
 */
export function QuestionCard({
  title,
  prompt,
  isFocused,
  answer,
  emptyLabel,
  status,
  meta,
  actions,
  children,
  onFocusRequest,
  testID,
}: QuestionCardProps) {
  const visible = useQuestionFocus(isFocused);
  const hasAnswer = answer !== undefined && answer.trim() !== "";
  styles.useVariants({ focused: isFocused });
  if (!visible) return null;

  if (isFocused) {
    return (
      <View role="group" aria-label={title} testID={testID} style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.side}>
            {status}
            {meta}
            {actions}
          </View>
        </View>
        {prompt ? <Text style={styles.prompt}>{prompt}</Text> : null}
        <View style={styles.body}>{children}</View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Pressable
        role="button"
        testID={testID}
        onPress={onFocusRequest}
        style={({ pressed }) => styles.compact(pressed)}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.side}>
            {status}
            {meta}
          </View>
        </View>
        <Text numberOfLines={2} style={hasAnswer ? styles.answer : styles.answerEmpty}>
          {hasAnswer ? answer : emptyLabel}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    borderRadius: theme.radius.card,
    borderWidth: theme["border-width"].hairline,
    borderColor: "transparent",
    variants: {
      focused: {
        true: {
          backgroundColor: theme.color.surface.raised,
          borderColor: theme.color.border.strong,
          padding: theme.density.spacious["panel-padding"],
        },
        false: {},
      },
    },
  },
  compact: (pressed: boolean) => ({
    gap: theme.density.compact.gap,
    minHeight: theme.scale.component["target-min"],
    paddingVertical: theme.density.regular["cell-padding-y"],
    paddingHorizontal: theme.density.regular["cell-padding-x"],
    borderRadius: theme.radius.card,
    backgroundColor: pressed ? theme.color.surface.hover : "transparent",
  }),
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.density.regular.gap,
  },
  title: {
    ...fontStyle(theme, "label"),
    flexShrink: 1,
    color: theme.color.text.secondary,
    textTransform: "uppercase",
    variants: { focused: { true: { color: theme.color.text.primary }, false: {} } },
  },
  side: { flexDirection: "row", alignItems: "center", gap: theme.density.regular.gap },
  prompt: {
    ...fontStyle(theme, "body-long"),
    marginTop: theme.density.regular.gap,
    color: theme.color.text.primary,
  },
  body: { gap: theme.density.spacious["field-gap"], marginTop: theme.density.regular["block-gap"] },
  answer: { ...fontStyle(theme, "body-sm"), color: theme.color.text.secondary },
  answerEmpty: { ...fontStyle(theme, "body-sm"), color: theme.color.text.placeholder },
}));
