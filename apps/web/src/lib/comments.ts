import type { CommentTargetRef, CommentThread, Member } from "@moonx/schemas";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { api, call } from "./api";
import { IDEAS_KEY } from "./idea-actions";
import { formatItemTarget, type PanelTarget, parsePanelTarget } from "./panel-target";
import { useMe } from "./session";

/** Every comment query lives under this prefix. */
export const COMMENTS_KEY = ["comments"] as const;

type ItemTarget = Extract<PanelTarget, { kind: "item" }>;

/** The item a comment target string names, or null for a malformed value or a screen target. */
export function itemTargetOf(target: string | null): ItemTarget | null {
  const parsed = parsePanelTarget(target);
  return parsed?.kind === "item" ? parsed : null;
}

/** Comments on a self-analysis answer sit in the workspace it is shared with (SDD 5.11 C1). */
export const isSelfAnalysisTarget = (target: ItemTarget) => target.type === "self_analysis_answer";

/** The workspace a new comment is written in: the one the screen is under, else the last opened. */
export function useCommentWorkspaceId(): string {
  const me = useMe();
  const params = useParams({ strict: false }) as { workspaceId?: string };
  return params.workspaceId ?? me.lastWorkspaceId ?? me.memberships[0]?.workspace.id ?? "";
}

/** C1 GET. `workspaceId` is sent only for a self-analysis target, where it picks the share. */
export function commentsQuery(target: ItemTarget, workspaceId: string) {
  const share = isSelfAnalysisTarget(target) ? workspaceId : null;
  return queryOptions({
    queryKey: [...COMMENTS_KEY, formatItemTarget(target.type, target.id, target.key), share],
    queryFn: () =>
      call(
        api().api.v1.comments.get({
          query: {
            targetType: target.type as CommentTargetRef["type"],
            targetId: target.id,
            ...(target.key ? { targetKey: target.key } : {}),
            ...(share ? { workspaceId: share } : {}),
          },
        }),
      ),
  });
}

/** How many comments a thread list holds; a deleted comment is not counted. */
export function countComments(threads: CommentThread[]): number {
  return threads.reduce(
    (sum, thread) =>
      sum + [thread.root, ...thread.replies].filter((comment) => !comment.deleted).length,
    0,
  );
}

/** The comment count of a target for the header badge; 0 while loading or when there is none. */
export function useCommentCount(commentTarget: string | null): number {
  const item = itemTargetOf(commentTarget);
  const workspaceId = useCommentWorkspaceId();
  const { data } = useQuery({
    ...commentsQuery(item ?? { kind: "item", type: "idea", id: "", key: null }, workspaceId),
    enabled: item !== null,
  });
  return data ? countComments(data.threads) : 0;
}

/** W-members: who a comment can mention. */
export function membersQuery(workspaceId: string) {
  return queryOptions({
    queryKey: ["workspaces", workspaceId, "members"],
    queryFn: () => call(api().api.v1.workspaces({ workspaceId }).members.get()),
    enabled: workspaceId !== "",
  });
}

/**
 * The members a comment on the target can mention (design-spec 6.0.4): everyone in the workspace,
 * Viewers included, except for a self analysis, which only Owners and Members can read.
 */
export function mentionCandidates(members: Member[], target: ItemTarget, meId: string): Member[] {
  return members.filter(
    (member) =>
      member.user.id !== meId && (!isSelfAnalysisTarget(target) || member.role !== "viewer"),
  );
}

/** C1 POST, C2 PATCH and DELETE, C3: the writes of the comment panel. */
export function useCommentMutations(target: ItemTarget) {
  const queryClient = useQueryClient();
  // Screens show comment counts from their own data (the idea list and home, the validation's
  // sections), so those prefixes are refreshed with the threads.
  const refresh = () =>
    Promise.all(
      [COMMENTS_KEY, IDEAS_KEY, ["validations"]].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  return {
    create: useMutation({
      mutationFn: (input: {
        workspaceId: string;
        parentId?: string;
        body: string;
        mentionUserIds: string[];
      }) =>
        call(
          api().api.v1.comments.post({
            workspaceId: input.workspaceId,
            target: {
              type: target.type as CommentTargetRef["type"],
              id: target.id,
              ...(target.key ? { key: target.key } : {}),
            },
            ...(input.parentId ? { parentId: input.parentId } : {}),
            body: input.body,
            mentionUserIds: input.mentionUserIds,
          }),
        ),
      onSuccess: refresh,
    }),
    edit: useMutation({
      mutationFn: (input: { commentId: string; body: string; mentionUserIds: string[] }) =>
        call(
          api()
            .api.v1.comments({ commentId: input.commentId })
            .patch({ body: input.body, mentionUserIds: input.mentionUserIds }),
        ),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (commentId: string) => call(api().api.v1.comments({ commentId }).delete()),
      onSuccess: refresh,
    }),
    resolve: useMutation({
      mutationFn: (input: { commentId: string; resolved: boolean }) => {
        const route = api().api.v1.comments({ commentId: input.commentId }).resolve;
        return call(input.resolved ? route.post() : route.delete());
      },
      onSuccess: refresh,
    }),
  };
}
