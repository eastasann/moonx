import { ActionButton, Button, Flex, Stack, Text } from "@moonx/ui-web";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";

/**
 * A list 27 edits row by row (design-spec 6.17「型ごとの設定」): each row's fields, then
 * its Move up, Move down and Remove buttons; "Add …" at the end. A moved row keeps the
 * keyboard on its button, the other one at the end of the list (6.10's Reorder does the
 * same); a removed row hands it to the row now in its place, else to Add; a new row
 * takes it in its first field.
 */
export function EditableList<T>({
  label,
  rows,
  rowLabel,
  renderRow,
  onMove,
  onRemove,
  onAdd,
  addLabel,
  isReadOnly = false,
  emptyText,
  hasLabels = false,
  errorMessage,
}: {
  /** The list's name over it: "Choices". */
  label: string;
  rows: readonly T[];
  /** What a row's buttons call it: "Move Red up". */
  rowLabel: (row: T, index: number) => string;
  /**
   * The row's fields, side by side: one with `width="fill"` takes the rest of the line.
   */
  renderRow: (row: T, index: number) => ReactNode;
  onMove: (index: number, step: -1 | 1) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  addLabel: string;
  isReadOnly?: boolean;
  /** Shown while the list has no row. */
  emptyText?: string;
  /**
   * The rows' fields show their labels (a column's key, name and type): the buttons line
   * up with the fields' frames under them. Otherwise one field per row, named for
   * screen readers only.
   */
  hasLabels?: boolean;
  /** Why the list as a whole was refused (the API named it, SDD 8.2), under it. */
  errorMessage?: string;
}) {
  const { t } = useTranslation(["admin"]);
  const prefix = useId();
  const labelId = `${prefix}-label`;
  const addId = `${prefix}-add`;
  const buttonId = (index: number, what: "up" | "down" | "remove") =>
    `${prefix}-${index}-${what}`;
  const focusLater = (id: string) =>
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  const move = (index: number, step: -1 | 1) => {
    onMove(index, step);
    const to = index + step;
    const atEnd = to === 0 || to === rows.length - 1;
    const towards = step === -1 ? "up" : "down";
    focusLater(
      buttonId(
        to,
        atEnd && (to === 0 ? step === -1 : step === 1)
          ? towards === "up"
            ? "down"
            : "up"
          : towards,
      ),
    );
  };
  const rowId = (index: number) => `${prefix}-${index}-row`;
  // A new row is the last: its first field takes the keyboard, where its reasons wait.
  const add = () => {
    const index = rows.length;
    onAdd();
    requestAnimationFrame(() =>
      document
        .getElementById(rowId(index))
        ?.querySelector<HTMLElement>("input, textarea, button")
        ?.focus(),
    );
  };
  const remove = (index: number) => {
    onRemove(index);
    const next = index < rows.length - 1 ? index : index - 1;
    focusLater(next >= 0 ? buttonId(next, "remove") : addId);
  };
  return (
    <Stack gap="space-100" role="group" aria-labelledby={labelId}>
      <Text variant="label" id={labelId}>
        {label}
      </Text>
      {rows.length === 0 && emptyText !== undefined && (
        <Text tone="tertiary">{emptyText}</Text>
      )}
      {rows.map((row, index) => (
        <Flex
          // biome-ignore lint/suspicious/noArrayIndexKey: the rows (a choice, a column) have no ids, and may repeat while typed; their place names them
          key={index}
          id={rowId(index)}
          gap="space-100"
          alignItems={hasLabels ? "end" : "start"}
          wrap
        >
          {renderRow(row, index)}
          <Flex gap="space-50">
            <ActionButton
              id={buttonId(index, "up")}
              isQuiet
              size="S"
              aria-label={t("admin:list.up", { item: rowLabel(row, index) })}
              isDisabled={isReadOnly || index === 0}
              onPress={() => move(index, -1)}
            >
              <ArrowUp />
            </ActionButton>
            <ActionButton
              id={buttonId(index, "down")}
              isQuiet
              size="S"
              aria-label={t("admin:list.down", { item: rowLabel(row, index) })}
              isDisabled={isReadOnly || index === rows.length - 1}
              onPress={() => move(index, 1)}
            >
              <ArrowDown />
            </ActionButton>
            <ActionButton
              id={buttonId(index, "remove")}
              isQuiet
              size="S"
              aria-label={t("admin:list.remove", {
                item: rowLabel(row, index),
              })}
              isDisabled={isReadOnly}
              onPress={() => remove(index)}
            >
              <X />
            </ActionButton>
          </Flex>
        </Flex>
      ))}
      <Flex>
        <Button
          id={addId}
          variant="secondary"
          isQuiet
          size="S"
          onPress={add}
          isDisabled={isReadOnly}
        >
          <Plus />
          {addLabel}
        </Button>
      </Flex>
      {errorMessage !== undefined && (
        <Text variant="caption" tone="negative">
          {errorMessage}
        </Text>
      )}
    </Stack>
  );
}

/** `rows` with the row at `index` moved one place by `step`. */
export function moved<T>(rows: readonly T[], index: number, step: -1 | 1): T[] {
  const to = index + step;
  const row = rows[index];
  const other = rows[to];
  if (row === undefined || other === undefined) return [...rows];
  const next = [...rows];
  next[to] = row;
  next[index] = other;
  return next;
}

/** `rows` without the row at `index`. */
export const without = <T,>(rows: readonly T[], index: number): T[] =>
  rows.filter((_, at) => at !== index);
