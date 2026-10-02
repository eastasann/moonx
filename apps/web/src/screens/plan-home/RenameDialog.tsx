import { Button, Dialog, Form, InlineAlert, TextField } from "@moonx/ui-web";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { planNameFormSchema } from "../../forms/plan";
import { isApiError } from "../../lib/api-error";
import { errorText } from "../../lib/error-text";
import { validate } from "../../lib/form";

/**
 * Renames the plan (P2 PATCH). The save itself goes through the header's saved item, so it shares
 * the plan's lock with Business Name and Prepared By; this sheet only collects the name and shows
 * what the server said about it.
 */
export function RenameDialog({
  currentName,
  isPending,
  failure,
  onSubmit,
  onClose,
}: {
  currentName: string;
  isPending: boolean;
  /** The refusal of the last submit, or null. */
  failure: unknown;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(["planHome", "app"]);
  const formId = useId();
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | undefined>();
  const [submitted, setSubmitted] = useState(false);

  const nameTaken = submitted && isApiError(failure) && failure.code === "NAME_TAKEN";
  const failed = submitted && failure && !nameTaken ? failure : null;

  const submit = () => {
    const result = validate(planNameFormSchema, t)({ value: { name } });
    setError(result?.fields.name);
    if (result) return;
    setSubmitted(true);
    onSubmit(name.trim());
  };

  return (
    <Dialog
      isOpen
      isDismissable
      isKeyboardDismissDisabled={isPending}
      size="medium"
      title={t("planHome:rename.title")}
      closeLabel={t("app:close")}
      onOpenChange={(open) => !open && onClose()}
      actions={
        <>
          <Button variant="secondary" onPress={onClose}>
            {t("app:cancel")}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="accent"
            isDisabled={!name.trim()}
            isPending={isPending}
            pendingLabel={t("app:saving")}
          >
            {t("planHome:rename.save")}
          </Button>
        </>
      }
    >
      <Form
        aria-label={t("planHome:rename.title")}
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {failed ? (
          <InlineAlert variant="negative" heading={t("planHome:rename.failed")}>
            {errorText(t, failed)}
          </InlineAlert>
        ) : null}
        <TextField
          label={t("planHome:rename.name")}
          isRequired
          autoFocus
          value={name}
          isInvalid={Boolean(error) || nameTaken}
          errorMessage={error ?? (nameTaken ? errorText(t, failure) : undefined)}
          onChange={(value) => {
            setName(value);
            setError(undefined);
            setSubmitted(false);
          }}
        />
      </Form>
    </Dialog>
  );
}
