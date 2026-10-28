import { formatRelativeTime } from "@moonx/i18n";
import type { AnswerType, HistoryEntry } from "@moonx/schemas";
import {
  ActionButton,
  Avatar,
  Button,
  DiffText,
  Flex,
  InlineAlert,
  Skeleton,
  Stack,
  Text,
  useFauLabel,
} from "@moonx/ui-web";
import {
  useInfiniteQuery,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { History } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api, inPath, unwrap } from "../lib/api";
import { useAutosaveState } from "../lib/autosave-react";
import {
  type ChangeContext,
  changeKind,
  changeTitle,
  fieldChanges,
  isCreation,
  isUndoneCreation,
} from "../lib/history-format";
import { useIsOnline } from "../lib/online";
import { formatPanelTarget, type PanelTarget } from "../lib/panel-target";
import {
  commentsKey,
  historyKey,
  historyPage,
  membersQuery,
  planItemQuery,
  workspaceKey,
} from "../lib/queries";
import { isSessionLost, useSendThrough } from "../lib/send";
import {
  archivedNotice,
  type ScreenComments,
  screenAccepts,
} from "./CommentsPanel";
import { useCreationUndo } from "./ideaActions";
import { ModalSendFailure } from "./ModalFailure";
import { failureCode } from "./SendFailure";
import {
  FailureState,
  LoadingBlock,
  SlowLoadingState,
  useIsSlow,
} from "./states";
import { UserName } from "./UserName";
import { dashboardHref, usePanel, useWorkspace } from "./workspace";

/**
 * What a screen tells its history panel (PNL-2, design-spec 6.0.5): what it tells its
 * comments panel, the screen as H1 reads it (SDD 6.3「画面と節の対応」), the idea it is
 * inside, the items it shows and their names; and which of its questions have F/A/U.
 */
export type ScreenHistory = ScreenComments & {
  /** The template's `hasFau` of a question the screen shows; true where it knows none. */
  hasFau?: (questionKey: string) => boolean;
  /**
   * The currency of the screen's amounts: the self-analysis's own on 10 and 11
   * (design-spec 6.11「通貨」); the workspace's when left out.
   */
  currency?: string;
  /** The answer type of a self-analysis question the screen knows (10, 11). */
  answerTypeOf?: (questionKey: string) => AnswerType | undefined;
};

/**
 * The refusals of a revert the row says in words (design-spec 6.0.5・6.0.2, SDD 8.1); the
 * rest go as a send inside a panel does (6.0.6「モーダルの共通の決まり」, SDD 8.2).
 */
const REFUSALS = {
  ALREADY_REVERTED: "errors:ALREADY_REVERTED",
  UNDO_BLOCKED: "errors:UNDO_BLOCKED",
  BUSY: "errors:BUSY",
  NAME_TAKEN: "errors:NAME_TAKEN",
  NOT_FOUND: "app:save.reason.gone",
} as const;

const isRefusal = (code: string | null): code is keyof typeof REFUSALS =>
  code !== null && Object.hasOwn(REFUSALS, code);

/**
 * Whether the screen shows what `target` names, so its history panel may open on it: the
 * screen itself, or an item it shows. The idea's own changes are 13's (SDD 6.3), so the
 * idea opens nothing on the other screens inside it, where its comments do open.
 */
export function historyAccepts(
  history: ScreenHistory,
  target: PanelTarget,
): boolean {
  if (target.kind === "item" && target.item.type === "idea") {
    return (
      history.screen.containerType === "idea" && screenAccepts(history, target)
    );
  }
  return screenAccepts(history, target);
}

/** Whether a plan answer's change kept the rows of a table (history-values.ts). */
const hasRows = (value: unknown) =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as { rows?: unknown }).rows);

/**
 * The plan items whose table answers `entries` changed: their number is the question
 * ID's (`P.{2桁の項目番号}.{連番}`, design-spec 6.6).
 */
function tableItemsOf(entries: readonly HistoryEntry[]): number[] {
  const items = new Set<number>();
  for (const entry of entries) {
    if (
      entry.target.type !== "plan_answer" ||
      !(hasRows(entry.before) || hasRows(entry.after))
    ) {
      continue;
    }
    const itemNo = Number(entry.target.key?.split(".")[1]);
    if (Number.isInteger(itemNo)) items.add(itemNo);
  }
  return [...items].sort((a, b) => a - b);
}

/** Operations "Undo the whole operation" takes back as one (SDD 5.11 H3). */
const isOperation = (entry: HistoryEntry) =>
  entry.batchId !== null &&
  (entry.source === "ai_import" ||
    entry.source === "template_migration" ||
    entry.source === "revert" ||
    isCreation(entry));

/**
 * The rows that carry their operation's "Undo the whole operation": the first of each
 * operation as the list shows it, newest first (design-spec 6.0.5「その操作の先頭の行」).
 * An operation over several screens shows its first row on each.
 */
function operationHeads(entries: readonly HistoryEntry[]): Set<string> {
  const seen = new Set<string>();
  const heads = new Set<string>();
  for (const entry of entries) {
    if (entry.batchId === null || seen.has(entry.batchId)) continue;
    seen.add(entry.batchId);
    heads.add(entry.id);
  }
  return heads;
}

/** One side or both of a field a change touched, under the field's name. */
function FieldDiff({
  label,
  before,
  after,
}: {
  label: string | null;
  before: string;
  after: string;
}) {
  return (
    <Stack gap="space-25">
      {label !== null && (
        <Text variant="caption" tone="secondary">
          {label}
        </Text>
      )}
      {before !== "" && (
        <DiffText variant="before" before={before} after={after} />
      )}
      {after !== "" && (
        <DiffText variant="after" before={before} after={after} />
      )}
    </Stack>
  );
}

/**
 * One change (design-spec 6.0.5): who, when, the item in a screen's list, the kind of
 * change and of operation, the fields before and after (DiffText), and what can be done
 * with it.
 */
function HistoryRow({
  entry,
  label,
  context,
  isWordsPending,
  actions,
  failure,
}: {
  entry: HistoryEntry;
  /** The item's name, over the row in a screen's list. */
  label: string | undefined;
  context: ChangeContext;
  /** What its diff is worded with is still being read: a placeholder in its place. */
  isWordsPending: boolean;
  actions: ReactNode;
  /** Why its revert failed, under it. */
  failure: ReactNode;
}) {
  const { me } = useWorkspace();
  const title = changeTitle(entry);
  const fields = isWordsPending ? [] : fieldChanges(entry, context);
  return (
    <Stack gap="space-200">
      {label !== undefined && (
        <Text variant="caption" tone="secondary">
          {label}
        </Text>
      )}
      <Flex gap="space-200" alignItems="start">
        <Avatar
          name={entry.changedBy.displayName}
          src={entry.changedBy.avatarUrl}
        />
        <Stack gap="space-100">
          <Stack gap="space-25">
            <Text variant="label">
              <UserName user={entry.changedBy} />
            </Text>
            <Text variant="caption" tone="secondary">
              {formatRelativeTime(entry.changedAt, { timeZone: me.timezone })}
            </Text>
          </Stack>
          <Text variant="caption" tone="secondary">
            {changeKind(entry)}
          </Text>
          {title !== null && <Text>{title}</Text>}
          {isWordsPending && (
            <Skeleton isLoading>
              <Text>{entry.label}</Text>
            </Skeleton>
          )}
          {fields.map((field) => (
            // An item's fields have names of their own; only its text has none.
            <FieldDiff key={field.label ?? ""} {...field} />
          ))}
          {actions}
          {failure}
        </Stack>
      </Flex>
    </Stack>
  );
}

/**
 * PNL-2's content (design-spec 6.0.5): the changes of one item, or of the screen, newest
 * first, a page at a time. Owners and Members revert an item to just after a change (H2),
 * undo a delete, and undo a whole operation (H3) from its first row, which for a copy or
 * a plan draft deletes what it made after asking. Viewers and archived ideas read only.
 * What was reverted is read again on the screen.
 */
export function HistoryPanelBody({
  target,
  history,
}: {
  target: PanelTarget;
  history: ScreenHistory;
}) {
  const { t } = useTranslation(["panels", "app", "errors"]);
  const { me, workspace, role } = useWorkspace();
  const queryClient = useQueryClient();
  const sendThrough = useSendThrough();
  const requestUndo = useCreationUndo();
  const fauLabel = useFauLabel();
  const isOnline = useIsOnline();
  const panel = usePanel();
  const saves = useAutosaveState();
  const query = useInfiniteQuery({
    queryKey: [...historyKey, formatPanelTarget(target)],
    queryFn: ({ pageParam }) => historyPage(target, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) =>
      last.nextCursor === null ? undefined : Number(last.nextCursor),
  });
  // A revert the API refused as archived (the screen did not know): read-only from then on.
  const [refusedArchived, setRefusedArchived] = useState(false);
  // One revert at a time: the key of the one on its way. The ref holds it for a Retry
  // made in an earlier render.
  const [pending, setPending] = useState<string | null>(null);
  const isSending = useRef(false);
  // The last revert that failed, on its row: a refusal in words, or the send's failure.
  const [failure, setFailure] = useState<
    | { id: string; words: string }
    | { id: string; error: unknown; retry: () => void }
    | null
  >(null);
  const notice = archivedNotice(history, refusedArchived);
  const canRevert = notice === null && role !== "viewer";
  // A change made since page 1 was read pushes its last rows onto page 2: shown once.
  const entries = [
    ...new Map(
      (query.data?.pages.flatMap((page) => page.items) ?? []).map((entry) => [
        entry.id,
        entry,
      ]),
    ).values(),
  ];
  // A plan's changes name an execution item's assignee and a table's columns (6.0.5):
  // the members, and the items whose tables are listed, are read for their words.
  const { plan, idea } = history;
  const members = useQuery({
    ...membersQuery(workspace.id),
    enabled: plan !== undefined,
  });
  const tableItemNos =
    plan === undefined || idea === undefined ? [] : tableItemsOf(entries);
  const items = useQueries({
    queries:
      plan === undefined || idea === undefined
        ? []
        : tableItemNos.map((itemNo) => planItemQuery(idea.id, plan.id, itemNo)),
  });
  const pendingItems = new Set(
    tableItemNos.filter((_, index) => items[index]?.isPending === true),
  );
  /** Whether a change names an assignee by their id, whose name W2 gives. */
  const namesAssignee = (entry: HistoryEntry) =>
    entry.target.type === "execution_item" &&
    [entry.before, entry.after].some(
      (side) =>
        typeof (side as { assigneeUserId?: unknown } | null)?.assigneeUserId ===
        "string",
    );
  /**
   * Whether a row's words wait for a read: a table whose columns, or an assignee whose
   * name, are not in yet. Only that row waits; the others, and "Show more", stay.
   */
  const waitsForWords = (entry: HistoryEntry) => {
    if (entry.target.type === "plan_answer") {
      return (
        (hasRows(entry.before) || hasRows(entry.after)) &&
        pendingItems.has(Number(entry.target.key?.split(".")[1]))
      );
    }
    return plan !== undefined && members.isPending && namesAssignee(entry);
  };
  // A failed read counts only for the rows worded with it: the tables its items hold
  // (every listed table's item is read for one) and the assignees named by id.
  const wordsFailure =
    (plan !== undefined && entries.some(namesAssignee)
      ? members.error
      : null) ??
    items.find((item) => item.isError)?.error ??
    null;
  const columns = new Map(
    items.flatMap((item) =>
      (item.data?.prompts ?? []).flatMap((prompt) =>
        prompt.options?.kind === "table"
          ? [[prompt.key, prompt.options.columns] as const]
          : [],
      ),
    ),
  );
  const names = new Map(
    (members.data?.items ?? []).map(({ user }) => [user.id, user.displayName]),
  );
  const context: ChangeContext = {
    currency: history.currency ?? workspace.currency,
    timeZone: me.timezone,
    hasFau: history.hasFau ?? (() => true),
    answerTypeOf: history.answerTypeOf,
    tableColumnsOf: (questionKey) => columns.get(questionKey),
    memberName: (userId) => names.get(userId),
    fauLabel,
  };
  // The screen's own saves are changes too: an open panel lists them as they land.
  const lastSaved = Math.max(0, ...(saves?.savedAt.values() ?? []));
  const { refetch } = query;
  useEffect(() => {
    if (lastSaved > 0) void refetch();
  }, [lastSaved, refetch]);

  // Comments of a row brought back, and the dashboard's activity, change with it too.
  const changed = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: historyKey }),
      queryClient.invalidateQueries({ queryKey: history.dataKey }),
      queryClient.invalidateQueries({ queryKey: commentsKey }),
      queryClient.invalidateQueries({ queryKey: workspaceKey(workspace.id) }),
    ]);

  const send = async (
    key: string,
    entry: HistoryEntry,
    call: () => Promise<unknown>,
  ) => {
    if (isSending.current) return;
    isSending.current = true;
    setPending(key);
    setFailure(null);
    try {
      await sendThrough(call);
      await changed();
    } catch (error) {
      if (isSessionLost(error)) return;
      const code = failureCode(error);
      if (error instanceof ApiError && code === "ARCHIVED") {
        setRefusedArchived(true);
        await changed();
      } else if (isRefusal(code)) {
        setFailure({ id: entry.id, words: t(REFUSALS[code]) });
        // Undone elsewhere first, or gone: the list as it is now (6.0.5).
        if (code === "ALREADY_REVERTED" || code === "NOT_FOUND") {
          await changed();
        }
      } else {
        setFailure({
          id: entry.id,
          error,
          retry: () => void send(key, entry, call),
        });
      }
    } finally {
      isSending.current = false;
      setPending(null);
    }
  };
  const revert = (entry: HistoryEntry) =>
    send(`entry:${entry.id}`, entry, () =>
      unwrap(
        api()
          .api.v1.history({ entryId: inPath(entry.id) })
          .revert.post(),
      ),
    );
  const undoOperation = (entry: HistoryEntry, batchId: string) => {
    if (isCreation(entry)) {
      const { idea } = history;
      // Copies and plan drafts are an idea's (SDD 5.11「作成の取り消し」).
      if (idea === undefined) {
        throw new Error("A creation's history is an idea's");
      }
      setFailure(null);
      requestUndo(
        entry.source === "duplicate"
          ? {
              kind: "duplicate",
              batchId,
              workspaceId: workspace.id,
              // A copy's rows are filed under the copy: the screen's idea is it.
              ideaId: idea.id,
              name: idea.name,
            }
          : {
              kind: "plan_draft",
              batchId,
              workspaceId: workspace.id,
              ideaId: idea.id,
            },
      );
      return;
    }
    void send(`batch:${batchId}`, entry, () =>
      unwrap(
        api()
          .api.v1.history.batches({ batchId: inPath(batchId) })
          .revert.post(),
      ),
    );
  };

  const heads = operationHeads(entries);
  const itemLabel =
    target.kind === "item"
      ? (history.labelOf(target.item) ?? entries[0]?.label)
      : undefined;

  const actionsOf = (entry: HistoryEntry, name: string) => {
    if (!canRevert || !entry.revertible || isUndoneCreation(entry)) return null;
    const canRevertItem = entry.target.type !== "template_version";
    const batchId =
      heads.has(entry.id) && isOperation(entry) ? entry.batchId : null;
    if (!canRevertItem && batchId === null) return null;
    return (
      <Flex gap="space-100" wrap>
        {canRevertItem && (
          <Button
            variant="secondary"
            size="S"
            aria-label={
              entry.action === "delete"
                ? t("panels:history.undeleteItem", { item: name })
                : t("panels:history.revertItem", { item: name })
            }
            isDisabled={
              !isOnline || (pending !== null && pending !== `entry:${entry.id}`)
            }
            isPending={pending === `entry:${entry.id}`}
            onPress={() => void revert(entry)}
          >
            {entry.action === "delete"
              ? t("panels:history.undelete")
              : t("panels:history.revert")}
          </Button>
        )}
        {batchId !== null && (
          <Button
            variant="secondary"
            isQuiet
            size="S"
            aria-label={t("panels:history.undoOperationItem", { item: name })}
            isDisabled={
              !isOnline || (pending !== null && pending !== `batch:${batchId}`)
            }
            isPending={pending === `batch:${batchId}`}
            onPress={() => undoOperation(entry, batchId)}
          >
            {t("panels:history.undoOperation")}
          </Button>
        )}
      </Flex>
    );
  };

  // A row's words that take over 10 seconds are a slow load like the list's (6.0.6): the
  // list's place says so, with Retry, which reads again what those rows wait for.
  const isWordsSlow = useIsSlow(entries.some(waitsForWords));
  let rows: ReactNode;
  if (query.isError || wordsFailure !== null) {
    rows = (
      <FailureState
        error={query.error ?? wordsFailure}
        onRetry={() => {
          if (query.isError) void query.refetch();
          if (members.isError) void members.refetch();
          for (const item of items) if (item.isError) void item.refetch();
        }}
        dashboardHref={dashboardHref(me)}
        headingLevel={3}
        size="S"
      />
    );
  } else if (isWordsSlow) {
    rows = (
      <SlowLoadingState
        onRetry={() => {
          if (members.isPending) void members.refetch();
          for (const item of items) if (item.isPending) void item.refetch();
        }}
        headingLevel={3}
        size="S"
      />
    );
  } else if (query.data === undefined) {
    rows = (
      <LoadingBlock onRetry={() => void query.refetch()}>
        <Stack gap="space-200">
          <Text>{t("panels:history.empty")}</Text>
          <Text>{t("panels:history.empty")}</Text>
        </Stack>
      </LoadingBlock>
    );
  } else if (entries.length === 0) {
    rows = <Text tone="secondary">{t("panels:history.empty")}</Text>;
  } else {
    rows = (
      <Stack gap="space-400">
        {entries.map((entry) => {
          const name = entry.label;
          return (
            <HistoryRow
              key={entry.id}
              entry={entry}
              label={target.kind === "screen" ? name : undefined}
              context={context}
              isWordsPending={waitsForWords(entry)}
              actions={actionsOf(entry, name)}
              failure={
                failure?.id !== entry.id ? null : "words" in failure ? (
                  <InlineAlert variant="negative">{failure.words}</InlineAlert>
                ) : (
                  <ModalSendFailure
                    error={failure.error}
                    onRetry={failure.retry}
                    isRetryDisabled={pending !== null || !isOnline}
                    onClose={panel.close}
                  />
                )
              }
            />
          );
        })}
        {query.hasNextPage && (
          <Flex>
            <Button
              variant="secondary"
              size="S"
              isPending={query.isFetchingNextPage}
              onPress={() => void query.fetchNextPage()}
            >
              {t("panels:history.more")}
            </Button>
          </Flex>
        )}
      </Stack>
    );
  }

  return (
    <Stack gap="space-400">
      {notice !== null && <InlineAlert variant="notice">{notice}</InlineAlert>}
      {itemLabel !== undefined && (
        <Text variant="caption" tone="secondary">
          {t("panels:history.onItem", { item: itemLabel })}
        </Text>
      )}
      {rows}
    </Stack>
  );
}

/** An item's 🕘 beside its 💬 (design-spec 6.0.5): the way to the item's changes. */
export function ItemHistoryButton({
  label,
  onPress,
}: {
  /** The item's name, for the button's name ("History of 01 WHO"). */
  label: string;
  onPress: () => void;
}) {
  const { t } = useTranslation(["panels"]);
  return (
    <ActionButton
      isQuiet
      size="S"
      aria-label={t("panels:history.item", { item: label })}
      onPress={onPress}
    >
      <History />
    </ActionButton>
  );
}
