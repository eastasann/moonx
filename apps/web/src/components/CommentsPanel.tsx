import { formatRelativeTime } from "@moonx/i18n";
import type { Comment, CommentThread, Me } from "@moonx/schemas";
import {
  ActionButton,
  Avatar,
  Badge,
  Button,
  Disclosure,
  Flex,
  IllustratedMessage,
  InlineAlert,
  Panel,
  Skeleton,
  Stack,
  Text,
} from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, WifiOff } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { isApiError } from "../lib/api-error";
import { splitMentions } from "../lib/comment-text";
import {
  commentsQuery,
  isSelfAnalysisTarget,
  membersQuery,
  mentionCandidates,
  useCommentMutations,
  useCommentWorkspaceId,
} from "../lib/comments";
import { errorText } from "../lib/error-text";
import { formatItemTarget, type PanelTarget } from "../lib/panel-target";
import { useMe } from "../lib/session";
import { CommentForm } from "./CommentForm";

type ItemTarget = Extract<PanelTarget, { kind: "item" }>;

function BadgeLabel({ badge }: { badge: NonNullable<Comment["author"]["badge"]> }) {
  const { t } = useTranslation("panels");
  switch (badge) {
    case "former_member":
      return t("comments.badge.former_member");
    case "suspended":
      return t("comments.badge.suspended");
    case "deleted":
      return t("comments.badge.deleted");
  }
}

function CommentBody({ comment }: { comment: Comment }) {
  const { t } = useTranslation("panels");
  if (comment.deleted) {
    return (
      <Text variant="body-sm" tone="secondary">
        {t("comments.deleted")}
      </Text>
    );
  }
  return (
    <Text variant="body-sm" as="div">
      {splitMentions(comment.body, comment.mentions).map((part, index) =>
        part.mention ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and never reordered
          <Badge key={index} variant="informative" size="S">
            {part.text}
          </Badge>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and never reordered
          <span key={index}>{part.text}</span>
        ),
      )}
    </Text>
  );
}

interface Actions {
  /** Whether a write is allowed: false once the API said the idea or plan is archived. */
  canWrite: boolean;
  /** Adds the target's workspace badge to the first comment of a thread. */
  showWorkspace: boolean;
  me: Me;
  now: Date;
  edit: (comment: Comment, body: string, mentionUserIds: string[]) => Promise<unknown>;
  remove: (comment: Comment) => void;
  candidates: ReturnType<typeof mentionCandidates>;
  isSelfAnalysis: boolean;
}

function CommentView({
  comment,
  actions,
  showWorkspace,
}: {
  comment: Comment;
  actions: Actions;
  showWorkspace: boolean;
}) {
  const { t } = useTranslation("panels");
  const [editing, setEditing] = useState(false);
  const own = comment.author.id === actions.me.id && !comment.deleted;
  return (
    <Stack gap="space-50">
      <Flex gap="space-100" align="center" wrap>
        <Avatar name={comment.author.displayName} src={comment.author.avatarUrl} size="S" />
        <Text variant="label" as="span">
          {comment.author.displayName}
        </Text>
        {comment.author.badge ? (
          <Badge size="S">
            <BadgeLabel badge={comment.author.badge} />
          </Badge>
        ) : null}
        <Text variant="caption" tone="secondary" as="span">
          {formatRelativeTime(comment.createdAt, actions.now, actions.me.timezone)}
        </Text>
        {comment.editedAt && !comment.deleted ? (
          <Text variant="caption" tone="secondary" as="span">
            {t("comments.edited")}
          </Text>
        ) : null}
        {showWorkspace ? (
          <Badge size="S">{t("comments.fromWorkspace", { name: comment.workspace.name })}</Badge>
        ) : null}
      </Flex>
      {editing ? (
        <CommentForm
          label={t("comments.editLabel")}
          submitLabel={t("comments.save")}
          initialBody={comment.body}
          initialMentions={comment.mentions}
          candidates={actions.candidates}
          isSelfAnalysis={actions.isSelfAnalysis}
          onSubmit={async (body, ids) => {
            await actions.edit(comment, body, ids);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <CommentBody comment={comment} />
      )}
      {own && actions.canWrite && !editing ? (
        <Flex gap="space-50">
          <ActionButton isQuiet size="S" onPress={() => setEditing(true)}>
            {t("comments.edit")}
          </ActionButton>
          <ActionButton isQuiet size="S" onPress={() => actions.remove(comment)}>
            {t("comments.delete")}
          </ActionButton>
        </Flex>
      ) : null}
    </Stack>
  );
}

function ThreadView({
  thread,
  actions,
  onReply,
  onResolve,
}: {
  thread: CommentThread;
  actions: Actions;
  onReply: (thread: CommentThread, body: string, mentionUserIds: string[]) => Promise<unknown>;
  onResolve: (thread: CommentThread, resolved: boolean) => void;
}) {
  const { t } = useTranslation("panels");
  const [replying, setReplying] = useState(false);
  const { root } = thread;
  const resolved = root.resolvedAt !== null;
  return (
    <Stack gap="space-100">
      <CommentView comment={root} actions={actions} showWorkspace={actions.showWorkspace} />
      {thread.replies.map((reply) => (
        <Flex key={reply.id} paddingX="space-200">
          <CommentView comment={reply} actions={actions} showWorkspace={false} />
        </Flex>
      ))}
      {resolved && root.resolvedBy ? (
        <Text variant="caption" tone="secondary">
          {t("comments.resolvedBy", { name: root.resolvedBy.displayName })}
        </Text>
      ) : null}
      {actions.canWrite ? (
        <Stack gap="space-100">
          {replying ? (
            <CommentForm
              label={t("comments.replyLabel")}
              submitLabel={t("comments.reply")}
              candidates={actions.candidates}
              isSelfAnalysis={actions.isSelfAnalysis}
              onSubmit={async (body, ids) => {
                await onReply(thread, body, ids);
                setReplying(false);
              }}
              onCancel={() => setReplying(false)}
            />
          ) : (
            <Flex gap="space-50">
              {resolved ? null : (
                <ActionButton isQuiet size="S" onPress={() => setReplying(true)}>
                  {t("comments.reply")}
                </ActionButton>
              )}
              <ActionButton isQuiet size="S" onPress={() => onResolve(thread, !resolved)}>
                {resolved ? t("comments.reopen") : t("comments.resolve")}
              </ActionButton>
            </Flex>
          )}
        </Stack>
      ) : null}
    </Stack>
  );
}

/**
 * PNL-1 (design-spec 6.0.4): the threads of one item, the input, and the thread actions. Anyone
 * who can see the item can comment, Viewers included. An archived idea or plan is read-only: the
 * screen behind the panel says so (`isArchived`), and when it cannot (the panel was opened from
 * another screen) the first write the API refuses as `ARCHIVED` turns the panel read-only.
 */
export function CommentsPanel({
  target,
  isArchived = false,
  onClose,
}: {
  target: ItemTarget;
  /** The screen behind the panel knows the idea or plan is archived. */
  isArchived?: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation("panels");
  const me = useMe();
  const workspaceId = useCommentWorkspaceId();
  const threads = useQuery(commentsQuery(target, workspaceId));
  const members = useQuery(membersQuery(workspaceId));
  const mutations = useCommentMutations(target);
  const [refused, setRefused] = useState(false);
  const archived = isArchived || refused;
  const [actionError, setActionError] = useState<unknown>(null);
  const isSelfAnalysis = isSelfAnalysisTarget(target);
  const candidates = mentionCandidates(members.data?.items ?? [], target, me.id);

  const noteError = (error: unknown) => {
    if (isApiError(error) && error.code === "ARCHIVED") setRefused(true);
  };
  /** Runs a form's write: an `ARCHIVED` answer is noted, and every error still reaches the form. */
  const attempt = async <T,>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      noteError(error);
      throw error;
    }
  };
  const failed = (error: unknown) => {
    noteError(error);
    setActionError(error);
  };

  const actions: Actions = {
    canWrite: !archived,
    showWorkspace: isSelfAnalysis,
    me,
    now: new Date(),
    edit: (comment, body, mentionUserIds) =>
      attempt(() => mutations.edit.mutateAsync({ commentId: comment.id, body, mentionUserIds })),
    remove: (comment) => {
      setActionError(null);
      mutations.remove.mutate(comment.id, { onError: failed });
    },
    candidates,
    isSelfAnalysis,
  };
  const onReply = (thread: CommentThread, body: string, mentionUserIds: string[]) =>
    attempt(() =>
      mutations.create.mutateAsync({
        // A reply stays in the share of its thread, which matters to the owner of a self analysis.
        workspaceId: isSelfAnalysis ? thread.root.workspace.id : workspaceId,
        parentId: thread.root.id,
        body,
        mentionUserIds,
      }),
    );
  const onResolve = (thread: CommentThread, resolved: boolean) => {
    setActionError(null);
    mutations.resolve.mutate({ commentId: thread.root.id, resolved }, { onError: failed });
  };

  const all = threads.data?.threads ?? [];
  const open = all.filter((thread) => thread.root.resolvedAt === null);
  const resolved = all.filter((thread) => thread.root.resolvedAt !== null);
  const view = (thread: CommentThread) => (
    <ThreadView
      key={thread.root.id}
      thread={thread}
      actions={actions}
      onReply={onReply}
      onResolve={onResolve}
    />
  );

  let body: React.ReactNode;
  if (threads.isPending) {
    body = (
      <Stack gap="space-100">
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </Stack>
    );
  } else if (threads.isError) {
    body = (
      <IllustratedMessage
        icon={WifiOff}
        heading={t("comments.loadError")}
        actions={<Button onPress={() => void threads.refetch()}>{t("comments.retry")}</Button>}
      >
        {errorText(t, threads.error)}
      </IllustratedMessage>
    );
  } else {
    body = (
      <Stack gap="space-300">
        {isArchived ? (
          <InlineAlert variant="notice" heading={t("errors:ARCHIVED")} />
        ) : refused || actionError ? (
          <InlineAlert variant="negative" heading={t("comments.saveFailed")}>
            {refused ? t("errors:ARCHIVED") : errorText(t, actionError)}
          </InlineAlert>
        ) : null}
        {all.length === 0 ? (
          <IllustratedMessage icon={MessageSquare} heading={t("comments.empty")} headingLevel={3} />
        ) : null}
        {open.map(view)}
        {resolved.length > 0 ? (
          <Disclosure title={t("comments.resolvedGroup", { count: resolved.length })}>
            <Stack gap="space-300">{resolved.map(view)}</Stack>
          </Disclosure>
        ) : null}
      </Stack>
    );
  }

  return (
    <Panel
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("comments.title")}
      closeLabel={t("app:close")}
      footer={
        archived || threads.isError ? undefined : (
          <CommentForm
            key={formatItemTarget(target.type, target.id, target.key)}
            label={t("comments.newLabel")}
            submitLabel={t("comments.post")}
            candidates={candidates}
            isSelfAnalysis={isSelfAnalysis}
            onSubmit={(text, mentionUserIds) =>
              attempt(() =>
                mutations.create.mutateAsync({ workspaceId, body: text, mentionUserIds }),
              )
            }
          />
        )
      }
    >
      <div aria-busy={threads.isPending}>{body}</div>
    </Panel>
  );
}
