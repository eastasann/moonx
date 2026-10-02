import { SearchField } from "@moonx/ui-web";
import { useEffect, useState } from "react";

/** How long typing in the search box rests before the list is asked again. */
const SEARCH_DELAY_MS = 300;

/** A search box that reports the trimmed text once typing pauses. */
export function ListSearch({
  label,
  placeholder,
  clearLabel,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  clearLabel: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => {
    const next = text.trim();
    if (next === value) return;
    const timer = setTimeout(() => onChange(next), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, value, onChange]);
  return (
    <SearchField
      label={label}
      placeholder={placeholder}
      clearLabel={clearLabel}
      size="S"
      value={text}
      onChange={setText}
    />
  );
}
