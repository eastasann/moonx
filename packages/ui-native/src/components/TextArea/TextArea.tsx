import { useState } from "react";
import {
  FieldFrame,
  FieldHelp,
  FieldInput,
  FieldLabel,
  FieldRoot,
  fieldAccessibility,
} from "../../internal/FieldParts";
import { useControlledState } from "../../internal/useControlledState";
import type { TextFieldProps } from "../TextField";

export interface TextAreaProps
  extends Omit<TextFieldProps, "type" | "inputMode" | "onSubmit" | "enterKeyHint"> {}

/**
 * Grows with its content, from the token's minimum height; there is no scrollbar. The return key
 * inserts a line break, so there is no `onSubmit`.
 */
export function TextArea({
  label,
  description,
  errorMessage,
  isInvalid,
  isRequired,
  isLabelHidden,
  size = "M",
  placeholder,
  autoComplete,
  autoFocus,
  isDisabled = false,
  isReadOnly = false,
  maxLength,
  onFocus,
  onBlur,
  value,
  defaultValue = "",
  onChange,
  "aria-label": ariaLabel,
  testID,
}: TextAreaProps) {
  const [text, setText] = useControlledState(value, defaultValue, onChange);
  const [focused, setFocused] = useState(false);
  const [contentHeight, setContentHeight] = useState<number | undefined>(undefined);
  return (
    <FieldRoot size={size} isDisabled={isDisabled} isInvalid={isInvalid}>
      <FieldLabel isRequired={isRequired} isLabelHidden={isLabelHidden}>
        {label}
      </FieldLabel>
      <FieldFrame isFocused={focused} multiline>
        <FieldInput
          {...fieldAccessibility({ label, description, errorMessage, isInvalid, ariaLabel })}
          testID={testID}
          multiline
          scrollEnabled={false}
          contentHeight={contentHeight}
          onContentSizeChange={(event) => setContentHeight(event.nativeEvent.contentSize.height)}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          readOnly={isReadOnly}
          maxLength={maxLength}
          onFocusChange={setFocused}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </FieldFrame>
      <FieldHelp description={description} errorMessage={errorMessage} isInvalid={isInvalid} />
    </FieldRoot>
  );
}
