import { type ReactNode, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { FormContext, type FormContextValue } from "../../internal/FormContext";

export interface FormProps {
  /** Name of the form landmark. */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /**
   * Called when the form is submitted: by `useFormSubmit()`'s function (a submit `Button`'s
   * `onPress`), or by the keyboard's return key when the form has exactly one single-line input
   * (the same rule as HTML's implicit submission). Unlike the Web's, it gets no event.
   */
  onSubmit: () => void;
  children: ReactNode;
}

/**
 * Stacks fields and a submit button. Like the Web part it does no validation of its own: the
 * screen validates with its Zod schema and passes each field its `errorMessage`. The phone has no
 * browser validation to turn off, and no `<form>`: there is no `id` / `form` attribute for a
 * button outside the form (a tray's footer), so such a button calls the function from
 * `useFormSubmit()` in a component rendered inside the Form, or the screen's own submit handler.
 * For keyboard handling wrap the screen in `KeyboardSafeArea`.
 */
export function Form({ children, onSubmit, ...props }: FormProps) {
  const fields = useRef(0);
  const latest = useRef(onSubmit);
  useEffect(() => {
    latest.current = onSubmit;
  });
  const value = useMemo<FormContextValue>(
    () => ({
      registerField: () => {
        fields.current += 1;
        return () => {
          fields.current -= 1;
        };
      },
      submitFromField: () => {
        if (fields.current === 1) latest.current();
      },
      submit: () => latest.current(),
    }),
    [],
  );
  return (
    <FormContext.Provider value={value}>
      <View role="form" {...props} style={styles.form}>
        {children}
      </View>
    </FormContext.Provider>
  );
}

/**
 * The function that submits the nearest `Form`, for a submit button's `onPress`. Throws outside a
 * `Form`, because a submit button that does nothing is a bug to find early.
 */
export function useFormSubmit(): () => void {
  const form = useContext(FormContext);
  if (!form) throw new Error("useFormSubmit must be used inside a Form");
  return useCallback(() => form.submit(), [form]);
}

const styles = StyleSheet.create((theme) => ({
  form: { alignSelf: "stretch", gap: theme.density.spacious["field-gap"] },
}));
