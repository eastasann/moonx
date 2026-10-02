import type { ReactNode } from "react";
import {
  choiceHelp,
  description as descriptionClass,
  errorMessage as errorClass,
} from "./field.css";

/** Description and error text of a single Checkbox or Switch, tied to it through `aria-describedby`. */
export function ChoiceHelp({
  descriptionId,
  errorId,
  description,
  errorMessage,
  isInvalid,
  indentClassName,
}: {
  descriptionId: string;
  errorId: string;
  description?: ReactNode;
  errorMessage?: ReactNode;
  isInvalid?: boolean;
  indentClassName: string;
}) {
  const showError = Boolean(isInvalid && errorMessage);
  if (!description && !showError) return null;
  return (
    <div className={`${choiceHelp} ${indentClassName}`}>
      {description ? (
        <span id={descriptionId} className={descriptionClass}>
          {description}
        </span>
      ) : null}
      {showError ? (
        <span id={errorId} className={errorClass}>
          {errorMessage}
        </span>
      ) : null}
    </div>
  );
}

/** The `aria-describedby` value for the ids that are actually rendered. */
export function describedBy({
  descriptionId,
  errorId,
  description,
  errorMessage,
  isInvalid,
}: {
  descriptionId: string;
  errorId: string;
  description?: ReactNode;
  errorMessage?: ReactNode;
  isInvalid?: boolean;
}): string | undefined {
  const ids = [description ? descriptionId : null, isInvalid && errorMessage ? errorId : null];
  const joined = ids.filter(Boolean).join(" ");
  return joined || undefined;
}
