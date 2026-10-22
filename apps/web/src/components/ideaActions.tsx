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
import { historyKey, ideaKey, workspaceKey } from "../lib/queries";
import { useSendThrough } from "../lib/send";
import { failureCode, rateLimitWords } from "./SendFailure";
import { reportOnce } from "./states";
import { useWorkspace } from "./workspace";

/**
 * A creation that "Undo" takes back (design-spec 6.0.5「作成の取り消し」): a copy, from the
 * toast after duplicating (6.8) or from its first row in PNL-2, or a plan draft from its
 * first row in PNL-2.
 */
export type CreationToUndo = {
  batchId: string;
  workspaceId: string;
  /**
   * The copy, or the idea the draft is in: read again when the undo is refused, and for
   * a draft the 13 that opens once it is gone.
   */
  ideaId: string;
} & ({ kind: "duplicate"; name: string } | { kind: "plan_draft" });

const UndoContext = createContext<((creation: CreationToUndo) => void) | null>(
  null,
);

/**
 * Asks before a creation is taken back, then takes it back (CreationUndoProvider).
 *
 * @throws {Error} outside the workspace's screens, which the provider wraps.
 */
export function useCreationUndo(): (creation: CreationToUndo) => void {
  const requestUndo = useContext(UndoContext);
  if (requestUndo === null) {
    throw new Error("useCreationUndo outside CreationUndoProvider");
  }
  return requestUndo;
}

/** How long a toast without an action stays: the shortest 4.5 Toast allows. */
const TOAST_MS = 5000;

/** The codes H3 answers when it cannot take a creation back (6.0.5, SDD 8.1). */
const UNDO_REFUSALS = new Set([
  "UNDO_BLOCKED",
  "ALREADY_REVERTED",
  "BUSY",
  "ARCHIVED",
]);

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
 * Asks before a creation is taken back (design-spec 6.0.5「作成の取り消し」): "Delete the
 * copied idea?" or "Delete this plan draft?", what goes, and that it cannot be undone.
 * Taking back a copy opens 6 Ideas, a plan draft its idea's 13; so does "This was already
 * undone", as the copy or draft is gone either way. It lives with the workspace's
 * screens, so the toast's Undo still asks after the user has moved between them.
 */
export function CreationUndoProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation(["ideas", "panels", "app", "errors"]);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [creation, setCreation] = useState<CreationToUndo | null>(null);
  const [isPending, setPending] = useState(false);
  // What was undone is gone: its panel would find nothing if read before the move.
  const sendThrough = useSendThrough({ readsHistoryAgain: false });
  const leave = (target: CreationToUndo) =>
    navigate({
      href:
        target.kind === "duplicate"
          ? ideasHref(target.workspaceId)
          : ideaHref(target.workspaceId, target.ideaId),
    });
  const refresh = (target: CreationToUndo) =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: workspaceKey(target.workspaceId),
      }),
      queryClient.invalidateQueries({ queryKey: historyKey }),
      queryClient.invalidateQueries({ queryKey: ideaKey(target.ideaId) }),
    ]);
  const undo = async (target: CreationToUndo) => {
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
      // Archived since the screen read it: reading it again makes the screen and its
      // panels read-only (6.8).
      ToastQueue.neutral(
        code === "ARCHIVED"
          ? t("panels:comments.archived.idea")
          : t(`errors:${code as "UNDO_BLOCKED" | "ALREADY_REVERTED" | "BUSY"}`),
        { timeout: TOAST_MS },
      );
      // Taken back elsewhere first: it is gone, as after an undo of one's own.
      if (code === "ALREADY_REVERTED") await leave(target);
      await refresh(target);
      return;
    } finally {
      setPending(false);
      setCreation(null);
    }
    // Away first: the copy's screen and panel, read again, would find it gone.
    await leave(target);
    await refresh(target);
  };
  return (
    <UndoContext.Provider value={setCreation}>
      {children}
      {creation !== null && (
        <AlertDialog
          isOpen
          variant="destructive"
          size="S"
          title={
            creation.kind === "duplicate"
              ? t("ideas:undo.title")
              : t("panels:history.planDraftUndo.title")
          }
          primaryActionLabel={t("ideas:undo.confirm")}
          cancelLabel={t("ideas:undo.cancel")}
          isPrimaryActionDisabled={isPending}
          onPrimaryAction={() => void undo(creation)}
          onCancel={() => setCreation(null)}
        >
          {creation.kind === "duplicate"
            ? t("ideas:undo.body", { name: creation.name })
            : t("panels:history.planDraftUndo.body")}
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
  const requestUndo = useCreationUndo();
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
            requestUndo({
              kind: "duplicate",
              ideaId: copy.id,
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
