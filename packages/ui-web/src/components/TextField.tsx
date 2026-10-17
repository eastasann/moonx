import type { Size } from "@moonx/ui-tokens";
import { useContext, useRef } from "react";
import {
  TextArea as AriaTextArea,
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
  Input,
} from "react-aria-components";
import { AnswerFieldContext } from "../internal/answerField";
import {
  FieldHelp,
  FieldLabel,
  type FieldTextProps,
  invalidOf,
} from "../internal/FieldHelp";
import * as styles from "../internal/field.css";
import { useFieldWidth, useSize } from "../internal/size";
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
  /** @default "M"; "L" in a spacious pattern, dialog or `Form` (06 semantic.density) */
  size?: Size;
  /**
   * `full` fills the line, `fill` grows into the rest of a line (9's invitation, beside
   * its role); otherwise the size's default width.
   * @default "default"
   */
  width?: "default" | "full" | "fill";
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
  descriptionTone,
  errorMessage,
  isInvalid,
  size,
  width: givenWidth,
  placeholder,
  inputMode,
  ...props
}: TextFieldProps) {
  const resolved = useSize(size);
  const width = useFieldWidth(givenWidth);
  const frameRef = useRef<HTMLDivElement>(null);
  useKeepAboveKeyboard(frameRef);
  return (
    <AriaTextField
      {...props}
      isInvalid={invalidOf({ errorMessage, isInvalid })}
      validationBehavior="aria"
      className={styles.fieldRoot({ size: resolved, width })}
    >
      {label != null && (
        <FieldLabel label={label} isRequired={props.isRequired} />
      )}
      <div ref={frameRef} className={styles.frame({ size: resolved })}>
        <Input
          className={styles.input}
          placeholder={placeholder}
          inputMode={inputMode}
        />
      </div>
      <FieldHelp
        description={description}
        descriptionTone={descriptionTone}
        errorMessage={errorMessage}
      />
    </AriaTextField>
  );
}

export interface TextAreaProps extends TextFieldBaseProps {
  /**
   * A reason to write (19's "Why?" and M4's reason, design-spec 4.5): it starts taller,
   * with room for a few lines (06 field.text-area-reason-min-height, s19-decision.html).
   */
  isReason?: boolean;
}

/**
 * A multi-line text input that grows with its content (design-spec 4.5), for long
 * answers, reasons and comments.
 */
export function TextArea({
  label,
  description,
  descriptionTone,
  errorMessage,
  isInvalid,
  size,
  width: givenWidth,
  placeholder,
  isReason = false,
  ...props
}: TextAreaProps) {
  const resolved = useSize(size);
  const width = useFieldWidth(givenWidth);
  const isAnswer = useContext(AnswerFieldContext);
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
      {label != null && (
        <FieldLabel label={label} isRequired={props.isRequired} />
      )}
      <div
        ref={frameRef}
        className={`${styles.areaFrame({ size: resolved })}${
          isAnswer ? ` ${styles.answerFrame}` : ""
        }`}
      >
        <AriaTextArea
          ref={areaRef}
          className={
            isAnswer
              ? `${styles.textArea} ${styles.answerArea}`
              : isReason
                ? `${styles.textArea} ${styles.reasonArea}`
                : styles.textArea
          }
          placeholder={placeholder}
          rows={1}
        />
      </div>
      <FieldHelp
        description={description}
        descriptionTone={descriptionTone}
        errorMessage={errorMessage}
      />
    </AriaTextField>
  );
}
