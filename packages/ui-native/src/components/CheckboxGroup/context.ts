import { createContext } from "react";

/** What a `CheckboxGroup` tells the `Checkbox` items inside it. */
export interface CheckboxGroupState {
  selected: readonly string[];
  setSelected: (value: string, isSelected: boolean) => void;
  isDisabled: boolean;
  isReadOnly: boolean;
  isInvalid: boolean;
}

export const CheckboxGroupContext = createContext<CheckboxGroupState | null>(null);
