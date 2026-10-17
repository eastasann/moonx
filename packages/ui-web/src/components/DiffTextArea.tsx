import type { Size } from "@moonx/ui-tokens";
import { useRef } from "react";
import {
  TextArea as AriaTextArea,
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
} from "react-aria-components";
import {
  FieldHelp,
  FieldLabel,
  type FieldTextProps,
  invalidOf,
} from "../internal/FieldHelp";
import * as field from "../internal/field.css";
import { useSize } from "../internal/size";
import { useAutoGrow } from "../internal/useAutoGrow";
import { useDiff } from "../internal/useDiff";
import { useKeepAboveKeyboard } from "../internal/useKeepAboveKeyboard";
import * as styles from "./DiffTextArea.css";

export interface DiffTextAreaProps
  extends FieldTextProps,
    Pick<
      AriaTextFieldProps,
      | "name"
      | "isDisabled"
      | "isReadOnly"
      | "isRequired"
      | "autoFocus"
      | "id"
      | "aria-label"
      | "aria-labelledby"
      | "aria-describedby"
    > {
  /** The text it is compared with: the current answer ("" when there is none). */
  before: string;
  /** The text being edited: the imported answer. */
  value: string;
  onChange: (value: string) => void;
  /** TextArea's steps. @default "M"; "L" in a spacious pattern, dialog or `Form` */
  size?: Size;
}

/**
 * A TextArea that keeps marking what it adds to `before` while it is edited (design-spec
 * 4.5・6.7, s25-import.html "Imported · you can edit"): the added characters underlined on
 * the sunken surface, worked out again as the text changes. The marks are drawn behind
 * the text, which stays an ordinary text area; they are not read out, as DiffText's
 * parts are not.
 */
export function DiffTextArea({
  label,
  description,
  descriptionTone,
  errorMessage,
  isInvalid,
  before,
  value,
  onChange,
  size,
  ...props
}: DiffTextAreaProps) {
  const resolved = useSize(size);
  const frameRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  useKeepAboveKeyboard(frameRef);
  useAutoGrow(areaRef, value);
  const parts = useDiff(before, value);
  return (
    <AriaTextField
      {...props}
      value={value}
      onChange={onChange}
      isInvalid={invalidOf({ errorMessage, isInvalid })}
      validationBehavior="aria"
      className={field.fieldRoot({ size: resolved, width: "full" })}
    >
      {label != null && (
        <FieldLabel label={label} isRequired={props.isRequired} />
      )}
      <div
        ref={frameRef}
        className={`${styles.frame} ${styles.size[resolved]}`}
      >
        <div aria-hidden="true" className={styles.marks}>
          {parts === null
            ? value
            : parts.map((part, index) => {
                const key = `${index}:${part.kind}`;
                if (part.kind === "delete") return null;
                return part.kind === "insert" ? (
                  <ins key={key} className={styles.added}>
                    {part.text}
                  </ins>
                ) : (
                  <span key={key}>{part.text}</span>
                );
              })}
          {/* A last line break in the text needs a line under it here too. */}
          {"​"}
        </div>
        <AriaTextArea ref={areaRef} rows={1} className={styles.area} />
      </div>
      <FieldHelp
        description={description}
        descriptionTone={descriptionTone}
        errorMessage={errorMessage}
      />
    </AriaTextField>
  );
}
