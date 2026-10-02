import type { ComponentSize, StatusLightVariant } from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import { dot, statusLight } from "./StatusLight.css";

export interface StatusLightProps {
  /** Status family, F/A/U state or check item state. Color alone never carries the meaning. */
  variant: StatusLightVariant;
  size?: ComponentSize;
  /** The label; required because the dot is hidden from assistive technology. */
  children: ReactNode;
}

export function StatusLight({ variant, size = "M", children }: StatusLightProps) {
  return (
    <span className={statusLight({ size })}>
      <span aria-hidden="true" className={dot({ variant, size })} />
      {children}
    </span>
  );
}
