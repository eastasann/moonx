import type { ComponentSize } from "@moonx/ui-tokens";
import { Asterisk, type LucideIcon } from "lucide-react-native";
import {
  Children,
  createContext,
  forwardRef,
  isValidElement,
  type ReactNode,
  useContext,
  useEffect,
} from "react";
import {
  Pressable,
  type PressableProps,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { FormContext } from "./FormContext";
import { KeyboardSafeAreaContext } from "./KeyboardSafeAreaContext";
import { atLeastTarget, sizeVariants } from "./sizes";
import { fontStyle } from "./typography";

/**
 * Props every field-like component shares. Strings come from the screen (packages/i18n);
 * the component has no text of its own.
 */
export interface FieldProps {
  label: ReactNode;
  description?: ReactNode;
  /** Shown only while `isInvalid` is true, so it can stay set while the field is valid. */
  errorMessage?: ReactNode;
  isInvalid?: boolean;
  /**
   * Marks the label with an asterisk. React Native has no `aria-required`, so assistive
   * technology is not told; the screen's `errorMessage` carries the rule.
   */
  isRequired?: boolean;
  /**
   * Keeps the label as the accessible name and does not draw it, for a field whose meaning is
   * clear from its surroundings, such as a cell under a column heading.
   */
  isLabelHidden?: boolean;
  size?: ComponentSize;
}

/** What `FieldRoot` tells the parts inside it, so they do not each need the same props. */
interface FieldState {
  size: ComponentSize;
  isDisabled: boolean;
  isInvalid: boolean;
}

const FieldContext = createContext<FieldState>({ size: "M", isDisabled: false, isInvalid: false });

/** Size, disabled and invalid state of the nearest `FieldRoot` (M, false, false outside one). */
export function useFieldState(): FieldState {
  return useContext(FieldContext);
}

/**
 * The plain text of a node: strings and numbers as they are, elements by their children. Used to
 * build accessible names from a `label` that may be a node.
 */
export function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return Children.toArray(node as ReactNode)
    .map(textOf)
    .join("");
}

/**
 * Accessibility props for the interactive element of a field (TextInput or a trigger
 * Pressable). The label becomes `aria-label` because React Native cannot point an input at a
 * label view on iOS; the description and, while invalid, the error message are read as the hint.
 */
export function fieldAccessibility({
  label,
  description,
  errorMessage,
  isInvalid,
  ariaLabel,
}: Pick<FieldProps, "label" | "description" | "errorMessage" | "isInvalid"> & {
  /** Overrides the name taken from `label`. */
  ariaLabel?: string;
}) {
  const hint = [textOf(description), isInvalid ? textOf(errorMessage) : ""]
    .filter((part) => part !== "")
    .join(". ");
  return {
    "aria-label": ariaLabel ?? textOf(label),
    accessibilityHint: hint === "" ? undefined : hint,
  };
}

/** The column that holds label, input and help text. It fills the width of its parent. */
export function FieldRoot({
  size = "M",
  isDisabled = false,
  isInvalid = false,
  children,
}: {
  size?: ComponentSize;
  isDisabled?: boolean;
  isInvalid?: boolean;
  children: ReactNode;
}) {
  styles.useVariants({ size });
  return (
    <FieldContext.Provider value={{ size, isDisabled, isInvalid }}>
      <View style={styles.root}>{children}</View>
    </FieldContext.Provider>
  );
}

/**
 * The visible label. It renders nothing when `isLabelHidden` is set: the input's `aria-label`
 * (from `fieldAccessibility`) already carries the name, and the label text would be read twice.
 * The asterisk is hidden from assistive technology.
 */
export function FieldLabel({
  children,
  isRequired,
  isLabelHidden,
  id,
}: {
  id?: string;
  children: ReactNode;
  isRequired?: boolean;
  isLabelHidden?: boolean;
}) {
  const { size, isDisabled } = useFieldState();
  styles.useVariants({ size, disabled: isDisabled });
  if (isLabelHidden) return null;
  return (
    <View style={styles.labelRow}>
      <Text nativeID={id} style={styles.label}>
        {children}
      </Text>
      {isRequired ? (
        <View aria-hidden importantForAccessibility="no-hide-descendants">
          <Asterisk size={styles.asterisk.width} color={styles.asterisk.color} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Description and error text under a field. The error appears only while `isInvalid` and is
 * announced when it appears (`accessibilityLiveRegion`); the description stays.
 */
export function FieldHelp({
  description,
  errorMessage,
  isInvalid = false,
}: Pick<FieldProps, "description" | "errorMessage" | "isInvalid">) {
  return (
    <>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {isInvalid && errorMessage ? (
        <Text role="alert" accessibilityLiveRegion="polite" style={styles.error}>
          {errorMessage}
        </Text>
      ) : null}
    </>
  );
}

/**
 * The frame of every text-like field: border, background, padding and the minimum touch height.
 * Reads size, disabled and invalid from `FieldRoot`. The caller reports focus (`isFocused`)
 * because React Native has no `:focus-within`. Put an input or value text in it, plus
 * `FieldIcon` / `FieldInlineButton` beside it.
 */
export function FieldFrame({
  isFocused = false,
  multiline = false,
  children,
}: {
  isFocused?: boolean;
  /** Taller frame that aligns its content to the top, for TextArea. */
  multiline?: boolean;
  children: ReactNode;
}) {
  const { size, isDisabled, isInvalid } = useFieldState();
  styles.useVariants({
    size,
    disabled: isDisabled,
    invalid: isInvalid,
    focused: isFocused,
    multiline,
  });
  return <View style={styles.frame}>{children}</View>;
}

/**
 * `FieldFrame` as a button, for Picker, ComboBox and DatePicker whose box opens a tray. Takes
 * the pressable props the screen part needs (`onPress`, `role`, `aria-expanded`, ...). Disabled
 * follows `FieldRoot`.
 */
export function FieldPressableFrame({
  isFocused = false,
  children,
  ...props
}: Omit<PressableProps, "style" | "children" | "disabled"> & {
  isFocused?: boolean;
  children: ReactNode;
}) {
  const { size, isDisabled, isInvalid } = useFieldState();
  styles.useVariants({ size, disabled: isDisabled, invalid: isInvalid, focused: isFocused });
  const frame = styles.frame;
  const pressed = styles.framePressed;
  return (
    <Pressable
      {...props}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      style={({ pressed: down }) => [frame, down ? pressed : null]}
    >
      {children}
    </Pressable>
  );
}

/**
 * A borderless TextInput for inside a `FieldFrame`. Everything React Native's TextInput takes
 * passes through. Disabled and size come from `FieldRoot`; a disabled field or `readOnly` is not
 * editable. Inside `KeyboardSafeArea` it scrolls itself clear of the keyboard on focus, and inside
 * `Form` a single-line one takes part in the return-key submit.
 */
export const FieldInput = forwardRef<
  TextInput,
  Omit<TextInputProps, "style" | "placeholderTextColor"> & {
    /** Reports focus changes so the field can pass `isFocused` to its frame. */
    onFocusChange?: (isFocused: boolean) => void;
    /** Tabular figures, for NumberField. */
    numeric?: boolean;
    /**
     * Height of a multiline input as measured from its content (TextArea). The frame, not the
     * input, carries the vertical padding, because Android and iOS disagree on whether
     * `contentSize` includes padding.
     */
    contentHeight?: number;
  }
>(function FieldInput(
  { onFocusChange, onFocus, onBlur, onSubmitEditing, numeric = false, contentHeight, ...props },
  ref,
) {
  const { size, isDisabled } = useFieldState();
  const keyboard = useContext(KeyboardSafeAreaContext);
  const form = useContext(FormContext);
  const multiline = props.multiline === true;
  styles.useVariants({ size, disabled: isDisabled, multiline, numeric });

  useEffect(() => (multiline ? undefined : form?.registerField()), [form, multiline]);

  return (
    <TextInput
      {...props}
      ref={ref}
      editable={!isDisabled && props.editable !== false && props.readOnly !== true}
      placeholderTextColor={styles.placeholder.color}
      style={
        contentHeight === undefined ? styles.input : [styles.input, styles.grown(contentHeight)]
      }
      onFocus={(event) => {
        onFocusChange?.(true);
        keyboard?.reveal();
        onFocus?.(event);
      }}
      onBlur={(event) => {
        onFocusChange?.(false);
        onBlur?.(event);
      }}
      onSubmitEditing={(event) => {
        onSubmitEditing?.(event);
        if (!multiline) form?.submitFromField();
      }}
    />
  );
});

/** An icon at the start of a field box, in the muted text color and the field's icon size. */
export function FieldIcon({ icon: Icon }: { icon: LucideIcon }) {
  const { size } = useFieldState();
  styles.useVariants({ size });
  return (
    <View aria-hidden importantForAccessibility="no-hide-descendants">
      <Icon size={styles.icon.width} color={styles.icon.color} />
    </View>
  );
}

/**
 * A small button inside a field box (clear, open). The pressable is at least the touch target
 * wide and tall; the negative margin keeps it from making the box taller. `children` is an icon,
 * usually from `FieldIcon`'s size via `useFieldIconProps`.
 */
export function FieldInlineButton({
  children,
  ...props
}: Omit<PressableProps, "style" | "children"> & { "aria-label": string; children: ReactNode }) {
  const { isDisabled } = useFieldState();
  const base = styles.inlineButton;
  const pressed = styles.inlineButtonPressed;
  return (
    <Pressable
      role="button"
      {...props}
      disabled={isDisabled || props.disabled === true}
      style={({ pressed: down }) => [base, down ? pressed : null]}
    >
      {children}
    </Pressable>
  );
}

/** Size and color of the icons the field draws, for icons placed inside `FieldInlineButton`. */
export function useFieldIconProps(): { size: number; color: string } {
  const { size } = useFieldState();
  styles.useVariants({ size });
  return { size: styles.icon.width, color: styles.icon.color };
}

/**
 * Text that stands where an input would, for a field whose value is picked elsewhere (Picker,
 * DatePicker). `isPlaceholder` uses the placeholder color.
 */
export function FieldValueText({
  children,
  isPlaceholder = false,
}: {
  children: ReactNode;
  isPlaceholder?: boolean;
}) {
  const { size, isDisabled } = useFieldState();
  styles.useVariants({ size, disabled: isDisabled, placeholder: isPlaceholder });
  return (
    <Text numberOfLines={1} style={styles.value}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create((theme) => {
  const field = theme.scale.component.field;
  const target = theme.scale.component["target-min"];
  const color = theme.color;
  const iconSize = theme.scale.component.icon.size;
  const disabledFrame = {
    backgroundColor: color.control.disabled,
    borderColor: color.border.hairline,
  };
  return {
    root: {
      alignSelf: "stretch",
      minWidth: 0,
      variants: { size: sizeVariants((s) => ({ gap: field["label-gap"][s] })) },
    },
    labelRow: { flexDirection: "row", alignItems: "center", gap: theme.space["50"] },
    label: {
      ...fontStyle(theme, "label"),
      color: color.text.primary,
      variants: {
        size: sizeVariants((s) => ({ fontSize: field["font-size"][s] })),
        disabled: { true: { color: color.text.disabled }, false: {} },
      },
    },
    asterisk: { width: iconSize.XS, color: color.text.primary },
    description: { ...fontStyle(theme, "caption"), color: color.text.secondary },
    error: { ...fontStyle(theme, "caption"), color: color.negative.fg },
    frame: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "stretch",
      gap: theme.space["100"],
      backgroundColor: color.surface.raised,
      borderWidth: theme["border-width"].strong,
      borderColor: color.border.strong,
      borderRadius: theme.radius.control,
      outlineStyle: "solid",
      outlineWidth: 0,
      outlineColor: color.border.focus,
      outlineOffset: theme["border-width"]["focus-offset"],
      variants: {
        size: sizeVariants((s) => ({
          minHeight: atLeastTarget(field.height[s], target),
          paddingHorizontal: field["padding-x"][s],
        })),
        multiline: {
          true: {
            minHeight: field["text-area-min-height"],
            alignItems: "flex-start",
            paddingVertical: theme.space["100"],
          },
          false: {},
        },
        invalid: { true: { borderColor: color.negative.fg }, false: {} },
        focused: { true: { outlineWidth: theme["border-width"]["focus-ring"] }, false: {} },
        disabled: { true: disabledFrame, false: {} },
      },
    },
    framePressed: { borderColor: color.text.secondary },
    input: {
      ...fontStyle(theme, "body"),
      flex: 1,
      minWidth: 0,
      alignSelf: "stretch",
      padding: 0,
      color: color.text.primary,
      variants: {
        size: sizeVariants((s) => ({ fontSize: field["font-size"][s] })),
        multiline: {
          true: { textAlignVertical: "top" },
          false: {},
        },
        numeric: { true: fontStyle(theme, "number"), false: {} },
        disabled: { true: { color: color.text.disabled }, false: {} },
      },
    },
    grown: (height: number) => ({ height }),
    placeholder: { color: color.text.placeholder },
    value: {
      ...fontStyle(theme, "body"),
      flex: 1,
      minWidth: 0,
      color: color.text.primary,
      variants: {
        size: sizeVariants((s) => ({ fontSize: field["font-size"][s] })),
        placeholder: { true: { color: color.text.placeholder }, false: {} },
        disabled: { true: { color: color.text.disabled }, false: {} },
      },
    },
    icon: {
      width: iconSize.M,
      color: color.text.secondary,
      variants: { size: sizeVariants((s) => ({ width: iconSize[s] })) },
    },
    inlineButton: {
      alignItems: "center",
      justifyContent: "center",
      minWidth: target,
      minHeight: target,
      marginVertical: -theme.space["75"],
      borderRadius: theme.radius.control,
    },
    inlineButtonPressed: { backgroundColor: color.surface.hover },
  };
});
