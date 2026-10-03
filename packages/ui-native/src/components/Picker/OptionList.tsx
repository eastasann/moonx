import type { ComponentSize } from "@moonx/ui-tokens";
import { Check, ChevronDown } from "lucide-react-native";
import {
  Children,
  createContext,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useContext,
} from "react";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Content } from "../../internal/Content";
import {
  FieldPressableFrame,
  FieldValueText,
  textOf,
  useFieldIconProps,
} from "../../internal/FieldParts";
import { atLeastTarget, sizeVariants } from "../../internal/sizes";
import { fontStyle } from "../../internal/typography";

export interface OptionItemProps {
  id: string;
  children: ReactNode;
  /** Plain text of the option, used for filtering and the selected value. Needed when `children` is not a string. */
  textValue?: string;
  isDisabled?: boolean;
}

interface OptionState {
  size: ComponentSize;
  selectedId: string | null;
  disabledIds: ReadonlySet<string>;
  choose: (id: string) => void;
}

/**
 * The tray's content is rendered by the bottom sheet outside the field's React tree, so the rows
 * cannot read the field's context. `OptionList` provides this one inside the tray.
 */
const OptionContext = createContext<OptionState>({
  size: "M",
  selectedId: null,
  disabledIds: new Set(),
  choose: () => {},
});

/** Plain text of an option: `textValue`, else the text of `children`. */
export function optionText({ textValue, children }: OptionItemProps): string {
  return textValue ?? textOf(children);
}

/** Case- and accent-insensitive "contains", the default filter of ComboBox and MentionTextArea. */
export function containsText(text: string, query: string): boolean {
  const fold = (value: string) =>
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
  return fold(text).includes(fold(query));
}

/**
 * The `OptionItem` elements among `children`, looking through fragments. Other children are
 * ignored, as the Web parts accept `PickerItem` / `ComboBoxItem` only.
 */
export function collectOptions(children: ReactNode): ReactElement<OptionItemProps>[] {
  const found: ReactElement<OptionItemProps>[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return;
    if (child.type === Fragment) found.push(...collectOptions(child.props.children));
    else if (child.type === OptionItem) found.push(child as ReactElement<OptionItemProps>);
  });
  return found;
}

/**
 * A list of `OptionItem` rows in a tray. Rows are at least the touch target high, the chosen one
 * carries a check icon and `aria-selected`. React Native's `Role` has no `listbox`, so the
 * container is a `list`; the rows keep the `option` role.
 */
export function OptionList({
  options,
  size,
  selectedId,
  disabledIds,
  onChoose,
  "aria-label": ariaLabel,
}: {
  options: readonly ReactElement<OptionItemProps>[];
  size: ComponentSize;
  selectedId: string | null;
  disabledIds?: ReadonlySet<string>;
  onChoose: (id: string) => void;
  "aria-label": string;
}) {
  return (
    <OptionContext.Provider
      value={{ size, selectedId, disabledIds: disabledIds ?? EMPTY, choose: onChoose }}
    >
      <View role="list" aria-label={ariaLabel}>
        {options.map((option) => (
          <Fragment key={option.props.id}>{option}</Fragment>
        ))}
      </View>
    </OptionContext.Provider>
  );
}

const EMPTY: ReadonlySet<string> = new Set();

/** One row of a Picker or ComboBox list. The size comes from the surrounding field. */
export function OptionItem({ id, children, textValue, isDisabled = false }: OptionItemProps) {
  // Subscribes to theme changes: the icon color below is read from the style at render time.
  useUnistyles();
  const state = useContext(OptionContext);
  const blocked = isDisabled || state.disabledIds.has(id);
  const selected = state.selectedId === id;
  styles.useVariants({ size: state.size, disabled: blocked });
  const row = styles.row;
  const pressed = styles.rowPressed;
  const text = styles.text;
  const check = styles.check;
  return (
    <Pressable
      role="option"
      aria-label={textValue}
      aria-selected={selected}
      aria-disabled={blocked}
      disabled={blocked}
      onPress={() => state.choose(id)}
      style={({ pressed: down }) => [row, down ? pressed : null]}
    >
      <View style={styles.rowLabel}>
        <Content textStyle={text} iconSize={check.width}>
          {children}
        </Content>
      </View>
      {selected ? (
        <Check aria-hidden color={text.color} size={check.width} strokeWidth={check.strokeWidth} />
      ) : null}
    </Pressable>
  );
}

function Chevron() {
  const { size, color } = useFieldIconProps();
  return <ChevronDown aria-hidden size={size} color={color} />;
}

/**
 * The closed look of Picker, ComboBox and DatePicker: the field box with the chosen text (or the
 * placeholder) and a trailing icon. It is the `trigger` of a `Tray`, which injects `onPress`.
 */
export function OptionTrigger({
  text,
  placeholder,
  isOpen,
  onPress,
  role,
  trailing,
  accessibility,
  testID,
}: {
  text: string;
  placeholder?: string;
  isOpen: boolean;
  onPress?: () => void;
  role: "button" | "combobox";
  /** Replaces the chevron. */
  trailing?: ReactNode;
  accessibility: { "aria-label": string; accessibilityHint?: string };
  testID?: string;
}) {
  return (
    <FieldPressableFrame
      {...accessibility}
      role={role}
      testID={testID}
      aria-expanded={isOpen}
      accessibilityValue={text === "" ? undefined : { text }}
      onPress={onPress}
    >
      <FieldValueText isPlaceholder={text === ""}>
        {text === "" ? placeholder : text}
      </FieldValueText>
      {trailing ?? <Chevron />}
    </FieldPressableFrame>
  );
}

const styles = StyleSheet.create((theme) => {
  const field = theme.scale.component.field;
  return {
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space["100"],
      borderRadius: theme.radius.control,
      variants: {
        size: sizeVariants((s) => ({
          minHeight: atLeastTarget(field.height[s], theme.scale.component["target-min"]),
          paddingHorizontal: field["padding-x"][s],
        })),
        disabled: { true: {}, false: {} },
      },
    },
    rowPressed: { backgroundColor: theme.color.surface.sunken },
    rowLabel: { flex: 1 },
    text: {
      ...fontStyle(theme, "body"),
      color: theme.color.text.primary,
      variants: {
        size: sizeVariants((s) => ({ fontSize: field["font-size"][s] })),
        disabled: { true: { color: theme.color.text.disabled }, false: {} },
      },
    },
    check: {
      width: theme.scale.component.icon.size.S,
      strokeWidth: theme.icon["stroke-width"],
    },
  };
});
