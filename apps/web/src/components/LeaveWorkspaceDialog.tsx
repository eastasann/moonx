import {
  AlertDialog,
  InlineAlert,
  Stack,
  Text,
  ToastQueue,
} from "@moonx/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api, unwrap } from "../lib/api";
import { useIsMounted } from "../lib/mounted";
import { useIsOnline } from "../lib/online";
import { membersQuery, meQuery, workspaceKey } from "../lib/queries";
import { useSendThrough } from "../lib/send";
import { useToastFailure } from "./ideaActions";
import { ModalSendFailure } from "./ModalFailure";
import { failureCode } from "./SendFailure";

/** How long the toast after leaving stays (Spectrum's minimum). */
const TOAST_MS = 5000;

/**
 * Leave a workspace (W3 DELETE `me`, design-spec 6.16 4・9), asked first: the user loses
 * its contents and their self analysis stops being shared there. Leaving the workspace
 * open now goes to the personal workspace's 5; found out already (404, NO_ACCESS), the
 * user has left all the same. A failure stays in the question (6.0.6's modals): the only
 * Owner's words, a rate limit's wait, "Couldn't save" with Retry for the network or an
 * API that is down and with 6.0.2's reason for a refusal for good, and anything else in
 * the small dialog with its Ref, Retry and Close, which closes the question. Cancel
 * pressed while the leave is on its way waits for its answer: one that went through
 * closes the question as any leave does, and one that failed closes it and says so in a
 * toast, as a send from a row's button does (6.0.6: the only Owner's words, else by
 * the failure's kind, useToastFailure, whose Retry sends it again); so does one that failed
 * once the screen was left meanwhile (Back). A leave that goes through once the question
 * has gone (its screen left, or the toast's Retry) leaves the user where they went, unless
 * that is a page of the workspace left, which could no longer open: then the personal 5
 * opens (6.0.6「送っている間に閉じた送信の失敗」). A lost session shows nothing: the app
 * takes its way (M9 or the sign-in screen).
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
  const { t } = useTranslation(["settings", "errors"]);
  const isOnline = useIsOnline();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();
  const sendThrough = useSendThrough();
  const toastFailure = useToastFailure();
  const [isSending, setSending] = useState(false);
  const busy = useRef(false);
  // Cancel pressed while the leave was on its way: its answer closes the question.
  const isCancelled = useRef(false);
  // The question went with its screen (the user moved on) while the leave was on its way.
  const isShown = useIsMounted();
  const [failure, setFailure] = useState<unknown>(null);
  const lastOwnerWords = t("errors:LAST_OWNER", { context: "leave" });

  /**
   * Sends the leave: null once the user is out, as asked or already (left in another
   * tab, removed by an Owner), else what it failed with.
   */
  const send = async (): Promise<{ failure: unknown } | null> => {
    try {
      await sendThrough(() =>
        unwrap(
          api()
            .api.v1.workspaces({ workspaceId: workspace.id })
            .members({ userId: "me" })
            .delete(),
        ),
      );
      return null;
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        (cause.status === 404 || cause.code === "NO_ACCESS")
      ) {
        return null;
      }
      // Another Owner left or was demoted meanwhile: the list shows it as it is now.
      if (failureCode(cause) === "LAST_OWNER") {
        void queryClient.invalidateQueries({
          queryKey: membersQuery(workspace.id).queryKey,
        });
      }
      return { failure: cause };
    }
  };
  const isInsideWorkspace = () => {
    const { pathname } = router.state.location;
    return (
      pathname === `/w/${workspace.id}` ||
      pathname.startsWith(`/w/${workspace.id}/`)
    );
  };
  const hasLeft = async () => {
    if (!isShown.current && !isInsideWorkspace()) {
      // Gone with its screen: the user is left where they went (6.0.6).
      await queryClient.invalidateQueries({ queryKey: meQuery().queryKey });
    } else if (isOpenNow || !isShown.current) {
      // Away first: the workspace's pages would otherwise say "You don't have access",
      // also to a user who moved to another of them once the question was gone (6.0.6).
      await navigate({
        href: personalId === undefined ? "/" : `/w/${personalId}`,
      });
      await queryClient.invalidateQueries({ queryKey: meQuery().queryKey });
    } else {
      // The user read again before the question closes, so the row is gone with it.
      await queryClient.invalidateQueries({ queryKey: meQuery().queryKey });
      onClose();
    }
    queryClient.removeQueries({ queryKey: workspaceKey(workspace.id) });
    ToastQueue.neutral(
      t("settings:confirm.left", { workspace: workspace.name }),
      { timeout: TOAST_MS },
    );
  };
  /** A failure once the question is closed: in a toast, as a row's send (6.0.6). */
  const toastOf = (cause: unknown) => {
    if (failureCode(cause) === "LAST_OWNER") {
      ToastQueue.neutral(lastOwnerWords, { timeout: TOAST_MS });
      return;
    }
    toastFailure(cause, () => void leaveClosed());
  };
  /** The toast's Retry: the same leave, with no question to wait for it. */
  const leaveClosed = async () => {
    const outcome = await send();
    if (outcome === null) {
      await hasLeft();
    } else {
      toastOf(outcome.failure);
    }
  };
  const leave = async () => {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    setFailure(null);
    const outcome = await send();
    if (outcome === null) {
      await hasLeft();
      return;
    }
    busy.current = false;
    setSending(false);
    if (isCancelled.current || !isShown.current) {
      onClose();
      toastOf(outcome.failure);
    } else {
      setFailure(outcome.failure);
    }
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
        // While on its way the answer decides: it closes the question either way.
        if (busy.current) {
          isCancelled.current = true;
        } else {
          onClose();
        }
      }}
    >
      <Stack gap="space-200">
        <Text>{t("settings:confirm.leaveBody")}</Text>
        {failure !== null &&
          (failureCode(failure) === "LAST_OWNER" ? (
            <InlineAlert variant="negative">{lastOwnerWords}</InlineAlert>
          ) : (
            <ModalSendFailure
              error={failure}
              onRetry={() => void leave()}
              isRetryDisabled={!isOnline || isSending}
              onClose={onClose}
            />
          ))}
      </Stack>
    </AlertDialog>
  );
}
