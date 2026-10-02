import { currencyOptions, DEFAULT_CURRENCY } from "@moonx/i18n";
import {
  Badge,
  Button,
  Dialog,
  Flex,
  Form,
  InlineAlert,
  ListView,
  ListViewItem,
  Picker,
  PickerItem,
  Stack,
  Text,
  TextField,
} from "@moonx/ui-web";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createWorkspaceSchema } from "../forms/schemas";
import { api, call } from "../lib/api";
import { errorText } from "../lib/error-text";
import { fieldProps, validate } from "../lib/form";
import { useOverlay } from "../lib/overlay";
import { ME_KEY, useMe } from "../lib/session";

/** M7: switch to another workspace, or create one (design-spec 3.8, 5). */
export function SwitchWorkspaceDialog() {
  const { t } = useTranslation(["app", "account"]);
  const me = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { closeModal } = useOverlay();
  const [creating, setCreating] = useState(false);
  const formId = useId();
  const currencies = useMemo(currencyOptions, []);

  const create = useMutation({
    mutationFn: (body: { name: string; currency: string }) =>
      call(api().api.v1.workspaces.post(body)),
    onSuccess: async (workspace) => {
      await queryClient.invalidateQueries({ queryKey: ME_KEY });
      await navigate({ to: "/w/$workspaceId", params: { workspaceId: workspace.id } });
    },
  });

  const form = useForm({
    defaultValues: { name: "", currency: DEFAULT_CURRENCY },
    validators: { onSubmit: validate(createWorkspaceSchema, t) },
    onSubmit: ({ value }) =>
      create.mutateAsync({ name: value.name.trim(), currency: value.currency }).catch(() => {}),
  });

  const switchTo = (workspaceId: string) =>
    navigate({ to: "/w/$workspaceId", params: { workspaceId } });

  return (
    <Dialog
      isOpen
      isDismissable
      size="medium"
      title={creating ? t("app:workspace.newTitle") : t("app:workspace.switchTitle")}
      closeLabel={t("app:close")}
      onOpenChange={(open) => !open && closeModal()}
      actions={
        creating ? (
          <>
            <Button variant="secondary" onPress={() => setCreating(false)}>
              {t("app:back")}
            </Button>
            <Button
              type="submit"
              form={formId}
              isPending={create.isPending}
              pendingLabel={t("app:saving")}
            >
              {t("app:workspace.create")}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onPress={() => setCreating(true)}>
            {t("app:workspace.new")}
          </Button>
        )
      }
    >
      {creating ? (
        <Form
          aria-label={t("app:workspace.newTitle")}
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
          id={formId}
        >
          {create.error ? (
            <InlineAlert variant="negative" heading={errorText(t, create.error)} />
          ) : null}
          <form.Field name="name">
            {(field) => (
              <TextField
                label={t("app:workspace.name")}
                isRequired
                autoFocus
                {...fieldProps(field)}
              />
            )}
          </form.Field>
          <form.Field name="currency">
            {(field) => (
              <Picker
                label={t("app:workspace.currency")}
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
        </Form>
      ) : (
        <ListView
          aria-label={t("app:workspace.listLabel")}
          onAction={(key) => void switchTo(String(key))}
        >
          {me.memberships.map(({ workspace, role }) => (
            <ListViewItem key={workspace.id} id={workspace.id} textValue={workspace.name}>
              <Flex gap="space-200" align="center" justify="between">
                <Stack gap="space-50">
                  <Text variant="label" as="span">
                    {workspace.name}
                  </Text>
                  {workspace.id === me.lastWorkspaceId ? (
                    <Text variant="caption" tone="secondary" as="span">
                      {t("app:workspace.current")}
                    </Text>
                  ) : null}
                </Stack>
                <Badge size="S">{t(`account:role.${role}`)}</Badge>
              </Flex>
            </ListViewItem>
          ))}
        </ListView>
      )}
    </Dialog>
  );
}
