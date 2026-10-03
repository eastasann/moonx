import type { ComponentSize } from "@moonx/ui-tokens";
import { X } from "lucide-react-native";
import { createContext, type ReactNode, useContext } from "react";
import { Text as NativeText, Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Content } from "../../internal/Content";
import { atLeastTarget, sizeVariants } from "../../internal/sizes";
import { fontStyle } from "../../internal/typography";

interface TagContextValue {
  size: ComponentSize;
  removeLabel: string | undefined;
  onRemove: ((ids: string[]) => void) | undefined;
}

const TagContext = createContext<TagContextValue>({
  size: "M",
  removeLabel: undefined,
  onRemove: undefined,
});

interface TagGroupBase {
  description?: ReactNode;
  /** Rendered only while `isInvalid` is true, so it can stay set while the group is valid. */
  errorMessage?: ReactNode;
  isInvalid?: boolean;
  size?: ComponentSize;
  /** Required. `Tag` items only. */
  children: ReactNode;
  testID?: string;
}

interface TagGroupWithLabel extends TagGroupBase {
  label: ReactNode;
  "aria-label"?: string;
}

interface TagGroupWithAriaLabel extends TagGroupBase {
  label?: undefined;
  "aria-label": string;
}

/**
 * Same props as the Web part. `onRemove` makes every tag removable and receives the `id`s of
 * the removed tags; the screen drops them from its list. `removeLabel` is the accessible name of
 * each remove button, and the tag's text is appended to it ("Remove Alpha").
 */
export type TagGroupProps = (TagGroupWithLabel | TagGroupWithAriaLabel) &
  (
    | { onRemove?: undefined; removeLabel?: string }
    | { onRemove: (ids: string[]) => void; removeLabel: string }
  );

export function TagGroup({
  label,
  description,
  errorMessage,
  isInvalid,
  size = "M",
  onRemove,
  removeLabel,
  children,
  testID,
  "aria-label": ariaLabel,
}: TagGroupProps) {
  styles.useVariants({ size });
  return (
    <TagContext.Provider value={{ size, removeLabel, onRemove }}>
      <View
        role="group"
        aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
        testID={testID}
        style={styles.root}
      >
        {label ? <NativeText style={styles.label}>{label}</NativeText> : null}
        <View role="list" style={styles.list}>
          {children}
        </View>
        {description ? <NativeText style={styles.description}>{description}</NativeText> : null}
        {isInvalid && errorMessage ? (
          <NativeText accessibilityLiveRegion="polite" style={styles.error}>
            {errorMessage}
          </NativeText>
        ) : null}
      </View>
    </TagContext.Provider>
  );
}

export interface TagProps {
  id: string;
  children: ReactNode;
  /** Plain text of the tag. Needed when `children` is not a string. */
  textValue?: string;
  isDisabled?: boolean;
}

export function Tag({ id, children, textValue, isDisabled = false }: TagProps) {
  // Subscribes to theme changes: the icon color below is read from the style at render time.
  useUnistyles();
  const { size, removeLabel, onRemove } = useContext(TagContext);
  styles.useVariants({ size, disabled: isDisabled });
  const text = textValue ?? (typeof children === "string" ? children : "");
  return (
    <View role="listitem" style={styles.tag}>
      <Content textStyle={styles.tagText} iconSize={styles.removeIcon.width}>
        {children}
      </Content>
      {onRemove ? (
        <Pressable
          role="button"
          aria-label={[removeLabel, text].filter(Boolean).join(" ")}
          aria-disabled={isDisabled}
          disabled={isDisabled}
          onPress={() => onRemove([id])}
          style={({ pressed }) => styles.remove(pressed)}
        >
          <X
            aria-hidden
            color={styles.tagText.color}
            size={styles.removeIcon.width}
            strokeWidth={styles.removeIcon.strokeWidth}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => {
  const field = theme.scale.component.field;
  const colors = theme.color;
  return {
    root: {
      gap: theme.space["75"],
      variants: {
        size: sizeVariants((s) => ({ gap: field["label-gap"][s] })),
      },
    },
    label: {
      ...fontStyle(theme, "label"),
      color: colors.text.primary,
    },
    description: { ...fontStyle(theme, "caption"), color: colors.text.secondary },
    error: { ...fontStyle(theme, "caption"), color: colors.negative.fg },
    list: { flexDirection: "row", flexWrap: "wrap", gap: theme.space["100"] },
    tag: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space["75"],
      backgroundColor: colors.control.secondary,
      borderRadius: theme.radius.chip,
      variants: {
        size: sizeVariants((s) => ({
          minHeight: atLeastTarget(
            theme.scale.component["action-button"].height[s],
            theme.scale.component["target-min"],
          ),
          paddingLeft: field["padding-x"][s],
          paddingRight: field["padding-x"][s],
        })),
        disabled: { true: {}, false: {} },
      },
    },
    tagText: {
      ...fontStyle(theme, "label"),
      color: colors.control["on-secondary"],
      variants: {
        size: sizeVariants((s) => ({ fontSize: field["font-size"][s] })),
        disabled: { true: { color: colors.text.disabled }, false: {} },
      },
    },
    // The remove button is a full touch target that overlaps the tag's padding, so the tag
    // itself can stay at the size the Web part has.
    remove: (pressed: boolean) => ({
      alignItems: "center",
      justifyContent: "center",
      minWidth: theme.scale.component["target-min"],
      minHeight: theme.scale.component["target-min"],
      marginRight: -theme.space["75"],
      borderRadius: theme.radius.chip,
      backgroundColor: pressed ? colors.control["secondary-pressed"] : "transparent",
    }),
    removeIcon: {
      width: theme.scale.component.icon.size.S,
      strokeWidth: theme.icon["stroke-width"],
    },
  };
});
