import type { TemplateQuestion } from "@moonx/schemas";
import { Button, InlineAlert, Menu, MenuItem, Skeleton, Stack } from "@moonx/ui-web";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { QuestionFormFrame } from "../components/QuestionFormFrame";
import { NoAccessState, QueryBoundary } from "../components/states";
import { canEditIdeas, useWorkspaceCurrency, useWorkspaceRole } from "../lib/ideas";
import { formatContainerTarget, usePanelTarget } from "../lib/panel-target";
import {
  executionTypeOf,
  isCountedSubItem,
  isSubItemAnswered,
  referenceOf,
  usePlanChangeRefresh,
} from "../lib/plan-item";
import {
  executionItemsQuery,
  type PlanAnswer,
  type PlanHome,
  type PlanItem,
  planHomeQuery,
  planItemQuery,
  planPaths,
} from "../lib/plans";
import { ExecutionSubItem } from "./plan-item/ExecutionSubItem";
import { MetricSubItem } from "./plan-item/MetricSubItem";
import { References } from "./plan-item/References";
import { TableSubItem } from "./plan-item/TableSubItem";
import { TextSubItem } from "./plan-item/TextSubItem";

function ItemSkeleton() {
  return (
    <Stack gap="space-300">
      <Skeleton width="space-1000" />
      <Skeleton shape="block" height="space-1000" />
      <Skeleton shape="block" height="space-1000" />
      <Skeleton shape="block" height="space-1000" />
    </Stack>
  );
}

export interface PlanItemScreenProps {
  workspaceId: string;
  ideaId: string;
  planId: string;
  itemNo: number;
  /** `?q=`: the sub-item to open on. */
  focusQuestion?: string;
  /** `?version=`: a saved version, shown read only. */
  versionId?: string;
}

/**
 * Screen 21 for one item of a plan (design-spec 6.12, pattern C): its sub-items as a form that
 * saves while it is filled in, with the references of the latest validation beside them. Numbers
 * come from the validation and are not typed here; execution sub-items are screen 22's rows.
 */
export function PlanItemScreen(props: PlanItemScreenProps) {
  const { planId, itemNo, versionId } = props;
  const home = useQuery(planHomeQuery(planId, versionId));
  const item = useQuery(planItemQuery(planId, itemNo, versionId));
  // Held above the item so that moving to the next item does not read the whole plan again.
  const { changed } = usePlanChangeRefresh(planId);
  return (
    <QueryBoundary query={home} skeleton={<ItemSkeleton />}>
      {(plan) =>
        plan.workspaceId !== props.workspaceId || plan.ideaId !== props.ideaId ? (
          <NoAccessState />
        ) : (
          <QueryBoundary query={item} skeleton={<ItemSkeleton />}>
            {(data) => (
              <ItemForm
                key={`${planId}:${itemNo}:${versionId ?? ""}`}
                {...props}
                plan={plan}
                item={data}
                onChanged={changed}
              />
            )}
          </QueryBoundary>
        )
      }
    </QueryBoundary>
  );
}

interface FormProps extends PlanItemScreenProps {
  plan: PlanHome;
  item: PlanItem;
  onChanged: () => void;
}

const emptyAnswer = (questionKey: string): PlanAnswer => ({
  questionKey,
  text: null,
  rows: null,
  copiedFrom: null,
  commentCount: 0,
  lockVersion: 0,
  updatedAt: null,
  updatedBy: null,
});

function ItemForm({
  workspaceId,
  ideaId,
  planId,
  itemNo,
  focusQuestion,
  versionId,
  plan,
  item,
  onChanged,
}: FormProps) {
  const { t } = useTranslation(["planItem", "form"]);
  const queryClient = useQueryClient();
  const role = useWorkspaceRole(workspaceId);
  const currency = useWorkspaceCurrency(workspaceId);
  const canEdit = canEditIdeas(role) && !item.readOnly;
  const isSaved = versionId !== undefined;
  usePanelTarget(formatContainerTarget("business_plan", planId, String(itemNo).padStart(2, "0")));

  const answerOf = useMemo(
    () => new Map(item.answers.map((answer) => [answer.questionKey, answer])),
    [item.answers],
  );

  // The live rows of the execution types this item shows, which screen 22 and the dialogs edit;
  // a saved version keeps the rows it was saved with.
  const types = useMemo(
    () => [...new Set(item.prompts.flatMap((question) => executionTypeOf(question) ?? []))],
    [item.prompts],
  );
  const live = useQueries({
    queries: types.map((type) => ({ ...executionItemsQuery(planId, type), enabled: !isSaved })),
  });
  const executionOf = (type: NonNullable<ReturnType<typeof executionTypeOf>>) =>
    isSaved
      ? item.execution.filter((row) => row.type === type)
      : (live[types.indexOf(type)]?.data?.items ??
        item.execution.filter((row) => row.type === type));

  const countOf = (question: TemplateQuestion) => {
    const type = executionTypeOf(question);
    return type ? executionOf(type).length : 0;
  };

  const writeBack = (saved: PlanAnswer) => {
    queryClient.setQueryData<PlanItem>(planItemQuery(planId, itemNo, versionId).queryKey, (old) =>
      old
        ? {
            ...old,
            answers: old.answers.map((answer) =>
              answer.questionKey === saved.questionKey ? { ...answer, ...saved } : answer,
            ),
          }
        : old,
    );
    onChanged();
  };

  const counted = item.prompts.filter(isCountedSubItem);
  const withVersion = (path: string) => (versionId ? `${path}?version=${versionId}` : path);
  const paths = planPaths(workspaceId, ideaId, planId);
  const sections = plan.parts
    .flatMap((part) => part.items)
    .map((entry) => ({
      key: String(entry.itemNo),
      title: t("planItem:itemTitle", { itemNo: entry.itemNo, title: entry.title }),
      href: withVersion(paths.item(entry.itemNo)),
    }));
  const hasTotals = referenceOf(item.references, "totals") !== undefined;
  const scope = `scope=${itemNo}`;

  const notices = [
    plan.ideaArchived ? (
      <InlineAlert key="idea" variant="notice" heading={t("form:archived")} />
    ) : null,
    plan.archived ? (
      <InlineAlert key="plan" variant="notice" heading={t("planItem:planArchived")} />
    ) : null,
    plan.viewingVersion ? (
      <InlineAlert
        key="version"
        variant="notice"
        heading={t("planItem:viewing", { name: plan.viewingVersion.name })}
      />
    ) : null,
  ].filter(Boolean);

  return (
    <QuestionFormFrame
      section={{
        key: String(itemNo),
        title: t("planItem:itemTitle", { itemNo, title: item.title }),
        href: withVersion(paths.item(itemNo)),
      }}
      sections={sections}
      guidance={item.guidance}
      alert={notices.length > 0 ? <Stack gap="space-100">{notices}</Stack> : null}
      questions={counted.map((question) => ({
        key: question.key,
        answered: isSubItemAnswered(question, answerOf.get(question.key), countOf(question)),
      }))}
      initialQuestionKey={focusQuestion}
      home={{ href: withVersion(paths.home), label: t("planItem:complete.home") }}
      canEdit={canEdit}
      aiMenu={
        canEdit ? (
          <Menu trigger={<Button variant="secondary">{t("form:ai")}</Button>}>
            <MenuItem
              id="export"
              href={`/w/${workspaceId}/ai/export?source=business_plan&id=${planId}&${scope}`}
            >
              {t("form:aiExport")}
            </MenuItem>
            <MenuItem
              id="import"
              href={`/w/${workspaceId}/ai/import?target=business_plan&id=${planId}&${scope}`}
            >
              {t("form:aiImport")}
            </MenuItem>
          </Menu>
        ) : null
      }
    >
      {(state) => (
        <>
          {item.prompts.map((question) => {
            const common = {
              question,
              isFocused: state.isFocused(question.key),
              isOpenAll: state.isOpenAll,
              onFocusRequest: () => state.onFocusRequest(question.key),
              onNavigate: state.onNavigate,
            };
            if (question.answerType === "linked_metric") {
              return (
                <MetricSubItem
                  key={question.key}
                  question={question}
                  workspaceId={workspaceId}
                  ideaId={ideaId}
                  metrics={item.metrics}
                  scenarios={item.scenarios}
                  currency={currency}
                  canEditValidation={canEditIdeas(role)}
                />
              );
            }
            const type = executionTypeOf(question);
            if (type) {
              return (
                <ExecutionSubItem
                  key={question.key}
                  {...common}
                  workspaceId={workspaceId}
                  ideaId={ideaId}
                  planId={planId}
                  type={type}
                  count={executionOf(type).length}
                  canEdit={canEdit}
                  fixedItems={
                    isSaved ? item.execution.filter((row) => row.type === type) : undefined
                  }
                  onChanged={onChanged}
                />
              );
            }
            const answer = answerOf.get(question.key) ?? emptyAnswer(question.key);
            const shared = {
              ...common,
              planId,
              answer,
              isReadOnly: !canEdit,
              hasPanels: !isSaved,
              onSaved: writeBack,
            };
            return question.answerType === "table" ? (
              <TableSubItem
                key={question.key}
                {...shared}
                currency={currency}
                hasTotals={hasTotals}
              />
            ) : (
              <TextSubItem key={question.key} {...shared} />
            );
          })}
          <References workspaceId={workspaceId} references={item.references} currency={currency} />
        </>
      )}
    </QuestionFormFrame>
  );
}
