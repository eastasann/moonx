import type { FormEventHandler, ReactNode } from "react";
import { Form as AriaForm } from "react-aria-components";
import { form } from "./Form.css";

export interface FormProps {
  /** Name of the form landmark. */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** Lets a button outside the form (a dialog's footer) submit it through its `form` attribute. */
  id?: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
}

/**
 * Stacks fields and a submit button. It turns browser validation off: the screen validates with
 * its Zod schema and passes each field its `errorMessage`.
 */
export function Form({ children, ...props }: FormProps) {
  return (
    <AriaForm {...props} validationBehavior="aria" className={form}>
      {children}
    </AriaForm>
  );
}
