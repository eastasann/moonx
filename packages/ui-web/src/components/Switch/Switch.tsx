import type { ComponentSize } from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import { useId } from "react";
import { Switch as AriaSwitch, type SwitchProps as AriaSwitchProps } from "react-aria-components";
import { ChoiceHelp, describedBy } from "../_internal/ChoiceHelp";
import { wrapper } from "../Checkbox/Checkbox.css";
import { handle, helpIndent, switchRow, track } from "./Switch.css";

export interface SwitchProps
  extends Omit<AriaSwitchProps, "className" | "style" | "children" | "aria-describedby"> {
  /** Required. Its text is the switch's accessible name. */
  children: ReactNode;
  description?: ReactNode;
  size?: ComponentSize;
}

/** A switch applies at once, so it has no required or invalid state. */
export function Switch({ children, description, size = "M", ...props }: SwitchProps) {
  const id = useId();
  const ids = { descriptionId: `${id}-description`, errorId: `${id}-error` };
  return (
    <div className={wrapper}>
      <AriaSwitch
        {...props}
        aria-describedby={describedBy({ ...ids, description })}
        className={switchRow({ size })}
      >
        <span className={track({ size })}>
          <span className={handle({ size })} />
        </span>
        {children}
      </AriaSwitch>
      <ChoiceHelp {...ids} description={description} indentClassName={helpIndent({ size })} />
    </div>
  );
}
