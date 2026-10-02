import type { Competitor } from "@moonx/schemas";
import {
  Button,
  CardComparePattern,
  Dialog,
  Flex,
  IllustratedMessage,
  SegmentedControl,
  SegmentedControlItem,
  Skeleton,
  Stack,
  Text,
  useBelowDesktop,
  useIsNarrow,
} from "@moonx/ui-web";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Swords } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { NewRowForm } from "../components/NewRowForm";
import { NoAccessState, QueryBoundary } from "../components/states";
import { ValidationSectionHeader } from "../components/ValidationSectionHeader";
import { autosave } from "../lib/autosave";
import { errorText } from "../lib/error-text";
import { ideaDetailQuery } from "../lib/idea-detail";
import { canEditIdeas, useWorkspaceCurrency, useWorkspaceRole } from "../lib/ideas";
import { formatContainerTarget, usePanelTarget } from "../lib/panel-target";
import {
  type CompetitorsData,
  type CompetitorsSearch,
  competitorSpecs,
  competitorsQuery,
  createCompetitor,
  deleteCompetitor,
  movedIds,
  putOrder,
} from "../lib/research";
import { useMe } from "../lib/session";
import { toasts } from "../lib/toast";
import { useValidationRefresh } from "../lib/use-validation-refresh";
import { competitorsKey } from "../lib/validation-keys";
import { CompetitorCards } from "./competitors/CompetitorCards";
import { CompetitorDialog } from "./competitors/CompetitorDialog";
import { CompetitorTable } from "./competitors/CompetitorTable";
import { PatternCards } from "./competitors/PatternCards";

function CompetitorsSkeleton() {
  return (
    <Stack gap="space-300">
      <Skeleton width="space-1000" />
      <Skeleton shape="block" height="space-1000" />
      <Skeleton shape="block" height="space-1000" />
    </Stack>
  );
}

export interface CompetitorsProps {
  workspaceId: string;
  ideaId: string;
  search: CompetitorsSearch;
  onSearchChange: (patch: Partial<CompetitorsSearch>) => void;
}

/**
 * Screen 15, the competitors and substitutes of an idea (design-spec 6.10, pattern E): cards, or
 * a table with a competitor per column, and the two pattern questions below them.
 */
export function Competitors(props: CompetitorsProps) {
  const idea = useQuery(ideaDetailQuery(props.ideaId));
  return (
    <QueryBoundary query={idea} skeleton={<CompetitorsSkeleton />}>
      {(detail) =>
        detail.workspaceId !== props.workspaceId ? (
          <NoAccessState />
        ) : (
          <CompetitorsLoader
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

interface LoaderProps extends CompetitorsProps {
  validationId: string;
  isArchived: boolean;
}

function CompetitorsLoader(props: LoaderProps) {
  const competitors = useQuery(competitorsQuery(props.validationId));
  return (
    <QueryBoundary query={competitors} skeleton={<CompetitorsSkeleton />}>
      {(data) => <CompetitorsScreen {...props} data={data} />}
    </QueryBoundary>
  );
}

function CompetitorsScreen({
  workspaceId,
  ideaId,
  search,
  onSearchChange,
  validationId,
  isArchived,
  data,
}: LoaderProps & { data: CompetitorsData }) {
  const { t } = useTranslation(["research", "form", "app"]);
  const me = useMe();
  const queryClient = useQueryClient();
  const role = useWorkspaceRole(workspaceId);
  const canEdit = canEditIdeas(role) && !isArchived;
  const currency = useWorkspaceCurrency(workspaceId);
  const narrow = useIsNarrow();
  const belowDesktop = useBelowDesktop();
  const { changed } = useValidationRefresh(validationId);
  usePanelTarget(formatContainerTarget("validation", validationId, "competitors"));
  const specs = useMemo(() => competitorSpecs(t), [t]);
  const key = competitorsKey(validationId);
  const { items, answers, guidance } = data;
  const [creating, setCreating] = useState(false);
  // The comparison table needs the width of a tablet; a phone always gets cards (design-spec 4.1).
  const view = narrow ? "cards" : (search.view ?? "cards");
  const selected = items.find((item) => item.id === search.row);
  const openRow = (row: string | undefined) => onSearchChange({ row });

  const failed = (title: string) => (error: unknown) =>
    toasts.add({ title, description: errorText(t, error), variant: "negative" });

  const remove = useMutation({
    mutationFn: async (competitor: Competitor) => {
      await autosave.idle();
      await deleteCompetitor(competitor.id);
      return competitor;
    },
    onSuccess: (competitor) => {
      queryClient.setQueryData<CompetitorsData>(key, (old) =>
        old ? { ...old, items: old.items.filter((item) => item.id !== competitor.id) } : old,
      );
      openRow(undefined);
      changed();
      toasts.add({
        title: t("research:competitors.deleted", { name: competitor.name }),
        variant: "informative",
      });
    },
    onError: failed(t("research:competitors.deleteFailed")),
  });

  const reorder = useMutation({
    mutationFn: (ids: string[]) => putOrder(validationId, "competitors", ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CompetitorsData>(key);
      queryClient.setQueryData<CompetitorsData>(key, (old) => {
        if (!old) return old;
        const byId = new Map(old.items.map((item) => [item.id, item]));
        return {
          ...old,
          items: ids.flatMap((id) => {
            const found = byId.get(id);
            return found ? [found] : [];
          }),
        };
      });
      return { previous };
    },
    onError: (error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      failed(t("research:competitors.moveFailed"))(error);
    },
  });

  const move = (competitor: Competitor, direction: "up" | "down") => {
    const ids = movedIds(
      items.map((item) => item.id),
      competitor.id,
      direction,
    );
    if (ids) reorder.mutate(ids);
  };

  const columns = narrow ? 1 : belowDesktop ? 2 : 3;
  const index = selected ? items.indexOf(selected) : -1;

  return (
    <>
      <CardComparePattern
        header={
          <ValidationSectionHeader
            workspaceId={workspaceId}
            ideaId={ideaId}
            sectionKey="04"
            backLabel={t("research:back")}
            isArchived={isArchived}
          />
        }
        toolbar={
          <Flex gap="space-200" justify="between" align="center" wrap>
            <Text variant="label" as="span">
              {t("research:competitors.count", {
                count: items.length,
                min: guidance.min,
                max: guidance.max,
              })}
            </Text>
            <Flex gap="space-200" align="center" wrap>
              {!narrow && items.length > 0 ? (
                <SegmentedControl
                  size="S"
                  aria-label={t("research:competitors.view")}
                  value={view}
                  onChange={(next) =>
                    onSearchChange({ view: next === "table" ? "table" : "cards" })
                  }
                >
                  <SegmentedControlItem value="cards">
                    {t("research:competitors.cards")}
                  </SegmentedControlItem>
                  <SegmentedControlItem value="table">
                    {t("research:competitors.table.title")}
                  </SegmentedControlItem>
                </SegmentedControl>
              ) : null}
              {canEdit && items.length > 0 ? (
                <Button variant="accent" onPress={() => setCreating(true)}>
                  {t("research:competitors.add")}
                </Button>
              ) : null}
            </Flex>
          </Flex>
        }
      >
        <Stack gap="space-500">
          {items.length === 0 ? (
            <IllustratedMessage
              icon={Swords}
              heading={t("research:competitors.empty.heading", {
                min: guidance.min,
                max: guidance.max,
              })}
              actions={
                canEdit ? (
                  <Button variant="accent" onPress={() => setCreating(true)}>
                    {t("research:competitors.add")}
                  </Button>
                ) : null
              }
            >
              {t("research:competitors.empty.body")}
            </IllustratedMessage>
          ) : view === "table" ? (
            <CompetitorTable
              competitors={items}
              specs={specs}
              currency={currency}
              timeZone={me.timezone}
              canEdit={canEdit}
              onOpen={openRow}
            />
          ) : (
            <CompetitorCards
              competitors={items}
              specs={specs}
              currency={currency}
              timeZone={me.timezone}
              columns={columns}
              onOpen={openRow}
            />
          )}
          <PatternCards
            validationId={validationId}
            answers={answers}
            queryKey={key}
            isReadOnly={!canEdit}
            focusKey={search.q}
          />
        </Stack>
      </CardComparePattern>
      {selected ? (
        <CompetitorDialog
          key={selected.id}
          validationId={validationId}
          competitor={selected}
          specs={specs}
          canEdit={canEdit}
          currency={currency}
          timeZone={me.timezone}
          isFirst={index === 0}
          isLast={index === items.length - 1}
          onMove={(direction) => move(selected, direction)}
          onDelete={() => remove.mutate(selected)}
          onClose={() => openRow(undefined)}
          onChanged={changed}
        />
      ) : null}
      {canEdit ? (
        <Dialog
          isOpen={creating}
          onOpenChange={setCreating}
          title={t("research:competitors.newTitle")}
          closeLabel={t("app:close")}
          size="large"
        >
          <NewRowForm
            label={t("research:competitors.newTitle")}
            specs={specs}
            currency={currency}
            timeZone={me.timezone}
            submitLabel={t("research:competitors.submit")}
            autoFocusKey="name"
            create={(body) => createCompetitor(validationId, body)}
            onCreated={(created) => {
              queryClient.setQueryData<CompetitorsData>(key, (old) =>
                old ? { ...old, items: [...old.items, created] } : old,
              );
              changed();
              setCreating(false);
              openRow(created.id);
            }}
            onCancel={() => setCreating(false)}
          />
        </Dialog>
      ) : null}
    </>
  );
}
