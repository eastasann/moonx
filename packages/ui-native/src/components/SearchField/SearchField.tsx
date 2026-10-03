import type { ComponentSize } from "@moonx/ui-tokens";
import { Search, X } from "lucide-react-native";
import { useRef, useState } from "react";
import type { TextInput } from "react-native";
import {
  FieldFrame,
  FieldHelp,
  FieldIcon,
  FieldInlineButton,
  FieldInput,
  FieldLabel,
  type FieldProps,
  FieldRoot,
  fieldAccessibility,
  useFieldIconProps,
} from "../../internal/FieldParts";
import { useControlledState } from "../../internal/useControlledState";

export interface SearchFieldProps extends FieldProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** The keyboard's search key. */
  onSubmit?: (value: string) => void;
  /** Called after the clear button emptied the field. */
  onClear?: () => void;
  placeholder?: string;
  /** Accessible name of the clear button. */
  clearLabel: string;
  autoFocus?: boolean;
  isDisabled?: boolean;
  /** Accessible name when it must differ from `label`. */
  "aria-label"?: string;
  testID?: string;
  size?: ComponentSize;
}

function ClearIcon() {
  const { size, color } = useFieldIconProps();
  return <X size={size} color={color} />;
}

/**
 * A text field with a search icon and a clear button that shows while there is text. The Web
 * part's Escape-to-clear has no phone equivalent; the clear button is the way. The clear button
 * returns focus to the input so the keyboard stays up.
 */
export function SearchField({
  label,
  description,
  errorMessage,
  isInvalid,
  isRequired,
  isLabelHidden,
  size = "M",
  placeholder,
  clearLabel,
  autoFocus,
  isDisabled = false,
  value,
  defaultValue = "",
  onChange,
  onSubmit,
  onClear,
  "aria-label": ariaLabel,
  testID,
}: SearchFieldProps) {
  const [text, setText] = useControlledState(value, defaultValue, onChange);
  const [focused, setFocused] = useState(false);
  const input = useRef<TextInput>(null);
  return (
    <FieldRoot size={size} isDisabled={isDisabled} isInvalid={isInvalid}>
      <FieldLabel isRequired={isRequired} isLabelHidden={isLabelHidden}>
        {label}
      </FieldLabel>
      <FieldFrame isFocused={focused}>
        <FieldIcon icon={Search} />
        <FieldInput
          {...fieldAccessibility({ label, description, errorMessage, isInvalid, ariaLabel })}
          ref={input}
          testID={testID}
          role="searchbox"
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          inputMode="search"
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={autoFocus}
          onFocusChange={setFocused}
          onSubmitEditing={() => onSubmit?.(text)}
        />
        {text === "" ? null : (
          <FieldInlineButton
            aria-label={clearLabel}
            onPress={() => {
              setText("");
              onClear?.();
              input.current?.focus();
            }}
          >
            <ClearIcon />
          </FieldInlineButton>
        )}
      </FieldFrame>
      <FieldHelp description={description} errorMessage={errorMessage} isInvalid={isInvalid} />
    </FieldRoot>
  );
}
