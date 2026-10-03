import { useCallback, useState } from "react";

/**
 * `value` / `defaultValue` / `onChange` for one piece of state, the way React Aria components
 * take them: the part owns the state unless the screen passes `value`.
 */
export function useControlledState<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (next: T) => void,
): [T, (next: T) => void] {
  const [inner, setInner] = useState(defaultValue);
  const controlled = value !== undefined;
  const set = useCallback(
    (next: T) => {
      if (!controlled) setInner(next);
      onChange?.(next);
    },
    [controlled, onChange],
  );
  return [controlled ? value : inner, set];
}
