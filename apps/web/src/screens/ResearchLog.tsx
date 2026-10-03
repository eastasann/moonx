import { formatIsoDate } from "@moonx/i18n";
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
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Plus, SearchX } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { NewRowForm } from "../components/NewRowForm";
import { ErrorState, LoadingState, NoAccessState, QueryBoundary } from "../components/states";
import { ValidationSectionHeader } from "../components/ValidationSectionHeader";
import { ideaDetailQuery } from "../lib/idea-detail";
import { canEditIdeas, useWorkspaceCurrency, useWorkspaceRole } from "../lib/ideas";
import { formatContainerTarget, usePanelTarget } from "../lib/panel-target";
import {
  createResearchEntry,
  type ResearchFilters,
  type ResearchSearch,
  researchEntryQuery,
  researchListQuery,
  researchLogSpecs,
} from "../lib/research";
import { useMe } from "../lib/session";
import { useValidationRefresh } from "../lib/use-validation-refresh";
import { researchEntryKey, researchLogKey } from "../lib/validation-keys";
import { ResearchEntryPane } from "./research/ResearchEntryPane";
import { ResearchFilterBar } from "./research/ResearchFilterBar";
import { ResearchRowContent } from "./research/ResearchRow";

function ResearchSkeleton() {
  return (
    <Stack gap="space-200">
      <Skeleton width="space-1000" />
      {[0, 1, 2, 3].map((row) => (
        <Skeleton key={row} shape="block" height="space-800" />
      ))}
    </Stack>
  );
}

export interface ResearchLogProps {
  workspaceId: string;
  ideaId: string;
  search: ResearchSearch;
  onSearchChange: (patch: Partial<ResearchSearch>) => void;
}

/**
 * Screen 14, the research log of an idea (design-spec 6.10, pattern D): filters and the entries
 * by date on the left, the chosen entry on the right. Below desktop one pane shows at a time.
 */
export function ResearchLog(props: ResearchLogProps) {
  const idea = useQuery(ideaDetailQuery(props.ideaId));
  return (
    <QueryBoundary query={idea} skeleton={<ResearchSkeleton />}>
      {(detail) =>
        detail.workspaceId !== props.workspaceId ? (
          <NoAccessState />
        ) : (
          <ResearchScreen
            key={detail.validationId}
            {...props}
            validationId={detail.validationId}
            isArchived={detail.archived}
          />
        )
      }
    </QueryBoundary>
  );
}

function ResearchScreen({
  workspaceId,
  ideaId,
  search,
  onSearchChange,
  validationId,
  isArchived,
}: ResearchLogProps & { validationId: string; isArchived: boolean }) {
  const { t } = useTranslation(["research", "form", "app"]);
  const me = useMe();
  const queryClient = useQueryClient();
  const role = useWorkspaceRole(workspaceId);
  const canEdit = canEditIdeas(role) && !isArchived;
  const currency = useWorkspaceCurrency(workspaceId);
  const compact = useBelowDesktop();
  const { changed } = useValidationRefresh(validationId);
  usePanelTarget(formatContainerTarget("validation", validationId, "research_log"), {
    archived: isArchived,
  });

  const filters: ResearchFilters = { supports: search.supports, source: search.source };
  const isFiltered = Boolean(filters.supports || filters.source);
  const list = useInfiniteQuery(researchListQuery(validationId, filters));
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const specs = useMemo(() => researchLogSpecs(t), [t]);

  const creating = canEdit && search.new !== undefined;
  const selectedId = creating ? undefined : search.entry;
  const entry = useQuery({
    ...researchEntryQuery(validationId, selectedId ?? ""),
    enabled: selectedId !== undefined,
  });

  const select = (entryId: string) => onSearchChange({ entry: entryId, new: undefined });
  const startNew = () => onSearchChange({ new: 1, entry: undefined });
  const backToList = () => onSearchChange({ entry: undefined, new: undefined });

  const rows = () => {
    if (list.isPending) {
      return <LoadingState skeleton={<ResearchSkeleton />} onRetry={() => void list.refetch()} />;
    }
    if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
    if (items.length === 0 && !isFiltered) {
      return (
        <IllustratedMessage
          icon={BookOpen}
          heading={t("research:log.empty.heading")}
          actions={
            canEdit ? (
              <Button variant="accent" onPress={startNew}>
                {t("research:log.add")}
              </Button>
            ) : null
          }
        />
      );
    }
    if (items.length === 0) {
      return (
        <IllustratedMessage
          icon={SearchX}
          heading={t("research:filteredEmpty")}
          actions={
            <Button
              variant="secondary"
              onPress={() => onSearchChange({ supports: undefined, source: undefined })}
            >
              {t("research:log.filters.clear")}
            </Button>
          }
        />
      );
    }
    return (
      <Stack gap="space-200">
        <ListView
          aria-label={t("research:log.listLabel")}
          selectionMode="single"
          selectionBehavior="replace"
          disallowEmptySelection
          selectedKeys={selectedId ? [selectedId] : []}
          onSelectionChange={(keys) => {
            const [key] = keys === "all" ? [] : keys;
            if (key !== undefined) select(String(key));
          }}
        >
          {items.map((item) => (
            <ListViewItem key={item.id} id={item.id} textValue={item.topic}>
              <ResearchRowContent entry={item} timeZone={me.timezone} />
            </ListViewItem>
          ))}
        </ListView>
        {list.isFetchNextPageError ? (
          <InlineAlert variant="negative" heading={t("research:log.loadMoreFailed")} />
        ) : null}
        {list.hasNextPage ? (
          <Flex justify="center">
            <Button
              variant="secondary"
              isPending={list.isFetchingNextPage}
              pendingLabel={t("research:log.loadingMore")}
              onPress={() => void list.fetchNextPage()}
            >
              {t("research:log.loadMore")}
            </Button>
          </Flex>
        ) : null}
      </Stack>
    );
  };

  const detail = () => {
    if (creating) {
      return (
        <Stack gap="space-300">
          <Heading level={2}>{t("research:log.newTitle")}</Heading>
          <NewRowForm
            label={t("research:log.newTitle")}
            specs={specs}
            initial={{ observedOn: formatIsoDate(new Date(), me.timezone) }}
            currency={currency}
            timeZone={me.timezone}
            submitLabel={t("research:log.submit")}
            autoFocusKey="topic"
            create={(body) => createResearchEntry(validationId, body)}
            onCreated={(created) => {
              queryClient.setQueryData(researchEntryKey(validationId, created.id), {
                ...created,
                usages: [],
              });
              void queryClient.invalidateQueries({ queryKey: researchLogKey(validationId) });
              changed();
              select(created.id);
            }}
            onCancel={backToList}
          />
        </Stack>
      );
    }
    if (selectedId === undefined) return <Text tone="secondary">{t("research:log.none")}</Text>;
    return (
      <QueryBoundary query={entry} skeleton={<ResearchSkeleton />}>
        {(data) => (
          <ResearchEntryPane
            key={data.id}
            workspaceId={workspaceId}
            validationId={validationId}
            detail={data}
            canEdit={canEdit}
            currency={currency}
            timeZone={me.timezone}
            onDeleted={backToList}
            onBack={compact ? backToList : undefined}
            onChanged={changed}
          />
        )}
      </QueryBoundary>
    );
  };

  return (
    <ListDetailPattern
      header={
        <ValidationSectionHeader
          workspaceId={workspaceId}
          ideaId={ideaId}
          sectionKey="03"
          backLabel={t("research:back")}
          isArchived={isArchived}
        />
      }
      list={
        <>
          <Flex gap="space-200" justify="between" align="end" wrap>
            <ResearchFilterBar filters={filters} onChange={(patch) => onSearchChange(patch)} />
            {canEdit && !compact ? (
              <Button variant="accent" onPress={startNew}>
                {t("research:log.add")}
              </Button>
            ) : null}
          </Flex>
          {rows()}
        </>
      }
      detail={detail()}
      detailOpen={compact && (creating || selectedId !== undefined)}
      floatingAction={
        canEdit && compact ? (
          <Button variant="accent" aria-label={t("research:log.add")} onPress={startNew}>
            <Plus aria-hidden="true" />
          </Button>
        ) : null
      }
    />
  );
}
