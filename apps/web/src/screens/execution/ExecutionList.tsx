import { Heading, ListView, ListViewItem, Stack } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import type { ExecutionGroup } from "../../lib/execution";
import { ExecutionRowContent } from "./RowContent";

export interface ExecutionListProps {
  groups: readonly ExecutionGroup[];
  /** Names the list when it has no group headings. */
  label: string;
  selectedId?: string;
  onSelect: (id: string) => void;
  timeZone: string;
}

/**
 * The rows of one execution type. Launch rows and KPIs come in groups under their time bucket or
 * Area; the group's heading names its list for assistive technology.
 */
export function ExecutionList({
  groups,
  label,
  selectedId,
  onSelect,
  timeZone,
}: ExecutionListProps) {
  const { t } = useTranslation("execution");
  return (
    <Stack gap="space-300">
      {groups.map((group) => (
        <Stack key={group.key} gap="space-100">
          {group.label ? <Heading level={3}>{group.label}</Heading> : null}
          <ListView
            aria-label={group.label ? t("execution:groupLabel", { name: group.label }) : label}
            selectionMode="single"
            selectionBehavior="replace"
            selectedKeys={
              group.items.some((item) => item.id === selectedId) ? [selectedId ?? ""] : []
            }
            onSelectionChange={(keys) => {
              const [next] = keys === "all" ? [] : keys;
              if (next !== undefined) onSelect(String(next));
            }}
          >
            {group.items.map((item) => (
              <ListViewItem key={item.id} id={item.id} textValue={item.title}>
                <ExecutionRowContent item={item} timeZone={timeZone} />
              </ListViewItem>
            ))}
          </ListView>
        </Stack>
      ))}
    </Stack>
  );
}
