import {
  Button,
  Flex,
  Heading,
  IllustratedMessage,
  InlineAlert,
  ListDetailPattern,
  ListView,
  ListViewItem,
  Skeleton,
  Stack,
  Text,
  useBelowDesktop,
} from "@moonx/ui-web";
import { Lightbulb, Plus, SearchX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ErrorState, LoadingState } from "../components/states";
import { errorText } from "../lib/error-text";
import { useIdeaActions } from "../lib/idea-actions";
import {
  canEditIdeas,
  IDEAS_SEARCH_DEFAULTS,
  type IdeaFilters,
  type IdeaSummary,
  type IdeasSearch,
  useIdeaList,
  useIdeaSummary,
  useWorkspaceRole,
} from "../lib/ideas";
import { useGoTo } from "../lib/navigate";
import { useOverlay } from "../lib/overlay";
import { useMe } from "../lib/session";
import { toasts } from "../lib/toast";
import { IdeaDetailPane } from "./ideas/IdeaDetailPane";
import { IdeaFilterBar } from "./ideas/IdeaFilterBar";
import { IdeaRowContent } from "./ideas/IdeaRow";

type RowAction = "duplicate" | "archive" | "restore";

const isFiltered = (filters: IdeaFilters) =>
  Boolean(
    filters.stage ||
      filters.proposer ||
      filters.q ||
      filters.archived ||
      filters.decision !== IDEAS_SEARCH_DEFAULTS.decision,
  );

function ListSkeleton() {
  return (
    <Stack gap="space-200">
      {[0, 1, 2, 3].map((row) => (
        <Skeleton key={row} shape="block" height="space-800" />
      ))}
    </Stack>
  );
}

/**
 * Screen 6, the ideas of a workspace (design-spec 6.8, pattern D): filters and the list on the
 * left, the summary of the chosen idea on the right. Below desktop only the list shows and a row
 * opens the idea's validation home.
 */
export function Ideas({
  workspaceId,
  search,
  onSearchChange,
}: {
  workspaceId: string;
  search: IdeasSearch;
  onSearchChange: (patch: Partial<IdeasSearch>) => void;
}) {
  const { t } = useTranslation(["ideas", "app"]);
  const me = useMe();
  const role = useWorkspaceRole(workspaceId);
  const editable = canEditIdeas(role);
  const currency =
    me.memberships.find((m) => m.workspace.id === workspaceId)?.workspace.currency ?? "PHP";
  const compact = useBelowDesktop();
  const goTo = useGoTo();
  const { openModal } = useOverlay();
  const actions = useIdeaActions();

  const filters: IdeaFilters = {
    stage: search.stage,
    decision: search.decision,
    proposer: search.proposer,
    archived: search.archived,
    sort: search.sort,
    q: search.q,
  };
  const list = useIdeaList(workspaceId, filters);
  const items: IdeaSummary[] = list.data?.pages.flatMap((page) => page.items) ?? [];
  const hiddenDropped = list.data?.pages.at(-1)?.hiddenDroppedCount ?? 0;
  const inList = items.find((idea) => idea.id === search.selected);
  const fetched = useIdeaSummary(search.selected, !inList && list.isSuccess);
  const selected = inList ?? fetched.data;

  const now = new Date();
  const open = (ideaId: string) => goTo(`/w/${workspaceId}/ideas/${ideaId}`);
  const failed = (error: unknown) =>
    toasts.add({ title: errorText(t, error), variant: "negative" });

  const run = (idea: IdeaSummary, action: RowAction) => {
    if (action === "duplicate") {
      actions.duplicate.mutate(idea.id, { onSuccess: (copy) => open(copy.id), onError: failed });
    } else if (action === "archive") {
      actions.archive.mutate(idea.id, {
        onSuccess: () => {
          if (!search.archived && search.selected === idea.id) {
            onSearchChange({ selected: undefined });
          }
          toasts.add({ title: t("ideas:row.archivedToast"), variant: "positive" });
        },
        onError: failed,
      });
    } else {
      actions.restore.mutate(idea.id, {
        onSuccess: () => toasts.add({ title: t("ideas:row.restoredToast"), variant: "positive" }),
        onError: failed,
      });
    }
  };

  const clearFilters = () =>
    onSearchChange({
      stage: undefined,
      proposer: undefined,
      q: undefined,
      decision: IDEAS_SEARCH_DEFAULTS.decision,
      archived: IDEAS_SEARCH_DEFAULTS.archived,
    });

  const results = () => {
    if (list.isPending) {
      return <LoadingState skeleton={<ListSkeleton />} onRetry={() => void list.refetch()} />;
    }
    if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
    if (items.length === 0 && !isFiltered(filters) && hiddenDropped === 0) {
      return (
        <IllustratedMessage
          icon={Lightbulb}
          heading={t("ideas:empty.heading")}
          actions={
            editable ? (
              <Button variant="accent" onPress={() => openModal("new-idea")}>
                {t("ideas:newIdea")}
              </Button>
            ) : null
          }
        >
          {editable ? t("ideas:empty.body") : t("ideas:empty.viewerBody")}
        </IllustratedMessage>
      );
    }
    return (
      <Stack gap="space-200">
        {items.length === 0 ? (
          <IllustratedMessage
            icon={SearchX}
            heading={t("ideas:filteredEmpty.heading")}
            actions={
              isFiltered(filters) ? (
                <Button variant="secondary" onPress={clearFilters}>
                  {t("ideas:filteredEmpty.clear")}
                </Button>
              ) : null
            }
          />
        ) : (
          <ListView
            aria-label={t("ideas:row.listLabel")}
            selectionMode="single"
            selectionBehavior="replace"
            disallowEmptySelection
            selectedKeys={search.selected ? [search.selected] : []}
            onSelectionChange={(keys) => {
              const [key] = keys === "all" ? [] : keys;
              if (key === undefined) return;
              if (compact) open(String(key));
              else onSearchChange({ selected: String(key) });
            }}
            onAction={(key) => open(String(key))}
          >
            {items.map((idea) => (
              <ListViewItem key={idea.id} id={idea.id} textValue={idea.name}>
                <IdeaRowContent
                  idea={idea}
                  now={now}
                  timeZone={me.timezone}
                  onAction={editable ? (action) => run(idea, action) : undefined}
                />
              </ListViewItem>
            ))}
          </ListView>
        )}
        {hiddenDropped > 0 ? (
          <Flex gap="space-100" align="center">
            <Text tone="secondary" as="span">
              {t("ideas:hidden", { count: hiddenDropped })}
              {" · "}
            </Text>
            <Button
              variant="secondary"
              size="S"
              onPress={() => onSearchChange({ decision: "all" })}
            >
              {t("ideas:showDropped")}
            </Button>
          </Flex>
        ) : null}
        {list.isFetchNextPageError ? (
          <InlineAlert variant="negative" heading={t("ideas:loadMoreFailed")} />
        ) : null}
        {list.hasNextPage ? (
          <Flex justify="center">
            <Button
              variant="secondary"
              isPending={list.isFetchingNextPage}
              pendingLabel={t("ideas:loadingMore")}
              onPress={() => void list.fetchNextPage()}
            >
              {t("ideas:loadMore")}
            </Button>
          </Flex>
        ) : null}
      </Stack>
    );
  };

  return (
    <ListDetailPattern
      header={
        <Flex justify="between" align="center" gap="space-200">
          <Heading level={1}>{t("ideas:title")}</Heading>
          {editable && !compact ? (
            <Button variant="accent" onPress={() => openModal("new-idea")}>
              {t("ideas:newIdea")}
            </Button>
          ) : null}
        </Flex>
      }
      list={
        <>
          <IdeaFilterBar workspaceId={workspaceId} filters={filters} onChange={onSearchChange} />
          {results()}
        </>
      }
      detail={
        selected ? (
          <IdeaDetailPane idea={selected} workspaceId={workspaceId} currency={currency} />
        ) : (
          <Text tone="secondary">{t("ideas:detail.none")}</Text>
        )
      }
      floatingAction={
        editable && compact ? (
          <Button
            variant="accent"
            aria-label={t("ideas:newIdea")}
            onPress={() => openModal("new-idea")}
          >
            <Plus aria-hidden="true" />
          </Button>
        ) : null
      }
    />
  );
}
