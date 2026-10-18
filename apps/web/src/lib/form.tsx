import {
  Button,
  type ButtonProps,
  Picker,
  type PickerProps,
  TextField,
  type TextFieldProps,
} from "@moonx/ui-web";
import { createFormHook, createFormHookContexts } from "@tanstack/react-form";
import type { z } from "zod";
import { inputIssueMessage } from "./input-issues";

const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();

/**
 * The reason a field shows under it (design-spec 6.0.6「入力値が範囲外」): its first issue,
 * once the user has been in the field, so a form does not open in red. The validators
 * are the shared Zod schemas (SDD 7.2), whose issues reach the field as they are.
 */
function useFieldError(): string | undefined {
  const field = useFieldContext<unknown>();
  const [issue] = field.state.meta.errors as (z.core.$ZodIssue | undefined)[];
  if (issue === undefined || !field.state.meta.isTouched) return undefined;
  return inputIssueMessage(issue);
}

/** A TextField that takes its value from its form field and shows the field's reason. */
function FormTextField(
  props: Omit<
    TextFieldProps,
    "value" | "onChange" | "onBlur" | "name" | "errorMessage" | "isInvalid"
  >,
) {
  const field = useFieldContext<string>();
  const error = useFieldError();
  return (
    <TextField
      {...props}
      name={field.name}
      value={field.state.value}
      onChange={field.handleChange}
      onBlur={field.handleBlur}
      isInvalid={error !== undefined}
      errorMessage={error}
    />
  );
}

/**
 * A Picker that takes its value from its form field: the chosen item's id. A choice is
 * final when made, so it counts as leaving the field (its reason shows at once).
 */
function FormPicker(
  props: Omit<
    PickerProps,
    "value" | "onChange" | "name" | "errorMessage" | "isInvalid"
  >,
) {
  const field = useFieldContext<string>();
  const error = useFieldError();
  return (
    <Picker
      {...props}
      name={field.name}
      value={field.state.value}
      onChange={(value) => {
        field.handleChange(value ?? "");
        field.handleBlur();
      }}
      isInvalid={error !== undefined}
      errorMessage={error}
    />
  );
}

/**
 * The form's submit button (design-spec 6.0.6, the modals' rules): it cannot be pressed
 * while a field breaks its rules, a required one left empty included, and shows that it
 * is working while the form is sent, which also stops a second send. `isDisabled` stops it
 * for the screen's own reasons (offline).
 */
function SubmitButton({
  isDisabled = false,
  ...props
}: Omit<ButtonProps, "type" | "isPending">) {
  const form = useFormContext();
  return (
    <form.Subscribe
      selector={(state) => [state.canSubmit, state.isSubmitting] as const}
    >
      {([canSubmit, isSubmitting]) => (
        <Button
          {...props}
          type="submit"
          isDisabled={isDisabled || !canSubmit}
          isPending={isSubmitting}
        />
      )}
    </form.Subscribe>
  );
}

/**
 * TanStack Form bound to the components of packages/ui-web: `form.AppField` renders a
 * `TextField` or `Picker`, and `form.AppForm` a `SubmitButton`.
 */
export const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField: FormTextField, Picker: FormPicker },
  formComponents: { SubmitButton },
});
