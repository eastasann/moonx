import { Check } from "lucide-react-native";
import { Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { fontStyle } from "../../internal/typography";

export interface StepItem {
  id: string;
  label: string;
}

export interface StepsProps {
  /** Name of the step indicator. */
  "aria-label": string;
  items: readonly StepItem[];
  /** `id` of the step being shown. Steps before it count as done. */
  current: string;
  /** Spoken after the label of a finished step ("completed"), which the check mark alone does not say. */
  doneLabel?: string;
  testID?: string;
}

type Status = "done" | "current" | "upcoming";

/**
 * The 1 → 2 → 3 indicator of a fixed sequence of steps (layout pattern G). The state is carried
 * by shape as well as color: a check in a filled ring for done, a filled disc for the current
 * step, an empty ring for the rest. The current step is
 * exposed as `selected`, the nearest of React Native's states to the Web part's `aria-current`.
 * Steps wrap to a second line when the labels do not fit one.
 */
export function Steps({ items, current, doneLabel, "aria-label": ariaLabel, testID }: StepsProps) {
  const currentIndex = items.findIndex((item) => item.id === current);
  return (
    <View role="list" aria-label={ariaLabel} testID={testID} style={styles.list}>
      {items.map((item, index) => {
        const status: Status =
          index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming";
        return (
          <Step
            key={item.id}
            label={item.label}
            doneLabel={doneLabel}
            number={index + 1}
            status={status}
            isLast={index === items.length - 1}
          />
        );
      })}
    </View>
  );
}

function Step({
  label,
  doneLabel,
  number,
  status,
  isLast,
}: {
  label: string;
  doneLabel?: string;
  number: number;
  status: Status;
  isLast: boolean;
}) {
  const { theme } = useUnistyles();
  styles.useVariants({ status });
  return (
    <View
      accessible
      role="listitem"
      aria-label={status === "done" && doneLabel ? `${label}, ${doneLabel}` : undefined}
      accessibilityState={{ selected: status === "current" }}
      testID={`step-${status}`}
      style={styles.step}
    >
      <View aria-hidden style={styles.marker}>
        {status === "done" ? (
          <Check
            size={theme.scale.component.icon.size.XS}
            color={styles.markerText.color}
            strokeWidth={theme.icon["stroke-width"]}
          />
        ) : (
          <Text style={styles.markerText}>{number}</Text>
        )}
      </View>
      <Text style={styles.label}>{label}</Text>
      {isLast ? null : <View aria-hidden style={styles.connector} />}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  list: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.space["200"],
  },
  step: { flexDirection: "row", alignItems: "center", gap: theme.space["100"] },
  marker: {
    alignItems: "center",
    justifyContent: "center",
    width: theme.scale.component.avatar.size.S,
    height: theme.scale.component.avatar.size.S,
    borderRadius: theme.radius.pill,
    borderWidth: theme["border-width"].strong,
    borderColor: theme.color.border.strong,
    variants: {
      status: {
        done: {
          backgroundColor: theme.color.positive.bg,
          borderColor: theme.color.positive.strong,
        },
        current: {
          backgroundColor: theme.color.control.primary,
          borderColor: theme.color.control.primary,
        },
        upcoming: {},
      },
    },
  },
  markerText: {
    ...fontStyle(theme, "label"),
    fontVariant: ["tabular-nums"],
    color: theme.color.text.secondary,
    variants: {
      status: {
        done: { color: theme.color.positive.fg },
        current: { color: theme.color.control["on-primary"] },
        upcoming: {},
      },
    },
  },
  label: {
    ...fontStyle(theme, "label"),
    color: theme.color.text.secondary,
    variants: {
      status: {
        done: {},
        current: { color: theme.color.text.primary },
        upcoming: {},
      },
    },
  },
  connector: {
    width: theme.space["500"],
    borderTopWidth: theme["border-width"].hairline,
    borderTopColor: theme.color.border.strong,
  },
}));
