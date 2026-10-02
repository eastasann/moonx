import { AlertDialog, Badge, Button, Flex, Heading, InlineAlert, Stack, Text } from "@moonx/ui-web";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, call } from "../../lib/api";
import { isApiError } from "../../lib/api-error";
import { errorText } from "../../lib/error-text";
import { useGoTo } from "../../lib/navigate";
import { homePath, loadMe, ME_KEY, useMe } from "../../lib/session";
import { toasts } from "../../lib/toast";

/**
 * Screen 4, the workspaces the person belongs to, with Leave for the team ones. Leaving the one
 * that is open ends in the personal workspace, which the API makes the last-opened (W3).
 */
export function WorkspacesSection() {
  const { t } = useTranslation(["account", "app", "errors"]);
  const me = useMe();
  const queryClient = useQueryClient();
  const goTo = useGoTo();
  const [leaving, setLeaving] = useState<{ id: string; name: string } | null>(null);

  const leave = useMutation({
    mutationFn: (workspaceId: string) =>
      call(api().api.v1.workspaces({ workspaceId }).members({ userId: me.id }).delete()),
    onSuccess: async (_data, workspaceId) => {
      const wasOpen = me.lastWorkspaceId === workspaceId;
      queryClient.removeQueries({ queryKey: ME_KEY });
      const updated = await loadMe(queryClient);
      toasts.add({ title: t("account:workspaces.left"), variant: "positive" });
      if (wasOpen && updated) goTo(homePath(updated));
    },
  });

  const lastOwner = isApiError(leave.error) && leave.error.code === "LAST_OWNER";

  return (
    <Stack gap="space-300" as="section">
      <Heading level={2}>{t("account:workspaces.title")}</Heading>
      {leave.error ? (
        <InlineAlert
          variant="negative"
          heading={lastOwner ? t("account:workspaces.lastOwner") : errorText(t, leave.error)}
        />
      ) : null}
      <Stack gap="space-200">
        {me.memberships.map(({ workspace, role }) => (
          <Flex key={workspace.id} gap="space-200" align="center" justify="between" wrap>
            <Flex gap="space-200" align="center" wrap>
              <Text variant="label" as="span">
                {workspace.name}
              </Text>
              <Badge size="S">{t(`account:role.${role}`)}</Badge>
              {workspace.isPersonal ? (
                <Badge size="S">{t("account:workspaces.personal")}</Badge>
              ) : null}
            </Flex>
            {workspace.isPersonal ? null : (
              <Button
                variant="secondary"
                size="S"
                aria-label={t("account:workspaces.leaveNamed", { name: workspace.name })}
                onPress={() => {
                  leave.reset();
                  setLeaving({ id: workspace.id, name: workspace.name });
                }}
              >
                {t("account:workspaces.leave")}
              </Button>
            )}
          </Flex>
        ))}
      </Stack>
      <AlertDialog
        variant="negative"
        isOpen={leaving !== null}
        onOpenChange={(open) => !open && setLeaving(null)}
        title={t("account:workspaces.leaveTitle", { name: leaving?.name ?? "" })}
        primaryActionLabel={t("account:workspaces.leave")}
        cancelLabel={t("app:cancel")}
        onPrimaryAction={() => leaving && leave.mutate(leaving.id)}
      >
        {t("account:workspaces.leaveBody")}
      </AlertDialog>
    </Stack>
  );
}
