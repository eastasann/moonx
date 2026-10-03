import type { CardViewColumns } from "@moonx/ui-tokens";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/** Identity of a card, the `id` given to `Card`. */
export type CardKey = string | number;

export interface CardViewProps {
  /** Required: the name of the group of cards, e.g. "Competitors". */
  "aria-label": string;
  /**
   * Accepted for the same vocabulary as the Web part, which shows one to three columns. The phone
   * is always one column (design-spec 4.5), so the value is not read.
   */
  columns?: CardViewColumns;
  /**
   * `single` and `multiple` make a press select the card (toggling it) and `multiple` also draws
   * a check mark on every card. In `none` a press calls `onAction`.
   */
  selectionMode?: "none" | "single" | "multiple";
  selectedKeys?: Iterable<CardKey>;
  defaultSelectedKeys?: Iterable<CardKey>;
  onSelectionChange?: (keys: Set<CardKey>) => void;
  /** Cards that cannot be pressed or selected. */
  disabledKeys?: Iterable<CardKey>;
  /** Fires with the card's `id` when a card is pressed in `none` selection mode. */
  onAction?: (key: CardKey) => void;
  /**
   * `Card`s, each with an `id`. The Web part's dynamic `items` with a render function are not
   * supported: build the cards with `map`.
   */
  children: ReactNode;
}

interface CardViewState {
  selectionMode: "none" | "single" | "multiple";
  /** Whether a press does anything: selection is on, or the view has an `onAction`. */
  isActionable: boolean;
  isSelected: (key: CardKey) => boolean;
  isDisabled: (key: CardKey) => boolean;
  press: (key: CardKey) => void;
}

/** What `Card` reads from the surrounding `CardView`; null for a Card used on its own. */
export const CardViewContext = createContext<CardViewState | null>(null);

export function useCardView(): CardViewState | null {
  return useContext(CardViewContext);
}

/** A column of `Card`s with optional selection. Always one column on the phone. */
export function CardView({
  "aria-label": ariaLabel,
  selectionMode = "none",
  selectedKeys,
  defaultSelectedKeys,
  onSelectionChange,
  disabledKeys,
  onAction,
  children,
}: CardViewProps) {
  const [inner, setInner] = useState<Set<CardKey>>(() => new Set(defaultSelectedKeys));
  const controlled = selectedKeys !== undefined;
  const selected = useMemo(
    () => (controlled ? new Set(selectedKeys) : inner),
    [controlled, selectedKeys, inner],
  );
  const disabled = useMemo(() => new Set(disabledKeys), [disabledKeys]);

  const press = useCallback(
    (key: CardKey) => {
      if (disabled.has(key)) return;
      if (selectionMode === "none") {
        onAction?.(key);
        return;
      }
      const next = new Set(selectionMode === "single" ? [] : selected);
      if (!selected.has(key)) next.add(key);
      else if (selectionMode === "multiple") next.delete(key);
      if (!controlled) setInner(next);
      onSelectionChange?.(next);
    },
    [controlled, disabled, onAction, onSelectionChange, selected, selectionMode],
  );

  const state = useMemo<CardViewState>(
    () => ({
      selectionMode,
      isActionable: selectionMode !== "none" || onAction !== undefined,
      isSelected: (key) => selected.has(key),
      isDisabled: (key) => disabled.has(key),
      press,
    }),
    [selectionMode, onAction, selected, disabled, press],
  );

  return (
    <CardViewContext.Provider value={state}>
      <View role="list" aria-label={ariaLabel} style={styles.cardView}>
        {children}
      </View>
    </CardViewContext.Provider>
  );
}

const styles = StyleSheet.create((theme) => ({
  cardView: { gap: theme.space["300"] },
}));
