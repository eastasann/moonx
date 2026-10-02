import { formatDate } from "@moonx/i18n";
import type { Member, Role } from "@moonx/schemas";
import {
  ActionMenu,
  AlertDialog,
  Avatar,
  Badge,
  Flex,
  Heading,
  InlineAlert,
  MenuItem,
  MenuSeparator,
  RowList,
  RowListItem,
  Skeleton,
  Stack,
  TableView,
  Text,
} from "@moonx/ui-web";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { QueryBoundary } from "../../components/states";
import { api, call } from "../../lib/api";
import { errorText } from "../../lib/error-text";
import { useGoTo } from "../../lib/navigate";
import { homePath, loadMe, ME_KEY, useMe } from "../../lib/session";
import { toasts } from "../../lib/toast";
import { membersKey, membersQuery, ROLES } from "../../lib/workspace-settings";

type Pending = { kind: "remove" | "demote"; member: Member };

/** The four rows of design-spec 6.16's table, for the column of the action being confirmed. */
function Consequences({ kind }: { kind: Pending["kind"] }) {
  const { t } = useTranslation("workspaceSettings");
  const viewer = kind === "demote";
  return (
    <RowList aria-label={t("members.consequences.label")}>
      <RowListItem>{t("members.consequences.shared")}</RowListItem>
      <RowListItem>
        {t(viewer ? "members.consequences.assignedViewer" : "members.consequences.assigned")}
      </RowListItem>
      <RowListItem>
        {t(viewer ? "members.consequences.namesViewer" : "members.consequences.names")}
      </RowListItem>
      <RowListItem>
        {t(
          viewer
            ? "members.consequences.notificationsViewer"
            : "members.consequences.notifications",
        )}
      </RowListItem>
    </RowList>
  );
}

/**
 * Screen 9, members (W2, W3): change a role or remove someone. The last Owner's row has no menu
 * (the API refuses with `LAST_OWNER` too). Removal and demotion to Viewer ask first and state what
 * becomes of the person's records. When the person acts on their own row, the cached account is
 * reloaded: they may no longer be an Owner, so this screen is not theirs any more.
 */
export function MembersSection({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation(["workspaceSettings", "account", "app"]);
  const me = useMe();
  const queryClient = useQueryClient();
  const goTo = useGoTo();
  const members = useQuery(membersQuery(workspaceId));
  const [pending, setPending] = useState<Pending | null>(null);

  const afterOwnChange = async () => {
    queryClient.removeQueries({ queryKey: ME_KEY });
    const updated = await loadMe(queryClient);
    if (updated) goTo(homePath(updated));
  };

  const changeRole = useMutation({
    mutationFn: ({ member, role }: { member: Member; role: Role }) =>
      call(
        api()
          .api.v1.workspaces({ workspaceId })
          .members({ userId: member.user.id })
          .patch({ role }),
      ),
    onSuccess: async (_data, { member, role }) => {
      toasts.add({
        title: t("workspaceSettings:members.roleChanged", {
          name: member.user.displayName,
          role: t(`account:role.${role}`),
        }),
        variant: "positive",
      });
      if (member.user.id === me.id) return afterOwnChange();
      await queryClient.invalidateQueries({ queryKey: membersKey(workspaceId) });
    },
  });
  const remove = useMutation({
    mutationFn: (member: Member) =>
      call(api().api.v1.workspaces({ workspaceId }).members({ userId: member.user.id }).delete()),
    onSuccess: async (_data, member) => {
      toasts.add({
        title: t("workspaceSettings:members.removed", { name: member.user.displayName }),
        variant: "positive",
      });
      if (member.user.id === me.id) return afterOwnChange();
      await queryClient.invalidateQueries({ queryKey: membersKey(workspaceId) });
    },
  });

  const error = changeRole.error ?? remove.error;
  const resetErrors = () => {
    changeRole.reset();
    remove.reset();
  };

  const nameOf = (member: Member) => {
    const name = member.user.displayName;
    const shown =
      member.user.badge === "suspended" ? t("workspaceSettings:members.suspended", { name }) : name;
    return member.user.id === me.id ? t("workspaceSettings:members.you", { name: shown }) : shown;
  };

  return (
    <Stack gap="space-300" as="section">
      <Heading level={2}>{t("workspaceSettings:members.title")}</Heading>
      {error ? <InlineAlert variant="negative" heading={errorText(t, error)} /> : null}
      <QueryBoundary
        query={members}
        skeleton={
          <Stack gap="space-200">
            <Skeleton shape="block" height="space-500" />
            <Skeleton shape="block" height="space-500" />
          </Stack>
        }
      >
        {(items) => {
          const owners = items.filter((m) => m.role === "owner").length;
          return (
            <TableView
              aria-label={t("workspaceSettings:members.tableLabel")}
              columns={[
                {
                  id: "member",
                  label: t("workspaceSettings:members.columns.member"),
                  isRowHeader: true,
                },
                { id: "email", label: t("workspaceSettings:members.columns.email") },
                { id: "role", label: t("workspaceSettings:members.columns.role") },
                { id: "joined", label: t("workspaceSettings:members.columns.joined") },
                { id: "actions", label: t("workspaceSettings:members.columns.actions") },
              ]}
              rows={items.map((member) => {
                const lastOwner = member.role === "owner" && owners <= 1;
                const name = member.user.displayName;
                return {
                  id: member.user.id,
                  textValue: name,
                  cells: {
                    member: (
                      <Flex gap="space-100" align="center">
                        <Avatar name={name} src={member.user.avatarUrl} size="S" />
                        <Text variant="label" as="span">
                          {nameOf(member)}
                        </Text>
                      </Flex>
                    ),
                    email: member.email ?? "",
                    role: (
                      <Stack gap="space-50" align="start">
                        <Badge size="S">{t(`account:role.${member.role}`)}</Badge>
                        {lastOwner ? (
                          <Text variant="caption" tone="secondary" as="span">
                            {t("workspaceSettings:members.lastOwner")}
                          </Text>
                        ) : null}
                      </Stack>
                    ),
                    joined: formatDate(member.joinedAt, me.timezone),
                    actions: (
                      <ActionMenu
                        label={t("workspaceSettings:members.menuLabel", { name })}
                        size="S"
                        isDisabled={lastOwner}
                        onAction={(key) => {
                          resetErrors();
                          if (key === "remove") return setPending({ kind: "remove", member });
                          const role = key as Role;
                          if (role === "viewer") return setPending({ kind: "demote", member });
                          changeRole.mutate({ member, role });
                        }}
                      >
                        {ROLES.filter((role) => role !== member.role).map((role) => (
                          <MenuItem key={role} id={role}>
                            {t("workspaceSettings:members.changeRole", {
                              role: t(`account:role.${role}`),
                            })}
                          </MenuItem>
                        ))}
                        <MenuSeparator />
                        <MenuItem id="remove" variant="negative">
                          {t("workspaceSettings:members.remove")}
                        </MenuItem>
                      </ActionMenu>
                    ),
                  },
                };
              })}
            />
          );
        }}
      </QueryBoundary>
      <AlertDialog
        variant="negative"
        isOpen={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={
          pending?.kind === "demote"
            ? t("workspaceSettings:members.demoteTitle", { name: pending.member.user.displayName })
            : t("workspaceSettings:members.removeTitle", {
                name: pending?.member.user.displayName ?? "",
              })
        }
        primaryActionLabel={
          pending?.kind === "demote"
            ? t("workspaceSettings:members.demoteAction")
            : t("workspaceSettings:members.removeAction")
        }
        cancelLabel={t("workspaceSettings:members.keep")}
        onPrimaryAction={() => {
          if (!pending) return;
          if (pending.kind === "demote")
            changeRole.mutate({ member: pending.member, role: "viewer" });
          else remove.mutate(pending.member);
        }}
      >
        {pending ? (
          <Stack gap="space-200">
            <Text>
              {t(
                pending.kind === "demote"
                  ? "workspaceSettings:members.demoteIntro"
                  : "workspaceSettings:members.removeIntro",
                { name: pending.member.user.displayName },
              )}
            </Text>
            <Consequences kind={pending.kind} />
          </Stack>
        ) : null}
      </AlertDialog>
    </Stack>
  );
}
