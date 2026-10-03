import { useCallback, useMemo, useState } from "react";

/** Identity of a row or node, the `id` the screen gives it. */
export type Key = string | number;

/** The selected keys, or `"all"` when a select-all is active (same shape as React Aria's). */
export type Selection = "all" | Set<Key>;

export interface SelectionOptions {
  mode: "none" | "single" | "multiple";
  selectedKeys?: Selection;
  defaultSelectedKeys?: Selection;
  onSelectionChange?: (keys: Selection) => void;
  /** Keeps the last selected key selected in `single` and `multiple` mode. */
  disallowEmptySelection?: boolean;
  /** Every key that can be selected: lets a toggle off turn `"all"` into an explicit set. */
  allKeys: readonly Key[];
  disabledKeys?: Iterable<Key>;
}

export interface SelectionState {
  mode: SelectionOptions["mode"];
  selection: Selection;
  isSelected: (key: Key) => boolean;
  isDisabled: (key: Key) => boolean;
  /** Selects `key` in `single` mode and toggles it in `multiple` mode. */
  toggle: (key: Key) => void;
  /** Selects every enabled key, or clears the selection when all of them are selected already. */
  toggleAll: () => void;
  isAllSelected: boolean;
  isSomeSelected: boolean;
}

/**
 * The selection model of ListView, TableView and Tree: `selectedKeys` / `defaultSelectedKeys` /
 * `onSelectionChange` as on the Web, with the part owning the state unless the screen passes
 * `selectedKeys`.
 */
export function useSelection({
  mode,
  selectedKeys,
  defaultSelectedKeys,
  onSelectionChange,
  disallowEmptySelection = false,
  allKeys,
  disabledKeys,
}: SelectionOptions): SelectionState {
  const [inner, setInner] = useState<Selection>(() => defaultSelectedKeys ?? new Set());
  const controlled = selectedKeys !== undefined;
  const selection = controlled ? selectedKeys : inner;
  const disabled = useMemo(() => new Set(disabledKeys), [disabledKeys]);

  const commit = useCallback(
    (next: Selection) => {
      if (!controlled) setInner(next);
      onSelectionChange?.(next);
    },
    [controlled, onSelectionChange],
  );

  const isSelected = useCallback(
    (key: Key) =>
      mode !== "none" && (selection === "all" ? !disabled.has(key) : selection.has(key)),
    [mode, selection, disabled],
  );

  const enabledKeys = useMemo(
    () => allKeys.filter((key) => !disabled.has(key)),
    [allKeys, disabled],
  );

  const toggle = useCallback(
    (key: Key) => {
      if (mode === "none" || disabled.has(key)) return;
      if (mode === "single") {
        const already = selection !== "all" && selection.has(key);
        if (already && disallowEmptySelection) return;
        commit(already ? new Set() : new Set([key]));
        return;
      }
      const current = selection === "all" ? new Set<Key>(enabledKeys) : new Set(selection);
      if (current.has(key)) {
        if (disallowEmptySelection && current.size === 1) return;
        current.delete(key);
      } else {
        current.add(key);
      }
      commit(current);
    },
    [mode, disabled, selection, disallowEmptySelection, enabledKeys, commit],
  );

  const selectedCount = selection === "all" ? enabledKeys.length : selection.size;
  const isAllSelected =
    selection === "all" || (enabledKeys.length > 0 && enabledKeys.every((k) => selection.has(k)));

  const toggleAll = useCallback(() => {
    if (mode !== "multiple") return;
    if (isAllSelected) {
      if (!disallowEmptySelection) commit(new Set());
      return;
    }
    commit("all");
  }, [mode, isAllSelected, disallowEmptySelection, commit]);

  return {
    mode,
    selection,
    isSelected,
    isDisabled: (key) => disabled.has(key),
    toggle,
    toggleAll,
    isAllSelected,
    isSomeSelected: selectedCount > 0 && !isAllSelected,
  };
}
