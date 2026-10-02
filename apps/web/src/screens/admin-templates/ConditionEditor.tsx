import {
  Button,
  Checkbox,
  CheckboxGroup,
  Flex,
  Picker,
  PickerItem,
  Stack,
  Text,
  TextField,
} from "@moonx/ui-web";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TemplateQuestionNode } from "../../lib/admin-templates";
import { useDebouncedPatch } from "../../lib/admin-templates";
import { type ConditionRow, conditionOf, conditionRows } from "../../lib/template-edit";

/**
 * "Shown when": the question appears only while the answers of the questions chosen here are one
 * of the listed values (design-spec 6.17 27, for example 02 OCEAN is Red or Mixed). A target with
 * choices offers them as checkboxes; any other target takes comma-separated values.
 */
export function ConditionEditor({
  question,
  others,
  readOnly,
  onSave,
}: {
  question: TemplateQuestionNode;
  others: TemplateQuestionNode[];
  readOnly: boolean;
  onSave: (condition: Record<string, string[]> | null) => Promise<unknown>;
}) {
  const { t } = useTranslation("admin");
  const [rows, setRows] = useState<ConditionRow[]>(conditionRows(question.displayCondition));
  const { schedule, flush } = useDebouncedPatch(({ next }: { next: ConditionRow[] }) =>
    onSave(conditionOf(next)),
  );

  const update = (next: ConditionRow[]) => {
    setRows(next);
    schedule({ next });
  };
  const edit = (index: number, patch: Partial<ConditionRow>) =>
    update(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const taken = new Set(rows.map((row) => row.questionKey));

  return (
    <Stack gap="space-200">
      <Text variant="body-sm" tone="secondary">
        {t("edit.condition.heading")}
      </Text>
      {rows.length === 0 ? <Text tone="secondary">{t("edit.condition.always")}</Text> : null}
      {rows.map((row, index) => {
        const target = others.find((candidate) => candidate.key === row.questionKey);
        const choices = target?.options?.kind === "choice" ? target.options.choices : null;
        return (
          // A condition row has no id before it names a question; rows are edited in place.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          <Flex key={index} gap="space-100" align="end" wrap>
            <Picker
              label={t("edit.condition.question")}
              value={row.questionKey || null}
              isDisabled={readOnly}
              onChange={(key) => edit(index, { questionKey: key ?? "", values: [] })}
            >
              {others
                .filter(
                  (candidate) => candidate.key === row.questionKey || !taken.has(candidate.key),
                )
                .map((candidate) => (
                  <PickerItem key={candidate.id} id={candidate.key}>
                    {t("edit.condition.option", { key: candidate.key, title: candidate.title })}
                  </PickerItem>
                ))}
            </Picker>
            {choices ? (
              <CheckboxGroup
                label={t("edit.condition.values")}
                value={row.values}
                isReadOnly={readOnly}
                onChange={(values) => edit(index, { values })}
              >
                {choices.map((choice) => (
                  <Checkbox key={choice} value={choice}>
                    {choice}
                  </Checkbox>
                ))}
              </CheckboxGroup>
            ) : (
              <TextField
                label={t("edit.condition.values")}
                description={t("edit.condition.valuesHelp")}
                value={row.values.join(", ")}
                isReadOnly={readOnly}
                onChange={(text) =>
                  edit(index, {
                    values: text
                      .split(",")
                      .map((value) => value.trim())
                      .filter((value) => value !== ""),
                  })
                }
                onBlur={flush}
              />
            )}
            {readOnly ? null : (
              <Button
                variant="secondary"
                size="S"
                aria-label={t("edit.condition.remove", { number: index + 1 })}
                onPress={() => {
                  update(rows.filter((_, i) => i !== index));
                  flush();
                }}
              >
                <Trash2 aria-hidden />
              </Button>
            )}
          </Flex>
        );
      })}
      {readOnly ? null : (
        <Flex>
          <Button
            variant="secondary"
            size="S"
            isDisabled={others.length === 0 || rows.some((row) => row.questionKey === "")}
            onPress={() => setRows([...rows, { questionKey: "", values: [] }])}
          >
            <Plus aria-hidden />
            {t("edit.condition.add")}
          </Button>
        </Flex>
      )}
    </Stack>
  );
}
