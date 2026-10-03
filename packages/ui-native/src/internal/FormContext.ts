import { createContext } from "react";

/**
 * What `Form` offers to the fields and buttons inside it. `registerField` is called by every
 * single-line input so `Form` can tell whether the keyboard's return key submits (HTML's implicit
 * submission: only when the form has exactly one such input).
 */
export interface FormContextValue {
  registerField: () => () => void;
  /** Return key pressed in a single-line input. */
  submitFromField: () => void;
  submit: () => void;
}

export const FormContext = createContext<FormContextValue | null>(null);
