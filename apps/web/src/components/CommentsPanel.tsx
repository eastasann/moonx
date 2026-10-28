import { formatCount, formatRelativeTime, i18n } from "@moonx/i18n";
import {
  type Comment,
  type CommentTargetType,
  type CommentThread,
  commentBodySchema,
  type TargetRef,
  type UserRef,
} from "@moonx/schemas";
import {
  ActionButton,
  ActionMenu,
  AlertDialog,
  Avatar,
  Button,
  Disclosure,
  Flex,
  InlineAlert,
  type MentionCandidate,
  MentionTextArea,
  MenuItem,
  Picker,
  Stack,
  Text,
} from "@moonx/ui-web";
import {
  type QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api, inPath, unwrap } from "../lib/api";
import { rejectionReason } from "../lib/autosave";
import { ruleErrorOf } from "../lib/input-issues";
import { useIsOnline } from "../lib/online";
import {
  type PanelTarget,
  type ScreenTarget,
  sameScreen,
} from "../lib/panel-target";
import {
  commentsKey,
  commentsQuery,
  mentionCandidatesQuery,
} from "../lib/queries";
import { isSessionLost } from "../lib/send";
import { toastFailure } from "./ideaActions";
import { rateLimitWords } from "./SendFailure";
import { FailureState, LoadingBlock, reportOnce } from "./states";
import { UserName } from "./UserName";
import { dashboardHref, useWorkspace } from "./workspace";

/**
 * What a screen tells its comments panel (PNL-1, design-spec 6.0.4): the screen as C1
 * reads it, the idea it is inside, the items it shows and their names.
 */
export interface ScreenComments {
  /** The screen as C1 lists it (SDD 6.3「画面と節の対応」). */
  screen: ScreenTarget;
  /**
   * The idea the screen is inside: its comments list with the screen's, and a new thread
   * from the header's 💬 goes on it (design-spec 6.0.1). Archived, it is read-only. None
   * outside an idea (10–12), whose header list takes no new thread.
   */
  idea?: { id: string; name: string; archived: boolean };
  /**
   * The plan the screen is of (20–23). Archived, its panels are read-only and say so in
   * the plan's words, unless its idea is archived too (6.0.4).
   */
  plan?: { id: string; archived: boolean };
  /**
   * The screen's data that counts the comments of its items (`ideaKey`, or the
   * self-analysis's): read again after each write, with the threads.
   */
  dataKey: QueryKey;
  /**
   * The owner's own self-analysis (10, 11, their own row on 12): its threads come from
   * every workspace it is shared with (`shares`), each saying which and replied to there.
   * A new thread goes to the workspace open now while it is one of them, else to the one
   * chosen of them: C1 POST takes a self-analysis's comments in those only (design-spec
   * 6.0.4).
   */
  fromWorkspaces?: { shares: readonly { id: string; name: string }[] };
  /**
   * Whether the screen shows `item`, so its panel may open on it: a `target` for another
   * screen's item, or an item this one does not hold, opens nothing (SDD 4章). Items the
   * screen has not read yet count as shown until it has.
   */
  shows: (item: TargetRef) => boolean;
  /** An item's name, over its threads in the screen's list ("01 WHO", "Costs · Rent"). */
  labelOf: (target: TargetRef) => string | undefined;
  /**
   * Where the names of the screen's list stand when the screen reads them for it (20 reads
   * its items' once the list opens): the list waits for them, and a failed read says so.
   * `retry` reads again the ones not in yet, failed or slow.
   */
  labelsState?: { isPending: boolean; error: unknown; retry: () => void };
}

/**
 * Why a panel is read-only, in the words of 6.0.4: "This idea is archived…" or, on a
 * plan's screen whose idea is not, "This plan is archived…"; null while it can be
 * written in. `refused` is a write the API turned down as archived before the screen
 * knew: the screen's plan, if it has one, is then the likelier, until it reads again.
 */
export function archivedNotice(
  comments: Pick<ScreenComments, "idea" | "plan">,
  refused: boolean,
): string | null {
  if (comments.idea?.archived === true) {
    return i18n.t("panels:comments.archived.idea");
  }
  if (comments.plan?.archived === true || (refused && comments.plan)) {
    return i18n.t("panels:comments.archived.plan");
  }
  return refused ? i18n.t("panels:comments.archived.idea") : null;
}

/** Whether the screen shows what `target` names, so its panel may open on it. */
export function screenAccepts(
  comments: ScreenComments,
  target: PanelTarget,
): boolean {
  if (target.kind === "screen")
    return sameScreen(target.screen, comments.screen);
  if (target.item.type === "idea") {
    return target.item.id === comments.idea?.id && target.item.key == null;
  }
  return comments.shows(target.item);
}

/** The comment target a TargetRef names, as C1 POST and W8 take it. */
const commentTarget = (target: TargetRef) => ({
  type: target.type as CommentTargetType,
  id: target.id,
  key: target.key ?? null,
});

/** The candidates of MentionTextArea from W8's people. */
const asCandidates = (people: readonly UserRef[]): MentionCandidate[] =>
  people.map(({ id, displayName }) => ({ id, name: displayName }));

/** Every list of threads and the counts of the screen's items read again after a write. */
function useCommentsChanged(dataKey: QueryKey) {
  const queryClient = useQueryClient();
  // Awaited by the writes, which stay pending until the threads are read again: a second
  // press of Resolve then acts on the thread as it is now.
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: commentsKey }),
      queryClient.invalidateQueries({ queryKey: dataKey }),
    ]);
}

/**
 * Why a post failed, under its box (design-spec 6.0.4「書き込みに失敗したら」): "Couldn't
 * post" and Retry, with the reason of a refusal for good (6.0.2) or the Ref of an
 * unexpected failure; "Too many attempts…" for a rate limit. The text stays typed.
 */
function PostFailure({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const { t } = useTranslation(["panels", "app"]);
  const rateLimited = rateLimitWords(error);
  // Someone mentioned left, or became unable to read the item, since the box listed them.
  const isMentionRefused =
    error instanceof ApiError && error.code === "INVALID_MENTION";
  const reason =
    error instanceof ApiError && !isMentionRefused
      ? rejectionReason(error)
      : null;
  const isTransient =
    error instanceof ApiError &&
    (error.status === null || error.code === "UPSTREAM_UNAVAILABLE");
  const reference = useMemo(
    () =>
      rateLimited !== null || reason !== null || isTransient || isMentionRefused
        ? null
        : error instanceof ApiError
          ? error.requestId
          : reportOnce(error),
    [error, rateLimited, reason, isTransient, isMentionRefused],
  );
  if (rateLimited !== null) {
    return <InlineAlert variant="negative">{rateLimited}</InlineAlert>;
  }
  return (
    <InlineAlert variant="negative">
      <Flex gap="space-200" wrap alignItems="center">
        <Text>{t("panels:comments.couldNotPost")}</Text>
        {reason !== null && (
          <Text tone="secondary">{t(`app:save.reason.${reason}`)}</Text>
        )}
        {isMentionRefused && (
          <Text tone="secondary">{t("panels:comments.invalidMention")}</Text>
        )}
        {reference !== null && (
          <Text variant="caption" tone="secondary">
            {t("app:state.ref", { ref: reference.slice(0, 8) })}
          </Text>
        )}
        <Button variant="secondary" size="S" onPress={onRetry}>
          {t("app:state.retry")}
        </Button>
      </Flex>
    </InlineAlert>
  );
}

/**
 * A box to write in with `@` mentions (MentionTextArea, design-spec 4.5) and its send:
 * Post is pressable once something is typed, and once only while it sends (6.0.6). A
 * failure leaves the text with Retry; ARCHIVED makes the panel read-only (6.0.4).
 */
function CommentBox({
  label,
  workspaceId,
  target,
  initial,
  submitLabel,
  send,
  onDone,
  onCancel,
  onArchived,
  autoFocus = false,
}: {
  label: string;
  /** The workspace the comment goes to: who it can mention depends on it (W8). */
  workspaceId: string;
  /** What the comment is on: who it can mention depends on it too. */
  target: TargetRef;
  /** An edit starts from the comment's words and mentions. */
  initial?: { body: string; mentions: MentionCandidate[] };
  submitLabel: string;
  send: (body: string, mentionUserIds: string[]) => Promise<unknown>;
  /** Sent: an edit or a reply closes its box; a new thread's box stays, emptied. */
  onDone?: () => void;
  onCancel?: () => void;
  onArchived: () => void;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation(["panels", "app"]);
  const isOnline = useIsOnline();
  const [text, setText] = useState(initial?.body ?? "");
  const [mentions, setMentions] = useState<MentionCandidate[]>(
    initial?.mentions ?? [],
  );
  // Mentions are of the workspace the comment goes to: another one ("Post to") drops
  // them, as its people differ (W8).
  const [mentionsIn, setMentionsIn] = useState(workspaceId);
  if (mentionsIn !== workspaceId) {
    setMentionsIn(workspaceId);
    setMentions([]);
  }
  const candidates = useQuery(
    mentionCandidatesQuery(workspaceId, commentTarget(target)),
  );
  const post = useMutation({
    mutationFn: () =>
      send(
        text,
        mentions.map(({ id }) => id),
      ),
    onSuccess: () => {
      setText("");
      setMentions([]);
      onDone?.();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "ARCHIVED") onArchived();
      // Who can be mentioned changed: the list is read again for the next try.
      if (error instanceof ApiError && error.code === "INVALID_MENTION") {
        void candidates.refetch();
      }
    },
  });
  // Empty is not wrong, only not ready: Post waits (6.0.6). Other rules say why.
  const isEmpty = text.trim() === "";
  const ruleError = isEmpty ? undefined : ruleErrorOf(commentBodySchema, text);
  const submit = () => {
    if (isEmpty || ruleError !== undefined || post.isPending) return;
    post.mutate();
  };
  const failure =
    post.error === null ||
    isSessionLost(post.error) ||
    (post.error instanceof ApiError && post.error.code === "ARCHIVED")
      ? null
      : post.error;
  return (
    <Stack gap="space-100">
      <MentionTextArea
        label={label}
        placeholder={t("panels:comments.placeholder")}
        value={text}
        onChange={setText}
        mentions={mentions}
        onMentionsChange={setMentions}
        candidates={asCandidates(candidates.data?.items ?? [])}
        errorMessage={ruleError}
        isReadOnly={!isOnline}
        autoFocus={autoFocus}
        size="S"
      />
      {candidates.isError && (
        <Flex gap="space-100" alignItems="center" wrap>
          <Text variant="caption" tone="notice">
            {t("panels:comments.noCandidates")}
          </Text>
          <Button
            variant="secondary"
            isQuiet
            size="S"
            onPress={() => void candidates.refetch()}
          >
            {t("app:state.retry")}
          </Button>
        </Flex>
      )}
      {failure !== null && <PostFailure error={failure} onRetry={submit} />}
      <Flex gap="space-100" justifyContent="end">
        {onCancel !== undefined && (
          <Button variant="secondary" isQuiet size="S" onPress={onCancel}>
            {t("panels:comments.cancel")}
          </Button>
        )}
        <Button
          variant="primary"
          size="S"
          isDisabled={isEmpty || ruleError !== undefined || !isOnline}
          isPending={post.isPending}
          onPress={submit}
        >
          {submitLabel}
        </Button>
      </Flex>
    </Stack>
  );
}

/** The C2 and C3 calls on one comment. */
const commentCalls = (commentId: string) => {
  const one = api().api.v1.comments({ commentId: inPath(commentId) });
  return {
    edit: (body: string, mentionUserIds: string[]) =>
      unwrap(one.patch({ body, mentionUserIds })),
    remove: () => unwrap(one.delete({})),
    resolve: () => unwrap(one.resolve.post({})),
    reopen: () => unwrap(one.resolve.delete({})),
  };
};

/**
 * One comment: its writer, when, "edited", and its words, or "deleted" (design-spec
 * 6.0.4). The writer's own ⋯ edits it in place or deletes it, asking first.
 */
function CommentEntry({
  comment,
  canWrite,
  dataKey,
  onArchived,
  children,
}: {
  comment: Comment;
  canWrite: boolean;
  dataKey: QueryKey;
  onArchived: () => void;
  /** Under its words: a root's replies and the thread's actions. */
  children?: ReactNode;
}) {
  const { t } = useTranslation(["panels", "app"]);
  const { me } = useWorkspace();
  const changed = useCommentsChanged(dataKey);
  const [isEditing, setEditing] = useState(false);
  const [isDeleting, setDeleting] = useState(false);
  const calls = commentCalls(comment.id);
  const remove = useMutation({
    mutationFn: calls.remove,
    onSettled: changed,
    onError: (error) => {
      if (error instanceof ApiError && error.code === "ARCHIVED") onArchived();
      else toastFailure(error, () => remove.mutate());
    },
  });
  const isOwn = comment.author.id === me.id && !comment.deleted;
  const meta = [
    formatRelativeTime(comment.createdAt, { timeZone: me.timezone }),
    ...(comment.editedAt !== null && !comment.deleted
      ? [t("panels:comments.edited")]
      : []),
  ].join(t("app:separator"));
  return (
    <Flex gap="space-200" alignItems="start">
      <Avatar
        name={comment.author.displayName}
        src={comment.author.avatarUrl}
      />
      <Stack gap="space-100">
        <Flex gap="space-100" alignItems="start" justifyContent="space-between">
          <Stack gap="space-25">
            <Text variant="label">
              <UserName user={comment.author} />
            </Text>
            <Text variant="caption" tone="secondary">
              {meta}
            </Text>
          </Stack>
          {isOwn && canWrite && !isEditing && (
            <ActionMenu
              size="S"
              aria-label={t("panels:comments.more", {
                name: comment.author.displayName,
              })}
              onAction={(key) => {
                if (key === "edit") setEditing(true);
                else if (key === "delete") setDeleting(true);
              }}
            >
              <MenuItem id="edit">{t("panels:comments.edit")}</MenuItem>
              <MenuItem id="delete">{t("panels:comments.delete")}</MenuItem>
            </ActionMenu>
          )}
        </Flex>
        {comment.deleted ? (
          <Text tone="tertiary">{t("panels:comments.deleted")}</Text>
        ) : isEditing ? (
          <CommentBox
            label={t("panels:comments.editLabel")}
            workspaceId={comment.workspace.id}
            target={comment.target}
            initial={{
              body: comment.body,
              mentions: asCandidates(comment.mentions),
            }}
            submitLabel={t("panels:comments.save")}
            send={(body, mentionUserIds) =>
              calls.edit(body, mentionUserIds).finally(changed)
            }
            onDone={() => setEditing(false)}
            onCancel={() => setEditing(false)}
            onArchived={onArchived}
            autoFocus
          />
        ) : (
          <Text variant="body-long">{comment.body}</Text>
        )}
        {children}
      </Stack>
      {isDeleting && (
        <AlertDialog
          isOpen
          variant="destructive"
          size="S"
          title={t("panels:comments.deleteTitle")}
          primaryActionLabel={t("panels:comments.delete")}
          cancelLabel={t("panels:comments.cancel")}
          onPrimaryAction={() => {
            setDeleting(false);
            remove.mutate();
          }}
          onCancel={() => setDeleting(false)}
        >
          {t("panels:comments.deleteBody")}
        </AlertDialog>
      )}
    </Flex>
  );
}

/**
 * A thread: its first comment, the replies under it (one level), Reply, and Resolve or
 * Reopen for anyone who can comment (design-spec 6.0.4). A resolved thread folds into one
 * line that opens it. In a screen's list the item it is on names it.
 */
function ThreadView({
  thread,
  label,
  canWrite,
  dataKey,
  onArchived,
}: {
  thread: CommentThread;
  label: string | undefined;
  canWrite: boolean;
  dataKey: QueryKey;
  onArchived: () => void;
}) {
  const { t } = useTranslation(["panels"]);
  const { root, replies } = thread;
  const changed = useCommentsChanged(dataKey);
  const [isReplying, setReplying] = useState(false);
  const calls = commentCalls(root.id);
  const resolved = root.resolvedAt !== null;
  const toggle = useMutation({
    mutationFn: () => (resolved ? calls.reopen() : calls.resolve()),
    onSettled: changed,
    onError: (error) => {
      if (error instanceof ApiError && error.code === "ARCHIVED") onArchived();
      else toastFailure(error, () => toggle.mutate());
    },
  });
  const content = (
    <Stack gap="space-200">
      {label !== undefined && (
        <Text variant="caption" tone="secondary">
          {label}
        </Text>
      )}
      <CommentEntry
        comment={root}
        canWrite={canWrite}
        dataKey={dataKey}
        onArchived={onArchived}
      >
        {replies.map((reply) => (
          <CommentEntry
            key={reply.id}
            comment={reply}
            canWrite={canWrite}
            dataKey={dataKey}
            onArchived={onArchived}
          />
        ))}
        {resolved && root.resolvedBy !== null && (
          <Text variant="caption" tone="secondary">
            {t("panels:comments.resolvedBy", {
              name: root.resolvedBy.displayName,
            })}
          </Text>
        )}
        {canWrite &&
          (isReplying ? (
            <CommentBox
              label={t("panels:comments.replyTo", {
                name: root.author.displayName,
              })}
              workspaceId={root.workspace.id}
              target={root.target}
              submitLabel={t("panels:comments.reply")}
              send={(body, mentionUserIds) =>
                unwrap(
                  api().api.v1.comments.post({
                    workspaceId: root.workspace.id,
                    target: commentTarget(root.target),
                    parentId: root.id,
                    body,
                    mentionUserIds,
                  }),
                ).finally(changed)
              }
              onDone={() => setReplying(false)}
              onCancel={() => setReplying(false)}
              onArchived={onArchived}
              autoFocus
            />
          ) : (
            <Flex gap="space-100">
              {!resolved && (
                <Button
                  variant="secondary"
                  isQuiet
                  size="S"
                  onPress={() => setReplying(true)}
                >
                  {t("panels:comments.reply")}
                </Button>
              )}
              <Button
                variant="secondary"
                isQuiet
                size="S"
                isPending={toggle.isPending}
                onPress={() => toggle.mutate()}
              >
                {resolved
                  ? t("panels:comments.reopen")
                  : t("panels:comments.resolve")}
              </Button>
            </Flex>
          ))}
      </CommentEntry>
    </Stack>
  );
  if (!resolved) return content;
  return (
    <Disclosure
      isQuiet
      size="S"
      headingLevel={3}
      title={
        // Folded to one line, however long the comment (6.0.4).
        <Text variant="label" maxLines={1}>
          {root.deleted
            ? t("panels:comments.resolvedDeleted", {
                name: root.author.displayName,
              })
            : t("panels:comments.resolvedThread", {
                name: root.author.displayName,
                excerpt: root.body,
              })}
        </Text>
      }
    >
      {content}
    </Disclosure>
  );
}

/**
 * PNL-1's content (design-spec 6.0.4): the threads of one item, or of the screen with the
 * comments on its idea (the header's 💬, 6.0.1), oldest first, and a box for a new thread
 * on the item or on the idea. Read-only, with why, while the idea is archived. On the
 * owner's own self-analysis each thread says the workspace it is from (6.0.4).
 */
export function CommentsPanelBody({
  target,
  comments,
}: {
  target: PanelTarget;
  comments: ScreenComments;
}) {
  const { t } = useTranslation(["panels", "app"]);
  const { me, workspace } = useWorkspace();
  const { idea, dataKey, fromWorkspaces } = comments;
  const queryClient = useQueryClient();
  const changed = useCommentsChanged(dataKey);
  const query = useQuery(commentsQuery(workspace.id, target));
  // A write the API refused as archived (the screen did not know): read-only from then on,
  // and the screen reads again to learn what is archived.
  const [refusedArchived, setRefusedArchived] = useState(false);
  const notice = archivedNotice(comments, refusedArchived);
  const canWrite = notice === null;
  const onArchived = () => {
    setRefusedArchived(true);
    void queryClient.invalidateQueries({ queryKey: dataKey });
  };
  const newTarget: TargetRef | undefined =
    target.kind === "item"
      ? target.item
      : idea === undefined
        ? undefined
        : { type: "idea", id: idea.id, key: null };
  // Where a new thread goes: here, or on the owner's own self-analysis to a workspace it
  // is shared with, the one open now when it is (6.0.4).
  const here = { id: workspace.id, name: workspace.name };
  const destinations =
    fromWorkspaces === undefined ||
    fromWorkspaces.shares.some(({ id }) => id === workspace.id)
      ? [here]
      : fromWorkspaces.shares;
  const [chosenId, setChosenId] = useState<string | null>(null);
  const postIn =
    destinations.find(({ id }) => id === chosenId) ?? destinations[0];
  const itemLabel =
    target.kind === "item" ? comments.labelOf(target.item) : undefined;
  /** What heads a thread: its item in a screen's list, and the workspace it is from. */
  const threadLabel = (thread: CommentThread) => {
    const parts = [
      ...(target.kind === "screen"
        ? [comments.labelOf(thread.root.target)]
        : []),
      ...(fromWorkspaces === undefined
        ? []
        : [
            t("panels:comments.fromWorkspace", {
              workspace: thread.root.workspace.name,
            }),
          ]),
    ].filter((part): part is string => part !== undefined);
    return parts.length === 0 ? undefined : parts.join(t("app:separator"));
  };

  const labels = target.kind === "screen" ? comments.labelsState : undefined;
  let threads: ReactNode;
  if (query.isError || (labels !== undefined && labels.error !== null)) {
    threads = (
      <FailureState
        error={query.error ?? labels?.error}
        onRetry={() => {
          if (query.isError) void query.refetch();
          labels?.retry();
        }}
        dashboardHref={dashboardHref(me)}
        headingLevel={3}
        size="S"
      />
    );
  } else if (query.data === undefined || labels?.isPending === true) {
    threads = (
      <LoadingBlock
        onRetry={() => {
          void query.refetch();
          labels?.retry();
        }}
      >
        <Stack gap="space-200">
          <Text>{t("panels:comments.empty")}</Text>
          <Text>{t("panels:comments.placeholder")}</Text>
        </Stack>
      </LoadingBlock>
    );
  } else if (query.data.threads.length === 0) {
    threads = <Text tone="secondary">{t("panels:comments.empty")}</Text>;
  } else {
    threads = (
      <Stack gap="space-400">
        {query.data.threads.map((thread) => (
          <Stack key={thread.root.id}>
            <ThreadView
              thread={thread}
              label={threadLabel(thread)}
              canWrite={canWrite}
              dataKey={dataKey}
              onArchived={onArchived}
            />
          </Stack>
        ))}
      </Stack>
    );
  }

  return (
    <Stack gap="space-400">
      {notice !== null && <InlineAlert variant="notice">{notice}</InlineAlert>}
      {itemLabel !== undefined && (
        <Text variant="caption" tone="secondary">
          {t("panels:comments.onItem", { item: itemLabel })}
        </Text>
      )}
      {threads}
      {canWrite &&
        query.data !== undefined &&
        newTarget !== undefined &&
        (postIn === undefined ? (
          // Shared nowhere: no one could read a thread (6.0.4).
          <Text variant="body-sm" tone="secondary" elementType="p">
            {t("panels:comments.noNewThread")}
          </Text>
        ) : (
          <Stack gap="space-100">
            {postIn.id !== workspace.id && (
              <Picker
                label={t("panels:comments.postTo")}
                items={destinations.map(({ id, name }) => ({
                  id,
                  label: name,
                }))}
                value={postIn.id}
                onChange={(id) => setChosenId(id)}
                size="S"
                width="full"
              />
            )}
            <CommentBox
              label={
                target.kind === "item" || idea === undefined
                  ? t("panels:comments.new")
                  : t("panels:comments.newOnIdea", { idea: idea.name })
              }
              workspaceId={postIn.id}
              target={newTarget}
              submitLabel={t("panels:comments.post")}
              send={(body, mentionUserIds) =>
                unwrap(
                  api().api.v1.comments.post({
                    workspaceId: postIn.id,
                    target: commentTarget(newTarget),
                    body,
                    mentionUserIds,
                  }),
                ).finally(changed)
              }
              onArchived={onArchived}
            />
          </Stack>
        ))}
    </Stack>
  );
}

/**
 * An item's 💬 beside it (design-spec 6.0.4: the count of its comments, and the way to
 * its thread): a quiet ActionButton with the count once there is one.
 */
export function ItemCommentsButton({
  label,
  count,
  onPress,
}: {
  /** The item's name, for the button's name ("Comments on 01 WHO"). */
  label: string;
  count: number;
  onPress: () => void;
}) {
  const { t } = useTranslation(["panels"]);
  return (
    <ActionButton
      isQuiet
      size="S"
      aria-label={
        count > 0
          ? t("panels:comments.itemCount", {
              item: label,
              count,
              formatted: formatCount(count),
            })
          : t("panels:comments.item", { item: label })
      }
      onPress={onPress}
    >
      <MessageSquare />
      {count > 0 && formatCount(count)}
    </ActionButton>
  );
}
