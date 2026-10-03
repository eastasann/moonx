import type { ComponentSize } from "@moonx/ui-tokens";
import { Search } from "lucide-react-native";
import { type ReactNode, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  FieldFrame,
  FieldHelp,
  FieldIcon,
  FieldInput,
  FieldLabel,
  type FieldProps,
  FieldRoot,
  fieldAccessibility,
  textOf,
} from "../../internal/FieldParts";
import { fontStyle } from "../../internal/typography";
import { useControlledState } from "../../internal/useControlledState";
import { Button } from "../Button";
import {
  collectOptions,
  containsText,
  OptionItem,
  type OptionItemProps,
  OptionList,
  OptionTrigger,
  optionText,
} from "../Picker/OptionList";
import { Tray } from "../Tray";

interface ComboBoxBase extends FieldProps {
  placeholder?: string;
  /** The `id` of the chosen item, or `null` when the text matches none. */
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string | null) => void;
  /** The text shown in the field, for a screen that controls it. */
  inputValue?: string;
  defaultInputValue?: string;
  /** Called with the text of the chosen item, or with the confirmed text of a custom value. */
  onInputChange?: (value: string) => void;
  /**
   * Read as the hint of the field, which opens the list when pressed. The Web part names a
   * separate open button; on the phone the whole field is that button.
   */
  openLabel: string;
  /** Shown in the tray when the typed text matches nothing. */
  emptyMessage?: string;
  /** `ComboBoxItem` elements, placed directly or inside fragments. */
  children: ReactNode;
  /** Decides which items the typed text keeps. Defaults to a case- and accent-insensitive "contains". */
  defaultFilter?: (textValue: string, inputValue: string) => boolean;
  onOpenChange?: (isOpen: boolean) => void;
  isDisabled?: boolean;
  /** Read-only shows the value and does not open the tray, so it looks and acts disabled, as on the Web. */
  isReadOnly?: boolean;
  /** Accessible name when it must differ from `label`. */
  "aria-label"?: string;
  testID?: string;
}

/** `customValueLabel` is the label of the tray's "use this text" action, so it is required with `allowsCustomValue`. */
export type ComboBoxProps = ComboBoxBase &
  (
    | { allowsCustomValue?: false; customValueLabel?: string }
    | { allowsCustomValue: true; customValueLabel: string }
  );

export type ComboBoxItemProps = OptionItemProps;
export const ComboBoxItem = OptionItem;

/**
 * Closed, it looks like the input; pressing it opens a tray with its own input that filters the
 * list (design-spec 4.5), as the Web part does below the tablet width. The phone has only this
 * form. The Web `name`, `autoFocus`, `menuTrigger` and collection props have no use here.
 *
 * With `allowsCustomValue` the typed text is a valid value, so `onChange` reports `null` and the
 * text is read from `onInputChange`. The text is confirmed with the keyboard's return key or the
 * `customValueLabel` button, and `onInputChange` fires once, on confirmation.
 */
export function ComboBox({
  label,
  description,
  errorMessage,
  isInvalid,
  isRequired,
  isLabelHidden,
  isDisabled = false,
  isReadOnly = false,
  size = "M",
  placeholder,
  value,
  defaultValue = null,
  onChange,
  inputValue,
  defaultInputValue = "",
  onInputChange,
  allowsCustomValue,
  customValueLabel,
  openLabel,
  emptyMessage,
  defaultFilter = containsText,
  onOpenChange,
  children,
  "aria-label": ariaLabel,
  testID,
}: ComboBoxProps) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useControlledState<string | null>(value, defaultValue);
  const [customText, setCustomText] = useState(defaultInputValue);
  const options = collectOptions(children);
  const texts = new Map(options.map((option) => [option.props.id, optionText(option.props)]));
  const shownText = inputValue ?? (key === null ? customText : (texts.get(key) ?? ""));
  const name = ariaLabel ?? textOf(label);

  const changeOpen = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  const choose = (id: string) => {
    setKey(id);
    setCustomText("");
    onChange?.(id);
    onInputChange?.(texts.get(id) ?? "");
    changeOpen(false);
  };
  const confirmText = (text: string) => {
    setKey(null);
    setCustomText(text);
    onChange?.(null);
    onInputChange?.(text);
    changeOpen(false);
  };

  const access = fieldAccessibility({ label, description, errorMessage, isInvalid, ariaLabel });
  const hint = [openLabel, access.accessibilityHint].filter(Boolean).join(". ");

  return (
    <FieldRoot size={size} isDisabled={isDisabled || isReadOnly} isInvalid={isInvalid}>
      <FieldLabel isRequired={isRequired} isLabelHidden={isLabelHidden}>
        {label}
      </FieldLabel>
      <Tray
        aria-label={name}
        isOpen={open}
        onOpenChange={changeOpen}
        trigger={
          <OptionTrigger
            role="combobox"
            isOpen={open}
            text={shownText}
            placeholder={placeholder}
            testID={testID}
            accessibility={{ "aria-label": access["aria-label"], accessibilityHint: hint }}
          />
        }
      >
        <TrayBody
          label={name}
          size={size}
          initialQuery={allowsCustomValue ? shownText : ""}
          selectedId={key}
          allowsCustomValue={allowsCustomValue === true}
          customValueLabel={customValueLabel}
          emptyMessage={emptyMessage}
          filter={defaultFilter}
          onChoose={choose}
          onUseText={confirmText}
        >
          {children}
        </TrayBody>
      </Tray>
      <FieldHelp description={description} errorMessage={errorMessage} isInvalid={isInvalid} />
    </FieldRoot>
  );
}

/**
 * Mounted only while the tray is open, so the query starts from `initialQuery` each time. It
 * sets up its own `FieldRoot` because the tray is rendered outside the field's React tree.
 */
function TrayBody({
  label,
  size,
  initialQuery,
  selectedId,
  allowsCustomValue,
  customValueLabel,
  emptyMessage,
  filter,
  onChoose,
  onUseText,
  children,
}: {
  label: string;
  size: ComponentSize;
  initialQuery: string;
  selectedId: string | null;
  allowsCustomValue: boolean;
  customValueLabel: string | undefined;
  emptyMessage: string | undefined;
  filter: (textValue: string, inputValue: string) => boolean;
  onChoose: (id: string) => void;
  onUseText: (text: string) => void;
  children: ReactNode;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [focused, setFocused] = useState(false);
  const canUseText = allowsCustomValue && query.trim() !== "";
  const matches = collectOptions(children).filter((option) =>
    filter(optionText(option.props), query),
  );
  return (
    <View style={styles.body}>
      <View style={styles.searchRow}>
        <View style={styles.searchInput}>
          <FieldRoot size={size}>
            <FieldFrame isFocused={focused}>
              <FieldIcon icon={Search} />
              <FieldInput
                aria-label={label}
                autoFocus
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType={allowsCustomValue ? "done" : "search"}
                onFocusChange={setFocused}
                onSubmitEditing={() => {
                  if (canUseText) onUseText(query.trim());
                }}
              />
            </FieldFrame>
          </FieldRoot>
        </View>
        {allowsCustomValue && customValueLabel ? (
          <Button
            variant="secondary"
            size={size}
            isDisabled={!canUseText}
            onPress={() => onUseText(query.trim())}
          >
            {customValueLabel}
          </Button>
        ) : null}
      </View>
      {matches.length === 0 && emptyMessage ? (
        <Text accessibilityLiveRegion="polite" style={styles.empty}>
          {emptyMessage}
        </Text>
      ) : (
        <OptionList
          aria-label={label}
          options={matches}
          size={size}
          selectedId={selectedId}
          onChoose={onChoose}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  body: { gap: theme.space["100"] },
  searchRow: { flexDirection: "row", alignItems: "center", gap: theme.space["100"] },
  searchInput: { flex: 1, minWidth: 0 },
  empty: {
    ...fontStyle(theme, "body-sm"),
    color: theme.color.text.secondary,
    paddingVertical: theme.space["100"],
  },
}));
