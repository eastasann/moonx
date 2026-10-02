import { Button, Flex, Link, RowList, RowListItem, Stack, Text } from "@moonx/ui-web";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { linkTargetPath } from "../../lib/link-target";
import { excerpt, type ValidationHomeData } from "../../lib/validation-home";
import { BlockHeading } from "./BlockHeading";

export interface SummaryListRow {
  key: string;
  label: string;
  value: string | null;
  /** Beside "Empty": where or how to fill the row in. */
  fill?: ReactNode;
}

/** Labelled answers; an empty one says "Empty". Shared by the home and the decision screen. */
export function SummaryList({ label, rows }: { label: string; rows: readonly SummaryListRow[] }) {
  const { t } = useTranslation("validation");
  return (
    <RowList aria-label={label}>
      {rows.map((row) => (
        <RowListItem key={row.key}>
          <Stack gap="space-50">
            <Text variant="caption" tone="secondary">
              {row.label}
            </Text>
            {row.value ? (
              <Text variant="body-long">{excerpt(row.value)}</Text>
            ) : (
              <Flex gap="space-200" align="center" wrap>
                <Text tone="secondary" as="span">
                  {t("home.summary.empty")}
                </Text>
                {row.fill}
              </Flex>
            )}
          </Stack>
        </RowListItem>
      ))}
    </RowList>
  );
}

/**
 * Customer, Problem, Solution and Market type, collected from the sections (design-spec 6.1). An
 * empty one says "Empty" and links to where it is entered; the Solution is entered in the edit
 * sheet.
 */
export function Summary({
  data,
  workspaceId,
  canChange,
  onEdit,
}: {
  data: ValidationHomeData;
  workspaceId: string;
  canChange: boolean;
  onEdit: () => void;
}) {
  const { t } = useTranslation("validation");
  const ideaId = data.idea.id;
  const question = (sectionKey: string, questionKey: string) =>
    linkTargetPath({ screen: 11, workspaceId, ideaId, sectionKey, questionKey });
  const rows = [
    {
      key: "customer",
      label: t("home.summary.customer"),
      value: data.summary.customer,
      href: question("01", "V.01.WHO"),
    },
    {
      key: "problem",
      label: t("home.summary.problem"),
      value: data.summary.problem,
      href: question("01", "V.01.PROBLEM"),
    },
    {
      key: "solution",
      label: t("home.summary.solution"),
      value: data.summary.solution,
      href: null,
    },
    {
      key: "marketType",
      label: t("home.summary.marketType"),
      value: data.summary.marketType,
      href: question("02", "V.02.OCEAN"),
    },
  ];
  return (
    <Stack gap="space-100">
      <BlockHeading>{t("home.blocks.summary")}</BlockHeading>
      <SummaryList
        label={t("home.blocks.summary")}
        rows={rows.map((row) => ({
          key: row.key,
          label: row.label,
          value: row.value,
          fill: row.href ? (
            <Link href={row.href}>{t("home.summary.fill")}</Link>
          ) : canChange ? (
            <Button variant="secondary" size="S" onPress={onEdit}>
              {t("home.summary.fill")}
            </Button>
          ) : null,
        }))}
      />
    </Stack>
  );
}
