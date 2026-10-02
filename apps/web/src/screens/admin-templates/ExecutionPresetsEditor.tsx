import { launchTimingSchema, type TemplateVersionDetail } from "@moonx/schemas";
import {
  Button,
  Flex,
  Heading,
  InlineAlert,
  Picker,
  PickerItem,
  Stack,
  Text,
  TextField,
} from "@moonx/ui-web";
import type { TFunction } from "i18next";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type TemplateExecutionPresetInput, useTemplateWrites } from "../../lib/admin-templates";
import { useRowList } from "../../lib/use-row-list";

type Row = {
  type: TemplateExecutionPresetInput["type"];
  title: string;
  area: string;
  launchTiming: TemplateExecutionPresetInput["launchTiming"];
};
const TYPES: readonly Row["type"][] = ["milestone", "launch", "kpi"];

const rowsValid = (rows: Row[]) => rows.every((row) => row.title.trim() !== "");

/**
 * The starting rows of a plan's execution management (design-spec 6.17 27): milestones, launch
 * checklist items with their timing, and KPIs. A new plan draft starts with these rows.
 */
export function ExecutionPresetsEditor({
  detail,
  readOnly,
}: {
  detail: TemplateVersionDetail;
  readOnly: boolean;
}) {
  const { t } = useTranslation("admin");
  const { executionPresets } = useTemplateWrites(detail.id);
  const list = useRowList<Row>(
    detail.executionPresets.map((preset) => ({
      type: preset.type,
      title: preset.title,
      area: preset.area ?? "",
      launchTiming: preset.launchTiming,
    })),
    rowsValid,
    (rows) =>
      executionPresets.mutateAsync(
        rows.map((row) => ({
          type: row.type,
          title: row.title.trim(),
          area: row.area.trim() === "" ? null : row.area.trim(),
          launchTiming: row.type === "launch" ? row.launchTiming : null,
        })),
      ),
  );

  return (
    <Stack gap="space-300">
      <Heading level={2}>{t("edit.execution.heading")}</Heading>
      <Text tone="secondary">{t("edit.execution.help")}</Text>
      {list.held ? <InlineAlert variant="notice" heading={t("edit.held")} /> : null}
      {list.rows.map((row, index) => (
        // Rows have no id of their own and are edited in place.
        // biome-ignore lint/suspicious/noArrayIndexKey: see above
        <Flex key={index} gap="space-100" align="end" wrap>
          <Picker
            label={t("edit.execution.type")}
            value={row.type}
            isDisabled={readOnly}
            onChange={(type) => {
              const next = TYPES.find((candidate) => candidate === type);
              if (next) {
                list.edit(index, {
                  type: next,
                  launchTiming: next === "launch" ? (row.launchTiming ?? "other") : null,
                });
              }
            }}
          >
            {TYPES.map((type) => (
              <PickerItem key={type} id={type}>
                {typeLabel(t, type)}
              </PickerItem>
            ))}
          </Picker>
          <TextField
            label={t("edit.execution.title")}
            value={row.title}
            maxLength={200}
            isReadOnly={readOnly}
            isInvalid={row.title.trim() === ""}
            errorMessage={row.title.trim() === "" ? t("edit.required") : undefined}
            onChange={(title) => list.edit(index, { title })}
            onBlur={list.flush}
          />
          <TextField
            label={t("edit.execution.area")}
            value={row.area}
            maxLength={100}
            isReadOnly={readOnly}
            onChange={(area) => list.edit(index, { area })}
            onBlur={list.flush}
          />
          {row.type === "launch" ? (
            <Picker
              label={t("edit.execution.timing")}
              value={row.launchTiming ?? "other"}
              isDisabled={readOnly}
              onChange={(value) => {
                const parsed = launchTimingSchema.safeParse(value);
                if (parsed.success) list.edit(index, { launchTiming: parsed.data });
              }}
            >
              {launchTimingSchema.options.map((timing) => (
                <PickerItem key={timing} id={timing}>
                  {timingLabel(t, timing)}
                </PickerItem>
              ))}
            </Picker>
          ) : null}
          {readOnly ? null : (
            <Flex gap="space-100">
              <Button
                variant="secondary"
                size="S"
                aria-label={t("edit.moveUp", { name: row.title })}
                isDisabled={index === 0}
                onPress={() => list.swap(index, index - 1)}
              >
                <ArrowUp aria-hidden />
              </Button>
              <Button
                variant="secondary"
                size="S"
                aria-label={t("edit.moveDown", { name: row.title })}
                isDisabled={index === list.rows.length - 1}
                onPress={() => list.swap(index, index + 1)}
              >
                <ArrowDown aria-hidden />
              </Button>
              <Button
                variant="secondary"
                size="S"
                aria-label={t("edit.remove", { name: row.title })}
                onPress={() => list.remove(index)}
              >
                <Trash2 aria-hidden />
              </Button>
            </Flex>
          )}
        </Flex>
      ))}
      {readOnly ? null : (
        <Flex>
          <Button
            variant="secondary"
            size="S"
            onPress={() => list.add({ type: "milestone", title: "", area: "", launchTiming: null })}
          >
            <Plus aria-hidden />
            {t("edit.execution.add")}
          </Button>
        </Flex>
      )}
    </Stack>
  );
}

function typeLabel(t: TFunction, type: Row["type"]) {
  switch (type) {
    case "milestone":
      return t("edit.execution.types.milestone");
    case "launch":
      return t("edit.execution.types.launch");
    case "kpi":
      return t("edit.execution.types.kpi");
  }
}

function timingLabel(t: TFunction, timing: (typeof launchTimingSchema.options)[number]) {
  switch (timing) {
    case "t_minus_30":
      return t("edit.execution.timings.t_minus_30");
    case "t_minus_7":
      return t("edit.execution.timings.t_minus_7");
    case "launch_day":
      return t("edit.execution.timings.launch_day");
    case "first_30":
      return t("edit.execution.timings.first_30");
    case "days_31_90":
      return t("edit.execution.timings.days_31_90");
    case "other":
      return t("edit.execution.timings.other");
  }
}
