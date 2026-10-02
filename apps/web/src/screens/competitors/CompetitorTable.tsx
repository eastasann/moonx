import type { Competitor } from "@moonx/schemas";
import { Button, TableView, type TableViewColumn, type TableViewRow } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { fieldText } from "../../components/RowFields";
import { evidenceTagText } from "../../lib/evidence-tag";
import { draftOf, type FieldSpec } from "../../lib/row-fields";

/**
 * The comparison table of 15 (design-spec 6.10): a row per field, a column per competitor, so
 * two competitors can be read against each other. The last row opens a competitor.
 */
export function CompetitorTable({
  competitors,
  specs,
  currency,
  timeZone,
  canEdit,
  onOpen,
}: {
  competitors: readonly Competitor[];
  specs: readonly FieldSpec[];
  currency: string;
  timeZone: string;
  canEdit: boolean;
  onOpen: (competitorId: string) => void;
}) {
  const { t } = useTranslation(["research", "form"]);
  const none = t("research:none");
  const columns: TableViewColumn[] = [
    { id: "field", label: t("research:competitors.table.field"), isRowHeader: true },
    ...competitors.map((competitor) => ({ id: competitor.id, label: competitor.name })),
  ];
  const drafts = new Map(competitors.map((c) => [c.id, draftOf(specs, c)]));
  const rows: TableViewRow[] = [
    ...specs
      .filter((spec) => spec.key !== "name")
      .map((spec) => ({
        id: spec.key,
        textValue: spec.label,
        cells: {
          field: spec.label,
          ...Object.fromEntries(
            competitors.map((c) => [
              c.id,
              fieldText(spec, drafts.get(c.id)?.[spec.key] ?? null, currency, timeZone) ?? none,
            ]),
          ),
        },
      })),
    {
      id: "evidence",
      textValue: t("research:evidence.title"),
      cells: {
        field: t("research:evidence.title"),
        ...Object.fromEntries(
          competitors.map((c) => [
            c.id,
            c.evidence.length > 0
              ? c.evidence
                  .map((item) => evidenceTagText(item, t("form:evidence.deletedLog"), timeZone))
                  .join(", ")
              : none,
          ]),
        ),
      },
    },
    {
      id: "open",
      textValue: t("research:competitors.table.open"),
      cells: {
        field: t("research:competitors.table.open"),
        ...Object.fromEntries(
          competitors.map((c) => [
            c.id,
            <Button
              key={c.id}
              variant="secondary"
              size="S"
              aria-label={
                canEdit
                  ? t("research:competitors.table.edit", { name: c.name })
                  : t("research:competitors.table.view", { name: c.name })
              }
              onPress={() => onOpen(c.id)}
            >
              {canEdit
                ? t("research:competitors.table.editLabel")
                : t("research:competitors.table.viewLabel")}
            </Button>,
          ]),
        ),
      },
    },
  ];
  return (
    <TableView
      aria-label={t("research:competitors.tableLabel")}
      columns={columns}
      rows={rows}
      layout="table"
    />
  );
}
