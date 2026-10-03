import { Check } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Content } from "../../internal/Content";
import { fontStyle } from "../../internal/typography";
import { type CardKey, useCardView } from "../CardView/CardView";

export interface CardProps {
  /** Identity of the card in the surrounding CardView's selection and `onAction`. */
  id: CardKey;
  /**
   * Plain text of the card, used as the accessible name of a pressable card. Required because
   * the content is arbitrary.
   */
  textValue: string;
  isDisabled?: boolean;
  /**
   * Called when the card is pressed outside selection. The Web part's `href` is not accepted:
   * navigation on the phone is the Expo Router link's job, called from here.
   */
  onAction?: () => void;
  testID?: string;
  children: ReactNode;
}

/**
 * A card in a CardView. It can be selected (the CardView's `selectionMode`) or be pressable
 * (`onAction`, or the CardView's `onAction`), and a multiple-selection CardView shows a check
 * mark on every selected card. A pressable card is one accessibility element, so controls
 * placed inside it are not reachable by a screen reader: give such controls to the screen
 * outside the card.
 */
export function Card({ id, textValue, isDisabled = false, onAction, testID, children }: CardProps) {
  const { theme } = useUnistyles();
  const view = useCardView();
  const mode = view?.selectionMode ?? "none";
  const selected = view?.isSelected(id) ?? false;
  const disabled = isDisabled || (view?.isDisabled(id) ?? false);
  const isPressable = onAction !== undefined || (view?.isActionable ?? false);
  styles.useVariants({ selected, disabled });

  const body = (
    <>
      {mode === "multiple" ? (
        <View aria-hidden style={styles.checkbox}>
          {selected ? (
            <Check
              size={theme.scale.component.checkbox["control-size"].M}
              color={theme.color.control["on-primary"]}
              strokeWidth={theme.icon["stroke-width"]}
            />
          ) : null}
        </View>
      ) : null}
      <View style={styles.content}>
        <Content textStyle={styles.text} iconSize={styles.icon.width}>
          {children}
        </Content>
      </View>
    </>
  );

  if (!isPressable) {
    return (
      <View role="listitem" testID={testID} style={styles.card(false)}>
        {body}
      </View>
    );
  }

  const press = () => {
    if (onAction && mode === "none") onAction();
    else view?.press(id);
  };
  return (
    <Pressable
      role={mode === "multiple" ? "checkbox" : "button"}
      aria-label={textValue}
      aria-selected={mode === "none" ? undefined : selected}
      aria-checked={mode === "multiple" ? selected : undefined}
      aria-disabled={disabled}
      testID={testID}
      disabled={disabled}
      onPress={press}
      style={({ pressed }) => styles.card(pressed)}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: (pressed: boolean) => ({
    minWidth: 0,
    minHeight: theme.scale.component["target-min"],
    padding: theme.space["300"],
    backgroundColor: pressed ? theme.color.surface.hover : theme.color.surface.raised,
    borderWidth: theme["border-width"].hairline,
    borderColor: theme.color.border.hairline,
    borderRadius: theme.radius.card,
    boxShadow: [
      {
        offsetX: theme.shadow.raised.offsetX,
        offsetY: theme.shadow.raised.offsetY,
        blurRadius: theme.shadow.raised.blur,
        spreadDistance: theme.shadow.raised.spread,
        color: theme.shadow.raised.color,
      },
    ],
    variants: {
      selected: {
        true: {
          backgroundColor: theme.color.surface.selected,
          borderColor: theme.color.control["track-fill"],
        },
        false: {},
      },
      disabled: { true: {}, false: {} },
    },
  }),
  content: { gap: theme.space["100"], minWidth: 0 },
  text: {
    ...fontStyle(theme, "body"),
    color: theme.color.text.primary,
    variants: { disabled: { true: { color: theme.color.text.disabled }, false: {} } },
  },
  checkbox: {
    position: "absolute",
    top: theme.space["200"],
    right: theme.space["200"],
    alignItems: "center",
    justifyContent: "center",
    width: theme.scale.component.checkbox["control-size"].M,
    height: theme.scale.component.checkbox["control-size"].M,
    borderWidth: theme["border-width"].strong,
    borderRadius: theme.radius.chip,
    variants: {
      selected: {
        true: {
          backgroundColor: theme.color.control.primary,
          borderColor: theme.color.control.primary,
        },
        false: {
          backgroundColor: theme.color.surface.raised,
          borderColor: theme.color.border.strong,
        },
      },
    },
  },
  icon: { width: theme.scale.component.icon.size.S },
}));
