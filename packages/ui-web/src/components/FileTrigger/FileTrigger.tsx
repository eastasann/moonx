import type { ReactNode } from "react";
import { FileTrigger as AriaFileTrigger } from "react-aria-components";

export interface FileTriggerProps {
  /** MIME types or extensions the file picker offers, such as `["image/png", "image/jpeg"]`. */
  acceptedFileTypes?: readonly string[];
  onSelect: (files: File[]) => void;
  /** The `Button` or `ActionButton` that opens the picker. */
  children: ReactNode;
}

/** Opens the system file picker from the button it wraps. */
export function FileTrigger({ acceptedFileTypes, onSelect, children }: FileTriggerProps) {
  return (
    <AriaFileTrigger
      acceptedFileTypes={acceptedFileTypes ? [...acceptedFileTypes] : undefined}
      onSelect={(files) => onSelect(files ? Array.from(files) : [])}
    >
      {children}
    </AriaFileTrigger>
  );
}
