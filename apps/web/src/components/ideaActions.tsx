import { i18n } from "@moonx/i18n";
import { AlertDialog, ToastQueue } from "@moonx/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api, inPath, unwrap } from "../lib/api";
import { ideaHref, ideasHref } from "../lib/links";
import { ideaKey, workspaceKey } from "../lib/queries";
import { useSendThrough } from "../lib/send";
import { failureCode, rateLimitWords } from "./SendFailure";
import { reportOnce } from "./states";
import { useWorkspace } from "./workspace";

/** A copy whose creation the toast's Undo takes back (design-spec 6.8・6.0.5). */
interface CopyToUndo {
  batchId: string;
  name: string;
  workspaceId: string;
}

const UndoContext = createContext<((copy: CopyToUndo) => void) | null>(null);

/** How long a toast without an action stays: the shortest 4.5 Toast allows. */
const TOAST_MS = 5000;

/** The codes H3 answers when it cannot take a creation back (6.0.5, SDD 8.1). */
const UNDO_REFUSALS = new Set(["UNDO_BLOCKED", "ALREADY_REVERTED", "BUSY"]);

/**
 * Says why a send failed, in a toast with Retry (design-spec 6.0.6): the rate limit's
 * words, or "Something went wrong" with the Ref someone asking for help quotes. A lost
 * session has its own way (M9 or the sign-in screen) and says nothing here.
 */
export function toastFailure(error: unknown, retry: () => void) {
  if (error instanceof ApiError && error.status === 401) return;
  const reference =
    error instanceof ApiError ? error.requestId : reportOnce(error);
  ToastQueue.neutral(
    rateLimitWords(error) ??
      (reference === null
        ? i18n.t("app:state.unexpected")
        : i18n.t("app:state.unexpectedRef", { ref: reference.slice(0, 8) })),
    {
      actionLabel: i18n.t("app:state.retry"),
      onAction: retry,
      shouldCloseOnAction: true,
    },
  );
}

/**
 * Asks before the creation of a copy is taken back (design-spec 6.0.5「作成の取り消し」):
 * "Delete the copied idea?", what goes, and that it cannot be undone. Deleting it opens
 * 6 Ideas. It lives with the workspace's screens, so the toast's Undo still asks after
 * the user has moved between them.
 */
export function DuplicateUndoProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation(["ideas", "app", "errors"]);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [copy, setCopy] = useState<CopyToUndo | null>(null);
  const [isPending, setPending] = useState(false);
  const sendThrough = useSendThrough();
  const undo = async (target: CopyToUndo) => {
    setPending(true);
    try {
      await sendThrough(() =>
        unwrap(
          api()
            .api.v1.history.batches({ batchId: inPath(target.batchId) })
            .revert.post(),
        ),
      );
    } catch (error) {
      const code = failureCode(error);
      if (code === null || !UNDO_REFUSALS.has(code)) {
        toastFailure(error, () => void undo(target));
        return;
      }
      ToastQueue.neutral(
        t(`errors:${code as "UNDO_BLOCKED" | "ALREADY_REVERTED" | "BUSY"}`),
        { timeout: TOAST_MS },
      );
      await queryClient.invalidateQueries({
        queryKey: workspaceKey(target.workspaceId),
      });
      // Taken back elsewhere first: the copy is gone, as after an undo of one's own.
      if (code === "ALREADY_REVERTED") {
        await navigate({ href: ideasHref(target.workspaceId) });
      }
      return;
    } finally {
      setPending(false);
      setCopy(null);
    }
    await queryClient.invalidateQueries({
      queryKey: workspaceKey(target.workspaceId),
    });
    await navigate({ href: ideasHref(target.workspaceId) });
  };
  return (
    <UndoContext.Provider value={setCopy}>
      {children}
      {copy !== null && (
        <AlertDialog
          isOpen
          variant="destructive"
          size="S"
          title={t("ideas:undo.title")}
          primaryActionLabel={t("ideas:undo.confirm")}
          cancelLabel={t("ideas:undo.cancel")}
          isPrimaryActionDisabled={isPending}
          onPrimaryAction={() => void undo(copy)}
          onCancel={() => setCopy(null)}
        >
          {t("ideas:undo.body", { name: copy.name })}
        </AlertDialog>
      )}
    </UndoContext.Provider>
  );
}

/**
 * What the Owners and Members do to an idea from 6's rows and 13's ⋯ (design-spec 6.8):
 * duplicate it, which opens the copy's 13 with "Duplicated from …" and Undo; archive it;
 * restore it. One at a time; a failure says so in a toast with Retry.
 */
export function useIdeaActions() {
  const { t } = useTranslation(["ideas", "app"]);
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const requestUndo = useContext(UndoContext);
  const pending = useRef(false);
  const sendThrough = useSendThrough();

  const refresh = useCallback(
    async (ideaId: string) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workspaceKey(workspace.id) }),
        queryClient.invalidateQueries({ queryKey: ideaKey(ideaId) }),
      ]);
    },
    [queryClient, workspace.id],
  );

  const run = useCallback(
    async (send: () => Promise<void>, retry: () => void) => {
      if (pending.current) return;
      pending.current = true;
      try {
        await sendThrough(send);
      } catch (error) {
        toastFailure(error, retry);
      } finally {
        pending.current = false;
      }
    },
    [sendThrough],
  );

  const duplicate = (idea: { id: string; name: string }) =>
    void run(
      async () => {
        const copy = await unwrap(
          api()
            .api.v1.ideas({ ideaId: inPath(idea.id) })
            .duplicate.post({}),
        );
        await queryClient.invalidateQueries({
          queryKey: workspaceKey(workspace.id),
        });
        await navigate({ href: ideaHref(workspace.id, copy.id) });
        // With an action, the toast stays until it is pressed or closed (4.5 Toast).
        ToastQueue.neutral(t("ideas:duplicated", { name: idea.name }), {
          actionLabel: t("ideas:undo.action"),
          onAction: () =>
            requestUndo?.({
              batchId: copy.batchId,
              name: copy.name,
              workspaceId: workspace.id,
            }),
          shouldCloseOnAction: true,
        });
      },
      () => duplicate(idea),
    );

  const setArchived = (ideaId: string, archived: boolean) =>
    void run(
      async () => {
        const ideas = api().api.v1.ideas({ ideaId: inPath(ideaId) });
        await unwrap(archived ? ideas.archive.post() : ideas.restore.post());
        await refresh(ideaId);
      },
      () => setArchived(ideaId, archived),
    );

  return {
    duplicate,
    archive: (ideaId: string) => setArchived(ideaId, true),
    restore: (ideaId: string) => setArchived(ideaId, false),
  };
}
