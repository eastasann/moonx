import { hasText } from "@moonx/domain";
import {
  EXECUTION_STATUSES,
  type ExecutionItem,
  type ExecutionType,
  executionStatusSchema,
  type PlanHome,
} from "@moonx/schemas";
import {
  ActionMenu,
  Breadcrumb,
  Breadcrumbs,
  Button,
  Dialog,
  Flex,
  Heading,
  IllustratedMessage,
  ListDetailPattern,
  ListView,
  ListViewItem,
  MenuItem,
  Picker,
  Skeleton,
  Stack,
  Switch,
  Text,
  useIsNarrow,
  useTwoColumns,
} from "@moonx/ui-web";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import {
  CircleQuestionMark,
  Flag,
  Gauge,
  ListTodo,
  type LucideIcon,
  Rocket,
  SearchX,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArchivedIdeaAlert } from "../components/ArchivedIdeaAlert";
import {
  ItemCommentsButton,
  type ScreenComments,
} from "../components/CommentsPanel";
import {
  type ExecutionCache,
  ExecutionItemEditor,
  ExecutionItemFacts,
  ExecutionItemMenu,
  ExecutionRowContent,
  executionGroups,
  executionTarget,
  inListOrder,
  NewExecutionItem,
  useDeleteExecutionItem,
} from "../components/ExecutionItems";
import { ItemHistoryButton } from "../components/HistoryPanel";
import { useKeepShownItem } from "../components/keepShownItem";
import { ArchivedPlanAlert } from "../components/planParts";
import { ReorderDialog, type ReorderItem } from "../components/ReorderDialog";
import {
  FailureState,
  NoAccessState,
  NotFoundState,
  SlowLoadingState,
  useIsSlow,
} from "../components/states";
import { WorkspaceFrame } from "../components/WorkspaceFrame";
import { dashboardHref, usePanel, useWorkspace } from "../components/workspace";
import { api, inPath, unwrap } from "../lib/api";
import { rowLabel } from "../lib/item-labels";
import {
  EXECUTION_TABS,
  type ExecutionSearch,
  type ExecutionTab,
  executionHref,
  executionTabOf,
  ideaHref,
  ideasHref,
  planHref,
} from "../lib/links";
import { useIsOnline } from "../lib/online";
import {
  executionItemsQuery,
  ideaKey,
  membersQuery,
  planHomeQuery,
  planKey,
  putSaved,
  validationHomeQuery,
} from "../lib/queries";
import { useDocumentTitle } from "../lib/title";

export type { ExecutionSearch };

/** The value of a filter that leaves it off ("All"). */
const ALL = "all";

const EMPTY_ICONS: Record<ExecutionTab, LucideIcon> = {
  milestones: Flag,
  launch: Rocket,
  kpis: Gauge,
  questions: CircleQuestionMark,
  actions: ListTodo,
};

/**
 * The types 22 orders by hand (6.13): Next Actions keep their due-date order. A launch
 * step moves within its phase and a KPI within its Area, the rows its ⋯ belongs to.
 */
const isOrdered = (type: ExecutionType) => type !== "next_action";

/** Whether Next Actions' filters (6.13: assignee, status, overdue only) keep `item`. */
function passesFilters(
  item: ExecutionItem,
  search: ExecutionSearch,
  overdueOnly: boolean,
  myId: string,
): boolean {
  if (search.assignee !== undefined) {
    const userId =
      search.assignee === "me" ? myId : (search.assignee as string | undefined);
    if (
      item.assignee === null ||
      !("user" in item.assignee) ||
      item.assignee.user.id !== userId
    ) {
      return false;
    }
  }
  if (search.assigneeName !== undefined) {
    if (
      item.assignee === null ||
      !("name" in item.assignee) ||
      nameKey(item.assignee.name) !== nameKey(search.assigneeName)
    ) {
      return false;
    }
  }
  if (search.status !== undefined && item.status !== search.status) {
    return false;
  }
  return !overdueOnly || item.overdue;
}

/**
 * Typed names that differ only in case, or in spaces around them, are one assignee
 * (design-spec 6.13), as P9's `assigneeName` matches them.
 */
const nameKey = (name: string) => name.trim().toLowerCase();

/** The Assignee Picker's id of a typed name: apart from `all`, `me` and user ids. */
const NAME_PREFIX = "name:";

/**
 * Next Actions' filters (6.13): the assignee (a member, the user, or a name typed on this
 * plan's Next Actions), the status, and "Overdue only", which the URL does not hold.
 */
function Filters({
  search,
  names,
  overdueOnly,
  onChange,
  onOverdueChange,
}: {
  search: ExecutionSearch;
  /** The names typed as assignees on this plan's Next Actions, in the list's order. */
  names: string[];
  overdueOnly: boolean;
  onChange: (next: ExecutionSearch) => void;
  onOverdueChange: (value: boolean) => void;
}) {
  const { t } = useTranslation(["plans", "common"]);
  const { workspace } = useWorkspace();
  const members = useQuery(membersQuery(workspace.id));
  const all = { id: ALL, label: t("plans:execution.filter.all") };
  const people = (members.data?.items ?? [])
    .filter((member) => member.role !== "viewer")
    .map((member) => ({ id: member.user.id, label: member.user.displayName }));
  const assignees = [
    all,
    { id: "me", label: t("plans:execution.filter.me") },
    ...people,
  ];
  // Someone no longer a member, still named by the URL, stays chosen (as 7's Recorded by).
  if (
    search.assignee !== undefined &&
    !assignees.some(({ id }) => id === search.assignee)
  ) {
    assignees.push({
      id: search.assignee,
      label:
        members.data === undefined ? "" : t("plans:execution.formerMember"),
    });
  }
  // A name the URL holds stays chosen once no Next Action has it any more.
  const typed =
    search.assigneeName === undefined ? names : [...names, search.assigneeName];
  const seen = new Set<string>();
  for (const name of typed) {
    const key = nameKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    assignees.push({ id: `${NAME_PREFIX}${key}`, label: name.trim() });
  }
  return (
    <>
      <Picker
        label={t("plans:execution.assignee")}
        labelPosition="inside"
        size="S"
        items={assignees}
        value={
          search.assigneeName !== undefined
            ? `${NAME_PREFIX}${nameKey(search.assigneeName)}`
            : (search.assignee ?? ALL)
        }
        onChange={(value) => {
          const chosen =
            value === null || value === ALL ? undefined : String(value);
          const name = chosen?.startsWith(NAME_PREFIX)
            ? assignees.find(({ id }) => id === chosen)?.label
            : undefined;
          onChange({
            ...search,
            item: undefined,
            assignee: name === undefined ? chosen : undefined,
            assigneeName: name,
          });
        }}
      />
      <Picker
        label={t("plans:execution.status")}
        labelPosition="inside"
        size="S"
        items={[
          all,
          ...EXECUTION_STATUSES.next_action.map((id) => ({
            id,
            label: t(`common:executionStatus.${id}`),
          })),
        ]}
        value={search.status ?? ALL}
        onChange={(value) =>
          onChange({
            ...search,
            item: undefined,
            status:
              value === null || value === ALL
                ? undefined
                : executionStatusSchema.parse(value),
          })
        }
      />
      <Switch size="S" isSelected={overdueOnly} onChange={onOverdueChange}>
        {t("plans:execution.filter.overdueOnly")}
      </Switch>
    </>
  );
}

/**
 * The selected item (design-spec 6.13, as 16's row): its first column, 💬 and 🕘, ⋯ with
 * Reorder and Delete, and its fields, edited here from the tablet breakpoint up and in a
 * sheet on a phone (4.1 D).
 */
function ItemDetail({
  item,
  canEdit,
  cache,
  onSaved,
  onReorder,
  onDelete,
}: {
  item: ExecutionItem;
  canEdit: boolean;
  cache: ExecutionCache;
  onSaved: () => void;
  onReorder: (() => void) | undefined;
  onDelete: () => void;
}) {
  const { t } = useTranslation(["plans"]);
  const panel = usePanel();
  const isPhone = useIsNarrow();
  const isOnline = useIsOnline();
  const [isEditing, setEditing] = useState(false);
  const target = {
    kind: "item",
    item: { type: "execution_item", id: item.id, key: null },
  } as const;
  const label = rowLabel("execution_item", item.title);
  const editor = (autoFocus: boolean) => (
    <ExecutionItemEditor
      item={item}
      target={executionTarget(
        cache,
        item.id,
        t("plans:execution.noun"),
        onSaved,
      )}
      autoFocus={autoFocus}
    />
  );
  return (
    <Stack gap="space-400">
      <Flex justifyContent="space-between" alignItems="start" gap="space-200">
        <Heading level={2}>{item.title}</Heading>
        <Flex gap="space-50" alignItems="center" shrink={false}>
          <ItemCommentsButton
            label={label}
            count={item.commentCount}
            onPress={() => panel.show("comments", target)}
          />
          <ItemHistoryButton
            label={label}
            onPress={() => panel.show("history", target)}
          />
          {canEdit && (
            <ActionMenu
              aria-label={t("plans:execution.more", { title: item.title })}
              disabledKeys={isOnline ? [] : ["delete"]}
              onAction={(key) => {
                if (key === "reorder") onReorder?.();
                if (key === "delete") onDelete();
              }}
            >
              {onReorder !== undefined && (
                <MenuItem id="reorder">{t("plans:execution.reorder")}</MenuItem>
              )}
              <MenuItem id="delete">{t("plans:execution.delete")}</MenuItem>
            </ActionMenu>
          )}
        </Flex>
      </Flex>
      {canEdit && !isPhone ? (
        editor(false)
      ) : (
        <Stack gap="space-200">
          <ExecutionItemFacts item={item} />
          {canEdit && (
            <Flex>
              <Button variant="secondary" onPress={() => setEditing(true)}>
                {t("plans:execution.edit")}
              </Button>
            </Flex>
          )}
        </Stack>
      )}
      {isEditing && canEdit && (
        <Dialog
          isOpen
          onOpenChange={(isOpen) => {
            if (!isOpen) setEditing(false);
          }}
          isDismissable
          size="M"
          title={t(`plans:execution.editTitle.${item.type}`)}
        >
          {editor(true)}
        </Dialog>
      )}
    </Stack>
  );
}

function ListSkeleton() {
  const { t } = useTranslation(["plans"]);
  return (
    <Skeleton isLoading>
      <Stack gap="space-300">
        {[0, 1, 2].map((row) => (
          <Stack key={row} gap="space-50">
            <Text variant="label">{t("plans:execution.title")}</Text>
            <Text variant="caption">
              {t("plans:execution.empty.milestones")}
            </Text>
          </Stack>
        ))}
      </Stack>
    </Skeleton>
  );
}

/** The rows a Reorder of `item`'s list moves: its type's, within its phase or Area. */
function reorderScope(
  item: ExecutionItem,
  items: readonly ExecutionItem[],
): ExecutionItem[] {
  const ofType = items.filter(({ type }) => type === item.type);
  if (item.type === "launch") {
    const phase = item.launchTiming ?? "other";
    return ofType.filter(
      ({ launchTiming }) => (launchTiming ?? "other") === phase,
    );
  }
  if (item.type === "kpi") {
    const areaOf = (value: string | null) =>
      hasText(value) ? (value ?? "") : "";
    const area = areaOf(item.kpiArea);
    return ofType.filter(({ kpiArea }) => areaOf(kpiArea) === area);
  }
  return ofType;
}

/**
 * The ids of every item of the type in their new order (P11 takes the whole type): the
 * moved rows take the places the rows of their phase or Area held, in the order chosen.
 */
function wholeOrder(
  type: ExecutionType,
  items: readonly ExecutionItem[],
  moved: readonly string[],
): string[] {
  const ofType = items.filter((item) => item.type === type);
  const queue = [...moved];
  return ofType.map((item) =>
    moved.includes(item.id) ? (queue.shift() ?? item.id) : item.id,
  );
}

function ExecutionBody({
  home,
  search,
  onSearch,
  onOpen,
  onClose,
}: {
  home: PlanHome;
  search: ExecutionSearch;
  /** Replaces the URL's search: the tab, the filters, the item beside the list. */
  onSearch: (next: ExecutionSearch) => void;
  /** Shows an item in place of the list (one pane): Back returns to it. */
  onOpen: (next: ExecutionSearch) => void;
  /** Leaves what `onOpen` showed for `next`, going back if it was opened here. */
  onClose: (next: ExecutionSearch) => void;
}) {
  const { t } = useTranslation(["plans", "common", "app"]);
  const { me, role } = useWorkspace();
  const queryClient = useQueryClient();
  const isTwoColumns = useTwoColumns();
  const isOnline = useIsOnline();
  // Read only for a Viewer and an archived idea or plan (6.12・6.13).
  const canEdit = role !== "viewer" && !home.ideaArchived && !home.archived;
  const listQuery = executionItemsQuery(home.ideaId, home.id);
  const query = useQuery(listQuery);
  const isSlow = useIsSlow(query.isPending);
  const all = query.data?.items ?? [];
  // A link may name the item alone (8, 5's Recent activity): its tab is its type's, known
  // once the list is read. Until then no tab is shown, nor + Add. Once known, it is kept
  // while the URL names that item, so a later read without it (deleted meanwhile) stays on
  // the tab, and every next search carries it (`current`). The URL is left as it is: a
  // replace there would make an open panel's place differ, and its close stay on the page.
  const named =
    search.item === undefined
      ? undefined
      : all.find(({ id }) => id === search.item);
  const isTabKnown =
    search.tab !== undefined ||
    search.item === undefined ||
    query.data !== undefined;
  const namedTab =
    search.tab === undefined && named !== undefined
      ? executionTabOf(named.type)
      : undefined;
  const [pinned, setPinned] = useState<{ item: string; tab: ExecutionTab }>();
  useEffect(() => {
    if (namedTab !== undefined && search.item !== undefined) {
      setPinned({ item: search.item, tab: namedTab });
    }
  }, [namedTab, search.item]);
  const pinnedTab =
    pinned !== undefined && pinned.item === search.item
      ? pinned.tab
      : undefined;
  const tab: ExecutionTab = search.tab ?? namedTab ?? pinnedTab ?? "milestones";
  const current: ExecutionSearch = { ...search, tab };
  const type = EXECUTION_TABS[tab];
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [isAdding, setAdding] = useState(false);
  const [reordering, setReordering] = useState<ExecutionItem | null>(null);
  const hasFilters = type === "next_action";
  const ofType = all.filter((item) => item.type === type);
  const listed = hasFilters
    ? ofType.filter((item) => passesFilters(item, search, overdueOnly, me.id))
    : ofType;
  const groups = executionGroups(
    type,
    listed,
    t("plans:execution.noArea"),
    (timing) => t(`common:launchTiming.${timing}`),
  );
  const firstShown = groups[0]?.items[0]?.id;
  const shownFirst =
    search.item === undefined && isTwoColumns ? firstShown : undefined;
  const kept = useKeepShownItem(isTwoColumns, shownFirst, search.item, (item) =>
    onSearch({ ...current, item }),
  );
  const selected = search.item ?? shownFirst ?? kept;

  const onSaved = () => {
    // 20 and 21 count and list the items (the items due, "+ changes", the fill): read
    // again when they show.
    void queryClient.invalidateQueries({
      queryKey: planKey(home.ideaId, home.id),
      refetchType: "none",
    });
  };
  const cache: ExecutionCache = {
    put: (saved) =>
      putSaved<{ items: ExecutionItem[] }>(
        queryClient,
        listQuery.queryKey,
        (data) => {
          if (data === undefined) return undefined;
          const isListed = data.items.some(({ id }) => id === saved.id);
          return {
            items: inListOrder(
              isListed
                ? data.items.map((current) =>
                    current.id === saved.id ? saved : current,
                  )
                : [...data.items, saved],
            ),
          };
        },
      ),
    remove: (itemId) =>
      putSaved<{ items: ExecutionItem[] }>(
        queryClient,
        listQuery.queryKey,
        (data) =>
          data === undefined
            ? undefined
            : { items: data.items.filter(({ id }) => id !== itemId) },
      ),
    reload: () =>
      void queryClient.invalidateQueries({ queryKey: listQuery.queryKey }),
  };

  // What the screen shows when a delete settles, which may be later: a user who left or
  // moved on meanwhile is not taken back to the list.
  const latest = useRef({ search: current, onClose, isOpen: true });
  latest.current = { search: current, onClose, isOpen: true };
  useEffect(() => {
    latest.current.isOpen = true;
    return () => {
      latest.current.isOpen = false;
    };
  }, []);
  const deletion = useDeleteExecutionItem(
    {
      ...cache,
      remove: (itemId) => {
        cache.remove(itemId);
        // Its detail closes only while 22 is open and the item is still the one shown.
        const { search: now, onClose: close, isOpen } = latest.current;
        if (isOpen && now.item === itemId) close({ ...now, item: undefined });
      },
    },
    onSaved,
  );

  const show = (item: ExecutionItem) => {
    const next = { ...current, item: item.id };
    if (isTwoColumns) onSearch(next);
    else onOpen(next);
  };
  const reorderOf = (item: ExecutionItem) =>
    canEdit && isOrdered(item.type) ? () => setReordering(item) : undefined;

  let list: ReactNode;
  if (query.isError) {
    list = (
      <FailureState
        error={query.error}
        onRetry={() => void query.refetch()}
        dashboardHref={dashboardHref(me)}
        headingLevel={2}
        size="S"
      />
    );
  } else if (query.data === undefined) {
    list = isSlow ? (
      <SlowLoadingState
        headingLevel={2}
        size="S"
        onRetry={() => void query.refetch()}
      />
    ) : (
      <ListSkeleton />
    );
  } else if (ofType.length === 0) {
    const Icon = EMPTY_ICONS[tab];
    list = (
      <IllustratedMessage
        headingLevel={2}
        size="S"
        icon={<Icon />}
        heading={t(`plans:execution.empty.${tab}`)}
        actions={
          canEdit ? (
            <Button
              variant="primary"
              onPress={() => setAdding(true)}
              isDisabled={!isOnline}
            >
              {t(`plans:execution.addTo.${type}`)}
            </Button>
          ) : undefined
        }
      />
    );
  } else if (listed.length === 0) {
    list = (
      <IllustratedMessage
        headingLevel={2}
        size="S"
        icon={<SearchX />}
        heading={t("plans:execution.emptyFiltered")}
        actions={
          <Button
            variant="secondary"
            onPress={() => {
              setOverdueOnly(false);
              onSearch({
                ...current,
                item: undefined,
                assignee: undefined,
                assigneeName: undefined,
                status: undefined,
              });
            }}
          >
            {t("plans:execution.filter.clear")}
          </Button>
        }
      />
    );
  } else {
    const listName = t(`plans:execution.list.${type}`);
    list = (
      <Stack gap="space-200">
        {groups.map((group) => (
          <ListView
            key={group.id}
            aria-label={
              group.title === null
                ? listName
                : `${listName}${t("app:separator")}${group.title}`
            }
            title={group.title ?? undefined}
            items={group.items}
            selectionMode="single"
            selectedKeys={
              selected !== undefined &&
              group.items.some(({ id }) => id === selected)
                ? [selected]
                : []
            }
            dependencies={[canEdit, isOnline]}
            // Pressing the chosen row again keeps it: the detail never goes blank.
            onSelectionChange={(keys) => {
              const [key] = [...keys];
              const item = group.items.find(({ id }) => id === key);
              if (item !== undefined) show(item);
            }}
          >
            {(item) => (
              <ListViewItem
                id={item.id}
                textValue={item.title}
                actions={
                  <ExecutionItemMenu
                    item={item}
                    canEdit={canEdit}
                    onReorder={reorderOf(item)}
                    onDelete={() => deletion.ask(item)}
                  />
                }
              >
                <ExecutionRowContent item={item} canEdit={canEdit} />
              </ListViewItem>
            )}
          </ListView>
        ))}
      </Stack>
    );
  }

  const shown =
    selected === undefined
      ? undefined
      : ofType.find(({ id }) => id === selected);
  const detail =
    selected === undefined ? null : shown === undefined ? (
      // Decided once the list is read again, not while.
      query.data === undefined || query.isFetching ? null : (
        // An item deleted, of another tab, or of another plan (6.0.6).
        <NotFoundState
          dashboardHref={dashboardHref(me)}
          headingLevel={2}
          size="S"
        />
      )
    ) : (
      <ItemDetail
        key={shown.id}
        item={shown}
        canEdit={canEdit}
        cache={cache}
        onSaved={onSaved}
        onReorder={reorderOf(shown)}
        onDelete={() => deletion.ask(shown)}
      />
    );

  const scope = reordering === null ? [] : reorderScope(reordering, all);
  const toRows = (items: readonly ExecutionItem[]): ReorderItem[] =>
    items.map(({ id, title }) => ({ id, label: title }));

  return (
    <>
      <ListDetailPattern
        header={
          <Stack gap="space-200">
            {home.ideaArchived ? (
              <ArchivedIdeaAlert ideaId={home.ideaId} />
            ) : (
              home.archived && <ArchivedPlanAlert home={home} />
            )}
            <Heading level={1} variant="heading-1-list">
              {t("plans:execution.title")}
            </Heading>
          </Stack>
        }
        newItem={
          canEdit && isTabKnown
            ? {
                label: t(`plans:execution.addTo.${type}`),
                onPress: () => setAdding(true),
              }
            : undefined
        }
        tabs={
          isTabKnown
            ? {
                "aria-label": t("plans:execution.tabs"),
                items: (Object.keys(EXECUTION_TABS) as ExecutionTab[]).map(
                  (id) => ({
                    id,
                    label: t(`plans:execution.list.${EXECUTION_TABS[id]}`),
                  }),
                ),
                selectedKey: tab,
                onSelectionChange: (key) => {
                  setOverdueOnly(false);
                  onSearch({ tab: key as ExecutionTab });
                },
              }
            : undefined
        }
        filters={
          hasFilters && isTabKnown ? (
            <Filters
              search={current}
              names={ofType.flatMap(({ assignee }) =>
                assignee !== null && "name" in assignee ? [assignee.name] : [],
              )}
              overdueOnly={overdueOnly}
              onChange={onSearch}
              onOverdueChange={(value) => {
                setOverdueOnly(value);
                // As the other filters: the item shown may be one it leaves out.
                onSearch({ ...current, item: undefined });
              }}
            />
          ) : undefined
        }
        list={list}
        detail={detail}
        listLabel={t(`plans:execution.list.${type}`)}
        onBack={() => onClose({ ...current, item: undefined })}
      />
      {isAdding && canEdit && (
        <NewExecutionItem
          // Each tab's form is its own.
          key={type}
          planId={home.id}
          type={type}
          onMade={(item) => {
            cache.put(item);
            onSaved();
          }}
          onCreated={(item) => {
            setAdding(false);
            // Filters that leave it out are cleared, so the new item shows in the list.
            const isListed = passesFilters(item, search, overdueOnly, me.id);
            if (!isListed) setOverdueOnly(false);
            const next = isListed
              ? { ...current, item: item.id }
              : { tab, item: item.id };
            if (isTwoColumns) onSearch(next);
            else onOpen(next);
          }}
          onCancel={() => setAdding(false)}
        />
      )}
      {reordering !== null && canEdit && (
        <ReorderDialog
          title={t(
            `plans:execution.reorderTitle.${reordering.type as Exclude<ExecutionType, "next_action">}`,
          )}
          items={toRows(scope)}
          send={async (ids) => {
            const order = wholeOrder(reordering.type, all, ids);
            await unwrap(
              api()
                .api.v1.plans({ planId: inPath(home.id) })
                ["execution-items"].order.put({
                  type: reordering.type,
                  ids: order,
                }),
            );
            // In the new order at once; P11 leaves the items' versions as they were.
            putSaved<{ items: ExecutionItem[] }>(
              queryClient,
              listQuery.queryKey,
              (data) =>
                data === undefined
                  ? undefined
                  : {
                      items: inListOrder(
                        data.items.map((item) => {
                          const index = order.indexOf(item.id);
                          return index === -1
                            ? item
                            : { ...item, sortOrder: index };
                        }),
                      ),
                    },
            );
          }}
          reload={async () => {
            const { items } = await queryClient.fetchQuery({
              ...listQuery,
              staleTime: 0,
            });
            const again = items.find(({ id }) => id === reordering.id);
            return toRows(
              again === undefined
                ? items.filter(({ type: of }) => of === reordering.type)
                : reorderScope(again, items),
            );
          }}
          onClose={() => setReordering(null)}
        />
      )}
      {deletion.question}
    </>
  );
}

/** 22's shape while its route loads (design-spec 6.0.6). */
export function ExecutionSkeleton() {
  const { t } = useTranslation(["plans"]);
  return (
    <ListDetailPattern
      header={
        <Heading level={1} variant="heading-1-list">
          {t("plans:execution.title")}
        </Heading>
      }
      list={<ListSkeleton />}
      detail={null}
      listLabel={t("plans:execution.title")}
      onBack={() => {}}
    />
  );
}

/**
 * 22 Execution (design-spec 6.13): pattern D with a tab per type (Milestones, Launch,
 * KPIs, Open Questions, Next Actions). Launch steps under their phases and KPIs under
 * their Areas, Next Actions by due date with their filters; the selected item beside the
 * list, edited there (in a sheet on a phone); + Add; Reorder and Delete in a row's ⋯.
 * Viewers and archived ideas and plans read only. PNL-1 and PNL-2 on the items, and on
 * the screen from the header.
 */
export function ExecutionScreen({
  ideaId,
  planId,
  search,
}: {
  ideaId: string;
  planId: string;
  search: ExecutionSearch;
}) {
  const { t } = useTranslation(["ideas", "plans"]);
  const { me, workspace } = useWorkspace();
  const navigate = useNavigate();
  const router = useRouter();
  const panel = usePanel();
  const home = useQuery(planHomeQuery(ideaId, planId));
  const { data: ideaData } = useQuery(validationHomeQuery(ideaId));
  const isSlow = useIsSlow(home.isPending);
  const data =
    home.data?.workspaceId === workspace.id && home.data.ideaId === ideaId
      ? home.data
      : undefined;
  const idea =
    ideaData?.idea.workspaceId === workspace.id ? ideaData.idea : undefined;
  // The body reads the same items: the panels name them by their first column.
  const items = useQuery({
    ...executionItemsQuery(ideaId, planId),
    enabled: data !== undefined,
  });
  useDocumentTitle(
    ...(data === undefined
      ? []
      : [t("plans:execution.title"), data.name, workspace.name]),
  );
  // 22's comments and history are its items' (SDD 6.3「画面と節の対応」: `execution`),
  // with the idea's comments in the list.
  const comments: ScreenComments | undefined =
    data === undefined || idea === undefined
      ? undefined
      : {
          screen: {
            containerType: "business_plan",
            containerId: planId,
            sectionKeys: ["execution"],
          },
          // Both reads say whether the idea is archived; either may come back first.
          idea: {
            id: ideaId,
            name: idea.name,
            archived: idea.archived || data.ideaArchived,
          },
          plan: { id: planId, archived: data.archived },
          dataKey: ideaKey(ideaId),
          shows: (target) =>
            target.type === "execution_item" &&
            target.key == null &&
            (items.data === undefined ||
              items.data.items.some(({ id }) => id === target.id)),
          labelOf: (target) => {
            if (target.type === "idea") return idea.name;
            if (target.type !== "execution_item") return undefined;
            const title = items.data?.items.find(
              ({ id }) => id === target.id,
            )?.title;
            return title === undefined
              ? undefined
              : rowLabel("execution_item", title);
          },
        };
  const openedHere = useRouterState({
    select: (state) => state.location.state.openedDetail === true,
  });
  const to = (next: ExecutionSearch, replace: boolean) =>
    void navigate({
      href: panel.keep(executionHref(workspace.id, ideaId, planId, next)),
      replace,
      state: (previous) =>
        replace ? previous : { ...previous, openedDetail: true },
    });

  let body: ReactNode;
  if (home.data !== undefined && home.data.workspaceId !== workspace.id) {
    // Another workspace's plan under this one's URL (SDD 4章).
    body = <NoAccessState dashboardHref={dashboardHref(me)} />;
  } else if (home.data !== undefined && data === undefined) {
    // A plan of another idea of this workspace: no plan by that path (6.12).
    body = <NotFoundState dashboardHref={dashboardHref(me)} />;
  } else if (data !== undefined) {
    body = (
      <ExecutionBody
        home={data}
        search={search}
        // The tab, the filters and what is beside the list replace the item: Back leaves
        // the screen.
        onSearch={(next) => to(next, true)}
        onOpen={(next) => to(next, false)}
        onClose={(next) => {
          if (openedHere) router.history.back();
          else to(next, true);
        }}
      />
    );
  } else if (home.isError) {
    body = (
      <FailureState
        error={home.error}
        onRetry={() => void home.refetch()}
        dashboardHref={dashboardHref(me)}
      />
    );
  } else if (isSlow) {
    body = <SlowLoadingState onRetry={() => void home.refetch()} />;
  } else {
    body = <ExecutionSkeleton />;
  }
  return (
    <WorkspaceFrame
      current="ideas"
      saveScope="execution_item:"
      comments={comments}
      history={comments}
      back={{
        label: t("plans:home.back"),
        href: planHref(workspace.id, ideaId, planId),
      }}
      breadcrumbs={
        <Breadcrumbs>
          <Breadcrumb href={ideasHref(workspace.id)}>
            {t("ideas:title")}
          </Breadcrumb>
          {idea !== undefined && (
            <Breadcrumb href={ideaHref(workspace.id, ideaId)}>
              {idea.name}
            </Breadcrumb>
          )}
          {data !== undefined && (
            <Breadcrumb href={planHref(workspace.id, ideaId, planId)}>
              {data.name}
            </Breadcrumb>
          )}
          <Breadcrumb>{t("plans:execution.title")}</Breadcrumb>
        </Breadcrumbs>
      }
    >
      {body}
    </WorkspaceFrame>
  );
}
