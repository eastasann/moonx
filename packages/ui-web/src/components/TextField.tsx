import type { Size } from "@moonx/ui-tokens";
import { useRef } from "react";
import {
  TextArea as AriaTextArea,
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
  Input,
  Label,
} from "react-aria-components";
import {
  FieldHelp,
  type FieldTextProps,
  invalidOf,
} from "../internal/FieldHelp";
import * as styles from "../internal/field.css";
import { useSize } from "../internal/size";
import { useAutoGrow } from "../internal/useAutoGrow";
import { useKeepAboveKeyboard } from "../internal/useKeepAboveKeyboard";

/** Props TextField and TextArea share. */
export interface TextFieldBaseProps
  extends FieldTextProps,
    Pick<
      AriaTextFieldProps,
      | "value"
      | "defaultValue"
      | "onChange"
      | "onBlur"
      | "onFocus"
      | "name"
      | "isDisabled"
      | "isReadOnly"
      | "isRequired"
      | "autoFocus"
      | "autoComplete"
      | "id"
      | "aria-label"
      | "aria-labelledby"
      | "aria-describedby"
    > {
  /** @default "M", or "L" inside a spacious `Form` */
  size?: Size;
  /** `full` fills the line; otherwise the size's default width. @default "default" */
  width?: "default" | "full";
  placeholder?: string;
}

export interface TextFieldProps extends TextFieldBaseProps {
  /** @default "text" */
  type?: "text" | "email" | "password" | "url" | "tel" | "search";
  inputMode?: "text" | "email" | "url" | "tel" | "search";
}

/** A one-line text input with its label and help (design-spec 4.5). */
export function TextField({
  label,
  description,
  errorMessage,
  isInvalid,
  size,
  width = "default",
  placeholder,
  inputMode,
  ...props
}: TextFieldProps) {
  const resolved = useSize(size);
  const frameRef = useRef<HTMLDivElement>(null);
  useKeepAboveKeyboard(frameRef);
  return (
    <AriaTextField
      {...props}
      isInvalid={invalidOf({ errorMessage, isInvalid })}
      validationBehavior="aria"
      className={styles.fieldRoot({ size: resolved, width })}
    >
      {label != null && <Label className={styles.label}>{label}</Label>}
      <div ref={frameRef} className={styles.frame({ size: resolved })}>
        <Input
          className={styles.input}
          placeholder={placeholder}
          inputMode={inputMode}
        />
      </div>
      <FieldHelp description={description} errorMessage={errorMessage} />
    </AriaTextField>
  );
}

export interface TextAreaProps extends TextFieldBaseProps {}

/**
 * A multi-line text input that grows with its content (design-spec 4.5), for long
 * answers, reasons and comments.
 */
export function TextArea({
  label,
  description,
  errorMessage,
  isInvalid,
  size,
  width = "default",
  placeholder,
  ...props
}: TextAreaProps) {
  const resolved = useSize(size);
  const frameRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  useKeepAboveKeyboard(frameRef);
  useAutoGrow(areaRef, props.value);
  return (
    <AriaTextField
      {...props}
      isInvalid={invalidOf({ errorMessage, isInvalid })}
      validationBehavior="aria"
      className={styles.fieldRoot({ size: resolved, width })}
    >
      {label != null && <Label className={styles.label}>{label}</Label>}
      <div ref={frameRef} className={styles.areaFrame({ size: resolved })}>
        <AriaTextArea
          ref={areaRef}
          className={styles.textArea}
          placeholder={placeholder}
          rows={1}
        />
      </div>
      <FieldHelp description={description} errorMessage={errorMessage} />
    </AriaTextField>
  );
}
