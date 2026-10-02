import { parseDate } from "@internationalized/date";
import { Button, DatePicker, Flex, Picker, PickerItem } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { DECISION_KINDS, type DecisionLogFilters } from "../../lib/decision-log";

const ALL = "all";

/**
 * The filters of 7 (design-spec 6.15): type, idea, who recorded it and a period. The choice goes
 * to the URL through `onChange`, which is the one source of the filters.
 */
export function DecisionFilterBar({
  filters,
  ideas,
  members,
  onChange,
}: {
  filters: DecisionLogFilters;
  ideas: { id: string; name: string }[];
  members: { id: string; name: string }[];
  onChange: (patch: Partial<DecisionLogFilters>) => void;
}) {
  const { t } = useTranslation("decisionLog");
  const isFiltered = Object.values(filters).some((value) => value !== undefined);
  return (
    <Flex gap="space-100" wrap align="end">
      <Picker
        label={t("filters.kind")}
        size="S"
        value={filters.kind ?? ALL}
        onChange={(value) => onChange({ kind: DECISION_KINDS.find((kind) => kind === value) })}
      >
        <PickerItem id={ALL}>{t("filters.allKinds")}</PickerItem>
        {DECISION_KINDS.map((kind) => (
          <PickerItem key={kind} id={kind}>
            {t(`kind.${kind}`)}
          </PickerItem>
        ))}
      </Picker>
      <Picker
        label={t("filters.idea")}
        size="S"
        value={filters.idea ?? ALL}
        onChange={(value) => onChange({ idea: ideas.find((idea) => idea.id === value)?.id })}
      >
        <PickerItem id={ALL}>{t("filters.allIdeas")}</PickerItem>
        {ideas.map((idea) => (
          <PickerItem key={idea.id} id={idea.id}>
            {idea.name}
          </PickerItem>
        ))}
      </Picker>
      <Picker
        label={t("filters.recordedBy")}
        size="S"
        value={filters.recordedBy ?? ALL}
        onChange={(value) =>
          onChange({ recordedBy: members.find((member) => member.id === value)?.id })
        }
      >
        <PickerItem id={ALL}>{t("filters.anyone")}</PickerItem>
        {members.map((member) => (
          <PickerItem key={member.id} id={member.id}>
            {member.name}
          </PickerItem>
        ))}
      </Picker>
      {(["from", "to"] as const).map((bound) => (
        <DatePicker
          key={bound}
          label={t(`filters.${bound}`)}
          size="S"
          openLabel={t("filters.openCalendar")}
          previousMonthLabel={t("filters.previousMonth")}
          nextMonthLabel={t("filters.nextMonth")}
          value={filters[bound] ? parseDate(filters[bound]) : null}
          // The period cannot end before it starts.
          minValue={bound === "to" && filters.from ? parseDate(filters.from) : undefined}
          maxValue={bound === "from" && filters.to ? parseDate(filters.to) : undefined}
          onChange={(next) => onChange({ [bound]: next ? next.toString() : undefined })}
        />
      ))}
      {isFiltered ? (
        <Button
          variant="secondary"
          size="S"
          onPress={() =>
            onChange({
              kind: undefined,
              idea: undefined,
              recordedBy: undefined,
              from: undefined,
              to: undefined,
            })
          }
        >
          {t("filters.clear")}
        </Button>
      ) : null}
    </Flex>
  );
}
