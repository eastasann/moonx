import { computeEconomics, DEFAULT_TARGET_MARGIN, type EconomicsInputValues } from "@moonx/domain";
import type { EconomicsField } from "@moonx/schemas";
import { Heading, Link, Skeleton, Stack, Text, WorksheetPattern } from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { NoAccessState, QueryBoundary } from "../components/states";
import { ValidationSectionHeader } from "../components/ValidationSectionHeader";
import { costRowInput, draftOfItem, economicsValues, totalView } from "../lib/costs";
import { ECONOMICS_FIELDS, type EconomicsData, economicsQuery, VALUE_KEY } from "../lib/economics";
import { focusKeyedField } from "../lib/focus";
import { ideaDetailQuery } from "../lib/idea-detail";
import { canEditIdeas, useWorkspaceCurrency, useWorkspaceRole } from "../lib/ideas";
import { formatContainerTarget, usePanelTarget } from "../lib/panel-target";
import { useValidationRefresh } from "../lib/use-validation-refresh";
import { EconomicsInputCard } from "./economics/EconomicsInputCard";
import { EconomicsResults, summaryBarText } from "./economics/EconomicsResults";
import { WorthCard } from "./economics/WorthCard";

function EconomicsSkeleton() {
  return (
    <Stack gap="space-300">
      <Skeleton width="space-1000" />
      <Skeleton shape="block" height="space-1000" />
      <Skeleton shape="block" height="space-1000" />
      <Skeleton shape="block" height="space-1000" />
    </Stack>
  );
}

export interface EconomicsProps {
  workspaceId: string;
  ideaId: string;
  /** `?field=`: the input to start at. */
  field?: EconomicsField;
}

/**
 * Screen 18: the seven inputs and the results that follow every keystroke (design-spec 6.4).
 */
export function Economics({ workspaceId, ideaId, field }: EconomicsProps) {
  const idea = useQuery(ideaDetailQuery(ideaId));
  return (
    <QueryBoundary query={idea} skeleton={<EconomicsSkeleton />}>
      {(detail) =>
        detail.workspaceId !== workspaceId ? (
          <NoAccessState />
        ) : (
          <EconomicsLoader
            key={detail.validationId}
            workspaceId={workspaceId}
            ideaId={ideaId}
            validationId={detail.validationId}
            isArchived={detail.archived}
            field={field}
          />
        )
      }
    </QueryBoundary>
  );
}

interface LoaderProps extends EconomicsProps {
  validationId: string;
  isArchived: boolean;
}

function EconomicsLoader(props: LoaderProps) {
  const { validationId } = props;
  const economics = useQuery(economicsQuery(validationId));
  usePanelTarget(formatContainerTarget("validation", validationId, "economics"));

  // Saves still on their way when the screen closes must reach every screen that shows them, the home included.
  useValidationRefresh(validationId);

  return (
    <QueryBoundary query={economics} skeleton={<EconomicsSkeleton />}>
      {(data) => <EconomicsWorksheet {...props} data={data} />}
    </QueryBoundary>
  );
}

const PRICING_FIELDS = ECONOMICS_FIELDS.slice(0, 3);
const SALES_FIELDS = ECONOMICS_FIELDS.slice(3);

function EconomicsWorksheet({
  workspaceId,
  ideaId,
  validationId,
  isArchived,
  field,
  data,
}: LoaderProps & { data: EconomicsData }) {
  const { t } = useTranslation(["economics", "validation", "common", "form"]);
  const role = useWorkspaceRole(workspaceId);
  const canEdit = canEditIdeas(role) && !isArchived;
  const currency = useWorkspaceCurrency(workspaceId);
  const costsPath = `/w/${workspaceId}/ideas/${ideaId}/costs`;

  // The inputs as typed since the page loaded; every card reports each valid keystroke here.
  const [values, setValues] = useState<EconomicsInputValues>(() => economicsValues(data.inputs));
  const onValue = (changed: EconomicsField, value: number | null) =>
    setValues((prev) => ({ ...prev, [VALUE_KEY[changed]]: value }));

  // The cost rows are the server's: 18 shows them and links to 17 (design-spec 6.4 "入力").
  const rows = useMemo(
    () => data.costItems.map((item) => costRowInput(item, draftOfItem(item))),
    [data.costItems],
  );
  const result = useMemo(() => computeEconomics(rows, values), [rows, values]);

  const [focusField, setFocusField] = useState<EconomicsField | null>(() => field ?? null);
  useEffect(() => {
    if (focusField && focusKeyedField(focusField)) setFocusField(null);
  }, [focusField]);

  const inputOf = (name: EconomicsField) => data.inputs.find((i) => i.fieldKey === name);
  const card = (name: EconomicsField) => {
    const input = inputOf(name);
    return input ? (
      <EconomicsInputCard
        key={name}
        validationId={validationId}
        field={name}
        input={input}
        isReadOnly={!canEdit}
        currency={currency}
        onValue={onValue}
      />
    ) : null;
  };

  const startup = totalView(t, result.totals.initial, currency).value;
  const monthly = totalView(t, result.totals.monthlyFixed, currency).value;

  return (
    <WorksheetPattern
      header={
        <ValidationSectionHeader
          workspaceId={workspaceId}
          ideaId={ideaId}
          sectionKey="06-08"
          backLabel={t("economics:back")}
          isArchived={isArchived}
        />
      }
      input={
        <Stack gap="space-300">
          <Heading level={2}>{t("economics:inputs")}</Heading>
          {PRICING_FIELDS.map(card)}
          <Heading level={2}>{t("economics:dailySales")}</Heading>
          {SALES_FIELDS.map(card)}
          <Stack gap="space-100">
            <Text>{t("economics:costsSummary", { startup, monthly })}</Text>
            <Link href={costsPath}>{t("economics:costsLink")}</Link>
          </Stack>
          <WorthCard validationId={validationId} answer={data.worth} isReadOnly={!canEdit} />
        </Stack>
      }
      result={
        <EconomicsResults
          result={result}
          currency={currency}
          targetMargin={values.targetMargin ?? DEFAULT_TARGET_MARGIN}
        />
      }
      resultSummary={summaryBarText(t, result, currency)}
      resultLabel={t("economics:results.title")}
    />
  );
}
