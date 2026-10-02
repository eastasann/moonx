import type { ExecutionType } from "@moonx/schemas";
import { Button, Dialog, Flex, Link, Skeleton, Stack, Text } from "@moonx/ui-web";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { QueryBoundary } from "../../components/states";
import {
  EXECUTION_KEYS,
  EXECUTION_TAB_OF_TYPE,
  groupExecutionItems,
  isOrderable,
  movedExecutionIds,
} from "../../lib/execution";
import { useWorkspaceCurrency } from "../../lib/ideas";
import {
  type ExecutionItem,
  executionItemsKey,
  executionItemsQuery,
  planPaths,
} from "../../lib/plans";
import { useMe } from "../../lib/session";
import { ExecutionList } from "./ExecutionList";
import { ExecutionRowPane } from "./ExecutionRowPane";
import { NewExecutionForm } from "./NewExecutionForm";
import { useExecutionActions } from "./useExecutionActions";

export interface ExecutionItemsViewProps {
  workspaceId: string;
  ideaId: string;
  planId: string;
  type: ExecutionType;
  /** An Owner or Member of a plan that is not archived and not shown as a saved version. */
  canEdit: boolean;
  /**
   * The rows of a saved version. They are shown as they were, read only, instead of the live
   * rows, and have no comments or history of their own.
   */
  fixedItems?: readonly ExecutionItem[];
  /** Marks the plan's other screens stale after a change. */
  onChanged: () => void;
}

/**
 * The execution sub-items of screen 21 (§23, 25, 26, 28, 29): the same rows as screen 22, only
 * of one type, listed, added and edited in place. A row opens in a dialog with the same detail
 * as screen 22's right pane; "Open in Execution" goes to the matching tab (design-spec 6.12).
 */
export function ExecutionItemsView(props: ExecutionItemsViewProps) {
  const { planId, type, fixedItems } = props;
  const live = useQuery({ ...executionItemsQuery(planId, type), enabled: !fixedItems });
  if (fixedItems) return <ItemsBody {...props} items={fixedItems} />;
  return (
    <QueryBoundary query={live} skeleton={<ViewSkeleton />}>
      {(data) => <ItemsBody {...props} items={data.items} />}
    </QueryBoundary>
  );
}

function ViewSkeleton() {
  return (
    <Stack gap="space-100">
      <Skeleton shape="block" height="space-600" />
      <Skeleton shape="block" height="space-600" />
    </Stack>
  );
}

function ItemsBody({
  workspaceId,
  ideaId,
  planId,
  type,
  canEdit,
  fixedItems,
  onChanged,
  items,
}: ExecutionItemsViewProps & { items: readonly ExecutionItem[] }) {
  const { t } = useTranslation(["execution", "app"]);
  const me = useMe();
  const currency = useWorkspaceCurrency(workspaceId);
  const queryClient = useQueryClient();
  const { remove, reorder } = useExecutionActions(planId, type, onChanged);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const groups = useMemo(() => groupExecutionItems(t, type, items), [t, type, items]);
  const opened = items.find((item) => item.id === openId);
  const group = groups.find((candidate) => candidate.items.some((item) => item.id === openId));
  const index = group && opened ? group.items.indexOf(opened) : -1;
  const typeName = t(EXECUTION_KEYS.type[type]);
  const path = `${planPaths(workspaceId, ideaId, planId).execution}?tab=${EXECUTION_TAB_OF_TYPE[type]}`;
  const isLive = fixedItems === undefined;

  return (
    <Stack gap="space-200">
      <Flex gap="space-200" align="center" justify="between" wrap>
        <Link href={path}>{t("execution:view.open")}</Link>
        {canEdit && items.length > 0 ? (
          <Button variant="secondary" onPress={() => setCreating(true)}>
            {t("execution:view.add")}
          </Button>
        ) : null}
      </Flex>
      {items.length === 0 ? (
        <Stack gap="space-200" align="start">
          <Text tone="secondary">{t("execution:view.empty")}</Text>
          {canEdit ? (
            <Button variant="accent" onPress={() => setCreating(true)}>
              {t("execution:view.add")}
            </Button>
          ) : null}
        </Stack>
      ) : (
        <ExecutionList
          groups={groups}
          label={typeName}
          selectedId={openId ?? undefined}
          onSelect={setOpenId}
          timeZone={me.timezone}
        />
      )}
      <Dialog
        title={typeName}
        closeLabel={t("app:close")}
        size="large"
        isDismissable
        isOpen={opened !== undefined}
        onOpenChange={(open) => !open && setOpenId(null)}
      >
        {opened ? (
          <ExecutionRowPane
            key={opened.id}
            workspaceId={workspaceId}
            planId={planId}
            item={opened}
            canEdit={canEdit}
            currency={currency}
            timeZone={me.timezone}
            isFirst={index <= 0}
            isLast={group ? index === group.items.length - 1 : true}
            orderable={isOrderable(type)}
            hasPanels={isLive}
            onMove={(direction) => {
              const ids = group && movedExecutionIds(items, group.items, opened.id, direction);
              if (ids) reorder.mutate(ids);
            }}
            onDelete={() => remove.mutate(opened, { onSuccess: () => setOpenId(null) })}
            onChanged={onChanged}
          />
        ) : null}
      </Dialog>
      <Dialog
        title={t("execution:new.title", { type: typeName })}
        closeLabel={t("app:close")}
        size="medium"
        isOpen={creating}
        onOpenChange={setCreating}
      >
        <NewExecutionForm
          planId={planId}
          type={type}
          onCancel={() => setCreating(false)}
          onCreated={(created) => {
            queryClient.setQueryData<{ items: ExecutionItem[] }>(
              executionItemsKey(planId, type),
              (old) => (old ? { items: [...old.items, created] } : old),
            );
            void queryClient.invalidateQueries({ queryKey: executionItemsKey(planId, type) });
            onChanged();
            setCreating(false);
            setOpenId(created.id);
          }}
        />
      </Dialog>
    </Stack>
  );
}
