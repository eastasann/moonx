import { type ComponentProps, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { TextArea as AriaTextArea, TextField as AriaTextField } from "react-aria-components";
import { FieldHelp, FieldLabel } from "../_internal/FieldParts";
import { box, fieldRoot, textArea } from "../_internal/field.css";
import type { TextFieldProps } from "../TextField";

export interface TextAreaProps extends Omit<TextFieldProps, "type" | "inputMode"> {}

/** Grows with its content; there is no scrollbar and no resize handle. */
export function TextArea({
  label,
  description,
  errorMessage,
  isRequired,
  size = "M",
  placeholder,
  ...props
}: TextAreaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fitHeight = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, []);
  // Runs after every render so a `value` changed from outside also resizes the field.
  useLayoutEffect(fitHeight);
  // A narrower field wraps the text onto more lines, so the height depends on the width too.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let width = el.offsetWidth;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? el.offsetWidth;
      if (next === width) return;
      width = next;
      fitHeight();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fitHeight]);
  const onInput: ComponentProps<typeof AriaTextArea>["onInput"] = fitHeight;
  return (
    <AriaTextField
      {...props}
      isRequired={isRequired}
      validationBehavior="aria"
      className={fieldRoot({ size })}
    >
      <FieldLabel isRequired={isRequired} size={size}>
        {label}
      </FieldLabel>
      <AriaTextArea
        ref={ref}
        rows={1}
        placeholder={placeholder}
        onInput={onInput}
        className={`${box({ size })} ${textArea}`}
      />
      <FieldHelp description={description} errorMessage={errorMessage} />
    </AriaTextField>
  );
}
