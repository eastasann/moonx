import { Text as NativeText } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { fontStyle } from "../../internal/typography";

/** One run of a character-level diff. */
export interface DiffSegment {
  kind: "same" | "added" | "removed";
  text: string;
}

export interface DiffTextProps {
  /** The diff to draw, in text order. */
  segments: readonly DiffSegment[];
  /** `before` draws the unchanged and removed runs, `after` the unchanged and added runs. */
  side: "before" | "after";
}

/**
 * One side of a text change (PNL-2) with the changed characters underlined (added) or struck
 * through (removed), so the meaning does not rest on color alone. React Native has no
 * insertion / deletion role, so a screen reader reads the text without telling the changes apart.
 */
export function DiffText({ segments, side }: DiffTextProps) {
  const hidden = side === "before" ? "added" : "removed";
  return (
    <NativeText style={styles.diffText}>
      {segments
        .filter((segment) => segment.kind !== hidden)
        .map((segment, index) => {
          const key = `${index}:${segment.kind}`;
          return (
            <NativeText
              key={key}
              style={segment.kind === "same" ? undefined : styles[segment.kind]}
            >
              {segment.text}
            </NativeText>
          );
        })}
    </NativeText>
  );
}

const styles = StyleSheet.create((theme) => ({
  diffText: { ...fontStyle(theme, "body-sm"), color: theme.color.text.primary },
  added: {
    backgroundColor: theme.color.positive.bg,
    color: theme.color.positive.fg,
    textDecorationLine: "underline",
  },
  removed: {
    backgroundColor: theme.color.negative.bg,
    color: theme.color.negative.fg,
    textDecorationLine: "line-through",
  },
}));
