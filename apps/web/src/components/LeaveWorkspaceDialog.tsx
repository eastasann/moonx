import { AlertDialog, Stack, Text, ToastQueue } from "@moonx/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api, unwrap } from "../lib/api";
import { useIsOnline } from "../lib/online";
import { membersQuery, meQuery, workspaceKey } from "../lib/queries";
import { isSessionLost, useSendThrough } from "../lib/send";
import { failureCode, SendFailure } from "./SendFailure";

/** How long the toast after leaving stays (Spectrum's minimum). */
const TOAST_MS = 5000;

/**
 * Leave a workspace (W3 DELETE `me`, design-spec 6.16 4・9), asked first: the user loses
 * its contents and their self analysis stops being shared there. Leaving the workspace
 * open now goes to the personal workspace's 5. A refusal (the only Owner) stays in the
 * question with Retry. Cancel pressed while the leave is on its way closes the question
 * once the leave is answered: one that went through is done all the same.
 */
export function LeaveWorkspaceDialog({
  workspace,
  isOpenNow,
  personalId,
  onClose,
}: {
  workspace: { id: string; name: string };
  /** The workspace the screen stands in (the frame's), whose pages close with it. */
  isOpenNow: boolean;
  /** The user's own personal workspace, where they go after leaving the one open now. */
  personalId: string | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation(["settings"]);
  const isOnline = useIsOnline();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const sendThrough = useSendThrough();
  const [isSending, setSending] = useState(false);
  const busy = useRef(false);
  const isCancelled = useRef(false);
  const [failure, setFailure] = useState<unknown>(null);
  const leave = async () => {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    setFailure(null);
    try {
      await sendThrough(() =>
        unwrap(
          api()
            .api.v1.workspaces({ workspaceId: workspace.id })
            .members({ userId: "me" })
            .delete(),
        ),
      );
    } catch (cause) {
      // Out already (left in another tab, removed by an Owner): what was asked is done.
      const isOut =
        cause instanceof ApiError &&
        (cause.status === 404 || cause.code === "NO_ACCESS");
      if (!isOut) {
        if (isCancelled.current) {
          onClose();
          return;
        }
        if (!isSessionLost(cause)) setFailure(cause);
        // Another Owner left or was demoted meanwhile: the list shows it as it is now.
        if (failureCode(cause) === "LAST_OWNER") {
          void queryClient.invalidateQueries({
            queryKey: membersQuery(workspace.id).queryKey,
          });
        }
        busy.current = false;
        setSending(false);
        return;
      }
    }
    if (isOpenNow) {
      // Away first: the workspace's pages would otherwise say "You don't have access".
      await navigate({
        href: personalId === undefined ? "/" : `/w/${personalId}`,
      });
      await queryClient.invalidateQueries({ queryKey: meQuery().queryKey });
    } else {
      // The user read again before the dialog closes, so the row is gone with it.
      await queryClient.invalidateQueries({ queryKey: meQuery().queryKey });
      onClose();
    }
    queryClient.removeQueries({ queryKey: workspaceKey(workspace.id) });
    ToastQueue.neutral(
      t("settings:confirm.left", { workspace: workspace.name }),
      { timeout: TOAST_MS },
    );
  };
  return (
    <AlertDialog
      isOpen
      variant="destructive"
      size="S"
      title={t("settings:confirm.leaveTitle", { workspace: workspace.name })}
      primaryActionLabel={t("settings:confirm.leave")}
      cancelLabel={t("settings:confirm.cancel")}
      onPrimaryAction={() => void leave()}
      isPrimaryActionDisabled={!isOnline || isSending}
      onCancel={() => {
        if (busy.current) isCancelled.current = true;
        else onClose();
      }}
    >
      <Stack gap="space-200">
        <Text>{t("settings:confirm.leaveBody")}</Text>
        {failure !== null && (
          <SendFailure
            error={failure}
            messages={{
              LAST_OWNER: t("settings:account.workspaces.lastOwner"),
            }}
            transient="couldNotSave"
            withSaveReasons
            onRetry={() => void leave()}
            isRetryDisabled={!isOnline || isSending}
          />
        )}
      </Stack>
    </AlertDialog>
  );
}
