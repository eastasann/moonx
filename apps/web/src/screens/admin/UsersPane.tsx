import { formatDate } from "@moonx/i18n";
import {
  AlertDialog,
  Badge,
  Button,
  Flex,
  Heading,
  IllustratedMessage,
  Stack,
  Text,
} from "@moonx/ui-web";
import type { TFunction } from "i18next";
import { SearchX } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { type AdminUserRow, useAdminActions } from "../../lib/admin";
import { errorText } from "../../lib/error-text";
import { useMe } from "../../lib/session";
import { toasts } from "../../lib/toast";
import { DetailRow, DetailRows } from "./DetailRows";
import { DirectoryTable } from "./DirectoryTable";
import { PagedList, type PagedQuery } from "./PagedList";

type UserStatus = AdminUserRow["status"];

function statusLabel(t: TFunction, status: UserStatus): string {
  switch (status) {
    case "active":
      return t("admin:users.status.active");
    case "suspended":
      return t("admin:users.status.suspended");
    case "deleted":
      return t("admin:users.status.deleted");
  }
}

const STATUS_VARIANT = { active: "positive", suspended: "notice", deleted: "neutral" } as const;

/** The name a list shows: a suspended person keeps their name with "(suspended)" after it. */
const userName = (t: TFunction, user: AdminUserRow) =>
  user.status === "suspended"
    ? t("admin:users.suspendedName", { name: user.displayName })
    : user.displayName;

/** Screen 28, Users tab: the list pane (design-spec 6.17). */
export function UsersList({
  query,
  searching,
  selectedId,
  onSelect,
}: {
  query: PagedQuery<AdminUserRow>;
  searching: boolean;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation(["admin"]);
  const me = useMe();
  const columns = [
    { id: "name", label: t("admin:users.columns.name"), isRowHeader: true },
    { id: "email", label: t("admin:users.columns.email") },
    { id: "signedUp", label: t("admin:users.columns.signedUp") },
    { id: "lastUsed", label: t("admin:users.columns.lastUsed") },
    { id: "workspaces", label: t("admin:users.columns.workspaces"), isNumeric: true },
    { id: "status", label: t("admin:users.columns.status") },
  ];
  return (
    <PagedList query={query}>
      {(users) => (
        <DirectoryTable
          label={t("admin:users.listLabel")}
          columns={columns}
          selectedId={selectedId}
          onSelect={onSelect}
          emptyState={
            searching ? (
              <IllustratedMessage icon={SearchX} heading={t("admin:users.noMatch")} />
            ) : undefined
          }
          rows={users.map((user) => ({
            id: user.id,
            textValue: user.displayName,
            cells: {
              name: userName(t, user),
              email: user.email,
              signedUp: formatDate(user.createdAt, me.timezone),
              lastUsed: user.lastActiveAt
                ? formatDate(user.lastActiveAt, me.timezone)
                : t("admin:never"),
              workspaces: user.workspaceCount,
              status: statusLabel(t, user.status),
            },
          }))}
        />
      )}
    </PagedList>
  );
}

/**
 * Screen 28, Users tab: the chosen user's usage and the Suspend / Reactivate action. Usage is
 * counts and dates only; a deleted account has no action and neither does the operator's own row
 * (the API refuses it, SDD 5.13).
 */
export function UserDetail({ user }: { user: AdminUserRow }) {
  const { t } = useTranslation(["admin", "app"]);
  const me = useMe();
  const { suspend, reactivate } = useAdminActions();
  const [confirming, setConfirming] = useState<"suspend" | "reactivate" | null>(null);
  const failed = (error: unknown) =>
    toasts.add({ title: errorText(t, error), variant: "negative" });
  const name = user.displayName;
  const canAct = user.status !== "deleted" && user.id !== me.id;

  return (
    <Stack gap="space-300">
      <Flex gap="space-200" align="center" wrap>
        <Heading level={2}>{userName(t, user)}</Heading>
        <Badge size="S" variant={STATUS_VARIANT[user.status]}>
          {statusLabel(t, user.status)}
        </Badge>
        {user.isAdmin ? <Badge size="S">{t("admin:users.detail.admin")}</Badge> : null}
      </Flex>
      <DetailRows>
        <DetailRow label={t("admin:users.columns.email")}>{user.email}</DetailRow>
        <DetailRow label={t("admin:users.columns.signedUp")}>
          {formatDate(user.createdAt, me.timezone)}
        </DetailRow>
        <DetailRow label={t("admin:users.columns.lastUsed")}>
          {user.lastActiveAt ? formatDate(user.lastActiveAt, me.timezone) : t("admin:never")}
        </DetailRow>
        <DetailRow label={t("admin:users.columns.workspaces")}>{user.workspaceCount}</DetailRow>
      </DetailRows>
      <Text variant="caption" tone="secondary">
        {user.status === "deleted"
          ? t("admin:users.detail.deleted")
          : t("admin:users.detail.usageNote")}
      </Text>
      {canAct ? (
        <Flex>
          {user.status === "suspended" ? (
            <Button
              variant="secondary"
              isPending={reactivate.isPending}
              pendingLabel={t("app:saving")}
              onPress={() => setConfirming("reactivate")}
            >
              {t("admin:users.reactivate")}
            </Button>
          ) : (
            <Button
              variant="negative"
              isPending={suspend.isPending}
              pendingLabel={t("app:saving")}
              onPress={() => setConfirming("suspend")}
            >
              {t("admin:users.suspend")}
            </Button>
          )}
        </Flex>
      ) : null}
      <AlertDialog
        variant={confirming === "suspend" ? "negative" : "confirmation"}
        isOpen={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={
          confirming === "reactivate"
            ? t("admin:users.reactivateTitle", { name })
            : t("admin:users.suspendTitle", { name })
        }
        primaryActionLabel={
          confirming === "reactivate" ? t("admin:users.reactivate") : t("admin:users.suspend")
        }
        cancelLabel={t("app:cancel")}
        onPrimaryAction={() => {
          if (confirming === "reactivate") {
            reactivate.mutate(user.id, {
              onSuccess: () =>
                toasts.add({
                  title: t("admin:users.reactivatedToast", { name }),
                  variant: "positive",
                }),
              onError: failed,
            });
          } else {
            suspend.mutate(user.id, {
              onSuccess: () =>
                toasts.add({
                  title: t("admin:users.suspendedToast", { name }),
                  variant: "positive",
                }),
              onError: failed,
            });
          }
        }}
      >
        {confirming === "reactivate"
          ? t("admin:users.reactivateBody")
          : t("admin:users.suspendBody")}
      </AlertDialog>
    </Stack>
  );
}
