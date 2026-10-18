import { i18n } from "@moonx/i18n";
import {
  Button,
  type ButtonProps,
  Picker,
  type PickerProps,
  TextArea,
  type TextAreaProps,
  TextField,
  type TextFieldProps,
} from "@moonx/ui-web";
import { createFormHook, createFormHookContexts } from "@tanstack/react-form";
import { useCallback, useRef, useState } from "react";
import type { z } from "zod";
import { ApiError } from "./api";
import { AuthError } from "./auth";
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

/**
 * A TextField that takes its value from its form field and shows the field's reason, or
 * else the reason the API gave when it refused what the form let through
 * (`useRejectedFields`).
 */
function FormTextField({
  rejection,
  ...props
}: Omit<
  TextFieldProps,
  "value" | "onChange" | "onBlur" | "name" | "errorMessage" | "isInvalid"
> & { rejection?: string }) {
  const field = useFieldContext<string>();
  const error = useFieldError() ?? rejection;
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

/** A TextArea bound to its form field, as FormTextField is. */
function FormTextArea(
  props: Omit<
    TextAreaProps,
    "value" | "onChange" | "onBlur" | "name" | "errorMessage" | "isInvalid"
  >,
) {
  const field = useFieldContext<string>();
  const error = useFieldError();
  return (
    <TextArea
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
 * `TextField`, `TextArea` or `Picker`, and `form.AppForm` a `SubmitButton`.
 */
export const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextField: FormTextField,
    TextArea: FormTextArea,
    Picker: FormPicker,
  },
  formComponents: { SubmitButton },
});

/**
 * Sends one at a time (design-spec 6.0.6: no second send): a submit while one is out
 * waits for that one. TanStack Form lets a second submit through once the first attempt
 * is over its own check, and a form of one text field submits on Enter while its button
 * is pending.
 */
export function useOneAtATime(): (send: () => Promise<void>) => Promise<void> {
  const current = useRef<Promise<void> | null>(null);
  return useCallback((send) => {
    current.current ??= send().finally(() => {
      current.current = null;
    });
    return current.current;
  }, []);
}

/**
 * The fields of a form that a 422 VALIDATION_FAILED names (SDD 8.1 `details`; Better
 * Auth's carries none, and then names the form's one field). The form checks with the
 * same schemas before it sends (SDD 7.2), so this is the API's last guard (SDD 8.2): the
 * reason goes under the field all the same, in the words of a format the details cannot
 * word more closely (they carry no bounds).
 */
export function useRejectedFields<Name extends string>(
  fields: readonly Name[],
) {
  const [rejected, setRejected] = useState<readonly Name[]>([]);
  /** Takes the failure; false when it names none of the fields. */
  const reject = (error: unknown): boolean => {
    let names: Name[] = [];
    if (error instanceof ApiError && error.code === "VALIDATION_FAILED") {
      const details = Array.isArray(error.detail.details)
        ? (error.detail.details as { path?: unknown }[])
        : [];
      names = fields.filter((name) =>
        details.some(({ path }) => path === name),
      );
    } else if (
      error instanceof AuthError &&
      error.code === "VALIDATION_FAILED" &&
      fields.length === 1
    ) {
      names = [...fields];
    }
    setRejected(names);
    return names.length > 0;
  };
  return {
    reject,
    /**
     * Clears the reason of `name`, which changed, or all of them for the next send: the
     * API is asked again.
     */
    clear: (name?: string) =>
      setRejected((names) =>
        name === undefined ? [] : names.filter((rejected) => rejected !== name),
      ),
    /** The reason under `name`, while the API's refusal stands. */
    rejectionOf: (name: Name) =>
      rejected.includes(name) ? i18n.t("errors:input.format") : undefined,
  };
}
