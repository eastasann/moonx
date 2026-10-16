import type { ReactNode } from "react";
import {
  FileTrigger as AriaFileTrigger,
  type FileTriggerProps as AriaFileTriggerProps,
} from "react-aria-components";

export interface FileTriggerProps
  extends Pick<
    AriaFileTriggerProps,
    "acceptedFileTypes" | "allowsMultiple" | "onSelect" | "defaultCamera"
  > {
  /** The Button or ActionButton that opens the file chooser. */
  children: ReactNode;
}

/**
 * Opens the system file chooser from the button it wraps (4's photo, 25's `.md` /
 * `.json`). It has no look of its own; the button carries it.
 */
export function FileTrigger(props: FileTriggerProps) {
  return <AriaFileTrigger {...props} />;
}
