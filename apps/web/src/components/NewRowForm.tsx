import { Button, Flex, Form, InlineAlert, Stack } from "@moonx/ui-web";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorText } from "../lib/error-text";
import {
  type Draft,
  draftOf,
  type FieldProblem,
  type FieldSpec,
  fieldBody,
  fullBody,
} from "../lib/row-fields";
import { RowFields } from "./RowFields";

export interface NewRowFormProps<Row> {
  /** Names the form for assistive technology, such as "New competitor". */
  label: string;
  specs: readonly FieldSpec[];
  /** Values the form starts with, such as today's date for a research log entry. */
  initial?: Draft;
  currency: string;
  timeZone: string;
  submitLabel: string;
  /** Sends the row to the API. Only valid fields are in the body. */
  create: (body: Record<string, unknown>) => Promise<Row>;
  onCreated: (row: Row) => void;
  onCancel: () => void;
  /** The key of the field that takes the cursor. */
  autoFocusKey: string;
}

/**
 * The form of a row that does not exist yet (design-spec 6.10). A row is created once its
 * required field is filled, so a list never holds an unnamed row that would count as a
 * competitor or a risk; after that the row is edited with autosave like every other.
 */
export function NewRowForm<Row>({
  label,
  specs,
  initial,
  currency,
  timeZone,
  submitLabel,
  create,
  onCreated,
  onCancel,
  autoFocusKey,
}: NewRowFormProps<Row>) {
  const { t } = useTranslation(["research", "app"]);
  const [draft, setDraft] = useState<Draft>(() => ({ ...draftOf(specs, {}), ...initial }));
  const submit = useMutation({ mutationFn: create, onSuccess: onCreated });

  const problems: Partial<Record<string, FieldProblem>> = {};
  let isComplete = true;
  for (const spec of specs) {
    const result = fieldBody(spec, draft);
    if (!("problem" in result)) continue;
    isComplete = false;
    // An empty required field is shown by the disabled button, not as an error before any typing.
    if (result.problem !== "required") problems[spec.key] = result.problem;
  }

  return (
    <Form
      aria-label={label}
      onSubmit={(event) => {
        event.preventDefault();
        if (isComplete) submit.mutate(fullBody(specs, draft));
      }}
    >
      <Stack gap="space-300">
        {submit.error ? (
          <InlineAlert variant="negative" heading={errorText(t, submit.error)} />
        ) : null}
        <RowFields
          specs={specs}
          values={draft}
          problems={problems}
          isReadOnly={false}
          currency={currency}
          timeZone={timeZone}
          autoFocusKey={autoFocusKey}
          onChange={(key, value) => setDraft((prev) => ({ ...prev, [key]: value }))}
        />
        <Flex gap="space-100" wrap>
          <Button
            type="submit"
            isDisabled={!isComplete}
            isPending={submit.isPending}
            pendingLabel={t("app:saving")}
          >
            {submitLabel}
          </Button>
          <Button variant="secondary" isDisabled={submit.isPending} onPress={onCancel}>
            {t("app:cancel")}
          </Button>
        </Flex>
      </Stack>
    </Form>
  );
}
