import { useCallback, useState } from "react";

/**
 * State that the caller may own (`value` given) or leave to the component (`value`
 * undefined, starting from `defaultValue`). Changes are reported either way.
 */
export function useControlledState<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (value: T) => void,
): [T, (value: T) => void] {
  const [own, setOwn] = useState(defaultValue);
  const isControlled = value !== undefined;
  const set = useCallback(
    (next: T) => {
      if (!isControlled) setOwn(next);
      onChange?.(next);
    },
    [isControlled, onChange],
  );
  return [isControlled ? value : own, set];
}
