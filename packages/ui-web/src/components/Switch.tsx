import type { Size } from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import {
  Switch as AriaSwitch,
  type SwitchProps as AriaSwitchProps,
} from "react-aria-components";
import { useSize } from "../internal/size";
import * as styles from "./choice.css";

export interface SwitchProps
  extends Pick<
    AriaSwitchProps,
    | "isSelected"
    | "defaultSelected"
    | "onChange"
    | "isDisabled"
    | "isReadOnly"
    | "name"
    | "value"
    | "autoFocus"
    | "id"
    | "aria-label"
    | "aria-describedby"
  > {
  /** @default "M", or "L" inside a spacious `Form` */
  size?: Size;
  /** The label beside the switch. */
  children?: ReactNode;
  /**
   * `start` puts the label before the switch: 11's header reads "Focus ●" (s11-form.html).
   * @default "end"
   */
  labelPosition?: "start" | "end";
}

/** An on / off setting that applies at once (11's Focus, 22's "Overdue only"). */
export function Switch({
  size,
  children,
  labelPosition = "end",
  ...props
}: SwitchProps) {
  const resolved = useSize(size);
  const label = children != null && (
    <span className={styles.rowLabel}>{children}</span>
  );
  return (
    <AriaSwitch {...props} className={styles.row({ size: resolved })}>
      {labelPosition === "start" && label}
      <span className={styles.track({ size: resolved })}>
        <span className={styles.handle({ size: resolved })} />
      </span>
      {labelPosition === "end" && label}
    </AriaSwitch>
  );
}
