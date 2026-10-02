import { roleSchema } from "@moonx/schemas";
import {
  Button,
  ComboBox,
  ComboBoxItem,
  Dialog,
  Form,
  InlineAlert,
  Picker,
  PickerItem,
  Stack,
  TextField,
} from "@moonx/ui-web";
import { useForm } from "@tanstack/react-form";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { adminInvitationSchema } from "../../forms/schemas";
import { useAdminActions, useAllAdminWorkspaces } from "../../lib/admin";
import { errorText } from "../../lib/error-text";
import { fieldProps, validate } from "../../lib/form";
import { toasts } from "../../lib/toast";

const DEFAULT_ROLE = "member";

/**
 * Issue an invitation from screen 28 (design-spec 6.17): the email, and optionally a workspace
 * with the role to join it as. Without a workspace the person signs up with only a personal
 * workspace, and never becomes an operator (SDD 5.13 AD9).
 */
export function NewInvitationDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(["admin", "account", "app"]);
  const { invite } = useAdminActions();
  const workspaces = useAllAdminWorkspaces(true);
  const formId = useId();
  const options = workspaces.data?.pages.flatMap((page) => page.items) ?? [];

  const form = useForm({
    defaultValues: { email: "", workspaceId: "", role: "" },
    validators: { onSubmit: validate(adminInvitationSchema, t) },
    onSubmit: ({ value }) => {
      const email = value.email.trim();
      const target = value.workspaceId
        ? { workspaceId: value.workspaceId, role: roleSchema.parse(value.role) }
        : {};
      return (
        invite
          .mutateAsync({ email, ...target })
          .then(() => {
            toasts.add({
              title: t("admin:invitations.dialog.sentToast", { email }),
              variant: "positive",
            });
            onClose();
          })
          // The dialog shows the failure through `invite.error` and keeps the input.
          .catch(() => {})
      );
    },
  });

  return (
    <Dialog
      isOpen
      isDismissable
      isKeyboardDismissDisabled={invite.isPending}
      size="medium"
      title={t("admin:invitations.dialog.title")}
      closeLabel={t("app:close")}
      onOpenChange={(open) => !open && onClose()}
      actions={
        <form.Subscribe selector={(state) => state.values.email}>
          {(email) => (
            <>
              <Button variant="secondary" onPress={onClose}>
                {t("app:cancel")}
              </Button>
              <Button
                type="submit"
                form={formId}
                variant="accent"
                isDisabled={!email.trim()}
                isPending={invite.isPending}
                pendingLabel={t("app:sending")}
              >
                {t("admin:invitations.dialog.send")}
              </Button>
            </>
          )}
        </form.Subscribe>
      }
    >
      <Form
        aria-label={t("admin:invitations.dialog.title")}
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <Stack gap="space-200">
          {invite.error ? (
            <InlineAlert variant="negative" heading={t("admin:invitations.dialog.failed")}>
              {errorText(t, invite.error)}
            </InlineAlert>
          ) : null}
          {workspaces.isError ? (
            <InlineAlert
              variant="negative"
              heading={t("admin:invitations.dialog.workspaceLoadFailed")}
            />
          ) : null}
          <form.Field name="email">
            {(field) => (
              <TextField
                label={t("admin:invitations.dialog.email")}
                type="email"
                isRequired
                autoFocus
                {...fieldProps(field)}
              />
            )}
          </form.Field>
          <form.Field name="workspaceId">
            {(field) => (
              <ComboBox
                label={t("admin:invitations.dialog.workspace")}
                description={t("admin:invitations.dialog.workspaceHelp")}
                openLabel={t("admin:invitations.dialog.workspaceOpen")}
                emptyMessage={t("admin:invitations.dialog.workspaceEmpty")}
                value={field.state.value || null}
                onChange={(id) => {
                  field.handleChange(id ?? "");
                  // A workspace needs a role; Member is the usual one. Clearing the workspace drops it.
                  form.setFieldValue("role", id ? form.getFieldValue("role") || DEFAULT_ROLE : "");
                }}
                onBlur={field.handleBlur}
              >
                {options.map((workspace) => (
                  <ComboBoxItem key={workspace.id} id={workspace.id} textValue={workspace.name}>
                    {workspace.name}
                  </ComboBoxItem>
                ))}
              </ComboBox>
            )}
          </form.Field>
          <form.Subscribe selector={(state) => state.values.workspaceId}>
            {(workspaceId) => (
              <form.Field name="role">
                {(field) => (
                  <Picker
                    label={t("admin:invitations.dialog.role")}
                    description={t("admin:invitations.dialog.roleHelp")}
                    isDisabled={!workspaceId}
                    isRequired={Boolean(workspaceId)}
                    value={field.state.value || null}
                    onChange={(role) => field.handleChange(role ?? "")}
                    isInvalid={fieldProps(field).isInvalid}
                    errorMessage={fieldProps(field).errorMessage}
                  >
                    <PickerItem id="owner">{t("account:role.owner")}</PickerItem>
                    <PickerItem id="member">{t("account:role.member")}</PickerItem>
                    <PickerItem id="viewer">{t("account:role.viewer")}</PickerItem>
                  </Picker>
                )}
              </form.Field>
            )}
          </form.Subscribe>
        </Stack>
      </Form>
    </Dialog>
  );
}
