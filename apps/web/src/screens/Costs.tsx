import { computeEconomics } from "@moonx/domain";
import type { CostCategory, CostItem } from "@moonx/schemas";
import { InlineAlert, Skeleton, Stack, useIsNarrow, WorksheetPattern } from "@moonx/ui-web";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NoAccessState, QueryBoundary } from "../components/states";
import { ValidationSectionHeader } from "../components/ValidationSectionHeader";
import { api, call } from "../lib/api";
import { autosave } from "../lib/autosave";
import {
  COST_CATEGORIES,
  type CostDraft,
  type CostsData,
  costRowInput,
  costsKey,
  costsQuery,
  draftOfItem,
  economicsValues,
  findRow,
  movedRows,
  rowsOf,
} from "../lib/costs";
import { errorText } from "../lib/error-text";
import { focusTableRowWhenReady } from "../lib/focus";
import { ideaDetailQuery } from "../lib/idea-detail";
import { canEditIdeas, useWorkspaceCurrency, useWorkspaceRole } from "../lib/ideas";
import { formatContainerTarget, usePanelTarget } from "../lib/panel-target";
import { toasts } from "../lib/toast";
import { useValidationRefresh } from "../lib/use-validation-refresh";
import type { RowView } from "./costs/CostFields";
import {
  CostRowController,
  type RowApi,
  type RowRegistry,
  rowApiOf,
} from "./costs/CostRowController";
import type { RowActions } from "./costs/CostRowMenu";
import { CostRowSheet } from "./costs/CostRowSheet";
import { CostTable } from "./costs/CostTable";
import { CostTotals, Subtotal, summaryBarText, totalLine } from "./costs/CostTotals";

function CostsSkeleton() {
  return (
    <Stack gap="space-300">
      <Skeleton width="space-1000" />
      <Skeleton shape="block" height="space-1000" />
      <Skeleton shape="block" height="space-1000" />
      <Skeleton shape="block" height="space-1000" />
    </Stack>
  );
}

export interface CostsProps {
  workspaceId: string;
  ideaId: string;
  /** `?tab=`: the table to start at. */
  tab?: CostCategory;
  /** `?row=`: the row to open on, by id or template key. */
  row?: string;
}

/**
 * Screen 17: the three cost tables and the totals that follow every keystroke (design-spec 6.3).
 */
export function Costs({ workspaceId, ideaId, tab, row }: CostsProps) {
  const idea = useQuery(ideaDetailQuery(ideaId));
  return (
    <QueryBoundary query={idea} skeleton={<CostsSkeleton />}>
      {(detail) =>
        detail.workspaceId !== workspaceId ? (
          <NoAccessState />
        ) : (
          <CostsLoader
            key={detail.validationId}
            workspaceId={workspaceId}
            ideaId={ideaId}
            validationId={detail.validationId}
            isArchived={detail.archived}
            tab={tab}
            row={row}
          />
        )
      }
    </QueryBoundary>
  );
}

interface LoaderProps extends CostsProps {
  validationId: string;
  isArchived: boolean;
}

function CostsLoader(props: LoaderProps) {
  const { validationId } = props;
  const costs = useQuery(costsQuery(validationId));
  usePanelTarget(formatContainerTarget("validation", validationId, "costs"));

  // Saves still on their way when the screen closes must reach every screen that shows them, the home included.
  useValidationRefresh(validationId);

  return (
    <QueryBoundary query={costs} skeleton={<CostsSkeleton />}>
      {(data) => <CostsWorksheet {...props} data={data} />}
    </QueryBoundary>
  );
}

function CostsWorksheet({
  workspaceId,
  ideaId,
  validationId,
  isArchived,
  tab,
  row,
  data,
}: LoaderProps & { data: CostsData }) {
  const { t } = useTranslation(["costs", "validation", "app", "common"]);
  const queryClient = useQueryClient();
  const role = useWorkspaceRole(workspaceId);
  const canEdit = canEditIdeas(role) && !isArchived;
  const isNarrow = useIsNarrow();
  const currency = useWorkspaceCurrency(workspaceId);
  const economicsPath = `/w/${workspaceId}/ideas/${ideaId}/economics`;
  const { items, economicsInputs } = data;
  const queryKey = costsKey(validationId);

  // What was typed since the page loaded; a row without an entry shows the server's copy.
  const [drafts, setDrafts] = useState<Record<string, CostDraft>>({});
  const draftOf = (item: CostItem) => drafts[item.id] ?? draftOfItem(item);
  const setDraft = (item: CostItem, update: (prev: CostDraft) => CostDraft) =>
    setDrafts((prev) => ({ ...prev, [item.id]: update(prev[item.id] ?? draftOfItem(item)) }));

  const registry: RowRegistry = useRef(new Map<string, RowApi>());
  const apis = useRef(new Map<string, RowApi>());
  const apiOf = (id: string): RowApi => {
    let found = apis.current.get(id);
    if (!found) {
      found = rowApiOf(registry, id);
      apis.current.set(id, found);
    }
    return found;
  };

  // The totals are computed here from the rows as edited, with the same functions as the API.
  const inputs = useMemo(() => economicsValues(economicsInputs), [economicsInputs]);
  const price = inputs.sellingPrice;
  const result = useMemo(
    () =>
      computeEconomics(
        items.map((item) => costRowInput(item, drafts[item.id] ?? draftOfItem(item))),
        inputs,
      ),
    [items, drafts, inputs],
  );

  const viewOf = (item: CostItem): RowView => ({
    item,
    draft: draftOf(item),
    api: apiOf(item.id),
    isReadOnly: !canEdit,
    currency,
    price,
    economicsPath,
  });

  const [sheetId, setSheetId] = useState<string | null>(() => {
    const wanted = findRow(items, row);
    return isNarrow && wanted ? wanted.id : null;
  });
  const [addedId, setAddedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(() => {
    if (isNarrow) return null;
    const wanted = findRow(items, row);
    if (wanted) return wanted.id;
    return tab ? (rowsOf(items, tab)[0]?.id ?? null) : null;
  });
  const hasFocusRow = focusId !== null && items.some((item) => item.id === focusId);
  useEffect(() => {
    // A row added a moment ago reaches `items` one tick after its id is requested here, so a
    // request for a row that is not in the list yet waits for it.
    if (!focusId || !hasFocusRow) return;
    return focusTableRowWhenReady(focusId, () => setFocusId(null));
  }, [focusId, hasFocusRow]);

  const failed = (title: string) => (error: unknown) =>
    toasts.add({ title, description: errorText(t, error), variant: "negative" });

  const add = useMutation({
    mutationFn: (category: CostCategory) =>
      call(api().api.v1.validations({ validationId })["cost-items"].post({ category, name: "" })),
    onSuccess: (created) => {
      queryClient.setQueryData<CostsData>(queryKey, (old) =>
        old ? { ...old, items: [...old.items, created] } : old,
      );
      if (isNarrow) {
        setAddedId(created.id);
        setSheetId(created.id);
      } else {
        setFocusId(created.id);
      }
    },
    onError: failed(t("costs:addFailed")),
  });

  const remove = useMutation({
    mutationFn: async (item: CostItem) => {
      // Input still on its way would be saved to a row that is gone.
      await registry.current.get(item.id)?.flush();
      await autosave.idle();
      await call(api().api.v1["cost-items"]({ costItemId: item.id }).delete());
      return item;
    },
    onSuccess: (item) => {
      queryClient.setQueryData<CostsData>(queryKey, (old) =>
        old ? { ...old, items: old.items.filter((i) => i.id !== item.id) } : old,
      );
      setDrafts(({ [item.id]: _gone, ...rest }) => rest);
      toasts.add({
        title: t("costs:deleted", { name: item.name.trim() || t("costs:unnamed") }),
        variant: "informative",
      });
    },
    onError: failed(t("costs:deleteFailed")),
  });

  const reorder = useMutation({
    mutationFn: ({ ids, category }: { ids: string[]; category: CostCategory }) =>
      call(
        api()
          .api.v1.validations({ validationId })({ list: "cost-items" })
          .order.put({ ids, category }),
      ),
    onMutate: async ({ category, ids }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CostsData>(queryKey);
      queryClient.setQueryData<CostsData>(queryKey, (old) => {
        if (!old) return old;
        const byId = new Map(old.items.map((i) => [i.id, i]));
        let next = 0;
        return {
          ...old,
          items: old.items.map((i) =>
            i.category === category ? (byId.get(ids[next++] as string) as CostItem) : i,
          ),
        };
      });
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      failed(t("costs:moveFailed"))(error);
    },
  });

  const actions: RowActions = {
    rename: (item) => (isNarrow ? setSheetId(item.id) : setFocusId(item.id)),
    move: (item, direction) => {
      const next = movedRows(items, item, direction);
      if (!next) return;
      reorder.mutate({
        category: item.category,
        ids: next.filter((i) => i.category === item.category).map((i) => i.id),
      });
    },
    remove: (item) => remove.mutate(item),
  };

  const justCreated =
    canEdit && items.length > 0 && items.every((i) => draftOf(i).classification.state === "empty");
  const sheetItem = items.find((i) => i.id === sheetId);

  return (
    <>
      <WorksheetPattern
        header={
          <ValidationSectionHeader
            workspaceId={workspaceId}
            ideaId={ideaId}
            sectionKey="05"
            backLabel={t("costs:back")}
            isArchived={isArchived}
          >
            {justCreated ? (
              <InlineAlert variant="informative" heading={t("costs:created")} />
            ) : null}
          </ValidationSectionHeader>
        }
        input={
          <Stack gap="space-400">
            {items.map((item) => (
              <CostRowController
                key={item.id}
                validationId={validationId}
                item={item}
                draft={draftOf(item)}
                isReadOnly={!canEdit}
                setDraft={setDraft}
                registry={registry}
              />
            ))}
            {COST_CATEGORIES.map((category) => (
              <CostTable
                key={category}
                category={category}
                items={rowsOf(items, category)}
                viewOf={viewOf}
                actions={actions}
                isNarrow={isNarrow}
                isReadOnly={!canEdit}
                isAdding={add.isPending}
                subtotal={
                  <Subtotal
                    line={totalLine(t, result, category, currency)}
                    economicsPath={economicsPath}
                  />
                }
                onAdd={() => add.mutate(category)}
                onOpenRow={setSheetId}
              />
            ))}
          </Stack>
        }
        result={<CostTotals result={result} currency={currency} economicsPath={economicsPath} />}
        resultSummary={summaryBarText(t, result, currency)}
        resultLabel={t("costs:totals.title")}
      />
      {sheetItem ? (
        <CostRowSheet
          key={sheetItem.id}
          view={viewOf(sheetItem)}
          autoFocusName={sheetItem.id === addedId}
          onClose={() => {
            setSheetId(null);
            setAddedId(null);
          }}
        />
      ) : null}
    </>
  );
}
