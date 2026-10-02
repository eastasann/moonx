import { formatDate } from "@moonx/i18n";
import {
  AlertDialog,
  Badge,
  Button,
  Flex,
  Heading,
  IllustratedMessage,
  Stack,
} from "@moonx/ui-web";
import type { TFunction } from "i18next";
import { Mail } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { type AdminInvitationRow, isOpenInvitation, useAdminActions } from "../../lib/admin";
import { errorText } from "../../lib/error-text";
import { useMe } from "../../lib/session";
import { toasts } from "../../lib/toast";
import { DetailRow, DetailRows } from "./DetailRows";
import { DirectoryTable } from "./DirectoryTable";
import { PagedList, type PagedQuery } from "./PagedList";

type InvitationStatus = AdminInvitationRow["status"];

function statusLabel(t: TFunction, status: InvitationStatus): string {
  switch (status) {
    case "pending":
      return t("admin:invitations.status.pending");
    case "accepted":
      return t("admin:invitations.status.accepted");
    case "revoked":
      return t("admin:invitations.status.revoked");
    case "expired":
      return t("admin:invitations.status.expired");
  }
}

function roleLabel(t: TFunction, role: NonNullable<AdminInvitationRow["role"]>): string {
  switch (role) {
    case "owner":
      return t("account:role.owner");
    case "member":
      return t("account:role.member");
    case "viewer":
      return t("account:role.viewer");
  }
}

const STATUS_VARIANT = {
  pending: "informative",
  accepted: "positive",
  revoked: "neutral",
  expired: "notice",
} as const;

function workspaceText(t: TFunction, invitation: AdminInvitationRow): string {
  if (!invitation.workspace || !invitation.role) return t("admin:invitations.noWorkspace");
  return t("admin:invitations.workspaceRole", {
    workspace: invitation.workspace.name,
    role: roleLabel(t, invitation.role),
  });
}

const invitedBy = (t: TFunction, invitation: AdminInvitationRow) =>
  invitation.invitedBy?.displayName ?? t("admin:invitations.invitedByOperator");

/** Screen 28, Invitations tab: the list pane (design-spec 6.17). */
export function InvitationsList({
  query,
  selectedId,
  onSelect,
  onNew,
}: {
  query: PagedQuery<AdminInvitationRow>;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const { t } = useTranslation(["admin", "account"]);
  const me = useMe();
  const columns = [
    { id: "email", label: t("admin:invitations.columns.email"), isRowHeader: true },
    { id: "workspace", label: t("admin:invitations.columns.workspace") },
    { id: "status", label: t("admin:invitations.columns.status") },
    { id: "invitedBy", label: t("admin:invitations.columns.invitedBy") },
    { id: "sent", label: t("admin:invitations.columns.sent") },
    { id: "expires", label: t("admin:invitations.columns.expires") },
  ];
  return (
    <PagedList query={query}>
      {(invitations) =>
        invitations.length === 0 ? (
          <IllustratedMessage
            icon={Mail}
            heading={t("admin:invitations.empty.heading")}
            actions={
              <Button variant="accent" onPress={onNew}>
                {t("admin:invitations.new")}
              </Button>
            }
          >
            {t("admin:invitations.empty.body")}
          </IllustratedMessage>
        ) : (
          <DirectoryTable
            label={t("admin:invitations.listLabel")}
            columns={columns}
            selectedId={selectedId}
            onSelect={onSelect}
            rows={invitations.map((invitation) => ({
              id: invitation.id,
              textValue: invitation.email,
              cells: {
                email: invitation.email,
                workspace: workspaceText(t, invitation),
                status: statusLabel(t, invitation.status),
                invitedBy: invitedBy(t, invitation),
                sent: formatDate(invitation.createdAt, me.timezone),
                expires: formatDate(invitation.expiresAt, me.timezone),
              },
            }))}
          />
        )
      }
    </PagedList>
  );
}

/** Screen 28, Invitations tab: the chosen invitation, with Resend and Cancel while it is not over. */
export function InvitationDetail({ invitation }: { invitation: AdminInvitationRow }) {
  const { t } = useTranslation(["admin", "account", "app"]);
  const me = useMe();
  const { resend, cancel } = useAdminActions();
  const [cancelling, setCancelling] = useState(false);
  const failed = (error: unknown) =>
    toasts.add({ title: errorText(t, error), variant: "negative" });
  const { email } = invitation;

  return (
    <Stack gap="space-300">
      <Flex gap="space-200" align="center" wrap>
        <Heading level={2}>{email}</Heading>
        <Badge size="S" variant={STATUS_VARIANT[invitation.status]}>
          {statusLabel(t, invitation.status)}
        </Badge>
      </Flex>
      <DetailRows>
        <DetailRow label={t("admin:invitations.columns.workspace")}>
          {workspaceText(t, invitation)}
        </DetailRow>
        <DetailRow label={t("admin:invitations.columns.invitedBy")}>
          {invitedBy(t, invitation)}
        </DetailRow>
        <DetailRow label={t("admin:invitations.columns.sent")}>
          {formatDate(invitation.createdAt, me.timezone)}
        </DetailRow>
        <DetailRow label={t("admin:invitations.columns.expires")}>
          {formatDate(invitation.expiresAt, me.timezone)}
        </DetailRow>
        {invitation.acceptedAt ? (
          <DetailRow label={t("admin:invitations.detail.acceptedAt")}>
            {formatDate(invitation.acceptedAt, me.timezone)}
          </DetailRow>
        ) : null}
      </DetailRows>
      {isOpenInvitation(invitation.status) ? (
        <Flex gap="space-100" wrap>
          <Button
            variant="secondary"
            isPending={resend.isPending}
            pendingLabel={t("app:sending")}
            onPress={() =>
              resend.mutate(invitation.id, {
                onSuccess: () =>
                  toasts.add({
                    title: t("admin:invitations.resendToast", { email }),
                    variant: "positive",
                  }),
                onError: failed,
              })
            }
          >
            {t("admin:invitations.resend")}
          </Button>
          <Button variant="secondary" onPress={() => setCancelling(true)}>
            {t("admin:invitations.cancel")}
          </Button>
        </Flex>
      ) : null}
      <AlertDialog
        variant="negative"
        isOpen={cancelling}
        onOpenChange={setCancelling}
        title={t("admin:invitations.cancelTitle", { email })}
        primaryActionLabel={t("admin:invitations.cancelConfirm")}
        cancelLabel={t("admin:invitations.keep")}
        onPrimaryAction={() =>
          cancel.mutate(invitation.id, {
            onSuccess: () =>
              toasts.add({
                title: t("admin:invitations.cancelledToast", { email }),
                variant: "positive",
              }),
            onError: failed,
          })
        }
      >
        {t("admin:invitations.cancelBody")}
      </AlertDialog>
    </Stack>
  );
}
