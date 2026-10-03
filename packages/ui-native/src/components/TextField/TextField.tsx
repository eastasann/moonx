import type { ComponentSize } from "@moonx/ui-tokens";
import { useState } from "react";
import type { TextInputProps } from "react-native";
import {
  FieldFrame,
  FieldHelp,
  FieldInput,
  FieldLabel,
  type FieldProps,
  FieldRoot,
  fieldAccessibility,
} from "../../internal/FieldParts";
import { useControlledState } from "../../internal/useControlledState";

export type TextFieldType = "text" | "email" | "password" | "search" | "tel" | "url";

export interface TextFieldProps extends FieldProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  /** Picks the keyboard, auto-capitalization and (for `password`) hides the text. */
  type?: TextFieldType;
  /** Overrides the keyboard `type` implies. */
  inputMode?: TextInputProps["inputMode"];
  autoComplete?: TextInputProps["autoComplete"];
  autoFocus?: boolean;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  maxLength?: number;
  onFocus?: () => void;
  onBlur?: () => void;
  /** The keyboard's return key. Inside a `Form` with this one input it also submits the form. */
  onSubmit?: () => void;
  /** Label of the return key. */
  enterKeyHint?: TextInputProps["enterKeyHint"];
  /** Accessible name when it must differ from `label`. */
  "aria-label"?: string;
  testID?: string;
  size?: ComponentSize;
}

const INPUT_MODE: Record<TextFieldType, TextInputProps["inputMode"]> = {
  text: "text",
  email: "email",
  password: "text",
  search: "search",
  tel: "tel",
  url: "url",
};

/**
 * Like the Web part, it shows the `isInvalid` and `errorMessage` it is given and never validates
 * (the screen runs its Zod schema). The Web's `name`, `id`, `pattern`, `minLength`, `validate`
 * and key handlers have no use on the phone, where no form is submitted by the platform.
 */
export function TextField({
  label,
  description,
  errorMessage,
  isInvalid,
  isRequired,
  isLabelHidden,
  size = "M",
  placeholder,
  type = "text",
  inputMode,
  autoComplete,
  autoFocus,
  isDisabled = false,
  isReadOnly = false,
  maxLength,
  onFocus,
  onBlur,
  onSubmit,
  enterKeyHint,
  value,
  defaultValue = "",
  onChange,
  "aria-label": ariaLabel,
  testID,
}: TextFieldProps) {
  const [text, setText] = useControlledState(value, defaultValue, onChange);
  const [focused, setFocused] = useState(false);
  return (
    <FieldRoot size={size} isDisabled={isDisabled} isInvalid={isInvalid}>
      <FieldLabel isRequired={isRequired} isLabelHidden={isLabelHidden}>
        {label}
      </FieldLabel>
      <FieldFrame isFocused={focused}>
        <FieldInput
          {...fieldAccessibility({ label, description, errorMessage, isInvalid, ariaLabel })}
          testID={testID}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          inputMode={inputMode ?? INPUT_MODE[type]}
          secureTextEntry={type === "password"}
          autoCapitalize={type === "text" ? undefined : "none"}
          autoCorrect={type === "text" ? undefined : false}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          readOnly={isReadOnly}
          maxLength={maxLength}
          enterKeyHint={enterKeyHint}
          onFocusChange={setFocused}
          onFocus={onFocus}
          onBlur={onBlur}
          onSubmitEditing={onSubmit}
        />
      </FieldFrame>
      <FieldHelp description={description} errorMessage={errorMessage} isInvalid={isInvalid} />
    </FieldRoot>
  );
}
