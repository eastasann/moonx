import { currencyOptions } from "@moonx/i18n";
import {
  Button,
  Form,
  Heading,
  InlineAlert,
  Picker,
  PickerItem,
  Stack,
  TextField,
} from "@moonx/ui-web";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { workspaceGeneralSchema } from "../../forms/workspace-settings";
import { api, call } from "../../lib/api";
import { errorText } from "../../lib/error-text";
import { fieldProps, validate } from "../../lib/form";
import { ME_KEY } from "../../lib/session";
import { toasts } from "../../lib/toast";

/**
 * Screen 9, name and currency (W1 PATCH). Only the changed fields are sent. The currency is a
 * label: the API never converts amounts, so the form says so next to the picker.
 */
export function GeneralSection({
  workspaceId,
  name,
  currency,
}: {
  workspaceId: string;
  name: string;
  currency: string;
}) {
  const { t } = useTranslation(["workspaceSettings", "app"]);
  const queryClient = useQueryClient();
  const currencies = useMemo(currencyOptions, []);

  const save = useMutation({
    mutationFn: (body: { name?: string; currency?: string }) =>
      call(api().api.v1.workspaces({ workspaceId }).patch(body)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ME_KEY });
      toasts.add({ title: t("workspaceSettings:general.saved"), variant: "positive" });
    },
  });

  const form = useForm({
    defaultValues: { name, currency },
    validators: { onSubmit: validate(workspaceGeneralSchema, t) },
    onSubmit: ({ value }) => {
      const body = {
        ...(value.name.trim() !== name ? { name: value.name.trim() } : {}),
        ...(value.currency !== currency ? { currency: value.currency } : {}),
      };
      if (Object.keys(body).length === 0) return;
      return save.mutateAsync(body).catch(() => {});
    },
  });

  return (
    <Stack gap="space-300" as="section">
      <Heading level={2}>{t("workspaceSettings:general.title")}</Heading>
      {save.error ? <InlineAlert variant="negative" heading={errorText(t, save.error)} /> : null}
      <Form
        aria-label={t("workspaceSettings:general.title")}
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="name">
          {(field) => (
            <TextField
              label={t("workspaceSettings:general.name")}
              isRequired
              {...fieldProps(field)}
            />
          )}
        </form.Field>
        <form.Field name="currency">
          {(field) => (
            <Picker
              label={t("workspaceSettings:general.currency")}
              value={field.state.value}
              onChange={(value) => value && field.handleChange(value)}
            >
              {currencies.map((option) => (
                <PickerItem key={option.code} id={option.code}>
                  {option.label}
                </PickerItem>
              ))}
            </Picker>
          )}
        </form.Field>
        <InlineAlert
          variant="notice"
          role="note"
          heading={t("workspaceSettings:general.currencyWarning")}
        />
        <Button type="submit" isPending={save.isPending} pendingLabel={t("app:saving")}>
          {t("workspaceSettings:general.save")}
        </Button>
      </Form>
    </Stack>
  );
}
