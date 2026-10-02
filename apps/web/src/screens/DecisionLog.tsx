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
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ScrollText, SearchX } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState, LoadingState } from "../components/states";
import {
  type DecisionLogFilters,
  type DecisionLogSearch,
  decisionIdeasQuery,
  decisionLogQuery,
} from "../lib/decision-log";
import { useWorkspaceMembers } from "../lib/ideas";
import { useMe } from "../lib/session";
import { DecisionDetailPane } from "./decision-log/DetailPane";
import { DecisionFilterBar } from "./decision-log/FilterBar";
import { DecisionRowContent } from "./decision-log/Row";
import { proposerName } from "./ideas/ideaText";

function ListSkeleton() {
  return (
    <Stack gap="space-200">
      {[0, 1, 2, 3].map((row) => (
        <Skeleton key={row} shape="block" height="space-800" />
      ))}
    </Stack>
  );
}

export interface DecisionLogProps {
  workspaceId: string;
  search: DecisionLogSearch;
  onSearchChange: (patch: Partial<DecisionLogSearch>) => void;
}

/**
 * Screen 7, the decision log of a workspace (design-spec 6.15, pattern D): the filters and the
 * entries newest first on the left, the chosen entry and what it rested on on the right. The log
 * is append-only, so nothing here edits or deletes. Every role reads it.
 */
export function DecisionLog({ workspaceId, search, onSearchChange }: DecisionLogProps) {
  const { t } = useTranslation(["decisionLog", "common", "ideas"]);
  const me = useMe();
  const compact = useBelowDesktop();
  const filters: DecisionLogFilters = {
    kind: search.kind,
    idea: search.idea,
    recordedBy: search.recordedBy,
    from: search.from,
    to: search.to,
  };
  const isFiltered = Object.values(filters).some((value) => value !== undefined);
  const list = useInfiniteQuery(decisionLogQuery(workspaceId, filters));
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const ideas = useQuery(decisionIdeasQuery(workspaceId));
  const members = useWorkspaceMembers(workspaceId);
  const memberOptions = useMemo(
    () =>
      (members.data?.items ?? []).map((member) => ({
        id: member.user.id,
        name: proposerName(t, member.user),
      })),
    [members.data, t],
  );
  const selectedId = search.selected;

  const clear = () =>
    onSearchChange({
      kind: undefined,
      idea: undefined,
      recordedBy: undefined,
      from: undefined,
      to: undefined,
    });

  const rows = () => {
    if (list.isPending) {
      return <LoadingState skeleton={<ListSkeleton />} onRetry={() => void list.refetch()} />;
    }
    if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
    if (items.length === 0 && !isFiltered) {
      return <IllustratedMessage icon={ScrollText} heading={t("decisionLog:empty.heading")} />;
    }
    if (items.length === 0) {
      return (
        <IllustratedMessage
          icon={SearchX}
          heading={t("decisionLog:filteredEmpty")}
          actions={
            <Button variant="secondary" onPress={clear}>
              {t("decisionLog:filters.clear")}
            </Button>
          }
        />
      );
    }
    return (
      <Stack gap="space-200">
        <ListView
          aria-label={t("decisionLog:listLabel")}
          selectionMode="single"
          selectionBehavior="replace"
          disallowEmptySelection
          selectedKeys={selectedId ? [selectedId] : []}
          onSelectionChange={(keys) => {
            const [key] = keys === "all" ? [] : keys;
            if (key !== undefined) onSearchChange({ selected: String(key) });
          }}
        >
          {items.map((entry) => (
            <ListViewItem key={entry.id} id={entry.id} textValue={entry.idea.name}>
              <DecisionRowContent entry={entry} timeZone={me.timezone} />
            </ListViewItem>
          ))}
        </ListView>
        {list.isFetchNextPageError ? (
          <InlineAlert variant="negative" heading={t("decisionLog:loadMoreFailed")} />
        ) : null}
        {list.hasNextPage ? (
          <Flex justify="center">
            <Button
              variant="secondary"
              isPending={list.isFetchingNextPage}
              pendingLabel={t("decisionLog:loadingMore")}
              onPress={() => void list.fetchNextPage()}
            >
              {t("decisionLog:loadMore")}
            </Button>
          </Flex>
        ) : null}
      </Stack>
    );
  };

  return (
    <ListDetailPattern
      header={<Heading level={1}>{t("decisionLog:title")}</Heading>}
      list={
        <>
          <DecisionFilterBar
            filters={filters}
            ideas={ideas.data ?? []}
            members={memberOptions}
            onChange={(patch) => onSearchChange({ ...patch, selected: undefined })}
          />
          {rows()}
        </>
      }
      detail={
        selectedId ? (
          <DecisionDetailPane
            key={selectedId}
            entryId={selectedId}
            workspaceId={workspaceId}
            timeZone={me.timezone}
            onBack={compact ? () => onSearchChange({ selected: undefined }) : undefined}
          />
        ) : (
          <Text tone="secondary">{t("decisionLog:choose")}</Text>
        )
      }
      detailOpen={compact && selectedId !== undefined}
    />
  );
}
