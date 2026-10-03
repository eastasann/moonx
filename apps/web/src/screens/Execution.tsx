import {
  Button,
  Container,
  Flex,
  Heading,
  IllustratedMessage,
  InlineAlert,
  Link,
  ListDetailPattern,
  Picker,
  PickerItem,
  Skeleton,
  Stack,
  Switch,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
  useBelowDesktop,
} from "@moonx/ui-web";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleHelp, Flag, Gauge, ListChecks, Plus, Rocket } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { NoAccessState, QueryBoundary } from "../components/states";
import {
  type Assignable,
  assignableMembers,
  EXECUTION_KEYS,
  filterActions,
  groupExecutionItems,
  isOrderable,
  movedExecutionIds,
  STATUSES_OF_TYPE,
} from "../lib/execution";
import {
  canEditIdeas,
  useWorkspaceCurrency,
  useWorkspaceMembers,
  useWorkspaceRole,
} from "../lib/ideas";
import { formatContainerTarget, usePanelTarget } from "../lib/panel-target";
import { usePlanChangeRefresh } from "../lib/plan-item";
import {
  EXECUTION_TABS,
  EXECUTION_TYPE_OF_TAB,
  type ExecutionItem,
  type ExecutionSearch,
  type ExecutionTab,
  executionItemsKey,
  executionItemsQuery,
  type PlanHome,
  planHomeQuery,
  planPaths,
} from "../lib/plans";
import { useMe } from "../lib/session";
import { ExecutionList } from "./execution/ExecutionList";
import { ExecutionRowPane } from "./execution/ExecutionRowPane";
import { NewExecutionForm } from "./execution/NewExecutionForm";
import { useExecutionActions } from "./execution/useExecutionActions";

const TAB_ICON = {
  milestones: Flag,
  launch: Rocket,
  kpis: Gauge,
  questions: CircleHelp,
  actions: ListChecks,
} as const satisfies Record<ExecutionTab, unknown>;

const ANY = "__any";

function ExecutionSkeleton() {
  return (
    <Stack gap="space-200">
      <Skeleton width="space-1000" />
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} shape="block" height="space-800" />
      ))}
    </Stack>
  );
}

export interface ExecutionProps {
  workspaceId: string;
  ideaId: string;
  planId: string;
  search: ExecutionSearch;
  onSearchChange: (patch: Partial<ExecutionSearch>) => void;
}

/**
 * Screen 22, the execution management of a plan (design-spec 6.13, pattern D): a tab for each
 * kind of item, the rows on the left and the chosen one on the right. It always shows the live
 * rows; a saved version of the plan keeps its own copy, which screen 21 shows.
 */
export function Execution(props: ExecutionProps) {
  const home = useQuery(planHomeQuery(props.planId));
  return (
    <QueryBoundary query={home} skeleton={<ExecutionSkeleton />}>
      {(plan) =>
        plan.workspaceId !== props.workspaceId || plan.ideaId !== props.ideaId ? (
          <NoAccessState />
        ) : (
          <TabsLoader {...props} plan={plan} />
        )
      }
    </QueryBoundary>
  );
}

interface LoaderProps extends ExecutionProps {
  plan: PlanHome;
}

function TabsLoader(props: LoaderProps) {
  const { planId, search } = props;
  const results = useQueries({
    queries: EXECUTION_TABS.map((tab) => executionItemsQuery(planId, EXECUTION_TYPE_OF_TAB[tab])),
  });
  const itemsOf = (tab: ExecutionTab) => results[EXECUTION_TABS.indexOf(tab)]?.data?.items;
  // A link to one item (a due-soon row) may name no tab; the item says which list it is in.
  const tab: ExecutionTab =
    search.tab ??
    EXECUTION_TABS.find((candidate) =>
      itemsOf(candidate)?.some((item) => item.id === search.item),
    ) ??
    "milestones";
  const active = results[EXECUTION_TABS.indexOf(tab)];
  if (!active) return null;
  return (
    <QueryBoundary query={active} skeleton={<ExecutionSkeleton />}>
      {(data) => (
        <ExecutionScreen
          {...props}
          tab={tab}
          items={data.items}
          counts={Object.fromEntries(
            EXECUTION_TABS.map((candidate) => [candidate, itemsOf(candidate)?.length]),
          )}
        />
      )}
    </QueryBoundary>
  );
}

function ExecutionScreen({
  workspaceId,
  ideaId,
  planId,
  search,
  onSearchChange,
  plan,
  tab,
  items,
  counts,
}: LoaderProps & {
  tab: ExecutionTab;
  items: ExecutionItem[];
  counts: Partial<Record<ExecutionTab, number | undefined>>;
}) {
  const { t } = useTranslation(["execution", "app"]);
  const me = useMe();
  const queryClient = useQueryClient();
  const role = useWorkspaceRole(workspaceId);
  const isArchived = plan.archived || plan.ideaArchived;
  const canEdit = canEditIdeas(role) && !isArchived;
  const currency = useWorkspaceCurrency(workspaceId);
  const members = useWorkspaceMembers(workspaceId);
  const compact = useBelowDesktop();
  const { changed } = usePlanChangeRefresh(planId);
  usePanelTarget(formatContainerTarget("business_plan", planId), { archived: isArchived });
  const type = EXECUTION_TYPE_OF_TAB[tab];
  const { remove, reorder } = useExecutionActions(planId, type, changed);
  const [creating, setCreating] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);

  const isActions = type === "next_action";
  const shown = useMemo(
    () =>
      isActions
        ? filterActions(
            items,
            { assignee: search.assignee, status: search.status, overdueOnly },
            me.id,
          )
        : items,
    [isActions, items, search.assignee, search.status, overdueOnly, me.id],
  );
  const groups = useMemo(() => groupExecutionItems(t, type, shown), [t, type, shown]);
  const selected = creating ? undefined : items.find((item) => item.id === search.item);
  const group = groups.find((candidate) =>
    candidate.items.some((item) => item.id === selected?.id),
  );
  const index = group && selected ? group.items.indexOf(selected) : -1;
  const select = (item: string | undefined) => onSearchChange({ tab, item });
  const typeName = t(EXECUTION_KEYS.type[type]);
  const addLabel = t("execution:add");
  const Icon = TAB_ICON[tab];

  const list = () => {
    if (items.length === 0) {
      const empty = EXECUTION_KEYS.empty[type];
      return (
        <IllustratedMessage
          icon={Icon}
          heading={t(empty.heading)}
          actions={
            canEdit ? (
              <Button variant="accent" onPress={() => setCreating(true)}>
                {addLabel}
              </Button>
            ) : null
          }
        >
          {t(empty.body)}
        </IllustratedMessage>
      );
    }
    if (shown.length === 0) return <Text tone="secondary">{t("execution:noMatch")}</Text>;
    return (
      <ExecutionList
        groups={groups}
        label={t(EXECUTION_KEYS.tab[tab])}
        selectedId={selected?.id}
        timeZone={me.timezone}
        onSelect={(id) => {
          setCreating(false);
          select(id);
        }}
      />
    );
  };

  const detail = () => {
    if (creating) {
      return (
        <Stack gap="space-300">
          <Heading level={2}>{t("execution:new.title", { type: typeName })}</Heading>
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
              changed();
              setCreating(false);
              select(created.id);
            }}
          />
        </Stack>
      );
    }
    if (!selected) return <Text tone="secondary">{t("execution:pickRow")}</Text>;
    return (
      <ExecutionRowPane
        key={selected.id}
        workspaceId={workspaceId}
        planId={planId}
        item={selected}
        canEdit={canEdit}
        currency={currency}
        timeZone={me.timezone}
        isFirst={index <= 0}
        isLast={group ? index === group.items.length - 1 : true}
        orderable={isOrderable(type)}
        hasPanels
        onMove={(direction) => {
          const ids = group && movedExecutionIds(items, group.items, selected.id, direction);
          if (ids) reorder.mutate(ids);
        }}
        onDelete={() => remove.mutate(selected, { onSuccess: () => select(undefined) })}
        onBack={compact ? () => select(undefined) : undefined}
        onChanged={changed}
      />
    );
  };

  return (
    <Container width="content">
      <Stack gap="space-300">
        <Stack gap="space-200">
          <Link href={planPaths(workspaceId, ideaId, planId).home}>
            {t("execution:back", { plan: plan.name })}
          </Link>
          {plan.ideaArchived ? <InlineAlert variant="notice" heading={t("form:archived")} /> : null}
          {plan.archived ? (
            <InlineAlert variant="notice" heading={t("execution:planArchived")} />
          ) : null}
          <Heading level={1}>{t("execution:title")}</Heading>
        </Stack>
        <Tabs
          selectedKey={tab}
          onSelectionChange={(next) => {
            setCreating(false);
            onSearchChange({ tab: next as ExecutionTab, item: undefined });
          }}
        >
          <TabList aria-label={t("execution:tabs.label")}>
            {EXECUTION_TABS.map((candidate) => {
              const label = t(EXECUTION_KEYS.tab[candidate]);
              const count = counts[candidate];
              return (
                <Tab key={candidate} id={candidate}>
                  {count === undefined ? label : t("execution:tabs.withCount", { label, count })}
                </Tab>
              );
            })}
          </TabList>
          <TabPanel id={tab}>
            <ListDetailPattern
              list={
                <Stack gap="space-200">
                  {isActions ? (
                    <ActionFilters
                      assignee={search.assignee}
                      status={search.status}
                      overdueOnly={overdueOnly}
                      members={assignableMembers(members.data?.items)}
                      onAssignee={(assignee) => onSearchChange({ assignee })}
                      onStatus={(status) => onSearchChange({ status })}
                      onOverdueOnly={setOverdueOnly}
                    />
                  ) : null}
                  {items.length > 0 && canEdit && !compact ? (
                    <Flex justify="end" align="center" gap="space-200" wrap>
                      <Button variant="accent" onPress={() => setCreating(true)}>
                        {addLabel}
                      </Button>
                    </Flex>
                  ) : null}
                  {list()}
                </Stack>
              }
              detail={detail()}
              detailOpen={compact && (creating || selected !== undefined)}
              floatingAction={
                canEdit && compact ? (
                  <Button variant="accent" aria-label={addLabel} onPress={() => setCreating(true)}>
                    <Plus aria-hidden="true" />
                  </Button>
                ) : null
              }
            />
          </TabPanel>
        </Tabs>
      </Stack>
    </Container>
  );
}

interface ActionFiltersProps {
  assignee: ExecutionSearch["assignee"];
  status: ExecutionSearch["status"];
  overdueOnly: boolean;
  members: readonly Assignable[];
  onAssignee: (assignee: ExecutionSearch["assignee"]) => void;
  onStatus: (status: ExecutionSearch["status"]) => void;
  onOverdueOnly: (value: boolean) => void;
}

/** Next Actions are narrowed by assignee, status and "overdue" (design-spec 6.13). */
function ActionFilters({
  assignee,
  status,
  overdueOnly,
  members,
  onAssignee,
  onStatus,
  onOverdueOnly,
}: ActionFiltersProps) {
  const { t } = useTranslation("execution");
  return (
    <Flex gap="space-200" align="end" wrap>
      <Picker
        label={t("execution:filters.assignee")}
        value={assignee ?? ANY}
        onChange={(next) =>
          onAssignee(next === null || next === ANY ? undefined : (next as "me" | string))
        }
      >
        <PickerItem id={ANY}>{t("execution:filters.anyone")}</PickerItem>
        <PickerItem id="me">{t("execution:filters.me")}</PickerItem>
        {members.map((member) => (
          <PickerItem key={member.id} id={member.id}>
            {member.name}
          </PickerItem>
        ))}
      </Picker>
      <Picker
        label={t("execution:filters.status")}
        value={status ?? ANY}
        onChange={(next) =>
          onStatus(next === null || next === ANY ? undefined : (next as "todo" | "doing" | "done"))
        }
      >
        <PickerItem id={ANY}>{t("execution:filters.anyStatus")}</PickerItem>
        {STATUSES_OF_TYPE.next_action.map((id) => (
          <PickerItem key={id} id={id}>
            {t(EXECUTION_KEYS.status[id])}
          </PickerItem>
        ))}
      </Picker>
      <Switch isSelected={overdueOnly} onChange={onOverdueOnly}>
        {t("execution:filters.overdueOnly")}
      </Switch>
    </Flex>
  );
}
