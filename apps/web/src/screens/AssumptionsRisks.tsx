import type { Assumption, Risk } from "@moonx/schemas";
import {
  Button,
  Container,
  Flex,
  Heading,
  IllustratedMessage,
  ListDetailPattern,
  ListView,
  ListViewItem,
  Skeleton,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
  useBelowDesktop,
} from "@moonx/ui-web";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ShieldAlert, Target } from "lucide-react";
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
  type AssumptionsSearch,
  assumptionSpecs,
  assumptionsQuery,
  createAssumption,
  createRisk,
  deleteAssumption,
  deleteRisk,
  movedIds,
  putOrder,
  riskSpecs,
  risksQuery,
} from "../lib/research";
import { useMe } from "../lib/session";
import { toasts } from "../lib/toast";
import { useValidationRefresh } from "../lib/use-validation-refresh";
import { assumptionsKey, risksKey } from "../lib/validation-keys";
import { AssumptionRowContent, RiskRowContent } from "./assumptions/RowContent";
import { RowPane } from "./assumptions/RowPane";

type ListTab = "assumptions" | "risks";

function ListsSkeleton() {
  return (
    <Stack gap="space-200">
      <Skeleton width="space-1000" />
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} shape="block" height="space-800" />
      ))}
    </Stack>
  );
}

export interface AssumptionsRisksProps {
  workspaceId: string;
  ideaId: string;
  search: AssumptionsSearch;
  onSearchChange: (patch: Partial<AssumptionsSearch>) => void;
}

/**
 * Screen 16, the assumptions and risks of an idea (design-spec 6.10, pattern D): a tab for each
 * list, the rows on the left and the chosen row on the right. Risks come in the order of Impact,
 * then Probability, until a person places them by hand.
 */
export function AssumptionsRisks(props: AssumptionsRisksProps) {
  const idea = useQuery(ideaDetailQuery(props.ideaId));
  return (
    <QueryBoundary query={idea} skeleton={<ListsSkeleton />}>
      {(detail) =>
        detail.workspaceId !== props.workspaceId ? (
          <NoAccessState />
        ) : (
          <ListsLoader
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

interface LoaderProps extends AssumptionsRisksProps {
  validationId: string;
  isArchived: boolean;
}

function ListsLoader(props: LoaderProps) {
  const assumptions = useQuery(assumptionsQuery(props.validationId));
  const risks = useQuery(risksQuery(props.validationId));
  return (
    <QueryBoundary query={assumptions} skeleton={<ListsSkeleton />}>
      {(a) => (
        <QueryBoundary query={risks} skeleton={<ListsSkeleton />}>
          {(r) => <ListsScreen {...props} assumptions={a.items} risks={r.items} />}
        </QueryBoundary>
      )}
    </QueryBoundary>
  );
}

function ListsScreen({
  workspaceId,
  ideaId,
  search,
  onSearchChange,
  validationId,
  isArchived,
  assumptions,
  risks,
}: LoaderProps & { assumptions: Assumption[]; risks: Risk[] }) {
  const { t } = useTranslation(["research", "app"]);
  const me = useMe();
  const queryClient = useQueryClient();
  const role = useWorkspaceRole(workspaceId);
  const canEdit = canEditIdeas(role) && !isArchived;
  const currency = useWorkspaceCurrency(workspaceId);
  const compact = useBelowDesktop();
  const { changed } = useValidationRefresh(validationId);
  usePanelTarget(formatContainerTarget("validation", validationId, "assumptions_risks"));
  const assumptionFields = useMemo(() => assumptionSpecs(t), [t]);
  const riskFields = useMemo(() => riskSpecs(t), [t]);
  const [creating, setCreating] = useState(false);

  // A link to one row (an evidence usage) names no tab; the row says which list it is in.
  const tab: ListTab =
    search.tab ?? (risks.some((risk) => risk.id === search.row) ? "risks" : "assumptions");
  const isRisks = tab === "risks";
  const rows: (Assumption | Risk)[] = isRisks ? risks : assumptions;
  const key = isRisks ? risksKey(validationId) : assumptionsKey(validationId);
  const selected = creating ? undefined : rows.find((row) => row.id === search.row);
  const index = selected ? rows.indexOf(selected) : -1;

  const select = (row: string | undefined) => onSearchChange({ tab, row });
  const failed = (title: string) => (error: unknown) =>
    toasts.add({ title, description: errorText(t, error), variant: "negative" });

  const remove = useMutation({
    mutationFn: async (row: Assumption | Risk) => {
      await autosave.idle();
      await (isRisks ? deleteRisk(row.id) : deleteAssumption(row.id));
      return row;
    },
    onSuccess: (row) => {
      queryClient.setQueryData<{ items: (Assumption | Risk)[] }>(key, (old) =>
        old ? { items: old.items.filter((item) => item.id !== row.id) } : old,
      );
      select(undefined);
      changed();
      toasts.add({
        title: isRisks ? t("research:risks.deleted") : t("research:assumptions.deleted"),
        variant: "informative",
      });
    },
    onError: failed(t("research:deleteFailed")),
  });

  const reorder = useMutation({
    mutationFn: (ids: string[]) => putOrder(validationId, isRisks ? "risks" : "assumptions", ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<{ items: (Assumption | Risk)[] }>(key);
      queryClient.setQueryData<{ items: (Assumption | Risk)[] }>(key, (old) => {
        if (!old) return old;
        const byId = new Map(old.items.map((item) => [item.id, item]));
        return {
          items: ids.flatMap((id) => {
            const found = byId.get(id);
            return found ? [found] : [];
          }),
        };
      });
      return { previous };
    },
    // Placing a risk gives every risk a place, so the server's copy says which.
    onSuccess: () => {
      if (isRisks) void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      failed(t("research:moveFailed"))(error);
    },
  });

  const move = (row: Assumption | Risk, direction: "up" | "down") => {
    const ids = movedIds(
      rows.map((item) => item.id),
      row.id,
      direction,
    );
    if (ids) reorder.mutate(ids);
  };

  const list = () => {
    if (rows.length === 0) {
      return (
        <IllustratedMessage
          icon={isRisks ? ShieldAlert : Target}
          heading={
            isRisks ? t("research:risks.empty.heading") : t("research:assumptions.empty.heading")
          }
          actions={
            canEdit ? (
              <Button variant="accent" onPress={() => setCreating(true)}>
                {isRisks ? t("research:risks.add") : t("research:assumptions.add")}
              </Button>
            ) : null
          }
        >
          {isRisks ? t("research:risks.empty.body") : t("research:assumptions.empty.body")}
        </IllustratedMessage>
      );
    }
    return (
      <ListView
        aria-label={isRisks ? t("research:risks.listLabel") : t("research:assumptions.listLabel")}
        selectionMode="single"
        selectionBehavior="replace"
        disallowEmptySelection
        selectedKeys={selected ? [selected.id] : []}
        onSelectionChange={(keys) => {
          const [next] = keys === "all" ? [] : keys;
          if (next === undefined) return;
          setCreating(false);
          select(String(next));
        }}
      >
        {rows.map((row) => (
          <ListViewItem key={row.id} id={row.id} textValue={row.statement}>
            {isRisks ? (
              <RiskRowContent risk={row as Risk} />
            ) : (
              <AssumptionRowContent assumption={row as Assumption} />
            )}
          </ListViewItem>
        ))}
      </ListView>
    );
  };

  const detail = () => {
    if (creating) {
      const title = isRisks ? t("research:risks.newTitle") : t("research:assumptions.newTitle");
      return (
        <Stack gap="space-300">
          <Heading level={2}>{title}</Heading>
          <NewRowForm<Assumption | Risk>
            label={title}
            specs={isRisks ? riskFields : assumptionFields}
            currency={currency}
            timeZone={me.timezone}
            submitLabel={isRisks ? t("research:risks.submit") : t("research:assumptions.submit")}
            autoFocusKey="statement"
            create={(body) =>
              isRisks ? createRisk(validationId, body) : createAssumption(validationId, body)
            }
            onCreated={(created) => {
              queryClient.setQueryData<{ items: (Assumption | Risk)[] }>(key, (old) =>
                old ? { items: [...old.items, created] } : old,
              );
              if (isRisks) void queryClient.invalidateQueries({ queryKey: key });
              changed();
              setCreating(false);
              select(created.id);
            }}
            onCancel={() => setCreating(false)}
          />
        </Stack>
      );
    }
    if (!selected) return <Text tone="secondary">{t("research:pickRow")}</Text>;
    return (
      <RowPane
        key={`${tab}:${selected.id}`}
        validationId={validationId}
        kind={isRisks ? "risk" : "assumption"}
        row={selected}
        specs={isRisks ? riskFields : assumptionFields}
        canEdit={canEdit}
        currency={currency}
        timeZone={me.timezone}
        isFirst={index === 0}
        isLast={index === rows.length - 1}
        onMove={(direction) => move(selected, direction)}
        onDelete={() => remove.mutate(selected)}
        onBack={compact ? () => select(undefined) : undefined}
        onChanged={changed}
      />
    );
  };

  const addLabel = isRisks ? t("research:risks.add") : t("research:assumptions.add");
  return (
    <Container width="content">
      <Stack gap="space-300">
        <ValidationSectionHeader
          workspaceId={workspaceId}
          ideaId={ideaId}
          sectionKey="09"
          backLabel={t("research:back")}
          isArchived={isArchived}
        />
        <Tabs
          selectedKey={tab}
          onSelectionChange={(next) => {
            setCreating(false);
            onSearchChange({ tab: next === "risks" ? "risks" : "assumptions", row: undefined });
          }}
        >
          <TabList aria-label={t("research:tabs.label")}>
            <Tab id="assumptions">
              {t("research:tabs.assumptions", { total: assumptions.length })}
            </Tab>
            <Tab id="risks">{t("research:tabs.risks", { total: risks.length })}</Tab>
          </TabList>
          <TabPanel id={tab}>
            <ListDetailPattern
              list={
                <Stack gap="space-200">
                  {rows.length > 0 && (isRisks || (canEdit && !compact)) ? (
                    <Flex justify={isRisks ? "between" : "end"} align="center" gap="space-200" wrap>
                      {isRisks ? (
                        <Text variant="caption" tone="secondary" as="span">
                          {t("research:risks.order")}
                        </Text>
                      ) : null}
                      {canEdit && !compact ? (
                        <Button variant="accent" onPress={() => setCreating(true)}>
                          {addLabel}
                        </Button>
                      ) : null}
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
