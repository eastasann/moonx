import { formatDate } from "@moonx/i18n";
import type { Invitation, Role } from "@moonx/schemas";
import {
  ActionMenu,
  AlertDialog,
  Badge,
  Button,
  Flex,
  Form,
  Heading,
  IllustratedMessage,
  InlineAlert,
  MenuItem,
  MenuSeparator,
  Picker,
  PickerItem,
  SegmentedControl,
  SegmentedControlItem,
  Skeleton,
  Stack,
  TableView,
  Text,
  TextField,
} from "@moonx/ui-web";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailX } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { QueryBoundary } from "../../components/states";
import { inviteMemberSchema } from "../../forms/workspace-settings";
import { api, call } from "../../lib/api";
import { isApiError } from "../../lib/api-error";
import { errorText } from "../../lib/error-text";
import { copyText } from "../../lib/file-save";
import { fieldProps, validate } from "../../lib/form";
import { useMe } from "../../lib/session";
import { toasts } from "../../lib/toast";
import {
  type InvitationFilter,
  invitationsKey,
  invitationsQuery,
  isOpenInvitation,
  ROLES,
} from "../../lib/workspace-settings";

const STATUS_VARIANT = {
  pending: "informative",
  accepted: "positive",
  expired: "notice",
  revoked: "neutral",
} as const;

/**
 * Screen 9, invitations (W4 to W7). Copying and resending both make a new token, so the previous
 * link stops working. A send that fails keeps the form as typed for another try.
 */
export function InvitationsSection({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation(["workspaceSettings", "account", "app"]);
  const me = useMe();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<InvitationFilter>("pending");
  const [cancelling, setCancelling] = useState<Invitation | null>(null);
  const [manualLink, setManualLink] = useState<string | null>(null);
  const invitations = useQuery(invitationsQuery(workspaceId, filter));

  const refresh = () => queryClient.invalidateQueries({ queryKey: invitationsKey(workspaceId) });

  const send = useMutation({
    mutationFn: (body: { email: string; role: Role }) =>
      call(api().api.v1.workspaces({ workspaceId }).invitations.post(body)),
    onSuccess: async ({ invitation }) => {
      form.reset({ email: "", role: form.getFieldValue("role") });
      toasts.add({
        title: t("workspaceSettings:invitations.sent", { email: invitation.email }),
        variant: "positive",
      });
      await refresh();
    },
  });
  const resend = useMutation({
    mutationFn: (invitationId: string) =>
      call(api().api.v1.invitations({ invitationId }).resend.post()),
    onSuccess: async ({ invitation }) => {
      toasts.add({
        title: t("workspaceSettings:invitations.resent", { email: invitation.email }),
        variant: "positive",
      });
      await refresh();
    },
  });
  const copyLink = useMutation({
    mutationFn: async (invitationId: string) => {
      const { link } = await call(api().api.v1.invitations({ invitationId }).link.post());
      return { link, copied: await copyText(link) };
    },
    onSuccess: async ({ link, copied }) => {
      if (copied) {
        setManualLink(null);
        toasts.add({ title: t("workspaceSettings:invitations.linkCopied"), variant: "positive" });
      } else {
        setManualLink(link);
      }
      await refresh();
    },
  });
  const cancel = useMutation({
    mutationFn: (invitation: Invitation) =>
      call(api().api.v1.invitations({ invitationId: invitation.id }).delete()),
    onSuccess: async (_data, invitation) => {
      toasts.add({
        title: t("workspaceSettings:invitations.cancelled", { email: invitation.email }),
        variant: "positive",
      });
      await refresh();
    },
  });

  const form = useForm({
    defaultValues: { email: "", role: "member" as Role },
    validators: { onSubmit: validate(inviteMemberSchema, t) },
    onSubmit: ({ value }) => {
      resend.reset();
      return send.mutateAsync({ email: value.email.trim(), role: value.role }).catch(() => {});
    },
  });

  const actionError = resend.error ?? copyLink.error ?? cancel.error;
  const pendingInvitationId =
    isApiError(send.error) && send.error.code === "INVITATION_PENDING"
      ? send.error.extra.invitationId
      : null;

  return (
    <Stack gap="space-300" as="section">
      <Heading level={2}>{t("workspaceSettings:invitations.title")}</Heading>
      <Text tone="secondary">{t("workspaceSettings:invitations.hint")}</Text>
      {send.error ? (
        <InlineAlert variant="negative" heading={errorText(t, send.error)}>
          {typeof pendingInvitationId === "string" ? (
            <Button
              variant="secondary"
              size="S"
              isPending={resend.isPending}
              pendingLabel={t("app:saving")}
              onPress={() => resend.mutate(pendingInvitationId)}
            >
              {t("workspaceSettings:invitations.resendPending")}
            </Button>
          ) : null}
        </InlineAlert>
      ) : null}
      <Form
        aria-label={t("workspaceSettings:invitations.form.label")}
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="email">
          {(field) => (
            <TextField
              label={t("workspaceSettings:invitations.form.email")}
              type="email"
              autoComplete="off"
              isRequired
              {...fieldProps(field)}
            />
          )}
        </form.Field>
        <form.Field name="role">
          {(field) => (
            <Picker
              label={t("workspaceSettings:invitations.form.role")}
              value={field.state.value}
              onChange={(value) => value && field.handleChange(value as Role)}
            >
              {ROLES.map((role) => (
                <PickerItem key={role} id={role}>
                  {t(`account:role.${role}`)}
                </PickerItem>
              ))}
            </Picker>
          )}
        </form.Field>
        <Button type="submit" isPending={send.isPending} pendingLabel={t("app:saving")}>
          {send.error
            ? t("workspaceSettings:invitations.form.retry")
            : t("workspaceSettings:invitations.form.send")}
        </Button>
      </Form>

      <Flex justify="end">
        <SegmentedControl
          aria-label={t("workspaceSettings:invitations.filter.label")}
          size="S"
          value={filter}
          onChange={(value) => setFilter(value as InvitationFilter)}
        >
          <SegmentedControlItem value="pending">
            {t("workspaceSettings:invitations.filter.pending")}
          </SegmentedControlItem>
          <SegmentedControlItem value="all">
            {t("workspaceSettings:invitations.filter.all")}
          </SegmentedControlItem>
        </SegmentedControl>
      </Flex>
      {actionError ? <InlineAlert variant="negative" heading={errorText(t, actionError)} /> : null}
      {manualLink ? (
        <InlineAlert
          variant="notice"
          heading={t("workspaceSettings:invitations.manualLink.heading")}
        >
          <Stack gap="space-100">
            <Text>{t("workspaceSettings:invitations.manualLink.body")}</Text>
            <TextField
              label={t("workspaceSettings:invitations.manualLink.label")}
              value={manualLink}
              isReadOnly
            />
          </Stack>
        </InlineAlert>
      ) : null}
      <QueryBoundary
        query={invitations}
        skeleton={
          <Stack gap="space-200">
            <Skeleton shape="block" height="space-500" />
            <Skeleton shape="block" height="space-500" />
          </Stack>
        }
      >
        {(items) => (
          <TableView
            aria-label={t("workspaceSettings:invitations.tableLabel")}
            columns={[
              {
                id: "email",
                label: t("workspaceSettings:invitations.columns.email"),
                isRowHeader: true,
              },
              { id: "role", label: t("workspaceSettings:invitations.columns.role") },
              { id: "status", label: t("workspaceSettings:invitations.columns.status") },
              { id: "date", label: t("workspaceSettings:invitations.columns.date") },
              { id: "actions", label: t("workspaceSettings:invitations.columns.actions") },
            ]}
            emptyState={
              <IllustratedMessage
                icon={MailX}
                heading={t(`workspaceSettings:invitations.empty.${filter}`)}
              />
            }
            rows={items.map((invitation) => ({
              id: invitation.id,
              textValue: invitation.email,
              cells: {
                email: invitation.email,
                role: invitation.role ? t(`account:role.${invitation.role}`) : "",
                status: (
                  <Badge size="S" variant={STATUS_VARIANT[invitation.status]}>
                    {t(`workspaceSettings:invitations.status.${invitation.status}`)}
                  </Badge>
                ),
                date: t(`workspaceSettings:invitations.date.${invitation.status}`, {
                  date: formatDate(
                    invitation.status === "accepted" && invitation.acceptedAt
                      ? invitation.acceptedAt
                      : invitation.status === "revoked"
                        ? invitation.createdAt
                        : invitation.expiresAt,
                    me.timezone,
                  ),
                }),
                actions: isOpenInvitation(invitation) ? (
                  <ActionMenu
                    label={t("workspaceSettings:invitations.menuLabel", {
                      email: invitation.email,
                    })}
                    size="S"
                    onAction={(key) => {
                      resend.reset();
                      copyLink.reset();
                      cancel.reset();
                      if (key === "copy") return copyLink.mutate(invitation.id);
                      if (key === "resend") return resend.mutate(invitation.id);
                      setCancelling(invitation);
                    }}
                  >
                    <MenuItem id="copy">{t("workspaceSettings:invitations.copyLink")}</MenuItem>
                    <MenuItem id="resend">{t("workspaceSettings:invitations.resend")}</MenuItem>
                    <MenuSeparator />
                    <MenuItem id="cancel" variant="negative">
                      {t("workspaceSettings:invitations.cancel")}
                    </MenuItem>
                  </ActionMenu>
                ) : null,
              },
            }))}
          />
        )}
      </QueryBoundary>
      <AlertDialog
        variant="negative"
        isOpen={cancelling !== null}
        onOpenChange={(open) => !open && setCancelling(null)}
        title={t("workspaceSettings:invitations.cancelTitle", { email: cancelling?.email ?? "" })}
        primaryActionLabel={t("workspaceSettings:invitations.cancel")}
        cancelLabel={t("workspaceSettings:invitations.keep")}
        onPrimaryAction={() => cancelling && cancel.mutate(cancelling)}
      >
        {t("workspaceSettings:invitations.cancelBody")}
      </AlertDialog>
    </Stack>
  );
}
