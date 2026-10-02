import { formatDate } from "@moonx/i18n";
import type { ExecutionStatus } from "@moonx/schemas";
import { Badge, Flex, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { assigneeText, EXECUTION_KEYS } from "../../lib/execution";
import type { ExecutionItem } from "../../lib/plans";

const STATUS_VARIANT = {
  todo: "neutral",
  doing: "informative",
  done: "positive",
  open: "informative",
  resolved: "positive",
} as const satisfies Record<ExecutionStatus, string>;

/** The status of an item as a badge, or nothing for a KPI row, which has none. */
export function StatusBadge({ status }: { status: ExecutionStatus | null }) {
  const { t } = useTranslation("execution");
  return status ? (
    <Badge size="S" variant={STATUS_VARIANT[status]}>
      {t(EXECUTION_KEYS.status[status])}
    </Badge>
  ) : null;
}

/** The label that marks an item whose deadline has passed (design-spec 6.13). */
export function OverdueBadge() {
  const { t } = useTranslation("execution");
  return (
    <Badge size="S" variant="negative">
      {t("execution:overdue")}
    </Badge>
  );
}

/**
 * What one row of the list shows: the name, then the columns a person scans for: who, when, and
 * for a KPI the target against the latest actual.
 */
export function ExecutionRowContent({ item, timeZone }: { item: ExecutionItem; timeZone: string }) {
  const { t } = useTranslation("execution");
  const who = assigneeText(t, item.assignee);
  return (
    <Flex direction="column" gap="space-50" grow>
      <Text variant="label" as="span">
        {item.title}
      </Text>
      <Flex gap="space-100" align="center" wrap>
        <Text variant="caption" tone="secondary" as="span">
          {who ? t("execution:row.assignee", { name: who }) : t("execution:unassigned")}
        </Text>
        {item.dueDate ? (
          <Text variant="caption" tone="secondary" as="span">
            {t("execution:row.due", { date: formatDate(item.dueDate, timeZone) })}
          </Text>
        ) : null}
        {item.type === "kpi" && item.kpiTarget ? (
          <Text variant="caption" tone="secondary" as="span">
            {t("execution:row.target", { value: item.kpiTarget })}
          </Text>
        ) : null}
        {item.type === "kpi" && item.kpiActual ? (
          <Text variant="caption" tone="secondary" as="span">
            {t("execution:row.actual", { value: item.kpiActual })}
          </Text>
        ) : null}
        <StatusBadge status={item.status} />
        {item.overdue ? <OverdueBadge /> : null}
      </Flex>
    </Flex>
  );
}
