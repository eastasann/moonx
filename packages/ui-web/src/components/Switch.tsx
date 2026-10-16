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
}

/** An on / off setting that applies at once (11's Focus, 22's "Overdue only"). */
export function Switch({ size, children, ...props }: SwitchProps) {
  const resolved = useSize(size);
  return (
    <AriaSwitch {...props} className={styles.row({ size: resolved })}>
      <span className={styles.track({ size: resolved })}>
        <span className={styles.handle({ size: resolved })} />
      </span>
      {children != null && <span className={styles.rowLabel}>{children}</span>}
    </AriaSwitch>
  );
}
