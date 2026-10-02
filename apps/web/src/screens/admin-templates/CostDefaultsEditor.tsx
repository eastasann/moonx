import type { CostCategory, TemplateVersionDetail } from "@moonx/schemas";
import { Button, Flex, Heading, InlineAlert, Stack, Text, TextField } from "@moonx/ui-web";
import type { TFunction } from "i18next";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type TemplateCostDefaultInput, useTemplateWrites } from "../../lib/admin-templates";
import { COST_KEY_PATTERN } from "../../lib/template-edit";
import { useRowList } from "../../lib/use-row-list";

const CATEGORIES: readonly CostCategory[] = ["initial", "monthly_fixed", "variable"];

const rowsValid = (rows: TemplateCostDefaultInput[]) =>
  rows.every((row) => COST_KEY_PATTERN.test(row.key) && row.name.trim() !== "") &&
  new Set(rows.map((row) => row.key)).size === rows.length;

/**
 * The starting rows of the validation's cost tables (design-spec 6.17 27): a name and a key per
 * row, in the three tables. The key is what a plan item and a check refer to, so it is unique in
 * the version.
 */
export function CostDefaultsEditor({
  detail,
  readOnly,
}: {
  detail: TemplateVersionDetail;
  readOnly: boolean;
}) {
  const { t } = useTranslation("admin");
  const { costDefaults } = useTemplateWrites(detail.id);
  const list = useRowList<TemplateCostDefaultInput>(
    detail.costDefaults.map(({ category, key, name }) => ({ category, key, name })),
    rowsValid,
    (rows) => costDefaults.mutateAsync(rows),
  );
  const duplicated = (key: string) => list.rows.filter((row) => row.key === key).length > 1;

  return (
    <Stack gap="space-300">
      <Heading level={2}>{t("edit.cost.heading")}</Heading>
      <Text tone="secondary">{t("edit.cost.help")}</Text>
      {list.held ? <InlineAlert variant="notice" heading={t("edit.held")} /> : null}
      {CATEGORIES.map((category) => {
        const indexes = list.rows.flatMap((row, index) =>
          row.category === category ? [index] : [],
        );
        return (
          <Stack key={category} gap="space-200">
            <Heading level={3}>{categoryLabel(t, category)}</Heading>
            {indexes.map((index, position) => {
              const row = list.rows[index] as TemplateCostDefaultInput;
              const keyError = !COST_KEY_PATTERN.test(row.key)
                ? t("edit.cost.keyInvalid")
                : duplicated(row.key)
                  ? t("edit.cost.keyDuplicate")
                  : undefined;
              return (
                // Rows are identified by position: the key is itself editable.
                <Flex key={index} gap="space-100" align="end" wrap>
                  <TextField
                    label={t("edit.cost.name")}
                    value={row.name}
                    maxLength={200}
                    isReadOnly={readOnly}
                    isInvalid={row.name.trim() === ""}
                    errorMessage={row.name.trim() === "" ? t("edit.required") : undefined}
                    onChange={(name) => list.edit(index, { name })}
                    onBlur={list.flush}
                  />
                  <TextField
                    label={t("edit.cost.key")}
                    value={row.key}
                    isReadOnly={readOnly}
                    isInvalid={keyError !== undefined}
                    errorMessage={keyError}
                    onChange={(key) => list.edit(index, { key })}
                    onBlur={list.flush}
                  />
                  {readOnly ? null : (
                    <Flex gap="space-100">
                      <Button
                        variant="secondary"
                        size="S"
                        aria-label={t("edit.moveUp", { name: row.name || row.key })}
                        isDisabled={position === 0}
                        onPress={() => list.swap(index, indexes[position - 1] as number)}
                      >
                        <ArrowUp aria-hidden />
                      </Button>
                      <Button
                        variant="secondary"
                        size="S"
                        aria-label={t("edit.moveDown", { name: row.name || row.key })}
                        isDisabled={position === indexes.length - 1}
                        onPress={() => list.swap(index, indexes[position + 1] as number)}
                      >
                        <ArrowDown aria-hidden />
                      </Button>
                      <Button
                        variant="secondary"
                        size="S"
                        aria-label={t("edit.remove", { name: row.name || row.key })}
                        onPress={() => list.remove(index)}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </Flex>
                  )}
                </Flex>
              );
            })}
            {readOnly ? null : (
              <Flex>
                <Button
                  variant="secondary"
                  size="S"
                  onPress={() => list.add({ category, key: "", name: "" })}
                >
                  <Plus aria-hidden />
                  {t("edit.cost.add")}
                </Button>
              </Flex>
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}

function categoryLabel(t: TFunction, category: CostCategory) {
  switch (category) {
    case "initial":
      return t("edit.cost.categories.initial");
    case "monthly_fixed":
      return t("edit.cost.categories.monthly_fixed");
    case "variable":
      return t("edit.cost.categories.variable");
  }
}
