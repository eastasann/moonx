import { formatRelativeTime } from "@moonx/i18n";
import { conflictCurrentSchema, createIdeaBodySchema } from "@moonx/schemas";
import {
  Button,
  Dialog,
  Form,
  InlineAlert,
  Stack,
  Text,
  TextArea,
  TextField,
  Well,
} from "@moonx/ui-web";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { api, call } from "../../lib/api";
import { isApiError } from "../../lib/api-error";
import { errorText } from "../../lib/error-text";
import { fieldProps, validate } from "../../lib/form";
import { IDEAS_KEY } from "../../lib/idea-actions";
import { useMe } from "../../lib/session";
import { toasts } from "../../lib/toast";
import type { ValidationHomeData } from "../../lib/validation-home";

/**
 * The body of the 409. Eden parses ISO timestamps in a JSON body into `Date`s, so `updatedAt`
 * arrives as either form.
 */
const conflictSchema = conflictCurrentSchema.extend({
  value: z.object({
    name: z.string(),
    oneLineConcept: z.string(),
    proposedSolution: z.string().nullable(),
  }),
  updatedAt: z.union([z.iso.datetime(), z.date()]),
});

interface Values {
  name: string;
  oneLineConcept: string;
  proposedSolution: string;
}

interface Save {
  values: Values;
  lockVersion: number;
  force: boolean;
}

const toValues = (idea: {
  name: string;
  oneLineConcept: string;
  proposedSolution: string | null;
}) => ({
  name: idea.name,
  oneLineConcept: idea.oneLineConcept,
  proposedSolution: idea.proposedSolution ?? "",
});

/** The other person's saved summary carried by a 409 CONFLICT of I2, or null for any other error. */
function readConflict(error: unknown) {
  if (!isApiError(error) || error.code !== "CONFLICT") return null;
  const current = conflictSchema.safeParse(error.extra.current);
  return current.success ? { ...current.data, value: toValues(current.data.value) } : null;
}

/**
 * The sheet that edits the idea's name, one-line concept and proposed solution (design-spec 6.1).
 * When someone saved the summary after it was opened, I2 answers 409 and the sheet shows their
 * version beside the person's own, to load theirs or overwrite with mine (design-spec 6.0.2).
 */
export function EditSummaryDialog({
  idea,
  onClose,
}: {
  idea: ValidationHomeData["idea"];
  onClose: () => void;
}) {
  const { t } = useTranslation(["validation", "app"]);
  const queryClient = useQueryClient();
  const router = useRouter();
  const { timezone: timeZone } = useMe();
  const formId = useId();
  const [copyFailed, setCopyFailed] = useState(false);
  const [lockVersion, setLockVersion] = useState(idea.lockVersion);
  // The form re-applies `defaultValues` whenever they differ from its own, so loading their
  // version must change what is passed here too, or the next render would put the old text back.
  const [defaults, setDefaults] = useState(() => toValues(idea));

  const save = useMutation({
    mutationFn: ({ values, lockVersion: version, force }: Save) =>
      call(
        api()
          .api.v1.ideas({ ideaId: idea.id })
          .patch({
            name: values.name.trim(),
            oneLineConcept: values.oneLineConcept.trim(),
            proposedSolution:
              values.proposedSolution.trim() === "" ? null : values.proposedSolution,
            lockVersion: version,
            ...(force ? { force: true } : {}),
          }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: IDEAS_KEY });
      // The breadcrumb reads the name from the route's loader.
      await router.invalidate();
      toasts.add({ title: t("app:saveState.saved"), variant: "positive" });
      onClose();
    },
  });

  const form = useForm({
    defaultValues: defaults,
    validators: { onSubmit: validate(createIdeaBodySchema, t) },
    // The sheet shows the failure through `save.error` and keeps the input.
    onSubmit: ({ value }) =>
      save.mutateAsync({ values: value, lockVersion, force: false }).catch(() => {}),
  });

  const conflict = readConflict(save.error);
  const otherError = save.error && !conflict ? save.error : null;

  const loadTheirs = () => {
    if (!conflict) return;
    setDefaults(conflict.value);
    form.reset(conflict.value);
    setLockVersion(conflict.lockVersion);
    save.reset();
    void queryClient.invalidateQueries({ queryKey: IDEAS_KEY });
  };
  // Loading theirs drops the person's own input, so they can take it with them first.
  const copyMine = () => {
    const mine = form.state.values;
    const text = fields.map((field) => `${field.label}: ${mine[field.name]}`).join("\n");
    navigator.clipboard.writeText(text).then(
      () => setCopyFailed(false),
      () => setCopyFailed(true),
    );
  };
  const overwrite = () => {
    if (!conflict) return;
    save.mutate({ values: form.state.values, lockVersion: conflict.lockVersion, force: true });
  };

  const fields: { name: keyof Values; label: string }[] = [
    { name: "name", label: t("validation:home.edit.name") },
    { name: "oneLineConcept", label: t("validation:home.edit.oneLineConcept") },
    { name: "proposedSolution", label: t("validation:home.edit.proposedSolution") },
  ];
  const shown = (text: string) => text || t("validation:home.edit.empty");

  return (
    <Dialog
      isOpen
      size="medium"
      title={t("validation:home.edit.title")}
      closeLabel={t("app:close")}
      isKeyboardDismissDisabled={save.isPending}
      onOpenChange={(open) => !open && onClose()}
      actions={
        conflict ? (
          <>
            <Button variant="secondary" onPress={copyMine}>
              {t("validation:home.edit.copyMine")}
            </Button>
            <Button variant="secondary" onPress={loadTheirs}>
              {t("validation:home.edit.loadTheirs")}
            </Button>
            <Button isPending={save.isPending} pendingLabel={t("app:saving")} onPress={overwrite}>
              {t("validation:home.edit.overwrite")}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onPress={onClose}>
              {t("app:cancel")}
            </Button>
            <Button
              type="submit"
              form={formId}
              isPending={save.isPending}
              pendingLabel={t("app:saving")}
            >
              {t("validation:home.edit.save")}
            </Button>
          </>
        )
      }
    >
      <Stack gap="space-200">
        {conflict ? (
          <InlineAlert
            variant="notice"
            heading={t("validation:home.edit.conflictHeading", {
              name: conflict.updatedBy?.displayName ?? t("validation:home.edit.someone"),
              when: formatRelativeTime(conflict.updatedAt, new Date(), timeZone),
            })}
          >
            <Stack gap="space-100">
              <Text>{t("validation:home.edit.conflictBody")}</Text>
              <Well aria-label={t("validation:home.edit.conflictTheirs")}>
                <Stack gap="space-100">
                  <Text variant="label">{t("validation:home.edit.conflictTheirs")}</Text>
                  {fields.map((field) => (
                    <Stack key={field.name} gap="space-25">
                      <Text variant="caption" tone="secondary">
                        {field.label}
                      </Text>
                      <Text>{shown(conflict.value[field.name])}</Text>
                    </Stack>
                  ))}
                </Stack>
              </Well>
              {copyFailed ? (
                <InlineAlert variant="notice" heading={t("validation:home.edit.copyFailed")} />
              ) : null}
            </Stack>
          </InlineAlert>
        ) : null}
        {otherError ? <InlineAlert variant="negative" heading={errorText(t, otherError)} /> : null}
        <Form
          aria-label={t("validation:home.edit.title")}
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="name">
            {(field) => (
              <TextField
                label={t("validation:home.edit.name")}
                isRequired
                autoFocus
                {...fieldProps(field)}
              />
            )}
          </form.Field>
          <form.Field name="oneLineConcept">
            {(field) => (
              <TextField
                label={t("validation:home.edit.oneLineConcept")}
                isRequired
                {...fieldProps(field)}
              />
            )}
          </form.Field>
          <form.Field name="proposedSolution">
            {(field) => (
              <TextArea label={t("validation:home.edit.proposedSolution")} {...fieldProps(field)} />
            )}
          </form.Field>
        </Form>
      </Stack>
    </Dialog>
  );
}
